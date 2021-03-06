﻿/// <reference path="./claimingManager.ts" />
/// <reference path="./roomAssignment.ts" />
/// <reference path="./reactionManager.ts" />
/// <reference path="../components/rooms/mainRoom.ts" />
/// <reference path="../components/rooms/myRoom.ts" />
/// <reference path="../components/creeps/scout/scout.ts" />
/// <reference path="./military/armyManager.ts" />
/// <reference path="../helpers.ts" />



namespace Colony {

    export var profiler = require('screeps-profiler');

    export var myName;

    export var memory: ColonyMemory;

    export var mainRooms: {
        [roomName: string]: MainRoomInterface;
    } = {};

    var rooms: {
        [roomName: string]: MyRoomInterface;
    } = {};

    export var claimingManagers: {
        [roomName: string]: ClaimingManagerInterface;
    } = {};

    export var invasionManagers: {
        [roomName: string]: InvasionManagerInterface;
    } = {};

    export var reactionManager: ReactionManagerInterface = new ReactionManager();


    export function getRoom(roomName: string) {
        let room = rooms[roomName];
        if (room) {
            return room;
        }

        if (!Colony.memory.rooms[roomName] && !Game.rooms[roomName]) {
            return null;
        }
        else {
            let myRoom = new MyRoom(roomName);
            rooms[roomName] = myRoom;
            if (myRoom.memory.mrd == null)
                calculateDistances(myRoom);

            return rooms[roomName];
        }
    }

    var _creepsByMainRoomName: { time: number, creeps: { [roomName: string]: Creep[] } };
    export function getCreeps(mainRoomName: string) {
        if (_creepsByMainRoomName == null || _creepsByMainRoomName.time < Game.time)
            _creepsByMainRoomName = { time: Game.time, creeps: _.groupBy(_.filter(Game.creeps, c => !c.memory.handledByColony), c => c.memory.mainRoomName) };
        if (_creepsByMainRoomName.creeps[mainRoomName])
            return _creepsByMainRoomName.creeps[mainRoomName];
        else
            return [];
    }

    var allRoomsLoaded = false;
    export function getAllRooms() {
        if (!allRoomsLoaded) {

            _.forEach(memory.rooms, room => getRoom(room.name));

            allRoomsLoaded = true;
        }

        return rooms;

    }

    var forbidden: Array<string> = [];

    var tickCount = 0;

    export function getCreepAvoidanceMatrix(roomName: string) {
        let room = getRoom(roomName);
        if (room) {
            return room.creepAvoidanceMatrix;
        }
    }

    export function getTravelMatrix(roomName: string) {
        let room = getRoom(roomName);
        if (room) {
            return room.getCustomMatrix();
        }
        else return new PathFinder.CostMatrix();
    }

    export function getCustomMatrix(opts?: CostMatrixOpts) {
        return function (roomName: string) {
            let room = getRoom(roomName);
            if (room) {
                let matrix = room.getCustomMatrix(opts);
                if (room.name == 'E14S23')
                    console.log('Room E14S23 matrix: ' + matrix);
                return matrix;
            }
            else return new PathFinder.CostMatrix();
        };
    }

    export function assignMainRoom(room: MyRoomInterface): MainRoomInterface {
        calculateDistances(room);
        return room.mainRoom;
    }

    function shouldSendScout(roomName): boolean {
        var myRoom = getRoom(roomName);
        var result = (myRoom==null 
            || (!myRoom.mainRoom && !myRoom.memory.fO && !myRoom.memory.fR && (!myRoom.memory.lst || myRoom.memory.lst + 500 < Game.time))
            || (!Game.map.isRoomProtected(roomName)
                || !_.any(forbidden, x => x == roomName))
                && ((myRoom == null || !myRoom.requiresDefense && !myRoom.memory.fO && !myRoom.memory.fR)
                || (Game.time % 2000) == 0));

        return result;
    }


    export function spawnCreep(requestRoom: MyRoomInterface, body: BodyInterface, memory, count = 1) {
        if (count <= 0)
            return true;
        console.log('Colony.spawnCreep costs: ' + body.costs);
        console.log('Body: ' + body.getBody().join(', '));
        console.log('MainRoom: ' + memory.mainRoomName);
        console.log('Role: ' + memory.role);
        console.log('SourceId: ' + memory.sourceId);
        console.log('Count: ' + count);
        let mainRoom = _.sortBy(_.filter(_.filter(mainRooms, mainRoom => !mainRoom.spawnManager.isBusy), x => x.maxSpawnEnergy > body.costs), x => requestRoom.memory.mrd[x.name].d)[0];
        if (mainRoom) {
            mainRoom.spawnManager.addToQueue(body.getBody(), memory, count);
            console.log('Spawn request success: ' + mainRoom.name);
            return true;
        }
        else
            return false;
    }

