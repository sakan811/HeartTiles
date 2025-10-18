import { Server } from 'socket.io';
import { createServer } from 'node:http';
import { vi } from 'vitest';
import { createInitialHand, generateRandomHeartCard, generateRandomMagicCard } from '../factories/card-factories.js';
import { createTileSet } from '../factories/game-factories.js';

/**
 * Simplified Mock Socket.IO Server for integration testing
 * Focused on stability and basic functionality
 */
export class MockSocketServer {
  constructor(options = {}) {
    this.httpServer = null;
    this.io = null;
    this.port = null;
    this.rooms = new Map();
    this.isReady = false;
    this.options = {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000, // Increased for test environment
      pingInterval: 25000,
      allowEIO3: true, // Allow Engine.IO v3 compatibility
      path: '/socket.io/',
      ...options
    };

    // Expose rooms map to tests for cleanup
    global.__testRooms__ = this.rooms;
  }

  /**
   * Start the mock server
   */
  async start() {
    this.httpServer = createServer();
    this.port = 0; // Let OS assign a random port

    this.io = new Server(this.httpServer, this.options);

    // Setup simple authentication middleware
    this.setupAuthMiddleware();

    // Setup event handlers
    this.setupEventHandlers();

    // Add health check route
    this.httpServer.on('request', (req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', port: this.port }));
        return;
      }
    });

    // Start server
    await new Promise((resolve, reject) => {
      this.httpServer.listen(0, '127.0.0.1', () => {
        this.port = this.httpServer.address().port;
        console.log(`Mock server started on port ${this.port}`);

        // Add delay to ensure server is fully ready
        setTimeout(() => {
          console.log(`Mock server: Ready for connections on port ${this.port}`);
          this.isReady = true;
          resolve();
        }, 500); // Increased delay for server readiness
      });
      this.httpServer.on('error', reject);
    });

