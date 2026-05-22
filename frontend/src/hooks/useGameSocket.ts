import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ChatMessage, DrawTool, Player, RoomSettings, Stroke } from '../types';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

export type GamePhase = 'home' | 'lobby' | 'word_select' | 'drawing' | 'round_end' | 'ended';

export interface GameSocketState {
  connected: boolean;
  error: string;
  phase: GamePhase;
  myId: string;
  roomId: string;
  roomCode: string;
  inviteLink: string;
  hostId: string;
  settings: RoomSettings | null;
  players: Player[];
  drawerId: string | null;
  wordOptions: string[] | null;
  currentWord: string | null;
  hints: string;
  timeLeft: number;
  wordSelectTimeLeft: number;
  round: number;
  totalRounds: number;
  strokes: Stroke[];
  messages: ChatMessage[];
  color: string;
  brushSize: number;
  activeTool: DrawTool;
  leaderboard?: Player[];
  winnerName?: string;
  roundWasGuessed: boolean;
  lastGuesserName: string | null;
  transitionSeconds: number;
}

type Setters = {
  [K in keyof GameSocketState]: React.Dispatch<React.SetStateAction<GameSocketState[K]>>;
};

export function useGameSocket(
  _state: GameSocketState,
  setters: Partial<{
    setConnected: (v: boolean) => void;
    setError: (v: string) => void;
    setPhase: (v: GamePhase) => void;
    setMyId: (v: string) => void;
    setRoomId: (v: string) => void;
    setRoomCode: (v: string) => void;
    setInviteLink: (v: string) => void;
    setHostId: (v: string) => void;
    setSettings: (v: RoomSettings | null) => void;
    setPlayers: (v: Player[]) => void;
    setDrawerId: (v: string | null) => void;
    setWordOptions: (v: string[] | null) => void;
    setCurrentWord: (v: string | null) => void;
    setHints: (v: string) => void;
    setTimeLeft: (v: number) => void;
    setWordSelectTimeLeft: (v: number) => void;
    setRound: (v: number) => void;
    setTotalRounds: (v: number) => void;
    setStrokes: React.Dispatch<React.SetStateAction<Stroke[]>>;
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    setActiveTool: (v: DrawTool) => void;
    setLeaderboard: (v: Player[] | undefined) => void;
    setWinnerName: (v: string | undefined) => void;
    setRoundWasGuessed: (v: boolean) => void;
    setLastGuesserName: (v: string | null) => void;
    setTransitionSeconds: (v: number) => void;
  }>,
  addMessage: (msg: ChatMessage) => void,
  roomCodeFromUrl: string | null,
  pendingJoin: React.MutableRefObject<{ roomId: string; playerName: string; clientOrigin: string } | null>
) {
  const socketRef = useRef<Socket | null>(null);

  const clientOrigin = () =>
    `${window.location.origin}${window.location.pathname}`.replace(/\/$/, '');

  const applyGameState = (data: Record<string, unknown>) => {
    if (data.phase) setters.setPhase?.(data.phase as GamePhase);
    if (data.hints !== undefined) setters.setHints?.(data.hints as string);
    if (data.timeLeft !== undefined) setters.setTimeLeft?.(data.timeLeft as number);
    if (data.wordSelectTimeLeft !== undefined) {
      setters.setWordSelectTimeLeft?.(data.wordSelectTimeLeft as number);
    }
    if (data.drawerId !== undefined) setters.setDrawerId?.(data.drawerId as string);
    if (data.round !== undefined) setters.setRound?.(data.round as number);
    if (data.totalRounds !== undefined) setters.setTotalRounds?.(data.totalRounds as number);
    if (data.players) setters.setPlayers?.(data.players as Player[]);
    if (data.wordChoices) setters.setWordOptions?.(data.wordChoices as string[]);
    if (data.phase === 'drawing') setters.setStrokes?.([]);
    if (data.phase === 'round_end' || data.phase === 'word_select') {
      setters.setTimeLeft?.(0);
    }
  };

  const onRoundEnd = (data: {
    word: string;
    wasGuessed: boolean;
    guesserName?: string;
    transitionSeconds?: number;
    scores: Player[];
  }) => {
    setters.setPhase?.('round_end');
    setters.setCurrentWord?.(data.word);
    setters.setRoundWasGuessed?.(data.wasGuessed);
    setters.setPlayers?.(data.scores);
    setters.setTimeLeft?.(0);
    setters.setWordSelectTimeLeft?.(0);
    if (data.guesserName) setters.setLastGuesserName?.(data.guesserName);
    if (data.transitionSeconds) setters.setTransitionSeconds?.(data.transitionSeconds);

    if (data.word) {
      if (data.wasGuessed && data.guesserName) {
        addMessage({
          playerId: '',
          playerName: '',
          text: `${data.guesserName} guessed correctly! The word was "${data.word}"`,
          isGuess: false,
          system: true,
        });
      } else if (!data.wasGuessed) {
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
  };

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setters.setConnected?.(true);
      setters.setMyId?.(socket.id!);
      if (pendingJoin.current) {
        socket.emit('join_room', pendingJoin.current);
        pendingJoin.current = null;
      } else if (roomCodeFromUrl) {
        const savedName = sessionStorage.getItem('playerName');
        if (savedName) {
          socket.emit('join_room', {
            roomId: roomCodeFromUrl.toUpperCase(),
            playerName: savedName,
            clientOrigin: clientOrigin(),
          });
        }
      }
    });

    socket.on('disconnect', () => setters.setConnected?.(false));
    socket.on('error', ({ message }: { message: string }) => setters.setError?.(message));

    const applyRoom = (data: {
      roomId: string;
      roomCode?: string;
      inviteLink?: string;
      hostId: string;
      settings: RoomSettings;
      players: Player[];
    }) => {
      setters.setError?.('');
      setters.setRoomId?.(data.roomId);
      setters.setRoomCode?.(data.roomCode || data.roomId);
      setters.setInviteLink?.(
        data.inviteLink ||
          `${window.location.origin}${window.location.pathname}?room=${data.roomId}`
      );
      setters.setHostId?.(data.hostId);
      setters.setSettings?.(data.settings);
      setters.setPlayers?.(data.players);
      setters.setPhase?.('lobby');
      window.history.replaceState({}, '', `?room=${data.roomId}`);
    };

    socket.on('room_created', applyRoom);
    socket.on('room_joined', applyRoom);
    socket.on('player_joined', ({ players: p }: { players: Player[] }) => setters.setPlayers?.(p));
    socket.on('player_left', ({ players: p, playerName: leftName }: { players: Player[]; playerName?: string }) => {
      setters.setPlayers?.(p);
      if (leftName) {
        addMessage({ playerId: '', playerName: '', text: `${leftName} left the room`, isGuess: false, system: true });
      }
    });

    const onTurnStart = (data: {
      drawerId: string;
      drawerName: string;
      round: number;
      totalRounds: number;
      drawTime: number;
      wordSelectTimeLeft?: number;
      wordOptions?: string[] | null;
      wordChoices?: string[] | null;
      isDrawer?: boolean;
      hints?: string;
    }) => {
      setters.setPhase?.('word_select');
      setters.setDrawerId?.(data.drawerId);
      setters.setRound?.(data.round);
      setters.setTotalRounds?.(data.totalRounds);
      setters.setTimeLeft?.(data.drawTime);
      setters.setWordSelectTimeLeft?.(data.wordSelectTimeLeft ?? 10);
      setters.setStrokes?.([]);
      setters.setCurrentWord?.(null);
      setters.setWordOptions?.(data.wordOptions ?? data.wordChoices ?? null);
      setters.setHints?.(data.hints ?? '');
      setters.setActiveTool?.('brush');
      setters.setLastGuesserName?.(null);

      if (data.isDrawer && (data.wordOptions || data.wordChoices)) {
        addMessage({
          playerId: '',
          playerName: '',
          text: `Choose a word to draw! (${data.wordSelectTimeLeft ?? 10}s)`,
          isGuess: false,
          system: true,
        });
      } else {
        addMessage({
          playerId: '',
          playerName: '',
          text: `${data.drawerName} is choosing a word...`,
          isGuess: false,
          system: true,
        });
      }
    };

    socket.on('round_start', onTurnStart);

    const onWordSelectTimer = (data: { timeLeft: number }) => {
      setters.setWordSelectTimeLeft?.(data.timeLeft);
    };
    socket.on('word_select_timer', onWordSelectTimer);
    socket.on('timer_update', (data: { timeLeft?: number; wordSelectTimeLeft?: number; phase?: string }) => {
      if (data.phase === 'word_select' || data.wordSelectTimeLeft !== undefined) {
        setters.setWordSelectTimeLeft?.(data.wordSelectTimeLeft ?? data.timeLeft ?? 0);
      }
      if (data.phase === 'drawing' || (data.timeLeft !== undefined && data.phase !== 'word_select')) {
        setters.setTimeLeft?.(data.timeLeft ?? 0);
      }
    });

    socket.on('word_select_timeout', ({ message }: { message: string }) => {
      addMessage({ playerId: '', playerName: '', text: message, isGuess: false, system: true });
    });

    const onWordChosen = ({ word }: { word: string }) => {
      setters.setCurrentWord?.(word);
      setters.setPhase?.('drawing');
      setters.setActiveTool?.('brush');
    };
    socket.on('word_chosen_ack', onWordChosen);
    socket.on('word_selected', onWordChosen);

    socket.on('game_state', applyGameState);

    socket.on('timer', ({ timeLeft: t }: { timeLeft: number }) => setters.setTimeLeft?.(t));

    const onCorrectGuess = (data: { guesserName?: string; word?: string; wasGuessed?: boolean }) => {
      setters.setPhase?.('round_end');
      setters.setRoundWasGuessed?.(data.wasGuessed ?? true);
      setters.setTimeLeft?.(0);
      setters.setWordSelectTimeLeft?.(0);
      if (data.word) setters.setCurrentWord?.(data.word);
      if (data.guesserName) setters.setLastGuesserName?.(data.guesserName);
    };
    socket.on('round_guessed', onCorrectGuess);
    socket.on('correct_guess', onCorrectGuess);

    socket.on('draw_data', (stroke: Stroke) => {
      setters.setStrokes?.((prev) => [...prev, stroke]);
    });
    socket.on('draw_move', ({ x, y, strokeId }: { x: number; y: number; strokeId: number }) => {
      setters.setStrokes?.((prev) => {
        const copy = [...prev];
        const stroke = copy.find((s) => s.id === strokeId);
        if (stroke) stroke.points.push({ x, y });
        return copy;
      });
    });
    socket.on('canvas_clear', () => setters.setStrokes?.([]));
    socket.on('draw_undo', ({ strokes: s }: { strokes?: Stroke[] }) => {
      if (s) setters.setStrokes?.(s);
      else setters.setStrokes?.((prev) => prev.slice(0, -1));
    });

    socket.on('guess_result', (data: { correct: boolean; word?: string }) => {
      if (data.correct && data.word) setters.setCurrentWord?.(data.word);
    });

    socket.on('chat_message', (msg: ChatMessage) => addMessage(msg));

    socket.on('round_end', onRoundEnd);

    socket.on('game_over', (data: { winner: Player | null; leaderboard: Player[] }) => {
      setters.setPhase?.('ended');
      setters.setLeaderboard?.(data.leaderboard);
      setters.setPlayers?.(data.leaderboard);
      setters.setWinnerName?.(data.winner?.name);
    });

    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- socket handlers use stable setters
  }, [addMessage, roomCodeFromUrl]);

  return socketRef;
}
