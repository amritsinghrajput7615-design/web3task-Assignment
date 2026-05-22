export interface RoomSettings {
  maxPlayers: number;
  rounds: number;
  drawTime: number;
  wordCount: number;
  hints: number;
  wordMode: string;
  isPrivate: boolean;
}

export interface Player {
  id: string;
  name: string;
  score: number;
  isDrawer: boolean;
  hasGuessed: boolean;
}

export type DrawTool = 'brush' | 'eraser';

export interface Stroke {
  id: number;
  points: { x: number; y: number }[];
  color: string;
  size: number;
}

export interface ChatMessage {
  playerId: string;
  playerName: string;
  text: string;
  isGuess: boolean;
  isCorrect?: boolean;
  points?: number;
  system?: boolean;
  /** Shown in red when nobody guessed the word */
  wordMissed?: boolean;
  revealedWord?: string;
  /** Masked word (underscores) displayed in correct guess chat */
  maskedWord?: string;
}

export interface GameState {
  roomId: string;
  hostId: string;
  playerName: string;
  settings: RoomSettings;
  players: Player[];
  phase: 'home' | 'lobby' | 'word_select' | 'drawing' | 'round_end' | 'ended';
  drawerId: string | null;
  wordOptions: string[] | null;
  currentWord: string | null;
  hints: string;
  timeLeft: number;
  round: number;
  totalRounds: number;
  strokes: Stroke[];
  messages: ChatMessage[];
  isDrawer: boolean;
}
