const { roomStore } = require('../store/roomStore');

/**
 * Remove a socket from a room and notify clients.
 * @returns {boolean} true if the player was removed (room may still exist)
 */
function removeMemberFromRoom(io, room, socketId, options = {}) {
  const { reason = 'left', byHost = false } = options;
  const leavingPlayer = room.getPlayerBySocketId(socketId);
  if (!leavingPlayer) return false;

  const wasDrawer = room.game.currentDrawerId === socketId;
  const gamePhase = room.game.phase;

  const result = room.removePlayer(socketId);

  if (result.empty) {
    room.game.abandonHistory();
    roomStore.deleteRoom(room.roomId);
    const event =
      reason === 'banned' ? 'banned' : reason === 'kicked' ? 'kicked' : 'room_left';
    io.to(socketId).emit(event, { message: 'The room was closed.', reason });
    return true;
  }

  const event =
    reason === 'banned' ? 'banned' : reason === 'kicked' ? 'kicked' : 'room_left';
  const message =
    reason === 'banned'
      ? 'You were banned from this room.'
      : reason === 'kicked'
        ? 'You were kicked from the room.'
        : 'You left the room.';

  io.to(socketId).emit(event, { message, reason });

  const sockets = io.sockets?.sockets;
  const targetSocket =
    sockets && typeof sockets.get === 'function'
      ? sockets.get(socketId)
      : sockets?.[socketId];
  if (targetSocket) {
    targetSocket.leave(room.roomId);
  }

  room.broadcast('player_left', {
    playerId: socketId,
    playerName: leavingPlayer.name,
    players: room.getPublicPlayers(),
    hostId: room.hostId,
    reason,
    byHost,
  });

  if (wasDrawer && (gamePhase === 'drawing' || gamePhase === 'word_select')) {
    setImmediate(() => {
      room.game.handleDrawerDisconnect();
    });
  }

  return true;
}

module.exports = { removeMemberFromRoom };
