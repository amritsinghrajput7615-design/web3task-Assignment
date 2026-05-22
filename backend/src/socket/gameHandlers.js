const { roomStore } = require('../store/roomStore');

function registerGameHandlers(socket) {
  socket.on('word_chosen', ({ word }) => {
    const room = roomStore.getRoomBySocketId(socket.id);
    if (!room) return;
    room.game.handleWordSelection(word, socket.id);
  });
}

module.exports = { registerGameHandlers };
