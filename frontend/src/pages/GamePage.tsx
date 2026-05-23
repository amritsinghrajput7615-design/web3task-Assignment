import { DrawingCanvas } from '../components/DrawingCanvas';
import { DrawingToolbar } from '../components/DrawingToolbar';
import { ChatPanel } from '../components/ChatPanel';
import type { ChatMessage, DrawTool, Player, Stroke } from '../types';

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
  lastGuesserName: string | null;
  transitionSeconds: number;
  wordOptions: string[] | null;
  currentWord: string | null;
  strokes: Stroke[];
  messages: ChatMessage[];
  color: string;
  brushSize: number;
  activeTool: DrawTool;
  canDraw: boolean;
  chatDisabled: boolean;
  onColorSelect: (c: string) => void;
  onSizeChange: (s: number) => void;
  onBrushSelect: () => void;
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
  onLeaveRoom?: () => void;
}

function statusText(
  phase: string,
  isDrawer: boolean,
  drawerName: string,
  roundWasGuessed: boolean,
  lastGuesserName: string | null
): string {
  if (phase === 'word_select') {
    return isDrawer ? 'Choose a word!' : `${drawerName} is choosing a word…`;
  }
  if (phase === 'drawing') {
    return isDrawer ? "You're drawing!" : `${drawerName} is drawing`;
  }
  if (phase === 'round_end') {
    return roundWasGuessed
      ? `${lastGuesserName ?? 'Someone'} guessed it!`
      : 'Round over — next drawer soon…';
  }
  return '';
}

