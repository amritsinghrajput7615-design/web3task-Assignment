# Architecture — Skribbl Clone

This document describes how the real-time multiplayer drawing game is structured end-to-end: clients, WebSockets, in-memory game logic, and MongoDB persistence.

---

## 1. Overall System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS (Browser)                               │
│  React SPA · HTML5 Canvas · Socket.IO Client · sessionStorage (rejoin)      │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                    HTTPS (Vercel)  │  WSS / HTTPS (Render)
                                    │
        ┌───────────────────────────┴───────────────────────────┐
        │                                                         │
        ▼                                                         ▼
┌───────────────────┐                                 ┌───────────────────────┐
│  Vercel (static)  │                                 │  Render (Node.js)      │
│  - Vite build     │   VITE_SERVER_URL points here ─►│  - Express HTTP        │
│  - No WebSockets  │                                 │  - Socket.IO server    │
└───────────────────┘                                 │  - In-memory rooms     │
                                                      └───────────┬───────────┘
                                                                  │
                                                                  │ async writes
                                                                  ▼
                                                      ┌───────────────────────┐
                                                      │  MongoDB Atlas         │
                                                      │  game_histories only   │
                                                      └───────────────────────┘
```

### Design principles

| Principle | Implementation |
|-----------|----------------|
| **Low latency** | Live state in RAM; no DB reads during rounds |
| **Single source of truth** | Server owns strokes, scores, phase, timers |
| **Thin client** | Client renders strokes; server validates draws/guesses |
| **Resilient UX** | Reconnect by room code + nickname; snapshot on rejoin |
| **Persistence boundary** | MongoDB only for completed / round history |

---

## 2. Frontend Architecture

```
frontend/src/
├── main.tsx              # React root + Router
├── App.tsx               # Global state, routes Home → Lobby → Game
├── hooks/
│   └── useGameSocket.ts  # Socket listeners → React setters
├── lib/
│   └── gameSocket.ts     # Singleton Socket.IO client
├── pages/
│   ├── HomePage.tsx      # Create / join
│   ├── LobbyPage.tsx     # Waiting room, invite copy
│   └── GamePage.tsx      # Canvas, toolbar, chat, scores
└── components/
    ├── DrawingCanvas.tsx # 800×500 logical canvas + ResizeObserver
    ├── DrawingToolbar.tsx
    └── ChatPanel.tsx
```

### State management

- **React `useState`** in `App.tsx` holds canonical UI state: `phase`, `players`, `strokes`, `messages`, timers, etc.
- **`useGameSocket`** registers Socket.IO listeners once and maps events to setters via refs (avoids stale closures).
- **`sessionStorage`** stores `activeRoomId` and `playerName` for refresh/rejoin.

### Styling

- **Tailwind CSS 4** via CDN in `index.html` for utility classes on marketing/home views.
- **Custom CSS** (`index.css`) for the game shell: dark panels, teal accents, chat bubbles, canvas layout.

### Connection strategy

| Environment | Socket URL |
|-------------|------------|
| Local dev | Empty → same origin; Vite proxies `/socket.io` → `localhost:3001` |
| Vercel prod | `VITE_SERVER_URL` → Render backend |

```typescript
// frontend/src/lib/gameSocket.ts
const SERVER_URL = import.meta.env.VITE_SERVER_URL?.trim() || undefined;
io(SERVER_URL, { path: '/socket.io', transports: ['polling', 'websocket'] });
```

---

## 3. Backend Architecture

```
backend/
├── server.js                    # HTTP + Socket.IO bootstrap
└── src/
    ├── handlers/
    │   └── SocketHandlerRegistry.js   # Wires all socket modules
    ├── socket/
    │   ├── roomHandlers.js      # create/join/leave/kick/ban
    │   ├── gameHandlers.js      # word_chosen
    │   ├── drawHandlers.js      # draw_*, canvas_clear, undo
    │   └── chatHandlers.js      # guess, chat
    ├── classes/
    │   ├── Room.js              # Players, host, chat history
    │   ├── Game.js              # Phases, timers, scoring
    │   └── GameTimerManager.js  # setInterval / setTimeout
    ├── store/roomStore.js       # Map<roomId, Room>
    └── services/
        ├── WordService.js
        └── GameHistoryService.js