    export function createScouts() {
        let scouts = _.filter(Game.creeps, (c) => (<ScoutMemory>c.memory).role == 'scout' && (<ScoutMemory>c.memory).handledByColony == true && (<ScoutMemory>c.memory).targetPosition != null);
        let roomNames = _.map(_.filter(memory.rooms, x => x.mrn != null && mainRooms[x.mrn] && !mainRooms[x.mrn].spawnManager.isBusy && !Game.map.isRoomProtected(x.name)), x => x.name);

        for (let roomName of roomNames) {
            let myRoom = Colony.getRoom(roomName);
            if (!myRoom || !myRoom.mainRoom)
                continue;
            if (Colony.memory.exits == null)
                Colony.memory.exits = {};

            if (!Colony.memory.exits[roomName]) {
                Colony.memory.exits[roomName] = {};

                for (let direction in Game.map.describeExits(roomName))
                    Colony.memory.exits[roomName][direction] = Game.map.describeExits(roomName)[direction];
            }

            for (let direction in Colony.memory.exits[roomName]) {
                let exit = Colony.memory.exits[roomName][direction];
                if (memory.rooms[exit] && memory.rooms[exit].mrn)
                    return;
                if (_.filter(scouts, (c) => (<ScoutMemory>c.memory).targetPosition.roomName == exit).length == 0 && shouldSendScout(exit)) {
                    myRoom.mainRoom.spawnManager.addToQueue(['move'], <ScoutMemory>{ handledByColony: true, role: 'scout', mainRoomName: null, targetPosition: { x: 25, y: 25, roomName: exit } });
                }
            }
        }
    }



    export function requestCreep() {

    }

    export function initialize(memory: ColonyMemory) {
        if (myMemory['profilerActive']) {
            Colony.createScouts = profiler.registerFN(Colony.createScouts, 'Colony.createScouts');
            Colony.getRoom = profiler.registerFN(Colony.getRoom, 'Colony.getRoom');
            Colony.requestCreep = profiler.registerFN(Colony.requestCreep, 'Colony.requestCreep');
            Colony.spawnCreep = profiler.registerFN(Colony.spawnCreep, 'Colony.spawnCreep');
            Colony.tick = profiler.registerFN(Colony.tick, 'Colony.tick');
            Colony.calculateDistances = profiler.registerFN(Colony.calculateDistances, 'Colony.calculateDistances');
            Colony.getRoom = profiler.registerFN(Colony.getRoom, 'Colony.getRoom');

            MyCostMatrix.compress = profiler.registerFN(MyCostMatrix.compress, 'MyCostMatrix.compress');
            MyCostMatrix.decompress = profiler.registerFN(MyCostMatrix.decompress, 'MyCostMatrix.decompress');
        }

        global.createRoomAssignments = function () { new RoomAssignmentHandler().createSolution() };
        global.applyRoomAssignments = function () { new RoomAssignmentHandler().applySolution() };

        _.forEach(myMemory.creeps, (c: SourceCarrierMemory) => {
            if (c.role == 'sourceCarrier') {
                let newC = <HarvestingCarrierMemory><any>c;
                newC.role = 'harvestingCarrier';
                newC.sId = c.sourceId;
            }

        });

        Colony.memory = myMemory['colony'];

        loadRooms();

        myName = _.map(Game.spawns, (s) => s)[0].owner.username;
        if (memory.rooms == null)
            memory.rooms = {};
        if (memory.mainRooms == null)
            memory.mainRooms = {};

        for (var spawnName in Game.spawns) {
            var spawn = Game.spawns[spawnName];
            break;
        }

        if (spawn != null) {
            var creeps = _.filter(Game.creeps, (c) => (<CreepMemory>c.memory).mainRoomName == null && !(<CreepMemory>c.memory).handledByColony);
            for (var idx in creeps)
                (<CreepMemory>creeps[idx].memory).mainRoomName = spawn.room.name;
        }

        if (!memory.mainRooms) memory.mainRooms = {};
        var mainRoomNames = _.uniq(_.map(_.filter(Game.spawns, s => s.my), (s) => s.room.name));
        for (var idx in mainRoomNames) {
            if (!claimingManagers[mainRoomNames[idx]]) {
                mainRooms[mainRoomNames[idx]] = new MainRoom(mainRoomNames[idx]);
            }
        }

        if (memory.claimingManagers != null) {
            for (var idx in memory.claimingManagers) {
                claimingManagers[memory.claimingManagers[idx].targetPosition.roomName] = new ClaimingManager(memory.claimingManagers[idx].targetPosition);
            }
        }


    }

