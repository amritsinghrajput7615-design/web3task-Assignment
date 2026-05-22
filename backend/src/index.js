import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import roomHandlers from './socket/roomHandlers.js';
import gameHandlers from './socket/gameHandlers.js';
import drawHandlers from './socket/drawHandlers.js';
import chatHandlers from './socket/chatHandlers.js';
import { roomStore } from './store/roomStore.js';
import { Game } from './classes/Game.js';

const app = express();
app.use(cors());
app.use(express.json());

// Fetch huge word list on startup
async function loadWords() {
  try {
    const res = await fetch('https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt');
    const text = await res.text();
    const words = text.split('\r\n').map(w => w.trim()).filter(w => w.length > 2 && w.length < 15);
    (Game as any).wordBank = words;
    console.log(`Loaded ${words.length} words.`);
  } catch (e) {
    console.error("Failed to load words, using fallback.", e);
    (Game as any).wordBank = ["apple", "banana", "house", "car", "dog", "cat", "computer", "sun", "tree"];
  }
}
loadWords();

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Inject io into roomStore/Room for broadcasting
roomStore.io = io; 

io.on('connection', (socket) => {
  roomHandlers(socket);
  gameHandlers(socket);
  drawHandlers(socket);
  chatHandlers(socket);
});

const PORT = 3001;
httpServer.listen(PORT, () => console.log(`Server running on ${PORT}`));