```

### Request path

1. Socket connects → `SocketHandlerRegistry.register(socket)`
2. Event handler resolves `room = roomStore.getRoomBySocketId(socket.id)`
3. Mutations on `room` / `room.game` → `room.broadcast(...)` or `GameEvents.emitTo(...)`

### OOP responsibilities

| Class | Responsibility |
|-------|----------------|
| `Room` | Player map, host, bans, invite URL, chat history, disconnect grace timer |
| `Game` | Phase machine, drawer rotation, timers, hints, stroke history, scoring |
| `Player` | Name, score, `hasGuessed`, `isDrawer` |
| `MessageHandler` | Formats chat / correct / wrong / system messages |
| `GameEvents` | Broadcast + legacy alias events |
| `roomStore` | Global registry of active rooms |

---

## 4. Room Management System

### Lifecycle

```
create_room → room in roomStore → players join → lobby
     → start_game → turns (word_select → drawing → round_end)*
     → game_over → history saved → room may empty → delete
```

### Room ID

- 6-character alphanumeric code (uppercase), generated server-side.
- Invite path: `?room=CODE`; `clientOrigin` builds full invite link in lobby.

### Join rules

| Case | Behavior |
|------|----------|
| New player, lobby phase | `addPlayer`, broadcast `player_joined` |
| Same nickname reconnect | `reconnectPlayerByName`, emit `room_joined` + snapshot |
| Game in progress, unknown player | `error`: "Game already in progress" |
| Banned name | `error`: "You are banned from this room" |
| Room full | `error`: "Room is full" |

### Disconnect handling

- On socket `disconnect`, a **20s grace timer** starts (`Room.scheduleDisconnectRemoval`).
- If the player reconnects with the same name before expiry, the timer is cancelled.
- If the **drawer** disconnects during `drawing` or `word_select`, `Game.handleDrawerDisconnect()` may end/skip the round.

---

## 5. Drawing Synchronization Flow

### Coordinate system

- Internal canvas resolution: **800 × 500** pixels (fixed logical space).
- CSS scales the `<canvas>` element to fit the container (`ResizeObserver`).
- Pointer position: `getBoundingClientRect()` → scale to logical coords, clamped to `[0, 800]` × `[0, 500]`.

### Step-by-step (happy path)

```
┌──────────┐    draw_start     ┌──────────┐    draw_data      ┌──────────┐
│  Drawer  │ ────────────────► │  Server  │ ────────────────► │ Guessers │
│  (local  │    {x,y,color,    │ strokeHistory│   (socket.to    │  append  │
│  + emit) │     size}         │  .push()     │    room)        │  stroke  │
└──────────┘                   └──────────┘                   └──────────┘
      │                              │
      │ draw_move {x,y}              │ draw_move {x,y, strokeId}
      │ (repeat)                     │ append point + broadcast
      ▼                              ▼
 Local preview                  All clients redraw from
 on canvas                      stroke list in React state
```

#### Step 1 — Mouse / touch captured

`DrawingCanvas` listens to `mousedown` / `touchstart` on the canvas element (only when `isDrawer && canDraw`).

#### Step 2 — Coordinates computed

```typescript
const scaleX = canvas.width / rect.width;   // 800 / displayedWidth
const x = (clientX - rect.left) * scaleX;
```

#### Step 3 — Client emits `draw_start`

```json
{ "x": 120, "y": 200, "color": "#000000", "size": 6 }
```

`App.tsx` optimistically appends the stroke locally and calls `socket.emit('draw_start', ...)`.

#### Step 4 — Server validates & stores

```javascript
// drawHandlers.js
if (room.game.currentDrawerId !== socket.id) return;
if (room.game.phase !== 'drawing') return;
const stroke = { id: Date.now(), points: [{ x, y }], color, size };
room.game.strokeHistory.push(stroke);
socket.to(room.roomId).emit('draw_data', stroke);
```

#### Step 5 — Server broadcasts moves

Each `draw_move` appends to the last stroke and emits:

```json
{ "x": 125, "y": 205, "strokeId": 1713876543210 }
```

#### Step 6 — Clients redraw

`useGameSocket` updates `strokes` state; `DrawingCanvas` `useEffect` calls `redraw(ctx, strokes)` — white fill + all paths.

### Intentional clears only

| Trigger | Mechanism |
|---------|-----------|
| Word chosen (start drawing) | Server `canvas_clear` + empty `strokeHistory` |
| New turn after round end | `canvas_clear` before `setupTurn` |
| Drawer clicks Clear | `canvas_clear` event |
| Word select timeout skip | `canvas_clear` |

**Not cleared on:** timer ticks, `hint_update`, or `game_state` sync (fixed on frontend).

---

## 6. WebSocket Event Flow

### Phase diagram

```
lobby ──start_game──► word_select ──word_chosen──► drawing ──guess/time──► round_end
                         │                              │                      │
                         └── timeout/skip ──────────────┘                      │
                                                                               └──► next turn / game_over
