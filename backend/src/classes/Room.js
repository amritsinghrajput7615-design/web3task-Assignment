const { Player } = require('./Player');
const { Game } = require('./Game');
const { MessageHandler } = require('../handlers/MessageHandler');

class Room {
  constructor(roomId, hostId, hostName, settings, io) {
    this.roomId = roomId;
    this.hostId = hostId;
    this.hostName = hostName;
    this.originalHostName = hostName;
    this.invitePath = `?room=${roomId}`;
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
    this.bannedNames = new Set();
    this.chatHistory = [];
    this.disconnectTimers = new Map();
    this.io = io;
    this.drawerIndex = 0;

    const host = new Player(hostId, hostName, hostId);
    this.players.set(hostId, host);

    this.game = new Game(this, io);
    this.messageHandler = new MessageHandler(this);
  }

  getInvitePayload(clientOrigin = '') {
    const base = (clientOrigin || '').replace(/\/$/, '');
    const inviteLink = base ? `${base}${this.invitePath}` : this.invitePath;
    return {
      roomCode: this.roomId,
      inviteLink,
      invitePath: this.invitePath,
    };
  }

  hasPlayer(socketId) {
    return this.players.has(socketId);
  }

  isHost(socketId) {
    if (this.hostId === socketId) return true;
    const player = this.getPlayerBySocketId(socketId);
    if (!player) return false;
    return (
      this.normalizePlayerName(player.name) ===
      this.normalizePlayerName(this.originalHostName)
    );
  }

  /** Restore host role when the named host rejoins with a new socket (e.g. after refresh). */
  reclaimHost(socketId, playerName) {
    if (this.normalizePlayerName(playerName) === this.normalizePlayerName(this.originalHostName)) {
      this.hostId = socketId;
      this.hostName = playerName;
      return true;
    }
    return false;
  }

  normalizePlayerName(name) {
    return (name || '').trim().toLowerCase();
  }

  isBanned(playerName) {
    return this.bannedNames.has(this.normalizePlayerName(playerName));
  }

  banPlayerName(playerName) {
    const key = this.normalizePlayerName(playerName);
    if (key) this.bannedNames.add(key);
  }

  addPlayer(socketId, name) {
    if (this.isBanned(name)) return false;
    if (this.players.size >= this.settings.maxPlayers) return false;
    const player = new Player(socketId, name, socketId);
    this.players.set(socketId, player);
    return true;
  }

  findPlayerByName(playerName) {
    const key = this.normalizePlayerName(playerName);
    for (const [, player] of this.players) {
      if (this.normalizePlayerName(player.name) === key) return player;
    }
    return null;
  }

  cancelDisconnectRemoval(socketId) {
    const timer = this.disconnectTimers.get(socketId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(socketId);
    }
  }

  scheduleDisconnectRemoval(socketId, onRemove, delayMs = 20000) {
    this.cancelDisconnectRemoval(socketId);
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(socketId);
      onRemove();
    }, delayMs);
    this.disconnectTimers.set(socketId, timer);
  }

  /** Same nickname reconnected with a new socket (page refresh). */
  reconnectPlayerByName(newSocketId, playerName) {
    const existing = this.findPlayerByName(playerName);
    if (!existing) return null;

    const oldSocketId = existing.id;
    this.cancelDisconnectRemoval(oldSocketId);

    if (oldSocketId !== newSocketId) {
      this.players.delete(oldSocketId);
      existing.id = newSocketId;
      existing.socketId = newSocketId;
      this.players.set(newSocketId, existing);
      if (this.hostId === oldSocketId) this.hostId = newSocketId;
      if (this.game.currentDrawerId === oldSocketId) {
        this.game.currentDrawerId = newSocketId;
      }
    }

    return { player: existing, oldSocketId };
  }

  appendChatMessage(msg) {
    this.chatHistory.push(msg);
    if (this.chatHistory.length > 100) {
      this.chatHistory = this.chatHistory.slice(-100);
    }
  }

  removePlayer(socketId) {
    this.cancelDisconnectRemoval(socketId);
    const wasHost = this.hostId === socketId;
    this.players.delete(socketId);

    if (this.players.size === 0) return { empty: true };

    if (wasHost) {
      const next = this.getPlayerList()[0];
      this.hostId = next.id;
      this.hostName = next.name;
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
