/**
 * Centralized timer management — only one interval/timeout per type at a time.
 */
class GameTimerManager {
  constructor() {
    this.drawInterval = null;
    this.wordSelectInterval = null;
    this.transitionTimeout = null;
  }

  clearDraw() {
    if (this.drawInterval) {
      clearInterval(this.drawInterval);
      this.drawInterval = null;
    }
  }

  clearWordSelect() {
    if (this.wordSelectInterval) {
      clearInterval(this.wordSelectInterval);
      this.wordSelectInterval = null;
    }
  }

  clearTransition() {
    if (this.transitionTimeout) {
      clearTimeout(this.transitionTimeout);
      this.transitionTimeout = null;
    }
  }

  clearAll() {
    this.clearDraw();
    this.clearWordSelect();
    this.clearTransition();
  }

  startWordSelect(onTick) {
    this.clearWordSelect();
    this.wordSelectInterval = setInterval(onTick, 1000);
  }

  startDraw(onTick) {
    this.clearDraw();
    this.drawInterval = setInterval(onTick, 1000);
  }

  scheduleTransition(ms, callback) {
    this.clearTransition();
    this.transitionTimeout = setTimeout(callback, ms);
  }
}

module.exports = { GameTimerManager };
