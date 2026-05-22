import type { Player, RoomSettings } from '../types';

interface Props {
  roomId: string;
  hostId: string;
  myId: string;
  players: Player[];
  settings: RoomSettings;
  onStart: () => void;
  onCopyLink: () => void;
}

export function LobbyPage({ roomId, hostId, myId, players, settings, onStart, onCopyLink }: Props) {
  const isHost = hostId === myId;

  return (
    <div className="app">
      <h1 className="title">Lobby</h1>
      <p className="subtitle">
        Room <strong>{roomId}</strong> — share the code with friends
      </p>

      <div className="lobby-layout">
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
            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={onStart} disabled={players.length < 2}>
                Start Game
              </button>
              <button type="button" className="tool-btn" onClick={onCopyLink}>
                Copy Invite Link
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
