/**
 * OOP handler for all real-time messages in a room.
 */
class MessageHandler {
  constructor(room) {
    this.room = room;
  }

  broadcast(event, payload) {
    this.room.io.to(this.room.roomId).emit(event, payload);
  }

  emitTo(socketId, event, payload) {
    this.room.io.to(socketId).emit(event, payload);
  }

  sendChat(playerId, playerName, text, options = {}) {
    this.broadcast('chat_message', {
      playerId,
      playerName,
      text,
      isGuess: options.isGuess ?? false,
      isCorrect: options.isCorrect ?? false,
      points: options.points ?? 0,
      system: options.system ?? false,
    });
  }

  sendCorrectGuess(playerId, playerName, guessText, points) {
    const word = this.room.game?.currentWord;

    this.broadcast('guess_result', {
      correct: true,
      playerId,
      playerName,
      points,
      word,
    });

    this.broadcast('correct_guess', {
      playerId,
      playerName,
      guessText,
      points,
      word,
    });

    this.sendChat(playerId, playerName, guessText, {
      isGuess: true,
      isCorrect: true,
      points,
    });
  }

  sendWrongGuess(playerId, playerName, text) {
    this.sendChat(playerId, playerName, text, { isGuess: true, isCorrect: false });
  }
}

module.exports = { MessageHandler };
