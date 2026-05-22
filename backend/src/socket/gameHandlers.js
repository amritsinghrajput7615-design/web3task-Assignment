import { Socket } from 'socket.io';
import { roomStore } from '../store/roomStore.js';

export default function gameHandlers(socket: Socket) {
  socket.on('word_chosen', ({ word }) => {
    const room = roomStore.getRoomBySocketId(socket.id);
    if (!room) return;
    
    // Validate it's the drawer's turn
    if (room.game.currentDrawerId !== socket.id) return;
    
    room.game.handleWordSelection(word);
  });

  socket.on('next_round', () => {
    const room = roomStore.getRoomBySocketId(socket.id);
    if (!room) return;

    const players = room.getPublicPlayers();
    const currentIdx = players.findIndex(p => p.id === room.game.currentDrawerId);
    const nextIdx = (currentIdx + 1) % players.length;
    
    room.game.currentRound++;
    if (room.game.currentRound > room.game.rounds) {
      // Game Over
      room.io.to(room.roomId).emit('game_over', {
        leaderboard: players.sort((a, b) => b.score - a.score),
      });
      return;
    }

    room.game.startRound(players[nextIdx].id, room.getPlayerList());
  });
}