```

### Typical sequence (2 players)

```
Host          Server           Guest
  | create_room  |                |
  |─────────────►| room_created   |
  |              |◄───────────────| join_room
  |              | player_joined  |
  | start_game   |                |
  |─────────────►| round_start    |──────────────►|
  |◄─────────────| word options   |               |
  | word_chosen  |                |               |
  |─────────────►| canvas_clear   |──────────────►|
  | draw_*       | draw_data      |──────────────►|
  |              |◄───────────────| guess         |
  |              | correct_guess / round_end      |
```

### Event aliases

`GameEvents` duplicates some events under legacy names (e.g. `round_start` → `roundStarted`) for backward compatibility.

---

## 7. Game State Management

### Server phases (`Game.phase`)

| Phase | Meaning |
|-------|---------|
| `lobby` | Waiting for host to start |
| `word_select` | Drawer choosing word |
| `drawing` | Active canvas + guessing |
| `round_end` | Reveal word, transition timer |
| `ended` | Game over screen |

### Client phases (`GamePhase` in TypeScript)

Aligns with server; UI in `GamePage` switches layout/overlays by `phase`.

### `game_state` broadcast

`Game.syncGameState()` sends public fields (phase, timers, hints, players). Used after major transitions—not for per-stroke updates.

**Important:** Clients must not clear strokes when receiving `game_state` during drawing; hints use dedicated `hint_update` event.

### Reconnect snapshot

`getReconnectSnapshot(socketId)` includes:

- `strokes` (copy of `strokeHistory`)
- `messages` (chat history)
- phase-specific fields (`wordOptions` for drawer, `hints` for guessers)

---

## 8. Scoring Logic

### Correct guess (guesser)

```javascript
// Game.js — calculatePoints()
const ratio = Math.max(0, this.timeLeft / this.drawTime);
return Math.max(50, Math.round(500 * ratio));
```

- More time left → more points (max ~500 at full clock).
- Minimum **50** points per correct guess.

### Drawer bonus

```javascript
drawer.score += Math.round(points * 0.25);
```

### Round end (timeout)

- No guesser points; word revealed in chat with red “missed” styling.
- Drawer does not receive guess-based bonus.

### Game end

- `getLeaderboard()` sorts players by score descending.
- `game_over` emits `{ winner, leaderboard }`.
- `GameHistoryService.completeSession()` writes final ranks to MongoDB.

### Total rounds

```javascript
this.totalRounds = playerCount * room.settings.rounds;
```

Each player draws `settings.rounds` times.

---

## 9. Word Matching Logic

```javascript
// backend/src/utils/wordMatcher.js
function checkGuess(guess, word) {
  return guess.trim().toLowerCase() === word.trim().toLowerCase();
}
```

| Rule | Detail |
|------|--------|
| Case | Insensitive |
| Whitespace | Trimmed |
| Drawer | Cannot guess |
| Already guessed | Ignored |
| Wrong guess | Broadcast as chat (`isGuess: true`) |
| Correct | `claimRoundEnd` → `endRound(true)` → masked word in chat |

The real word is **never** sent to non-drawers before round end; hints show `_` with progressive letter reveals.

---

## 10. MongoDB Persistence Flow

```
start_game ──► GameHistoryService.startSession()     → status: in_progress
     │
     ├── each round_end ──► recordRound()            → wordsUsed[]
     │
     └── game_over ──► completeSession()             → status: completed
                              ├── winner, leaderboard
                              └── gameEndTime

