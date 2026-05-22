import { Socket } from 'socket.io';
import { roomStore } from '../store/roomStore.js';

export default function drawHandlers(socket: Socket) {
  socket.on('draw_start', ({ x, y, color, size }) => {
    const room = roomStore.getRoomBySocketId(socket.id);
    if (!room || room.game.currentDrawerId !== socket.id) return;

    const stroke = { points: [{ x, y }], color, size };
    room.game.strokeHistory.push(stroke);
    
    socket.to(room.roomId).emit('draw_data', stroke);
  });

  socket.on('draw_move', ({ x, y }) => {
    const room = roomStore.getRoomBySocketId(socket.id);
    if (!room || room.game.currentDrawerId !== socket.id) return;
    
    const lastStroke = room.game.strokeHistory[room.game.strokeHistory.length - 1];
    if (lastStroke) {
      lastStroke.points.push({ x, y });
      socket.to(room.roomId).emit('draw_data', lastStroke);
    }
  });

  socket.on('draw_end', () => {
    // Just broadcast end of stroke sequence if needed
  });

  socket.on('canvas_clear', () => {
    const room = roomStore.getRoomBySocketId(socket.id);
    if (!room || room.game.currentDrawerId !== socket.id) return;

    room.game.strokeHistory = [];
    socket.to(room.roomId).emit('canvas_clear');
  });

  socket.on('draw_undo', () => {
    const room = roomStore.getRoomBySocketId(socket.id);
    if (!room || room.game.currentDrawerId !== socket.id) return;

    room.game.strokeHistory.pop();
    socket.to(room.roomId).emit('draw_undo');
  });
}