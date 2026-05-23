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
    persistence: 'game_history_only',
    database: database.getStatus(),
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
  const PORT = Number(process.env.PORT) || 3001;

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Stop the other server and restart.`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });

  server.listen(PORT, () => {
    console.log(`Skribbl server running on http://localhost:${PORT}`);
  });

  const mongoOk = await database.connect();
  const status = database.getStatus();
  console.log(
    `MongoDB: ${mongoOk && status.connected ? `connected → ${status.database}` : 'NOT connected — history will not save'}`
  );
  if (status.lastError) console.log(`MongoDB last error: ${status.lastError}`);
}

start();
