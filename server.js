import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import mongoose from 'mongoose';
import { PlayerSession, Room, User } from './models.ts';
import { getToken } from 'next-auth/jwt';

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000;
// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

// MongoDB configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:example@localhost:27017/no-kitty-cards?authSource=admin';

// Database functions
async function connectToDatabase() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('Error connecting to MongoDB:', err);
    process.exit(1);
  }
}

async function loadRooms() {
  try {
    const rooms = await Room.find({});
    const roomsMap = new Map();
    rooms.forEach(room => {
      roomsMap.set(room.code, room.toObject());
    });
    return roomsMap;
  } catch (err) {
    console.error('Error loading rooms:', err);
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
    console.error('Error saving room:', err);
  }
}

async function deleteRoom(roomCode) {
  try {
    await Room.deleteOne({ code: roomCode });
  } catch (err) {
    console.error('Error deleting room:', err);
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
    console.error('Error loading sessions:', err);
    return new Map();
  }
}

async function savePlayerSession(sessionData) {
  try {
    await PlayerSession.findOneAndUpdate(
      { userId: sessionData.userId },
      sessionData,
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error('Error saving player session:', err);
  }
}

app.prepare().then(async () => {
  // Connect to MongoDB first
  await connectToDatabase();

  const httpServer = createServer(handler);

  const io = new Server(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:3000"],
      methods: ["GET", "POST"],
    },
  });

  // Load persisted data or initialize empty maps
  const rooms = await loadRooms();
  const turnLocks = new Map(); // Track turn validation locks (not persisted)
  const connectionPool = new Map(); // Track connections per IP (not persisted)
  const playerSessions = await loadPlayerSessions();
  const MAX_CONNECTIONS_PER_IP = 5; // Limit connections per IP

  console.log(`Loaded ${rooms.size} rooms and ${playerSessions.size} player sessions from MongoDB`);

  // Turn validation helper functions
  function acquireTurnLock(roomCode, userId) {
    const lockKey = `${roomCode}_${userId}`;
    if (turnLocks.has(lockKey)) {
      return false; // Lock already acquired
    }
    turnLocks.set(lockKey, Date.now());
    return true;
  }

  function releaseTurnLock(roomCode, userId) {
    const lockKey = `${roomCode}_${userId}`;
    turnLocks.delete(lockKey);
  }

  function validateTurn(room, userId) {
    if (!room || !room.gameState.gameStarted) {
      return { valid: false, error: "Game not started" };
    }

    if (!room.gameState.currentPlayer || room.gameState.currentPlayer.userId !== userId) {
      return { valid: false, error: "Not your turn" };
    }

    return { valid: true };
  }

  // Input validation helpers
  function validateRoomCode(roomCode) {
    if (!roomCode || typeof roomCode !== 'string') {
      return false;
    }
    return /^[A-Z0-9]{6}$/i.test(roomCode);
  }

  function validatePlayerName(playerName) {
    if (!playerName || typeof playerName !== 'string') {
      return false;
    }
    return playerName.trim().length > 0 && playerName.length <= 20;
  }

  // Authentication middleware for Socket.IO
  async function authenticateSocket(socket, next) {
    try {
      const token = await getToken({
        req: socket.handshake,
        secret: process.env.NEXTAUTH_SECRET
      });

      if (!token || !token.id) {
        return next(new Error('Authentication required'));
      }

      // Find the user in database to ensure they exist
      const user = await User.findById(token.id);
      if (!user) {
        return next(new Error('User not found'));
      }

      socket.data.userId = token.id;
      socket.data.userEmail = user.email;
      socket.data.userName = user.name;
      socket.data.userSessionId = token.jti; // JWT ID for session tracking

      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  }

  // Helper function to get or create player session for authenticated user
  async function getPlayerSession(userId, userSessionId, userName, userEmail) {
    let session = playerSessions.get(userId);

    if (!session) {
      // Create new session for authenticated user
      const newSession = {
        userId,
        userSessionId,
        name: userName,
        email: userEmail,
        currentSocketId: null,
        lastSeen: new Date(),
        isActive: true
      };

      playerSessions.set(userId, newSession);
      await savePlayerSession(newSession);
      session = newSession;
      console.log(`Created new player session for user ${userName} (${userId})`);
    } else {
      // Update existing session
      session.lastSeen = new Date();
      session.isActive = true;
      await savePlayerSession(session);
    }

    return session;
  }

  // Helper function to update player's socket connection
  async function updatePlayerSocket(userId, socketId, userSessionId, userName, userEmail) {
    const session = await getPlayerSession(userId, userSessionId, userName, userEmail);
    session.currentSocketId = socketId;
    session.lastSeen = new Date();
    session.isActive = true;
    await savePlayerSession(session);
    return session;
  }

  // Helper function to find player by user ID in room
  function findPlayerByUserId(room, userId) {
    return room.players.find(p => p.userId === userId);
  }

  function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    return input.trim().replace(/[<>]/g, '');
  }

  // Game state validation helpers
  function validateRoomState(room) {
    if (!room) {
      return { valid: false, error: "Room not found" };
    }

    if (!room.players || !Array.isArray(room.players)) {
      return { valid: false, error: "Invalid players state" };
    }

    if (!room.gameState) {
      return { valid: false, error: "Invalid game state" };
    }

    if (room.gameState.gameStarted && !room.gameState.currentPlayer) {
      return { valid: false, error: "Game started but no current player" };
    }

    return { valid: true };
  }

  function validatePlayerInRoom(room, userId) {
    if (!room.players.find(p => p.userId === userId)) {
      return { valid: false, error: "Player not in room" };
    }
    return { valid: true };
  }

  function validateHeartPlacement(room, userId, heartId, tileId) {
    const playerHand = room.gameState.playerHands[userId] || [];
    const heartExists = playerHand.some(heart => heart.id === heartId);

    if (!heartExists) {
      return { valid: false, error: "Heart not in player's hand" };
    }

    const tileExists = room.gameState.tiles.some(tile => tile.id == tileId); // Use == to handle both number and string
    if (!tileExists) {
      return { valid: false, error: "Tile not found" };
    }

    return { valid: true };
  }

  // Helper function to find player by name in room
  function findPlayerByName(room, playerName) {
    return room.players.find(p => p.name.toLowerCase() === playerName.toLowerCase());
  }

  // Helper function to migrate player data when user rejoins with different session
  async function migratePlayerData(room, oldUserId, newUserId, userName, userEmail) {
    console.log(`Migrating player data from ${oldUserId} to ${newUserId} for ${userName}`);

    // Update player reference in room
    const playerIndex = room.players.findIndex(p => p.userId === oldUserId);
    if (playerIndex !== -1) {
      room.players[playerIndex].userId = newUserId;
      room.players[playerIndex].name = userName;
      room.players[playerIndex].email = userEmail;
      console.log(`Updated existing player at index ${playerIndex}`);
    } else {
      // Add new player if not found
      room.players.push({
        userId: newUserId,
        name: userName,
        email: userEmail,
        isReady: false,
        joinedAt: new Date()
      });
      console.log(`Added new player as existing player not found`);
    }

    // Migrate player hands if they exist
    if (room.gameState.playerHands[oldUserId]) {
      room.gameState.playerHands[newUserId] = room.gameState.playerHands[oldUserId];
      delete room.gameState.playerHands[oldUserId];
      console.log(`Migrated player hands from ${oldUserId} to ${newUserId}`);
    }

    // Update current player reference if needed
    if (room.gameState.currentPlayer && room.gameState.currentPlayer.userId === oldUserId) {
      room.gameState.currentPlayer = {
        userId: newUserId,
        name: userName,
        email: userEmail,
        isReady: room.players.find(p => p.userId === newUserId)?.isReady || false
      };
      console.log(`Updated current player reference to ${newUserId}`);
    }

    // Release any old turn locks
    const locksToDelete = [];
    for (const lockKey of turnLocks.keys()) {
      if (lockKey.includes(oldUserId)) {
        locksToDelete.push(lockKey);
      }
    }
    locksToDelete.forEach(lockKey => turnLocks.delete(lockKey));

    if (locksToDelete.length > 0) {
      console.log(`Released ${locksToDelete.length} turn locks for old user ID ${oldUserId}`);
    }
  }

  function validateDeckState(room) {
    if (!room.gameState.deck) {
      return { valid: false, error: "Invalid deck state" };
    }

    if (typeof room.gameState.deck.cards !== 'number' || room.gameState.deck.cards < 0) {
      return { valid: false, error: "Invalid deck count" };
    }

    return { valid: true };
  }

  // Connection management functions
  function getClientIP(socket) {
    return socket.handshake.address || socket.conn.remoteAddress || 'unknown';
  }

  function canAcceptConnection(ip) {
    const currentConnections = connectionPool.get(ip) || 0;
    return currentConnections < MAX_CONNECTIONS_PER_IP;
  }

  function incrementConnectionCount(ip) {
    const currentConnections = connectionPool.get(ip) || 0;
    connectionPool.set(ip, currentConnections + 1);
  }

  function decrementConnectionCount(ip) {
    const currentConnections = connectionPool.get(ip) || 0;
    if (currentConnections > 0) {
      connectionPool.set(ip, currentConnections - 1);
    }
  }

  // Helper function to generate random tiles
  function generateTiles() {
    const colors = ["red", "yellow", "green", "blue", "brown"];
    const emojis = ["🟥", "🟨", "🟩", "🟦", "🟫"];
    const tiles = [];

    for (let i = 0; i < 8; i++) {
      const randomIndex = Math.floor(Math.random() * colors.length);
      tiles.push({
        id: i,
        color: colors[randomIndex],
        emoji: emojis[randomIndex]
      });
    }
    return tiles;
  }

  // Helper function to generate a single heart card
  function generateSingleHeart() {
    const colors = ["red", "yellow", "green", "blue", "brown"];
    const heartEmojis = ["❤️", "💛", "💚", "💙", "🤎"];
    const randomIndex = Math.floor(Math.random() * colors.length);

    return {
      id: Date.now() + Math.random(), // Unique ID based on timestamp
      color: colors[randomIndex],
      emoji: heartEmojis[randomIndex]
    };
  }

  // Helper function to select random starting player
  function selectRandomStartingPlayer(players) {
    return players[Math.floor(Math.random() * players.length)];
  }

  // Use authentication middleware
  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    const clientIP = getClientIP(socket);
    const userId = socket.data.userId;
    const userEmail = socket.data.userEmail;
    const userName = socket.data.userName;
    const userSessionId = socket.data.userSessionId;

    // Check connection limits
    if (!canAcceptConnection(clientIP)) {
      console.log(`Connection rejected for IP ${clientIP}: Too many connections`);
      socket.emit("room-error", "Too many connections from your IP address");
      socket.disconnect(true);
      return;
    }

    incrementConnectionCount(clientIP);
    console.log(`Authenticated user connected: ${userName} (${userId}) from IP: ${clientIP} with socket: ${socket.id}`);

    socket.on("join-room", async ({ roomCode }) => {
      // Input validation
      if (!validateRoomCode(roomCode)) {
        socket.emit("room-error", "Invalid room code");
        return;
      }

      roomCode = sanitizeInput(roomCode.toUpperCase());

      // Get or create player session for authenticated user
      const playerSession = await updatePlayerSocket(userId, socket.id, userSessionId, userName, userEmail);
      console.log(`Player session for ${userName}:`, playerSession);

      const room = rooms.get(roomCode);

      if (!room) {
        // Create new room if it doesn't exist
        const newRoom = {
          code: roomCode.toUpperCase(),
          players: [],
          maxPlayers: 2,
          gameState: {
            tiles: [],
            gameStarted: false,
            currentPlayer: null,
            deck: {
              emoji: "💌",
              cards: 10 // Initial deck size
            },
            playerHands: {},
            turnCount: 0
          }
        };
        rooms.set(roomCode, newRoom);
        await saveRoom(newRoom); // Save room creation

        // Add authenticated user to new room
        const player = {
          userId: userId,
          name: userName,
          email: userEmail,
          isReady: false,
          joinedAt: new Date()
        };

        // Ensure no duplicate players by userId
        if (!findPlayerByUserId(newRoom, userId)) {
          newRoom.players.push(player);
        }

        socket.join(roomCode);
        socket.data.roomCode = roomCode;
        socket.data.userId = userId;

        console.log(`Room ${roomCode} created by ${userName} (${userId}) with socket ${socket.id}`);

        // Send room-joined to the creator only
        io.to(socket.id).emit("room-joined", { players: newRoom.players, playerId: userId });
        console.log(`Room ${roomCode} created with ${newRoom.players.length} players`);
      } else {
        // Check if authenticated user is already in the room (by userId)
        const existingPlayerByUserId = findPlayerByUserId(room, userId);

        console.log(`User ${userName} (${userId}) joining room ${roomCode}:`);
        console.log(`- Existing player by userId:`, existingPlayerByUserId);
        console.log(`- Room players:`, room.players.map(p => ({ userId: p.userId, name: p.name })));

        // Count unique players by userId to avoid duplicates
        const actualPlayerCount = room.players.length;

        if (!existingPlayerByUserId && actualPlayerCount >= room.maxPlayers) {
          // Room is full and user is not already in it
          // Check if any players in the room are actually disconnected
          const activePlayerSockets = Array.from(io.sockets.adapter.rooms.get(roomCode) || [])
            .filter(socketId => io.sockets.sockets.has(socketId));

          console.log(`Room ${roomCode} appears full (${room.players.length}/${room.maxPlayers})`);
          console.log(`Active sockets in room: ${activePlayerSockets.length}`);
          console.log(`Room players:`, room.players.map(p => ({ userId: p.userId, name: p.name })));

          // Additional check: Look for players with invalid gameState (null currentPlayer in started game)
          const hasInvalidGameState = room.gameState.gameStarted && !room.gameState.currentPlayer;

          // Allow joining if:
          // 1. There are fewer active sockets than players (disconnected players)
          // 2. OR the game state is corrupted (null currentPlayer when game started)
          if (activePlayerSockets.length < room.players.length || hasInvalidGameState) {
            console.log(`Detected disconnected players or invalid game state in room ${roomCode}, allowing reconnection for ${userName}`);

            // If game state is corrupted, reset it to allow fresh game
            if (hasInvalidGameState) {
              console.log(`Resetting invalid game state in room ${roomCode}`);
              room.gameState.gameStarted = false;
              room.gameState.currentPlayer = null;
              room.gameState.tiles = [];
              room.gameState.playerHands = {};
              room.gameState.turnCount = 0;
              room.gameState.deck.cards = 10;

              // Reset all players to not ready
              room.players.forEach(player => {
                player.isReady = false;
              });

              await saveRoom(room);
            }
          } else {
            socket.emit("room-error", "Room is full");
            console.log(`Room ${roomCode} is full with active players, rejecting user ${userName}`);
            return;
          }
        }

        let isNewJoin = false;

        if (!existingPlayerByUserId) {
          // Add new user to existing room
          const player = {
            userId: userId,
            name: userName,
            email: userEmail,
            isReady: false,
            joinedAt: new Date()
          };
          room.players.push(player);
          isNewJoin = true;
          console.log(`New user ${userName} (${userId}) joined room ${roomCode.toUpperCase()}`);
        } else {
          // User is reconnecting - update their info
          existingPlayerByUserId.name = userName;
          existingPlayerByUserId.email = userEmail;
          console.log(`User ${userName} (${userId}) rejoined room ${roomCode.toUpperCase()}`);
        }

        // After handling user join/reconnection, save the updated room state
        await saveRoom(room);

        socket.join(roomCode);
        socket.data.roomCode = roomCode;
        socket.data.userId = userId;

        // Send room-joined to the joining user only
        io.to(socket.id).emit("room-joined", { players: room.players, playerId: userId });
        console.log(`User ${userName} joined room ${roomCode}, total players: ${room.players.length}`);

        // Notify other players in the room about the player update
        if (isNewJoin) {
          socket.to(roomCode).emit("player-joined", { players: room.players });
        } else {
          // For reconnections, update all players about the current state
          io.to(roomCode).emit("player-joined", { players: room.players });
        }

        // If game is already started, send the current game state to the rejoined user
        if (room.gameState.gameStarted) {
          console.log(`Sending current game state to rejoined user ${userName}`);
          console.log(`Room state: ${JSON.stringify({
            tilesCount: room.gameState.tiles.length,
            currentPlayer: room.gameState.currentPlayer,
            playersCount: room.players.length,
            deckCards: room.gameState.deck.cards,
            turnCount: room.gameState.turnCount
          })}`);

          // Include player hands in the player objects for easier client-side handling
          const playersWithHands = room.players.map(player => ({
            ...player,
            hand: room.gameState.playerHands[player.userId] || []
          }));

          const gameStateData = {
            tiles: room.gameState.tiles,
            currentPlayer: room.gameState.currentPlayer,
            players: playersWithHands,
            playerHands: room.gameState.playerHands,
            deck: room.gameState.deck,
            turnCount: room.gameState.turnCount
          };

          console.log(`Emitting game-start to rejoined user with data:`, gameStateData);
          gameStateData.playerId = userId; // Add current user's player ID
          io.to(socket.id).emit("game-start", gameStateData);
        }
      }
    });

    socket.on("leave-room", async ({ roomCode }) => {
      // Input validation
      if (!validateRoomCode(roomCode)) {
        socket.emit("room-error", "Invalid room code");
        return;
      }

      roomCode = sanitizeInput(roomCode.toUpperCase());
      const room = rooms.get(roomCode);
      if (room) {
        // Remove authenticated user from room
        room.players = room.players.filter(player => player.userId !== userId);

        // Notify remaining players
        io.to(roomCode).emit("player-left", { players: room.players });

        // Delete room if empty
        if (room.players.length === 0) {
          rooms.delete(roomCode);
          await deleteRoom(roomCode);
          await saveRoom(room); // Save room deletion
          console.log(`Room ${roomCode} deleted (empty)`);
        } else {
          console.log(`User ${userName} (${userId}) left room ${roomCode}`);
        }

        socket.leave(roomCode);
        socket.data.roomCode = null;
        socket.data.userId = null;
      }
    });

    socket.on("player-ready", async ({ roomCode }) => {
      // Input validation
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
          console.log(`User ${userId} (${player.name}) ready status: ${player.isReady}`);

          // Notify all players in the room
          io.to(roomCode).emit("player-ready", { players: room.players });

          // Check if all players are ready (exactly 2 players required)
          if (room.players.length === 2 && room.players.every(p => p.isReady)) {
            console.log(`All players ready in room ${roomCode}, starting game!`);

            // Generate initial tile state
            room.gameState.tiles = generateTiles();
            room.gameState.gameStarted = true;
            await saveRoom(room); // Save game start

            // Initialize player hands with starting hearts
            room.players.forEach(player => {
              room.gameState.playerHands[player.userId] = [];
              // Deal 3 starting hearts to each player
              for (let i = 0; i < 3; i++) {
                room.gameState.playerHands[player.userId].push(generateSingleHeart());
              }
              console.log(`Dealt 3 hearts to player ${player.name} (${player.userId}):`, room.gameState.playerHands[player.userId]);
            });

            // Select random starting player
            room.gameState.currentPlayer = selectRandomStartingPlayer(room.players);
            room.gameState.turnCount = 1;

            console.log(`Game started in room ${roomCode}:`, {
              tilesCount: room.gameState.tiles.length,
              currentPlayer: room.gameState.currentPlayer?.name,
              playersCount: room.players.length,
              playerHandsKeys: Object.keys(room.gameState.playerHands),
              deckCards: room.gameState.deck.cards,
              turnCount: room.gameState.turnCount
            });

            // Include player hands in the player objects for easier client-side handling
            const playersWithHands = room.players.map(player => {
              const playerHand = room.gameState.playerHands[player.userId] || [];
              console.log(`Player ${player.name} (${player.userId}) hand:`, playerHand);
              return {
                ...player,
                hand: playerHand
              };
            });

            const gameStartData = {
              tiles: room.gameState.tiles,
              currentPlayer: room.gameState.currentPlayer,
              players: playersWithHands,
              playerHands: room.gameState.playerHands,
              deck: room.gameState.deck,
              turnCount: room.gameState.turnCount
            };

            console.log(`Emitting game-start to all players in room ${roomCode}:`, {
              tilesCount: gameStartData.tiles.length,
              currentPlayer: gameStartData.currentPlayer?.name,
              playersCount: gameStartData.players.length,
              playerHandsKeys: Object.keys(gameStartData.playerHands),
              deckCards: gameStartData.deck.cards,
              turnCount: gameStartData.turnCount
            });
            console.log(`Full game-start data:`, JSON.stringify(gameStartData, null, 2));

            // Send personalized game-start data to each player
            room.players.forEach(player => {
              const personalizedData = { ...gameStartData, playerId: player.userId };
              // Find the socket for this player and emit to them
              const playerSocket = Array.from(io.sockets.sockets.values()).find(s => s.data.userId === player.userId);
              if (playerSocket) {
                playerSocket.emit("game-start", personalizedData);
              }
            });
          }
        } else {
          console.log(`User ${userId} not found in room ${roomCode}. Players in room:`, room.players.map(p => ({ userId: p.userId, name: p.name })));
        }
      }
    });

    socket.on("shuffle-tiles", async ({ roomCode }) => {
      // Input validation
      if (!validateRoomCode(roomCode)) {
        socket.emit("room-error", "Invalid room code");
        return;
      }

      roomCode = sanitizeInput(roomCode.toUpperCase());
      const room = rooms.get(roomCode);
      if (room && room.gameState.gameStarted) {
        // Generate new tiles for all players
        room.gameState.tiles = generateTiles();
        await saveRoom(room); // Save tile shuffle
        console.log(`Tiles shuffled in room ${roomCode}`);

        // Broadcast new tile state to all players
        io.to(roomCode).emit("tiles-updated", { tiles: room.gameState.tiles });
      }
    });

    socket.on("draw-heart", async ({ roomCode }) => {
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

      const deckValidation = validateDeckState(room);
      if (!deckValidation.valid) {
        socket.emit("room-error", deckValidation.error);
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
        if (room.gameState.gameStarted && room.gameState.deck.cards > 0) {
          // Generate a new heart and add to player's hand
          const newHeart = generateSingleHeart();

          // Add the heart to the current player's hand
          if (!room.gameState.playerHands[userId]) {
            room.gameState.playerHands[userId] = [];
          }
          room.gameState.playerHands[userId].push(newHeart);

          // Decrease deck count
          room.gameState.deck.cards--;
          await saveRoom(room); // Save heart draw

          console.log(`Heart drawn by ${userId} in room ${roomCode.toUpperCase()}, deck has ${room.gameState.deck.cards} cards left`);

          // Include player hands in the player objects for broadcasting
          const playersWithUpdatedHands = room.players.map(player => ({
            ...player,
            hand: room.gameState.playerHands[player.userId] || []
          }));

          // Broadcast the updated player hands and deck to all players
          io.to(roomCode).emit("heart-drawn", {
            players: playersWithUpdatedHands,
            playerHands: room.gameState.playerHands,
            deck: room.gameState.deck
          });
        }
      } finally {
        // Always release the lock
        releaseTurnLock(roomCode, socket.id);
      }
    });

    socket.on("place-heart", async ({ roomCode, tileId, heartId }) => {
      // Input validation
      if (!validateRoomCode(roomCode) || (typeof tileId !== 'number' && typeof tileId !== 'string') || (typeof heartId !== 'string' && typeof heartId !== 'number')) {
        socket.emit("room-error", "Invalid input data");
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

      const heartValidation = validateHeartPlacement(room, userId, heartId, tileId);
      if (!heartValidation.valid) {
        socket.emit("room-error", heartValidation.error);
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
        if (room.gameState.gameStarted) {
          // Find the heart in player's hand
          const playerHand = room.gameState.playerHands[userId] || [];
          const heartIndex = playerHand.findIndex(heart => heart.id === heartId);

          if (heartIndex !== -1) {
            // Remove heart from player's hand
            const heart = playerHand.splice(heartIndex, 1)[0];

            // Place heart on the tile
            const tileIndex = room.gameState.tiles.findIndex(tile => tile.id == tileId); // Use == to handle both number and string
            if (tileIndex !== -1) {
              room.gameState.tiles[tileIndex] = {
                ...room.gameState.tiles[tileIndex],
                emoji: heart.emoji,
                color: heart.color
              };
              await saveRoom(room); // Save heart placement

              console.log(`Heart placed on tile ${tileId} by ${userId} in room ${roomCode.toUpperCase()}`);

              // Include player hands in the player objects for broadcasting
              const playersWithUpdatedHands = room.players.map(player => ({
                ...player,
                hand: room.gameState.playerHands[player.userId] || []
              }));

              // Broadcast the updated tiles and player hands
              io.to(roomCode).emit("heart-placed", {
                tiles: room.gameState.tiles,
                players: playersWithUpdatedHands,
                playerHands: room.gameState.playerHands
              });
            }
          }
        }
      } finally {
        // Always release the lock
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
            deck: room.gameState.deck
          });
          console.log(`Turn change broadcasted to room ${roomCode}:`, {
            currentPlayer: room.gameState.currentPlayer.name,
            turnCount: room.gameState.turnCount,
            playersCount: playersWithHands.length
          });
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
          // Remove player from room by socket ID or session ID
          const playerName = socket.data.userName;
          let playerRemoved = false;

          // First try to remove by socket ID
          const initialLength = room.players.length;
          room.players = room.players.filter(player => player.userId !== userId);

          // Legacy session handling - this should not be needed with auth
          // But keeping for backwards compatibility during transition
          if (room.players.length === initialLength && socket.data.userSessionId) {
            room.players = room.players.filter(player => player.userId === socket.data.userSessionId);
          }

          // If still no player removed, try to remove by player name (for legacy compatibility)
          if (room.players.length === initialLength && playerName) {
            room.players = room.players.filter(player => player.name.toLowerCase() !== playerName.toLowerCase());
            playerRemoved = true;
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