require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const wordsData = require('./data/words.json');
const { database } = require('./src/config/database');
const { wordService } = require('./src/services/WordService');
const { gameHistoryService } = require('./src/services/GameHistoryService');
const { roomStore } = require('./src/store/roomStore');
const { SocketHandlerRegistry } = require('./src/handlers/SocketHandlerRegistry');

const allWords = Object.values(wordsData).flat();
wordService.setFallback(allWords);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    database: database.isConnected(),
    persistence: 'game_history_only',
  });
});

app.get('/api/words/categories', (_req, res) => {
  res.json(Object.keys(wordsData));
});

app.get('/api/history/room/:roomId', async (req, res) => {
  const history = await gameHistoryService.getByRoomId(req.params.roomId);
  res.json({ roomId: req.params.roomId.toUpperCase(), history });
});

app.get('/api/history/recent', async (_req, res) => {
  const games = await gameHistoryService.getRecentCompleted();
  res.json({ games });
});

const clientDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(clientDist));
app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

roomStore.setIO(io);
const socketRegistry = new SocketHandlerRegistry(io);

io.on('connection', (socket) => {
  socketRegistry.register(socket);
});

async function start() {
  await database.connect();

  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    console.log(`Skribbl server running on http://localhost:${PORT}`);
    console.log(
      `MongoDB: ${database.isConnected() ? 'connected (history + leaderboard)' : 'not configured'}`
    );
  });
}

start();
