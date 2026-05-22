import { io, Socket } from 'socket.io-client';

/** Empty = same origin; Vite proxies /socket.io → backend in dev */
const SERVER_URL = import.meta.env.VITE_SERVER_URL || undefined;

let socket: Socket | null = null;

/** Single shared Socket.IO client (survives React Strict Mode remounts). */
export function getGameSocket(): Socket {
  if (!socket) {
    socket = io(SERVER_URL, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
}
