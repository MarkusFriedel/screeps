﻿class MyObserver implements MyObserverInterface {
    public get memory(): MyObserverMemory {
        return this.accessMemory();
    }

    accessMemory() {
        if (this.mainRoom.memory.myObserver == null)
            this.mainRoom.memory.myObserver = {
                scannedX: null,
                scannedY: null,
                scanTime: 0
            }
        return this.mainRoom.memory.myObserver;
    }

    constructor(public mainRoom: MainRoom) {

    }

    private _observer: { time: number, observer: Observer };
    private _observerId: { time: number, id: string };
    public get observer(): Observer {
        if (this._observer == null || this._observer.time < Game.time) {
            if (this._observerId == null || this._observerId.time + 100 < Game.time) {
                this._observerId = {
                    time: Game.time, id: _.map(this.mainRoom.room.find<Observer>(FIND_MY_STRUCTURES, {
                        filter: (s: Structure) => s.structureType == STRUCTURE_OBSERVER
                    }), x => x.id)[0]
                }
            }
            this._observer = {
                time: Game.time,
                observer: Game.getObjectById<Observer>(this._observerId.id)
            }
        }
        return this._observer.observer;

    }

    private _roomIndex: { x: number, y: number };
    public get roomIndex() {
        if (this._roomIndex == null) {
            let indexGroups = this.mainRoom.name.match(/([EW])(\d+)([SN])(\d+)/);
            this._roomIndex = {
                x: indexGroups[1] == 'E' ? Number(indexGroups[2]) : -(Number(indexGroups[2]) + 1),
                y: indexGroups[3] == 'S' ? Number(indexGroups[4]) : -(Number(indexGroups[4]) + 1),
            }
        }
        return this._roomIndex;
    }

    private getRoomName(x: number, y: number) {
        return (x < 0 ? 'W' + (-x - 1) : 'E' + x) + (y < 0 ? 'N' + (-y - 1) : 'S' + y);
    }

    public tick() {
        if (!this.observer)
            return;

        if (this.memory.scanTime == Game.time - 1) {
            let roomName = this.getRoomName(this.roomIndex.x + this.memory.scannedX, this.roomIndex.y + this.memory.scannedY);
            let myRoom = Colony.getRoom(roomName);
            if (myRoom.memory.lastScanTime + 100 < Game.time) {

                myRoom.refresh();

                //if (_.min(myRoom.memory.mainRoomDistanceDescriptions, x => x.distance).distance >= 4) {
                //    delete Colony.memory.rooms[roomName];
                //    delete Colony.rooms[roomName];
                //}
            }
        }

        if (Game.time % 1 == 0) {

            if (this.memory.scannedX == null || this.memory.scannedY == null) {
                this.memory.scannedX = -5;
                this.memory.scannedY = -5;
            }
            else {
                this.memory.scannedX++;
                if (this.memory.scannedX > 5) {
                    this.memory.scannedX = -5;
                    this.memory.scannedY++;
                    if (this.memory.scannedY > 5)
                        this.memory.scannedY = -5;
                }
            }

            this.memory.scanTime = Game.time;

            console.log('Scanning ' + this.getRoomName(this.roomIndex.x + this.memory.scannedX, this.roomIndex.y + this.memory.scannedY));

            this.observer.observeRoom(this.getRoomName(this.roomIndex.x + this.memory.scannedX, this.roomIndex.y + this.memory.scannedY));
        }
    }
}