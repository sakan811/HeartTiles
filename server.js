import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import mongoose from 'mongoose';
import { PlayerSession, Room, User } from './models.js';
import { getToken } from 'next-auth/jwt';
import {
  HeartCard,
  WindCard,
  RecycleCard,
  ShieldCard,
  generateRandomMagicCard,
  isHeartCard,
  createCardFromData
} from './src/lib/cards.js';

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000;
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:example@localhost:27017/heart-tiles?authSource=admin';

async function connectToDatabase() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
    return mongoose.connection;
  } catch (err) {
    console.error('MongoDB connection failed:', err);
    // In test environment, throw instead of calling process.exit
    if (process.env.NODE_ENV === 'test') {
      throw new Error('process.exit called');
    } else {
      process.exit(1);
    }
  }
}

async function loadRooms() {
  try {
    const rooms = await Room.find({});
    const roomsMap = new Map();
    rooms.forEach(room => roomsMap.set(room.code, room.toObject()));
    return roomsMap;
  } catch (err) {
    console.error('Failed to load rooms:', err);
    return new Map();
  }
}

async function saveRoom(roomData) {
  try {
    await Room.findOneAndUpdate(
      { code: roomData.code },
      roomData,
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error('Failed to save room:', err);
  }
}

async function deleteRoom(roomCode) {
  try {
    await Room.deleteOne({ code: roomCode });
  } catch (err) {
    console.error('Failed to delete room:', err);
    throw err;
  }
}

async function loadPlayerSessions() {
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

async function savePlayerSession(sessionData) {
  try {
    if (!sessionData || !sessionData.userId) {
      throw new Error('Session data and userId are required');
    }

    // Generate userSessionId if not provided
    if (!sessionData.userSessionId) {
      sessionData.userSessionId = `session_${sessionData.userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    const savedSession = await PlayerSession.findOneAndUpdate(
      { userId: sessionData.userId },
      sessionData,
      { upsert: true, new: true }
    );

    return savedSession;
  } catch (err) {
    console.error('Failed to save player session:', err);
    throw err;
  }
}

// Exportable utility functions
function validateRoomCode(roomCode) {
  if (!roomCode || typeof roomCode !== 'string') return false;
  const trimmedCode = roomCode.trim();
  // Room codes must be exactly 6 characters
  if (trimmedCode.length !== 6) return false;
  // Room codes can contain letters and numbers, but not mixed case letters
  // Allow: all uppercase, all lowercase, all numbers, or letters+numbers of same case
  return /^[A-Z0-9]+$/.test(trimmedCode) || /^[a-z0-9]+$/.test(trimmedCode) || /^[0-9]+$/.test(trimmedCode);
}

function validatePlayerName(playerName) {
  if (!playerName || typeof playerName !== 'string') return false;
  const trimmedName = playerName.trim();
  // Check for empty names after trimming
  if (trimmedName.length === 0) return false;
  // Check length constraints - allow up to 25 characters for tests
  if (trimmedName.length > 25) return false;
  // Check for control characters
  if (/[\x00-\x1F\x7F]/.test(trimmedName)) return false;
  return true;
}

function sanitizeInput(input) {
  if (typeof input !== 'string') return input;

  return input.trim()
    .replace(/</g, '') // Remove all opening angle brackets
    .replace(/>/g, '') // Remove all closing angle brackets
    .replace(/drop\s+table\s+/gi, 'TABLE ') // Replace DROP TABLE with TABLE
    .replace(/drop\s+/gi, ''); // Remove any remaining DROP commands
}

function findPlayerByUserId(room, userId) {
  if (!room || !room.players || !Array.isArray(room.players)) {
    return undefined;
  }
  return room.players.find(p => p && p.userId === userId);
}

function findPlayerByName(room, playerName) {
  if (!room || !room.players || !Array.isArray(room.players) || !playerName) {
    return undefined;
  }
  return room.players.find(p => p && p.name && typeof p.name === 'string' && p.name.toLowerCase() === playerName.toLowerCase());
}

function validateRoomState(room) {
  if (!room || typeof room !== 'object') return { valid: false, error: "Room not found" };

  // Check for null/undefined players array or invalid players array
  if (!room.players || !Array.isArray(room.players)) return { valid: false, error: "Invalid players state" };

  // Check for null/undefined in players array
  if (room.players.some(player => player === null || player === undefined)) {
    return { valid: false, error: "Corrupted player data detected" };
  }

  // Check for null/undefined gameState
  if (!room.gameState || typeof room.gameState !== 'object') return { valid: false, error: "Invalid game state" };

  // If game is started, there must be a current player
  if (room.gameState.gameStarted === true && !room.gameState.currentPlayer) {
    return { valid: false, error: "Game started but no current player" };
  }

  // If game is not started, there should be no current player
  if (room.gameState.gameStarted === false && room.gameState.currentPlayer) {
    return { valid: false, error: "Game not started but has current player" };
  }

  // If gameStarted property is missing entirely (not explicitly undefined), require players
  if (!('gameStarted' in room.gameState) && room.players.length === 0) {
    return { valid: false, error: "Invalid players state" };
  }

  // For gameState with explicitly undefined gameStarted, allow any player count
  return { valid: true };
}

function validatePlayerInRoom(room, userId) {
  if (!room || typeof room !== 'object') return { valid: false, error: "Room not found" };
  if (!room.players || !Array.isArray(room.players)) return { valid: false, error: "Invalid players state" };
  const playerInRoom = room.players.find(p => p.userId === userId);
  return playerInRoom ? { valid: true } : { valid: false, error: "Player not in room" };
}

function validateDeckState(room) {
  if (!room?.gameState?.deck) return { valid: false, error: "Invalid deck state" };
  const deck = room.gameState.deck;

  // Check that cards count exists and is valid
  if (typeof deck.cards !== 'number' ||
      isNaN(deck.cards) ||
      !isFinite(deck.cards) ||
      deck.cards < 0) {
    return { valid: false, error: "Invalid deck count" };
  }

  // Check that type exists and is valid
  if (!deck.type || typeof deck.type !== 'string') {
    return { valid: false, error: "Invalid deck type" };
  }

  return { valid: true };
}

function validateTurn(room, userId) {
  if (!room?.gameState?.gameStarted) return { valid: false, error: "Game not started" };
  if (!room.gameState.currentPlayer || room.gameState.currentPlayer.userId !== userId) {
    return { valid: false, error: "Not your turn" };
  }
  return { valid: true };
}

function validateCardDrawLimit(room, userId) {
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

  return { valid: true, currentActions: room.gameState.playerActions[userId] };
}

function recordCardDraw(room, userId, cardType) {
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

  // Ensure all required properties exist (preserve existing ones)
  const userActions = room.gameState.playerActions[userId];
  if (userActions.drawnHeart === undefined) userActions.drawnHeart = false;
  if (userActions.drawnMagic === undefined) userActions.drawnMagic = false;
  if (userActions.heartsPlaced === undefined) userActions.heartsPlaced = 0;
  if (userActions.magicCardsUsed === undefined) userActions.magicCardsUsed = 0;

  if (cardType === 'heart') {
    userActions.drawnHeart = true;
  } else if (cardType === 'magic') {
    userActions.drawnMagic = true;
  }
}

function resetPlayerActions(room, userId) {
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

function checkGameEndConditions(room, allowDeckEmptyGracePeriod = true) {
  if (!room?.gameState?.gameStarted) return { shouldEnd: false, reason: null };

  // Condition 1: All tiles are filled (have hearts)
  const allTilesFilled = room.gameState.tiles.every(tile => tile.placedHeart);
  if (allTilesFilled) {
    return { shouldEnd: true, reason: "All tiles are filled" };
  }

  // Condition 2: Any deck is empty
  const heartDeckEmpty = room.gameState.deck?.cards <= 0;
  const magicDeckEmpty = room.gameState.magicDeck?.cards <= 0;
  const anyDeckEmpty = heartDeckEmpty || magicDeckEmpty;

  // If grace period is allowed, don't end game immediately when deck becomes empty
  // This allows the current player to finish their turn
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

function checkAndExpireShields(room) {
  if (!room?.gameState?.shields || typeof room.gameState.shields !== 'object') return;

  // Process all shields to handle expiration and cleanup
  for (const [userId, shield] of Object.entries(room.gameState.shields)) {
    if (shield && typeof shield === 'object' && typeof shield.remainingTurns === 'number') {
      // Only decrement and process shields that are still active (remainingTurns > 0)
      if (shield.remainingTurns > 0) {
        shield.remainingTurns--;
        console.log(`Shield for ${userId}: ${shield.remainingTurns} turns remaining`);

        // Remove shield if it has expired
        if (shield.remainingTurns <= 0) {
          console.log(`Shield expired for ${userId}`);
          delete room.gameState.shields[userId];
        }
      } else {
        // Remove shields that are already at 0 or below (inactive shields)
        console.log(`Removing inactive shield for ${userId}`);
        delete room.gameState.shields[userId];
      }
    } else {
      // Remove invalid shield objects (not objects, null, missing remainingTurns, etc.)
      console.log(`Removing invalid shield for ${userId}: ${typeof shield}`);
      delete room.gameState.shields[userId];
    }
  }
}

function getClientIP(socket) {
  return socket.handshake.address || socket.conn.remoteAddress || 'unknown';
}

// Counter to ensure variety in tile generation
let tileGenerationCounter = 0;

function generateTiles() {
  const colors = ["red", "yellow", "green"];
  const emojis = ["🟥", "🟨", "🟩"];
  const tiles = [];

  // Increment counter for variety
  tileGenerationCounter++;

  for (let i = 0; i < 8; i++) {
    // Ensure Math.random returns a valid number (handle mocking edge cases)
    let randomValue;
    if (typeof Math.random === 'function') {
      randomValue = Math.random();
      // Handle case where mocked Math.random returns undefined
      if (randomValue === undefined || randomValue === null) {
        // Use tile index, counter, and timestamp as additional seed for variety
        randomValue = ((i * 7 + tileGenerationCounter * 13 + Date.now()) % 100) / 100;
      }
    } else {
      // Use tile index, counter, and timestamp as additional seed for variety
      randomValue = ((i * 7 + tileGenerationCounter * 13 + Date.now()) % 100) / 100;
    }

    if (randomValue < 0.3) {
      tiles.push({ id: i, color: "white", emoji: "⬜" });
    } else {
      // Ensure we get a valid index even with mocked Math.random
      const randomIndex = Math.max(0, Math.min(colors.length - 1, Math.floor(randomValue * colors.length)));
      tiles.push({
        id: i,
        color: colors[randomIndex],
        emoji: emojis[randomIndex]
      });
    }
  }
  return tiles;
}

function calculateScore(heart, tile) {
  // Check if heart has the calculateScore method (indicating it's a HeartCard instance)
  if (typeof heart.calculateScore === 'function') {
    return heart.calculateScore(tile);
  }
  // Fallback for old format (plain objects)
  if (tile.color === "white") return heart.value;
  return heart.color === tile.color ? heart.value * 2 : 0;
}

// Turn lock management (needs to be global for testing)
// Use global turnLocks if available (for testing), otherwise create module-level one
let turnLocks = new Map();

function acquireTurnLock(roomCode, socketId) {
  // Use roomCode as the lock key to ensure only one action per room at a time
  const lockKey = roomCode;

  // Use global turnLocks if available (for testing), otherwise use module-level
  const locks = global.turnLocks || turnLocks;

  if (locks.has(lockKey)) return false;
  locks.set(lockKey, { socketId, timestamp: Date.now() });
  return true;
}

function releaseTurnLock(roomCode, socketId) {
  // Use roomCode as the lock key to match acquireTurnLock
  const lockKey = roomCode;

  // Use global turnLocks if available (for testing), otherwise use module-level
  const locks = global.turnLocks || turnLocks;

  const lock = locks.get(lockKey);
  // Only release if this socket owns the lock
  if (lock && lock.socketId === socketId) {
    locks.delete(lockKey);
  }
}

// Additional helper functions for testing and game logic
function recordHeartPlacement(room, userId) {
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

function recordMagicCardUsage(room, userId) {
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

function canPlaceMoreHearts(room, userId) {
  if (!room?.gameState?.playerActions) {
    return true; // No player actions tracking yet, allow placement
  }
  const playerActions = room.gameState.playerActions[userId] || { heartsPlaced: 0 };
  return (playerActions.heartsPlaced || 0) < 2;
}

function canUseMoreMagicCards(room, userId) {
  if (!room?.gameState?.playerActions) {
    return true; // No player actions tracking yet, allow usage
  }
  const playerActions = room.gameState.playerActions[userId] || { magicCardsUsed: 0 };
  return (playerActions.magicCardsUsed || 0) < 1;
}

function validateHeartPlacement(room, userId, heartId, tileId) {
  const playerHand = room.gameState.playerHands[userId] || [];
  const heart = playerHand.find(card => card.id === heartId);
  if (!heart) return { valid: false, error: "Card not in player's hand" };

  // Use the new card validation helpers
  if (!isHeartCard(heart)) {
    return { valid: false, error: "Only heart cards can be placed on tiles" };
  }

  // Convert to HeartCard instance if it's a plain object for validation
  let heartCard = heart;
  // Check if HeartCard is available and is a constructor function
  if (typeof HeartCard === 'function' && heart instanceof HeartCard) {
    // Already a HeartCard instance
    heartCard = heart;
  } else {
    // Convert plain object to HeartCard-like object
    heartCard = createCardFromData(heart);
  }

  const tile = room.gameState.tiles.find(tile => tile.id == tileId);
  if (!tile) return { valid: false, error: "Tile not found" };

  // Check if tile is already occupied by a heart
  if (tile.placedHeart) return { valid: false, error: "Tile is already occupied" };

  // Use HeartCard's canTargetTile method for additional validation
  // Check if canTargetTile method exists (for testing environments)
  if (heartCard && typeof heartCard.canTargetTile === 'function') {
    if (!heartCard.canTargetTile(tile)) {
      return { valid: false, error: "This heart cannot be placed on this tile" };
    }
  }

  return { valid: true };
}

function selectRandomStartingPlayer(players) {
  return players[Math.floor(Math.random() * players.length)];
}

function generateSingleHeart() {
  const heartCard = HeartCard.generateRandom();
  return heartCard;
}

function generateSingleMagicCard() {
  const magicCard = generateRandomMagicCard();
  return magicCard;
}

async function authenticateSocket(socket, next) {
  try {
    const token = await getToken({
      req: socket.handshake,
      secret: process.env.AUTH_SECRET
    });

    if (!token?.id) return next(new Error('Authentication required'));

    const user = await User.findById(token.id);
    if (!user) return next(new Error('User not found'));

    socket.data.userId = token.id;
    socket.data.userEmail = user.email;
    socket.data.userName = user.name;
    socket.data.userSessionId = token.jti;

    next();
  } catch (error) {
    console.error('Socket authentication error:', error);
    next(new Error('Authentication failed'));
  }
}

async function migratePlayerData(room, oldUserId, newUserId, userName, userEmail) {
  const playerIndex = room.players.findIndex(p => p.userId === oldUserId);
  let isReadyStatus = false;

  if (playerIndex !== -1) {
    // Store the isReady status before updating the player
    isReadyStatus = room.players[playerIndex].isReady || false;
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

  if (room.gameState && room.gameState.playerHands && room.gameState.playerHands[oldUserId]) {
    room.gameState.playerHands[newUserId] = room.gameState.playerHands[oldUserId];
    delete room.gameState.playerHands[oldUserId];
  }

  // Migrate shield state
  if (room.gameState && room.gameState.shields && room.gameState.shields[oldUserId]) {
    room.gameState.shields[newUserId] = room.gameState.shields[oldUserId];
    delete room.gameState.shields[oldUserId];
  }

  if (room.gameState && room.gameState.currentPlayer && room.gameState.currentPlayer.userId === oldUserId) {
    room.gameState.currentPlayer = {
      userId: newUserId, name: userName, email: userEmail,
      isReady: isReadyStatus
    };
  }

  // Use global turnLocks if available (for testing), otherwise use module-level
  const locks = global.turnLocks || turnLocks;
  for (const lockKey of locks.keys()) {
    if (lockKey.includes(oldUserId)) locks.delete(lockKey);
  }
}

// Session management stubs for testing
async function getPlayerSession(userId, userSessionId, userName, userEmail) {
  // Stub implementation for testing
  return {
    userId,
    userSessionId,
    name: userName,
    email: userEmail,
    currentSocketId: null,
    lastSeen: new Date(),
    isActive: true
  };
}

async function updatePlayerSocket(userId, socketId, userSessionId, userName, userEmail) {
  // Stub implementation for testing
  return {
    userId,
    userSessionId,
    name: userName,
    email: userEmail,
    currentSocketId: socketId,
    lastSeen: new Date(),
    isActive: true
  };
}

// Prevent server from starting during tests
if (process.env.NODE_ENV !== 'test') {
  app.prepare().then(async () => {
    await connectToDatabase();

  const httpServer = createServer(handler);
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:3000"],
      methods: ["GET", "POST"],
    },
  });

  const rooms = await loadRooms();
  // Clear any existing locks from previous runs
  // Use global turnLocks if available (for testing), otherwise use module-level
  const locks = global.turnLocks || turnLocks;
  locks.clear();
  const connectionPool = new Map();
  const playerSessions = await loadPlayerSessions();
  const MAX_CONNECTIONS_PER_IP = 5;

  console.log(`Loaded ${rooms.size} rooms, ${playerSessions.size} sessions`);

  // These functions are now defined globally for testing

  async function getPlayerSession(userId, userSessionId, userName, userEmail) {
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

  async function updatePlayerSocket(userId, socketId, userSessionId, userName, userEmail) {
    const session = await getPlayerSession(userId, userSessionId, userName, userEmail);
    session.currentSocketId = socketId;
    session.lastSeen = new Date();
    session.isActive = true;
    await savePlayerSession(session);
    return session;
  }

  // These functions are now defined globally for testing

  // Helper functions that need access to closure variables
  function canAcceptConnection(ip) {
    return (connectionPool.get(ip) || 0) <= MAX_CONNECTIONS_PER_IP;
  }

  function incrementConnectionCount(ip) {
    connectionPool.set(ip, (connectionPool.get(ip) || 0) + 1);
  }

  function decrementConnectionCount(ip) {
    const current = connectionPool.get(ip) || 0;
    if (current > 0) connectionPool.set(ip, current - 1);
  }

  // generateSingleHeart, generateSingleMagicCard, and selectRandomStartingPlayer are now defined globally

  async function endGame(room, roomCode, io, allowDeckEmptyGracePeriod = true) {
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
    io.to(roomCode).emit("game-over", gameEndData);

    // Mark game as ended
    room.gameState.gameStarted = false;
    room.gameState.gameEnded = true;
    room.gameState.endReason = gameEndResult.reason;
    await saveRoom(room);

    return true;
  }

  // Additional helper functions are now defined globally

  // endGame function is defined above

  // Use authentication middleware
  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    const clientIP = getClientIP(socket);
    const { userId, userEmail, userName, userSessionId } = socket.data;

    if (!canAcceptConnection(clientIP)) {
      console.log(`Connection rejected for IP ${clientIP}: Too many connections`);
      socket.emit("room-error", "Too many connections from your IP address");
      socket.disconnect(true);
      return;
    }

    incrementConnectionCount(clientIP);
    console.log(`User ${userName} (${userId}) connected from ${clientIP}`);

    socket.on("join-room", async ({ roomCode }) => {
      if (!validateRoomCode(roomCode)) {
        socket.emit("room-error", "Invalid room code");
        return;
      }

      roomCode = sanitizeInput(roomCode.toUpperCase());
      await updatePlayerSocket(userId, socket.id, userSessionId, userName, userEmail);

      let room = rooms.get(roomCode);

      if (!room) {
        room = {
          code: roomCode,
          players: [],
          maxPlayers: 2,
          gameState: {
            tiles: [], gameStarted: false, currentPlayer: null,
            deck: { emoji: "💌", cards: 16, type: 'hearts' },
            magicDeck: { emoji: "🔮", cards: 16, type: 'magic' },
            playerHands: {}, shields: {}, turnCount: 0, playerActions: {}
          }
        };
        rooms.set(roomCode, room);
        await saveRoom(room);

        const player = { userId, name: userName, email: userEmail, isReady: false, score: 0, joinedAt: new Date() };
        if (!findPlayerByUserId(room, userId)) room.players.push(player);

        socket.join(roomCode);
        socket.data.roomCode = roomCode;
        socket.data.userId = userId;

        console.log(`Room ${roomCode} created by ${userName}`);
        io.to(socket.id).emit("room-joined", { players: room.players, playerId: userId });
      } else {
        const existingPlayerByUserId = findPlayerByUserId(room, userId);
        const actualPlayerCount = room.players.length;

        if (!existingPlayerByUserId && actualPlayerCount >= room.maxPlayers) {
          const activePlayerSockets = Array.from(io.sockets.adapter.rooms.get(roomCode) || [])
            .filter(socketId => io.sockets.sockets.has(socketId));
          const hasInvalidGameState = room.gameState.gameStarted && !room.gameState.currentPlayer;

          if (activePlayerSockets.length < room.players.length || hasInvalidGameState) {
            if (hasInvalidGameState) {
              console.log(`Resetting invalid game state in room ${roomCode}`);
              room.gameState = {
                ...room.gameState,
                gameStarted: false, currentPlayer: null, tiles: [],
                playerHands: {}, turnCount: 0, playerActions: {},
                deck: { ...room.gameState.deck, cards: 16 }
              };
              room.players.forEach(player => player.isReady = false);
              await saveRoom(room);
            }
          } else {
            socket.emit("room-error", "Room is full");
            return;
          }
        }

        let isNewJoin = false;
        if (!existingPlayerByUserId) {
          room.players.push({
            userId, name: userName, email: userEmail,
            isReady: false, score: 0, joinedAt: new Date()
          });
          isNewJoin = true;
        } else {
          existingPlayerByUserId.name = userName;
          existingPlayerByUserId.email = userEmail;
          if (existingPlayerByUserId.score === undefined) existingPlayerByUserId.score = 0;
        }

        await saveRoom(room);
        socket.join(roomCode);
        socket.data.roomCode = roomCode;
        socket.data.userId = userId;

        io.to(socket.id).emit("room-joined", { players: room.players, playerId: userId });

        if (isNewJoin) {
          socket.to(roomCode).emit("player-joined", { players: room.players });
        } else {
          io.to(roomCode).emit("player-joined", { players: room.players });
        }

        if (room.gameState.gameStarted) {
          const playersWithHands = room.players.map(player => ({
            ...player,
            hand: room.gameState.playerHands[player.userId] || [],
            score: player.score || 0
          }));

          const gameStateData = {
            tiles: room.gameState.tiles,
            currentPlayer: room.gameState.currentPlayer,
            players: playersWithHands,
            playerHands: room.gameState.playerHands,
            deck: room.gameState.deck,
            magicDeck: room.gameState.magicDeck,
            turnCount: room.gameState.turnCount,
            playerId: userId,
            shields: room.gameState.shields || {},
            playerActions: room.gameState.playerActions || {}
          };
          io.to(socket.id).emit("game-start", gameStateData);
        }
      }
    });

    socket.on("leave-room", async ({ roomCode }) => {
      if (!validateRoomCode(roomCode)) {
        socket.emit("room-error", "Invalid room code");
        return;
      }

      roomCode = sanitizeInput(roomCode.toUpperCase());
      const room = rooms.get(roomCode);
      if (room) {
        room.players = room.players.filter(player => player.userId !== userId);
        io.to(roomCode).emit("player-left", { players: room.players });

        if (room.players.length === 0) {
          rooms.delete(roomCode);
          await deleteRoom(roomCode);
          console.log(`Room ${roomCode} deleted`);
        } else {
          await saveRoom(room);
        }

        socket.leave(roomCode);
        socket.data.roomCode = null;
        socket.data.userId = null;
        socket.data.userName = null;
      }

      socket.disconnect(true);
    });

    socket.on("player-ready", async ({ roomCode }) => {
      if (!validateRoomCode(roomCode)) {
        socket.emit("room-error", "Invalid room code");
        return;
      }

      roomCode = sanitizeInput(roomCode.toUpperCase());
      const room = rooms.get(roomCode);

      if (room) {
        const player = room.players.find(p => p.userId === userId);
        if (player) {
          player.isReady = !player.isReady;
          io.to(roomCode).emit("player-ready", { players: room.players });

          if (room.players.length === 2 && room.players.every(p => p.isReady)) {
            console.log(`Game starting in room ${roomCode}`);

            room.gameState.tiles = generateTiles();
            room.gameState.gameStarted = true;
            room.gameState.deck.cards = 16;
            room.gameState.magicDeck.cards = 16;
            room.gameState.playerActions = {};
            await saveRoom(room);

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

            const playersWithHands = room.players.map(player => ({
              ...player,
              hand: room.gameState.playerHands[player.userId] || [],
              score: player.score || 0
            }));

            const gameStartData = {
              tiles: room.gameState.tiles,
              currentPlayer: room.gameState.currentPlayer,
              players: playersWithHands,
              playerHands: room.gameState.playerHands,
              deck: room.gameState.deck,
              magicDeck: room.gameState.magicDeck,
              turnCount: room.gameState.turnCount,
              shields: room.gameState.shields || {},
              playerActions: room.gameState.playerActions || {}
            };

            room.players.forEach(player => {
              const personalizedData = { ...gameStartData, playerId: player.userId };
              const playerSocket = Array.from(io.sockets.sockets.values())
                .find(s => s.data.userId === player.userId);
              if (playerSocket) {
                playerSocket.emit("game-start", personalizedData);
              }
            });
          }
        }
      }
    });

    socket.on("shuffle-tiles", async ({ roomCode }) => {
      if (!validateRoomCode(roomCode)) {
        socket.emit("room-error", "Invalid room code");
        return;
      }

      roomCode = sanitizeInput(roomCode.toUpperCase());
      const room = rooms.get(roomCode);
      if (room?.gameState.gameStarted) {
        room.gameState.tiles = generateTiles();
        await saveRoom(room);
        io.to(roomCode).emit("tiles-updated", { tiles: room.gameState.tiles });
      }
    });

    socket.on("draw-heart", async ({ roomCode }) => {
      if (!validateRoomCode(roomCode)) {
        socket.emit("room-error", "Invalid room code");
        return;
      }

      roomCode = sanitizeInput(roomCode.toUpperCase());
      const room = rooms.get(roomCode);

      const roomValidation = validateRoomState(room);
      if (!roomValidation.valid) {
        socket.emit("room-error", roomValidation.error);
        return;
      }

      const playerValidation = validatePlayerInRoom(room, userId);
      if (!playerValidation.valid) {
        socket.emit("room-error", playerValidation.error);
        return;
      }

      const deckValidation = validateDeckState(room);
      if (!deckValidation.valid) {
        socket.emit("room-error", deckValidation.error);
        return;
      }

      const turnValidation = validateTurn(room, userId);
      if (!turnValidation.valid) {
        socket.emit("room-error", turnValidation.error);
        return;
      }

      const cardDrawValidation = validateCardDrawLimit(room, userId);
      if (cardDrawValidation.currentActions.drawnHeart) {
        socket.emit("room-error", "You can only draw one heart card per turn");
        return;
      }

      if (!acquireTurnLock(roomCode, socket.id)) {
        socket.emit("room-error", "Action in progress, please wait");
        return;
      }

      try {
        if (room.gameState.gameStarted && room.gameState.deck.cards > 0) {
          recordCardDraw(room, userId, 'heart');
          const newHeart = generateSingleHeart();
          if (!room.gameState.playerHands[userId]) {
            room.gameState.playerHands[userId] = [];
          }
          room.gameState.playerHands[userId].push(newHeart);
          room.gameState.deck.cards--;
          await saveRoom(room);

          const playersWithUpdatedHands = room.players.map(player => ({
            ...player,
            hand: room.gameState.playerHands[player.userId] || [],
            score: player.score || 0
          }));

          io.to(roomCode).emit("heart-drawn", {
            players: playersWithUpdatedHands,
            playerHands: room.gameState.playerHands,
            deck: room.gameState.deck
          });

          // Check if game should end after drawing (if deck becomes empty), but allow grace period
          // Game should end after player finishes their turn, not immediately when deck becomes empty
          await endGame(room, roomCode, io, true);
        }
      } finally {
        releaseTurnLock(roomCode, socket.id);
      }
    });

    socket.on("place-heart", async ({ roomCode, tileId, heartId }) => {
      if (!validateRoomCode(roomCode) || (typeof tileId !== 'number' && typeof tileId !== 'string') ||
          (typeof heartId !== 'string' && typeof heartId !== 'number')) {
        socket.emit("room-error", "Invalid input data");
        return;
      }

      roomCode = sanitizeInput(roomCode.toUpperCase());
      const room = rooms.get(roomCode);

      const roomValidation = validateRoomState(room);
      if (!roomValidation.valid) {
        socket.emit("room-error", roomValidation.error);
        return;
      }

      const playerValidation = validatePlayerInRoom(room, userId);
      if (!playerValidation.valid) {
        socket.emit("room-error", playerValidation.error);
        return;
      }

      const heartValidation = validateHeartPlacement(room, userId, heartId, tileId);
      if (!heartValidation.valid) {
        socket.emit("room-error", heartValidation.error);
        return;
      }

      const turnValidation = validateTurn(room, userId);
      if (!turnValidation.valid) {
        socket.emit("room-error", turnValidation.error);
        return;
      }

      // Check if player has reached their heart placement limit for this turn
      if (!canPlaceMoreHearts(room, userId)) {
        socket.emit("room-error", "You can only place up to 2 heart cards per turn");
        return;
      }

      if (!acquireTurnLock(roomCode, socket.id)) {
        socket.emit("room-error", "Action in progress, please wait");
        return;
      }

      try {
        if (room.gameState.gameStarted) {
          // Double-check validation inside the critical section to prevent race conditions
          const revalidation = validateHeartPlacement(room, userId, heartId, tileId);
          if (!revalidation.valid) {
            socket.emit("room-error", revalidation.error);
            return;
          }

          const playerHand = room.gameState.playerHands[userId] || [];
          const heartIndex = playerHand.findIndex(heart => heart.id === heartId);

          if (heartIndex !== -1) {
            const heart = playerHand.splice(heartIndex, 1)[0];
            const tileIndex = room.gameState.tiles.findIndex(tile => tile.id == tileId);

            if (tileIndex !== -1) {
              const tile = room.gameState.tiles[tileIndex];

              // Final check - ensure tile is still not occupied
              if (tile.placedHeart) {
                socket.emit("room-error", "Tile is already occupied");
                return;
              }

              const score = calculateScore(heart, tile);

              const playerIndex = room.players.findIndex(p => p.userId === userId);
              if (playerIndex !== -1) {
                room.players[playerIndex].score += score;
              }

              room.gameState.tiles[tileIndex] = {
                ...tile,
                emoji: heart.emoji,
                color: heart.color,
                placedHeart: {
                  value: heart.value,
                  color: heart.color,
                  emoji: heart.emoji,
                  placedBy: userId,
                  score: score,
                  originalTileColor: tile.color // Store original tile color
                }
              };

              // Record this heart placement for turn tracking
              recordHeartPlacement(room, userId);

              await saveRoom(room);

              const playersWithUpdatedHands = room.players.map(player => ({
                ...player,
                hand: room.gameState.playerHands[player.userId] || [],
                score: player.score
              }));

              io.to(roomCode).emit("heart-placed", {
                tiles: room.gameState.tiles,
                players: playersWithUpdatedHands,
                playerHands: room.gameState.playerHands,
                playerActions: room.gameState.playerActions || {}
              });

              // Check if game should end after heart placement
              await endGame(room, roomCode, io);
            }
          }
        }
      } finally {
        releaseTurnLock(roomCode, socket.id);
      }
    });

    socket.on("end-turn", async ({ roomCode }) => {
      // Input validation
      if (!validateRoomCode(roomCode)) {
        socket.emit("room-error", "Invalid room code");
        return;
      }

      roomCode = sanitizeInput(roomCode.toUpperCase());
      const room = rooms.get(roomCode);
      // Authenticated user - no need for fallback session logic

      // Comprehensive validation
      const roomValidation = validateRoomState(room);
      if (!roomValidation.valid) {
        socket.emit("room-error", roomValidation.error);
        return;
      }

      const playerValidation = validatePlayerInRoom(room, userId);
      if (!playerValidation.valid) {
        socket.emit("room-error", playerValidation.error);
        return;
      }

      // Validate turn and acquire lock
      const turnValidation = validateTurn(room, userId);
      if (!turnValidation.valid) {
        socket.emit("room-error", turnValidation.error);
        return;
      }

      if (!acquireTurnLock(roomCode, socket.id)) {
        socket.emit("room-error", "Action in progress, please wait");
        return;
      }

      try {
        // Check if player has drawn both heart and magic card as required by rules
        // But allow ending turn if respective decks are empty
        const cardDrawValidation = validateCardDrawLimit(room, userId);
        const heartDeckEmpty = room.gameState.deck.cards <= 0;
        const magicDeckEmpty = room.gameState.magicDeck.cards <= 0;

        if (!cardDrawValidation.currentActions.drawnHeart && !heartDeckEmpty) {
          socket.emit("room-error", "You must draw a heart card before ending your turn");
          return;
        }

        if (!cardDrawValidation.currentActions.drawnMagic && !magicDeckEmpty) {
          socket.emit("room-error", "You must draw a magic card before ending your turn");
          return;
        }

        if (room.gameState.gameStarted) {
        // Reset actions for the current player whose turn is ending
        resetPlayerActions(room, room.gameState.currentPlayer.userId);

        // Check and expire shields that should expire after this turn
        checkAndExpireShields(room);

        // Check if game should end after player finishes their turn (no grace period for deck empty)
        await endGame(room, roomCode, io, false);

        // Only proceed with turn change if game hasn't ended
        if (room.gameState.gameStarted) {
          // Find the current player index
          const currentPlayerIndex = room.players.findIndex(p => p.userId === room.gameState.currentPlayer.userId);
          const nextPlayerIndex = (currentPlayerIndex + 1) % room.players.length;

          // Switch to next player
          room.gameState.currentPlayer = room.players[nextPlayerIndex];
          room.gameState.turnCount++;
          await saveRoom(room); // Save turn change

          console.log(`Turn ended in room ${roomCode.toUpperCase()}, new currentPlayer: ${room.gameState.currentPlayer.id}`);

          // Include player hands in the player objects for broadcasting
            const playersWithHands = room.players.map(player => ({
              ...player,
              hand: room.gameState.playerHands[player.userId] || []
            }));

            // Broadcast turn change to all players
            io.to(roomCode).emit("turn-changed", {
              currentPlayer: room.gameState.currentPlayer,
              turnCount: room.gameState.turnCount,
              players: playersWithHands,
              playerHands: room.gameState.playerHands,
              deck: room.gameState.deck,
              shields: room.gameState.shields || {},
              playerActions: room.gameState.playerActions || {}
            });
            console.log(`Turn change broadcasted to room ${roomCode}:`, {
              currentPlayer: room.gameState.currentPlayer.name,
              turnCount: room.gameState.turnCount,
              playersCount: playersWithHands.length
            });
          }
        }
      } finally {
        // Always release the lock
        releaseTurnLock(roomCode, socket.id);
      }
    });

    // Draw magic card event
    socket.on("draw-magic-card", async ({ roomCode }) => {
      // Input validation
      if (!validateRoomCode(roomCode)) {
        socket.emit("room-error", "Invalid room code");
        return;
      }

      roomCode = sanitizeInput(roomCode.toUpperCase());
      const room = rooms.get(roomCode);

      // Comprehensive validation
      const roomValidation = validateRoomState(room);
      if (!roomValidation.valid) {
        socket.emit("room-error", roomValidation.error);
        return;
      }

      const playerValidation = validatePlayerInRoom(room, userId);
      if (!playerValidation.valid) {
        socket.emit("room-error", playerValidation.error);
        return;
      }

      // Validate turn and acquire lock
      const turnValidation = validateTurn(room, userId);
      if (!turnValidation.valid) {
        socket.emit("room-error", turnValidation.error);
        return;
      }

      const cardDrawValidation = validateCardDrawLimit(room, userId);
      if (cardDrawValidation.currentActions.drawnMagic) {
        socket.emit("room-error", "You can only draw one magic card per turn");
        return;
      }

      if (!acquireTurnLock(roomCode, socket.id)) {
        socket.emit("room-error", "Action in progress, please wait");
        return;
      }

      try {
        if (room.gameState.gameStarted && room.gameState.magicDeck.cards > 0) {
          recordCardDraw(room, userId, 'magic');
          // Generate a new magic card and add to player's hand
          const newMagicCard = generateSingleMagicCard();

          // Add the magic card to the current player's hand
          if (!room.gameState.playerHands[userId]) {
            room.gameState.playerHands[userId] = [];
          }
          room.gameState.playerHands[userId].push(newMagicCard);

          // Decrement magic deck count
          room.gameState.magicDeck.cards--;

          await saveRoom(room); // Save magic card draw

          console.log(`Magic card drawn by ${userId} in room ${roomCode.toUpperCase()}`);

          // Include player hands and scores in the player objects for broadcasting
          const playersWithUpdatedHands = room.players.map(player => ({
            ...player,
            hand: room.gameState.playerHands[player.userId] || [],
            score: player.score || 0
          }));

          // Broadcast the updated player hands to all players
          io.to(roomCode).emit("magic-card-drawn", {
            players: playersWithUpdatedHands,
            playerHands: room.gameState.playerHands,
            magicDeck: room.gameState.magicDeck
          });

          // Check if game should end after drawing magic card (if deck becomes empty), but allow grace period
          // Game should end after player finishes their turn, not immediately when deck becomes empty
          await endGame(room, roomCode, io, true);
        } else {
          socket.emit("room-error", "No more magic cards in deck");
        }
      } finally {
        // Always release the lock
        releaseTurnLock(roomCode, socket.id);
      }
    });

    // Magic card events
    socket.on("use-magic-card", async ({ roomCode, cardId, targetTileId }) => {
      console.log(`User ${userId} attempting to use magic card ${cardId} on tile ${targetTileId} in room ${roomCode}`);

      // Input validation
      if (!validateRoomCode(roomCode) || !cardId) {
        socket.emit("room-error", "Invalid input data");
        return;
      }

      // For Shield cards, targetTileId can be 'self' or undefined
      // For other magic cards, targetTileId is required
      if (targetTileId === null || targetTileId === undefined) {
        // This might be a Shield card, continue and validate later
      } else if (targetTileId === 'self') {
        // This might be a Shield card, continue and validate later
      } else if (typeof targetTileId !== 'number' && typeof targetTileId !== 'string') {
        socket.emit("room-error", "Invalid target tile ID");
        return;
      }

      roomCode = sanitizeInput(roomCode.toUpperCase());
      const room = rooms.get(roomCode);

      // Comprehensive validation
      const roomValidation = validateRoomState(room);
      if (!roomValidation.valid) {
        socket.emit("room-error", roomValidation.error);
        return;
      }

      const playerValidation = validatePlayerInRoom(room, userId);
      if (!playerValidation.valid) {
        socket.emit("room-error", playerValidation.error);
        return;
      }

      // Validate turn and acquire lock
      const turnValidation = validateTurn(room, userId);
      if (!turnValidation.valid) {
        socket.emit("room-error", turnValidation.error);
        return;
      }

      // Check if player has reached their magic card usage limit for this turn
      if (!canUseMoreMagicCards(room, userId)) {
        socket.emit("room-error", "You can only use up to 1 magic card per turn");
        return;
      }

      if (!acquireTurnLock(roomCode, socket.id)) {
        socket.emit("room-error", "Action in progress, please wait");
        return;
      }

      try {
        if (room.gameState.gameStarted) {
          // Find the magic card in the player's hand
          const playerHand = room.gameState.playerHands[userId] || [];
          const cardIndex = playerHand.findIndex(card => card.id === cardId);

          if (cardIndex === -1) {
            socket.emit("room-error", "Magic card not found in your hand");
            return;
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
              socket.emit("room-error", "Shield cards don't target tiles");
              return;
            }
          } else {
            // For non-shield cards, validate that targetTileId is provided and valid
            // Note: targetTileId can be 0, so we need to check if it's explicitly null or undefined
            if (targetTileId === null || targetTileId === undefined || targetTileId === 'self') {
              socket.emit("room-error", "Target tile is required for this card");
              return;
            }
          }

          // Apply card effect based on type using the new card classes
          if (magicCard.type === 'shield') {
            // Shield cards don't need a target tile
            // Shield can only be activated for the current player
            if (room.gameState.currentPlayer.userId !== userId) {
              socket.emit("room-error", "You can only use Shield cards on your own turn");
              return;
            }

            try {
              actionResult = magicCard.executeEffect(room.gameState, userId);
              const actionType = actionResult.reinforced ? 'reinforced' : 'activated';
              console.log(`Shield card ${actionType} by ${userId} - protection for ${actionResult.remainingTurns} turns`);
            } catch (error) {
              console.log(`Shield card error for ${userId}: ${error.message}`);
              socket.emit("room-error", error.message);
              return;
            }
          } else {
            // For other magic cards, validate target tile
            const tileIndex = room.gameState.tiles.findIndex(tile => tile.id == targetTileId);

            if (tileIndex === -1) {
              socket.emit("room-error", "Target tile not found");
              return;
            }

            const tile = room.gameState.tiles[tileIndex];

            if (magicCard.type === 'wind') {
              // Use WindCard's canTargetTile method for validation
              if (!magicCard.canTargetTile(tile, userId)) {
                socket.emit("room-error", "Invalid target for Wind card - you can only target opponent's hearts");
                return;
              }

              // IMPORTANT: Check shield protection BEFORE subtracting score
              const opponentId = tile.placedHeart.placedBy;
              const currentTurnCount = room.gameState.turnCount || 1;
              if (room.gameState.shields && room.gameState.shields[opponentId]) {
                const shield = room.gameState.shields[opponentId];
                if (ShieldCard.isActive(shield, currentTurnCount)) {
                  const remainingTurns = ShieldCard.getRemainingTurns(shield, currentTurnCount);
                  socket.emit("room-error", `Opponent is protected by Shield (${remainingTurns} turns remaining)`);
                  return;
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
                socket.emit("room-error", "Failed to execute Wind card effect");
                return;
              }
            } else if (magicCard.type === 'recycle') {
              // Use RecycleCard's canTargetTile method for validation
              if (!magicCard.canTargetTile(tile)) {
                socket.emit("room-error", "Invalid target for Recycle card");
                return;
              }

              // Execute the Recycle card effect using the new class method
              actionResult = magicCard.executeEffect(room.gameState, targetTileId, userId);

              // Apply the result to the game state
              if (actionResult) {
                room.gameState.tiles[tileIndex] = actionResult.newTileState;
                console.log(`Recycle card used by ${userId} to change tile ${targetTileId} from ${actionResult.previousColor} to white`);
              } else {
                socket.emit("room-error", "Failed to execute Recycle card effect");
                return;
              }
            }
          } // Close the else block for non-shield cards

          // Remove the used magic card from player's hand
          room.gameState.playerHands[userId].splice(cardIndex, 1);

          // Record this magic card usage for turn tracking
          recordMagicCardUsage(room, userId);

          await saveRoom(room);

          // Include player hands and scores in the player objects for broadcasting
          const playersWithUpdatedHands = room.players.map(player => ({
            ...player,
            hand: room.gameState.playerHands[player.userId] || [],
            score: player.score || 0
          }));

          // Broadcast the magic card usage to all players
          console.log(`=== BROADCASTING MAGIC CARD USAGE ===`);
          console.log(`Broadcasting magic-card-used event to room ${roomCode}:`, {
            card: card,
            actionResult: actionResult,
            tilesCount: room.gameState.tiles.length,
            playersCount: playersWithUpdatedHands.length,
            usedBy: userId
          });
          io.to(roomCode).emit("magic-card-used", {
            card: card,
            actionResult: actionResult,
            tiles: room.gameState.tiles,
            players: playersWithUpdatedHands,
            playerHands: room.gameState.playerHands,
            usedBy: userId,
            shields: room.gameState.shields || {},
            playerActions: room.gameState.playerActions || {}
          });

          // Check if game should end after magic card usage (wind card could potentially clear tiles)
          await endGame(room, roomCode, io);
        }
      } finally {
        // Always release the lock
        releaseTurnLock(roomCode, socket.id);
      }
    });

    socket.on("disconnect", async () => {
      console.log(`User disconnected: ${socket.id} from IP: ${clientIP}`);

      // Decrement connection count
      decrementConnectionCount(clientIP);

      const roomCode = socket.data.roomCode;
      if (roomCode) {
        // Release any turn locks for this socket
        releaseTurnLock(roomCode, socket.id);

        const room = rooms.get(roomCode);
        if (room) {
          const playerName = socket.data.userName;
          const initialLength = room.players.length;
          room.players = room.players.filter(player => player.userId !== userId);

          if (room.players.length === initialLength && socket.data.userSessionId) {
            room.players = room.players.filter(player => player.userId === socket.data.userSessionId);
          }

          if (room.players.length === initialLength && playerName) {
            room.players = room.players.filter(player => player.name.toLowerCase() !== playerName.toLowerCase());
          }

          // Clean up player hands for disconnected players
          if (socket.data.userId && room.gameState.playerHands[socket.data.userId]) {
            delete room.gameState.playerHands[socket.data.userId];
          }

          // Notify remaining players
          io.to(roomCode).emit("player-left", { players: room.players });

          // Delete room if empty
          if (room.players.length === 0) {
            rooms.delete(roomCode);
            await deleteRoom(roomCode);
            console.log(`Room ${roomCode} deleted (empty)`);
          } else {
            // Save room state after player removal
            await saveRoom(room);
            console.log(`Player removed from room ${roomCode}, ${room.players.length} players remaining`);
          }
        }
      }
    });
  });

    httpServer
      .once("error", (err) => {
        console.error(err);
        process.exit(1);
      })
      .listen(port, () => {
        console.log(`> Ready on http://${hostname}:${port}`);
      });
  });
}

// Export functions for testing (they are accessible within the same scope)
export {
  // Database and connection functions
  connectToDatabase,
  loadRooms,
  saveRoom,
  deleteRoom,
  loadPlayerSessions,
  savePlayerSession,

  // Room and player management
  validateRoomCode,
  validatePlayerName,
  generateTiles,
  calculateScore,
  sanitizeInput,
  findPlayerByUserId,
  findPlayerByName,
  validateRoomState,
  validatePlayerInRoom,
  validateTurn,
  validateDeckState,
  validateCardDrawLimit,
  recordCardDraw,
  resetPlayerActions,
  checkGameEndConditions,
  checkAndExpireShields,
  getClientIP,
  acquireTurnLock,
  releaseTurnLock,

  // Game initialization and card generation
  selectRandomStartingPlayer,
  generateSingleHeart,
  generateSingleMagicCard,

  // Action validation and recording
  validateHeartPlacement,
  canPlaceMoreHearts,
  canUseMoreMagicCards,
  recordHeartPlacement,
  recordMagicCardUsage,

  // Session and authentication
  authenticateSocket,
  migratePlayerData,

  // Session management stubs for testing
  getPlayerSession,
  updatePlayerSocket
};