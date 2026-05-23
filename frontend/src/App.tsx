import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { LobbyPage } from './pages/LobbyPage';
import { GamePage } from './pages/GamePage';
import { useGameSocket, ACTIVE_ROOM_KEY, type GamePhase } from './hooks/useGameSocket';
import type { ChatMessage, DrawTool, Player, RoomSettings, Stroke } from './types';

export default function App() {
  const [searchParams] = useSearchParams();
  const [inviteRoomCode] = useState(() => searchParams.get('room'));
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<GamePhase>('home');
  const [myId, setMyId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [hostId, setHostId] = useState('');
  const [settings, setSettings] = useState<RoomSettings | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [wordOptions, setWordOptions] = useState<string[] | null>(null);
  const [currentWord, setCurrentWord] = useState<string | null>(null);
  const [hints, setHints] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [wordSelectTimeLeft, setWordSelectTimeLeft] = useState(0);
  const [round, setRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(0);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(6);
  const [activeTool, setActiveTool] = useState<DrawTool>('brush');
  const [leaderboard, setLeaderboard] = useState<Player[] | undefined>();
  const [winnerName, setWinnerName] = useState<string | undefined>();
  const [roundWasGuessed, setRoundWasGuessed] = useState(false);
  const [lastGuesserName, setLastGuesserName] = useState<string | null>(null);
  const [transitionSeconds, setTransitionSeconds] = useState(4);

  const pendingJoin = useRef<{ roomId: string; playerName: string; clientOrigin: string } | null>(null);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev.slice(-100), msg]);
  }, []);

  const handleExitedRoom = useCallback(() => setError(''), []);

  const socketSetters = useMemo(
    () => ({
      setConnected,
      setError,
      setPhase,
      setMyId,
      setRoomId,
      setRoomCode,
      setInviteLink,
      setHostId,
      setSettings,
      setPlayers,
      setDrawerId,
      setWordOptions,
      setCurrentWord,
      setHints,
      setTimeLeft,
      setWordSelectTimeLeft,
      setRound,
      setTotalRounds,
      setStrokes,
      setMessages,
      setActiveTool,
      setLeaderboard,
      setWinnerName,
      setRoundWasGuessed,
      setLastGuesserName,
      setTransitionSeconds,
    }),
    []
  );

  const socketRef = useGameSocket(
    {} as never,
    socketSetters,
    addMessage,
    searchParams.get('room'),
    pendingJoin,
    handleExitedRoom
  );

  const resetHome = useCallback(() => {
    sessionStorage.removeItem(ACTIVE_ROOM_KEY);
    setPhase('home');
    setRoomId('');
    setRoomCode('');
    setInviteLink('');
    setHostId('');
    setSettings(null);
    setPlayers([]);
    setMessages([]);
    setStrokes([]);
    setLeaderboard(undefined);
    setDrawerId(null);
    window.history.replaceState({}, '', '/');
  }, []);

  const leaveRoom = useCallback(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('leave_room');
    }
    resetHome();
  }, [resetHome]);

  const kickPlayer = useCallback((targetId: string) => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      setError('Not connected to server');
      return;
    }
    setError('');
    socket.emit('kick_player', { targetId });
  }, []);

  const banPlayer = useCallback((targetId: string) => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      setError('Not connected to server');
      return;
    }
    setError('');
    socket.emit('ban_player', { targetId });
  }, []);

  const clientOrigin = () =>
    `${window.location.origin}${window.location.pathname}`.replace(/\/$/, '');

  const createRoom = (name: string, roomSettings: RoomSettings) => {
    sessionStorage.setItem('playerName', name.trim());
    setError('');
    socketRef.current?.emit('create_room', {
      hostName: name,
      settings: roomSettings,
      clientOrigin: clientOrigin(),
    });
  };

  const joinRoom = (code: string, name: string) => {
    sessionStorage.setItem('playerName', name.trim());
    sessionStorage.setItem(ACTIVE_ROOM_KEY, code.toUpperCase());
    setError('');
    const payload = { roomId: code, playerName: name, clientOrigin: clientOrigin() };
    if (!socketRef.current?.connected) {
      pendingJoin.current = payload;
    } else {
      socketRef.current.emit('join_room', payload);
    }
    window.history.replaceState({}, '', `?room=${code}`);
  };

  const startGame = () => socketRef.current?.emit('start_game');
  const copyLink = () => navigator.clipboard.writeText(inviteLink || `${window.location.origin}?room=${roomId}`);
  const copyCode = () => navigator.clipboard.writeText(roomCode || roomId);
  const chooseWord = (word: string) => socketRef.current?.emit('word_chosen', { word });

  const handleStrokeStart = (stroke: Stroke) => {
    setStrokes((prev) => [...prev, stroke]);
    socketRef.current?.emit('draw_start', {
      x: stroke.points[0].x,
      y: stroke.points[0].y,
      color: stroke.color,
      size: stroke.size,
    });
  };

  const handleStrokeMove = (x: number, y: number, strokeId: number) => {
    setStrokes((prev) =>
      prev.map((s) => (s.id === strokeId ? { ...s, points: [...s.points, { x, y }] } : s))
    );
    socketRef.current?.emit('draw_move', { x, y });
  };

  const handleStrokeEnd = () => socketRef.current?.emit('draw_end');
  const handleUndo = () => socketRef.current?.emit('draw_undo');
  const handleClear = () => {
    setStrokes([]);
    socketRef.current?.emit('canvas_clear');
  };
  const handleGuess = (text: string) => socketRef.current?.emit('guess', { text });

  const isDrawer = myId === drawerId;
  const drawerName = players.find((p) => p.id === drawerId)?.name ?? 'Someone';
  const myPlayer = players.find((p) => p.id === myId);
  const chatDisabled =
    phase === 'ended' ||
    (phase === 'drawing' && (isDrawer || !!myPlayer?.hasGuessed)) ||
    phase === 'round_end' ||
    phase === 'word_select';

  const savedRoomId = sessionStorage.getItem(ACTIVE_ROOM_KEY);
  const savedName = sessionStorage.getItem('playerName');
  if (savedRoomId && savedName && phase === 'home' && connected) {
    return (
      <div className="app">
        <h1 className="title">Skribbl Clone</h1>
        <p className="subtitle">Reconnecting to your game...</p>
      </div>
    );
  }

  if (phase === 'home') {
    return (
      <HomePage
        connected={connected}
        error={error}
        initialRoomCode={inviteRoomCode}
        onCreate={createRoom}
        onJoin={joinRoom}
      />
    );
  }

  if (phase === 'lobby' && settings) {
    return (
      <LobbyPage
        roomId={roomId}
        roomCode={roomCode}
        inviteLink={inviteLink}
        hostId={hostId}
        myId={myId}
        players={players}
        settings={settings}
        error={error}
        onStart={startGame}
        onCopyLink={copyLink}
        onCopyCode={copyCode}
        onLeave={leaveRoom}
        onKick={kickPlayer}
        onBan={banPlayer}
      />
    );
  }

  return (
    <GamePage
      myId={myId}
      players={players}
      drawerId={drawerId}
      drawerName={drawerName}
      isDrawer={isDrawer}
      phase={phase}
      hints={hints}
      timeLeft={timeLeft}
      wordSelectTimeLeft={wordSelectTimeLeft}
      round={round}
      totalRounds={totalRounds}
      roundWasGuessed={roundWasGuessed}
      lastGuesserName={lastGuesserName}
      transitionSeconds={transitionSeconds}
      wordOptions={wordOptions}
      currentWord={currentWord}
      strokes={strokes}
      messages={messages}
      color={color}
      brushSize={brushSize}
      activeTool={activeTool}
      canDraw={phase === 'drawing' && isDrawer}
      chatDisabled={chatDisabled}
      onColorSelect={(c) => {
        setColor(c);
        setActiveTool('brush');
      }}
      onSizeChange={setBrushSize}
      onBrushSelect={() => setActiveTool('brush')}
      onEraserSelect={() => setActiveTool('eraser')}
      onUndo={handleUndo}
      onClear={handleClear}
      onWordChosen={chooseWord}
      onStrokeStart={handleStrokeStart}
      onStrokeMove={handleStrokeMove}
      onStrokeEnd={handleStrokeEnd}
      onGuess={handleGuess}
      roomCode={roomCode}
      leaderboard={leaderboard}
      winnerName={winnerName}
      onBackHome={resetHome}
      onLeaveRoom={leaveRoom}
    />
  );
}