    export function calculateDistances(myRoom?: MyRoomInterface) {
        if (myRoom == null) {
            if (Game.time % 10 == 0 && Game.cpu.bucket > 2000) {
                let roomNames = _.map(memory.rooms, x => x.name);


                let idx = ~~((Game.time % (roomNames.length * 10)) / 10);
                let myRoom = getRoom(roomNames[idx]);
                calculateDistances(myRoom);
            }
        }
        else {

            for (let mainIdx in mainRooms) {
                let mainRoom = mainRooms[mainIdx];
                let routeResult = Game.map.findRoute(myRoom.name, mainRoom.name, {
                    routeCallback: function (roomName, fromRoomName) {
                        let myRoom = getRoom(roomName);
                        if (myRoom == null)
                            return 2;
                        else if (myRoom.memory.fR)
                            return 2;
                        else if (myRoom.memory.fO)
                            return Infinity;
                        else
                            return 1;

                    }
                });
                if (routeResult === ERR_NO_PATH)
                    var distance = 9999;
                else
                    var distance = (<[{ exit: string, room: string }]>routeResult).length;
                if (myRoom.memory.mrd == null)
                    myRoom.memory.mrd = {};
                myRoom.memory.mrd[mainRoom.name] = { n: mainRoom.name, d: distance };
            }
            let mainRoomCandidates = _.sortBy(_.map(_.filter(myRoom.memory.mrd, (x) => x.d <= 1), function (y) { return { distance: y.d, mainRoom: mainRooms[y.n] }; }), z => [z.distance.toString(), (10 - z.mainRoom.room.controller.level).toString()].join('_'));
        }
    }

    function handleClaimingManagers() {

        let flags = _.filter(Game.flags, (x) => x.memory.claim == true && !mainRooms[x.pos.roomName])

        //console.log("Claiming Manager: Found " + flags.length + " flags");

        for (let idx in flags) {
            console.log('Claiming Manager: GCL: ' + Game.gcl.level);
            console.log('Claiming Manager: MainRooms: ' + _.size(mainRooms));
            console.log('Claiming Manager: ClaimingManagers: ' + _.size(claimingManagers));
            if (Game.gcl.level > _.size(mainRooms) + _.size(claimingManagers)) {
                claimingManagers[flags[idx].pos.roomName] = new ClaimingManager(flags[idx].pos);
            }
        }

        for (let idx in claimingManagers) {
            claimingManagers[idx].tick();
        }

    }



    export function loadRooms() {
        //_.forEach(memory.rooms, r => getRoom(r.name));
    }


