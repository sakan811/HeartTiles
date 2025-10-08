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
  isMagicCard,
  createCardFromData
} from './src/lib/cards.js';

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000;
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:example@localhost:27017/no-kitty-cards?authSource=admin';

async function connectToDatabase() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection failed:', err);
    process.exit(1);
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
    await PlayerSession.findOneAndUpdate(
      { userId: sessionData.userId },
      sessionData,
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error('Failed to save player session:', err);
  }
}

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
  const turnLocks = new Map();
  const connectionPool = new Map();
  const playerSessions = await loadPlayerSessions();
  const MAX_CONNECTIONS_PER_IP = 5;

  console.log(`Loaded ${rooms.size} rooms, ${playerSessions.size} sessions`);

  function acquireTurnLock(roomCode, userId) {
    const lockKey = `${roomCode}_${userId}`;
    if (turnLocks.has(lockKey)) return false;
    turnLocks.set(lockKey, Date.now());
    return true;
  }

  function releaseTurnLock(roomCode, userId) {
    turnLocks.delete(`${roomCode}_${userId}`);
  }

  function validateTurn(room, userId) {
    if (!room?.gameState.gameStarted) return { valid: false, error: "Game not started" };
    if (!room.gameState.currentPlayer || room.gameState.currentPlayer.userId !== userId) {
      return { valid: false, error: "Not your turn" };
    }
    return { valid: true };
  }

  function validateCardDrawLimit(room, userId) {
    if (!room.gameState.playerActions) {
      room.gameState.playerActions = {};
    }

    const playerActions = room.gameState.playerActions[userId] || { drawnHeart: false, drawnMagic: false };

    return { valid: true, currentActions: playerActions };
  }

  function recordCardDraw(room, userId, cardType) {
    if (!room.gameState.playerActions) {
      room.gameState.playerActions = {};
    }

    if (!room.gameState.playerActions[userId]) {
      room.gameState.playerActions[userId] = { drawnHeart: false, drawnMagic: false };
    }

    if (cardType === 'heart') {
      room.gameState.playerActions[userId].drawnHeart = true;
    } else if (cardType === 'magic') {
      room.gameState.playerActions[userId].drawnMagic = true;
    }
  }

  function resetPlayerActions(room, userId) {
    if (!room.gameState.playerActions) {
      room.gameState.playerActions = {};
    }
    room.gameState.playerActions[userId] = { drawnHeart: false, drawnMagic: false };
  }

  function validateRoomCode(roomCode) {
    return roomCode && typeof roomCode === 'string' && /^[A-Z0-9]{6}$/i.test(roomCode);
  }

  function validatePlayerName(playerName) {
    return playerName && typeof playerName === 'string' &&
           playerName.trim().length > 0 && playerName.length <= 20;
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

  function findPlayerByUserId(room, userId) {
    return room.players.find(p => p.userId === userId);
  }

  function sanitizeInput(input) {
    return typeof input === 'string' ? input.trim().replace(/[<>]/g, '') : input;
  }

  function validateRoomState(room) {
    if (!room) return { valid: false, error: "Room not found" };
    if (!room.players || !Array.isArray(room.players)) return { valid: false, error: "Invalid players state" };
    if (!room.gameState) return { valid: false, error: "Invalid game state" };
    if (room.gameState.gameStarted && !room.gameState.currentPlayer) {
      return { valid: false, error: "Game started but no current player" };
    }
    return { valid: true };
  }

  function validatePlayerInRoom(room, userId) {
    const playerInRoom = room.players.find(p => p.userId === userId);
    return playerInRoom ? { valid: true } : { valid: false, error: "Player not in room" };
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

  function findPlayerByName(room, playerName) {
    return room.players.find(p => p.name.toLowerCase() === playerName.toLowerCase());
  }

  async function migratePlayerData(room, oldUserId, newUserId, userName, userEmail) {
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

function checkAndExpireShields(room) {
  if (!room.gameState.shields) return;

  // Use ShieldCard's static method to check shield status
  for (const [userId, shield] of Object.entries(room.gameState.shields)) {
    if (!ShieldCard.isActive(shield, room.gameState.turnCount)) {
      console.log(`Shield expired for ${userId}`);
      delete room.gameState.shields[userId];
    } else {
      // Update remaining turns using ShieldCard's static method
      shield.remainingTurns = ShieldCard.getRemainingTurns(shield, room.gameState.turnCount);
    }
  }
}

  function validateDeckState(room) {
    if (!room.gameState.deck) return { valid: false, error: "Invalid deck state" };
    if (typeof room.gameState.deck.cards !== 'number' || room.gameState.deck.cards < 0) {
      return { valid: false, error: "Invalid deck count" };
    }
    return { valid: true };
  }

  function getClientIP(socket) {
    return socket.handshake.address || socket.conn.remoteAddress || 'unknown';
  }

  function canAcceptConnection(ip) {
    return (connectionPool.get(ip) || 0) < MAX_CONNECTIONS_PER_IP;
  }

  function incrementConnectionCount(ip) {
    connectionPool.set(ip, (connectionPool.get(ip) || 0) + 1);
  }

  function decrementConnectionCount(ip) {
    const current = connectionPool.get(ip) || 0;
    if (current > 0) connectionPool.set(ip, current - 1);
  }

  function generateTiles() {
    const colors = ["red", "yellow", "green", "blue", "brown"];
    const emojis = ["🟥", "🟨", "🟩", "🟦", "🟫"];
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

  function calculateScore(heart, tile) {
    // Use HeartCard's calculateScore method if heart is a HeartCard instance
    if (heart instanceof HeartCard) {
      return heart.calculateScore(tile);
    }
    // Fallback for old format (plain objects)
    if (tile.color === "white") return heart.value;
    return heart.color === tile.color ? heart.value * 2 : 0;
  }

  function generateSingleHeart() {
    const heartCard = HeartCard.generateRandom();
    return heartCard;
  }

  
  function generateSingleMagicCard() {
    const magicCard = generateRandomMagicCard();
    return magicCard;
  }

  function selectRandomStartingPlayer(players) {
    return players[Math.floor(Math.random() * players.length)];
  }

  function checkGameEndConditions(room) {
    if (!room?.gameState?.gameStarted) return { shouldEnd: false, reason: null };

    // Condition 1: All tiles are filled (have hearts)
    const allTilesFilled = room.gameState.tiles.every(tile => tile.placedHeart);
    if (allTilesFilled) {
      return { shouldEnd: true, reason: "All tiles are filled" };
    }

    // Condition 2: Either deck is empty (if deck is empty, game ends)
    const heartDeckEmpty = room.gameState.deck.cards <= 0;
    const magicDeckEmpty = room.gameState.magicDeck.cards <= 0;
    if (heartDeckEmpty || magicDeckEmpty) {
      const emptyDeck = heartDeckEmpty ? "Heart" : "Magic";
      return { shouldEnd: true, reason: `${emptyDeck} deck is empty` };
    }

    return { shouldEnd: false, reason: null };
  }

  async function endGame(room, roomCode, io) {
    const gameEndResult = checkGameEndConditions(room);
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
            playerHands: {}, shields: {}, turnCount: 0
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
                playerHands: {}, turnCount: 0,
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
            shields: room.gameState.shields || {}
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
            room.gameState.magicDeck.cards = 16;
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
              shields: room.gameState.shields || {}
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

          // Check if game should end after drawing (if deck becomes empty)
          await endGame(room, roomCode, io);
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
              await saveRoom(room);

              const playersWithUpdatedHands = room.players.map(player => ({
                ...player,
                hand: room.gameState.playerHands[player.userId] || [],
                score: player.score
              }));

              io.to(roomCode).emit("heart-placed", {
                tiles: room.gameState.tiles,
                players: playersWithUpdatedHands,
                playerHands: room.gameState.playerHands
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

      if (!acquireTurnLock(roomCode, socket.id)) {
        socket.emit("room-error", "Action in progress, please wait");
        return;
      }

      try {
        if (room.gameState.gameStarted) {
        // Reset actions for the current player whose turn is ending
        resetPlayerActions(room, room.gameState.currentPlayer.userId);

        // Check and expire shields that should expire after this turn
        checkAndExpireShields(room);

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
            shields: room.gameState.shields || {}
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

          // Check if game should end after drawing magic card (if deck becomes empty)
          await endGame(room, roomCode, io);
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
      console.log(`=== MAGIC CARD USAGE ATTEMPT ===`);
      console.log(`User ${userId} attempting to use magic card ${cardId} on tile ${targetTileId} in room ${roomCode}`);

      // Input validation
      if (!validateRoomCode(roomCode) || !cardId || !targetTileId) {
        socket.emit("room-error", "Invalid input data");
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

          // Apply card effect based on type using the new card classes
          if (magicCard.type === 'shield') {
            // Shield cards don't need a target tile
            // Shield can only be activated for the current player
            if (room.gameState.currentPlayer.userId !== userId) {
              socket.emit("room-error", "You can only use Shield cards on your own turn");
              return;
            }

            actionResult = magicCard.executeEffect(room.gameState, userId);
            console.log(`Shield card used by ${userId} - protection activated for ${actionResult.remainingTurns} turns`);
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
                socket.emit("room-error", "Invalid target for Wind card");
                return;
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
              actionResult = magicCard.executeEffect(room.gameState, targetTileId);

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
            shields: room.gameState.shields || {}
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