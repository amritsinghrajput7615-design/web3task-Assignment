const { checkGuess } = require('../utils/wordMatcher');
const { wordService } = require('../services/WordService');
const { gameHistoryService } = require('../services/GameHistoryService');
const { GameTimerManager } = require('./GameTimerManager');
const { GameEvents } = require('../utils/GameEvents');

const WORD_SELECT_SECONDS = 10;
const WORD_CHOICE_COUNT = 3;
const ROUND_TRANSITION_MS = 4000;

class Game {
  constructor(room, io) {
    this.room = room;
    this.io = io;
    this.events = new GameEvents(room);
    this.timers = new GameTimerManager();

    this.phase = 'lobby';
    this.roundActive = false;
    this.currentRound = 0;
    this.totalRounds = 0;
    this.currentDrawerId = null;
    this.currentDrawerName = '';
    this.currentWord = null;
    this.wordOptions = null;
    this.drawTime = room.settings.drawTime;
    this.timeLeft = 0;
    this.wordSelectTimeLeft = WORD_SELECT_SECONDS;
    this.strokeHistory = [];
    this.hintLevel = 0;
    this.historyId = null;
    this.roundEnding = false;
    this.wordSkipInProgress = false;
  }

  getPublicState(extra = {}) {
    return {
      phase: this.phase,
      roundActive: this.roundActive,
      round: this.getDisplayRound(),
      totalRounds: this.totalRounds,
      currentDrawer: this.currentDrawerId,
      drawerId: this.currentDrawerId,
      drawerName: this.currentDrawerName,
      currentWord: this.phase === 'drawing' || this.phase === 'round_end' ? this.currentWord : null,
      timeLeft: this.timeLeft,
      wordSelectTimeLeft: this.wordSelectTimeLeft,
      wordChoices: this.phase === 'word_select' ? this.wordOptions : null,
      hints: this.currentWord && this.phase === 'drawing' ? this.buildHintDisplay(this.currentWord) : '',
      players: this.room.getPublicPlayers(),
      scores: this.room.getPublicPlayers(),
      ...extra,
    };
  }

  syncGameState(extra = {}) {
    this.events.broadcast('game_state', this.getPublicState(extra));
  }

  broadcastTimerUpdate() {
    const payload = {
      phase: this.phase,
      timeLeft: this.phase === 'word_select' ? this.wordSelectTimeLeft : this.timeLeft,
      wordSelectTimeLeft: this.wordSelectTimeLeft,
      drawTimeLeft: this.timeLeft,
    };

    if (this.phase === 'word_select') {
      this.events.broadcast('word_select_timer', { timeLeft: this.wordSelectTimeLeft });
    } else if (this.phase === 'drawing') {
      this.events.broadcast('timer', { timeLeft: this.timeLeft, phase: 'drawing' });
    }
  }

  getDisplayRound() {
    if (this.phase === 'word_select' || this.phase === 'drawing') {
      return this.currentRound + 1;
    }
    return this.currentRound;
  }

