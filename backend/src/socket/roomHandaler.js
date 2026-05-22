import { Socket } from 'socket.io';
import { roomStore } from '../store/roomStore.js';

export default function roomHandlers(socket: Socket) {
  socket.on('create_room', ({ hostName, settings }) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const room = roomStore.createRoom(roomId, socket.id, hostName, settings, socket.io);
    socket.join(room.roomId);
    
    socket.emit('player_joined', {
      player: { id: socket.id, name: hostName, score: 0, isDrawer: true, hasGuessed: false },
      players: room.getPublicPlayers(),
      roomId: room.roomId,
    });
  });

  socket.on('join_room', ({ roomId, playerName }) => {
    const room = roomStore.getRoom(roomId.toUpperCase());
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    if (room.players.size >= room.settings.maxPlayers) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }

    const playerId = socket.id;
    room.addPlayer(playerId, playerName, socket.id);
    socket.join(room.roomId);

    socket.to(room.roomId).emit('player_joined', {
      players: room.getPublicPlayers(),
    });

    socket.emit('player_joined', {
      player: room.getPublicPlayers().find((p) => p.id === socket.id),
      players: room.getPublicPlayers(),
      roomId: room.roomId,
    });
  });

  socket.on('start_game', () => {
    const room = roomStore.getRoomBySocketId(socket.id);
    if (!room || room.hostId !== socket.id) return;

    const players = room.getPublicPlayers();
    if (players.length < 2) {
      socket.emit('error', { message: 'Need at least 2 players' });
      return;
    }

    // Pass Room reference to Game to access players
    room.game.startRound(players[0].id, room.getPlayerList());
  });
}