const { checkGuess } = require('../utils/wordMatcher');
const { wordService } = require('../services/WordService');
const { gameHistoryService } = require('../services/GameHistoryService');

const WORD_SELECT_SECONDS = 10;
const ROUND_TRANSITION_MS = 4000;

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
    this.wordSelectTimeLeft = WORD_SELECT_SECONDS;
    this.drawTimer = null;
    this.wordSelectTimer = null;
    this.roundTransitionTimeout = null;
    this.strokeHistory = [];
    this.hintLevel = 0;
    this.historyId = null;
    this.roundEnding = false;
    this.wordSkipInProgress = false;
  }

  clearDrawTimer() {
    if (this.drawTimer) {
      clearInterval(this.drawTimer);
      this.drawTimer = null;
    }
  }

  clearWordSelectTimer() {
    if (this.wordSelectTimer) {
      clearInterval(this.wordSelectTimer);
      this.wordSelectTimer = null;
    }
  }

  clearRoundTransition() {
    if (this.roundTransitionTimeout) {
      clearTimeout(this.roundTransitionTimeout);
      this.roundTransitionTimeout = null;
    }
  }

  clearAllTimers() {
    this.clearDrawTimer();
    this.clearWordSelectTimer();
    this.clearRoundTransition();
  }

  syncGameState(extra = {}) {
    this.room.broadcast('game_state', {
      phase: this.phase,
      round: this.getDisplayRound(),
      totalRounds: this.totalRounds,
      drawerId: this.currentDrawerId,
      drawerName: this.currentDrawerName,
      timeLeft: this.timeLeft,
      wordSelectTimeLeft: this.wordSelectTimeLeft,
      hints: this.currentWord ? this.buildHintDisplay(this.currentWord) : '',
      players: this.room.getPublicPlayers(),
      ...extra,
    });
  }

  getDisplayRound() {
    if (this.phase === 'word_select') return this.currentRound + 1;
    if (this.phase === 'drawing') return this.currentRound + 1;
    return this.currentRound;
  }

  async startGame() {
    const playerCount = this.room.getPlayerList().length;
    this.totalRounds = playerCount * this.room.settings.rounds;
    this.currentRound = 0;
    this.phase = 'playing';
    this.roundEnding = false;

    this.room.getPlayerList().forEach((p) => {
      p.score = 0;
      p.hasGuessed = false;
    });
    this.room.drawerIndex = 0;

    this.historyId = await gameHistoryService.startSession(this.room);

    await this.setupTurn();
  }

  async setupTurn() {
    if (this.currentRound >= this.totalRounds) {
      await this.endGame();
      return;
    }

    this.clearAllTimers();
    this.strokeHistory = [];
    this.hintLevel = 0;
    this.currentWord = null;
    this.wordOptions = null;
    this.roundEnding = false;
    this.wordSkipInProgress = false;
    this.timeLeft = 0;

    const drawer = this.room.getNextDrawer();
    if (!drawer) return;

    this.currentDrawerId = drawer.id;
    this.currentDrawerName = drawer.name;
    this.wordOptions = await wordService.pickRandom(this.room.settings.wordCount);
    this.phase = 'word_select';
    this.wordSelectTimeLeft = WORD_SELECT_SECONDS;

    this.room.getPlayerList().forEach((p) => {
      p.hasGuessed = false;
      p.isDrawer = p.id === drawer.id;
    });

    const payload = {
      round: this.getDisplayRound(),
      totalRounds: this.totalRounds,
      drawerId: drawer.id,
      drawerName: drawer.name,
      drawTime: this.drawTime,
      wordSelectTimeLeft: this.wordSelectTimeLeft,
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

    this.syncGameState();
    this.startWordSelectTimer();
  }

  startWordSelectTimer() {
    this.clearWordSelectTimer();

    this.wordSelectTimer = setInterval(() => {
      if (this.phase !== 'word_select') {
        this.clearWordSelectTimer();
        return;
      }

      this.wordSelectTimeLeft -= 1;
      this.room.broadcast('word_select_timer', { timeLeft: this.wordSelectTimeLeft });

      if (this.wordSelectTimeLeft <= 0) {
        this.clearWordSelectTimer();
        this.skipWordSelection();
      }
    }, 1000);
  }

  async skipWordSelection() {
    if (this.phase !== 'word_select' || this.roundEnding || this.wordSkipInProgress) return;

    this.wordSkipInProgress = true;
    this.clearWordSelectTimer();

    const skippedName = this.currentDrawerName;

    this.room.broadcast('word_select_timeout', {
      drawerId: this.currentDrawerId,
      drawerName: skippedName,
      message: `${skippedName} didn't choose a word in time. Next player draws!`,
    });

    this.wordSkipInProgress = false;
    await this.setupTurn();
  }

  handleWordSelection(word, socketId) {
    if (this.phase !== 'word_select' || this.roundEnding) return false;
    if (socketId !== this.currentDrawerId) return false;
    if (!this.wordOptions?.includes(word)) return false;

    this.clearWordSelectTimer();
    this.currentWord = word;
    this.phase = 'drawing';
    this.timeLeft = this.drawTime;
    this.hintLevel = 0;

    this.io.to(this.currentDrawerId).emit('word_chosen_ack', { word });

    this.room.broadcast('canvas_clear');
    this.strokeHistory = [];

    this.syncGameState({
      phase: 'drawing',
      timeLeft: this.timeLeft,
      hints: this.buildHintDisplay(this.currentWord),
    });

    this.startDrawTimer();
    return true;
  }

  startDrawTimer() {
    this.clearDrawTimer();

    this.drawTimer = setInterval(() => {
      if (this.phase !== 'drawing') {
        this.clearDrawTimer();
        return;
      }

      this.timeLeft -= 1;
      this.room.broadcast('timer', { timeLeft: this.timeLeft, phase: 'drawing' });

      this.maybeRevealHint();

      if (this.timeLeft <= 0) {
        this.clearDrawTimer();
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
      this.syncGameState({ hints: this.buildHintDisplay(this.currentWord) });
    }
  }

  buildHintDisplay(word) {
    if (!word) return '_ '.repeat(5).trim();
    return word
      .split('')
      .map((char, i) => {
        if (char === ' ') return ' ';
        if (i < this.hintLevel) return char;
        return '_';
      })
      .join(' ');
  }

  handleGuess(playerId, playerName, text) {
    if (this.phase !== 'drawing' || !this.currentWord || this.roundEnding) {
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

    // First correct guess immediately ends the round
    this.endRound(true, playerId, playerName, points);
    return { correct: true, broadcast: false };
  }

  calculatePoints() {
    const ratio = Math.max(0, this.timeLeft / this.drawTime);
    return Math.max(50, Math.round(500 * ratio));
  }

  async endRound(wasGuessed, guesserId = null, guesserName = null, points = 0) {
    if (this.phase === 'round_end' || this.phase === 'lobby' || this.roundEnding) return;

    this.roundEnding = true;
    this.clearAllTimers();
    this.phase = 'round_end';
    this.timeLeft = 0;
    this.wordSelectTimeLeft = 0;

    const word = this.currentWord;
    this.currentRound += 1;

    if (word) {
      await gameHistoryService.recordRound(this.historyId, {
        currentRound: this.currentRound,
        word,
        wasGuessed,
        drawerName: this.currentDrawerName,
        players: this.room.getPlayerList(),
      });
    }

    this.room.broadcast('round_guessed', {
      wasGuessed,
      guesserId,
      guesserName,
      word,
      points,
      drawerName: this.currentDrawerName,
    });

    this.room.broadcast('round_end', {
      word,
      wasGuessed,
      guesserId,
      guesserName,
      points,
      scores: this.getLeaderboard(),
      round: this.currentRound,
      totalRounds: this.totalRounds,
      transitionSeconds: ROUND_TRANSITION_MS / 1000,
    });

    this.syncGameState();

    this.clearRoundTransition();
    this.roundTransitionTimeout = setTimeout(async () => {
      this.roundTransitionTimeout = null;
      this.roundEnding = false;

      if (this.currentRound >= this.totalRounds) {
        await this.endGame();
      } else {
        await this.setupTurn();
      }
    }, ROUND_TRANSITION_MS);
  }

  async endGame() {
    this.clearAllTimers();
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

    this.room.broadcast('game_over', { winner, leaderboard });
    this.syncGameState();
  }

  abandonHistory() {
    this.clearAllTimers();
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
