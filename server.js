import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000;
// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(handler);

  const io = new Server(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:3000"],
      methods: ["GET", "POST"],
    },
  });

  const rooms = new Map();
  const turnLocks = new Map(); // Track turn validation locks
  const connectionPool = new Map(); // Track connections per IP
  const playerSessions = new Map(); // Track player sessions by name
  const MAX_CONNECTIONS_PER_IP = 5; // Limit connections per IP

  // Turn validation helper functions
  function acquireTurnLock(roomCode, playerId) {
    const lockKey = `${roomCode}_${playerId}`;
    if (turnLocks.has(lockKey)) {
      return false; // Lock already acquired
    }
    turnLocks.set(lockKey, Date.now());
    return true;
  }

  function releaseTurnLock(roomCode, playerId) {
    const lockKey = `${roomCode}_${playerId}`;
    turnLocks.delete(lockKey);
  }

  function validateTurn(room, playerId) {
    if (!room || !room.gameState.gameStarted) {
      return { valid: false, error: "Game not started" };
    }

    if (!room.gameState.currentPlayer || room.gameState.currentPlayer.id !== playerId) {
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

  // Helper function to generate or get player session
  function getPlayerSession(playerName) {
    const normalizedName = playerName.trim().toLowerCase();
    if (!playerSessions.has(normalizedName)) {
      playerSessions.set(normalizedName, {
        id: `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: playerName.trim(),
        originalSocketId: null,
        currentSocketId: null
      });
    }
    return playerSessions.get(normalizedName);
  }

  // Helper function to update player's current socket
  function updatePlayerSocket(playerName, socketId) {
    const session = getPlayerSession(playerName);
    session.currentSocketId = socketId;
    if (!session.originalSocketId) {
      session.originalSocketId = socketId;
    }
    return session;
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

  function validatePlayerInRoom(room, playerId) {
    if (!room.players.find(p => p.id === playerId)) {
      return { valid: false, error: "Player not in room" };
    }
    return { valid: true };
  }

  function validateHeartPlacement(room, playerId, heartId, tileId) {
    const playerHand = room.gameState.playerHands[playerId] || [];
    const heartExists = playerHand.some(heart => heart.id === heartId);

    if (!heartExists) {
      return { valid: false, error: "Heart not in player's hand" };
    }

    const tileExists = room.gameState.tiles.some(tile => tile.id === tileId);
    if (!tileExists) {
      return { valid: false, error: "Tile not found" };
    }

    return { valid: true };
  }

  // Helper function to find player by name in room
  function findPlayerByName(room, playerName) {
    return room.players.find(p => p.name.toLowerCase() === playerName.toLowerCase());
  }

  // Helper function to migrate player data to new socket
  function migratePlayerData(room, oldSocketId, newSocketId, playerName) {
    // Update player reference in room
    const playerIndex = room.players.findIndex(p => p.id === oldSocketId);
    if (playerIndex !== -1) {
      room.players[playerIndex].id = newSocketId;
      room.players[playerIndex].name = playerName;
    } else {
      // Add new player if not found
      room.players.push({
        id: newSocketId,
        name: playerName,
        isReady: false
      });
    }

    // Migrate player hands if they exist
    if (room.gameState.playerHands[oldSocketId]) {
      room.gameState.playerHands[newSocketId] = room.gameState.playerHands[oldSocketId];
      delete room.gameState.playerHands[oldSocketId];
    }

    // Update current player reference if needed
    if (room.gameState.currentPlayer && room.gameState.currentPlayer.id === oldSocketId) {
      const session = getPlayerSession(playerName);
      room.gameState.currentPlayer = {
        id: newSocketId,
        name: playerName,
        isReady: room.players.find(p => p.id === newSocketId)?.isReady || false
      };
    }

    // Release any old turn locks
    Object.keys(turnLocks).forEach(lockKey => {
      if (lockKey.includes(oldSocketId)) {
        const parts = lockKey.split('_');
        if (parts.length >= 2) {
          const roomCode = parts[0];
          turnLocks.delete(lockKey);
        }
      }
    });
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

  io.on("connection", (socket) => {
    const clientIP = getClientIP(socket);

    // Check connection limits
    if (!canAcceptConnection(clientIP)) {
      console.log(`Connection rejected for IP ${clientIP}: Too many connections`);
      socket.emit("room-error", "Too many connections from your IP address");
      socket.disconnect(true);
      return;
    }

    incrementConnectionCount(clientIP);
    console.log(`User connected: ${socket.id} from IP: ${clientIP}`);

    socket.on("join-room", ({ roomCode, playerName }) => {
      // Input validation
      if (!validateRoomCode(roomCode) || !validatePlayerName(playerName)) {
        socket.emit("room-error", "Invalid room code or player name");
        return;
      }

      roomCode = sanitizeInput(roomCode.toUpperCase());
      playerName = sanitizeInput(playerName);

      // Get or create player session
      const playerSession = updatePlayerSocket(playerName, socket.id);
      console.log(`Player session for ${playerName}:`, playerSession);

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

        // Add player to new room using session ID
        const player = {
          id: playerSession.id,
          name: playerName,
          isReady: false,
        };
        // Ensure no duplicate players by name
        if (!findPlayerByName(newRoom, playerName)) {
          newRoom.players.push(player);
        }

        socket.join(roomCode);
        socket.data.roomCode = roomCode;
        socket.data.playerName = playerName;
        socket.data.playerSessionId = playerSession.id;

        console.log(`Room ${roomCode} created by ${playerName} (${socket.id})`);

        // Send room-joined to the creator only
        io.to(socket.id).emit("room-joined", { players: newRoom.players, playerId: playerSession.id });
        console.log(`Room ${roomCode} created with ${newRoom.players.length} players`);
      } else {
        // Check if player is already in the room (by name)
        const existingPlayerByName = findPlayerByName(room, playerName);
        const existingPlayerBySocket = room.players.find(p => p.id === socket.id);

        console.log(`Player ${playerName} joining room ${roomCode}:`);
        console.log(`- Existing player by name:`, existingPlayerByName);
        console.log(`- Existing player by socket:`, existingPlayerBySocket);

        if (!existingPlayerByName && !existingPlayerBySocket && room.players.length >= room.maxPlayers) {
          // Room is full and player is not already in it
          socket.emit("room-error", "Room is full");
          return;
        }

        let isNewJoin = false;

        if (!existingPlayerByName && !existingPlayerBySocket) {
          // Add new player to existing room
          const player = {
            id: playerSession.id,
            name: playerName,
            isReady: false,
          };
          room.players.push(player);
          isNewJoin = true;
          console.log(`New player ${playerName} joined room ${roomCode.toUpperCase()}`);
        } else if (existingPlayerByName && !existingPlayerBySocket) {
          // Player is reconnecting with new socket ID
          console.log(`Player ${playerName} reconnecting from ${existingPlayerByName.id} to ${socket.id}`);
          migratePlayerData(room, existingPlayerByName.id, playerSession.id, playerName);
        } else if (existingPlayerBySocket) {
          // Player is rejoining with same socket ID (rare case)
          existingPlayerBySocket.name = playerName;
          console.log(`Player ${playerName} rejoined room ${roomCode.toUpperCase()}`);
        }

        socket.join(roomCode);
        socket.data.roomCode = roomCode;
        socket.data.playerName = playerName;
        socket.data.playerSessionId = playerSession.id;

        // Send room-joined to the joining player only
        io.to(socket.id).emit("room-joined", { players: room.players, playerId: playerSession.id });
        console.log(`Player ${playerName} joined room ${roomCode}, total players: ${room.players.length}`);

        // Notify other players in the room about the player update
        if (isNewJoin) {
          socket.to(roomCode).emit("player-joined", { players: room.players });
        } else {
          // For reconnections, update all players about the current state
          io.to(roomCode).emit("player-joined", { players: room.players });
        }

        // If game is already started, send the current game state to the rejoined player
        if (room.gameState.gameStarted) {
          console.log(`Sending current game state to rejoined player ${playerName}`);
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
            hand: room.gameState.playerHands[player.id] || []
          }));

          const gameStateData = {
            tiles: room.gameState.tiles,
            currentPlayer: room.gameState.currentPlayer,
            players: playersWithHands,
            playerHands: room.gameState.playerHands,
            deck: room.gameState.deck,
            turnCount: room.gameState.turnCount
          };

          console.log(`Emitting game-start to rejoined player with data:`, gameStateData);
          io.to(socket.id).emit("game-start", gameStateData);
        }
      }
    });

    socket.on("leave-room", ({ roomCode }) => {
      // Input validation
      if (!validateRoomCode(roomCode)) {
        socket.emit("room-error", "Invalid room code");
        return;
      }

      roomCode = sanitizeInput(roomCode.toUpperCase());
      const room = rooms.get(roomCode);
      if (room) {
        // Remove player from room
        room.players = room.players.filter(player => player.id !== socket.id);

        // Notify remaining players
        io.to(roomCode).emit("player-left", { players: room.players });

        // Delete room if empty
        if (room.players.length === 0) {
          rooms.delete(roomCode);
          console.log(`Room ${roomCode} deleted (empty)`);
        } else {
          console.log(`Player ${socket.id} left room ${roomCode}`);
        }

        socket.leave(roomCode);
        socket.data.roomCode = null;
        socket.data.playerName = null;
      }
    });

    socket.on("player-ready", ({ roomCode }) => {
      // Input validation
      if (!validateRoomCode(roomCode)) {
        socket.emit("room-error", "Invalid room code");
        return;
      }

      roomCode = sanitizeInput(roomCode.toUpperCase());
      const room = rooms.get(roomCode);
      if (room) {
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
          player.isReady = !player.isReady;
          console.log(`Player ${socket.id} ready status: ${player.isReady}`);

          // Notify all players in the room
          io.to(roomCode).emit("player-ready", { players: room.players });

          // Check if all players are ready (exactly 2 players required)
          if (room.players.length === 2 && room.players.every(p => p.isReady)) {
            console.log(`All players ready in room ${roomCode}, starting game!`);

            // Generate initial tile state
            room.gameState.tiles = generateTiles();
            room.gameState.gameStarted = true;

            // Initialize player hands with starting hearts
            room.players.forEach(player => {
              room.gameState.playerHands[player.id] = [];
              // Deal 3 starting hearts to each player
              for (let i = 0; i < 3; i++) {
                room.gameState.playerHands[player.id].push(generateSingleHeart());
              }
            });

            // Select random starting player
            room.gameState.currentPlayer = selectRandomStartingPlayer(room.players);
            room.gameState.turnCount = 1;

            // Include player hands in the player objects for easier client-side handling
            const playersWithHands = room.players.map(player => ({
              ...player,
              hand: room.gameState.playerHands[player.id] || []
            }));

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
              deckCards: gameStartData.deck.cards,
              turnCount: gameStartData.turnCount
            });

            io.to(roomCode).emit("game-start", gameStartData);
          }
        }
      }
    });

    socket.on("shuffle-tiles", ({ roomCode }) => {
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
        console.log(`Tiles shuffled in room ${roomCode}`);

        // Broadcast new tile state to all players
        io.to(roomCode).emit("tiles-updated", { tiles: room.gameState.tiles });
      }
    });

    socket.on("draw-heart", ({ roomCode }) => {
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

      const playerValidation = validatePlayerInRoom(room, socket.id);
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
      const turnValidation = validateTurn(room, socket.id);
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
          if (!room.gameState.playerHands[socket.id]) {
            room.gameState.playerHands[socket.id] = [];
          }
          room.gameState.playerHands[socket.id].push(newHeart);

          // Decrease deck count
          room.gameState.deck.cards--;

          console.log(`Heart drawn by ${socket.id} in room ${roomCode.toUpperCase()}, deck has ${room.gameState.deck.cards} cards left`);

          // Include player hands in the player objects for broadcasting
          const playersWithUpdatedHands = room.players.map(player => ({
            ...player,
            hand: room.gameState.playerHands[player.id] || []
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

    socket.on("place-heart", ({ roomCode, tileId, heartId }) => {
      // Input validation
      if (!validateRoomCode(roomCode) || typeof tileId !== 'number' || typeof heartId !== 'string') {
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

      const playerValidation = validatePlayerInRoom(room, socket.id);
      if (!playerValidation.valid) {
        socket.emit("room-error", playerValidation.error);
        return;
      }

      const heartValidation = validateHeartPlacement(room, socket.id, heartId, tileId);
      if (!heartValidation.valid) {
        socket.emit("room-error", heartValidation.error);
        return;
      }

      // Validate turn and acquire lock
      const turnValidation = validateTurn(room, socket.id);
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
          const playerHand = room.gameState.playerHands[socket.id] || [];
          const heartIndex = playerHand.findIndex(heart => heart.id === heartId);

          if (heartIndex !== -1) {
            // Remove heart from player's hand
            const heart = playerHand.splice(heartIndex, 1)[0];

            // Place heart on the tile
            const tileIndex = room.gameState.tiles.findIndex(tile => tile.id === tileId);
            if (tileIndex !== -1) {
              room.gameState.tiles[tileIndex] = {
                ...room.gameState.tiles[tileIndex],
                emoji: heart.emoji,
                color: heart.color
              };

              console.log(`Heart placed on tile ${tileId} by ${socket.id} in room ${roomCode.toUpperCase()}`);

              // Include player hands in the player objects for broadcasting
              const playersWithUpdatedHands = room.players.map(player => ({
                ...player,
                hand: room.gameState.playerHands[player.id] || []
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

    socket.on("end-turn", ({ roomCode }) => {
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

      const playerValidation = validatePlayerInRoom(room, socket.id);
      if (!playerValidation.valid) {
        socket.emit("room-error", playerValidation.error);
        return;
      }

      // Validate turn and acquire lock
      const turnValidation = validateTurn(room, socket.id);
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
        const currentPlayerIndex = room.players.findIndex(p => p.id === room.gameState.currentPlayer.id);
        const nextPlayerIndex = (currentPlayerIndex + 1) % room.players.length;

        // Switch to next player
        room.gameState.currentPlayer = room.players[nextPlayerIndex];
        room.gameState.turnCount++;

        console.log(`Turn ended in room ${roomCode.toUpperCase()}, new currentPlayer: ${room.gameState.currentPlayer.id}`);

        // Broadcast turn change to all players
          io.to(roomCode).emit("turn-changed", {
            currentPlayer: room.gameState.currentPlayer,
            turnCount: room.gameState.turnCount
          });
        }
      } finally {
        // Always release the lock
        releaseTurnLock(roomCode, socket.id);
      }
    });

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.id} from IP: ${clientIP}`);

      // Decrement connection count
      decrementConnectionCount(clientIP);

      const roomCode = socket.data.roomCode;
      if (roomCode) {
        // Release any turn locks for this socket
        releaseTurnLock(roomCode, socket.id);

        const room = rooms.get(roomCode);
        if (room) {
          // Remove player from room
          room.players = room.players.filter(player => player.id !== socket.id);

          // Notify remaining players
          io.to(roomCode).emit("player-left", { players: room.players });

          // Delete room if empty
          if (room.players.length === 0) {
            rooms.delete(roomCode);
            console.log(`Room ${roomCode} deleted (empty)`);
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