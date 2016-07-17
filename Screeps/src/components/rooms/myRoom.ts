﻿/// <reference path="../sources/mySource.ts" />
/// <reference path="../../tracer.ts" />
/// <reference path="../structures/myContainer.ts" />
/// <reference path="./hostileScan.ts" />

class MyRoom implements MyRoomInterface {

    public get memory(): MyRoomMemory {
        return this.accessMemory();
    }

    private accessMemory() {
        if (Colony.memory.rooms == null)
            Colony.memory.rooms = {};
        if (Colony.memory.rooms[this.name] == null)
            Colony.memory.rooms[this.name] = {
                name: this.name,
                containers: null,
                sources: null,
                hostileScan: null,
                foreignOwner: null,
                foreignReserver: null,
                lastScanTime: null,
                mainRoomDistanceDescriptions: null,
                mainRoomName: null,
                hasController: null,
                travelMatrix: null
            };
        return Colony.memory.rooms[this.name];
    }

    public static staticTracer: Tracer;
    public tracer: Tracer;


    public hostileScan: HostileScanInterface;


    private _room: { time: number, room: Room } = { time: -1, room: null };
    public get room(): Room {
        let trace = this.tracer.start('Property room');
        if (this._room.time < Game.time)
            this._room = {
                time: Game.time, room: Game.rooms[this.name]
            };
        trace.stop();
        return this._room.room;
    }

    public get hasController() {
        return this.memory.hasController;
    }

    private _myContainers: {
        time: number,
        myContainers: { [id: string]: MyContainerInterface; }
    } = { time: -101, myContainers: {} };

    public get myContainers(): { [id: string]: MyContainerInterface; } {
        let trace = this.tracer.start('Property myContainers');
        if (((this._myContainers.time + 100) < Game.time || this.memory.containers == null) && this.room) {
            let containers = _.map(this.room.find<Container>(FIND_STRUCTURES, { filter: (x: Structure) => x.structureType == STRUCTURE_CONTAINER }), x => new MyContainer(x.id, this));
            this._myContainers = {
                time: Game.time,
                myContainers: _.indexBy(containers, (x) => x.id)
            };
        }
        trace.stop();
        return this._myContainers.myContainers;
    }

    public get canHarvest() {
        let trace = this.tracer.start('Property canHarvest');
        let result = (this.mainRoom && this.name == this.mainRoom.name || !(this.memory.foreignOwner || this.memory.foreignReserver));
        trace.stop();
        return result;
    }

    private _mySources: { time: number, mySources: { [id: string]: MySourceInterface; } } = null;

    public get mySources(): { [id: string]: MySourceInterface; } {
        let trace = this.tracer.start('Property mySources');
        if (this._mySources == null) {
            if (this.memory.sources == null && this.room) {
                this._mySources = { time: Game.time, mySources: _.indexBy(_.map(this.room.find<Source>(FIND_SOURCES), x => new MySource(x.id, this)), (x) => x.id) };
            }
            else if (this.memory.sources != null) {
                this._mySources = { time: Game.time, mySources: _.indexBy(_.map(this.memory.sources, x => new MySource(x.id, this)), (x) => x.id) };
            }
        }
        trace.stop();
        if (this._mySources)
            return this._mySources.mySources;
        else return {};
    }

    public get useableSources() {
        let trace = this.tracer.start('Property useableSources');
        let result = _.filter(this.mySources, x => !x.hasKeeper);
        trace.stop();
        return result;
    }

    private _mainRoom: MainRoomInterface = null;
    public get mainRoom() {
        let trace = this.tracer.start('Property mainRoom');
        if (this._mainRoom == null)
            this._mainRoom = Colony.mainRooms[this.memory.mainRoomName];
        trace.stop();
        return this._mainRoom;
    }
    public set mainRoom(value: MainRoomInterface) {
        this._mainRoom = value;
        this.memory.mainRoomName = value == null ? null : value.name;
    }




    exitNames: Array<string>;
    private _exits: ExitDescription = null;
    public get exits(): ExitDescription {

        if (this._exits == null) {
            this._exits = {};
            let exits = Game.map.describeExits(this.name);
            if (exits != null)
                for (let exitDirection in exits)
                    this._exits[exitDirection] = exits[exitDirection];
        }
        return this._exits;
    }



    constructor(public name: string) {
        if (MyRoom.staticTracer == null) {
            MyRoom.staticTracer = new Tracer('MyRoom');
            Colony.tracers.push(MyRoom.staticTracer);
        }
        //this.tracer = new Tracer('MySource ' + id);
        this.tracer = MyRoom.staticTracer;
        this.memory.name = name;

        this.hostileScan = new HostileScan(this);

        if (this.room != null)
            this.refresh();
    }

    private _travelMatrix: { time: number, matrix: CostMatrix };
    public get travelMatrix() {
        if (this._travelMatrix == null || this._travelMatrix.time + 200 < Game.time && this.room) {
            if (this.memory.travelMatrix && (!this.room || this.memory.travelMatrix.time + 200 >= Game.time))
                this._travelMatrix = { time: this.memory.travelMatrix.time, matrix: PathFinder.CostMatrix.deserialize(this.memory.travelMatrix.matrix) };
            else if (this.room) {
                this._travelMatrix = { time: Game.time, matrix: this.createTravelMatrix() };
                this.memory.travelMatrix = { time: this._travelMatrix.time, matrix: this._travelMatrix.matrix.serialize() };
            }
            else
                return new PathFinder.CostMatrix();
        }
        return this._travelMatrix.matrix;
    }

