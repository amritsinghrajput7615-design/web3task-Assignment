const { registerRoomHandlers } = require('../socket/roomHandlers');
const { registerGameHandlers } = require('../socket/gameHandlers');
const { registerDrawHandlers } = require('../socket/drawHandlers');
const { registerChatHandlers } = require('../socket/chatHandlers');

/**
 * OOP registry — wires all Socket.IO event handlers for a connection.
 */
class SocketHandlerRegistry {
  constructor(io) {
    this.io = io;
  }

  register(socket) {
    registerRoomHandlers(this.io, socket);
    registerGameHandlers(socket);
    registerDrawHandlers(socket);
    registerChatHandlers(socket);
  }
}

module.exports = { SocketHandlerRegistry };
