import { Server } from 'socket.io';
import { createServer } from 'node:http';
import { vi } from 'vitest';
import { createInitialHand, generateRandomHeartCard, generateRandomMagicCard } from '../factories/card-factories.js';
import { createTileSet } from '../factories/game-factories.js';

/**
 * Mock Socket.IO Server for integration testing
 * Encapsulates all server behavior and game logic
 */
export class MockSocketServer {
  constructor(options = {}) {
    this.httpServer = null;
    this.io = null;
    this.port = null;
    this.rooms = new Map();
    this.turnLocks = new Map();
    this.clientSockets = [];
    this.options = {
      cors: { origin: "*", methods: ["GET", "POST"] },
      transports: ['websocket'],
      pingTimeout: 2000,
      pingInterval: 1000,
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

    // Setup authentication middleware
    this.setupAuthMiddleware();

    // Setup event handlers
    this.setupEventHandlers();

    // Start server and get the actual port
    await new Promise((resolve, reject) => {
      this.httpServer.listen(0, () => {
        this.port = this.httpServer.address().port;
        console.log(`Mock server started on port ${this.port}`);
        resolve();
      });
      this.httpServer.on('error', reject);
    });

    return this.port;
  }

  /**
   * Stop the mock server
   */
  async stop() {
    // Close all client sockets first
    this.clientSockets.forEach(socket => {
      if (socket && socket.connected) {
        socket.disconnect();
      }
    });
    this.clientSockets = [];

    // Close server
    if (this.io) {
      this.io.close();
    }
    if (this.httpServer) {
      this.httpServer.close();
    }
  }

  /**
   * Setup authentication middleware
   */
  setupAuthMiddleware() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token;
        if (!token?.id) {
          console.log('Mock server: Authentication failed - no token.id');
          return next(new Error('Authentication required'));
        }

        // Validate token structure
        if (!token.email || !token.name || !token.jti) {
          console.log('Mock server: Invalid authentication token structure');
          return next(new Error('Invalid authentication token'));
        }

        // Set socket data
        socket.data.userId = token.id;
        socket.data.userEmail = token.email;
        socket.data.userName = token.name;
        socket.data.userSessionId = token.jti;

        console.log(`Mock server: Authentication successful for user ${token.name} (${token.id})`);
        next();
      } catch (error) {
        console.log('Mock server: Authentication error:', error.message);
        next(new Error('Authentication failed'));
      }
    });
  }

  /**
   * Setup all socket event handlers
   */
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      const { userId, userName, userEmail } = socket.data;

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
    });
  }

  /**
   * Handle join-room event
   */
  async handleJoinRoom(socket, { roomCode }) {
    console.log(`Mock server: join-room event for roomCode: ${roomCode} from user ${socket.data.userName}`);

    // Validate room code
    if (!roomCode || typeof roomCode !== 'string' || !/^[A-Z0-9]{6}$/i.test(roomCode)) {
      console.log(`Mock server: Invalid room code rejected: ${roomCode}`);
      socket.emit('room-error', 'Invalid room code');
      return;
    }

    roomCode = roomCode.toUpperCase();
    let room = this.rooms.get(roomCode);

    if (!room) {
      // Create new room
      room = this.createRoom(roomCode);
      this.rooms.set(roomCode, room);
      console.log(`Mock server: Room ${roomCode} created by ${socket.data.userName}`);
    }

    // Add or update player
    this.addOrUpdatePlayer(room, socket.data);

    // Join socket room and set socket data
    socket.join(roomCode);
    socket.data.roomCode = roomCode;

    // Emit room-joined event to current player with updated room state
    socket.emit('room-joined', { players: room.players, playerId: socket.data.userId });

    // Broadcast player-joined event to all players in room (including this one for consistency)
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
    socket.data.roomCode = null;
  }

  /**
   * Handle player-ready event
   */
  async handlePlayerReady(socket, { roomCode }) {
    console.log(`Mock server: player-ready from ${socket.data.userName} for room ${roomCode}`);

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
        console.log(`Mock server: Player ${socket.data.userName} is now ${player.isReady ? 'ready' : 'not ready'}`);

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
        ...p, hand: room.gameState.playerHands[p.userId] || [], score: p.score || 0
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

    if (room.gameState.deck.cards <= 0) {
      socket.emit('room-error', 'No more cards in deck');
      return;
    }

    // Track player actions
    this.ensurePlayerActions(room, socket.data.userId);
    if (room.gameState.playerActions[socket.data.userId].drawnHeart) {
      socket.emit('room-error', 'You can only draw one heart card per turn');
      return;
    }

    // Generate new heart card
    const newHeart = generateRandomHeartCard();
    room.gameState.playerHands[socket.data.userId].push(newHeart);
    room.gameState.deck.cards--;
    room.gameState.playerActions[socket.data.userId].drawnHeart = true;

    console.log(`Mock server: Heart drawn by ${socket.data.userName} - ${newHeart.color} ${newHeart.value} ${newHeart.emoji}`);

    // Broadcast heart-drawn event
    this.io.to(roomCode).emit('heart-drawn', {
      players: room.players.map(p => ({
        ...p, hand: room.gameState.playerHands[p.userId] || [], score: p.score || 0
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

    if (room.gameState.magicDeck.cards <= 0) {
      socket.emit('room-error', 'No more magic cards in deck');
      return;
    }

    // Track player actions
    this.ensurePlayerActions(room, socket.data.userId);
    if (room.gameState.playerActions[socket.data.userId].drawnMagic) {
      socket.emit('room-error', 'You can only draw one magic card per turn');
      return;
    }

    // Generate new magic card
    const newMagicCard = generateRandomMagicCard();
    room.gameState.playerHands[socket.data.userId].push(newMagicCard);
    room.gameState.magicDeck.cards--;
    room.gameState.playerActions[socket.data.userId].drawnMagic = true;

    console.log(`Mock server: Magic card drawn by ${socket.data.userName} - ${newMagicCard.name} ${newMagicCard.emoji}`);

    // Broadcast magic-card-drawn event
    this.io.to(roomCode).emit('magic-card-drawn', {
      players: room.players.map(p => ({
        ...p, hand: room.gameState.playerHands[p.userId] || [], score: p.score || 0
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
    console.log(`Mock server: User ${socket.data.userName} using magic card ${cardId} on tile ${targetTileId} in room ${roomCode}`);

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

    const magicCardUsedData = {
      card,
      actionResult,
      tiles: room.gameState.tiles,
      players: room.players.map(p => ({
        ...p, hand: room.gameState.playerHands[p.userId] || [], score: p.score || 0
      })),
      playerHands: room.gameState.playerHands,
      usedBy: socket.data.userId,
      shields: room.gameState.shields || {}
    };

    console.log(`Mock server: Broadcasting magic-card-used event to room ${roomCode}`);

    this.io.to(roomCode).emit('magic-card-used', magicCardUsedData);
  }

  /**
   * Handle end-turn event
   */
  async handleEndTurn(socket, { roomCode }) {
    console.log(`Mock server: end-turn from ${socket.data.userName} for room ${roomCode}`);

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

    // Check if player has drawn required cards
    this.ensurePlayerActions(room, socket.data.userId);
    const playerActions = room.gameState.playerActions[socket.data.userId] || { drawnHeart: false, drawnMagic: false };
    const heartDeckEmpty = room.gameState.deck.cards <= 0;
    const magicDeckEmpty = room.gameState.magicDeck.cards <= 0;

    if (!playerActions.drawnHeart && !heartDeckEmpty) {
      socket.emit('room-error', 'You must draw a heart card before ending your turn');
      return;
    }

    if (!playerActions.drawnMagic && !magicDeckEmpty) {
      socket.emit('room-error', 'You must draw a magic card before ending your turn');
      return;
    }

    // Reset actions for current player
    room.gameState.playerActions[socket.data.userId] = { drawnHeart: false, drawnMagic: false };

    // Switch to next player
    const currentPlayerIndex = room.players.findIndex(p => p.userId === socket.data.userId);
    const nextPlayerIndex = (currentPlayerIndex + 1) % room.players.length;
    room.gameState.currentPlayer = room.players[nextPlayerIndex];
    room.gameState.turnCount++;

    console.log(`Mock server: Turn changed to ${room.gameState.currentPlayer.name} (turn ${room.gameState.turnCount})`);

    // Broadcast turn-changed event
    const turnChangeData = {
      currentPlayer: room.gameState.currentPlayer,
      turnCount: room.gameState.turnCount,
      players: room.players.map(p => ({
        ...p, hand: room.gameState.playerHands[p.userId] || []
      })),
      playerHands: room.gameState.playerHands,
      deck: room.gameState.deck,
      shields: room.gameState.shields || {}
    };

    this.io.to(roomCode).emit('turn-changed', turnChangeData);
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
        tiles: [], // Will be generated when game starts
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
      // Update existing player data
      existingPlayer.name = userData.userName;
      existingPlayer.email = userData.userEmail;
      if (existingPlayer.score === undefined) existingPlayer.score = 0;
    }
  }

  async startGame(room, roomCode) {
    console.log(`Mock server: Game starting in room ${roomCode}`);

    // Generate tiles
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
        isReady: true // All players are ready when game starts
      })),
      playerHands: room.gameState.playerHands,
      deck: room.gameState.deck,
      magicDeck: room.gameState.magicDeck,
      turnCount: room.gameState.turnCount,
      gameStarted: true,
      shields: room.gameState.shields || {}
    };

    console.log(`Mock server: Broadcasting game-start to room ${roomCode}`);
    this.io.to(roomCode).emit('game-start', gameStartData);
  }

  ensurePlayerActions(room, userId) {
    if (!room.gameState.playerActions) {
      room.gameState.playerActions = {};
    }
    if (!room.gameState.playerActions[userId]) {
      room.gameState.playerActions[userId] = { drawnHeart: false, drawnMagic: false };
    }
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
      if (tile && !tile.placedHeart && tile.color !== 'white') {
        const actionResult = {
          type: 'recycle',
          previousColor: tile.color,
          newColor: 'white',
          tileId: tile.id,
          newTileState: {
            id: tile.id,
            color: 'white',
            emoji: '⬜',
            placedHeart: tile.placedHeart
          }
        };
        // Apply the effect
        const tileIndex = room.gameState.tiles.findIndex(t => t.id == targetTileId);
        if (tileIndex !== -1) {
          room.gameState.tiles[tileIndex] = actionResult.newTileState;
        }
        return actionResult;
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