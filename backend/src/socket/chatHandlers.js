const { roomStore } = require('../store/roomStore');

function registerChatHandlers(socket) {
  socket.on('guess', ({ text }) => {
    const room = roomStore.getRoomBySocketId(socket.id);
    if (!room) return;

    const player = room.getPlayerBySocketId(socket.id);
    if (!player) return;

    const result = room.game.handleGuess(player.id, player.name, text);

    if (!result.correct && result.broadcast) {
      room.broadcast('chat_message', {
        playerId: player.id,
        playerName: player.name,
        text,
        isGuess: true,
      });
    }
  });

  socket.on('chat', ({ text }) => {
    const room = roomStore.getRoomBySocketId(socket.id);
    if (!room) return;

    const player = room.getPlayerBySocketId(socket.id);
    if (!player) return;

    if (room.game.phase === 'drawing' && player.id !== room.game.currentDrawerId) {
      return;
    }

    room.broadcast('chat_message', {
      playerId: player.id,
      playerName: player.name,
      text,
      isGuess: false,
    });
  });
}

module.exports = { registerChatHandlers };
