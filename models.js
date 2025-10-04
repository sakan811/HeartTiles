import mongoose from 'mongoose';

// Player Session Schema
const playerSessionSchema = new mongoose.Schema({
  normalizedName: {
    type: String,
    required: true,
    unique: true
  },
  id: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  originalSocketId: {
    type: String,
    default: null
  },
  currentSocketId: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Room Schema
const roomSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    match: /^[A-Z0-9]{6}$/
  },
  players: [{
    id: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    isReady: {
      type: Boolean,
      default: false
    }
  }],
  maxPlayers: {
    type: Number,
    default: 2
  },
  gameState: {
    tiles: [{
      id: {
        type: Number,
        required: true
      },
      color: {
        type: String,
        required: true,
        enum: ['red', 'yellow', 'green', 'blue', 'brown']
      },
      emoji: {
        type: String,
        required: true
      }
    }],
    gameStarted: {
      type: Boolean,
      default: false
    },
    currentPlayer: {
      id: String,
      name: String,
      isReady: Boolean
    },
    deck: {
      emoji: {
        type: String,
        default: "💌"
      },
      cards: {
        type: Number,
        default: 10,
        min: 0
      }
    },
    playerHands: {
      type: Map,
      of: [{
        id: {
          type: mongoose.Schema.Types.Mixed,
          required: true
        },
        color: {
          type: String,
          required: true,
          enum: ['red', 'yellow', 'green', 'blue', 'brown']
        },
        emoji: {
          type: String,
          required: true
        }
      }]
    },
    turnCount: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Note: Indexes are automatically created by unique: true in schema definitions

// Export models
export const PlayerSession = mongoose.model('PlayerSession', playerSessionSchema);
export const Room = mongoose.model('Room', roomSchema);