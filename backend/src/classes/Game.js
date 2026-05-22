const { checkGuess } = require('../utils/wordMatcher');
const { wordService } = require('../services/WordService');
const { gameHistoryService } = require('../services/GameHistoryService');

class Game {
  constructor(room, io) {
    this.room = room;
    this.io = io;
    this.phase = 'lobby';
    this.currentRound = 0;
    this.totalRounds = 0;
    this.currentDrawerId = null;
    this.currentDrawerName = '';
    this.currentWord = null;
    this.wordOptions = null;
    this.drawTime = room.settings.drawTime;
    this.timeLeft = 0;
    this.timer = null;
    this.strokeHistory = [];
    this.hintLevel = 0;
    this.historyId = null;
  }

  async startGame() {
    const playerCount = this.room.getPlayerList().length;
    this.totalRounds = playerCount * this.room.settings.rounds;
    this.currentRound = 0;
    this.phase = 'playing';
    this.room.getPlayerList().forEach((p) => {
      p.score = 0;
      p.hasGuessed = false;
    });
    this.room.drawerIndex = 0;

    this.historyId = await gameHistoryService.startSession(this.room);
    this.beginRound();
  }

  async beginRound() {
    if (this.currentRound >= this.totalRounds) {
      this.endGame();
      return;
    }

    this.currentRound += 1;
    this.strokeHistory = [];
    this.hintLevel = 0;
    this.currentWord = null;
    this.wordOptions = null;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    const drawer = this.room.getNextDrawer();
    if (!drawer) return;

    this.currentDrawerId = drawer.id;
    this.currentDrawerName = drawer.name;
    this.wordOptions = await wordService.pickRandom(this.room.settings.wordCount);

    this.room.getPlayerList().forEach((p) => {
      p.hasGuessed = false;
    });

    const payload = {
      round: this.currentRound,
      totalRounds: this.totalRounds,
      drawerId: drawer.id,
      drawerName: drawer.name,
      drawTime: this.drawTime,
    };

    this.room.getPlayerList().forEach((p) => {
      if (p.id === drawer.id) {
        this.io.to(p.socketId).emit('round_start', {
          ...payload,
          wordOptions: this.wordOptions,
          isDrawer: true,
        });
      } else {
        this.io.to(p.socketId).emit('round_start', {
          ...payload,
          wordOptions: null,
          isDrawer: false,
          hints: this.buildHintDisplay(''),
        });
      }
    });

    this.room.broadcast('game_state', {
      phase: 'word_select',
      round: this.currentRound,
      totalRounds: this.totalRounds,
      drawerId: drawer.id,
      players: this.room.getPublicPlayers(),
    });
  }

  handleWordSelection(word, socketId) {
    if (socketId !== this.currentDrawerId) return false;
    if (!this.wordOptions?.includes(word)) return false;

    this.currentWord = word;
    this.phase = 'drawing';
    this.timeLeft = this.drawTime;
    this.hintLevel = 0;

    this.io.to(this.currentDrawerId).emit('word_chosen_ack', { word });

    this.room.broadcast('game_state', {
      phase: 'drawing',
      round: this.currentRound,
      drawerId: this.currentDrawerId,
      hints: this.buildHintDisplay(this.currentWord),
      timeLeft: this.timeLeft,
    });

    this.room.broadcast('canvas_clear');
    this.strokeHistory = [];

    this.startTimer();
    return true;
  }

  startTimer() {
    if (this.timer) clearInterval(this.timer);

    this.timer = setInterval(() => {
      this.timeLeft -= 1;
      this.room.broadcast('timer', { timeLeft: this.timeLeft });

      this.maybeRevealHint();

      if (this.timeLeft <= 0) {
        this.endRound(false);
      }
    }, 1000);
  }

  maybeRevealHint() {
    const maxHints = this.room.settings.hints;
    if (maxHints <= 0 || !this.currentWord) return;

    const elapsed = this.drawTime - this.timeLeft;
    const interval = Math.floor(this.drawTime / (maxHints + 1));

    const targetLevel = Math.min(maxHints, Math.floor(elapsed / interval));

    if (targetLevel > this.hintLevel) {
      this.hintLevel = targetLevel;
      this.room.broadcast('game_state', {
        hints: this.buildHintDisplay(this.currentWord),
      });
    }
  }

  buildHintDisplay(word) {
    if (!word) return '_ '.repeat(5).trim();
    const revealCount = this.hintLevel;
    return word
      .split('')
      .map((char, i) => {
        if (char === ' ') return ' ';
        if (i < revealCount) return char;
        return '_';
      })
      .join(' ');
  }

  handleGuess(playerId, playerName, text) {
    if (this.phase !== 'drawing' || !this.currentWord) {
      return { correct: false, broadcast: true };
    }
    if (playerId === this.currentDrawerId) {
      return { correct: false, broadcast: false };
    }

    const player = this.room.getPlayerList().find((p) => p.id === playerId);
    if (!player || player.hasGuessed) {
      return { correct: false, broadcast: false };
    }

    if (!checkGuess(text, this.currentWord)) {
      return { correct: false, broadcast: true };
    }

    player.hasGuessed = true;
    const points = this.calculatePoints();
    player.score += points;

    const drawer = this.room.getPlayerList().find((p) => p.id === this.currentDrawerId);
    if (drawer) drawer.score += Math.round(points * 0.25);

    this.room.messageHandler.sendCorrectGuess(playerId, playerName, text, points);

    this.room.broadcast('game_state', {
      players: this.room.getPublicPlayers(),
    });

    const guessers = this.room.getPlayerList().filter((p) => p.id !== this.currentDrawerId);
    const allGuessed = guessers.length > 0 && guessers.every((p) => p.hasGuessed);

    if (allGuessed) {
      this.endRound(true, playerId);
    }

    return { correct: true, broadcast: false };
  }

  calculatePoints() {
    const ratio = this.timeLeft / this.drawTime;
    return Math.max(50, Math.round(500 * ratio));
  }

  async endRound(wasGuessed, guesserId = null) {
    if (this.phase === 'round_end' || this.phase === 'lobby') return;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.phase = 'round_end';

    const word = this.currentWord;

    gameHistoryService.recordRound(this.historyId, {
      currentRound: this.currentRound,
      word,
      wasGuessed,
      drawerName: this.currentDrawerName,
      players: this.room.getPlayerList(),
    });

    this.room.broadcast('round_end', {
      word,
      wasGuessed,
      guesserId,
      scores: this.getLeaderboard(),
      round: this.currentRound,
      totalRounds: this.totalRounds,
    });

    setTimeout(() => {
      if (this.currentRound >= this.totalRounds) {
        this.endGame();
      } else {
        this.beginRound();
      }
    }, 5000);
  }

  async endGame() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.phase = 'ended';
    const leaderboard = this.getLeaderboard();
    const winner = leaderboard[0] || null;

    await gameHistoryService.completeSession(this.historyId, {
      winner,
      leaderboard,
      currentRound: this.currentRound,
      totalRounds: this.totalRounds,
    });

    this.historyId = null;

    this.room.broadcast('game_over', {
      winner,
      leaderboard,
    });
  }

  abandonHistory() {
    if (this.historyId) {
      gameHistoryService.abandonSession(this.historyId);
      this.historyId = null;
    }
  }

  getLeaderboard() {
    return [...this.room.getPublicPlayers()].sort((a, b) => b.score - a.score);
  }
}

module.exports = { Game };
