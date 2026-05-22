/**
 * Centralized timer management — only one interval/timeout per type at a time.
 */
class GameTimerManager {
  constructor(roomId = '') {
    this.roomId = roomId;
    this.drawInterval = null;
    this.wordSelectInterval = null;
    this.transitionTimeout = null;
  }

  _log(action, type) {
    console.log(`[Timer ${this.roomId}] ${action} ${type}`);
  }

  clearDraw() {
    if (this.drawInterval) {
      clearInterval(this.drawInterval);
      this.drawInterval = null;
      this._log('stop', 'draw');
    }
  }

  clearWordSelect() {
    if (this.wordSelectInterval) {
      clearInterval(this.wordSelectInterval);
      this.wordSelectInterval = null;
      this._log('stop', 'word_select');
    }
  }

  clearTransition() {
    if (this.transitionTimeout) {
      clearTimeout(this.transitionTimeout);
      this.transitionTimeout = null;
      this._log('stop', 'transition');
    }
  }

  clearAll() {
    this.clearDraw();
    this.clearWordSelect();
    this.clearTransition();
  }

  startWordSelect(onTick) {
    this.clearWordSelect();
    this._log('start', 'word_select');
    this.wordSelectInterval = setInterval(onTick, 1000);
  }

  startDraw(onTick) {
    this.clearDraw();
    this._log('start', 'draw');
    this.drawInterval = setInterval(onTick, 1000);
  }

  scheduleTransition(ms, callback) {
    this.clearTransition();
    this._log('start', 'transition');
    this.transitionTimeout = setTimeout(callback, ms);
  }
}

module.exports = { GameTimerManager };
