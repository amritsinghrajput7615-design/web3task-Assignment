/**
 * Emits socket events with legacy names + camelCase aliases (same payload).
 * Keeps existing clients working while supporting documented event names.
 */
const ALIASES = {
  round_start: ['roundStarted'],
  round_end: ['roundEnded'],
  round_guessed: ['correctGuess'],
  word_chosen_ack: ['wordSelected'],
  word_select_timeout: ['wordSelectionSkipped'],
  word_select_timer: ['timer_update'],
  timer: ['timer_update'],
  game_state: ['gameStateUpdate'],
  canvas_clear: ['canvasClear'],
  next_drawer: ['nextDrawer'],
  word_selection_started: ['wordSelectionStarted'],
};

class GameEvents {
  constructor(room) {
    this.room = room;
  }

  broadcast(primaryEvent, payload = {}) {
    this.room.io.to(this.room.roomId).emit(primaryEvent, payload);

    const extras = ALIASES[primaryEvent];
    if (extras) {
      for (const alias of extras) {
        this.room.io.to(this.room.roomId).emit(alias, { ...payload, _source: primaryEvent });
      }
    }
  }

  emitTo(socketId, primaryEvent, payload = {}) {
    this.room.io.to(socketId).emit(primaryEvent, payload);
    const extras = ALIASES[primaryEvent];
    if (extras) {
      for (const alias of extras) {
        this.room.io.to(socketId).emit(alias, { ...payload, _source: primaryEvent });
      }
    }
  }
}

module.exports = { GameEvents };
