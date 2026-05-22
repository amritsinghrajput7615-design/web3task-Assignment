# Skribbl.io Clone

A full-stack multiplayer drawing and guessing game built with **React + TypeScript + Vite** (frontend) and **Node.js + Express + Socket.IO** (backend).

## Live Demo

> Deploy to [Render](https://render.com) or [Railway](https://railway.app) and add your URL here:
> `https://your-skribbl-clone.onrender.com`

## Features

- **Multiplayer rooms** — Create or join via room code or invite link
- **Configurable lobby** — Max players, rounds, draw time, word choices, hints
- **Turn-based drawing** — One drawer per round; others guess
- **Real-time canvas** — Stroke sync over WebSockets
- **Word selection** — Drawer picks from 1–5 random words
- **Scoring & leaderboard** — Points based on time remaining; winner at game end
- **Drawing tools** — Brush colors, size, eraser, undo, clear
- **Hints** — Letters revealed over time
- **Chat / guesses** — Wrong guesses appear in chat; correct guess ends the round

## Architecture

```
┌─────────────┐     WebSocket (Socket.IO)     ┌──────────────────────────────┐
│   React UI  │ ◄──────────────────────────► │  Express + Socket.IO Server   │
│  Canvas +   │   draw_*, guess, chat,       │  Room → Game → Player (OOP)   │
│  Lobby      │   game_state, round_*        │  In-memory room store         │
└─────────────┘                               └──────────────────────────────┘
```

### Drawing sync

1. Drawer starts a stroke → `draw_start` with `{ x, y, color, size }`
2. Moves → `draw_move` with `{ x, y }`; server appends to stroke history and broadcasts
3. Viewers render strokes on HTML5 Canvas from accumulated `draw_data` / `draw_move` events
4. Undo/clear broadcast to all clients

### Game state

- `Room` holds players, settings, host; `Game` manages rounds, timer, scoring, hints
- Total drawing turns = `playerCount × rounds`
- Drawer rotates each round; first correct guess awards points (time-based)

### Word matching

Guesses are trimmed and compared case-insensitively (`guess.trim().toLowerCase() === word.trim().toLowerCase()`).

## Local Setup

### Prerequisites

- Node.js 18+

### Install

```bash
npm run install:all
```

### Development (two terminals)

**Terminal 1 — Backend (port 3001):**
```bash
cd backend && npm run dev
```

**Terminal 2 — Frontend (port 5173):**
```bash
cd frontend && npm run dev
```

Open http://localhost:5173 — the Vite dev server proxies WebSocket traffic to the backend.

### Production build

```bash
npm run start
```

Builds the frontend and serves it from the backend on port 3001.

## Deployment (Render)

1. Push this repo to GitHub
2. Create a **Web Service** on Render
3. Build command: `npm run install:all && npm run build`
4. Start command: `npm run start --prefix backend` or `node backend/server.js` after build
5. Set `PORT` (Render sets this automatically)

WebSockets work on Render without extra config.

## Project Structure

```
├── backend/
│   ├── server.js              # Entry point
│   ├── data/words.json        # Word categories
│   └── src/
│       ├── classes/           # Room, Game, Player (OOP)
│       ├── socket/            # Event handlers
│       ├── store/roomStore.js
│       └── utils/wordMatcher.js
├── frontend/
│   └── src/
│       ├── components/        # Canvas, toolbar, chat
│       └── pages/             # Home, lobby, game
└── README.md
```

## WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `create_room` | C→S | Host creates room |
| `join_room` | C→S | Player joins by code |
| `start_game` | C→S | Host starts (min 2 players) |
| `round_start` | S→C | New round; drawer gets word options |
| `word_chosen` | C→S | Drawer selects word |
| `draw_start/move/end` | C→S | Drawing strokes |
| `draw_data` / `draw_move` | S→C | Broadcast strokes |
| `guess` | C→S | Submit guess |
| `guess_result` | S→C | Correct guess notification |
| `timer` | S→C | Countdown updates |
| `round_end` / `game_over` | S→C | Round/game completion |

## License

ISC
