﻿/// <reference path="./claimingManager.ts" />
/// <reference path="./invasionManager.ts" />
/// <reference path="./roomAssignment.ts" />
/// <reference path="./military/militaryManager.ts" />
/// <reference path="./reactionManager.ts" />
/// <reference path="../components/rooms/mainRoom.ts" />
/// <reference path="../components/rooms/myRoom.ts" />
/// <reference path="../components/creeps/scout/scout.ts" />

/// <reference path="../tracer.ts" />

namespace Colony {

    export var tracers: Array<Tracer> = [];

    export var myName;

    export var memory: ColonyMemory;

    export var mainRooms: {
        [roomName: string]: MainRoomInterface;
    } = {};

    export var rooms: {
        [roomName: string]: MyRoomInterface;
    } = {};

    export var claimingManagers: {
        [roomName: string]: ClaimingManagerInterface;
    } = {};

    export var invasionManagers: {
        [roomName: string]: InvasionManagerInterface;
    } = {};

    export var reactionManager: ReactionManagerInterface = new ReactionManager();

    export var militaryManager: MilitaryManagerInterface = new MilitaryManager();

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
            if (myRoom.memory.mainRoomDistanceDescriptions == null)
                calculateDistances(myRoom);

            return rooms[roomName];
        }
    }



    var forbidden: Array<string> = ['E15S25'];

    export function getTravelMatrix(roomName: string) {
        let room = getRoom(roomName);
        if (room) {
            return room.travelMatrix;
        }
    }

    export function assignMainRoom(room: MyRoomInterface): MainRoomInterface {
        calculateDistances(room);
        return room.mainRoom;
    }

    function shouldSendScout(roomName): boolean {
        var myRoom = getRoom(roomName);
        var result = (myRoom != null && myRoom.memory.lastScanTime + 1000 < Game.time) && (
            !Game.map.isRoomProtected(roomName) && (myRoom == null || !myRoom.mainRoom) && !(_.any(forbidden, x => x == roomName))
            && (myRoom == null || !myRoom.requiresDefense && !myRoom.memory.foreignOwner && !myRoom.memory.foreignReserver) || (Game.time % 2000) == 0);

        return result;
    }


    export function spawnCreep(requestRoom: MyRoomInterface, body: BodyInterface, memory, count = 1) {
        console.log('Colony.spawnCreep costs: ' + body.costs);
        let mainRoom = _.sortBy(_.filter(mainRooms, x => x.maxSpawnEnergy > body.costs), x => requestRoom.memory.mainRoomDistanceDescriptions[x.name].distance)[0];
        if (mainRoom) {
            mainRoom.spawnManager.addToQueue(body.getBody(), memory, count);
            return true;
        }
        else
            return false;
    }

    export function createScouts() {
        let scouts = _.filter(Game.creeps, (c) => (<ScoutMemory>c.memory).role == 'scout' && (<ScoutMemory>c.memory).handledByColony == true && (<ScoutMemory>c.memory).targetPosition != null);
        let myRooms = _.uniq(_.filter(rooms, x => x.mainRoom != null && !x.mainRoom.spawnManager.isBusy && !Game.map.isRoomProtected(x.name)));
        for (let idx in myRooms) {
            let myRoom = myRooms[idx];
            let exits = myRoom.exits;
            if (Memory['exits'] == null)
                Memory['exits'] = {};
            for (let exitDirection in exits) {
                Memory['exits'][myRoom.name] = exits;
                let targetRoomName = exits[exitDirection];
                if (_.filter(scouts, (c) => (<ScoutMemory>c.memory).targetPosition.roomName == targetRoomName).length == 0 && shouldSendScout(targetRoomName)) {
                    myRoom.mainRoom.spawnManager.addToQueue(['move'], <ScoutMemory>{ handledByColony: true, role: 'scout', mainRoomName: null, targetPosition: { x: 25, y: 25, roomName: targetRoomName } });
                }
            }
        }
    }



    export function requestCreep() {

    }

    export function initialize(memory: ColonyMemory) {
        Colony.memory = Memory['colony'];
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
        var mainRoomNames = _.uniq(_.map(Game.spawns, (s) => s.room.name));
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

        if (memory.invasionManagers != null) {
            for (var idx in memory.invasionManagers) {
                invasionManagers[memory.invasionManagers[idx].targetRoomName] = new InvasionManager(memory.invasionManagers[idx].targetRoomName);
            }
        }
    }

    function calculateDistances(myRoom: MyRoomInterface) {
        if (myRoom == null)
            return;
        for (let mainIdx in mainRooms) {
            let mainRoom = mainRooms[mainIdx];
            let routeResult = Game.map.findRoute(myRoom.name, mainRoom.name);
            if (routeResult === ERR_NO_PATH)
                var distance = 9999;
            else
                var distance = (<[{ exit: string, room: string }]>routeResult).length;
            if (myRoom.memory.mainRoomDistanceDescriptions == null)
                myRoom.memory.mainRoomDistanceDescriptions = {};
            myRoom.memory.mainRoomDistanceDescriptions[mainRoom.name] = { roomName: mainRoom.name, distance: distance };
        }
        let mainRoomCandidates = _.sortBy(_.map(_.filter(myRoom.memory.mainRoomDistanceDescriptions, (x) => x.distance <= 1), function (y) { return { distance: y.distance, mainRoom: mainRooms[y.roomName] }; }), z => [z.distance.toString(), (10 - z.mainRoom.room.controller.level).toString()].join('_'));
        //if (mainRoomCandidates.length > 0 && !myRoom.memory.foreignOwner && (mainRoomCandidates[0].distance <= 1 || mainRoomCandidates[0].mainRoom.room.controller.level >= 6)) {
        //    myRoom.mainRoom = mainRoomCandidates[0].mainRoom;
        //    myRoom.memory.mainRoomName = mainRoomCandidates[0].mainRoom.name;
        //}
        //else {
        //    myRoom.mainRoom = null;
        //}
    }

    function handleClaimingManagers() {
        if (Memory['trace'])
            var startCpu = Game.cpu.getUsed();

        let flags = _.filter(Game.flags, (x) => x.memory.claim == true && !mainRooms[x.pos.roomName])

        console.log("Claiming Manager: Found " + flags.length + " flags");

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



        if (Memory['trace']) {
            var endCpu = Game.cpu.getUsed();
            console.log('Colony: Handle ClaimingManagers ' + (endCpu - startCpu).toFixed(2));
        }
    }

    function handleInvasionManagers() {
        if (Memory['trace'])
            var startCpu = Game.cpu.getUsed();

        let flags = _.filter(Game.flags, (x) => x.memory.invasion == true && !invasionManagers[x.pos.roomName]);

        flags.forEach(x => { invasionManagers[x.pos.roomName] = new InvasionManager(x.pos.roomName) });

        _.values<InvasionManager>(invasionManagers).forEach(x => x.tick());


        let invasionsToDelete = _.filter(invasionManagers, x => !_.any(Game.flags, f => (f.memory.invasion == true || f.memory.invasion == 'true') && f.pos.roomName == x.roomName));

        if (Memory['trace']) {
            var endCpu = Game.cpu.getUsed();
            console.log('Colony: Handle InvasionManagers ' + (endCpu - startCpu).toFixed(2));
        }
    }

    export function tick() {
        Colony.memory = Memory['colony'];

        if (memory.traceThreshold == null)
            memory.traceThreshold = 2;

        var startCpu;
        var endCpu;

        if (Memory['verbose'])
            console.log('ColonyHandler.tick');

        if (Memory['trace'])
            startCpu = Game.cpu.getUsed();
        if (Game.time % 10 == 0 && Game.cpu.bucket > 2000) {
            let roomArray: Array<MyRoomInterface> = [];
            for (let x in rooms)
                roomArray.push(rooms[x]);

            let idx = ~~((Game.time % (roomArray.length * 10)) / 10);
            let myRoom = roomArray[idx];
            calculateDistances(myRoom);


        }

        if (Memory['trace']) {
            endCpu = Game.cpu.getUsed();
            if ((endCpu - startCpu) > Colony.memory.traceThreshold)
                console.log('Colony.Calculate distances to MainRooms: ' + (endCpu - startCpu).toFixed(2));
        }



        if (Memory['trace'])
            startCpu = Game.cpu.getUsed();
        for (let roomName in Game.rooms) {
            getRoom(roomName);
        }
        if (Memory['trace']) {
            endCpu = Game.cpu.getUsed();
            if ((endCpu - startCpu) > Colony.memory.traceThreshold)
                console.log('Colony: Query all rooms ' + (endCpu - startCpu).toFixed(2));
        }

        if (Memory['trace'])
            startCpu = Game.cpu.getUsed();
        try { militaryManager.tick() } catch (e) { console.log(e.stack) }

        if (Memory['trace']) {
            endCpu = Game.cpu.getUsed();
            if ((endCpu - startCpu) > Colony.memory.traceThreshold)
                console.log('Colony: MilitaryManager.tick() ' + (endCpu - startCpu).toFixed(2));
        }
        handleClaimingManagers();
        handleInvasionManagers();
        if (Game.time % 1 == 0) {
            if (Memory['trace'])
                startCpu = Game.cpu.getUsed();
            createScouts();
            if (Memory['trace']) {
                endCpu = Game.cpu.getUsed();
                if ((endCpu - startCpu) > Colony.memory.traceThreshold)
                    console.log('Colony: Create Scouts ' + (endCpu - startCpu).toFixed(2));
            }
        }
        for (let roomName in mainRooms) {
            if (Memory['trace'])
                startCpu = Game.cpu.getUsed();
            mainRooms[roomName].tick();
            if (Memory['trace']) {
                endCpu = Game.cpu.getUsed();
                if ((endCpu - startCpu) > Colony.memory.traceThreshold)
                    console.log('Colony: MainRoom [' + mainRooms[roomName].name + '.tick() ' + (endCpu - startCpu).toFixed(2));
            }
        }

        let creeps = _.filter(Game.creeps, (c) => c.memory.handledByColony);

        if (Memory['trace'])
            startCpu = Game.cpu.getUsed();
        for (let idx in creeps) {
            let creep = creeps[idx];

            if (creep.memory.role == 'scout')
                new Scout(creep).tick();
        }
        if (Memory['trace']) {
            endCpu = Game.cpu.getUsed();
            if ((endCpu - startCpu) > Colony.memory.traceThreshold)
                console.log('Colony: Handle scouts ' + (endCpu - startCpu).toFixed(2));
        }


        if ((Game.time % 2000 == 0) && Game.cpu.bucket > 9000 || Memory['forceReassignment'] == true || Memory['forceReassignment'] == 'true') {
            new RoomAssignmentHandler().assignRooms();

            Memory['forceReassignment'] = false;
        }

        let reserveFlags = _.filter(Game.flags, x => x.memory.reserve == true);

        reserveFlags.forEach((flag) => {
            let myRoom = Colony.getRoom(flag.pos.roomName);
            console.log('Reserve flag found: ' + flag.name);
            if (myRoom != null && myRoom.mainRoom == null) {

                console.log('Reserve flag MyRoom: ' + myRoom.name);

                let mainRoom = myRoom.closestMainRoom;

                if (mainRoom) {
                    console.log('Reserve flag MainRoom: ' + mainRoom.name);
                    if (_.filter(Game.creeps, x => x.memory.role == 'reserver' && (<ReserverMemory>x.memory).targetRoomName == myRoom.name).length == 0) {
                        mainRoom.spawnManager.addToQueue(['claim', 'claim', 'move', 'move'], <ReserverMemory>{ role: 'reserver', targetRoomName: myRoom.name, mainRoomName: mainRoom.name });
                    }
                }
            }
        });

        let dismantleFlags = _.filter(Game.flags, x => x.memory.dismantle == true);
        dismantleFlags.forEach((flag) => {
            let myRoom = Colony.getRoom(flag.pos.roomName);
            console.log('Dismantle flag found: ' + flag.name);
            if (myRoom != null) {

                console.log('Dismantle flag MyRoom: ' + myRoom.name);

                let mainRoom = myRoom.closestMainRoom;

                if (mainRoom) {
                    console.log('Dismantle flag MainRoom: ' + mainRoom.name);
                    if (_.filter(Game.creeps, x => x.memory.role == 'dismantler' && (<ReserverMemory>x.memory).targetRoomName == myRoom.name).length == 0) {
                        mainRoom.spawnManager.addToQueue(['work', 'move'], { role: 'dismantler', targetRoomName: myRoom.name, mainRoomName: mainRoom.name });
                    }
                }
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
            if (Game.cpu.bucket > 5000)
                reactionManager.tick();
        }
        catch (e) {
            console.log(e.stack);
        }
    }

}