    private createTravelMatrix(): CostMatrix {
        let costMatrix = new PathFinder.CostMatrix();

        _.forEach(this.room.find<ConstructionSite>(FIND_STRUCTURES, { filter: (s: ConstructionSite) => s.structureType == STRUCTURE_ROAD }), structure => {
            costMatrix.set(structure.pos.x, structure.pos.y, 1);
        });
        _.forEach(this.room.find<ConstructionSite>(FIND_CONSTRUCTION_SITES, { filter: (s: ConstructionSite) => s.structureType == STRUCTURE_ROAD }), structure => {
            costMatrix.set(structure.pos.x, structure.pos.y, 1);
        });


        let keeperPositions = _.map(this.room.find<KeeperLair>(FIND_HOSTILE_STRUCTURES, { filter: (s: OwnedStructure) => s.structureType == STRUCTURE_KEEPER_LAIR }), x => x.pos);
        let protectedPositions = keeperPositions.concat(_.map(_.flatten(_.map(keeperPositions, x => x.findInRange<Source | Mineral>(FIND_SOURCES, 4).concat(x.findInRange<Source | Mineral>(FIND_MINERALS, 4)))), x => x.pos));

        _.forEach(protectedPositions, pos => {
            for (let x = -4; x <= 4; x++) {
                for (let y = -4; y <= 4; y++) {
                    costMatrix.set(pos.x + x, pos.y + y, 255);
                }
            }
        });

        _.forEach(this.room.find<Structure>(FIND_STRUCTURES, {
            filter: (s: Structure) => (OBSTACLE_OBJECT_TYPES.indexOf(s.structureType) >= 0) || s.structureType == STRUCTURE_PORTAL || (s.structureType == STRUCTURE_RAMPART && (<StructureRampart>s).isPublic == false && (<StructureRampart>s).my == false)
        }), structure => {
            costMatrix.set(structure.pos.x, structure.pos.y, 255);
            for (let x = -1; x <= 1; x++) {
                for (let y = -1; y <= 1; y++) {
                    if (Game.map.getTerrainAt(structure.pos.x + x, structure.pos.y + y, this.name) != 'wall')
                    costMatrix.set(structure.pos.x + x, structure.pos.y + y, costMatrix.get(structure.pos.x + x, structure.pos.y + y) + 5);
                }
            }
        });

        _.forEach(this.room.find<ConstructionSite>(FIND_CONSTRUCTION_SITES, {
            filter: (s: ConstructionSite) => OBSTACLE_OBJECT_TYPES.indexOf(s.structureType) >= 0
        }), structure => {
            costMatrix.set(structure.pos.x, structure.pos.y, 255);
            for (let x = -1; x <= 1; x++) {
                for (let y = -1; y <= 1; y++) {
                    if (Game.map.getTerrainAt(structure.pos.x + x, structure.pos.y + y,this.name) != 'wall')
                        costMatrix.set(structure.pos.x + x, structure.pos.y + y, costMatrix.get(structure.pos.x + x, structure.pos.y + y) + 5);
                }
            }
        });

        _.forEach(this.room.find<Source>(FIND_SOURCES), structure => {
            for (let x = -2; x <= 2; x++) {
                for (let y = -2; y <= 2; y++) {
                    if (Game.map.getTerrainAt(structure.pos.x + x, structure.pos.y + y, this.name) != 'wall')
                    costMatrix.set(structure.pos.x + x, structure.pos.y + y, costMatrix.get(structure.pos.x + x, structure.pos.y + y) + 10);
                }
            }
        });

        _.forEach(this.room.find<Mineral>(FIND_MINERALS), structure => {
            for (let x = -2; x <= 2; x++) {
                for (let y = -2; y <= 2; y++) {
                    if (Game.map.getTerrainAt(structure.pos.x + x, structure.pos.y + y, this.name) != 'wall')
                    costMatrix.set(structure.pos.x + x, structure.pos.y + y, costMatrix.get(structure.pos.x + x, structure.pos.y + y) + 10);
                }
            }
        });

        return costMatrix;
    }

    public get requiresDefense() {
        return (this.mainRoom && _.size(this.hostileScan.creeps) > 0);
    }

    public get closestMainRoom() {
        let trace = this.tracer.start('Property closestMainRoom');
        if (this.memory.mainRoomDistanceDescriptions == null || _.size(this.memory.mainRoomDistanceDescriptions) == 0) {
            trace.stop();
            return null;
        }
        let result = Colony.mainRooms[_.min(this.memory.mainRoomDistanceDescriptions, x => x.distance).roomName];
        trace.stop();
        return result;
    }

    public refresh() {
        let room = this.room;



        if (room == null)
            return;

        this.memory.foreignOwner = room.controller != null && room.controller.owner != null && room.controller.owner.username != Colony.myName;
        this.memory.foreignReserver = room.controller != null && room.controller.reservation != null && room.controller.reservation.username != Colony.myName;

        this.memory.lastScanTime = Game.time;

        this.memory.hasController = this.room.controller != null;
    }
}