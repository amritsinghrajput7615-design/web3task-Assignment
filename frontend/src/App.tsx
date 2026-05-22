import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { HomePage } from './pages/HomePage';
import { LobbyPage } from './pages/LobbyPage';
import { GamePage } from './pages/GamePage';
import type { ChatMessage, Player, RoomSettings, Stroke } from './types';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

type Phase = 'home' | 'lobby' | 'word_select' | 'drawing' | 'round_end' | 'ended';

export default function App() {
  const [searchParams] = useSearchParams();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<Phase>('home');
  const [myId, setMyId] = useState('');
  const [playerName, setPlayerName] = useState('');
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
  const [round, setRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(0);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(6);
  const [isEraser, setIsEraser] = useState(false);
  const [leaderboard, setLeaderboard] = useState<Player[] | undefined>();
  const [winnerName, setWinnerName] = useState<string | undefined>();
  const [roundWasGuessed, setRoundWasGuessed] = useState(true);
  const pendingJoin = useRef<{ roomId: string; playerName: string; clientOrigin: string } | null>(null);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev.slice(-100), msg]);
  }, []);

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setMyId(socket.id!);
      const code = searchParams.get('room');
      if (pendingJoin.current) {
        socket.emit('join_room', pendingJoin.current);
        pendingJoin.current = null;
      } else if (code) {
        const savedName = sessionStorage.getItem('playerName');
        if (savedName) {
          socket.emit('join_room', {
            roomId: code.toUpperCase(),
            playerName: savedName,
            clientOrigin: clientOrigin(),
          });
        }
      }
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('error', ({ message }: { message: string }) => setError(message));

    const applyRoomData = (data: {
      roomId: string;
      roomCode?: string;
      inviteLink?: string;
      hostId: string;
      settings: RoomSettings;
      players: Player[];
    }) => {
      setError('');
      setRoomId(data.roomId);
      setRoomCode(data.roomCode || data.roomId);
      setInviteLink(data.inviteLink || `${window.location.origin}${window.location.pathname}?room=${data.roomId}`);
      setHostId(data.hostId);
      setSettings(data.settings);
      setPlayers(data.players);
      setPhase('lobby');
      window.history.replaceState({}, '', `?room=${data.roomId}`);
    };

    socket.on('room_created', applyRoomData);
    socket.on('room_joined', applyRoomData);

    socket.on('player_joined', ({ players: p }: { players: Player[] }) => {
      setPlayers(p);
    });

    socket.on('player_left', ({ players: p, playerName: leftName }: { players: Player[]; playerName?: string }) => {
      setPlayers(p);
      if (leftName) {
        addMessage({ playerId: '', playerName: '', text: `${leftName} left the room`, isGuess: false, system: true });
      }
    });

    socket.on('round_start', (data) => {
      setPhase('word_select');
      setDrawerId(data.drawerId);
      setRound(data.round);
      setTotalRounds(data.totalRounds);
      setTimeLeft(data.drawTime);
      setStrokes([]);
      setCurrentWord(null);
      setWordOptions(data.wordOptions ?? null);
      setHints(data.hints ?? '');
      if (data.isDrawer && data.wordOptions) {
        addMessage({ playerId: '', playerName: '', text: 'Choose a word to draw!', isGuess: false, system: true });
      } else {
        addMessage({
          playerId: '',
          playerName: '',
          text: `${data.drawerName} is drawing...`,
          isGuess: false,
          system: true,
        });
      }
    });

    socket.on('word_chosen_ack', ({ word }: { word: string }) => {
      setCurrentWord(word);
      setPhase('drawing');
    });

    socket.on('game_state', (data: { phase?: string; hints?: string; timeLeft?: number; players?: Player[] }) => {
      if (data.phase) setPhase(data.phase as Phase);
      if (data.hints !== undefined) setHints(data.hints);
      if (data.timeLeft !== undefined) setTimeLeft(data.timeLeft);
      if (data.players) setPlayers(data.players);
      if (data.phase === 'drawing') {
        setStrokes([]);
      }
    });

    socket.on('timer', ({ timeLeft: t }: { timeLeft: number }) => setTimeLeft(t));

    socket.on('draw_data', (stroke: Stroke) => {
      setStrokes((prev) => [...prev, stroke]);
    });

    socket.on('draw_move', ({ x, y, strokeId }: { x: number; y: number; strokeId: number }) => {
      setStrokes((prev) => {
        const copy = [...prev];
        const stroke = copy.find((s) => s.id === strokeId);
        if (stroke) stroke.points.push({ x, y });
        return copy;
      });
    });

    socket.on('canvas_clear', () => setStrokes([]));

    socket.on('draw_undo', ({ strokes: s }: { strokes?: Stroke[] }) => {
      if (s) setStrokes(s);
      else setStrokes((prev) => prev.slice(0, -1));
    });

    socket.on('guess_result', (data: { correct: boolean; playerId: string; points: number; word?: string }) => {
      if (data.correct && data.word) setCurrentWord(data.word);
    });

    socket.on('chat_message', (msg: ChatMessage) => addMessage(msg));

    socket.on('round_end', (data: { word: string; wasGuessed: boolean; scores: Player[] }) => {
      setPhase('round_end');
      setCurrentWord(data.word);
      setRoundWasGuessed(data.wasGuessed);
      setPlayers(data.scores);

      if (data.word) {
        if (data.wasGuessed) {
          addMessage({
            playerId: '',
            playerName: '',
            text: `Round over! The word was "${data.word}"`,
            isGuess: false,
            system: true,
          });
        } else {
          addMessage({
            playerId: '',
            playerName: '',
            text: "Time's up! Nobody guessed the word:",
            isGuess: false,
            system: true,
            wordMissed: true,
            revealedWord: data.word,
          });
        }
      }
    });

    socket.on('game_over', (data: { winner: Player | null; leaderboard: Player[] }) => {
      setPhase('ended');
      setLeaderboard(data.leaderboard);
      setPlayers(data.leaderboard);
      setWinnerName(data.winner?.name);
    });

    return () => {
      socket.disconnect();
    };
  }, [addMessage, searchParams]);

  const clientOrigin = () => `${window.location.origin}${window.location.pathname}`.replace(/\/$/, '');

  const createRoom = (name: string, roomSettings: RoomSettings) => {
    sessionStorage.setItem('playerName', name);
    setPlayerName(name);
    setError('');
    socketRef.current?.emit('create_room', {
      hostName: name,
      settings: roomSettings,
      clientOrigin: clientOrigin(),
    });
  };

  const joinRoom = (code: string, name: string) => {
    sessionStorage.setItem('playerName', name);
    setPlayerName(name);
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

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink || `${window.location.origin}?room=${roomId}`);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode || roomId);
  };

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
    setStrokes((prev) => {
      const copy = prev.map((s) => (s.id === strokeId ? { ...s, points: [...s.points, { x, y }] } : s));
      return copy;
    });
    socketRef.current?.emit('draw_move', { x, y });
  };

  const handleStrokeEnd = () => socketRef.current?.emit('draw_end');

  const handleUndo = () => socketRef.current?.emit('draw_undo');
  const handleClear = () => {
    setStrokes([]);
    socketRef.current?.emit('canvas_clear');
  };

  const handleGuess = (text: string) => socketRef.current?.emit('guess', { text });

  const resetHome = () => {
    setPhase('home');
    setRoomId('');
    setRoomCode('');
    setInviteLink('');
    setPlayers([]);
    setMessages([]);
    setStrokes([]);
    setLeaderboard(undefined);
    window.history.replaceState({}, '', '/');
  };

  const isDrawer = myId === drawerId;
  const drawerName = players.find((p) => p.id === drawerId)?.name ?? 'Someone';
  const myPlayer = players.find((p) => p.id === myId);
  const chatDisabled =
    phase === 'ended' ||
    (phase === 'drawing' && (isDrawer || !!myPlayer?.hasGuessed)) ||
    phase === 'round_end' ||
    phase === 'word_select';

  if (phase === 'home') {
    return <HomePage connected={connected} error={error} onCreate={createRoom} onJoin={joinRoom} />;
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
        onStart={startGame}
        onCopyLink={copyLink}
        onCopyCode={copyCode}
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
      round={round}
      totalRounds={totalRounds}
      roundWasGuessed={roundWasGuessed}
      wordOptions={wordOptions}
      currentWord={currentWord}
      strokes={strokes}
      messages={messages}
      color={color}
      brushSize={brushSize}
      isEraser={isEraser}
      canDraw={phase === 'drawing'}
      chatDisabled={chatDisabled}
      onColorChange={setColor}
      onSizeChange={setBrushSize}
      onEraserToggle={() => setIsEraser((e) => !e)}
      onUndo={handleUndo}
      onClear={handleClear}
      onWordChosen={chooseWord}
      onStrokeStart={handleStrokeStart}
      onStrokeMove={handleStrokeMove}
      onStrokeEnd={handleStrokeEnd}
      onGuess={handleGuess}
      myId={myId}
      roomCode={roomCode}
      leaderboard={leaderboard}
      winnerName={winnerName}
      onBackHome={resetHome}
    />
  );
}