function logTitleFromMessages(messages: ChatMessage[], phase: string, wordSelectTimeLeft: number): string {
  const lastSystem = [...messages].reverse().find((m) => m.system);
  if (lastSystem?.text) return lastSystem.text;
  if (phase === 'word_select') return `Choose a word to draw! (${wordSelectTimeLeft}s)`;
  if (phase === 'drawing') return 'Round in progress…';
  if (phase === 'round_end') return 'Round ended';
  return 'Game log';
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
  lastGuesserName,
  transitionSeconds,
  wordOptions,
  currentWord,
  strokes,
  messages,
  color,
  brushSize,
  activeTool,
  canDraw,
  chatDisabled,
  onColorSelect,
  onSizeChange,
  onBrushSelect,
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
  onLeaveRoom,
}: Props) {
  const strokeColor = activeTool === 'eraser' ? '#ffffff' : color;
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const status = statusText(phase, isDrawer, drawerName, roundWasGuessed, lastGuesserName);
  const logTitle = logTitleFromMessages(messages, phase, wordSelectTimeLeft);

  const chatPanel = (
    <ChatPanel
      messages={messages}
      disabled={chatDisabled}
      placeholder={isDrawer ? 'Chat (guessers only)' : 'Type your guess…'}
      myId={myId}
      onSend={onGuess}
      logTitle={logTitle}
    />
  );

  if (phase === 'ended' && leaderboard) {
    return (
      <div className="game-page game-page--ended">
        <div className="game-ended-card">
          <h2 className="game-ended-title">
            {winnerName ? `🏆 ${winnerName} wins!` : 'Game Over'}
          </h2>
          <p className="game-ended-sub">Leaderboard</p>
          <ul className="game-ended-list">
            {leaderboard.map((p, i) => (
              <li key={p.id} className={i === 0 ? 'game-ended-row game-ended-row--first' : 'game-ended-row'}>
                <span>#{i + 1} {p.name}</span>
                <span className="tabular-nums">{p.score} pts</span>
              </li>
            ))}
          </ul>
          <button type="button" className="game-word-btn game-word-btn--full" onClick={onBackHome}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="game-page">
      <div className="game-shell">
        <header className="game-header">
          <div className="game-header-main">
            <div className="game-header-top">
              {roomCode && (
                <span className="game-room-code">
                  Room: <strong>{roomCode}</strong>
                </span>
              )}
              <span className="game-round-badge">
                Round {round}/{totalRounds}
              </span>
            </div>
            {status && <p className="game-header-status">{status}</p>}
          </div>

          <div className="game-header-right">
            {isDrawer && currentWord && phase === 'drawing' && (
              <span className="game-drawer-word">{currentWord}</span>
            )}
            {!isDrawer && phase === 'drawing' && (
              <span className="game-hint-letters">{hints}</span>
            )}
            {phase === 'word_select' && (
              <span className="game-timer game-timer--select">
                <strong>{wordSelectTimeLeft}s</strong> to choose
              </span>
            )}
            {phase === 'drawing' && (
              <span className={`game-timer ${timeLeft <= 10 ? 'game-timer--urgent' : ''}`}>
                <strong>{timeLeft}s</strong>
              </span>
            )}
            {onLeaveRoom && (
              <button type="button" className="game-leave-btn" onClick={onLeaveRoom}>
                LEAVE
              </button>
            )}
          </div>
        </header>

        <div className="game-body">
          <div className="game-mobile-scores">
            <h3 className="game-panel-title">
              <span className="game-panel-icon" aria-hidden>▮</span>
              Scores
            </h3>
            <div className="game-mobile-scores-scroll scrollbar-hide">
              {sorted.map((p) => (
                <div
                  key={p.id}
                  className={`game-score-chip ${p.id === myId ? 'game-score-chip--me' : ''}`}
                >
                  <span className="game-score-name">
                    {p.name}
                    {p.id === drawerId && phase !== 'round_end' && (
                      <span className="game-drawer-pencil" title="Drawing">✎</span>
                    )}
                    {p.hasGuessed && <span className="game-guessed-mark">✓</span>}
                  </span>
                  <span className="game-score-pts">{p.score}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="game-main">
            <div className="game-canvas-area">
              <DrawingCanvas
                strokes={strokes}
                isDrawer={isDrawer}
                canDraw={canDraw}
                color={strokeColor}
                brushSize={brushSize}
                onStrokeStart={onStrokeStart}
                onStrokeMove={onStrokeMove}
                onStrokeEnd={onStrokeEnd}
              />

              {phase === 'word_select' && isDrawer && wordOptions && (
                <div className="word-select-overlay">
                  <h3 className="word-select-title">
                    Choose a word ({wordSelectTimeLeft}s)
                  </h3>
                  <div className="word-select-options">
                    {wordOptions.map((w) => (
                      <button
                        key={w}
                        type="button"
                        className="game-word-btn"
                        onClick={() => onWordChosen(w)}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {phase === 'round_end' && currentWord && (
                <div
                  className={`word-select-overlay round-end-overlay ${
                    roundWasGuessed ? 'round-guessed' : 'round-missed'
                  }`}
                >
                  <h3 className="round-end-heading">
                    {roundWasGuessed
                      ? `${lastGuesserName ?? 'Someone'} guessed correctly!`
                      : "Time's up — nobody guessed!"}
                  </h3>
                  <p className="round-end-label">The word was</p>
                  <span className={roundWasGuessed ? 'word-reveal-guessed' : 'word-reveal-missed'}>
                    {currentWord}
                  </span>
                  <p className="transition-countdown">
                    Next drawer in {transitionSeconds}s…
                  </p>
                </div>
              )}
            </div>

            <div className="game-toolbar-wrap">
              <DrawingToolbar
                color={color}
                brushSize={brushSize}
                activeTool={activeTool}
                canEdit={isDrawer && canDraw}
                onColorSelect={onColorSelect}
                onSizeChange={onSizeChange}
                onBrushSelect={onBrushSelect}
                onEraserSelect={onEraserSelect}
                onUndo={onUndo}
                onClear={onClear}
              />
            </div>
          </div>

          <aside className="game-sidebar">
            <section className="game-scores-panel">
              <h3 className="game-panel-title">
                <span className="game-panel-icon" aria-hidden>▮</span>
                Scores
              </h3>
              <ul className="game-score-list">
                {sorted.map((p) => (
                  <li
                    key={p.id}
                    className={`game-score-row ${p.id === myId ? 'game-score-row--me' : ''}`}
                  >
                    <span className="game-score-name">
                      {p.name}
                      {p.id === drawerId && phase !== 'round_end' && (
                        <span className="game-drawer-pencil" title="Drawing">✎</span>
                      )}
                      {p.hasGuessed && <span className="game-guessed-mark">✓</span>}
                    </span>
                    <span className="game-score-pts">{p.score}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="game-log-panel">{chatPanel}</section>
          </aside>
        </div>
      </div>
    </div>
  );
}
