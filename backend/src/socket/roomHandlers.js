const { roomStore } = require('../store/roomStore');

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

    if (room.game.phase !== 'lobby') {
      socket.emit('error', { message: 'Game already in progress' });
      return;
    }

    if (!room.addPlayer(socket.id, playerName)) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }

    socket.join(room.roomId);

    const payload = buildRoomPayload(room, socket, clientOrigin || '');

    room.broadcast('player_joined', {
      player: payload.player,
      players: payload.players,
      roomCode: payload.roomCode,
      inviteLink: payload.inviteLink,
    });

    socket.emit('room_joined', payload);
  });

  socket.on('start_game', () => {
    const room = roomStore.getRoomBySocketId(socket.id);
    if (!room || room.hostId !== socket.id) return;

    if (room.getPlayerList().length < 2) {
      socket.emit('error', { message: 'Need at least 2 players to start' });
      return;
    }

    room.game.startGame();
  });

  socket.on('disconnect', () => {
    const room = roomStore.getRoomBySocketId(socket.id);
    if (!room) return;

    const leavingPlayer = room.getPlayerBySocketId(socket.id);
    const result = room.removePlayer(socket.id);
    socket.leave(room.roomId);

    if (result.empty) {
      room.game.abandonHistory();
      roomStore.deleteRoom(room.roomId);
      return;
    }

    const wasDrawer = room.game.currentDrawerId === socket.id;
    const gamePhase = room.game.phase;

    room.broadcast('player_left', {
      playerId: socket.id,
      playerName: leavingPlayer?.name,
      players: room.getPublicPlayers(),
      hostId: room.hostId,
    });

    if (wasDrawer && (gamePhase === 'drawing' || gamePhase === 'word_select')) {
      setImmediate(() => {
        room.game.handleDrawerDisconnect();
      });
    }
  });
}

module.exports = { registerRoomHandlers };
