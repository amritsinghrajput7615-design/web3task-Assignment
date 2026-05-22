export function checkGuess(guess: string, word: string): boolean {
  return guess.trim().toLowerCase() === word.trim().toLowerCase();
}