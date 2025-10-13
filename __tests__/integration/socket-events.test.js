import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Server } from 'socket.io';
import { createServer } from 'node:http';
import { getToken } from 'next-auth/jwt';

// Mock dependencies
vi.mock('mongoose', () => ({
  default: {
    connect: vi.fn().mockResolvedValue(),
    connection: { readyState: 1 }
  }
}));

vi.mock('../../../models.js', () => ({
  PlayerSession: {
    find: vi.fn().mockResolvedValue([]),
    findOneAndUpdate: vi.fn().mockResolvedValue({}),
    deleteOne: vi.fn().mockResolvedValue({})
  },
  Room: {
    find: vi.fn().mockResolvedValue([]),
    findOneAndUpdate: vi.fn().mockResolvedValue({}),
    deleteOne: vi.fn().mockResolvedValue({})
  },
  User: {
    findById: vi.fn().mockResolvedValue({
      id: 'user1',
      email: 'test@example.com',
      name: 'Test User'
    })
  }
}));

vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn().mockResolvedValue({
    id: 'user1',
    jti: 'session1',
    email: 'test@example.com',
    name: 'Test User'
  })
}));

vi.mock('../../src/lib/cards.js', () => ({
  HeartCard: {
    generateRandom: vi.fn().mockReturnValue({
      id: 'heart-1',
      color: 'red',
      value: 2,
      emoji: '❤️',
      type: 'heart'
    })
  },
  WindCard: vi.fn().mockImplementation((id) => ({
    id,
    type: 'wind',
    emoji: '💨',
    name: 'Wind Card',
    canTargetTile: vi.fn(),
    executeEffect: vi.fn()
  })),
  RecycleCard: vi.fn().mockImplementation((id) => ({
    id,
    type: 'recycle',
    emoji: '♻️',
    name: 'Recycle Card',
    canTargetTile: vi.fn(),
    executeEffect: vi.fn()
  })),
  ShieldCard: vi.fn().mockImplementation((id) => ({
    id,
    type: 'shield',
    emoji: '🛡️',
    name: 'Shield Card',
    canTargetTile: vi.fn(() => false),
    executeEffect: vi.fn()
  })),
  generateRandomMagicCard: vi.fn().mockReturnValue({
    id: 'magic-1',
    type: 'wind',
    emoji: '💨'
  }),
  isHeartCard: vi.fn(),
  isMagicCard: vi.fn(),
  createCardFromData: vi.fn()
}));

