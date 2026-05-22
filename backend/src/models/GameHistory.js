const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema(
  {
    playerId: { type: String, required: true },
    playerName: { type: String, required: true },
    finalScore: { type: Number, default: 0 },
  },
  { _id: false }
);

const leaderboardEntrySchema = new mongoose.Schema(
  {
    rank: { type: Number, required: true },
    playerId: String,
    playerName: { type: String, required: true },
    score: { type: Number, default: 0 },
  },
  { _id: false }
);

const wordUsedSchema = new mongoose.Schema(
  {
    word: { type: String, required: true },
    round: { type: Number, required: true },
    wasGuessed: { type: Boolean, default: false },
    drawerName: String,
  },
  { _id: false }
);

const winnerSchema = new mongoose.Schema(
  {
    playerId: String,
    playerName: String,
    score: { type: Number, default: 0 },
  },
  { _id: false }
);

const gameHistorySchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    hostName: { type: String, required: true, trim: true },
    players: { type: [playerSchema], default: [] },
    totalRounds: { type: Number, required: true, min: 1 },
    currentRound: { type: Number, default: 0, min: 0 },
    winner: { type: winnerSchema, default: null },
    leaderboard: { type: [leaderboardEntrySchema], default: [] },
    wordsUsed: { type: [wordUsedSchema], default: [] },
    gameStartTime: { type: Date, required: true },
    gameEndTime: { type: Date, default: null },
    status: {
      type: String,
      enum: ['in_progress', 'completed', 'abandoned'],
      default: 'in_progress',
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
    collection: 'game_histories',
  }
);

gameHistorySchema.index({ roomId: 1, gameStartTime: -1 });
gameHistorySchema.index({ 'winner.playerName': 1, gameEndTime: -1 });

const GameHistory = mongoose.model('GameHistory', gameHistorySchema);

module.exports = { GameHistory };
