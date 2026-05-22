import { Server } from 'socket.io';
import { Room } from './Room.js';
import { checkGuess } from '../utils/wordMatcher.js';

export class Game {
  static wordBank: String[] = [];

  roomId: string;
  io: Server;
  settings: any;
  room: Room;
  
  rounds: number;
  currentRound: number;
  drawTime: number;
  wordCount: number;

  currentDrawerId: string | null;
  currentWord: string | null;
  wordOptions: string[] | null;

  timer: NodeJS.Timeout | null;
  timeLeft: number;
  
  isDrawingPhase: boolean;

  constructor(roomId: string, io: Server, settings: any, room: Room) {
    this.roomId = roomId;
    this.io = io;
    this.settings = settings;
    this.room = room;
    
    this.rounds = settings.rounds || 3;
    this.currentRound = 1;
    this.drawTime = settings.drawTime || 60;
    this.wordCount = settings.wordCount || 3;
    
    this.currentDrawerId = null;
    this.currentWord = null;
    this.wordOptions = null;
    this.timeLeft = 0;
    this.isDrawingPhase = false;
  }

  startRound(drawerId: string) {
    this.currentDrawerId = drawerId;
    this.isDrawingPhase = true;
    this.wordOptions = [];

    const players = this.room.getPlayerList();
    players.forEach(p => p.hasGuessed = false);

    // Generate 3 random words from bank OR custom option
    const shuffled = [...Game.wordBank].sort(() => 0.5 - Math.random());
    this.wordOptions = shuffled.slice(0, this.wordCount);

    // Notify Drawer
    const drawer = players.find(p => p.id === drawerId);
    if (drawer) {
      this.io.to(drawer.socketId).emit('round_start', {
        drawerId: this.currentDrawerId,
        wordOptions: this.wordOptions,
        drawTime: this.drawTime,
      });
    }

    // Notify Guessers
    const guessers = players.filter(p => p.id !== drawerId);
    guessers.forEach(p => {
      this.io.to(p.socketId).emit('round_start', {
        drawerId: this.currentDrawerId,
        wordOptions: null,
        drawTime: this.drawTime,
        hints: this.generateHints('', 0)
      });
    });
  }

  handleWordSelection(word: string) {
    this.currentWord = word;
    this.isDrawingPhase = true;
    
    this.io.to(this.roomId).emit('game_state', {
      phase: 'drawing',
      round: this.currentRound,
      drawerId: this.currentDrawerId,
      hints: this.generateHints(word, 0),
    });

    this.startTimer();
  }

  handleGuess(playerId: string, playerName: string, text: string) {
    if (!this.currentWord || !this.isDrawingPhase) return { correct: false };
    if (playerId === this.currentDrawerId) return { correct: false };

    const player = this.room.getPlayerList().find(p => p.id === playerId);
    if (!player || player.hasGuessed) return { correct: false };

    if (checkGuess(text, this.currentWord)) {
      player.hasGuessed = true;
      const points = this.calculatePoints();
      player.score += points;

      // Bonus for drawer
      const drawer = this.room.getPlayerList().find(p => p.id === this.currentDrawerId);
      if (drawer) drawer.score += 50;

      this.io.to(this.roomId).emit('guess_result', {
        correct: true,
        playerId,
        playerName,
        points,
      });

      this.endRound(true, playerId);
      return { correct: true, points };
    }

    // Wrong guess
    return { correct: false };
  }

  private calculatePoints() {
    const ratio = this.timeLeft / this.drawTime;
    return Math.max(50, Math.round(500 * ratio));
  }

  private startTimer() {
    this.timeLeft = this.drawTime;
    
    this.timer = setInterval(() => {
      this.timeLeft--;
      
      this.io.to(this.roomId).emit('timer', { time: this.timeLeft });

      // Handle Hints
      const hints = this.generateHintsForTime();
      if (hints) {
        this.io.to(this.roomId).emit('game_state', { hints });
      }

      // End round if time runs out
      if (this.timeLeft <= 0) {
        this.endRound(false);
      }
    }, 1000);
  }

  private generateHintsForTime() {
    if (!this.currentWord) return null;
    if (this.timeLeft === Math.floor(this.drawTime * 0.66)) {
      return this.generateHints(this.currentWord, 1);
    }
    if (this.timeLeft === Math.floor(this.drawTime * 0.33)) {
      return this.generateHints(this.currentWord, 2);
    }
    return null;
  }

  private generateHints(word: string, reveal: number): string {
    if (!word) return '_ '.repeat(8); // default blank
    
    return word.split('').map((char, i) => {
      if (i < reveal) return char;
      return '_';
    }).join(' ');
  }

  endRound(wasGuessed: boolean, guesserId?: string) {
    if (this.timer) clearInterval(this.timer);
    this.isDrawingPhase = false;

    this.io.to(this.roomId).emit('round_end', {
      word: this.currentWord,
      wasGuessed,
      guesserId,
      scores: this.getScores(),
    });

    // Schedule next round
    setTimeout(() => {
      this.nextRoundLogic();
    }, 5000);
  }

  private getScores() {
    return this.room.getPublicPlayers().sort((a, b) => b.score - a.score);
  }

  private nextRoundLogic() {
    if (this.currentRound >= this.rounds && !this.isDrawingPhase) {
      // Game Over
      const leaderboard = this.getScores();
      this.io.to(this.roomId).emit('game_over', { leaderboard });
      return;
    }

    // Rotate
    const nextDrawer = this.room.nextDrawer();
    this.currentRound++;
    this.startRound(nextDrawer.id);
  }
}