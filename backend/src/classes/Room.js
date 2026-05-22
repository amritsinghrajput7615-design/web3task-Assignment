import { Player } from './Player.js';
import { Game } from './Game.js';

export class Room {
  roomId: string;
  players: Map<string, Player>;
  hostId: string;
  settings: any;
  game: Game;
  io: any;

  constructor(roomId: string, hostId: string, hostName: string, settings: any, io: any) {
    this.roomId = roomId;
    this.hostId = hostId;
    this.settings = settings;
    this.players = new Map();
    this.io = io;

    const host = new Player(hostId, hostName, hostId);
    host.isDrawer = true;
    this.players.set(hostId, host);

    this.game = new Game(roomId, io, settings);
  }

  hasPlayer(socketId: string) {
    return this.players.has(socketId);
  }

  addPlayer(id: string, name: string, socketId: string) {
    if (this.players.size >= this.settings.maxPlayers) return false;
    const player = new Player(id, name, socketId);
    this.players.set(socketId, player);
    return true;
  }

  removePlayer(socketId: string) {
    this.players.delete(socketId);
  }

  getPlayerBySocketId(socketId: string) {
    return this.players.get(socketId);
  }

  getPublicPlayers() {
    return Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      isDrawer: p.isDrawer,
      hasGuessed: p.hasGuessed,
    }));
  }

  getPlayerList() {
    return Array.from(this.players.values());
  }
}