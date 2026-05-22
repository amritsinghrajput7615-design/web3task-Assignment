const { roomStore } = require('../store/roomStore');

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function registerRoomHandlers(io, socket) {
  socket.on('create_room', ({ hostName, settings }) => {
    const roomId = generateRoomId();
    const room = roomStore.createRoom(roomId, socket.id, hostName, settings);
    socket.join(room.roomId);

    socket.emit('room_created', {
      roomId: room.roomId,
      hostId: socket.id,
      settings: room.settings,
      players: room.getPublicPlayers(),
    });
  });

  socket.on('join_room', ({ roomId, playerName }) => {
    const room = roomStore.getRoom(roomId);
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

    const player = room.getPublicPlayers().find((p) => p.id === socket.id);

    room.broadcast('player_joined', {
      player,
      players: room.getPublicPlayers(),
    });

    socket.emit('room_joined', {
      roomId: room.roomId,
      hostId: room.hostId,
      settings: room.settings,
      players: room.getPublicPlayers(),
    });
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
      roomStore.deleteRoom(room.roomId);
      return;
    }

    if (room.game.currentDrawerId === socket.id && room.game.phase === 'drawing') {
      room.game.endRound(false);
    }

    room.broadcast('player_left', {
      playerId: socket.id,
      playerName: leavingPlayer?.name,
      players: room.getPublicPlayers(),
      hostId: room.hostId,
    });
  });
}

module.exports = { registerRoomHandlers };
