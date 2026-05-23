/**
 * OOP handler for all real-time messages in a room.
 */
class MessageHandler {
  constructor(room) {
    this.room = room;
  }

  maskWordForChat(word) {
    if (typeof word !== 'string' || word.length === 0) {
      return '___';
    }
    return word
      .split('')
      .map((char) => (char === ' ' ? ' ' : '_'))
      .join('');
  }

  broadcast(event, payload) {
    this.room.io.to(this.room.roomId).emit(event, payload);
  }

  emitTo(socketId, event, payload) {
    this.room.io.to(socketId).emit(event, payload);
  }

  sendChat(playerId, playerName, text, options = {}) {
    const msg = {
      playerId,
      playerName,
      text,
      isGuess: options.isGuess ?? false,
      isCorrect: options.isCorrect ?? false,
      points: options.points ?? 0,
      system: options.system ?? false,
      maskedWord: options.maskedWord ?? undefined,
      wordMissed: options.wordMissed ?? undefined,
      revealedWord: options.revealedWord ?? undefined,
    };
    this.room.appendChatMessage(msg);
    this.broadcast('chat_message', msg);
  }

  sendCorrectGuess(playerId, playerName, guessText, points) {
    const word = this.room.game?.currentWord;
    const maskedWord = this.maskWordForChat(word || guessText);

    // ✅ Never broadcast the real word to all clients
    this.broadcast('guess_result', {
      correct: true,
      playerId,
      playerName,
      points,
      word: maskedWord,           // masked for all clients
    });

    this.broadcast('correct_guess', {
      playerId,
      playerName,
      guesserName: playerName,
      guessText: maskedWord,      // mask the submitted guess too
      points,
      word: maskedWord,           // masked for all clients
      wasGuessed: true,
    });

    // ✅ Only the drawer needs the real word — send privately
    const drawerSocketId = this.room.game?.drawerSocketId;
    if (drawerSocketId && word) {
      this.emitTo(drawerSocketId, 'reveal_word', { word });
    }

    this.sendChat(playerId, playerName, `${playerName} guessed correctly! "${maskedWord}"`, {
      isGuess: true,
      isCorrect: true,
      points,
      maskedWord,
    });
  }

  sendRoundGuessed(guesserName, word) {
    this.sendChat('', '', `${guesserName} guessed the word correctly`, {
      system: true,
      isGuess: false,
    });
    this.broadcast('round_guessed', {
      wasGuessed: true,
      guesserName,
      word: this.maskWordForChat(word),   // ✅ mask here too
    });
  }

  sendRoundTimeout(word) {
    const msg = {
      playerId: '',
      playerName: '',
      text: "Time's up! Nobody guessed the word:",
      isGuess: false,
      system: true,
      wordMissed: true,
      revealedWord: word,
    };
    this.room.appendChatMessage(msg);
    this.broadcast('chat_message', msg);
  }

  sendWrongGuess(playerId, playerName, text) {
    this.sendChat(playerId, playerName, text, { isGuess: true, isCorrect: false });
  }
}

module.exports = { MessageHandler };