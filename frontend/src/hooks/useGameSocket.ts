import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ChatMessage, DrawTool, Player, RoomSettings, Stroke } from '../types';

/** Empty = same origin; Vite proxies /socket.io → backend in dev */
const SERVER_URL = import.meta.env.VITE_SERVER_URL || undefined;

export const ACTIVE_ROOM_KEY = 'activeRoomId';

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
  pendingJoin: React.MutableRefObject<{ roomId: string; playerName: string; clientOrigin: string } | null>,
  onExitedRoom?: (message?: string) => void
) {
  const socketRef = useRef<Socket | null>(null);
  const settersRef = useRef(setters);
  const addMessageRef = useRef(addMessage);
  const onExitedRoomRef = useRef(onExitedRoom);
  const roomCodeRef = useRef(roomCodeFromUrl);

  settersRef.current = setters;
  addMessageRef.current = addMessage;
  onExitedRoomRef.current = onExitedRoom;
  roomCodeRef.current = roomCodeFromUrl;

  const clientOrigin = () =>
    `${window.location.origin}${window.location.pathname}`.replace(/\/$/, '');

  const applyGameState = (data: Record<string, unknown>) => {
    if (data.phase === 'round_end') return;

    const st = settersRef.current;
    if (data.phase) st.setPhase?.(data.phase as GamePhase);
    if (data.hints !== undefined) st.setHints?.(data.hints as string);
    if (data.timeLeft !== undefined) st.setTimeLeft?.(data.timeLeft as number);
    if (data.wordSelectTimeLeft !== undefined) {
      st.setWordSelectTimeLeft?.(data.wordSelectTimeLeft as number);
    }
    if (data.drawerId !== undefined) st.setDrawerId?.(data.drawerId as string);
    if (data.round !== undefined) st.setRound?.(data.round as number);
    if (data.totalRounds !== undefined) st.setTotalRounds?.(data.totalRounds as number);
    if (data.players) st.setPlayers?.(data.players as Player[]);
    if (data.wordChoices) st.setWordOptions?.(data.wordChoices as string[]);
    if (data.phase === 'drawing') {
      st.setStrokes?.([]);
      if (data.timeLeft !== undefined) st.setTimeLeft?.(data.timeLeft as number);
    }
    if (data.phase === 'word_select') {
      st.setTimeLeft?.(0);
      if (data.wordSelectTimeLeft !== undefined) {
        st.setWordSelectTimeLeft?.(data.wordSelectTimeLeft as number);
      }
    }
  };

  const onRoundEnd = (data: {
    word: string;
    wasGuessed?: boolean;
    guesserName?: string;
    transitionSeconds?: number;
    scores: Player[];
  }) => {
    const st = settersRef.current;
    const guessed = Boolean(data.wasGuessed);
    st.setRoundWasGuessed?.(guessed);
    if (data.guesserName) st.setLastGuesserName?.(data.guesserName);
    if (data.transitionSeconds) st.setTransitionSeconds?.(data.transitionSeconds);
    st.setCurrentWord?.(data.word);
    st.setPlayers?.(data.scores);
    st.setTimeLeft?.(0);
    st.setWordSelectTimeLeft?.(0);
    st.setPhase?.('round_end');
  };

  useEffect(() => {
    if (socketRef.current) return;

    const socket = io(SERVER_URL, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    const getSetters = () => settersRef.current;

    socket.on('connect', () => {
      getSetters().setConnected?.(true);
      getSetters().setError?.('');
      getSetters().setMyId?.(socket.id!);
      if (pendingJoin.current) {
        socket.emit('join_room', pendingJoin.current);
        pendingJoin.current = null;
      }
    });

    socket.on('reconnect', () => {
      const activeRoom = sessionStorage.getItem(ACTIVE_ROOM_KEY);
      const savedName = sessionStorage.getItem('playerName');
      if (activeRoom && savedName) {
        socket.emit('join_room', {
          roomId: activeRoom,
          playerName: savedName,
          clientOrigin: clientOrigin(),
        });
      }
    });

    socket.on('disconnect', () => getSetters().setConnected?.(false));

    socket.on('connect_error', () => {
      getSetters().setConnected?.(false);
      getSetters().setError?.(
        'Cannot reach game server. Start the backend on port 3001, then refresh.'
      );
    });

    socket.on('error', ({ message }: { message: string }) => getSetters().setError?.(message));

    const applyRoom = (data: {
      roomId: string;
      roomCode?: string;
      inviteLink?: string;
      hostId: string;
      settings: RoomSettings;
      players: Player[];
    }) => {
      const st = getSetters();
      st.setError?.('');
      st.setRoomId?.(data.roomId);
      st.setRoomCode?.(data.roomCode || data.roomId);
      st.setInviteLink?.(
        data.inviteLink ||
          `${window.location.origin}${window.location.pathname}?room=${data.roomId}`
      );
      st.setHostId?.(data.hostId);
      st.setSettings?.(data.settings);
      st.setPlayers?.(data.players);
      st.setPhase?.('lobby');
      sessionStorage.setItem(ACTIVE_ROOM_KEY, data.roomId);
      window.history.replaceState({}, '', `?room=${data.roomId}`);
    };

    socket.on('room_created', applyRoom);
    socket.on('room_joined', applyRoom);

    socket.on(
      'player_joined',
      ({ players: p, hostId: joinedHostId }: { players: Player[]; hostId?: string }) => {
        getSetters().setPlayers?.(p);
        if (joinedHostId) getSetters().setHostId?.(joinedHostId);
      }
    );

    const exitToHome = (message?: string) => {
      sessionStorage.removeItem(ACTIVE_ROOM_KEY);
      const st = getSetters();
      st.setPhase?.('home');
      st.setRoomId?.('');
      st.setRoomCode?.('');
      st.setInviteLink?.('');
      st.setPlayers?.([]);
      st.setSettings?.(null);
      st.setHostId?.('');
      if (message) st.setError?.(message);
      window.history.replaceState({}, '', '/');
      onExitedRoomRef.current?.(message);
    };

    socket.on('room_left', () => exitToHome());
    socket.on('kicked', ({ message }: { message?: string }) => exitToHome(message));
    socket.on('banned', ({ message }: { message?: string }) => exitToHome(message));

    socket.on(
      'player_left',
      ({
        players: p,
        playerName: leftName,
        hostId: newHostId,
        reason,
      }: {
        players: Player[];
        playerName?: string;
        hostId?: string;
        reason?: string;
      }) => {
        getSetters().setPlayers?.(p);
        if (newHostId) getSetters().setHostId?.(newHostId);
        if (!leftName) return;
        let text = `${leftName} left the room`;
        if (reason === 'kicked') text = `${leftName} was kicked from the room`;
        if (reason === 'banned') text = `${leftName} was banned from the room`;
        addMessageRef.current({
          playerId: '',
          playerName: '',
          text,
          isGuess: false,
          isCorrect: false,
          points: 0,
          system: true,
        });
      }
    );

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
      // ✅ Reset roundWasGuessed when a new turn starts
      const st = getSetters();
      st.setRoundWasGuessed?.(false);
      st.setLastGuesserName?.(null);
      st.setPhase?.('word_select');
      st.setDrawerId?.(data.drawerId);
      st.setRound?.(data.round);
      st.setTotalRounds?.(data.totalRounds);
      st.setTimeLeft?.(0);
      st.setWordSelectTimeLeft?.(data.wordSelectTimeLeft ?? 10);
      st.setStrokes?.([]);
      st.setCurrentWord?.(null);
      st.setWordOptions?.(data.wordOptions ?? data.wordChoices ?? null);
      st.setHints?.(data.hints ?? '');
      st.setActiveTool?.('brush');

      if (data.isDrawer && (data.wordOptions || data.wordChoices)) {
        addMessageRef.current({ playerId: '', playerName: '', text: `Choose a word to draw! (${data.wordSelectTimeLeft ?? 10}s)`, isGuess: false, isCorrect: false, points: 0, system: true });
      } else {
        addMessageRef.current({ playerId: '', playerName: '', text: `${data.drawerName} is choosing a word...`, isGuess: false, isCorrect: false, points: 0, system: true });
      }
    };

    socket.on('round_start', onTurnStart);

    socket.on('word_select_timer', (data: { timeLeft: number }) => {
      getSetters().setWordSelectTimeLeft?.(data.timeLeft);
    });

    socket.on('selectionTimerUpdate', (data: { timeLeft: number }) => {
      getSetters().setWordSelectTimeLeft?.(data.timeLeft);
    });

    socket.on('word_selection_started', (data: { wordSelectTimeLeft?: number; drawerId?: string }) => {
      const st = getSetters();
      st.setPhase?.('word_select');
      st.setWordSelectTimeLeft?.(data.wordSelectTimeLeft ?? 10);
      st.setTimeLeft?.(0);
      if (data.drawerId) st.setDrawerId?.(data.drawerId);
    });

    socket.on('timer_update', (data: { timeLeft?: number; wordSelectTimeLeft?: number; phase?: string }) => {
      const st = getSetters();
      if (data.phase === 'word_select') {
        st.setWordSelectTimeLeft?.(data.wordSelectTimeLeft ?? data.timeLeft ?? 0);
        st.setTimeLeft?.(0);
        return;
      }
      if (data.phase === 'drawing') {
        st.setTimeLeft?.(data.timeLeft ?? 0);
      }
    });

    socket.on('word_select_timeout', ({ message }: { message: string }) => {
      addMessageRef.current({ playerId: '', playerName: '', text: message, isGuess: false, isCorrect: false, points: 0, system: true });
    });

    const onWordChosen = ({ word }: { word: string }) => {
      const st = getSetters();
      st.setCurrentWord?.(word);
      st.setPhase?.('drawing');
      st.setActiveTool?.('brush');
    };
    socket.on('word_chosen_ack', onWordChosen);
    socket.on('word_selected', onWordChosen);

    socket.on('game_state', applyGameState);

    socket.on('timer', ({ timeLeft: t, phase }: { timeLeft: number; phase?: string }) => {
      if (phase === 'drawing' || phase === undefined) {
        getSetters().setTimeLeft?.(t);
      }
    });

    socket.on('roundTimerUpdate', (data: { timeLeft: number }) => {
      getSetters().setTimeLeft?.(data.timeLeft);
    });

    const onCorrectGuess = (data: {
      guesserName?: string;
      playerName?: string;
      wasGuessed?: boolean;
      word?: string;
    }) => {
      const st = getSetters();
      st.setRoundWasGuessed?.(true);
      st.setTimeLeft?.(0);
      st.setWordSelectTimeLeft?.(0);
      const name = data.guesserName ?? data.playerName;
      if (name) st.setLastGuesserName?.(name);
    };
    socket.on('round_guessed', onCorrectGuess);
    socket.on('correct_guess', onCorrectGuess);

    socket.on('draw_data', (stroke: Stroke) => {
      getSetters().setStrokes?.((prev) => [...prev, stroke]);
    });

    socket.on('draw_move', ({ x, y, strokeId }: { x: number; y: number; strokeId: number }) => {
      getSetters().setStrokes?.((prev) => {
        const copy = [...prev];
        const stroke = copy.find((s) => s.id === strokeId);
        if (stroke) stroke.points.push({ x, y });
        return copy;
      });
    });

    socket.on('canvas_clear', () => getSetters().setStrokes?.([]));

    socket.on('draw_undo', ({ strokes: s }: { strokes?: Stroke[] }) => {
      const st = getSetters();
      if (s) st.setStrokes?.(s);
      else st.setStrokes?.((prev) => prev.slice(0, -1));
    });

    // ✅ guess_result — word is masked on backend, nothing to do here
    socket.on('guess_result', (data: { correct: boolean; playerId?: string; points?: number }) => {
      void data;
    });

    // ✅ chat_message — maskedWord field used by ChatPanel, msg.text never shown for correct guesses
    socket.on('chat_message', (msg: ChatMessage) => addMessageRef.current(msg));

    socket.on('round_end', onRoundEnd);

    socket.on('game_over', (data: { winner: Player | null; leaderboard: Player[] }) => {
      const st = getSetters();
      st.setPhase?.('ended');
      st.setLeaderboard?.(data.leaderboard);
      st.setPlayers?.(data.leaderboard);
      st.setWinnerName?.(data.winner?.name);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  return socketRef;
}