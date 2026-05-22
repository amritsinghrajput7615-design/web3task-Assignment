const { Player } = require('./Player');
const { Game } = require('./Game');

class Room {
  constructor(roomId, hostId, hostName, settings, io) {
    this.roomId = roomId;
    this.hostId = hostId;
    this.settings = {
      maxPlayers: settings?.maxPlayers ?? 8,
      rounds: settings?.rounds ?? 3,
      drawTime: settings?.drawTime ?? 80,
      wordCount: settings?.wordCount ?? 3,
      hints: settings?.hints ?? 2,
      wordMode: settings?.wordMode ?? 'normal',
      isPrivate: settings?.isPrivate ?? false,
    };
    this.players = new Map();
    this.io = io;
    this.drawerIndex = 0;

    const host = new Player(hostId, hostName, hostId);
    this.players.set(hostId, host);

    this.game = new Game(this, io);
  }

  hasPlayer(socketId) {
    return this.players.has(socketId);
  }

  addPlayer(socketId, name) {
    if (this.players.size >= this.settings.maxPlayers) return false;
    const player = new Player(socketId, name, socketId);
    this.players.set(socketId, player);
    return true;
  }

  removePlayer(socketId) {
    const wasHost = this.hostId === socketId;
    this.players.delete(socketId);

    if (this.players.size === 0) return { empty: true };

    if (wasHost) {
      const next = this.getPlayerList()[0];
      this.hostId = next.id;
    }

    if (this.drawerIndex >= this.players.size) {
      this.drawerIndex = 0;
    }

    return { empty: false, newHostId: this.hostId };
  }

  getPlayerBySocketId(socketId) {
    return this.players.get(socketId);
  }

  getPlayerList() {
    return Array.from(this.players.values());
  }

  getPublicPlayers() {
    return this.getPlayerList().map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      isDrawer: p.isDrawer,
      hasGuessed: p.hasGuessed,
    }));
  }

  getNextDrawer() {
    const list = this.getPlayerList();
    if (list.length === 0) return null;

    list.forEach((p) => {
      p.isDrawer = false;
    });

    this.drawerIndex = this.drawerIndex % list.length;
    const drawer = list[this.drawerIndex];
    drawer.isDrawer = true;
    this.drawerIndex = (this.drawerIndex + 1) % list.length;
    return drawer;
  }

  broadcast(event, payload) {
    this.io.to(this.roomId).emit(event, payload);
  }
}

module.exports = { Room };
