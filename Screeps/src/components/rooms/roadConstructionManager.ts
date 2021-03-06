﻿/// <reference path="./manager.ts" />
class RoadConstructionManager  implements RoadConstructionManagerInterface {

    public get memory(): RoadConstructionManagerMemory {
        return this.accessMemory();
    }

    accessMemory() {
        if (this.mainRoom.memory.roadConstructionManager == null)
            this.mainRoom.memory.roadConstructionManager = {
                remainingPath: []
            }
        return this.mainRoom.memory.roadConstructionManager;
    }

  

    constructor(public mainRoom: MainRoom) {
        if (myMemory['profilerActive']) {
            this.tick = profiler.registerFN(this.tick, 'RoadConstructionManager.tick');
        }
    }

    buildExtensionRoads() {
        let extensions = this.mainRoom.room.find<Extension>(FIND_MY_STRUCTURES, {
            filter: (s: Structure) => s.structureType == STRUCTURE_EXTENSION
        });

        for (let idx in extensions) {
            let extension = extensions[idx];
            let roomName = this.mainRoom.name;
            new RoomPosition(extension.pos.x - 1, extension.pos.y, roomName).createConstructionSite(STRUCTURE_ROAD);
            new RoomPosition(extension.pos.x + 1, extension.pos.y, roomName).createConstructionSite(STRUCTURE_ROAD);
            new RoomPosition(extension.pos.x, extension.pos.y - 1, roomName).createConstructionSite(STRUCTURE_ROAD);
            new RoomPosition(extension.pos.x, extension.pos.y + 1, roomName).createConstructionSite(STRUCTURE_ROAD);
        }
    }

    constructRoad(path: RoomPosition[], startIdx = 0, endIdx = null) {
        if (endIdx == null)
            var end = path.length - 1;
        else
            end = endIdx;


        for (let pathIdx = startIdx; pathIdx <= end; pathIdx++) {
            let result = RoomPos.fromObj(path[pathIdx]).createConstructionSite(STRUCTURE_ROAD);
            if (result == ERR_FULL) {
                if (this.memory.remainingPath == null)
                    this.memory.remainingPath = path.slice(pathIdx);
                else
                    this.memory.remainingPath = this.memory.remainingPath.concat(path.slice(pathIdx));
                break;
            }
        }
    }

    buildHarvestPaths() {
        if (_.filter(Game.constructionSites, (x) => x.structureType == STRUCTURE_ROAD).length > 50)
            return;

        if (!this.mainRoom.mainContainer)
            return;

        let sources = _.filter(this.mainRoom.sources, (x) => (!x.hasKeeper || x.maxHarvestingSpots>1) && (x.roadBuiltToRoom != this.mainRoom.name || (Game.time % 500 == 0) && x.myRoom.canHarvest));
        for (let sourceIdx = 0; sourceIdx < sources.length; sourceIdx++) {
            if (_.size(Game.constructionSites) == 100)
                return;
            let mySource = sources[sourceIdx];
            _.forEach(this.mainRoom.allRooms, room => room.recreateCostMatrix());
            let path = PathFinder.search(this.mainRoom.mainContainer.pos, { pos: mySource.pos, range: 1 }, { plainCost: 2, swampCost: 3, roomCallback: Colony.getTravelMatrix, maxOps:10000 });
            this.constructRoad(path.path, 0);
            
            mySource.roadBuiltToRoom = this.mainRoom.name;
        }

        _.forEach(_.filter(this.mainRoom.minerals, m => m.hasExtractor && m.roadBuiltToRoom != this.mainRoom.name), myMineral => {
            if (_.size(Game.constructionSites) == 100)
                return;
            if (this.mainRoom.terminal) {
                _.forEach(this.mainRoom.allRooms, room => room.recreateCostMatrix());
                let path = PathFinder.search(this.mainRoom.terminal.pos, { pos: myMineral.pos, range: 1 }, { plainCost: 2, swampCost: 3, roomCallback: Colony.getTravelMatrix, maxOps: 10000 });
                this.constructRoad(path.path, 0);
                myMineral.roadBuiltToRoom = this.mainRoom.name;
            };
        });

        //if (this.mainRoom.terminal && this.mainRoom.extractorContainer) {
        //    let path = PathFinder.search(this.mainRoom.extractorContainer.pos, { pos: this.mainRoom.terminal.pos, range: 1 }, { plainCost: 2, swampCost: 3, roomCallback: Colony.getTravelMatrix });
        //    this.constructRoad(path.path, 0);
        //}
    }

    buildControllerRoad() {
        if (_.filter(Game.constructionSites, (x) => x.structureType == STRUCTURE_ROAD).length > 0)
            return;

        if (!this.mainRoom.mainContainer)
            return;

        let path = PathFinder.search(this.mainRoom.mainContainer.pos, { pos: this.mainRoom.room.controller.pos, range: 1 }, { plainCost: 2, swampCost: 3, roomCallback: Colony.getTravelMatrix });
        this.constructRoad(path.path, 0);
    }


    public tick() {
        try {
            //if (Game.cpu.bucket < 2000)
            //    return;
            
            if (this.memory.remainingPath && this.memory.remainingPath.length > 0) {

                let remainingPath = this.memory.remainingPath;
                this.memory.remainingPath = null;
                this.constructRoad(remainingPath);
                
            }
            else if (Game.time % 50 == 0 && !(Game.time % 100 == 0)) {
                //this.buildExtensionRoads();
            }
            else if (Game.time % 100 == 0 && !(Game.time % 200 == 0)) {
                this.buildHarvestPaths();
            }
            else if (Game.time % 200 == 0) {
                this.buildControllerRoad();
            }
        }
        catch (e) {
            console.log(e.stack);
        }
    }
}