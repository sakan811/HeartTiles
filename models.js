import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// User Schema
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
  },
  {
    timestamps: true,
  },
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Method to check password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Player Session Schema - Updated to use authenticated user ID
const playerSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userSessionId: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    currentSocketId: {
      type: String,
      default: null,
    },
    clientIP: {
      type: String,
      default: null,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Room Schema
const roomSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      match: /^[A-Z0-9]{6,7}$/,
    },
    players: [
      {
        userId: {
          type: String,
          required: true,
          index: true,
        },
        name: {
          type: String,
          required: true,
        },
        email: {
          type: String,
          required: true,
        },
        isReady: {
          type: Boolean,
          default: false,
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
        score: {
          type: Number,
          default: 0,
        },
      },
    ],
    maxPlayers: {
      type: Number,
      default: 2,
    },
    gameState: {
      tiles: [
        {
          id: {
            type: Number,
            required: true,
          },
          color: {
            type: String,
            required: true,
            enum: ["red", "yellow", "green", "white"],
          },
          emoji: {
            type: String,
            required: true,
          },
          placedHeart: {
            value: {
              type: Number,
              default: 0,
            },
            color: {
              type: String,
              enum: ["red", "yellow", "green"],
            },
            emoji: String,
            placedBy: String,
            score: {
              type: Number,
              default: 0,
            },
          },
        },
      ],
      gameStarted: {
        type: Boolean,
        default: false,
      },
      currentPlayer: {
        userId: String,
        name: String,
        email: String,
        isReady: Boolean,
      },
      deck: {
        emoji: {
          type: String,
          default: "💌",
        },
        cards: {
          type: Number,
          default: 16,
          min: 0,
        },
        type: {
          type: String,
          enum: ["hearts", "magic"],
          default: "hearts",
        },
      },
      magicDeck: {
        emoji: {
          type: String,
          default: "🔮",
        },
        cards: {
          type: Number,
          default: 16,
          min: 0,
        },
        type: {
          type: String,
          enum: ["magic"],
          default: "magic",
        },
      },
      playerHands: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
      turnCount: {
        type: Number,
        default: 0,
      },
      shields: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
      playerActions: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
    },
  },
  {
    timestamps: true,
  },
);

// Note: Indexes are automatically created by unique: true in schema definitions

// Delete room function
export async function deleteRoom(roomCode) {
  try {
    await Room.deleteOne({ code: roomCode });
  } catch (err) {
    console.error("Failed to delete room:", err);
    throw err;
  }
}

// Export models with caching to prevent OverwriteModelError
const User = mongoose.models.User || mongoose.model("User", userSchema);
const PlayerSession =
  mongoose.models.PlayerSession ||
  mongoose.model("PlayerSession", playerSessionSchema);
const Room = mongoose.models.Room || mongoose.model("Room", roomSchema);

export { User, PlayerSession, Room };
