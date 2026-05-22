function checkGuess(guess, word) {
  const normalizedGuess = guess.trim().toLowerCase();
  const normalizedWord = word.trim().toLowerCase();
  return normalizedGuess === normalizedWord;
}

module.exports = { checkGuess };
