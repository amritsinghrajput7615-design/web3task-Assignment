import { Room } from '../classes/Room.js';
import { Server } from 'socket.io';

class RoomStore {
  io: Server | null = null;
  private rooms: Map<string, Room> = new Map();

  setIO(io: Server) {
    this.io = io;
  }

  createRoom(roomId: string, hostId: string, hostName: string, settings: any) {
    if (!this.io) throw new Error("IO not set");
    const room = new Room(roomId, hostId, hostName, settings, this.io);
    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId: string) {
    return this.rooms.get(roomId);
  }

  getRoomBySocketId(socketId: string) {
    for (const room of this.rooms.values()) {
      if (room.hasPlayer(socketId)) return room;
    }
    return null;
  }

  deleteRoom(roomId: string) {
    this.rooms.delete(roomId);
  }
}

export const roomStore = new RoomStore();