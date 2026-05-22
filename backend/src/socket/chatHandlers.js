const { roomStore } = require('../store/roomStore');

function registerChatHandlers(socket) {
  socket.on('guess', ({ text }) => {
    const room = roomStore.getRoomBySocketId(socket.id);
    if (!room) return;

    const player = room.getPlayerBySocketId(socket.id);
    if (!player) return;

    const result = room.game.handleGuess(player.id, player.name, text);

    if (!result.correct && result.broadcast) {
      room.messageHandler.sendWrongGuess(player.id, player.name, text);
    }
  });

  socket.on('chat', ({ text }) => {
    const room = roomStore.getRoomBySocketId(socket.id);
    if (!room) return;

    const player = room.getPlayerBySocketId(socket.id);
    if (!player) return;

    // Prevent the drawer from sending chat messages during drawing (they should not give hints)
    if (room.game.phase === 'drawing' && player.id === room.game.currentDrawerId) {
      return;
    }

    room.messageHandler.sendChat(player.id, player.name, text, { isGuess: false });
  });
}

module.exports = { registerChatHandlers };
