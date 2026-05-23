const mongoose = require('mongoose');

class Database {
  constructor() {
    this.connected = false;
    this.lastError = null;
  }

  async connect() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.warn('MONGODB_URI not set — game history will not be persisted');
      return false;
    }

    try {
      mongoose.set('strictQuery', true);

      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
      });

      mongoose.connection.on('disconnected', () => {
        this.connected = false;
        console.warn('MongoDB disconnected');
      });

      mongoose.connection.on('error', (err) => {
        this.lastError = err.message;
        console.error('MongoDB error:', err.message);
      });

      this.connected = true;
      this.lastError = null;
      const dbName = mongoose.connection.db?.databaseName || 'unknown';
      console.log(`MongoDB connected — database: ${dbName}`);
      return true;
    } catch (error) {
      this.lastError = error.message;
      this.connected = false;
      console.error('MongoDB connection failed:', error.message);
      console.error(
        'Tip: In Atlas, whitelist your IP (Network Access) and use the full connection string from Database → Connect.'
      );
      return false;
    }
  }

  isConnected() {
    return this.connected && mongoose.connection.readyState === 1;
  }

  getStatus() {
    return {
      connected: this.isConnected(),
      readyState: mongoose.connection.readyState,
      database: mongoose.connection.db?.databaseName || null,
      lastError: this.lastError,
    };
  }

  async disconnect() {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      this.connected = false;
    }
  }
}

const database = new Database();

module.exports = { database };
