# Skribbl Clone

A full-stack, real-time multiplayer drawing and guessing game inspired by [Skribbl.io](https://skribbl.io). Players join rooms, take turns drawing secret words on a shared HTML5 canvas, and race to guess correctly before time runs out.

---

## Project Description

This application pairs a **React + Vite** single-page frontend with a **Node.js + Express + Socket.IO** backend. Gameplay state (rooms, players, strokes, timers) lives in server memory for low-latency sync. **MongoDB Atlas** stores completed game history and leaderboards only—live rounds are never blocked on database writes.

The UI uses a dark theme with teal accents, responsive layout (mobile + desktop), invite links with room codes, and configurable lobby settings (rounds, draw time, hints, max players).

---

## Live Deployment

| Service   | URL |
|-----------|-----|
| **Frontend (Vercel)** | [https://skribbl-clone-orcin.vercel.app](https://skribbl-clone-orcin.vercel.app) |
| **Backend (Render)**  | [https://web3task-assignment-t1no.onrender.com](https://web3task-assignment-t1no.onrender.com) |
|

> **Note:** On Render’s free tier, the backend may sleep when idle. Open the health URL once, wait for a response, then load the Vercel app.

---

## Features

- **Create & join rooms** — Room codes and shareable invite links (`?room=CODE`)
- **Configurable lobby** — Max players, rounds, draw time, word choices, hints
- **Turn-based gameplay** — Rotating drawer; total turns = `players × rounds`
- **Word selection** — Drawer picks from random word options (timed)
- **Real-time drawing** — HTML5 Canvas stroke sync over WebSockets
- **Live chat guessing** — Wrong guesses in chat; correct guesses highlighted with points
- **Scoreboard** — Live scores; end-game leaderboard
- **Drawing tools** — Brush, eraser, colors, size, undo, clear
- **Progressive hints** — Letters revealed during the draw phase
- **Reconnection** — Rejoin by nickname after refresh (in-room)


---

## Tech Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| React 19 | UI components & state |
| TypeScript | Type safety |
| Vite 6 | Dev server & production build |
| Tailwind CSS 4 (CDN) | Utility styling + custom game theme |
| Socket.IO Client | Real-time events |
| HTML5 Canvas | Drawing surface (800×500 logical coords) |
| React Router | Client routing & invite URLs |

### Backend

| Technology | Purpose |
|------------|---------|
| Node.js | Runtime |
| Express 5 | HTTP API & static hosting (optional) |
| Socket.IO 4 | WebSocket rooms & broadcasts |

| In-memory store | Live rooms & gameplay |

### Deployment

| Service | Role |
|---------|------|
| **Vercel** | Static frontend hosting |
| **Render** | Node.js backend + Socket.IO |
| **MongoDB Atlas** | Managed database |

---

## Folder Structure

```
Scrible-Assignment/
├── backend/
│   ├── server.js                 # Express + Socket.IO entry
│   ├── data/
│   │   └── words.json            # Word categories
│   ├── .env.example
│   └── src/
│       ├── classes/
│       │   ├── Room.js           # Players, host, bans, invites
│       │   ├── Game.js           # Rounds, timers, scoring
│       │   ├── Player.js
│       │   └── GameTimerManager.js
│       ├── config/
│       │   └── database.js       # MongoDB connection
│       ├── handlers/
│       │   ├── MessageHandler.js # Chat & guess messages
│       │   └── SocketHandlerRegistry.js
│       ├── models/
│       │   └── GameHistory.js    # Mongoose schema
│       ├── services/
│       │   ├── GameHistoryService.js
│       │   └── WordService.js
│       ├── socket/
│       │   ├── roomHandlers.js
│       │   ├── gameHandlers.js
│       │   ├── drawHandlers.js
│       │   ├── chatHandlers.js
│       │   └── roomMembership.js
│       ├── store/
│       │   └── roomStore.js      # In-memory room map
│       └── utils/
│           ├── wordMatcher.js
│           └── GameEvents.js
├── frontend/
│   ├── index.html                # Tailwind CDN
│   ├── vite.config.ts            # Dev proxy → :3001
│   ├── vercel.json
│   ├── .env.example
│   ├── .env.production
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── types.ts
│       ├── components/
│       │   ├── DrawingCanvas.tsx
│       │   ├── DrawingToolbar.tsx
│       │   └── ChatPanel.tsx
│       ├── hooks/
│       │   └── useGameSocket.ts
│       ├── lib/
│       │   └── gameSocket.ts
│       └── pages/
│           ├── HomePage.tsx
│           ├── LobbyPage.tsx
│           └── GamePage.tsx
├── package.json                  # Root scripts (dev, build, start)
├── README.md
└── ARCHITECTURE.md
```

---

## Installation

### Prerequisites

- **Node.js** 18 or newer  
- **npm** 9+  
- **MongoDB** — local instance or [MongoDB Atlas](https://www.mongodb.com/atlas) free cluster  

### Clone & install dependencies

```bash
git clone <your-repo-url>
cd Scrible-Assignment
npm run install:all
```

This runs `npm install` in both `backend/` and `frontend/`.

---

## Environment Variables

### Backend (`backend/.env`)

Copy `backend/.env.example` to `backend/.env`:

```env
# Local MongoDB
MONGODB_URI=mongodb://127.0.0.1:27017/skribbl-clone

# MongoDB Atlas (production)
# MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/skribbl-clone?retryWrites=true&w=majority

PORT=3001
```

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | No* | Atlas/local URI; history disabled if missing or unreachable |
| `PORT` | No | HTTP port (default `3001`; Render sets this automatically) |

\*Game runs without MongoDB; history APIs return empty and writes are skipped.

### Frontend (`frontend/.env`)

**Development** — `frontend/.env.development` (optional):

```env
# Leave empty to use Vite proxy (localhost:5173 → localhost:3001)
# VITE_SERVER_URL=http://localhost:3001
```

**Production (Vercel)** — set in Vercel dashboard or use `frontend/.env.production`:

```env
VITE_SERVER_URL=https://web3task-assignment-t1no.onrender.com
```

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SERVER_URL` | Yes (Vercel) | Public Render backend URL, **no trailing slash** |

> Vite embeds `VITE_*` variables at **build time**. Redeploy after changing them.

---

## Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env — set MONGODB_URI (Atlas recommended for deployment)
npm run dev
```

Server starts on `http://localhost:3001` with Socket.IO on path `/socket.io`.

Verify:

```bash
curl http://localhost:3001/api/health
```

Expected response:

```json
{
  "ok": true,
  "persistence": "game_history_only",
  "database": { "connected": true, "database": "skribbl-clone" }
}
```

---

## Frontend Setup

```bash
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). WebSocket traffic is proxied to the backend via `vite.config.ts`.

Production build:

```bash
cd frontend
npm run build
npm run preview
```

---

## Running Locally

### Option A — Two terminals (recommended for development)

**Terminal 1 — Backend:**

```bash
cd backend && npm run dev
```

**Terminal 2 — Frontend:**

```bash
cd frontend && npm run dev
```

### Option B — Single command (from repo root)

```bash
npm run dev
```

Uses `concurrently` to start both servers.

### Option C — Production-style (one server)

```bash
npm run start
```

Builds the frontend and serves it from Express on port `3001` (same origin, no `VITE_SERVER_URL` needed).

---

## Deployment

### Backend on Render

1. Connect GitHub repository.  
2. **Build command:** `npm run install:all && npm run build`  
3. **Start command:** `node backend/server.js`  
4. Set **`MONGODB_URI`** to your Atlas connection string.  
5. Note the public URL (e.g. `https://web3task-assignment-t1no.onrender.com`).

### Frontend on Vercel

1. Set **Root Directory** to `frontend`.  
2. Add environment variable:  
   - `VITE_SERVER_URL` = your Render backend URL  
3. Deploy / redeploy.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for why the backend is not hosted on Vercel.

---

## API Overview

Base URL (local): `http://localhost:3001`  
Base URL (production): `https://web3task-assignment-t1no.onrender.com`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Server & MongoDB status |
| `GET` | `/api/words/categories` | Word category keys from `words.json` |
| `GET` | `/api/history/room/:roomId` | Past games for a room code |
| `GET` | `/api/history/recent` | Recent completed games |

### Example: Health check

```http
GET /api/health
```

```json
{
  "ok": true,
  "persistence": "game_history_only",
  "database": {
    "connected": true,
    "database": "skribbl-clone"
  }
}
```

### Example: Room history

```http
GET /api/history/room/XATDKC
```

```json
{
  "roomId": "XATDKC",
  "history": [
    {
      "roomId": "XATDKC",
      "hostName": "Alice",
      "status": "completed",
      "winner": { "playerName": "Bob", "score": 1200 },
      "leaderboard": [
        { "rank": 1, "playerName": "Bob", "score": 1200 }
      ],
      "wordsUsed": [
        { "word": "apple", "round": 1, "wasGuessed": true, "drawerName": "Alice" }
      ]
    }
  ]
}
```

---

## Socket Events Overview

### Client → Server

| Event | Payload (example) | Description |
|-------|-------------------|-------------|
| `create_room` | `{ hostName, settings, clientOrigin }` | Create room |
| `join_room` | `{ roomId, playerName, clientOrigin }` | Join / reconnect |
| `leave_room` | — | Leave room |
| `start_game` | — | Host starts (≥ 2 players) |
| `word_chosen` | `{ word: "apple" }` | Drawer selects word |
| `draw_start` | `{ x, y, color, size }` | Begin stroke |
| `draw_move` | `{ x, y }` | Continue stroke |
| `draw_end` | — | End stroke |
| `draw_undo` | — | Remove last stroke |
| `canvas_clear` | — | Clear canvas (drawer only) |
| `guess` | `{ text: "apple" }` | Submit guess |
| `kick_player` | `{ targetId }` | Host kicks player |
| `ban_player` | `{ targetId }` | Host bans player |

### Server → Client

| Event | Description |
|-------|-------------|
| `room_created` / `room_joined` | Lobby state + optional game snapshot |
| `player_joined` / `player_left` | Roster updates |
| `round_start` | New turn, word options for drawer |
| `word_selected` / `word_chosen_ack` | Drawing phase begins |
| `draw_data` | New stroke from drawer |
| `draw_move` | Point appended to stroke |
| `draw_undo` | Stroke list updated |
| `canvas_clear` | Clear all strokes |
| `timer` / `timer_update` | Countdown sync |
| `hint_update` | Hint letters updated |
| `chat_message` | Chat / system / guess messages |
| `guess_result` / `correct_guess` | Correct guess metadata |
| `round_end` | Round summary + word reveal |
| `game_over` | Final leaderboard |
| `error` | `{ message: string }` |

### Example payloads

**`create_room` (client → server):**

```json
{
  "hostName": "Alice",
  "settings": {
    "maxPlayers": 8,
    "rounds": 3,
    "drawTime": 80,
    "wordCount": 3,
    "hints": 2,
    "wordMode": "normal",
    "isPrivate": false
  },
  "clientOrigin": "https://skribbl-clone-orcin.vercel.app"
}
```

**`draw_start` (client → server):**

```json
{
  "x": 142.5,
  "y": 88.0,
  "color": "#000000",
  "size": 6
}
```

**`draw_data` (server → clients):**

```json
{
  "id": 1713876543210,
  "points": [{ "x": 142.5, "y": 88.0 }],
  "color": "#000000",
  "size": 6
}
```

**`round_end` (server → clients):**

```json
{
  "word": "apple",
  "wasGuessed": true,
  "guesserName": "Bob",
  "points": 420,
  "scores": [
    { "id": "socketId1", "name": "Alice", "score": 105 },
    { "id": "socketId2", "name": "Bob", "score": 420 }
  ],
  "transitionSeconds": 4
}
```

For full event flow diagrams, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Future Improvements

- [ ] Redis adapter for multi-instance Socket.IO scaling  
- [ ] Private rooms with passwords  
- [ ] Custom word lists per room  
- [ ] Sound effects & animations  
- [ ] Spectator mode  
- [ ] Rate limiting & abuse prevention on guesses  
- [ ] E2E tests (Playwright) for create → draw → guess flow  
- [ ] PWA / offline lobby  

---

## Author

**Amrit Kumar**  
Internship / Web3 Task Assignment — Full-Stack Real-Time Multiplayer Game  

- GitHub: `https://github.com/amritsinghrajput7615-design/web3task-Assignment`  
- Frontend: [skribbl-clone-orcin.vercel.app](https://skribbl-clone-orcin.vercel.app)  
- Backend: [web3task-assignment-t1no.onrender.com](https://web3task-assignment-t1no.onrender.com)  

---

## License

ISC
