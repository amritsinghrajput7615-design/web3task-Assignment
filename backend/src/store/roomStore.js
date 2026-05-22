const { Room } = require('../classes/Room');

class RoomStore {
  constructor() {
    this.io = null;
    this.rooms = new Map();
  }

  setIO(io) {
    this.io = io;
  }

  createRoom(roomId, hostId, hostName, settings) {
    const room = new Room(roomId, hostId, hostName, settings, this.io);
    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId?.toUpperCase());
  }

  getRoomBySocketId(socketId) {
    for (const room of this.rooms.values()) {
      if (room.hasPlayer(socketId)) return room;
    }
    return null;
  }

  deleteRoom(roomId) {
    this.rooms.delete(roomId);
  }
}

const roomStore = new RoomStore();

module.exports = { roomStore };