disconnect / empty room ──► abandonSession()         → status: abandoned (if applicable)
```

### Schema highlights (`GameHistory`)

- `roomId`, `hostName`, `players[]`, `totalRounds`, `currentRound`
- `winner`, `leaderboard[]`, `wordsUsed[]` (per-round word + `wasGuessed`)
- `gameStartTime`, `gameEndTime`, `status`, timestamps

### Failure mode

If Atlas is unreachable:

- Game continues in memory.
- `database.connect()` logs warning; APIs return empty history.
- No blocking on gameplay path.

---

## 11. Deployment Architecture

```
                    ┌─────────────────┐
   Users ──────────►│ Vercel CDN       │
                    │ (static HTML/JS) │
                    └────────┬────────┘
                             │ Socket.IO client
                             │ to VITE_SERVER_URL
                             ▼
                    ┌─────────────────┐
                    │ Render Web Svc   │
                    │ Node + Socket.IO │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ MongoDB Atlas    │
                    │ (VPC / IP allow) │
                    └─────────────────┘
```

### Build pipeline

| Platform | Build | Output |
|----------|-------|--------|
| Vercel | `npm run build` in `frontend/` | `dist/` static assets |
| Render | `npm run install:all && npm run build` | `frontend/dist` + `node backend/server.js` |

### Environment wiring

- **Vercel:** `VITE_SERVER_URL=https://<render-app>.onrender.com`
- **Render:** `MONGODB_URI`, `PORT` (injected)

---

## 12. Why Render for Backend (Not Vercel)

| Requirement | Vercel | Render |
|-------------|--------|--------|
| Long-lived **WebSocket** connections | Serverless functions are request-scoped; not ideal for persistent Socket.IO rooms | ✅ Long-running Node process |
| In-memory room state | No shared memory between invocations | ✅ Single process holds `roomStore` |
| Socket.IO fallbacks (polling upgrade) | Limited / awkward on static-only hosting | ✅ Supported out of the box |
| Express + `socket.io` on same port | Not typical for Vercel | ✅ Standard pattern |

**Vercel is used for the frontend** because it excels at fast global CDN delivery of static Vite builds. **Render hosts the authoritative game server** that must stay alive for the duration of each match.

Alternative: deploy **both** UI and API on Render (`npm run start` serves `frontend/dist` from Express)—one URL, no `VITE_SERVER_URL`.

---

## 13. Scalability Considerations

### Current limits

- **Single Node process** — all rooms in one `roomStore` Map.
- **No horizontal scaling** — sticky sessions would be required for multiple instances.
- **Memory** — grows with active rooms, stroke history per game, chat logs (capped ~100 messages).

### Scale-out path

1. **Redis adapter** for Socket.IO (`@socket.io/redis-adapter`) so multiple Render instances share broadcasts.
2. **External room store** (Redis hashes) instead of in-process `Map`.
3. **Stroke compression** or delta encoding for large canvases.
4. **Rate limits** on `guess` and `draw_move` per socket.
5. **Dedicated game workers** separate from HTTP API.

### Render free tier

- Cold starts after idle (~30–60s wake).
- Not suitable for production SLA without paid tier.

---

## 14. Error Handling Strategy

### Server → client

```javascript
socket.emit('error', { message: 'Room not found' });
```

Frontend shows `error` on Home/Lobby; clears stale `sessionStorage` on failed rejoin.

### Connection errors

```typescript
// useGameSocket — connect_error
// Production: hints to check VITE_SERVER_URL and wake Render
```

### Validation guards (examples)

| Action | Guard |
|--------|-------|
| Draw | Must be drawer, phase `drawing`, `roundActive` |
| Guess | Not drawer, not already guessed, phase `drawing` |
| Start game | Host only, ≥ 2 players |
| Kick/ban | Host only |

### Idempotency

- `claimRoundEnd` / `_roundEndEmitted` prevent double round-end processing.
- Timer callbacks check `phase` before mutating state.

### MongoDB errors

- Caught in `GameHistoryService`; logged; gameplay continues.

### Client defensive rendering

- Strokes clamped to canvas bounds.
- `applyGameState` ignores `round_end` overwrites that would flash wrong UI.
- Canvas only clears on explicit `canvas_clear` / `round_start`, not timer ticks.

---

## Quick Reference — Canvas + Socket Contract

| Constant | Value |
|----------|-------|
| Logical width | 800 |
| Logical height | 500 |
| Stroke ID | `Date.now()` at draw_start |
| Clear event | `canvas_clear` only |

---

## Related Documentation

- [README.md](./README.md) — Setup, env vars, API table, deployment URLs  
- [backend/.env.example](./backend/.env.example)  
- [frontend/.env.example](./frontend/.env.example)  
