const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const connectDB = require('./config/db');
const roomHandler = require('./socket/handlers');
const path = require('path');

// Load words
const words = require('./data/words.json');

const app = express();
app.use(cors());
app.use(express.json());

// Route for getting words (optional)
app.get('/api/words', (req, res) => {
  res.json(words);
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // In production, replace with client URL
    methods: ["GET", "POST"]
  }
});

// Connect to MongoDB
connectDB();

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Pass dependencies to handler
  roomHandler(io, socket, words);

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});