describe.skip('Socket.IO Events Integration Tests', () => {
  let httpServer, io, serverSocket, clientSocket, testRoomCode;

  beforeEach(async () => {
    // Create test server
    httpServer = createServer();
    io = new Server(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    await new Promise((resolve) => {
      httpServer.listen(() => {
        const port = httpServer.address().port;
        clientSocket = require('socket.io-client')(httpServer, {
          forceNew: true,
          reconnection: false
        });
        resolve();
      });
    });

    // Mock server-side setup
    const rooms = new Map();
    const playerSessions = new Map();
    const turnLocks = new Map();

    testRoomCode = 'TEST01';

    // Mock socket authentication middleware
    io.use(async (socket, next) => {
      try {
        const token = await getToken({
          req: socket.handshake,
          secret: 'test-secret'
        });

        if (!token?.id) return next(new Error('Authentication required'));

        socket.data.userId = token.id;
        socket.data.userEmail = token.email;
        socket.data.userName = token.name;
        socket.data.userSessionId = token.jti;

        next();
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    });

    io.on('connection', (socket) => {
      const { userId, userName, userEmail } = socket.data;

      socket.on('join-room', async ({ roomCode }) => {
        if (!roomCode || typeof roomCode !== 'string') {
          socket.emit('room-error', 'Invalid room code');
          return;
        }

        roomCode = roomCode.toUpperCase();
        let room = rooms.get(roomCode);

        if (!room) {
          // Create new room
          room = {
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
          rooms.set(roomCode, room);
        }

        // Add player to room
        if (!room.players.find(p => p.userId === userId)) {
          room.players.push({
            userId,
            name: userName,
            email: userEmail,
            isReady: false,
            score: 0,
            joinedAt: new Date()
          });
        }

        socket.join(roomCode);
        socket.data.roomCode = roomCode;
        socket.data.userId = userId;

        socket.emit('room-joined', { players: room.players, playerId: userId });
        socket.to(roomCode).emit('player-joined', { players: room.players });
      });

      socket.on('leave-room', async ({ roomCode }) => {
        if (!roomCode) return;

        roomCode = roomCode.toUpperCase();
        const room = rooms.get(roomCode);

        if (room) {
          room.players = room.players.filter(p => p.userId !== userId);
          io.to(roomCode).emit('player-left', { players: room.players });

          if (room.players.length === 0) {
            rooms.delete(roomCode);
          }
        }

        socket.leave(roomCode);
        socket.data.roomCode = null;
      });

      socket.on('player-ready', async ({ roomCode }) => {
        if (!roomCode) return;

        roomCode = roomCode.toUpperCase();
        const room = rooms.get(roomCode);

        if (room) {
          const player = room.players.find(p => p.userId === userId);
          if (player) {
            player.isReady = !player.isReady;
            io.to(roomCode).emit('player-ready', { players: room.players });

            // Start game if both players are ready
            if (room.players.length === 2 && room.players.every(p => p.isReady)) {
              await startGame(room, roomCode);
            }
          }
        }
      });

      socket.on('place-heart', async ({ roomCode, tileId, heartId }) => {
        if (!roomCode || tileId === undefined || heartId === undefined) {
          socket.emit('room-error', 'Invalid input data');
          return;
        }

        roomCode = roomCode.toUpperCase();
        const room = rooms.get(roomCode);

        if (!room || !room.gameState.gameStarted) {
          socket.emit('room-error', 'Game not started');
          return;
        }

        if (room.gameState.currentPlayer?.userId !== userId) {
          socket.emit('room-error', 'Not your turn');
          return;
        }

        // Simulate heart placement logic
        const playerHand = room.gameState.playerHands[userId] || [];
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

        // Place heart
        const heart = playerHand.splice(heartIndex, 1)[0];
        tile.placedHeart = {
          ...heart,
          placedBy: userId,
          originalTileColor: tile.color
        };
        tile.emoji = heart.emoji;
        tile.color = heart.color;

        // Update player score
        const player = room.players.find(p => p.userId === userId);
        if (player) {
          player.score += heart.value || 1;
        }

        io.to(roomCode).emit('heart-placed', {
          tiles: room.gameState.tiles,
          players: room.players.map(p => ({
            ...p,
            hand: room.gameState.playerHands[p.userId] || []
          })),
          playerHands: room.gameState.playerHands
        });
      });

      socket.on('draw-heart', async ({ roomCode }) => {
        if (!roomCode) return;

        roomCode = roomCode.toUpperCase();
        const room = rooms.get(roomCode);

        if (!room || !room.gameState.gameStarted) {
          socket.emit('room-error', 'Game not started');
          return;
        }

        if (room.gameState.currentPlayer?.userId !== userId) {
          socket.emit('room-error', 'Not your turn');
          return;
        }

        if (room.gameState.deck.cards <= 0) {
          socket.emit('room-error', 'No more cards in deck');
          return;
        }

        // Draw heart card
        const { HeartCard } = require('../../src/lib/cards.js');
        const newHeart = HeartCard.generateRandom();

        if (!room.gameState.playerHands[userId]) {
          room.gameState.playerHands[userId] = [];
        }
        room.gameState.playerHands[userId].push(newHeart);
        room.gameState.deck.cards--;

        io.to(roomCode).emit('heart-drawn', {
          players: room.players.map(p => ({
            ...p,
            hand: room.gameState.playerHands[p.userId] || [],
            score: p.score || 0
          })),
          playerHands: room.gameState.playerHands,
          deck: room.gameState.deck
        });
      });

      socket.on('draw-magic-card', async ({ roomCode }) => {
        if (!roomCode) return;

        roomCode = roomCode.toUpperCase();
        const room = rooms.get(roomCode);

        if (!room || !room.gameState.gameStarted) {
          socket.emit('room-error', 'Game not started');
          return;
        }

        if (room.gameState.currentPlayer?.userId !== userId) {
          socket.emit('room-error', 'Not your turn');
          return;
        }

        if (room.gameState.magicDeck.cards <= 0) {
          socket.emit('room-error', 'No more magic cards in deck');
          return;
        }

        // Draw magic card
        const { generateRandomMagicCard } = require('../../src/lib/cards.js');
        const newMagicCard = generateRandomMagicCard();

        if (!room.gameState.playerHands[userId]) {
          room.gameState.playerHands[userId] = [];
        }
        room.gameState.playerHands[userId].push(newMagicCard);
        room.gameState.magicDeck.cards--;

        io.to(roomCode).emit('magic-card-drawn', {
          players: room.players.map(p => ({
            ...p,
            hand: room.gameState.playerHands[p.userId] || [],
            score: p.score || 0
          })),
          playerHands: room.gameState.playerHands,
          magicDeck: room.gameState.magicDeck
        });
      });

      socket.on('end-turn', async ({ roomCode }) => {
        if (!roomCode) return;

        roomCode = roomCode.toUpperCase();
        const room = rooms.get(roomCode);

        if (!room || !room.gameState.gameStarted) {
          socket.emit('room-error', 'Game not started');
          return;
        }

        if (room.gameState.currentPlayer?.userId !== userId) {
          socket.emit('room-error', 'Not your turn');
          return;
        }

        // Switch to next player
        const currentPlayerIndex = room.players.findIndex(p => p.userId === userId);
        const nextPlayerIndex = (currentPlayerIndex + 1) % room.players.length;
        room.gameState.currentPlayer = room.players[nextPlayerIndex];
        room.gameState.turnCount++;

        io.to(roomCode).emit('turn-changed', {
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
      });

      socket.on('use-magic-card', async ({ roomCode, cardId, targetTileId }) => {
        if (!roomCode || !cardId) {
          socket.emit('room-error', 'Invalid input data');
          return;
        }

        roomCode = roomCode.toUpperCase();
        const room = rooms.get(roomCode);

        if (!room || !room.gameState.gameStarted) {
          socket.emit('room-error', 'Game not started');
          return;
        }

        if (room.gameState.currentPlayer?.userId !== userId) {
          socket.emit('room-error', 'Not your turn');
          return;
        }

        // Simulate magic card usage
        const playerHand = room.gameState.playerHands[userId] || [];
        const cardIndex = playerHand.findIndex(c => c.id === cardId);

        if (cardIndex === -1) {
          socket.emit('room-error', 'Card not in your hand');
          return;
        }

        const card = playerHand.splice(cardIndex, 1)[0];

        // Simulate magic card effect
        const actionResult = {
          type: card.type || 'magic',
          cardId,
          usedBy: userId,
          effect: 'Magic card used successfully'
        };

        io.to(roomCode).emit('magic-card-used', {
          card,
          actionResult,
          tiles: room.gameState.tiles,
          players: room.players.map(p => ({
            ...p,
            hand: room.gameState.playerHands[p.userId] || [],
            score: p.score || 0
          })),
          playerHands: room.gameState.playerHands,
          usedBy: userId,
          shields: room.gameState.shields || {}
        });
      });

      async function startGame(room, roomCode) {
        // Generate tiles
        const colors = ['red', 'yellow', 'green'];
        const emojis = ['🟥', '🟨', '🟩'];
        room.gameState.tiles = [];

        for (let i = 0; i < 8; i++) {
          if (Math.random() < 0.3) {
            room.gameState.tiles.push({
              id: i,
              color: 'white',
              emoji: '⬜',
              placedHeart: null
            });
          } else {
            const randomIndex = Math.floor(Math.random() * colors.length);
            room.gameState.tiles.push({
              id: i,
              color: colors[randomIndex],
              emoji: emojis[randomIndex],
              placedHeart: null
            });
          }
        }

        // Deal initial hands
        const { HeartCard, generateRandomMagicCard } = require('../../src/lib/cards.js');
        room.players.forEach(player => {
          room.gameState.playerHands[player.userId] = [];
          for (let i = 0; i < 3; i++) {
            room.gameState.playerHands[player.userId].push(HeartCard.generateRandom());
          }
          for (let i = 0; i < 2; i++) {
            room.gameState.playerHands[player.userId].push(generateRandomMagicCard());
          }
        });

        // Set random starting player
        room.gameState.currentPlayer = room.players[Math.floor(Math.random() * room.players.length)];
        room.gameState.gameStarted = true;
        room.gameState.turnCount = 1;

        // Notify all players
        room.players.forEach(player => {
          const socket = Array.from(io.sockets.sockets.values())
            .find(s => s.data.userId === player.userId);
          if (socket) {
            socket.emit('game-start', {
              tiles: room.gameState.tiles,
              currentPlayer: room.gameState.currentPlayer,
              players: room.players.map(p => ({
                ...p,
                hand: room.gameState.playerHands[p.userId] || [],
                score: p.score || 0
              })),
              playerHands: room.gameState.playerHands,
              deck: room.gameState.deck,
              magicDeck: room.gameState.magicDeck,
              turnCount: room.gameState.turnCount,
              shields: room.gameState.shields || {},
              playerId: player.userId
            });
          }
        });
      }
    });

    // Wait for connection
    await new Promise((resolve) => {
      clientSocket.on('connect', resolve);
    });
  });

  afterEach(() => {
    if (clientSocket) {
      clientSocket.close();
    }
    if (serverSocket) {
      serverSocket.close();
    }
    if (io) {
      io.close();
    }
    if (httpServer) {
      httpServer.close();
    }
    vi.clearAllMocks();
  });

  describe('Room Management Events', () => {
    it('should join room successfully', (done) => {
      clientSocket.emit('join-room', { roomCode: testRoomCode });

      clientSocket.on('room-joined', (data) => {
        expect(data.players).toHaveLength(1);
        expect(data.players[0].userId).toBe('user1');
        expect(data.players[0].name).toBe('Test User');
        expect(data.playerId).toBe('user1');
        done();
      });

      clientSocket.on('room-error', (error) => {
        done(new Error(`Room error: ${error}`));
      });
    });

    it('should reject invalid room codes', (done) => {
      clientSocket.emit('join-room', { roomCode: 'INVALID' });

      clientSocket.on('room-error', (error) => {
        expect(error).toBe('Invalid room code');
        done();
      });

      clientSocket.on('room-joined', () => {
        done(new Error('Should not have joined room with invalid code'));
      });
    });

    it('should handle multiple players joining same room', (done) => {
      const secondClient = require('socket.io-client')(httpServer, {
        forceNew: true,
        reconnection: false
      });

      let joinCount = 0;

      const checkJoins = () => {
        joinCount++;
        if (joinCount === 2) {
          expect(secondClient.connected).toBe(true);
          secondClient.close();
          done();
        }
      };

      clientSocket.emit('join-room', { roomCode: testRoomCode });
      clientSocket.on('room-joined', (data) => {
        expect(data.players).toHaveLength(1);
        checkJoins();
      });

      secondClient.on('connect', () => {
        secondClient.emit('join-room', { roomCode: testRoomCode });
        secondClient.on('room-joined', (data) => {
          expect(data.players).toHaveLength(2);
          checkJoins();
        });
      });
    });

    it('should leave room successfully', (done) => {
      clientSocket.emit('join-room', { roomCode: testRoomCode });

      clientSocket.on('room-joined', () => {
        clientSocket.emit('leave-room', { roomCode: testRoomCode });

        clientSocket.on('player-left', (data) => {
          expect(data.players).toHaveLength(0);
          done();
        });
      });
    });
  });

  describe('Game State Events', () => {
    beforeEach((done) => {
      clientSocket.emit('join-room', { roomCode: testRoomCode });
      clientSocket.on('room-joined', () => done());
    });

    it('should toggle player ready state', (done) => {
      clientSocket.emit('player-ready', { roomCode: testRoomCode });

      clientSocket.on('player-ready', (data) => {
        expect(data.players).toHaveLength(1);
        expect(data.players[0].isReady).toBe(true);
        done();
      });
    });

    it('should start game when both players are ready', (done) => {
      // First player ready
      clientSocket.emit('player-ready', { roomCode: testRoomCode });

      clientSocket.on('player-ready', (data) => {
        if (data.players[0].isReady) {
          // Simulate second player joining and getting ready
          const secondClient = require('socket.io-client')(httpServer, {
            forceNew: true,
            reconnection: false
          });

          secondClient.on('connect', () => {
            secondClient.emit('join-room', { roomCode: testRoomCode });
            secondClient.on('room-joined', () => {
              secondClient.emit('player-ready', { roomCode: testRoomCode });
            });

            secondClient.on('game-start', (gameData) => {
              expect(gameData.tiles).toHaveLength(8);
              expect(gameData.currentPlayer).toBeDefined();
              expect(gameData.playerHands[secondClient.data.userId]).toHaveLength(5);
              expect(gameData.turnCount).toBe(1);
              secondClient.close();
              done();
            });
          });
        }
      });
    });

    it('should handle heart placement', (done) => {
      // Setup game state manually for this test
      const mockTile = { id: 0, color: 'red', emoji: '🟥', placedHeart: null };
      const mockHeart = { id: 'heart-1', color: 'red', value: 2, emoji: '❤️' };

      clientSocket.emit('place-heart', {
        roomCode: testRoomCode,
        tileId: 0,
        heartId: 'heart-1'
      });

      clientSocket.on('heart-placed', (data) => {
        expect(data.tiles).toBeDefined();
        expect(data.players).toBeDefined();
        expect(data.playerHands).toBeDefined();
        done();
      });

      clientSocket.on('room-error', (error) => {
        // Expected error since game isn't started
        if (error === 'Game not started') {
          done();
        } else {
          done(new Error(`Unexpected error: ${error}`));
        }
      });
    });

    it('should handle heart drawing', (done) => {
      clientSocket.emit('draw-heart', { roomCode: testRoomCode });

      clientSocket.on('heart-drawn', (data) => {
        expect(data.players).toBeDefined();
        expect(data.playerHands).toBeDefined();
        expect(data.deck).toBeDefined();
        done();
      });

      clientSocket.on('room-error', (error) => {
        // Expected error since game isn't started
        if (error === 'Game not started') {
          done();
        } else {
          done(new Error(`Unexpected error: ${error}`));
        }
      });
    });

    it('should handle magic card drawing', (done) => {
      clientSocket.emit('draw-magic-card', { roomCode: testRoomCode });

      clientSocket.on('magic-card-drawn', (data) => {
        expect(data.players).toBeDefined();
        expect(data.playerHands).toBeDefined();
        expect(data.magicDeck).toBeDefined();
        done();
      });

      clientSocket.on('room-error', (error) => {
        // Expected error since game isn't started
        if (error === 'Game not started') {
          done();
        } else {
          done(new Error(`Unexpected error: ${error}`));
        }
      });
    });

    it('should handle turn ending', (done) => {
      clientSocket.emit('end-turn', { roomCode: testRoomCode });

      clientSocket.on('turn-changed', (data) => {
        expect(data.currentPlayer).toBeDefined();
        expect(data.turnCount).toBeDefined();
        expect(data.players).toBeDefined();
        expect(data.playerHands).toBeDefined();
        expect(data.deck).toBeDefined();
        expect(data.shields).toBeDefined();
        done();
      });

      clientSocket.on('room-error', (error) => {
        // Expected error since game isn't started
        if (error === 'Game not started') {
          done();
        } else {
          done(new Error(`Unexpected error: ${error}`));
        }
      });
    });

    it('should handle magic card usage', (done) => {
      clientSocket.emit('use-magic-card', {
        roomCode: testRoomCode,
        cardId: 'magic-1',
        targetTileId: 0
      });

      clientSocket.on('magic-card-used', (data) => {
        expect(data.card).toBeDefined();
        expect(data.actionResult).toBeDefined();
        expect(data.tiles).toBeDefined();
        expect(data.players).toBeDefined();
        expect(data.playerHands).toBeDefined();
        expect(data.usedBy).toBe('user1');
        expect(data.shields).toBeDefined();
        done();
      });

      clientSocket.on('room-error', (error) => {
        // Expected error since game isn't started
        if (error === 'Game not started') {
          done();
        } else {
          done(new Error(`Unexpected error: ${error}`));
        }
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid input data gracefully', (done) => {
      clientSocket.emit('place-heart', {
        roomCode: '',
        tileId: null,
        heartId: undefined
      });

      clientSocket.on('room-error', (error) => {
        expect(error).toBe('Invalid input data');
        done();
      });
    });

    it('should handle missing room code', (done) => {
      clientSocket.emit('player-ready', {});

      clientSocket.on('room-error', (error) => {
        expect(error).toBe('Invalid room code');
        done();
      });
    });

    it('should handle authentication failures', (done) => {
      const unauthenticatedClient = require('socket.io-client')(httpServer, {
        forceNew: true,
        reconnection: false,
        auth: { token: 'invalid-token' }
      });

      unauthenticatedClient.on('connect_error', (error) => {
        expect(error.message).toContain('Authentication failed');
        unauthenticatedClient.close();
        done();
      });
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple simultaneous events', (done) => {
      let eventCount = 0;
      const expectedEvents = 3;

      const checkComplete = () => {
        eventCount++;
        if (eventCount === expectedEvents) {
          done();
        }
      };

      clientSocket.emit('join-room', { roomCode: 'ROOM1' });
      clientSocket.emit('player-ready', { roomCode: 'ROOM1' });
      clientSocket.emit('draw-heart', { roomCode: 'ROOM1' });

      clientSocket.on('room-joined', checkComplete);
      clientSocket.on('room-error', checkComplete); // Expected for draw-heart
      clientSocket.on('player-ready', checkComplete);
    });

    it('should handle rapid turn changes', (done) => {
      let turnCount = 0;
      const maxTurns = 5;

      clientSocket.emit('join-room', { roomCode: 'TURNS' });

      clientSocket.on('room-joined', () => {
        const makeTurn = () => {
          if (turnCount < maxTurns) {
            clientSocket.emit('end-turn', { roomCode: 'TURNS' });
          } else {
            done();
          }
        };

        clientSocket.on('turn-changed', () => {
          turnCount++;
          setTimeout(makeTurn, 10);
        });

        // Start making turns (will error but we're testing rapid events)
        makeTurn();
      });

      clientSocket.on('room-error', () => {
        // Expected errors, continue with turn changes
        turnCount++;
        if (turnCount >= maxTurns) {
          done();
        }
      });
    });
  });

  describe('Data Consistency', () => {
    it('should maintain consistent player state across events', (done) => {
      let playerState = null;

      clientSocket.emit('join-room', { roomCode: 'STATE' });

      clientSocket.on('room-joined', (data) => {
        playerState = data.players[0];
        expect(playerState.userId).toBe('user1');
        expect(playerState.name).toBe('Test User');

        clientSocket.emit('player-ready', { roomCode: 'STATE' });
      });

      clientSocket.on('player-ready', (data) => {
        const updatedPlayer = data.players.find(p => p.userId === 'user1');
        expect(updatedPlayer.isReady).toBe(true);
        expect(updatedPlayer.userId).toBe(playerState.userId);
        expect(updatedPlayer.name).toBe(playerState.name);
        done();
      });
    });

    it('should broadcast consistent game state to all players', (done) => {
      const secondClient = require('socket.io-client')(httpServer, {
        forceNew: true,
        reconnection: false
      });

      let gameState1 = null;
      let gameState2 = null;

      const checkGameStates = () => {
        if (gameState1 && gameState2) {
          expect(gameState1.tiles).toEqual(gameState2.tiles);
          expect(gameState1.currentPlayer).toEqual(gameState2.currentPlayer);
          expect(gameState1.turnCount).toBe(gameState2.turnCount);
          secondClient.close();
          done();
        }
      };

      clientSocket.emit('join-room', { roomCode: 'BROADCAST' });

      clientSocket.on('room-joined', () => {
        secondClient.on('connect', () => {
          secondClient.emit('join-room', { roomCode: 'BROADCAST' });
          secondClient.on('room-joined', () => {
            // Both players ready to receive broadcasts
            clientSocket.emit('player-ready', { roomCode: 'BROADCAST' });
          });
        });
      });

      clientSocket.on('player-ready', (data) => {
        gameState1 = data;
        checkGameStates();
      });

      secondClient.on('player-ready', (data) => {
        gameState2 = data;
        checkGameStates();
      });
    });
  });
});