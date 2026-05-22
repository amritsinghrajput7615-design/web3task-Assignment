const mongoose = require('mongoose');

class Database {
  constructor() {
    this.connected = false;
  }

  async connect() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.warn('MONGODB_URI not set — game history will not be persisted');
      return false;
    }

    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 8000,
        maxPoolSize: 10,
      });

      mongoose.connection.on('disconnected', () => {
        this.connected = false;
        console.warn('MongoDB disconnected');
      });

      mongoose.connection.on('reconnected', () => {
        this.connected = true;
        console.log('MongoDB reconnected');
      });

      this.connected = true;
      console.log('MongoDB connected (game history persistence enabled)');
      return true;
    } catch (error) {
      console.error('MongoDB connection failed:', error.message);
      this.connected = false;
      return false;
    }
  }

  isConnected() {
    return this.connected && mongoose.connection.readyState === 1;
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
