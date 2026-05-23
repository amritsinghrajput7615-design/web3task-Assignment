import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { getGameSocket } from '../lib/gameSocket';
import type { ChatMessage, DrawTool, Player, RoomSettings, Stroke } from '../types';

export const ACTIVE_ROOM_KEY = 'activeRoomId';
const PLAYER_NAME_KEY = 'playerName';

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
    setStrokes: React.Dispatch<React.SetStateAction<Stroke[]>> | ((v: Stroke[]) => void);
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>> | ((v: ChatMessage[]) => void);
    setActiveTool: (v: DrawTool) => void;
    setLeaderboard: (v: Player[] | undefined) => void;
    setWinnerName: (v: string | undefined) => void;
    setRoundWasGuessed: (v: boolean) => void;
    setLastGuesserName: (v: string | null) => void;
    setTransitionSeconds: (v: number) => void;
  }>,
  addMessage: (msg: ChatMessage) => void,
  _roomCodeFromUrl: string | null,
  pendingJoin: React.MutableRefObject<{ roomId: string; playerName: string; clientOrigin: string } | null>,
  onExitedRoom?: (message?: string) => void
) {
  const socketRef = useRef<Socket | null>(null);
  const settersRef = useRef(setters);
  const addMessageRef = useRef(addMessage);
  const onExitedRoomRef = useRef(onExitedRoom);

  settersRef.current = setters;
  addMessageRef.current = addMessage;
  onExitedRoomRef.current = onExitedRoom;

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
    // Sync strokes only when server sends them (reconnect); never clear on timer/hint updates.
    if (Array.isArray(data.strokes)) {
      st.setStrokes?.(data.strokes as Stroke[]);
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
    const socket = getGameSocket();
    socketRef.current = socket;

    const getSetters = () => settersRef.current;

    const tryRejoinRoom = () => {
      if (pendingJoin.current) return;
      const urlRoom = _roomCodeFromUrl?.trim().toUpperCase() || null;
      const storedRoom = sessionStorage.getItem(ACTIVE_ROOM_KEY);
      const roomId = urlRoom || storedRoom;
      const playerName = sessionStorage.getItem(PLAYER_NAME_KEY);
      if (!roomId || !playerName) return;
      if (urlRoom && urlRoom !== storedRoom) {
        sessionStorage.setItem(ACTIVE_ROOM_KEY, urlRoom);
      }
      socket.emit('join_room', {
        roomId,
        playerName,
        clientOrigin: clientOrigin(),
      });
    };

    const onConnect = () => {
      getSetters().setConnected?.(true);
      getSetters().setError?.('');
      getSetters().setMyId?.(socket.id!);
      if (pendingJoin.current) {
        socket.emit('join_room', pendingJoin.current);
        pendingJoin.current = null;
        return;
      }
      tryRejoinRoom();
    };

    socket.on('connect', onConnect);
    socket.on('reconnect', tryRejoinRoom);

    if (socket.connected) {
      onConnect();
    }

    socket.on('disconnect', () => getSetters().setConnected?.(false));

    socket.on('connect_error', () => {
      getSetters().setConnected?.(false);
      getSetters().setError?.(
        'Cannot reach game server. Run: npm run dev (from project root) or start the backend on port 3001, then refresh.'
      );
    });

    socket.on('error', ({ message }: { message: string }) => getSetters().setError?.(message));

    const applySnapshot = (snapshot: {
      phase: GamePhase;
      players: Player[];
      round?: number;
      totalRounds?: number;
      drawerId?: string | null;
      timeLeft?: number;
      wordSelectTimeLeft?: number;
      hints?: string;
      strokes?: Stroke[];
      messages?: ChatMessage[];
      wordOptions?: string[] | null;
      currentWord?: string | null;
      roundWasGuessed?: boolean;
      lastGuesserName?: string | null;
      transitionSeconds?: number;
      leaderboard?: Player[];
      winnerName?: string;
    }) => {
      const st = getSetters();
      st.setPhase?.(snapshot.phase);
      st.setPlayers?.(snapshot.players);
      if (snapshot.round !== undefined) st.setRound?.(snapshot.round);
      if (snapshot.totalRounds !== undefined) st.setTotalRounds?.(snapshot.totalRounds);
      if (snapshot.drawerId !== undefined) st.setDrawerId?.(snapshot.drawerId);
      if (snapshot.timeLeft !== undefined) st.setTimeLeft?.(snapshot.timeLeft);
      if (snapshot.wordSelectTimeLeft !== undefined) {
        st.setWordSelectTimeLeft?.(snapshot.wordSelectTimeLeft);
      }
      if (snapshot.hints !== undefined) st.setHints?.(snapshot.hints);
      if (snapshot.strokes) st.setStrokes?.(snapshot.strokes);
      if (snapshot.messages) st.setMessages?.(snapshot.messages);
      if (snapshot.wordOptions !== undefined) st.setWordOptions?.(snapshot.wordOptions);
      if (snapshot.currentWord !== undefined) st.setCurrentWord?.(snapshot.currentWord);
      if (snapshot.roundWasGuessed !== undefined) {
        st.setRoundWasGuessed?.(snapshot.roundWasGuessed);
      }
      if (snapshot.lastGuesserName !== undefined) {
        st.setLastGuesserName?.(snapshot.lastGuesserName);
      }
      if (snapshot.transitionSeconds !== undefined) {
        st.setTransitionSeconds?.(snapshot.transitionSeconds);
      }
      if (snapshot.leaderboard) st.setLeaderboard?.(snapshot.leaderboard);
      if (snapshot.winnerName) st.setWinnerName?.(snapshot.winnerName);
    };

    const applyRoom = (data: {
      roomId: string;
      roomCode?: string;
      inviteLink?: string;
      hostId: string;
      settings: RoomSettings;
      players: Player[];
      snapshot?: Parameters<typeof applySnapshot>[0] | null;
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
      sessionStorage.setItem(ACTIVE_ROOM_KEY, data.roomId);
      window.history.replaceState({}, '', `?room=${data.roomId}`);

      if (data.snapshot) {
        applySnapshot(data.snapshot);
      } else {
        st.setPhase?.('lobby');
      }
    };

    socket.on('room_created', applyRoom);
    socket.on('room_joined', applyRoom);

    socket.on(
      'player_reconnected',
      ({
        players: p,
        hostId: newHostId,
        oldPlayerId,
      }: {
        players: Player[];
        hostId?: string;
        oldPlayerId: string;
      }) => {
        const st = getSetters();
        st.setPlayers?.(p);
        if (newHostId) st.setHostId?.(newHostId);
        st.setDrawerId?.((current) => {
          if (current !== oldPlayerId) return current;
          const drawer = p.find((pl) => pl.isDrawer);
          return drawer?.id ?? null;
        });
      }
    );

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

    socket.on('hint_update', ({ hints }: { hints: string }) => {
      getSetters().setHints?.(hints);
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
      socket.off('connect', onConnect);
      socket.off('reconnect', tryRejoinRoom);
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('error');
      socket.off('room_created');
      socket.off('room_joined');
      socket.off('player_reconnected');
      socket.off('player_joined');
      socket.off('room_left');
      socket.off('kicked');
      socket.off('banned');
      socket.off('player_left');
      socket.off('round_start');
      socket.off('word_select_timer');
      socket.off('selectionTimerUpdate');
      socket.off('word_selection_started');
      socket.off('timer_update');
      socket.off('hint_update');
      socket.off('word_select_timeout');
      socket.off('word_chosen_ack');
      socket.off('word_selected');
      socket.off('game_state');
      socket.off('timer');
      socket.off('roundTimerUpdate');
      socket.off('round_guessed');
      socket.off('correct_guess');
      socket.off('draw_data');
      socket.off('draw_move');
      socket.off('canvas_clear');
      socket.off('draw_undo');
      socket.off('guess_result');
      socket.off('chat_message');
      socket.off('round_end');
      socket.off('game_over');
    };
  }, []);

  return socketRef;
}