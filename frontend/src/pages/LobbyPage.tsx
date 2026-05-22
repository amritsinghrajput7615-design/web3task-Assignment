import { useState } from 'react';
import type { Player, RoomSettings } from '../types';

interface Props {
  roomId: string;
  roomCode: string;
  inviteLink: string;
  hostId: string;
  myId: string;
  players: Player[];
  settings: RoomSettings;
  error?: string;
  onStart: () => void;
  onCopyLink: () => void;
  onCopyCode: () => void;
  onLeave: () => void;
  onKick: (playerId: string) => void;
  onBan: (playerId: string) => void;
}

export function LobbyPage({
  roomId,
  roomCode,
  inviteLink,
  hostId,
  myId,
  players,
  settings,
  error,
  onStart,
  onCopyLink,
  onCopyCode,
  onLeave,
  onKick,
  onBan,
}: Props) {
  const isHost = hostId === myId;
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  const handleCopy = (type: 'code' | 'link', fn: () => void) => {
    fn();
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="app">
      <div className="lobby-top-bar">
        <h1 className="title">Lobby</h1>
        <button type="button" className="btn-leave-room" onClick={onLeave}>
          Leave Room
        </button>
      </div>
      <p className="subtitle">Share the room code or invite link with friends</p>
      {error && <p className="error">{error}</p>}

      <div className="invite-card card">
        <div className="invite-block">
          <label>Room Code</label>
          <div className="invite-value-row">
            <span className="room-code-display">{roomCode || roomId}</span>
            <button type="button" className="tool-btn" onClick={() => handleCopy('code', onCopyCode)}>
              {copied === 'code' ? 'Copied!' : 'Copy Code'}
            </button>
          </div>
        </div>
        <div className="invite-block">
          <label>Invite Link</label>
          <div className="invite-value-row">
            <input className="invite-link-input" readOnly value={inviteLink} onFocus={(e) => e.target.select()} />
            <button type="button" className="tool-btn" onClick={() => handleCopy('link', onCopyLink)}>
              {copied === 'link' ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
        </div>
      </div>

      <div className="lobby-layout" style={{ marginTop: '1.5rem' }}>
        <div className="card">
          <h2 style={{ marginBottom: '1rem' }}>Players ({players.length}/{settings.maxPlayers})</h2>
          <ul className="player-list">
            {players.map((p) => (
              <li key={p.id}>
                <span className="player-list-name">
                  {p.name}
                  {p.id === hostId && <span className="host-badge">HOST</span>}
                </span>
                <span className="player-list-actions">
                  <span className="player-score">{p.score} pts</span>
                  {isHost && p.id !== myId && (
                    <span className="mod-actions">
                      <button
                        type="button"
                        className="btn-mod btn-kick"
                        title={`Kick ${p.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onKick(p.id);
                        }}
                      >
                        Kick
                      </button>
                      <button
                        type="button"
                        className="btn-mod btn-ban"
                        title={`Ban ${p.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onBan(p.id);
                        }}
                      >
                        Ban
                      </button>
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {isHost && (
            <div style={{ marginTop: '1.5rem' }}>
              <button type="button" onClick={onStart} disabled={players.length < 2}>
                Start Game
              </button>
              {players.length < 2 && (
                <p style={{ marginTop: '0.5rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
                  Need at least 2 players to start
                </p>
              )}
            </div>
          )}
          {!isHost && <p style={{ marginTop: '1rem', color: 'var(--muted)' }}>Waiting for host to start...</p>}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '0.75rem' }}>Settings</h3>
          <ul style={{ listStyle: 'none', lineHeight: 1.8, color: 'var(--muted)' }}>
            <li>Rounds: {settings.rounds}</li>
            <li>Draw time: {settings.drawTime}s</li>
            <li>Word choices: {settings.wordCount}</li>
            <li>Hints: {settings.hints === 0 ? 'Off' : settings.hints}</li>
          </ul>
          {isHost && (
            <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
              As host, you can kick or ban players from the list.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
