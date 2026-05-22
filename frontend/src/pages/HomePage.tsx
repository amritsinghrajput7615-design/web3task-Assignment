import { useEffect, useState } from 'react';
import type { RoomSettings } from '../types';

interface Props {
  connected: boolean;
  error: string;
  initialRoomCode?: string | null;
  onCreate: (name: string, settings: RoomSettings) => void;
  onJoin: (roomId: string, name: string) => void;
}

const defaultSettings: RoomSettings = {
  maxPlayers: 8,
  rounds: 3,
  drawTime: 80,
  wordCount: 3,
  hints: 2,
  wordMode: 'normal',
  isPrivate: false,
};

export function HomePage({ connected, error, initialRoomCode, onCreate, onJoin }: Props) {
  const [tab, setTab] = useState<'create' | 'join'>(initialRoomCode ? 'join' : 'create');
  const [name, setName] = useState(() => sessionStorage.getItem('playerName') ?? '');
  const [roomCode, setRoomCode] = useState(initialRoomCode?.toUpperCase() ?? '');
  const [settings, setSettings] = useState<RoomSettings>(defaultSettings);

  useEffect(() => {
    if (initialRoomCode) {
      setTab('join');
      setRoomCode(initialRoomCode.toUpperCase());
    }
  }, [initialRoomCode]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim(), settings);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !roomCode.trim()) return;
    onJoin(roomCode.trim().toUpperCase(), name.trim());
  };

  return (
    <div className="app">
      <h1 className="title">Skribbl Clone</h1>
      <p className="subtitle">Draw, guess, and score points with friends!</p>

      {!connected && <p className="error">Connecting to server...</p>}
      {error && <p className="error">{error}</p>}

      <div className="card" style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="tabs">
          <button type="button" className={`tab ${tab === 'create' ? 'active' : ''}`} onClick={() => setTab('create')}>
            Create Room
          </button>
          <button type="button" className={`tab ${tab === 'join' ? 'active' : ''}`} onClick={() => setTab('join')}>
            Join Room
          </button>
        </div>

        <label>Your name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter nickname" maxLength={20} />

        {tab === 'create' ? (
          <form onSubmit={handleCreate} className="form-grid" style={{ marginTop: '1rem' }}>
            <div className="form-row">
              <div>
                <label>Max players</label>
                <select
                  value={settings.maxPlayers}
                  onChange={(e) => setSettings({ ...settings, maxPlayers: Number(e.target.value) })}
                >
                  {Array.from({ length: 19 }, (_, i) => i + 2).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Rounds</label>
                <select
                  value={settings.rounds}
                  onChange={(e) => setSettings({ ...settings, rounds: Number(e.target.value) })}
                >
                  {Array.from({ length: 9 }, (_, i) => i + 2).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div>
                <label>Draw time (sec)</label>
                <select
                  value={settings.drawTime}
                  onChange={(e) => setSettings({ ...settings, drawTime: Number(e.target.value) })}
                >
                  {[30, 60, 80, 120, 180].map((n) => (
                    <option key={n} value={n}>{n}s</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Word choices</label>
                <select
                  value={settings.wordCount}
                  onChange={(e) => setSettings({ ...settings, wordCount: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label>Hints</label>
              <select
                value={settings.hints}
                onChange={(e) => setSettings({ ...settings, hints: Number(e.target.value) })}
              >
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n === 0 ? 'Disabled' : n}</option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={!connected || !name.trim()}>
              Create Room
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoin} className="form-grid" style={{ marginTop: '1rem' }}>
            <div>
              <label>Room code</label>
              <input
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="e.g. ABC123"
                maxLength={8}
              />
            </div>
            <button type="submit" disabled={!connected || !name.trim() || !roomCode.trim()}>
              Join Room
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
