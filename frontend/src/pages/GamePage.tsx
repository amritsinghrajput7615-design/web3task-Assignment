import { DrawingCanvas } from '../components/DrawingCanvas';
import { DrawingToolbar } from '../components/DrawingToolbar';
import { ChatPanel } from '../components/ChatPanel';
import type { ChatMessage, Player, Stroke } from '../types';

interface Props {
  myId: string;
  players: Player[];
  drawerId: string | null;
  drawerName: string;
  isDrawer: boolean;
  phase: string;
  hints: string;
  timeLeft: number;
  wordSelectTimeLeft: number;
  round: number;
  totalRounds: number;
  roundWasGuessed: boolean;
  wordOptions: string[] | null;
  currentWord: string | null;
  strokes: Stroke[];
  messages: ChatMessage[];
  color: string;
  brushSize: number;
  isEraser: boolean;
  canDraw: boolean;
  chatDisabled: boolean;
  onColorSelect: (c: string) => void;
  onSizeChange: (s: number) => void;
  onEraserSelect: () => void;
  onUndo: () => void;
  onClear: () => void;
  onWordChosen: (word: string) => void;
  onStrokeStart: (stroke: Stroke) => void;
  onStrokeMove: (x: number, y: number, strokeId: number) => void;
  onStrokeEnd: () => void;
  onGuess: (text: string) => void;
  roomCode?: string;
  leaderboard?: Player[];
  winnerName?: string;
  onBackHome: () => void;
}

export function GamePage({
  myId,
  players,
  drawerId,
  drawerName,
  isDrawer,
  phase,
  hints,
  timeLeft,
  wordSelectTimeLeft,
  round,
  totalRounds,
  roundWasGuessed,
  wordOptions,
  currentWord,
  strokes,
  messages,
  color,
  brushSize,
  isEraser,
  canDraw,
  chatDisabled,
  onColorSelect,
  onSizeChange,
  onEraserSelect,
  onUndo,
  onClear,
  onWordChosen,
  onStrokeStart,
  onStrokeMove,
  onStrokeEnd,
  onGuess,
  roomCode,
  leaderboard,
  winnerName,
  onBackHome,
}: Props) {
  if (phase === 'ended' && leaderboard) {
    return (
      <div className="app">
        <div className="card winner-banner">
          <h2>{winnerName ? `${winnerName} wins!` : 'Game Over'}</h2>
          <h3 style={{ marginBottom: '1rem', color: 'var(--muted)' }}>Leaderboard</h3>
          <ul className="scoreboard player-list">
            {leaderboard.map((p, i) => (
              <li key={p.id}>
                <span>#{i + 1} {p.name}</span>
                <span>{p.score} pts</span>
              </li>
            ))}
          </ul>
          <button type="button" style={{ marginTop: '1.5rem' }} onClick={onBackHome}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const sorted = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className="app">
      <div className="game-header">
        <div>
          {roomCode && (
            <span style={{ color: 'var(--warning)', fontWeight: 800, marginRight: 12 }}>
              Room: {roomCode}
            </span>
          )}
          <span style={{ color: 'var(--muted)' }}>Round {round}/{totalRounds}</span>
          {drawerId && phase === 'word_select' && (
            <p style={{ fontWeight: 700 }}>
              {isDrawer ? 'Choose a word!' : `${drawerName} is choosing a word...`}
            </p>
          )}
          {drawerId && phase === 'drawing' && (
            <p style={{ fontWeight: 700 }}>
              {isDrawer ? "You're drawing!" : `${drawerName} is drawing`}
            </p>
          )}
          {phase === 'round_end' && <p style={{ fontWeight: 700 }}>Round over — next drawer soon...</p>}
        </div>
        {isDrawer && currentWord && phase === 'drawing' && (
          <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--accent)' }}>{currentWord}</span>
        )}
        {!isDrawer && phase === 'drawing' && <span className="word-hint">{hints}</span>}
        {phase === 'word_select' && (
          <span className="timer word-select-timer">{wordSelectTimeLeft}s to choose</span>
        )}
        {phase === 'drawing' && <span className="timer">{timeLeft}s</span>}
      </div>

      <div className="game-layout">
        <div>
          <div style={{ position: 'relative' }}>
            <DrawingCanvas
              strokes={strokes}
              isDrawer={isDrawer}
              canDraw={canDraw}
              color={isEraser ? '#ffffff' : color}
              brushSize={brushSize}
              onStrokeStart={onStrokeStart}
              onStrokeMove={onStrokeMove}
              onStrokeEnd={onStrokeEnd}
            />
            {phase === 'word_select' && isDrawer && wordOptions && (
              <div className="word-select-overlay">
                <h3>Choose a word ({wordSelectTimeLeft}s)</h3>
                {wordOptions.map((w) => (
                  <button key={w} type="button" className="word-option" onClick={() => onWordChosen(w)}>
                    {w}
                  </button>
                ))}
              </div>
            )}
            {phase === 'round_end' && currentWord && (
              <div className={`word-select-overlay ${roundWasGuessed ? '' : 'round-missed'}`}>
                <h3>{roundWasGuessed ? 'Round over!' : "Time's up — nobody guessed!"}</h3>
                <p className="round-end-label">The word was:</p>
                <span className={roundWasGuessed ? 'word-reveal-normal' : 'word-reveal-missed'}>
                  {currentWord}
                </span>
              </div>
            )}
          </div>

          <DrawingToolbar
            color={color}
            brushSize={brushSize}
            isEraser={isEraser}
            canEdit={isDrawer && canDraw}
            onColorSelect={onColorSelect}
            onSizeChange={onSizeChange}
            onEraserSelect={onEraserSelect}
            onUndo={onUndo}
            onClear={onClear}
          />
        </div>

        <div>
          <div className="card" style={{ marginBottom: '0.75rem', padding: '0.75rem' }}>
            <h4 style={{ marginBottom: '0.5rem' }}>Scores</h4>
            <ul className="player-list">
              {sorted.map((p) => (
                <li key={p.id}>
                  <span>
                    {p.name}
                    {p.id === drawerId && ' ✏️'}
                    {p.hasGuessed && ' ✓'}
                  </span>
                  <span>{p.score}</span>
                </li>
              ))}
            </ul>
          </div>
          <ChatPanel
            messages={messages}
            disabled={chatDisabled}
            placeholder={isDrawer ? 'Chat (guessers only)' : 'Type your guess...'}
            myId={myId}
            onSend={onGuess}
          />
        </div>
      </div>
    </div>
  );
}
