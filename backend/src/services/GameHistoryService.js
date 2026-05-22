const { database } = require('../config/database');
const { GameHistory } = require('../models/GameHistory');

/**
 * Persists room/game history and leaderboards only.
 * Live gameplay stays in memory; MongoDB is write-focused and non-blocking.
 */
class GameHistoryService {
  _enabled() {
    return database.isConnected();
  }

  _mapPlayers(players) {
    return players.map((p) => ({
      playerId: p.id,
      playerName: p.name,
      finalScore: p.score ?? 0,
    }));
  }

  _mapLeaderboard(leaderboard) {
    return leaderboard.map((p, index) => ({
      rank: index + 1,
      playerId: p.id,
      playerName: p.name,
      score: p.score ?? 0,
    }));
  }

  async startSession(room) {
    if (!this._enabled()) return null;

    try {
      const host = room.getPlayerBySocketId(room.hostId) || room.getPlayerList()[0];
      const hostName = host?.name || 'Host';

      const doc = await GameHistory.create({
        roomId: room.roomId,
        hostName,
        players: this._mapPlayers(room.getPlayerList()),
        totalRounds: room.game.totalRounds || room.settings.rounds * room.getPlayerList().length,
        currentRound: 0,
        wordsUsed: [],
        gameStartTime: new Date(),
        gameEndTime: null,
        status: 'in_progress',
      });

      return doc._id.toString();
    } catch (error) {
      console.error('[GameHistoryService] startSession failed:', error.message);
      return null;
    }
  }

  async recordRound(historyId, payload) {
    if (!this._enabled() || !historyId) return;

    const { currentRound, word, wasGuessed, drawerName, players } = payload;
    if (!word) return;

    try {
      await GameHistory.updateOne(
        { _id: historyId },
        {
          $set: {
            currentRound,
            players: this._mapPlayers(players),
          },
          $push: {
            wordsUsed: {
              word,
              round: currentRound,
              wasGuessed: Boolean(wasGuessed),
              drawerName: drawerName || '',
            },
          },
        }
      );
    } catch (error) {
      console.error('[GameHistoryService] recordRound failed:', error.message);
    }
  }

  async completeSession(historyId, payload) {
    if (!this._enabled() || !historyId) return null;

    const { winner, leaderboard, currentRound, totalRounds } = payload;

    try {
      const doc = await GameHistory.findByIdAndUpdate(
        historyId,
        {
          $set: {
            currentRound,
            totalRounds,
            winner: winner
              ? {
                  playerId: winner.id,
                  playerName: winner.name,
                  score: winner.score ?? 0,
                }
              : null,
            leaderboard: this._mapLeaderboard(leaderboard),
            players: this._mapPlayers(leaderboard),
            gameEndTime: new Date(),
            status: 'completed',
          },
        },
        { new: true }
      ).lean();

      return doc;
    } catch (error) {
      console.error('[GameHistoryService] completeSession failed:', error.message);
      return null;
    }
  }

  async abandonSession(historyId) {
    if (!this._enabled() || !historyId) return;

    try {
      await GameHistory.updateOne(
        { _id: historyId, status: 'in_progress' },
        {
          $set: {
            gameEndTime: new Date(),
            status: 'abandoned',
          },
        }
      );
    } catch (error) {
      console.error('[GameHistoryService] abandonSession failed:', error.message);
    }
  }

  async getByRoomId(roomId, limit = 10) {
    if (!this._enabled()) return [];

    try {
      return await GameHistory.find({ roomId: roomId.toUpperCase() })
        .sort({ gameStartTime: -1 })
        .limit(limit)
        .lean();
    } catch (error) {
      console.error('[GameHistoryService] getByRoomId failed:', error.message);
      return [];
    }
  }

  async getRecentCompleted(limit = 20) {
    if (!this._enabled()) return [];

    try {
      return await GameHistory.find({ status: 'completed' })
        .sort({ gameEndTime: -1 })
        .limit(limit)
        .select('roomId hostName winner leaderboard gameStartTime gameEndTime totalRounds')
        .lean();
    } catch (error) {
      console.error('[GameHistoryService] getRecentCompleted failed:', error.message);
      return [];
    }
  }
}

const gameHistoryService = new GameHistoryService();

module.exports = { GameHistoryService, gameHistoryService };
