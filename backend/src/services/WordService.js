class WordService {
  constructor() {
    this.fallbackWords = [];
  }

  setFallback(words) {
    this.fallbackWords = words;
  }

  async pickRandom(count) {
    const pool = [...this.fallbackWords];
    const picked = [];
    while (picked.length < count && pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }
    return picked;
  }
}

const wordService = new WordService();

module.exports = { WordService, wordService };
