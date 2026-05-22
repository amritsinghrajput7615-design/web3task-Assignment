const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const wordsData = require('./data/words.json');
const { setWordBank } = require('./src/classes/Game');
const { roomStore } = require('./src/store/roomStore');
const { registerRoomHandlers } = require('./src/socket/roomHandlers');
const { registerGameHandlers } = require('./src/socket/gameHandlers');
const { registerDrawHandlers } = require('./src/socket/drawHandlers');
const { registerChatHandlers } = require('./src/socket/chatHandlers');

const allWords = Object.values(wordsData).flat();
setWordBank(allWords);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/words/categories', (_req, res) => {
  res.json(Object.keys(wordsData));
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

io.on('connection', (socket) => {
  registerRoomHandlers(io, socket);
  registerGameHandlers(socket);
  registerDrawHandlers(socket);
  registerChatHandlers(socket);
});

const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
  console.log(`Skribbl server running on http://localhost:${PORT}`);
});
