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
  onStart: () => void;
  onCopyLink: () => void;
  onCopyCode: () => void;
}

export function LobbyPage({
  roomId,
  roomCode,
  inviteLink,
  hostId,
  myId,
  players,
  settings,
  onStart,
  onCopyLink,
  onCopyCode,
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
      <h1 className="title">Lobby</h1>
      <p className="subtitle">Share the room code or invite link with friends</p>

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
                <span>
                  {p.name}
                  {p.id === hostId && <span className="host-badge" style={{ marginLeft: 8 }}>HOST</span>}
                </span>
                <span>{p.score} pts</span>
              </li>
            ))}
          </ul>

          {isHost && (
            <div style={{ marginTop: '1.5rem' }}>
              <button type="button" onClick={onStart} disabled={players.length < 2}>
                Start Game
              </button>
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
        </div>
      </div>
    </div>
  );
}
