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
  system?: boolean;
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
