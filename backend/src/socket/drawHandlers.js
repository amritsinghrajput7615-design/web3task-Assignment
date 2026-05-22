const { roomStore } = require('../store/roomStore');

function registerDrawHandlers(socket) {
  socket.on('draw_start', ({ x, y, color, size }) => {
    const room = roomStore.getRoomBySocketId(socket.id);
    if (!room || room.game.currentDrawerId !== socket.id) return;
    if (room.game.phase !== 'drawing' || !room.game.roundActive) return;

    const stroke = {
      id: Date.now(),
      points: [{ x, y }],
      color,
      size,
    };
    room.game.strokeHistory.push(stroke);
    socket.to(room.roomId).emit('draw_data', stroke);
  });

  socket.on('draw_move', ({ x, y }) => {
    const room = roomStore.getRoomBySocketId(socket.id);
    if (!room || room.game.currentDrawerId !== socket.id) return;

    const lastStroke = room.game.strokeHistory[room.game.strokeHistory.length - 1];
    if (!lastStroke) return;

    lastStroke.points.push({ x, y });
    socket.to(room.roomId).emit('draw_move', { x, y, strokeId: lastStroke.id });
  });

  socket.on('draw_end', () => {
    // stroke complete — no extra broadcast needed
  });

  socket.on('canvas_clear', () => {
    const room = roomStore.getRoomBySocketId(socket.id);
    if (!room || room.game.currentDrawerId !== socket.id) return;

    room.game.strokeHistory = [];
    room.broadcast('canvas_clear');
  });

  socket.on('draw_undo', () => {
    const room = roomStore.getRoomBySocketId(socket.id);
    if (!room || room.game.currentDrawerId !== socket.id) return;

    room.game.strokeHistory.pop();
    room.broadcast('draw_undo', {
      strokes: room.game.strokeHistory,
    });
  });
}

module.exports = { registerDrawHandlers };
