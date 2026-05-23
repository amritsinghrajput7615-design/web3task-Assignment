const { roomStore } = require('../store/roomStore');
const { removeMemberFromRoom } = require('./roomMembership');

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function buildRoomPayload(room, socket, clientOrigin) {
  const invite = room.getInvitePayload(clientOrigin);
  return {
    roomId: room.roomId,
    roomCode: invite.roomCode,
    inviteLink: invite.inviteLink,
    invitePath: invite.invitePath,
    hostId: room.hostId,
    settings: room.settings,
    players: room.getPublicPlayers(),
    player: room.getPublicPlayers().find((p) => p.id === socket.id),
  };
}

function buildReconnectPayload(room, socket, clientOrigin) {
  const base = buildRoomPayload(room, socket, clientOrigin);
  const inGame = room.game.phase !== 'lobby';
  return {
    ...base,
    reconnected: true,
    snapshot: inGame ? room.game.getReconnectSnapshot(socket.id) : null,
  };
}

function registerRoomHandlers(io, socket) {
  socket.on('create_room', ({ hostName, settings, clientOrigin }) => {
    const roomId = generateRoomId();
    const room = roomStore.createRoom(roomId, socket.id, hostName, settings);
    socket.join(room.roomId);

    socket.emit('room_created', buildRoomPayload(room, socket, clientOrigin || ''));
  });

  socket.on('join_room', ({ roomId, playerName, clientOrigin }) => {
    const code = roomId?.toUpperCase();
    const room = roomStore.getRoom(code);

    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (room.isBanned(playerName)) {
      socket.emit('error', { message: 'You are banned from this room' });
      return;
    }

    const existingReconnect = room.reconnectPlayerByName(socket.id, playerName);
    if (existingReconnect) {
      room.reclaimHost(socket.id, playerName);
      socket.join(room.roomId);

      const payload = buildReconnectPayload(room, socket, clientOrigin || '');
      socket.emit('room_joined', payload);

      if (existingReconnect.oldSocketId !== socket.id) {
        room.broadcast('player_reconnected', {
          oldPlayerId: existingReconnect.oldSocketId,
          players: room.getPublicPlayers(),
          hostId: room.hostId,
        });
      }
      return;
    }

    if (room.game.phase !== 'lobby') {
      socket.emit('error', { message: 'Game already in progress' });
      return;
    }

    const normalizedName = room.normalizePlayerName(playerName);
    for (const p of [...room.getPlayerList()]) {
      if (room.normalizePlayerName(p.name) === normalizedName && p.id !== socket.id) {
        removeMemberFromRoom(io, room, p.id, { reason: 'replaced' });
      }
    }

    if (!room.addPlayer(socket.id, playerName)) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }

    room.reclaimHost(socket.id, playerName);

    socket.join(room.roomId);

    const payload = buildRoomPayload(room, socket, clientOrigin || '');

    room.broadcast('player_joined', {
      player: payload.player,
      players: payload.players,
      hostId: room.hostId,
      roomCode: payload.roomCode,
      inviteLink: payload.inviteLink,
    });

    socket.emit('room_joined', payload);
  });

  socket.on('start_game', () => {
    const room = roomStore.getRoomBySocketId(socket.id);
    if (!room || !room.isHost(socket.id)) return;

    if (room.getPlayerList().length < 2) {
      socket.emit('error', { message: 'Need at least 2 players to start' });
      return;
    }

    room.game.startGame();
  });

  socket.on('leave_room', () => {
    const room = roomStore.getRoomBySocketId(socket.id);
    if (!room) return;
    removeMemberFromRoom(io, room, socket.id, { reason: 'left' });
  });

  socket.on('kick_player', ({ targetId }) => {
    const room = roomStore.getRoomBySocketId(socket.id);
    if (!room) {
      socket.emit('error', { message: 'You are not in a room' });
      return;
    }
    if (!room.isHost(socket.id)) {
      socket.emit('error', { message: 'Only the host can kick players' });
      return;
    }
    if (!targetId || targetId === socket.id) {
      socket.emit('error', { message: 'Cannot kick yourself' });
      return;
    }
    const target = room.getPlayerBySocketId(targetId);
    if (!target) {
      socket.emit('error', { message: 'Player not found in room' });
      return;
    }
    removeMemberFromRoom(io, room, target.id, { reason: 'kicked', byHost: true });
  });

  socket.on('ban_player', ({ targetId }) => {
    const room = roomStore.getRoomBySocketId(socket.id);
    if (!room) {
      socket.emit('error', { message: 'You are not in a room' });
      return;
    }
    if (!room.isHost(socket.id)) {
      socket.emit('error', { message: 'Only the host can ban players' });
      return;
    }
    if (!targetId || targetId === socket.id) {
      socket.emit('error', { message: 'Cannot ban yourself' });
      return;
    }
    const target = room.getPlayerBySocketId(targetId);
    if (!target) {
      socket.emit('error', { message: 'Player not found' });
      return;
    }
    room.banPlayerName(target.name);
    removeMemberFromRoom(io, room, targetId, { reason: 'banned', byHost: true });
  });

  socket.on('disconnect', () => {
    const room = roomStore.getRoomBySocketId(socket.id);
    if (!room) return;
    const socketId = socket.id;
    room.scheduleDisconnectRemoval(socketId, () => {
      const currentRoom = roomStore.getRoom(room.roomId);
      if (!currentRoom) return;
      if (!currentRoom.hasPlayer(socketId)) return;
      removeMemberFromRoom(io, currentRoom, socketId, { reason: 'disconnect' });
    });
  });
}

module.exports = { registerRoomHandlers };
