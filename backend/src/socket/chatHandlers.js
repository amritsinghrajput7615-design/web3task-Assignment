import { Socket } from 'socket.io';
import { roomStore } from '../store/roomStore.js';

export default function chatHandlers(socket: Socket) {
  socket.on('guess', ({ text }) => {
    const room = roomStore.getRoomBySocketId(socket.id);
    if (!room) return;

    const player = room.getPlayerBySocketId(socket.id);
    if (!player) return;

    // Handled in Game class
    const result = room.game.handleGuess(player.id, player.name, text);
    
    if (!result.correct) {
      // Broadcast as chat message
      room.io.to(room.roomId).emit('chat_message', {
        playerId: player.id,
        playerName: player.name,
        text: text,
        isGuess: true,
      });
    }
  });

  socket.on('chat', ({ text }) => {
    const room = roomStore.getRoomBySocketId(socket.id);
    if (!room) return;

    const player = room.getPlayerBySocketId(socket.id);
    if (!player) return;

    room.io.to(room.roomId).emit('chat_message', {
      playerId: player.id,
      playerName: player.name,
      text: text,
      isGuess: false,
    });
  });
}