// Test utilities for server.js - extracted functions for integration testing
import {
  HeartCard,
  WindCard,
  RecycleCard,
  ShieldCard,
  generateRandomMagicCard,
  isHeartCard,
  isMagicCard,
  createCardFromData
} from '../../src/lib/cards.js';
import mongoose from 'mongoose';
import { PlayerSession, Room, User } from '../../models.js';
import { getToken } from 'next-auth/jwt';

// Database connection functions
export async function connectToDatabase() {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:example@localhost:27017/heart-tiles-test?authSource=admin';

  // Enhanced connection options for CI environment
  const connectionOptions = {
    serverSelectionTimeoutMS: 30000, // Increase timeout to 30s for CI
    bufferTimeoutMS: 30000, // Increase buffer timeout to 30s
    maxPoolSize: 10, // Connection pooling
    retryWrites: true, // Enable retry writes
    // Additional options for CI reliability
    connectTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    // Use only supported Mongoose options
    bufferCommands: false, // Disable command buffering
  };

  // Retry logic for CI environment
  const maxRetries = process.env.NODE_ENV === 'test' ? 3 : 1;
  const retryDelay = 2000; // 2 seconds between retries

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Check if already connected
      if (mongoose.connection.readyState === 1) {
        console.log('Already connected to test MongoDB');
        return;
      }

      // Connect with enhanced options
      await mongoose.connect(MONGODB_URI, connectionOptions);
      console.log('Connected to test MongoDB');
      return; // Success, exit the retry loop
    } catch (err) {
      console.error(`MongoDB connection attempt ${attempt} failed:`, err.message);

      if (attempt === maxRetries) {
        console.error('All MongoDB connection attempts failed');
        throw err;
      }

      console.log(`Retrying MongoDB connection in ${retryDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
}

export async function disconnectDatabase() {
  try {
    // Only disconnect if connected
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('Disconnected from test MongoDB');
    } else {
      console.log('Already disconnected from test MongoDB');
    }
  } catch (err) {
    console.error('MongoDB disconnection failed:', err);
    throw err;
  }
}

export async function clearDatabase() {
  try {
    // Check if connected before attempting to clear
    if (mongoose.connection.readyState !== 1) {
      console.log('Database not connected, skipping clear');
      return;
    }

    await Promise.all([
      Room.deleteMany({}),
      PlayerSession.deleteMany({}),
      User.deleteMany({})
    ]);
    console.log('Test database cleared');
  } catch (err) {
    console.error('Failed to clear database:', err);
    // Don't throw error, just log it to avoid breaking tests
  }
}

// Room management functions
export async function loadRooms() {
  try {
    const rooms = await Room.find({});
    const roomsMap = new Map();
    rooms.forEach(room => {
      const roomObj = room.toObject();
      // Convert plain objects back to Maps for game logic
      if (roomObj.gameState) {
        if (roomObj.gameState.playerHands && typeof roomObj.gameState.playerHands === 'object') {
          roomObj.gameState.playerHands = new Map(Object.entries(roomObj.gameState.playerHands));
        }
        if (roomObj.gameState.shields && typeof roomObj.gameState.shields === 'object') {
          roomObj.gameState.shields = new Map(Object.entries(roomObj.gameState.shields));
        }
        if (roomObj.gameState.playerActions && typeof roomObj.gameState.playerActions === 'object') {
          roomObj.gameState.playerActions = new Map(Object.entries(roomObj.gameState.playerActions));
        }
      }
      roomsMap.set(room.code, roomObj);
    });
    return roomsMap;
  } catch (err) {
    console.error('Failed to load rooms:', err);
    return new Map();
  }
}

export async function saveRoom(roomData) {
  try {
    // Validate input
    if (!roomData) {
      throw new Error('Room data is required');
    }

    if (!roomData.code) {
      throw new Error('Room code is required');
    }

    // Create a deep copy of the room data
    const roomDataToSave = JSON.parse(JSON.stringify(roomData));

    // Convert Map objects to plain objects for database storage (before JSON stringify)
    if (roomData.gameState) {
      if (roomData.gameState.playerHands instanceof Map) {
        roomDataToSave.gameState.playerHands = Object.fromEntries(roomData.gameState.playerHands);
      }
      if (roomData.gameState.shields instanceof Map) {
        roomDataToSave.gameState.shields = Object.fromEntries(roomData.gameState.shields);
      }
      if (roomData.gameState.playerActions instanceof Map) {
        roomDataToSave.gameState.playerActions = Object.fromEntries(roomData.gameState.playerActions);
      }
    }

    const result = await Room.findOneAndUpdate(
      { code: roomData.code },
      roomDataToSave,
      { upsert: true, new: true }
    );
      } catch (err) {
    console.error('Failed to save room:', err);
    throw err;
  }
}

export async function deleteRoom(roomCode) {
  try {
    await Room.deleteOne({ code: roomCode });
  } catch (err) {
    console.error('Failed to delete room:', err);
    throw err;
  }
}

// Player session functions
export async function loadPlayerSessions() {
  try {
    const sessions = await PlayerSession.find({ isActive: true });
    const sessionsMap = new Map();
    sessions.forEach(session => {
      const sessionObj = session.toObject();
      sessionsMap.set(sessionObj.userId, sessionObj);
    });
    return sessionsMap;
  } catch (err) {
    console.error('Failed to load sessions:', err);
    return new Map();
  }
}

export async function savePlayerSession(sessionData) {
  try {
    const result = await PlayerSession.findOneAndUpdate(
      { userId: sessionData.userId },
      sessionData,
      { upsert: true, new: true }
    );
      } catch (err) {
    console.error('Failed to save player session:', err);
    throw err;
  }
}

// Authentication utilities
export async function authenticateSocket(socket, getTokenFn = getToken, UserModel = User) {
  try {
    const token = await getTokenFn({
      req: socket.handshake,
      secret: process.env.AUTH_SECRET
    });

    if (!token?.id) {
      throw new Error('Authentication required');
    }

    const user = await UserModel.findById(token.id);
    if (!user) {
      throw new Error('User not found');
    }

    socket.data.userId = token.id;
    socket.data.userEmail = user.email;
    socket.data.userName = user.name;
    socket.data.userSessionId = token.jti;

    return { authenticated: true, user };
  } catch (error) {
    console.error('Socket authentication error:', error);
    // Re-throw the original error message instead of a generic one
    throw error;
  }
}

// Turn lock management
let turnLocks = new Map();

export function acquireTurnLock(roomCode, userId) {
  const lockKey = `${roomCode}_${userId}`;
  if (turnLocks.has(lockKey)) return false;
  turnLocks.set(lockKey, Date.now());
  return true;
}

export function releaseTurnLock(roomCode, userId) {
  turnLocks.delete(`${roomCode}_${userId}`);
}

export function clearTurnLocks() {
  turnLocks.clear();
}

// Connection pool management
export function createConnectionPool() {
  return new Map();
}

export function canAcceptConnection(connectionPool, ip, maxConnections = 5) {
  return (connectionPool.get(ip) || 0) < maxConnections;
}

export function incrementConnectionCount(connectionPool, ip) {
  connectionPool.set(ip, (connectionPool.get(ip) || 0) + 1);
}

export function decrementConnectionCount(connectionPool, ip) {
  const current = connectionPool.get(ip) || 0;
  if (current > 0) connectionPool.set(ip, current - 1);
}

// Validation functions (same as server.js)
export function validateRoomCode(roomCode) {
  if (!roomCode || typeof roomCode !== 'string') return false;
  return /^[A-Z0-9]{6}$/i.test(roomCode);
}

export function validatePlayerName(playerName) {
  if (!playerName || typeof playerName !== 'string') return false;
  const trimmedName = playerName.trim();
  return trimmedName.length > 0 && trimmedName.length <= 20;
}

export function sanitizeInput(input) {
  return typeof input === 'string' ? input.trim().replace(/[<>]/g, '') : input;
}

export function findPlayerByUserId(room, userId) {
  return room.players.find(p => p.userId === userId);
}

export function findPlayerByName(room, playerName) {
  return room.players.find(p => p.name.toLowerCase() === playerName.toLowerCase());
}

export function validateRoomState(room) {
  if (!room) return { valid: false, error: "Room not found" };
  if (!room.players || !Array.isArray(room.players)) return { valid: false, error: "Invalid players state" };
  if (!room.gameState) return { valid: false, error: "Invalid game state" };
  if (room.gameState.gameStarted && !room.gameState.currentPlayer) {
    return { valid: false, error: "Game started but no current player" };
  }
  return { valid: true };
}

export function validatePlayerInRoom(room, userId) {
  const playerInRoom = room.players.find(p => p.userId === userId);
  return playerInRoom ? { valid: true } : { valid: false, error: "Player not in room" };
}

export function validateDeckState(room) {
  if (!room.gameState.deck) return { valid: false, error: "Invalid deck state" };
  if (typeof room.gameState.deck.cards !== 'number' || room.gameState.deck.cards < 0) {
    return { valid: false, error: "Invalid deck count" };
  }
  return { valid: true };
}

export function validateTurn(room, userId) {
  if (!room?.gameState.gameStarted) return { valid: false, error: "Game not started" };
  if (!room.gameState.currentPlayer || room.gameState.currentPlayer.userId !== userId) {
    return { valid: false, error: "Not your turn" };
  }
  return { valid: true };
}

export function validateCardDrawLimit(room, userId) {
  if (!room.gameState.playerActions) {
    room.gameState.playerActions = {};
  }

  const playerActions = room.gameState.playerActions[userId] || {
    drawnHeart: false,
    drawnMagic: false,
    heartsPlaced: 0,
    magicCardsUsed: 0
  };

  return { valid: true, currentActions: playerActions };
}

// Game state management
export function recordCardDraw(room, userId, cardType) {
  if (!room.gameState.playerActions) {
    room.gameState.playerActions = {};
  }

  if (!room.gameState.playerActions[userId]) {
    room.gameState.playerActions[userId] = {
      drawnHeart: false,
      drawnMagic: false,
      heartsPlaced: 0,
      magicCardsUsed: 0
    };
  }

  if (cardType === 'heart') {
    room.gameState.playerActions[userId].drawnHeart = true;
  } else if (cardType === 'magic') {
    room.gameState.playerActions[userId].drawnMagic = true;
  }
}

export function resetPlayerActions(room, userId) {
  if (!room.gameState.playerActions) {
    room.gameState.playerActions = {};
  }
  room.gameState.playerActions[userId] = {
    drawnHeart: false,
    drawnMagic: false,
    heartsPlaced: 0,
    magicCardsUsed: 0
  };
}

export function checkGameEndConditions(room, allowDeckEmptyGracePeriod = true) {
  if (!room?.gameState?.gameStarted) return { shouldEnd: false, reason: null };

  // Condition 1: All tiles are filled (have hearts)
  const allTilesFilled = room.gameState.tiles.every(tile => tile.placedHeart);
  if (allTilesFilled) {
    return { shouldEnd: true, reason: "All tiles are filled" };
  }

  // Condition 2: Any deck is empty
  const heartDeckEmpty = room.gameState.deck.cards <= 0;
  const magicDeckEmpty = room.gameState.magicDeck.cards <= 0;
  const anyDeckEmpty = heartDeckEmpty || magicDeckEmpty;

  // If grace period is allowed, don't end game immediately when deck becomes empty
  if (anyDeckEmpty && !allowDeckEmptyGracePeriod) {
    if (heartDeckEmpty && magicDeckEmpty) {
      return { shouldEnd: true, reason: "Both decks are empty" };
    } else {
      const emptyDeck = heartDeckEmpty ? "Heart" : "Magic";
      return { shouldEnd: true, reason: `${emptyDeck} deck is empty` };
    }
  }

  return { shouldEnd: false, reason: null };
}

export function checkAndExpireShields(room) {
  if (!room.gameState.shields) return;

  // Decrement remaining turns for all active shields at the end of each turn
  for (const [userId, shield] of Object.entries(room.gameState.shields)) {
    if (shield.remainingTurns > 0) {
      shield.remainingTurns--;
      console.log(`Shield for ${userId}: ${shield.remainingTurns} turns remaining`);

      // Remove shield if it has expired
      if (shield.remainingTurns <= 0) {
        console.log(`Shield expired for ${userId}`);
        delete room.gameState.shields[userId];
      }
    }
  }
}

// Tile and card generation
export function generateTiles() {
  const colors = ["red", "yellow", "green"];
  const emojis = ["🟥", "🟨", "🟩"];
  const tiles = [];

  for (let i = 0; i < 8; i++) {
    if (Math.random() < 0.3) {
      tiles.push({ id: i, color: "white", emoji: "⬜" });
    } else {
      const randomIndex = Math.floor(Math.random() * colors.length);
      tiles.push({
        id: i,
        color: colors[randomIndex],
        emoji: emojis[randomIndex]
      });
    }
  }
  return tiles;
}

export function calculateScore(heart, tile) {
  // Check if heart has the calculateScore method (indicating it's a HeartCard instance)
  if (typeof heart.calculateScore === 'function') {
    return heart.calculateScore(tile);
  }
  // Fallback for old format (plain objects)
  if (tile.color === "white") return heart.value;
  return heart.color === tile.color ? heart.value * 2 : 0;
}

export function generateSingleHeart() {
  const heartCard = HeartCard.generateRandom();
  return heartCard;
}

export function generateSingleMagicCard() {
  const magicCard = generateRandomMagicCard();
  return magicCard;
}

export function selectRandomStartingPlayer(players) {
  return players[Math.floor(Math.random() * players.length)];
}

// Game action functions
export function recordHeartPlacement(room, userId) {
  if (!room.gameState.playerActions) {
    room.gameState.playerActions = {};
  }

  if (!room.gameState.playerActions[userId]) {
    room.gameState.playerActions[userId] = {
      drawnHeart: false,
      drawnMagic: false,
      heartsPlaced: 0,
      magicCardsUsed: 0
    };
  }

  room.gameState.playerActions[userId].heartsPlaced = (room.gameState.playerActions[userId].heartsPlaced || 0) + 1;
}

export function recordMagicCardUsage(room, userId) {
  if (!room.gameState.playerActions) {
    room.gameState.playerActions = {};
  }

  if (!room.gameState.playerActions[userId]) {
    room.gameState.playerActions[userId] = {
      drawnHeart: false,
      drawnMagic: false,
      heartsPlaced: 0,
      magicCardsUsed: 0
    };
  }

  room.gameState.playerActions[userId].magicCardsUsed = (room.gameState.playerActions[userId].magicCardsUsed || 0) + 1;
}

export function canPlaceMoreHearts(room, userId) {
  const playerActions = room.gameState.playerActions[userId] || { heartsPlaced: 0 };
  return (playerActions.heartsPlaced || 0) < 2;
}

export function canUseMoreMagicCards(room, userId) {
  const playerActions = room.gameState.playerActions[userId] || { magicCardsUsed: 0 };
  return (playerActions.magicCardsUsed || 0) < 1;
}

export function validateHeartPlacement(room, userId, heartId, tileId) {
  const playerHand = room.gameState.playerHands[userId] || [];
  const heart = playerHand.find(card => card.id === heartId);
  if (!heart) return { valid: false, error: "Card not in player's hand" };

  // Use the new card validation helpers
  if (!isHeartCard(heart)) {
    return { valid: false, error: "Only heart cards can be placed on tiles" };
  }

  // Convert to HeartCard instance if it's a plain object for validation
  let heartCard = heart;
  if (!(heart instanceof HeartCard)) {
    heartCard = createCardFromData(heart);
  }

  const tile = room.gameState.tiles.find(tile => tile.id == tileId);
  if (!tile) return { valid: false, error: "Tile not found" };

  // Check if tile is already occupied by a heart
  if (tile.placedHeart) return { valid: false, error: "Tile is already occupied" };

  // Use HeartCard's canTargetTile method for additional validation
  if (!heartCard.canTargetTile(tile)) {
    return { valid: false, error: "This heart cannot be placed on this tile" };
  }

  return { valid: true };
}

// Game end and scoring
export async function endGame(room, roomCode, io, allowDeckEmptyGracePeriod = true) {
  const gameEndResult = checkGameEndConditions(room, allowDeckEmptyGracePeriod);
  if (!gameEndResult.shouldEnd) return false;

  console.log(`Game ending in room ${roomCode}: ${gameEndResult.reason}`);

  // Determine winner based on scores
  const sortedPlayers = [...room.players].sort((a, b) => (b.score || 0) - (a.score || 0));
  const winner = sortedPlayers[0];
  const isTie = sortedPlayers.length > 1 && sortedPlayers[0].score === sortedPlayers[1].score;

  const gameEndData = {
    reason: gameEndResult.reason,
    players: room.players.map(player => ({
      ...player,
      hand: room.gameState.playerHands[player.userId] || []
    })),
    winner: isTie ? null : winner,
    isTie: isTie,
    finalScores: room.players.map(player => ({
      userId: player.userId,
      name: player.name,
      score: player.score || 0
    }))
  };

  // Broadcast game over to all players
  if (io) {
    io.to(roomCode).emit("game-over", gameEndData);
  }

  // Mark game as ended
  room.gameState.gameStarted = false;
  room.gameState.gameEnded = true;
  room.gameState.endReason = gameEndResult.reason;

  if (roomCode) {
    await saveRoom(room);
  }

  return true;
}

// Player session utilities
export async function getPlayerSession(playerSessions, userId, userSessionId, userName, userEmail) {
  let session = playerSessions.get(userId);

  if (!session) {
    const newSession = {
      userId, userSessionId, name: userName, email: userEmail,
      currentSocketId: null, lastSeen: new Date(), isActive: true
    };
    playerSessions.set(userId, newSession);
    await savePlayerSession(newSession);
    session = newSession;
  } else {
    session.lastSeen = new Date();
    session.isActive = true;
    await savePlayerSession(session);
  }

  return session;
}

export async function updatePlayerSocket(playerSessions, userId, socketId, userSessionId, userName, userEmail) {
  const session = await getPlayerSession(playerSessions, userId, userSessionId, userName, userEmail);
  session.currentSocketId = socketId;
  session.lastSeen = new Date();
  session.isActive = true;
  await savePlayerSession(session);
  return session;
}

// Migration utilities
export async function migratePlayerData(room, oldUserId, newUserId, userName, userEmail) {
  const playerIndex = room.players.findIndex(p => p.userId === oldUserId);
  if (playerIndex !== -1) {
    room.players[playerIndex] = {
      ...room.players[playerIndex],
      userId: newUserId, name: userName, email: userEmail,
      score: room.players[playerIndex].score || 0
    };
  } else {
    room.players.push({
      userId: newUserId, name: userName, email: userEmail,
      isReady: false, score: 0, joinedAt: new Date()
    });
  }

  if (room.gameState.playerHands[oldUserId]) {
    room.gameState.playerHands[newUserId] = room.gameState.playerHands[oldUserId];
    delete room.gameState.playerHands[oldUserId];
  }

  // Migrate shield state
  if (room.gameState.shields && room.gameState.shields[oldUserId]) {
    room.gameState.shields[newUserId] = room.gameState.shields[oldUserId];
    delete room.gameState.shields[oldUserId];
  }

  if (room.gameState.currentPlayer?.userId === oldUserId) {
    room.gameState.currentPlayer = {
      userId: newUserId, name: userName, email: userEmail,
      isReady: room.players.find(p => p.userId === newUserId)?.isReady || false
    };
  }

  for (const lockKey of turnLocks.keys()) {
    if (lockKey.includes(oldUserId)) turnLocks.delete(lockKey);
  }
}

// IP utilities
export function getClientIP(socket) {
  return socket.handshake.address || socket.conn.remoteAddress || 'unknown';
}

// Magic card execution
export async function executeMagicCard(room, userId, cardId, targetTileId) {
  const playerHand = room.gameState.playerHands[userId] || [];
  const cardIndex = playerHand.findIndex(card => card.id === cardId);

  if (cardIndex === -1) {
    throw new Error("Magic card not found in your hand");
  }

  const card = playerHand[cardIndex];
  let actionResult = null;

  // Convert plain object cards to MagicCard instances if needed
  let magicCard = card;
  if (!(card instanceof WindCard || card instanceof RecycleCard || card instanceof ShieldCard)) {
    magicCard = createCardFromData(card);
  }

  // Validate target based on card type
  if (magicCard.type === 'shield') {
    // Shield cards don't need a target tile, targetTileId should be 'self' or undefined
    if (targetTileId && targetTileId !== 'self') {
      throw new Error("Shield cards don't target tiles");
    }

    // Shield can only be activated for the current player
    if (room.gameState.currentPlayer.userId !== userId) {
      throw new Error("You can only use Shield cards on your own turn");
    }

    try {
      actionResult = magicCard.executeEffect(room.gameState, userId);
      const actionType = actionResult.reinforced ? 'reinforced' : 'activated';
      console.log(`Shield card ${actionType} by ${userId} - protection for ${actionResult.remainingTurns} turns`);
    } catch (error) {
      console.log(`Shield card error for ${userId}: ${error.message}`);
      throw error;
    }
  } else {
    // For non-shield cards, validate that targetTileId is provided and valid
    if (targetTileId === null || targetTileId === undefined || targetTileId === 'self') {
      throw new Error("Target tile is required for this card");
    }

    const tileIndex = room.gameState.tiles.findIndex(tile => tile.id == targetTileId);

    if (tileIndex === -1) {
      throw new Error("Target tile not found");
    }

    const tile = room.gameState.tiles[tileIndex];

    if (magicCard.type === 'wind') {
      // Use WindCard's canTargetTile method for validation
      if (!magicCard.canTargetTile(tile, userId)) {
        throw new Error("Invalid target for Wind card - you can only target opponent's hearts");
      }

      // IMPORTANT: Check shield protection BEFORE subtracting score
      const opponentId = tile.placedHeart.placedBy;
      const currentTurnCount = room.gameState.turnCount || 1;
      if (room.gameState.shields && room.gameState.shields[opponentId]) {
        const shield = room.gameState.shields[opponentId];
        if (ShieldCard.isActive(shield, currentTurnCount)) {
          const remainingTurns = ShieldCard.getRemainingTurns(shield, currentTurnCount);
          throw new Error(`Opponent is protected by Shield (${remainingTurns} turns remaining)`);
        }
      }

      // Get the heart data before executing the effect to calculate score subtraction
      const placedHeart = tile.placedHeart;
      if (placedHeart && placedHeart.score) {
        // Find the player who placed the heart and subtract the points
        const playerIndex = room.players.findIndex(p => p.userId === placedHeart.placedBy);
        if (playerIndex !== -1) {
          room.players[playerIndex].score -= placedHeart.score;
          console.log(`Wind card: subtracted ${placedHeart.score} points from player ${placedHeart.placedBy}`);
        }
      }

      // Execute the Wind card effect using the new class method
      actionResult = magicCard.executeEffect(room.gameState, targetTileId, userId);

      // Apply the result to the game state
      if (actionResult) {
        room.gameState.tiles[tileIndex] = actionResult.newTileState;
        console.log(`Wind card used by ${userId} to remove heart from tile ${targetTileId}`);
      } else {
        throw new Error("Failed to execute Wind card effect");
      }
    } else if (magicCard.type === 'recycle') {
      // Use RecycleCard's canTargetTile method for validation
      if (!magicCard.canTargetTile(tile)) {
        throw new Error("Invalid target for Recycle card");
      }

      // Execute the Recycle card effect using the new class method
      actionResult = magicCard.executeEffect(room.gameState, targetTileId, userId);

      // Apply the result to the game state
      if (actionResult) {
        room.gameState.tiles[tileIndex] = actionResult.newTileState;
        console.log(`Recycle card used by ${userId} to change tile ${targetTileId} from ${actionResult.previousColor} to white`);
      } else {
        throw new Error("Failed to execute Recycle card effect");
      }
    }
  }

  // Remove the used magic card from player's hand
  room.gameState.playerHands[userId].splice(cardIndex, 1);

  // Record this magic card usage for turn tracking
  recordMagicCardUsage(room, userId);

  return actionResult;
}

// Create default room
export function createDefaultRoom(roomCode) {
  return {
    code: roomCode,
    players: [],
    maxPlayers: 2,
    gameState: {
      tiles: [],
      gameStarted: false,
      currentPlayer: null,
      deck: { emoji: "💌", cards: 16, type: 'hearts' },
      magicDeck: { emoji: "🔮", cards: 16, type: 'magic' },
      playerHands: {},
      shields: {},
      turnCount: 0,
      playerActions: {}
    }
  };
}

// Start game utility
export function startGame(room) {
  room.gameState.tiles = generateTiles();
  room.gameState.gameStarted = true;
  room.gameState.deck.cards = 16;
  room.gameState.magicDeck.cards = 16;
  room.gameState.playerActions = {};

  // Deal initial cards
  room.players.forEach(player => {
    room.gameState.playerHands[player.userId] = [];
    for (let i = 0; i < 3; i++) {
      room.gameState.playerHands[player.userId].push(generateSingleHeart());
    }
    for (let i = 0; i < 2; i++) {
      room.gameState.playerHands[player.userId].push(generateSingleMagicCard());
    }
  });

  room.gameState.currentPlayer = selectRandomStartingPlayer(room.players);
  room.gameState.turnCount = 1;

  return room;
}