    export function tick() {

        console.log('Colony loop start: ' + Game.cpu.getUsed().toFixed(2));
        console.log('Tick: ' + (++tickCount));

        Colony.memory = myMemory['colony'];

        Colony.memory.createPathTime = 0;
        Colony.memory.pathSliceTime = 0;

        if (memory.traceThreshold == null)
            memory.traceThreshold = 2;


        console.log('Colony calculate distances start: ' + Game.cpu.getUsed().toFixed(2));
        calculateDistances();


        handleClaimingManagers();

        console.log('Colony create scouts start: ' + Game.cpu.getUsed().toFixed(2));

        createScouts();

        console.log('Colony main rooms start: ' + Game.cpu.getUsed().toFixed(2));

        _.forEach(_.sortByOrder(_.values<MainRoomInterface>(mainRooms), [mainRoom => _.any(mainRoom.connectedRooms, myRoom => _.any(myRoom.mySources, s => s.hasKeeper)) ? 0 : 1, mainRoom => mainRoom.room.controller.level], ['asc', 'desc']), mainRoom => {
            //_.forEach(mainRooms, mainRoom=> {
            if (Game.cpu.bucket - Game.cpu.getUsed() > 500)
                mainRoom.tick();
        });


        let creeps = _.filter(Game.creeps, (c) => c.memory.handledByColony);


        for (let idx in creeps) {
            let creep = creeps[idx];

            if (creep.memory.role == 'scout')
                new Scout(creep.name).tick();
        }


        //if ((Game.time % 2000 == 0) && Game.cpu.bucket > 9000 || myMemory['forceReassignment'] == true || myMemory['forceReassignment'] == 'true') {
        //    new RoomAssignmentHandler().createSolution();

        //    myMemory['forceReassignment'] = false;
        //}

        let reserveFlags = _.filter(Game.flags, x => x.memory.reserve == true);

        reserveFlags.forEach((flag) => {
            let myRoom = Colony.getRoom(flag.pos.roomName);
            //console.log('Reserve flag found: ' + flag.name);
            if (myRoom != null && myRoom.mainRoom == null) {

                //console.log('Reserve flag MyRoom: ' + myRoom.name);

                let mainRoom = myRoom.closestMainRoom;

                if (mainRoom) {
                    //console.log('Reserve flag MainRoom: ' + mainRoom.name);
                    if (_.filter(Game.creeps, x => x.memory.role == 'reserver' && (<ReserverMemory>x.memory).targetRoomName == myRoom.name).length == 0) {
                        mainRoom.spawnManager.addToQueue(['claim', 'claim', 'move', 'move'], <ReserverMemory>{ role: 'reserver', targetRoomName: myRoom.name, mainRoomName: mainRoom.name });
                    }
                }
            }
        });

        let dismantleFlags = _.filter(Game.flags, x => x.memory.dismantle == true);
        dismantleFlags.forEach((flag) => {
            let myRoom = Colony.getRoom(flag.pos.roomName);
            //console.log('Dismantle flag found: ' + flag.name);
            if (myRoom != null) {

                //console.log('Dismantle flag MyRoom: ' + myRoom.name);

                let mainRoom = myRoom.closestMainRoom;

                if (mainRoom) {
                    //console.log('Dismantle flag MainRoom: ' + mainRoom.name);
                    if (_.filter(Game.creeps, x => x.memory.role == 'dismantler' && (<ReserverMemory>x.memory).targetRoomName == myRoom.name).length == 0) {
                        mainRoom.spawnManager.addToQueue([WORK, WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], { role: 'dismantler', targetRoomName: myRoom.name, mainRoomName: mainRoom.name });
                    }
                }

            }
            else if (!_.any(Game.creeps, c => c.memory.role == 'scout' && c.memory.targetPosition && c.memory.targetPosition.roomName == flag.pos.roomName)) {
                let mainRoom = _.min(mainRooms, mr => Game.map.getRoomLinearDistance(flag.pos.roomName, mr.name));
                mainRoom.spawnManager.addToQueue(['move'], <ScoutMemory>{ handledByColony: true, role: 'scout', mainRoomName: null, targetPosition: flag.pos });
            }
        });

        let dismantlers = _.filter(Game.creeps, x => x.memory.role == 'dismantler');
        dismantlers.forEach(creep => {
            if (creep.room.name != creep.memory.targetRoomName)
                creep.moveTo(new RoomPosition(25, 25, creep.memory.targetRoomName));
            else {
                let structure = creep.pos.findClosestByRange<Structure>(FIND_STRUCTURES, { filter: (x: Structure) => x.structureType != STRUCTURE_CONTAINER && x.structureType != STRUCTURE_CONTROLLER && x.structureType != STRUCTURE_KEEPER_LAIR && x.structureType != STRUCTURE_POWER_SPAWN && x.structureType != STRUCTURE_CONTAINER && x.structureType != STRUCTURE_ROAD });
                if (structure) {
                    if (!creep.pos.isNearTo(structure))
                        creep.moveTo(structure);
                    else
                        creep.dismantle(structure);
                }
                else {
                    let dismantleFlags = _.filter(Game.flags, x => x.memory.dismantle == true && x.pos.roomName == creep.memory.targetRoomName);
                    dismantleFlags.forEach(x => {
                        x.memory.dismantle = false;
                    });
                }
            }
        });
        try {
            //if (Game.cpu.bucket > 5000)
            reactionManager.tick();
        }
        catch (e) {
            console.log(e.stack);
        }

        console.log('Create Path time: ' + memory.createPathTime.toFixed(2) + ', PathSliceTime: ' + memory.pathSliceTime.toFixed(2));
    }

}