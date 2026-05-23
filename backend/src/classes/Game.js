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
    this.timers = new GameTimerManager(room.roomId);

    this.phase = 'lobby';
    this.roundActive = false;
    this.roundEnded = false;
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
    this.roundOutcome = null;
    this._roundEndEmitted = false;
    this._lastWasGuessed = false;
    this._lastGuesserName = null;
  }

  clearRoomTimers() {
    this.timers.clearAll();
    console.log(`CLEAR TIMERS ${this.room.roomId}`);
  }

  startSelectionTimer() { return this.startWordSelectTimer(); }
  startRoundTimer() { return this.startDrawTimer(); }

  _log(event, detail = '') {
    console.log(`[Game ${this.room.roomId}] ${event}${detail ? ` — ${detail}` : ''}`);
  }

  claimRoundEnd(outcome = null) {
    if (this.roundEnded || this.phase === 'round_end' || this.phase === 'lobby') return false;
    this.roundEnded = true;
    this.roundEnding = true;
    this.roundActive = false;
    this.timers.clearAll();
    if (outcome?.wasGuessed) {
      this.roundOutcome = {
        wasGuessed: true,
        guesserId: outcome.guesserId ?? null,
        guesserName: outcome.guesserName ?? null,
      };
    }
    return true;
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
      // ✅ Include round result fields so game_state never resets them
      wasGuessed: this.phase === 'round_end' ? (extra.wasGuessed ?? this._lastWasGuessed ?? false) : undefined,
      guesserName: this.phase === 'round_end' ? (extra.guesserName ?? this._lastGuesserName ?? null) : undefined,
      ...extra,
    };
  }

  syncGameState(extra = {}) {
    this.events.broadcast('game_state', this.getPublicState(extra));
  }

  /** Full state for a player reconnecting after refresh. */
  getReconnectSnapshot(socketId) {
    const isDrawer = socketId === this.currentDrawerId;
    const phase = this.phase === 'playing' ? 'word_select' : this.phase;

    const snapshot = {
      phase,
      players: this.room.getPublicPlayers(),
      round: this.getDisplayRound(),
      totalRounds: this.totalRounds,
      drawerId: this.currentDrawerId,
      drawerName: this.currentDrawerName,
      timeLeft: this.timeLeft,
      wordSelectTimeLeft: this.wordSelectTimeLeft,
      hints: this.currentWord && this.phase === 'drawing' ? this.buildHintDisplay(this.currentWord) : '',
      strokes: [...this.strokeHistory],
      messages: [...this.room.chatHistory],
      roundWasGuessed: this.phase === 'round_end' ? Boolean(this._lastWasGuessed) : false,
      lastGuesserName: this.phase === 'round_end' ? this._lastGuesserName : null,
      transitionSeconds: 4,
      wordOptions: null,
      currentWord: null,
    };

    if (this.phase === 'word_select') {
      snapshot.wordOptions = isDrawer ? this.wordOptions : null;
    }
    if (this.phase === 'drawing' || this.phase === 'round_end') {
      snapshot.currentWord = isDrawer ? this.currentWord : null;
      if (this.phase === 'round_end') {
        snapshot.currentWord = this.currentWord;
      }
    }
    if (this.phase === 'ended') {
      snapshot.leaderboard = this.getLeaderboard();
      snapshot.winnerName = snapshot.leaderboard[0]?.name;
    }

    return snapshot;
  }

  broadcastTimerUpdate() {
    if (this.phase === 'word_select') {
      this.events.broadcast('timer_update', { phase: 'word_select', wordSelectTimeLeft: this.wordSelectTimeLeft, timeLeft: this.wordSelectTimeLeft });
      this.events.broadcast('word_select_timer', { timeLeft: this.wordSelectTimeLeft });
      return;
    }
    if (this.phase === 'drawing') {
      this.events.broadcast('timer_update', { phase: 'drawing', timeLeft: this.timeLeft, drawTimeLeft: this.timeLeft });
      this.events.broadcast('timer', { timeLeft: this.timeLeft, phase: 'drawing' });
    }
  }

  getDisplayRound() {
    if (this.phase === 'word_select' || this.phase === 'drawing') return this.currentRound + 1;
    return this.currentRound;
  }

  async startGame() {
    const playerCount = this.room.getPlayerList().length;
    if (playerCount < 2) return;

    this.totalRounds = playerCount * this.room.settings.rounds;
    this.currentRound = 0;
    this.phase = 'playing';
    this.roundEnding = false;
    this.roundEnded = false;
    this.roundActive = false;

    this.room.getPlayerList().forEach((p) => { p.score = 0; p.hasGuessed = false; p.isDrawer = false; });
    this.room.drawerIndex = 0;

    this.historyId = await gameHistoryService.startSession(this.room);
    await this.setupTurn();
  }

  async setupTurn() {
    if (this.currentRound >= this.totalRounds) { await this.endGame(); return; }

    this.timers.clearAll();
    this.strokeHistory = [];
    this.hintLevel = 0;
    this.currentWord = null;
    this.wordOptions = null;
    this.roundEnding = false;
    this.roundEnded = false;
    this.roundOutcome = null;
    this._roundEndEmitted = false;
    this._lastWasGuessed = false;
    this._lastGuesserName = null;
    this.wordSkipInProgress = false;
    this.roundActive = false;
    this.timeLeft = 0;

    const drawer = this.room.getNextDrawer();
    if (!drawer) return;

    this._log('next drawer', drawer.name);
    this.currentDrawerId = drawer.id;
    this.currentDrawerName = drawer.name;
    this.wordOptions = await wordService.pickRandom(WORD_CHOICE_COUNT);
    this.phase = 'word_select';
    this.wordSelectTimeLeft = WORD_SELECT_SECONDS;

    this.room.getPlayerList().forEach((p) => { p.hasGuessed = false; p.isDrawer = p.id === drawer.id; });

    const basePayload = {
      round: this.getDisplayRound(), totalRounds: this.totalRounds,
      drawerId: drawer.id, drawerName: drawer.name,
      drawTime: this.drawTime, wordSelectTimeLeft: this.wordSelectTimeLeft,
      wordChoices: this.wordOptions,
    };

    this.events.broadcast('next_drawer', { drawerId: drawer.id, drawerName: drawer.name, round: basePayload.round });

    this.room.getPlayerList().forEach((p) => {
      const isDrawer = p.id === drawer.id;
      this.events.emitTo(p.socketId, 'round_start', { ...basePayload, isDrawer, wordOptions: isDrawer ? this.wordOptions : null, hints: isDrawer ? null : this.buildHintDisplay('') });
      if (isDrawer) this.events.emitTo(p.socketId, 'word_selection_started', { wordChoices: this.wordOptions, timeLeft: this.wordSelectTimeLeft });
    });

    this.events.broadcast('word_selection_started', { drawerId: drawer.id, drawerName: drawer.name, wordSelectTimeLeft: this.wordSelectTimeLeft, round: basePayload.round });
    this.syncGameState();
    this.broadcastTimerUpdate();
    this.startWordSelectTimer();
  }

  startWordSelectTimer() {
    this.clearRoomTimers();
    this._log('timer start', 'word_select');
    this.timers.startWordSelect(() => {
      if (this.phase !== 'word_select' || this.roundEnded || this.roundEnding) { this.timers.clearWordSelect(); return; }
      this.wordSelectTimeLeft -= 1;
      this.broadcastTimerUpdate();
      this.events.broadcast('selectionTimerUpdate', { timeLeft: this.wordSelectTimeLeft });
      if (this.wordSelectTimeLeft <= 0) { this.timers.clearWordSelect(); this.skipWordSelection(); }
    });
  }

  async skipWordSelection() {
    if (this.phase !== 'word_select' || this.roundEnding || this.wordSkipInProgress) return;
    this.wordSkipInProgress = true;
    this.timers.clearWordSelect();
    this.events.broadcast('word_select_timeout', { drawerId: this.currentDrawerId, drawerName: this.currentDrawerName, message: `${this.currentDrawerName} didn't choose a word in time. Next player draws!` });
    this.events.broadcast('canvas_clear');
    this.strokeHistory = [];
    this.wordSkipInProgress = false;
    await this.setupTurn();
  }

  handleWordSelection(word, socketId) {
    if (this.phase !== 'word_select' || this.roundEnded || this.roundEnding) return false;
    if (socketId !== this.currentDrawerId) return false;
    if (!this.wordOptions?.includes(word)) return false;

    this._log('word selected', word);
    this.timers.clearWordSelect();
    this.wordSelectTimeLeft = 0;
    this.currentWord = word;
    this.phase = 'drawing';
    this.roundActive = true;
    this.timeLeft = this.drawTime;
    this.hintLevel = 0;

    this.events.emitTo(this.currentDrawerId, 'word_chosen_ack', { word });
    this.events.broadcast('word_selected', { word, drawerId: this.currentDrawerId });
    this.events.broadcast('canvas_clear');
    this.strokeHistory = [];

    this.syncGameState({ phase: 'drawing', roundActive: true, timeLeft: this.timeLeft, hints: this.buildHintDisplay(this.currentWord) });
    this.broadcastTimerUpdate();
    this.startDrawTimer();
    return true;
  }

  startDrawTimer() {
    this.clearRoomTimers();
    this._log('timer start', 'draw');
    this.timers.startDraw(() => {
      if (this.phase !== 'drawing' || this.roundEnded || this.roundEnding) { this.timers.clearDraw(); return; }
      this.timeLeft -= 1;
      this.broadcastTimerUpdate();
      this.events.broadcast('roundTimerUpdate', { timeLeft: this.timeLeft });
      this.maybeRevealHint();
      if (this.timeLeft <= 0) {
        this.timers.clearDraw();
        this._log('timer stop', 'draw (timeout)');
        if (!this.roundEnded && !this.roundEnding) this.endRound(false);
      }
    });
    this.broadcastTimerUpdate();
  }

  maybeRevealHint() {
    const maxHints = this.room.settings.hints;
    if (maxHints <= 0 || !this.currentWord) return;
    const elapsed = this.drawTime - this.timeLeft;
    const interval = Math.floor(this.drawTime / (maxHints + 1));
    const targetLevel = Math.min(maxHints, Math.floor(elapsed / interval));
    if (targetLevel > this.hintLevel) {
      this.hintLevel = targetLevel;
      const hints = this.buildHintDisplay(this.currentWord);
      this.events.broadcast('hint_update', { hints });
    }
  }

  buildHintDisplay(word) {
    if (!word) return '_ '.repeat(5).trim();
    return word.split('').map((char, i) => { if (char === ' ') return ' '; if (i < this.hintLevel) return char; return '_'; }).join(' ');
  }

  handleGuess(playerId, playerName, text) {
    if (this.phase !== 'drawing' || !this.currentWord || this.roundEnded || this.roundEnding || !this.roundActive) return { correct: false, broadcast: true };
    if (playerId === this.currentDrawerId) return { correct: false, broadcast: false };

    const player = this.room.getPlayerList().find((p) => p.id === playerId);
    if (!player || player.hasGuessed) return { correct: false, broadcast: false };
    if (!checkGuess(text, this.currentWord)) return { correct: false, broadcast: true };

    this._log('correct guess', playerName);
    if (!this.claimRoundEnd({ wasGuessed: true, guesserId: playerId, guesserName: playerName })) {
      return { correct: false, broadcast: false };
    }

    // ✅ Calculate points BEFORE zeroing timeLeft
    player.hasGuessed = true;
    const points = this.calculatePoints();
    player.score += points;

    const drawer = this.room.getPlayerList().find((p) => p.id === this.currentDrawerId);
    if (drawer) drawer.score += Math.round(points * 0.25);

    // ✅ Zero timer AFTER points are calculated
    this.timeLeft = 0;
    this.broadcastTimerUpdate();

    this.room.messageHandler.sendCorrectGuess(playerId, playerName, text, points);
    this.endRound(true, playerId, playerName, points);
    return { correct: true, broadcast: false };
  }

  calculatePoints() {
    const ratio = Math.max(0, this.timeLeft / this.drawTime);
    return Math.max(50, Math.round(500 * ratio));
  }

  async endRound(wasGuessed, guesserId = null, guesserName = null, points = 0) {
    if (this._roundEndEmitted) {
      this._log('round end skipped', 'already broadcast');
      return;
    }

    if (this.roundOutcome?.wasGuessed) {
      wasGuessed = true;
      guesserId = this.roundOutcome.guesserId ?? guesserId;
      guesserName = this.roundOutcome.guesserName ?? guesserName;
    } else if (wasGuessed) {
      if (!this.roundEnded) {
        this._log('round end skipped', 'wasGuessed=true but roundEnded not set');
        return;
      }
    } else {
      if (this.roundEnded || this.roundEnding) {
        this._log('round end skipped', 'timeout after guess');
        return;
      }
      if (!this.claimRoundEnd()) {
        this._log('round end skipped', 'already ended');
        return;
      }
    }

    this._roundEndEmitted = true;
    this._log('round ended', wasGuessed ? `guessed by ${guesserName}` : 'timeout');

    this.phase = 'round_end';
    this.timeLeft = 0;
    this.wordSelectTimeLeft = 0;

    const word = this.currentWord;
    this.currentRound += 1;

    // ✅ Store so syncGameState can include them in game_state
    this._lastWasGuessed = wasGuessed;
    this._lastGuesserName = guesserName;

    const roundPayload = {
      word,
      wasGuessed,        // ✅ this is the key field the frontend reads
      guesserId,
      guesserName,
      points,
      scores: this.getLeaderboard(),
      round: this.currentRound,
      totalRounds: this.totalRounds,
      transitionSeconds: ROUND_TRANSITION_MS / 1000,
      drawerName: this.currentDrawerName,
    };

    if (wasGuessed && guesserName) {
      this.room.messageHandler.sendRoundGuessed(guesserName, word);
    } else if (word) {
      this.room.messageHandler.sendRoundTimeout(word);
    }

    if (word) this.events.broadcast('revealWord', { word });
    this.events.broadcast('round_end', roundPayload);
    this.syncGameState({ wasGuessed, guesserName });
    this.broadcastTimerUpdate();

    if (word) {
      gameHistoryService.recordRound(this.historyId, { currentRound: this.currentRound, word, wasGuessed, drawerName: this.currentDrawerName, players: this.room.getPlayerList() })
        .catch((err) => console.error('[Game] recordRound failed', err));
    }

    this.timers.scheduleTransition(ROUND_TRANSITION_MS, async () => {
      this.roundEnding = false;
      this.roundEnded = false;
      this.roundOutcome = null;
      this._roundEndEmitted = false;
      if (this.currentRound >= this.totalRounds) { await this.endGame(); }
      else { this.events.broadcast('canvas_clear'); this.strokeHistory = []; await this.setupTurn(); }
    });
  }

  async endGame() {
    this.timers.clearAll();
    this.phase = 'ended';
    this.roundActive = false;
    const leaderboard = this.getLeaderboard();
    const winner = leaderboard[0] || null;
    await gameHistoryService.completeSession(this.historyId, { winner, leaderboard, currentRound: this.currentRound, totalRounds: this.totalRounds });
    this.historyId = null;
    this.room.broadcast('game_over', { winner, leaderboard });
    this.syncGameState();
  }

  async handleDrawerDisconnect() {
    this._log('drawer disconnect', this.currentDrawerName);
    this.timers.clearAll();
    this.events.broadcast('canvas_clear');
    this.strokeHistory = [];
    if (this.phase === 'drawing' && this.roundActive && !this.roundEnded) { await this.endRound(false); return; }
    if (this.phase === 'word_select' && !this.roundEnded) { await this.skipWordSelection(); }
  }

  abandonHistory() {
    this.timers.clearAll();
    if (this.historyId) { gameHistoryService.abandonSession(this.historyId); this.historyId = null; }
  }

  getLeaderboard() {
    return [...this.room.getPublicPlayers()].sort((a, b) => b.score - a.score);
  }
}

module.exports = { Game };