  async startGame() {
    const playerCount = this.room.getPlayerList().length;
    if (playerCount < 2) return;

    this.totalRounds = playerCount * this.room.settings.rounds;
    this.currentRound = 0;
    this.phase = 'playing';
    this.roundEnding = false;
    this.roundActive = false;

    this.room.getPlayerList().forEach((p) => {
      p.score = 0;
      p.hasGuessed = false;
      p.isDrawer = false;
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

    this.timers.clearAll();
    this.strokeHistory = [];
    this.hintLevel = 0;
    this.currentWord = null;
    this.wordOptions = null;
    this.roundEnding = false;
    this.wordSkipInProgress = false;
    this.roundActive = false;
    this.timeLeft = 0;

    const drawer = this.room.getNextDrawer();
    if (!drawer) return;

    this.currentDrawerId = drawer.id;
    this.currentDrawerName = drawer.name;
    this.wordOptions = await wordService.pickRandom(WORD_CHOICE_COUNT);
    this.phase = 'word_select';
    this.wordSelectTimeLeft = WORD_SELECT_SECONDS;

    this.room.getPlayerList().forEach((p) => {
      p.hasGuessed = false;
      p.isDrawer = p.id === drawer.id;
    });

    const basePayload = {
      round: this.getDisplayRound(),
      totalRounds: this.totalRounds,
      drawerId: drawer.id,
      drawerName: drawer.name,
      drawTime: this.drawTime,
      wordSelectTimeLeft: this.wordSelectTimeLeft,
      wordChoices: this.wordOptions,
    };

    this.events.broadcast('next_drawer', {
      drawerId: drawer.id,
      drawerName: drawer.name,
      round: basePayload.round,
    });

    this.room.getPlayerList().forEach((p) => {
      const isDrawer = p.id === drawer.id;
      const personal = {
        ...basePayload,
        isDrawer,
        wordOptions: isDrawer ? this.wordOptions : null,
        hints: isDrawer ? null : this.buildHintDisplay(''),
      };

      this.events.emitTo(p.socketId, 'round_start', personal);
      if (isDrawer) {
        this.events.emitTo(p.socketId, 'word_selection_started', {
          wordChoices: this.wordOptions,
          timeLeft: this.wordSelectTimeLeft,
        });
      }
    });

    this.events.broadcast('word_selection_started', {
      drawerId: drawer.id,
      drawerName: drawer.name,
      wordSelectTimeLeft: this.wordSelectTimeLeft,
      round: basePayload.round,
    });

    this.syncGameState();
    this.startWordSelectTimer();
  }

  startWordSelectTimer() {
    this.timers.startWordSelect(() => {
      if (this.phase !== 'word_select' || this.roundEnding) {
        this.timers.clearWordSelect();
        return;
      }

      this.wordSelectTimeLeft -= 1;
      this.broadcastTimerUpdate();

      if (this.wordSelectTimeLeft <= 0) {
        this.timers.clearWordSelect();
        this.skipWordSelection();
      }
    });
  }

  async skipWordSelection() {
    if (this.phase !== 'word_select' || this.roundEnding || this.wordSkipInProgress) return;

    this.wordSkipInProgress = true;
    this.timers.clearWordSelect();

    const skippedName = this.currentDrawerName;

    this.events.broadcast('word_select_timeout', {
      drawerId: this.currentDrawerId,
      drawerName: skippedName,
      message: `${skippedName} didn't choose a word in time. Next player draws!`,
    });

    this.events.broadcast('canvas_clear');
    this.strokeHistory = [];

    this.wordSkipInProgress = false;
    await this.setupTurn();
  }

  handleWordSelection(word, socketId) {
    if (this.phase !== 'word_select' || this.roundEnding) return false;
    if (socketId !== this.currentDrawerId) return false;
    if (!this.wordOptions?.includes(word)) return false;

    this.timers.clearWordSelect();
    this.currentWord = word;
    this.phase = 'drawing';
    this.roundActive = true;
    this.timeLeft = this.drawTime;
    this.hintLevel = 0;

    this.events.emitTo(this.currentDrawerId, 'word_chosen_ack', { word });
    this.events.broadcast('word_selected', { word, drawerId: this.currentDrawerId });

    this.events.broadcast('canvas_clear');
    this.strokeHistory = [];

    this.syncGameState({
      phase: 'drawing',
      roundActive: true,
      timeLeft: this.timeLeft,
      hints: this.buildHintDisplay(this.currentWord),
    });

    this.startDrawTimer();
    return true;
  }

  startDrawTimer() {
    this.timers.startDraw(() => {
      if (this.phase !== 'drawing' || this.roundEnding) {
        this.timers.clearDraw();
        return;
      }

      this.timeLeft -= 1;
      this.broadcastTimerUpdate();

      this.maybeRevealHint();

      if (this.timeLeft <= 0) {
        this.timers.clearDraw();
        this.endRound(false);
      }
    });
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
    if (this.phase !== 'drawing' || !this.currentWord || this.roundEnding || !this.roundActive) {
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
    this.roundActive = false;
    this.timers.clearAll();
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

    const roundPayload = {
      word,
      wasGuessed,
      guesserId,
      guesserName,
      points,
      scores: this.getLeaderboard(),
      round: this.currentRound,
      totalRounds: this.totalRounds,
      transitionSeconds: ROUND_TRANSITION_MS / 1000,
      drawerName: this.currentDrawerName,
    };

    if (wasGuessed) {
      this.events.broadcast('round_guessed', {
        wasGuessed: true,
        guesserId,
        guesserName,
        word,
        points,
        drawerName: this.currentDrawerName,
      });
    }

    this.events.broadcast('round_end', roundPayload);
    this.syncGameState();

    this.timers.scheduleTransition(ROUND_TRANSITION_MS, async () => {
      this.roundEnding = false;

      if (this.currentRound >= this.totalRounds) {
        await this.endGame();
      } else {
        this.events.broadcast('canvas_clear');
        this.strokeHistory = [];
        await this.setupTurn();
      }
    });
  }

  async endGame() {
    this.timers.clearAll();
    this.phase = 'ended';
    this.roundActive = false;

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

  /** Called when drawer disconnects mid-game */
  async handleDrawerDisconnect() {
    this.timers.clearAll();
    this.events.broadcast('canvas_clear');
    this.strokeHistory = [];

    if (this.phase === 'drawing' && this.roundActive) {
      await this.endRound(false);
      return;
    }

    if (this.phase === 'word_select') {
      await this.skipWordSelection();
    }
  }

  abandonHistory() {
    this.timers.clearAll();
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