    return this.port;
  }

  /**
   * Stop the mock server
   */
  async stop() {
    if (this.io) {
      this.io.close();
    }
    if (this.httpServer) {
      this.httpServer.close();
    }
  }

  /**
   * Setup simple authentication middleware
   */
  setupAuthMiddleware() {
    this.io.use((socket, next) => {
      try {
        const token = socket.handshake.auth?.token;

        // For the specific authentication test, reject connections with token: null
        if (token === null) {
          return next(new Error('Authentication required'));
        }

        if (token?.id) {
          socket.data.userId = token.id;
          socket.data.userName = token.name || `User ${token.id}`;
          socket.data.userEmail = token.email || `${token.id}@example.com`;
        } else {
          socket.data.userId = 'test-user-1';
          socket.data.userName = 'Test User 1';
          socket.data.userEmail = 'test-user-1@example.com';
        }

        console.log(`Mock server: Connection accepted for ${socket.data.userName} (${socket.data.userId})`);
        next();
      } catch (error) {
        console.log('Mock server: Auth error, rejecting connection');
        next(new Error('Authentication failed'));
      }
    });
  }

  /**
   * Setup all socket event handlers
   */
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`Mock server: ${socket.data.userName} connected (${socket.id})`);

      // Room management events
      socket.on('join-room', (data) => this.handleJoinRoom(socket, data));
      socket.on('leave-room', (data) => this.handleLeaveRoom(socket, data));
      socket.on('player-ready', (data) => this.handlePlayerReady(socket, data));

      // Game action events
      socket.on('place-heart', (data) => this.handlePlaceHeart(socket, data));
      socket.on('draw-heart', (data) => this.handleDrawHeart(socket, data));
      socket.on('draw-magic-card', (data) => this.handleDrawMagicCard(socket, data));
      socket.on('use-magic-card', (data) => this.handleUseMagicCard(socket, data));
      socket.on('end-turn', (data) => this.handleEndTurn(socket, data));

      socket.on('disconnect', () => {
        console.log(`Mock server: ${socket.data.userName} disconnected`);
      });
    });
  }

  /**
   * Handle join-room event
   */
  async handleJoinRoom(socket, { roomCode }) {
    console.log(`Mock server: ${socket.data.userName} joining room ${roomCode}`);

    // Validate room code
    if (!roomCode || typeof roomCode !== 'string' || !/^[A-Z0-9]{6}$/i.test(roomCode)) {
      socket.emit('room-error', 'Invalid room code');
      return;
    }

    roomCode = roomCode.toUpperCase();
    let room = this.rooms.get(roomCode);

    if (!room) {
      room = this.createRoom(roomCode);
      this.rooms.set(roomCode, room);
      console.log(`Mock server: Created room ${roomCode}`);
    }

    // Add player to room
    this.addOrUpdatePlayer(room, socket.data);

    // Join socket room
    socket.join(roomCode);
    socket.data.roomCode = roomCode;

    // Send room-joined event
    socket.emit('room-joined', {
      players: room.players,
      playerId: socket.data.userId
    });

    // Broadcast to all players
    this.io.to(roomCode).emit('player-joined', { players: room.players });
  }

  /**
   * Handle leave-room event
   */
  async handleLeaveRoom(socket, { roomCode }) {
    if (!roomCode || typeof roomCode !== 'string' || roomCode.length !== 6) {
      socket.emit('room-error', 'Invalid room code');
      return;
    }

    roomCode = roomCode.toUpperCase();
    const room = this.rooms.get(roomCode);
    if (room) {
      room.players = room.players.filter(p => p.userId !== socket.data.userId);
      this.io.to(roomCode).emit('player-left', { players: room.players });
      if (room.players.length === 0) {
        this.rooms.delete(roomCode);
      }
    }
    socket.leave(roomCode);
  }

  /**
   * Handle player-ready event
   */
  async handlePlayerReady(socket, { roomCode }) {
    if (!roomCode || typeof roomCode !== 'string' || roomCode.length !== 6) {
      socket.emit('room-error', 'Invalid room code');
      return;
    }

    roomCode = roomCode.toUpperCase();
    const room = this.rooms.get(roomCode);
    if (room) {
      const player = room.players.find(p => p.userId === socket.data.userId);
      if (player) {
        player.isReady = !player.isReady;
        this.io.to(roomCode).emit('player-ready', { players: room.players });

        // Check if game should start
        if (room.players.length === 2 && room.players.every(p => p.isReady)) {
          await this.startGame(room, roomCode);
        }
      }
    }
  }

  /**
   * Handle place-heart event
   */
  async handlePlaceHeart(socket, { roomCode, tileId, heartId }) {
    if (!roomCode || tileId === undefined || heartId === undefined) {
      socket.emit('room-error', 'Invalid input data');
      return;
    }

    roomCode = roomCode.toUpperCase();
    const room = this.rooms.get(roomCode);

    if (!room?.gameState?.gameStarted) {
      socket.emit('room-error', 'Game not started');
      return;
    }

    if (room.gameState.currentPlayer?.userId !== socket.data.userId) {
      socket.emit('room-error', 'Not your turn');
      return;
    }

    const playerHand = room.gameState.playerHands[socket.data.userId] || [];
    const heartIndex = playerHand.findIndex(h => h.id === heartId);

    if (heartIndex === -1) {
      socket.emit('room-error', 'Card not in your hand');
      return;
    }

    const tile = room.gameState.tiles.find(t => t.id === tileId);
    if (!tile || tile.placedHeart) {
      socket.emit('room-error', 'Invalid tile');
      return;
    }

    // Place the heart
    const heart = playerHand.splice(heartIndex, 1)[0];
    tile.placedHeart = {
      ...heart,
      placedBy: socket.data.userId,
      originalTileColor: tile.color
    };
    tile.emoji = heart.emoji;
    tile.color = heart.color;

    // Update player score
    const player = room.players.find(p => p.userId === socket.data.userId);
    if (player) player.score += heart.value || 1;

    // Broadcast heart-placed event
    this.io.to(roomCode).emit('heart-placed', {
      tiles: room.gameState.tiles,
      players: room.players.map(p => ({
        ...p,
        hand: room.gameState.playerHands[p.userId] || [],
        score: p.score || 0
      })),
      playerHands: room.gameState.playerHands
    });
  }

  /**
   * Handle draw-heart event
   */
  async handleDrawHeart(socket, { roomCode }) {
    if (!roomCode || typeof roomCode !== 'string' || roomCode.length !== 6) {
      socket.emit('room-error', 'Invalid room code');
      return;
    }

    roomCode = roomCode.toUpperCase();
    const room = this.rooms.get(roomCode);

    if (!room?.gameState?.gameStarted) {
      socket.emit('room-error', 'Game not started');
      return;
    }

    if (room.gameState.currentPlayer?.userId !== socket.data.userId) {
      socket.emit('room-error', 'Not your turn');
      return;
    }

    // Check if player already drew a heart card this turn
    if (!room.gameState.playerActions) {
      room.gameState.playerActions = {};
    }
    const playerActions = room.gameState.playerActions[socket.data.userId] || {
      drawnHeart: false,
      drawnMagic: false,
      heartsPlaced: 0,
      magicCardsUsed: 0
    };

    if (playerActions.drawnHeart) {
      socket.emit('room-error', 'You can only draw one heart card per turn');
      return;
    }

    if (room.gameState.deck.cards <= 0) {
      socket.emit('room-error', 'No more cards in deck');
      return;
    }

    // Generate and add new heart card
    const newHeart = generateRandomHeartCard();
    room.gameState.playerHands[socket.data.userId].push(newHeart);
    room.gameState.deck.cards--;

    // Record the action
    playerActions.drawnHeart = true;
    room.gameState.playerActions[socket.data.userId] = playerActions;

    // Broadcast heart-drawn event
    this.io.to(roomCode).emit('heart-drawn', {
      players: room.players.map(p => ({
        ...p,
        hand: room.gameState.playerHands[p.userId] || [],
        score: p.score || 0
      })),
      playerHands: room.gameState.playerHands,
      deck: room.gameState.deck
    });
  }

  /**
   * Handle draw-magic-card event
   */
  async handleDrawMagicCard(socket, { roomCode }) {
    if (!roomCode || typeof roomCode !== 'string' || roomCode.length !== 6) {
      socket.emit('room-error', 'Invalid room code');
      return;
    }

    roomCode = roomCode.toUpperCase();
    const room = this.rooms.get(roomCode);

    if (!room?.gameState?.gameStarted) {
      socket.emit('room-error', 'Game not started');
      return;
    }

    if (room.gameState.currentPlayer?.userId !== socket.data.userId) {
      socket.emit('room-error', 'Not your turn');
      return;
    }

    // Check if player already drew a magic card this turn
    if (!room.gameState.playerActions) {
      room.gameState.playerActions = {};
    }
    const playerActions = room.gameState.playerActions[socket.data.userId] || {
      drawnHeart: false,
      drawnMagic: false,
      heartsPlaced: 0,
      magicCardsUsed: 0
    };

    if (playerActions.drawnMagic) {
      socket.emit('room-error', 'You can only draw one magic card per turn');
      return;
    }

    if (room.gameState.magicDeck.cards <= 0) {
      socket.emit('room-error', 'No more magic cards in deck');
      return;
    }

    // Generate and add new magic card
    const newMagicCard = generateRandomMagicCard();
    room.gameState.playerHands[socket.data.userId].push(newMagicCard);
    room.gameState.magicDeck.cards--;

    // Record the action
    playerActions.drawnMagic = true;
    room.gameState.playerActions[socket.data.userId] = playerActions;

    // Broadcast magic-card-drawn event
    this.io.to(roomCode).emit('magic-card-drawn', {
      players: room.players.map(p => ({
        ...p,
        hand: room.gameState.playerHands[p.userId] || [],
        score: p.score || 0
      })),
      playerHands: room.gameState.playerHands,
      magicDeck: room.gameState.magicDeck,
      tiles: room.gameState.tiles
    });
  }

  /**
   * Handle use-magic-card event
   */
  async handleUseMagicCard(socket, { roomCode, cardId, targetTileId }) {
    if (!roomCode || !cardId) {
      socket.emit('room-error', 'Invalid input data');
      return;
    }

    roomCode = roomCode.toUpperCase();
    const room = this.rooms.get(roomCode);

    if (!room?.gameState?.gameStarted) {
      socket.emit('room-error', 'Game not started');
      return;
    }

    if (room.gameState.currentPlayer?.userId !== socket.data.userId) {
      socket.emit('room-error', 'Not your turn');
      return;
    }

    const playerHand = room.gameState.playerHands[socket.data.userId] || [];
    const cardIndex = playerHand.findIndex(c => c.id === cardId);

    if (cardIndex === -1) {
      socket.emit('room-error', 'Card not in your hand');
      return;
    }

    const card = playerHand.splice(cardIndex, 1)[0];
    const actionResult = this.executeMagicCardEffect(card, room, targetTileId, socket.data.userId);

    // Broadcast magic-card-used event
    this.io.to(roomCode).emit('magic-card-used', {
      card,
      actionResult,
      tiles: room.gameState.tiles,
      players: room.players.map(p => ({
        ...p,
        hand: room.gameState.playerHands[p.userId] || [],
        score: p.score || 0
      })),
      playerHands: room.gameState.playerHands,
      usedBy: socket.data.userId,
      shields: room.gameState.shields || {}
    });
  }

  /**
   * Handle end-turn event
   */
  async handleEndTurn(socket, { roomCode }) {
    if (!roomCode || typeof roomCode !== 'string' || roomCode.length !== 6) {
      socket.emit('room-error', 'Invalid room code');
      return;
    }

    roomCode = roomCode.toUpperCase();
    const room = this.rooms.get(roomCode);

    if (!room?.gameState?.gameStarted) {
      socket.emit('room-error', 'Game not started');
      return;
    }

    if (!room.gameState.currentPlayer || room.gameState.currentPlayer.userId !== socket.data.userId) {
      socket.emit('room-error', 'Not your turn');
      return;
    }

    // Check if player has drawn required cards this turn
    if (!room.gameState.playerActions) {
      room.gameState.playerActions = {};
    }
    const playerActions = room.gameState.playerActions[socket.data.userId] || {
      drawnHeart: false,
      drawnMagic: false,
      heartsPlaced: 0,
      magicCardsUsed: 0
    };

    // Check if heart card draw is required (deck has cards)
    if (room.gameState.deck.cards > 0 && !playerActions.drawnHeart) {
      socket.emit('room-error', 'You must draw a heart card before ending your turn');
      return;
    }

    // Check if magic card draw is required (deck has cards)
    if (room.gameState.magicDeck.cards > 0 && !playerActions.drawnMagic) {
      socket.emit('room-error', 'You must draw a magic card before ending your turn');
      return;
    }

    // Switch to next player
    const currentPlayerIndex = room.players.findIndex(p => p.userId === socket.data.userId);
    const nextPlayerIndex = (currentPlayerIndex + 1) % room.players.length;
    room.gameState.currentPlayer = room.players[nextPlayerIndex];
    room.gameState.turnCount++;

    // Reset actions for the next player
    room.gameState.playerActions[socket.data.userId] = {
      drawnHeart: false,
      drawnMagic: false,
      heartsPlaced: 0,
      magicCardsUsed: 0
    };

    // Broadcast turn-changed event
    this.io.to(roomCode).emit('turn-changed', {
      currentPlayer: room.gameState.currentPlayer,
      turnCount: room.gameState.turnCount,
      players: room.players.map(p => ({
        ...p,
        hand: room.gameState.playerHands[p.userId] || []
      })),
      playerHands: room.gameState.playerHands,
      deck: room.gameState.deck,
      shields: room.gameState.shields || {}
    });
  }

  /**
   * Helper methods
   */
  createRoom(roomCode) {
    return {
      code: roomCode,
      players: [],
      maxPlayers: 2,
      gameState: {
        tiles: [],
        gameStarted: false,
        currentPlayer: null,
        deck: { emoji: '💌', cards: 16, type: 'hearts' },
        magicDeck: { emoji: '🔮', cards: 16, type: 'magic' },
        playerHands: {},
        shields: {},
        turnCount: 0,
        playerActions: {}
      }
    };
  }

  addOrUpdatePlayer(room, userData) {
    const existingPlayer = room.players.find(p => p.userId === userData.userId);
    if (!existingPlayer) {
      room.players.push({
        userId: userData.userId,
        name: userData.userName,
        email: userData.userEmail,
        isReady: false,
        score: 0,
        joinedAt: new Date()
      });
    } else {
      existingPlayer.name = userData.userName;
      existingPlayer.email = userData.userEmail;
      if (existingPlayer.score === undefined) existingPlayer.score = 0;
    }
  }

  async startGame(room, roomCode) {
    console.log(`Mock server: Starting game in room ${roomCode}`);

    // Generate tiles and setup game
    room.gameState.tiles = createTileSet();
    room.gameState.gameStarted = true;
    room.gameState.deck.cards = 16;
    room.gameState.magicDeck.cards = 16;
    room.gameState.playerActions = {};

    // Deal initial cards
    room.players.forEach(player => {
      room.gameState.playerHands[player.userId] = createInitialHand(player.userId);
    });

    // Select random starting player
    room.gameState.currentPlayer = room.players[Math.floor(Math.random() * room.players.length)];
    room.gameState.turnCount = 1;

    const gameStartData = {
      tiles: room.gameState.tiles,
      currentPlayer: room.gameState.currentPlayer,
      players: room.players.map(p => ({
        ...p,
        hand: room.gameState.playerHands[p.userId] || [],
        score: p.score || 0,
        isReady: true
      })),
      playerHands: room.gameState.playerHands,
      deck: room.gameState.deck,
      magicDeck: room.gameState.magicDeck,
      turnCount: room.gameState.turnCount,
      gameStarted: true,
      shields: room.gameState.shields || {},
      playerActions: room.gameState.playerActions || {}
    };

    // Broadcast game-start to room
    this.io.to(roomCode).emit('game-start', gameStartData);
    console.log(`Mock server: Game started in room ${roomCode}`);
  }

  executeMagicCardEffect(card, room, targetTileId, playerId) {
    if (card.type === 'wind' && targetTileId !== undefined) {
      const tile = room.gameState.tiles.find(t => t.id == targetTileId);
      if (tile && tile.placedHeart) {
        const actionResult = {
          type: 'wind',
          removedHeart: tile.placedHeart,
          targetedPlayerId: tile.placedHeart.placedBy,
          tileId: tile.id,
          newTileState: {
            id: tile.id,
            color: tile.placedHeart.originalTileColor || 'white',
            emoji: tile.placedHeart.originalTileColor === 'white' ? '⬜' :
                  tile.placedHeart.originalTileColor === 'red' ? '🟥' :
                  tile.placedHeart.originalTileColor === 'yellow' ? '🟨' : '🟩',
            placedHeart: undefined
          }
        };
        // Apply the effect
        const tileIndex = room.gameState.tiles.findIndex(t => t.id == targetTileId);
        if (tileIndex !== -1) {
          room.gameState.tiles[tileIndex] = actionResult.newTileState;
        }
        return actionResult;
      }
    } else if (card.type === 'recycle' && targetTileId !== undefined) {
      const tile = room.gameState.tiles.find(t => t.id == targetTileId);
      if (tile) {
        const previousColor = tile.color;
        // Change tile to white
        tile.color = 'white';
        tile.emoji = '⬜';

        return {
          type: 'recycle',
          previousColor: previousColor,
          newColor: 'white',
          tileId: tile.id,
          newTileState: {
            id: tile.id,
            color: 'white',
            emoji: '⬜',
            placedHeart: tile.placedHeart // Keep any placed heart
          }
        };
      }
    } else if (card.type === 'shield') {
      if (!room.gameState.shields) room.gameState.shields = {};
      room.gameState.shields[playerId] = {
        active: true,
        remainingTurns: 2,
        activatedAt: Date.now(),
        activatedTurn: room.gameState.turnCount || 1,
        activatedBy: playerId,
        protectedPlayerId: playerId
      };
      return {
        type: 'shield',
        activatedFor: playerId,
        protectedPlayerId: playerId,
        remainingTurns: 2,
        message: `Shield activated! Your tiles and hearts are protected for 2 turns.`,
        reinforced: false
      };
    }

    return {
      type: card.type || 'magic',
      cardId: card.id,
      usedBy: playerId,
      effect: 'Magic card used successfully'
    };
  }

  /**
   * Get server port
   */
  getPort() {
    return this.port;
  }

  /**
   * Get room by code
   */
  getRoom(roomCode) {
    return this.rooms.get(roomCode);
  }

  /**
   * Clear all rooms
   */
  clearRooms() {
    this.rooms.clear();
  }

  /**
   * Get room count
   */
  getRoomCount() {
    return this.rooms.size;
  }
}