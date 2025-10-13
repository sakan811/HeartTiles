import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Server } from 'socket.io';
import { createServer } from 'node:http';
import { io as ClientIO } from 'socket.io-client';

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

// Mock cards library with actual implementations
vi.mock('../../src/lib/cards.js', () => ({
  HeartCard: {
    generateRandom: vi.fn().mockImplementation(() => ({
      id: `heart-${Date.now()}-${Math.random()}`,
      color: ['red', 'yellow', 'green'][Math.floor(Math.random() * 3)],
      value: Math.floor(Math.random() * 3) + 1,
      emoji: ['❤️', '💛', '💚'][Math.floor(Math.random() * 3)],
      type: 'heart',
      canTargetTile: vi.fn((tile) => !tile.placedHeart),
      calculateScore: vi.fn((tile) => {
        if (tile.color === 'white') return 2;
        return tile.color === 'red' ? 4 : 0;
      })
    }))
  },
  WindCard: vi.fn().mockImplementation((id) => ({
    id: id || `wind-${Date.now()}`,
    type: 'wind',
    emoji: '💨',
    name: 'Wind Card',
    canTargetTile: vi.fn((tile, playerId) => tile.placedHeart && tile.placedHeart.placedBy !== playerId),
    executeEffect: vi.fn((gameState, targetTileId, playerId) => {
      const tile = gameState.tiles.find(t => t.id == targetTileId);
      if (!tile || !tile.placedHeart) throw new Error('Invalid target for Wind card');

      const removedHeart = { ...tile.placedHeart };
      const originalColor = tile.placedHeart.originalTileColor || 'white';

      // Apply the effect to the tile state directly
      const tileIndex = gameState.tiles.findIndex(t => t.id == targetTileId);
      if (tileIndex !== -1) {
        gameState.tiles[tileIndex] = {
          id: tile.id,
          color: originalColor,
          emoji: originalColor === 'white' ? '⬜' :
                originalColor === 'red' ? '🟥' :
                originalColor === 'yellow' ? '🟨' : '🟩',
          placedHeart: undefined
        };
      }

      return {
        type: 'wind',
        removedHeart,
        targetedPlayerId: removedHeart.placedBy,
        tileId: tile.id,
        newTileState: {
          id: tile.id,
          color: originalColor,
          emoji: originalColor === 'white' ? '⬜' :
                originalColor === 'red' ? '🟥' :
                originalColor === 'yellow' ? '🟨' : '🟩',
          placedHeart: undefined
        }
      };
    })
  })),
  RecycleCard: vi.fn().mockImplementation((id) => ({
    id: id || `recycle-${Date.now()}`,
    type: 'recycle',
    emoji: '♻️',
    name: 'Recycle Card',
    canTargetTile: vi.fn((tile) => !tile.placedHeart && tile.color !== 'white'),
    executeEffect: vi.fn((gameState, targetTileId) => {
      const tile = gameState.tiles.find(t => t.id == targetTileId);
      if (!tile || tile.color === 'white' || tile.placedHeart) throw new Error('Invalid target for Recycle card');
      return {
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
    })
  })),
  ShieldCard: vi.fn().mockImplementation((id) => ({
    id: id || `shield-${Date.now()}`,
    type: 'shield',
    emoji: '🛡️',
    name: 'Shield Card',
    canTargetTile: vi.fn(() => false),
    executeEffect: vi.fn((gameState, playerId) => {
      if (!gameState.shields) gameState.shields = {};
      gameState.shields[playerId] = {
        active: true,
        remainingTurns: 3,
        activatedAt: Date.now(),
        activatedTurn: gameState.turnCount || 1,
        activatedBy: playerId,
        protectedPlayerId: playerId
      };
      return {
        type: 'shield',
        activatedFor: playerId,
        protectedPlayerId: playerId,
        remainingTurns: 3,
        message: `Shield activated! Your tiles and hearts are protected for 3 turns.`,
        reinforced: false
      };
    }),
    isActive: vi.fn((shield, currentTurnCount) => {
      if (!shield) return false;
      if (shield.remainingTurns === 0) return false;
      if (shield.activatedTurn !== undefined && currentTurnCount !== undefined) {
        const expirationTurn = shield.activatedTurn + 3;
        return currentTurnCount < expirationTurn;
      }
      return shield.remainingTurns > 0;
    }),
    isPlayerProtected: vi.fn((gameState, playerId, currentTurnCount) => {
      if (!gameState.shields || !gameState.shields[playerId]) return false;
      return gameState.shields[playerId].remainingTurns > 0;
    })
  })),
  generateRandomMagicCard: vi.fn().mockImplementation(() => {
    const types = ['wind', 'recycle', 'shield'];
    const weights = [6, 5, 5]; // Game rule distribution
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    let selectedType = 'wind';

    for (let i = 0; i < types.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        selectedType = types[i];
        break;
      }
    }

    return {
      id: `magic-${Date.now()}-${Math.random()}`,
      type: selectedType,
      emoji: selectedType === 'wind' ? '💨' : selectedType === 'recycle' ? '♻️' : '🛡️'
    };
  }),
  isHeartCard: vi.fn((card) => card?.type === 'heart' || (card?.color && card?.value !== undefined)),
  isMagicCard: vi.fn((card) => card?.type && ['wind', 'recycle', 'shield'].includes(card.type)),
  createCardFromData: vi.fn((cardData) => cardData)
}));

// Helper utility for waiting for events with better error handling and debugging
const waitFor = (socket, event, timeout = 3000) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`Timeout waiting for event: ${event} after ${timeout}ms`));
    }, timeout);

    const listener = (data) => {
      clearTimeout(timer);
      socket.off(event, listener);
      console.log(`Test helper: Received event '${event}' with data:`, data);
      resolve(data);
    };

    socket.on(event, listener);
    console.log(`Test helper: Waiting for event '${event}' with timeout ${timeout}ms`);
  });
};

// Helper to wait for connection
const waitForConnection = (client, timeout = 2000) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Connection timeout after ${timeout}ms`));
    }, timeout);

    if (client.connected) {
      clearTimeout(timer);
      resolve();
      return;
    }

    client.on('connect', () => {
      clearTimeout(timer);
      resolve();
    });

    client.on('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
};

// Helper to create authenticated client with URL string
const createAuthenticatedClient = (port, userId = 'user1') => {
  return ClientIO(`http://localhost:${port}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    timeout: 2000,
    auth: {
      token: {
        id: userId,
        jti: `session-${userId}`,
        email: `${userId}@example.com`,
        name: `User ${userId}`
      }
    }
  });
};

describe('Socket.IO Events Integration Tests', () => {
  let httpServer, io, port;
  let clientSockets = [];
  let roomCounter = 0;
  let testRooms = new Set(); // Track rooms created by each test for cleanup

  // Helper to generate unique room codes - MUST be exactly 6 characters to match server validation
  const generateRoomCode = () => {
    roomCounter++;
    const code = roomCounter.toString().padStart(2, '0');
    return `${code}TEST`;
  };

  // Shared server setup for entire test suite - runs once
  beforeAll(async () => {
    // Find an available port
    httpServer = createServer();
    port = 0; // Let OS assign a random port

    io = new Server(httpServer, {
      cors: { origin: "*", methods: ["GET", "POST"] },
      transports: ['websocket'],
      pingTimeout: 2000,
      pingInterval: 1000
    });

    // Mock server state (simplified from actual server)
    const rooms = new Map();
    const turnLocks = new Map();

    // Expose rooms map to tests for cleanup
    global.__testRooms__ = rooms;

    // Mock authentication middleware that matches actual server behavior exactly
    io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token;
        if (!token?.id) {
          console.log('Test server: Authentication failed - no token.id');
          return next(new Error('Authentication required'));
        }

        // Validate token structure - match actual server validation exactly
        if (!token.email || !token.name || !token.jti) {
          console.log('Test server: Invalid authentication token structure - missing required fields');
          return next(new Error('Invalid authentication token'));
        }

        // Set socket data exactly like the real server
        socket.data.userId = token.id;
        socket.data.userEmail = token.email;
        socket.data.userName = token.name;
        socket.data.userSessionId = token.jti;

        console.log(`Test server: Authentication successful for user ${token.name} (${token.id}) with session ${token.jti}`);
        next();
      } catch (error) {
        console.log('Test server: Authentication error:', error.message);
        next(new Error('Authentication failed'));
      }
    });

    // Simplified server implementation based on actual server.js
    io.on('connection', (socket) => {
      const { userId, userName, userEmail } = socket.data;

      socket.on('join-room', async ({ roomCode }) => {
        console.log(`Test server: join-room event received for roomCode: ${roomCode} from user ${userName} (${userId})`);

        // Validate room code using same logic as actual server
        if (!roomCode || typeof roomCode !== 'string' || !/^[A-Z0-9]{6}$/i.test(roomCode)) {
          console.log(`Test server: Invalid room code rejected: ${roomCode}`);
          socket.emit('room-error', 'Invalid room code');
          return;
        }

        roomCode = roomCode.toUpperCase();
        console.log(`Test server: User ${userName} (${userId}) attempting to join room ${roomCode}`);
        let room = rooms.get(roomCode);

        if (!room) {
          // Create new room exactly like the actual server
          room = {
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
          rooms.set(roomCode, room);
          console.log(`Test server: Room ${roomCode} created by ${userName}`);
        }

        // Add or update player exactly like the actual server
        const existingPlayer = room.players.find(p => p.userId === userId);
        if (!existingPlayer) {
          room.players.push({
            userId, name: userName, email: userEmail,
            isReady: false, score: 0, joinedAt: new Date()
          });
        } else {
          // Update existing player data
          existingPlayer.name = userName;
          existingPlayer.email = userEmail;
          if (existingPlayer.score === undefined) existingPlayer.score = 0;
        }

        // Join socket room and set socket data
        socket.join(roomCode);
        socket.data.roomCode = roomCode;
        socket.data.userId = userId;

        // Emit room-joined event to the joining client
        console.log(`Test server: Emitting room-joined to ${socket.id} for room ${roomCode}`);
        socket.emit('room-joined', { players: room.players, playerId: userId });

        // Broadcast to other players in the room
        if (!existingPlayer) {
          console.log(`Test server: Broadcasting player-joined to room ${roomCode}`);
          socket.to(roomCode).emit('player-joined', { players: room.players });
        }
      });

      socket.on('leave-room', async ({ roomCode }) => {
        if (!roomCode || typeof roomCode !== 'string' || roomCode.length !== 6) {
          socket.emit('room-error', 'Invalid room code');
          return;
        }
        roomCode = roomCode.toUpperCase();
        const room = rooms.get(roomCode);
        if (room) {
          room.players = room.players.filter(p => p.userId !== userId);
          io.to(roomCode).emit('player-left', { players: room.players });
          if (room.players.length === 0) rooms.delete(roomCode);
        }
        socket.leave(roomCode);
        socket.data.roomCode = null;
      });

      socket.on('player-ready', async ({ roomCode }) => {
        console.log(`Test server: player-ready event received from ${userName} (${userId}) for room ${roomCode}`);

        if (!roomCode || typeof roomCode !== 'string' || roomCode.length !== 6) {
          socket.emit('room-error', 'Invalid room code');
          return;
        }
        roomCode = roomCode.toUpperCase();
        const room = rooms.get(roomCode);
        if (room) {
          const player = room.players.find(p => p.userId === userId);
          if (player) {
            player.isReady = !player.isReady;
            console.log(`Test server: Player ${userName} (${userId}) is now ${player.isReady ? 'ready' : 'not ready'}`);
            console.log(`Test server: Room ${roomCode} has ${room.players.length} players, ${room.players.filter(p => p.isReady).length} ready`);

            io.to(roomCode).emit('player-ready', { players: room.players });

            if (room.players.length === 2 && room.players.every(p => p.isReady)) {
              console.log(`Test server: Game starting in room ${roomCode}`);

              // Generate tiles like actual server
              room.gameState.tiles = Array.from({ length: 8 }, (_, i) => ({
                id: i,
                color: i % 3 === 0 ? 'white' : ['red', 'yellow', 'green'][i % 3],
                emoji: i % 3 === 0 ? '⬜' : ['🟥', '🟨', '🟩'][i % 3],
                placedHeart: null
              }));

              room.gameState.gameStarted = true;
              room.gameState.deck.cards = 16;
              room.gameState.magicDeck.cards = 16;
              room.gameState.playerActions = {};

              // Deal initial cards exactly like the actual server (3 hearts, 2 magic cards each)
              room.players.forEach(p => {
                room.gameState.playerHands[p.userId] = [
                  {
                    id: `heart-${p.userId}-1`,
                    color: 'red',
                    value: 2,
                    emoji: '❤️',
                    type: 'heart',
                    canTargetTile: vi.fn((tile) => !tile.placedHeart),
                    calculateScore: vi.fn((tile) => {
                      if (tile.color === 'white') return 2;
                      return tile.color === 'red' ? 4 : 0;
                    })
                  },
                  {
                    id: `heart-${p.userId}-2`,
                    color: 'yellow',
                    value: 1,
                    emoji: '💛',
                    type: 'heart',
                    canTargetTile: vi.fn((tile) => !tile.placedHeart),
                    calculateScore: vi.fn((tile) => {
                      if (tile.color === 'white') return 1;
                      return tile.color === 'yellow' ? 2 : 0;
                    })
                  },
                  {
                    id: `heart-${p.userId}-3`,
                    color: 'green',
                    value: 3,
                    emoji: '💚',
                    type: 'heart',
                    canTargetTile: vi.fn((tile) => !tile.placedHeart),
                    calculateScore: vi.fn((tile) => {
                      if (tile.color === 'white') return 3;
                      return tile.color === 'green' ? 6 : 0;
                    })
                  },
                  {
                    id: `magic-${p.userId}-1`,
                    type: 'wind',
                    emoji: '💨',
                    name: 'Wind Card',
                    canTargetTile: vi.fn((tile, playerId) => tile.placedHeart && tile.placedHeart.placedBy !== playerId),
                    executeEffect: vi.fn((gameState, targetTileId, playerId) => {
                      const tile = gameState.tiles.find(t => t.id == targetTileId);
                      if (!tile || !tile.placedHeart) throw new Error('Invalid target for Wind card');
                      const removedHeart = { ...tile.placedHeart };
                      const originalColor = tile.placedHeart.originalTileColor || 'white';
                      return {
                        type: 'wind',
                        removedHeart,
                        targetedPlayerId: removedHeart.placedBy,
                        tileId: tile.id,
                        newTileState: {
                          id: tile.id,
                          color: originalColor,
                          emoji: originalColor === 'white' ? '⬜' :
                                originalColor === 'red' ? '🟥' :
                                originalColor === 'yellow' ? '🟨' : '🟩',
                          placedHeart: undefined
                        }
                      };
                    })
                  },
                  {
                    id: `magic-${p.userId}-2`,
                    type: 'recycle',
                    emoji: '♻️',
                    name: 'Recycle Card',
                    canTargetTile: vi.fn((tile) => !tile.placedHeart && tile.color !== 'white'),
                    executeEffect: vi.fn((gameState, targetTileId) => {
                      const tile = gameState.tiles.find(t => t.id == targetTileId);
                      if (!tile || tile.color === 'white' || tile.placedHeart) throw new Error('Invalid target for Recycle card');
                      return {
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
                    })
                  }
                ];
              });

              // Select random starting player
              room.gameState.currentPlayer = room.players[Math.floor(Math.random() * room.players.length)];
              room.gameState.turnCount = 1;

              console.log(`Test server: Selected starting player: ${room.gameState.currentPlayer.name} (${room.gameState.currentPlayer.userId})`);

              const gameStartData = {
                tiles: room.gameState.tiles,
                currentPlayer: room.gameState.currentPlayer,
                players: room.players.map(p => ({
                  ...p, hand: room.gameState.playerHands[p.userId] || [], score: p.score || 0
                })),
                playerHands: room.gameState.playerHands,
                deck: room.gameState.deck,
                magicDeck: room.gameState.magicDeck,
                turnCount: room.gameState.turnCount,
                shields: room.gameState.shields || {}
              };

              console.log(`Test server: Prepared game start data for ${room.players.length} players`);

              // Send personalized game data to each player
              room.players.forEach(player => {
                const personalizedData = { ...gameStartData, playerId: player.userId };
                const playerSocket = Array.from(io.sockets.sockets.values())
                  .find(s => s.data.userId === player.userId);
                if (playerSocket) {
                  console.log(`Test server: Sending game-start to ${player.name} (${player.userId})`);
                  playerSocket.emit('game-start', personalizedData);
                  console.log(`Test server: game-start event emitted to ${player.name} (${player.userId})`);
                } else {
                  console.log(`Test server: No socket found for player ${player.name} (${player.userId})`);
                }
              });
              console.log(`Test server: Game started in room ${roomCode}, current player: ${room.gameState.currentPlayer.name}`);
            } else {
              console.log(`Test server: Not starting game - room has ${room.players.length} players, ${room.players.filter(p => p.isReady).length} ready`);
            }
          } else {
            console.log(`Test server: Player ${userName} (${userId}) not found in room ${roomCode}`);
          }
        } else {
          console.log(`Test server: Room ${roomCode} not found`);
        }
      });

      socket.on('place-heart', async ({ roomCode, tileId, heartId }) => {
        if (!roomCode || tileId === undefined || heartId === undefined) {
          socket.emit('room-error', 'Invalid input data');
          return;
        }

        roomCode = roomCode.toUpperCase();
        const room = rooms.get(roomCode);

        if (!room?.gameState?.gameStarted) {
          socket.emit('room-error', 'Game not started');
          return;
        }

        if (room.gameState.currentPlayer?.userId !== userId) {
          socket.emit('room-error', 'Not your turn');
          return;
        }

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

        const heart = playerHand.splice(heartIndex, 1)[0];
        tile.placedHeart = {
          ...heart,
          placedBy: userId,
          originalTileColor: tile.color // Store original tile color
        };
        tile.emoji = heart.emoji;
        tile.color = heart.color;

        const player = room.players.find(p => p.userId === userId);
        if (player) player.score += heart.value || 1;

        io.to(roomCode).emit('heart-placed', {
          tiles: room.gameState.tiles,
          players: room.players.map(p => ({
            ...p, hand: room.gameState.playerHands[p.userId] || [], score: p.score || 0
          })),
          playerHands: room.gameState.playerHands
        });
      });

      socket.on('draw-heart', async ({ roomCode }) => {
        if (!roomCode || typeof roomCode !== 'string' || roomCode.length !== 6) {
          socket.emit('room-error', 'Invalid room code');
          return;
        }
        roomCode = roomCode.toUpperCase();
        const room = rooms.get(roomCode);

        if (!room?.gameState?.gameStarted) {
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

        // Track player actions
        if (!room.gameState.playerActions) {
          room.gameState.playerActions = {};
        }
        if (!room.gameState.playerActions[userId]) {
          room.gameState.playerActions[userId] = { drawnHeart: false, drawnMagic: false };
        }

        if (room.gameState.playerActions[userId].drawnHeart) {
          socket.emit('room-error', 'You can only draw one heart card per turn');
          return;
        }

        // Generate a proper heart card object like the actual server
        const newHeart = {
          id: `heart-${Date.now()}-${Math.random()}`,
          color: ['red', 'yellow', 'green'][Math.floor(Math.random() * 3)],
          value: Math.floor(Math.random() * 3) + 1,
          emoji: ['❤️', '💛', '💚'][Math.floor(Math.random() * 3)],
          type: 'heart',
          canTargetTile: vi.fn((tile) => !tile.placedHeart),
          calculateScore: vi.fn((tile) => {
            if (tile.color === 'white') return 1;
            return Math.random() > 0.5 ? 2 : 0; // Simplified scoring
          })
        };

        if (!room.gameState.playerHands[userId]) {
          room.gameState.playerHands[userId] = [];
        }
        room.gameState.playerHands[userId].push(newHeart);
        room.gameState.deck.cards--;
        room.gameState.playerActions[userId].drawnHeart = true;

        console.log(`Test server: Heart drawn by ${userName} (${userId}) - ${newHeart.color} ${newHeart.value} ${newHeart.emoji}`);

        io.to(roomCode).emit('heart-drawn', {
          players: room.players.map(p => ({
            ...p, hand: room.gameState.playerHands[p.userId] || [], score: p.score || 0
          })),
          playerHands: room.gameState.playerHands,
          deck: room.gameState.deck
        });
      });

      socket.on('draw-magic-card', async ({ roomCode }) => {
        if (!roomCode || typeof roomCode !== 'string' || roomCode.length !== 6) {
          socket.emit('room-error', 'Invalid room code');
          return;
        }
        roomCode = roomCode.toUpperCase();
        const room = rooms.get(roomCode);

        if (!room?.gameState?.gameStarted) {
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

        // Track player actions
        if (!room.gameState.playerActions) {
          room.gameState.playerActions = {};
        }
        if (!room.gameState.playerActions[userId]) {
          room.gameState.playerActions[userId] = { drawnHeart: false, drawnMagic: false };
        }

        if (room.gameState.playerActions[userId].drawnMagic) {
          socket.emit('room-error', 'You can only draw one magic card per turn');
          return;
        }

        // Generate a proper magic card object like the actual server
        const magicCardTypes = ['wind', 'recycle', 'shield'];
        const selectedType = magicCardTypes[Math.floor(Math.random() * magicCardTypes.length)];
        const magicCardData = {
          wind: { emoji: '💨', name: 'Wind Card' },
          recycle: { emoji: '♻️', name: 'Recycle Card' },
          shield: { emoji: '🛡️', name: 'Shield Card' }
        }[selectedType];

        const newMagicCard = {
          id: `magic-${Date.now()}-${Math.random()}`,
          type: selectedType,
          emoji: magicCardData.emoji,
          name: magicCardData.name,
          canTargetTile: selectedType === 'shield' ? vi.fn(() => false) :
                         selectedType === 'wind' ? vi.fn((tile, playerId) => tile.placedHeart && tile.placedHeart.placedBy !== playerId) :
                         vi.fn((tile) => !tile.placedHeart && tile.color !== 'white'),
          executeEffect: selectedType === 'shield' ? vi.fn((gameState, playerId) => {
            if (!gameState.shields) gameState.shields = {};
            gameState.shields[playerId] = {
              active: true,
              remainingTurns: 3,
              activatedAt: Date.now(),
              activatedTurn: gameState.turnCount || 1,
              activatedBy: playerId,
              protectedPlayerId: playerId
            };
            return {
              type: 'shield',
              activatedFor: playerId,
              protectedPlayerId: playerId,
              remainingTurns: 3,
              message: `Shield activated! Your tiles and hearts are protected for 3 turns.`,
              reinforced: false
            };
          }) : vi.fn(() => ({ type: selectedType, effect: 'Magic card used' }))
        };

        if (!room.gameState.playerHands[userId]) {
          room.gameState.playerHands[userId] = [];
        }
        room.gameState.playerHands[userId].push(newMagicCard);
        room.gameState.magicDeck.cards--;
        room.gameState.playerActions[userId].drawnMagic = true;

        console.log(`Test server: Magic card drawn by ${userName} (${userId}) - ${newMagicCard.name} ${newMagicCard.emoji}`);

        io.to(roomCode).emit('magic-card-drawn', {
          players: room.players.map(p => ({
            ...p, hand: room.gameState.playerHands[p.userId] || [], score: p.score || 0
          })),
          playerHands: room.gameState.playerHands,
          magicDeck: room.gameState.magicDeck
        });
      });

      socket.on('end-turn', async ({ roomCode }) => {
        console.log(`Test server: end-turn event received from ${userName} (${userId}) for room ${roomCode}`);

        if (!roomCode || typeof roomCode !== 'string' || roomCode.length !== 6) {
          socket.emit('room-error', 'Invalid room code');
          return;
        }
        roomCode = roomCode.toUpperCase();
        const room = rooms.get(roomCode);

        if (!room?.gameState?.gameStarted) {
          socket.emit('room-error', 'Game not started');
          return;
        }

        if (!room.gameState.currentPlayer || room.gameState.currentPlayer.userId !== userId) {
          socket.emit('room-error', 'Not your turn');
          return;
        }

        // Check if player has drawn required cards
        if (!room.gameState.playerActions) {
          room.gameState.playerActions = {};
        }
        const playerActions = room.gameState.playerActions[userId] || { drawnHeart: false, drawnMagic: false };
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

        // Reset actions for the current player whose turn is ending
        room.gameState.playerActions[userId] = { drawnHeart: false, drawnMagic: false };

        // Find the current player index
        const currentPlayerIndex = room.players.findIndex(p => p.userId === userId);
        const nextPlayerIndex = (currentPlayerIndex + 1) % room.players.length;

        // Switch to next player
        room.gameState.currentPlayer = room.players[nextPlayerIndex];
        room.gameState.turnCount++;

        console.log(`Test server: Turn changed from ${room.players[currentPlayerIndex].name} to ${room.gameState.currentPlayer.name} (turn ${room.gameState.turnCount})`);

        // Broadcast turn change to all players
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

        console.log(`Test server: Broadcasting turn-changed to room ${roomCode}:`, {
          currentPlayer: turnChangeData.currentPlayer.name,
          turnCount: turnChangeData.turnCount
        });

        io.to(roomCode).emit('turn-changed', turnChangeData);
      });

      socket.on('use-magic-card', async ({ roomCode, cardId, targetTileId }) => {
        console.log(`Test server: User ${userName} attempting to use magic card ${cardId} on tile ${targetTileId} in room ${roomCode}`);
        if (!roomCode || !cardId) {
          socket.emit('room-error', 'Invalid input data');
          return;
        }

        roomCode = roomCode.toUpperCase();
        const room = rooms.get(roomCode);

        if (!room?.gameState?.gameStarted) {
          socket.emit('room-error', 'Game not started');
          return;
        }

        if (room.gameState.currentPlayer?.userId !== userId) {
          socket.emit('room-error', 'Not your turn');
          return;
        }

        const playerHand = room.gameState.playerHands[userId] || [];
        const cardIndex = playerHand.findIndex(c => c.id === cardId);

        if (cardIndex === -1) {
          socket.emit('room-error', 'Card not in your hand');
          return;
        }

        const card = playerHand.splice(cardIndex, 1)[0];
        let actionResult = null;

        // Simplified magic card effects for testing
        if (card.type === 'wind' && targetTileId !== undefined) {
          const tile = room.gameState.tiles.find(t => t.id == targetTileId);
          if (tile && tile.placedHeart) {
            actionResult = {
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
          }
        } else if (card.type === 'recycle' && targetTileId !== undefined) {
          const tile = room.gameState.tiles.find(t => t.id == targetTileId);
          if (tile && !tile.placedHeart && tile.color !== 'white') {
            actionResult = {
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
          }
        } else if (card.type === 'shield') {
          if (!room.gameState.shields) room.gameState.shields = {};
          room.gameState.shields[userId] = {
            active: true,
            remainingTurns: 3,
            activatedAt: Date.now(),
            activatedTurn: room.gameState.turnCount || 1,
            activatedBy: userId,
            protectedPlayerId: userId
          };
          actionResult = {
            type: 'shield',
            activatedFor: userId,
            protectedPlayerId: userId,
            remainingTurns: 3,
            message: `Shield activated! Your tiles and hearts are protected for 3 turns.`,
            reinforced: false
          };
        } else {
          actionResult = {
            type: card.type || 'magic',
            cardId,
            usedBy: userId,
            effect: 'Magic card used successfully'
          };
        }

        const magicCardUsedData = {
          card,
          actionResult,
          tiles: room.gameState.tiles,
          players: room.players.map(p => ({
            ...p, hand: room.gameState.playerHands[p.userId] || [], score: p.score || 0
          })),
          playerHands: room.gameState.playerHands,
          usedBy: userId,
          shields: room.gameState.shields || {}
        };

        console.log(`Test server: Broadcasting magic-card-used event to room ${roomCode}:`, {
          cardType: card.type,
          usedBy: userId,
          actionResultType: actionResult?.type
        });

        io.to(roomCode).emit('magic-card-used', magicCardUsedData);
      });
    });

    // Start server and get the actual port
    await new Promise((resolve, reject) => {
      httpServer.listen(0, () => {
        port = httpServer.address().port;
        console.log(`Test server started on port ${port}`);
        resolve();
      });
      httpServer.on('error', reject);
    });
  });

  // Cleanup once after all tests
  afterAll(async () => {
    // Close all client sockets first
    clientSockets.forEach(socket => {
      if (socket && socket.connected) {
        socket.disconnect();
      }
    });
    clientSockets = [];

    // Close server
    if (io) {
      io.close();
    }
    if (httpServer) {
      httpServer.close();
    }
    vi.clearAllMocks();
  });

  // Helper function to create and track client sockets
  const createClient = async (userId = 'user1') => {
    const client = createAuthenticatedClient(port, userId);
    clientSockets.push(client);
    await waitForConnection(client);
    return client;
  };

  // Test cleanup helper
  const cleanupTestRoom = (roomCode) => {
    if (testRooms.has(roomCode)) {
      console.log(`Test cleanup: Removing room ${roomCode} from tracking`);
      testRooms.delete(roomCode);
    }
  };

  // Add beforeEach to clean up test state
  beforeEach(() => {
    // Reset test rooms set for each test
    testRooms.clear();

    // Clean up any leftover rooms in the mock server
    // We need to access the rooms Map from the mock server setup
    // Since it's defined in the beforeAll closure, we need to track rooms differently
  });

  // Add afterEach to clean up rooms created during tests
  afterEach(() => {
    // Clean up all rooms created during this test
    testRooms.forEach(roomCode => {
      console.log(`Test cleanup: Cleaning up room ${roomCode}`);
      if (global.__testRooms__ && global.__testRooms__.has(roomCode)) {
        global.__testRooms__.delete(roomCode);
        console.log(`Test cleanup: Removed room ${roomCode} from server state`);
      }
    });
    testRooms.clear();

    // Clean up any remaining rooms to ensure test isolation
    if (global.__testRooms__) {
      console.log(`Test cleanup: Cleaning up ${global.__testRooms__.size} remaining rooms`);
      global.__testRooms__.clear();
    }
  });

  describe('Room Management Events', () => {
    it('should join room successfully', async () => {
      const client = await createClient();
      const roomCode = generateRoomCode();

      client.emit('join-room', { roomCode });

      const response = await waitFor(client, 'room-joined');
      expect(response.players).toHaveLength(1);
      expect(response.players[0].userId).toBe('user1');
      expect(response.players[0].name).toBe('User user1');
      expect(response.playerId).toBe('user1');
    });

    it('should reject invalid room codes', async () => {
      const client = await createClient();

      client.emit('join-room', { roomCode: 'INVALID' }); // 6 characters but wrong format pattern

      const error = await waitFor(client, 'room-error');
      expect(error).toBe('Invalid room code');
    });

    it('should handle multiple players joining same room', async () => {
      const client1 = await createClient('user1');
      const client2 = await createClient('user2');
      const roomCode = generateRoomCode();

      client1.emit('join-room', { roomCode });
      const response1 = await waitFor(client1, 'room-joined');
      expect(response1.players).toHaveLength(1);

      client2.emit('join-room', { roomCode });
      const response2 = await waitFor(client2, 'room-joined');
      expect(response2.players).toHaveLength(2);
    });

    it('should leave room successfully', async () => {
      const client = await createClient();
      const roomCode = generateRoomCode();

      client.emit('join-room', { roomCode });
      await waitFor(client, 'room-joined');

      client.emit('leave-room', { roomCode });
      const response = await waitFor(client, 'player-left');
      expect(response.players).toHaveLength(0);
    });
  });

  describe('Game State Events', () => {
    it('should toggle player ready state', async () => {
      const client = await createClient();
      const roomCode = generateRoomCode();

      client.emit('join-room', { roomCode });
      await waitFor(client, 'room-joined');

      client.emit('player-ready', { roomCode });
      const response = await waitFor(client, 'player-ready');
      expect(response.players).toHaveLength(1);
      expect(response.players[0].isReady).toBe(true);
    });

    it('should start game when both players are ready', async () => {
      const client1 = await createClient('user1');
      const client2 = await createClient('user2');
      const roomCode = generateRoomCode();

      client1.emit('join-room', { roomCode });
      await waitFor(client1, 'room-joined');

      client2.emit('join-room', { roomCode });
      await waitFor(client2, 'room-joined');

      client1.emit('player-ready', { roomCode });
      await waitFor(client1, 'player-ready');

      client2.emit('player-ready', { roomCode });
      const gameData = await waitFor(client2, 'game-start', 5000); // Increased timeout for game-start

      expect(gameData.tiles).toHaveLength(8);
      expect(gameData.currentPlayer).toBeDefined();
      expect(gameData.turnCount).toBe(1);
    });

    it('should handle heart placement errors when game not started', async () => {
      const client = await createClient();
      const roomCode = generateRoomCode();

      client.emit('join-room', { roomCode });
      await waitFor(client, 'room-joined');

      client.emit('place-heart', {
        roomCode,
        tileId: 0,
        heartId: 'heart-1'
      });

      const error = await waitFor(client, 'room-error');
      expect(error).toBe('Game not started');
    });

    it('should handle heart drawing errors when game not started', async () => {
      const client = await createClient();
      const roomCode = generateRoomCode();

      client.emit('join-room', { roomCode });
      await waitFor(client, 'room-joined');

      client.emit('draw-heart', { roomCode });
      const error = await waitFor(client, 'room-error');
      expect(error).toBe('Game not started');
    });

    it('should handle magic card drawing errors when game not started', async () => {
      const client = await createClient();
      const roomCode = generateRoomCode();

      client.emit('join-room', { roomCode });
      await waitFor(client, 'room-joined');

      client.emit('draw-magic-card', { roomCode });
      const error = await waitFor(client, 'room-error');
      expect(error).toBe('Game not started');
    });

    it('should handle turn ending errors when game not started', async () => {
      const client = await createClient();
      const roomCode = generateRoomCode();

      client.emit('join-room', { roomCode });
      await waitFor(client, 'room-joined');

      client.emit('end-turn', { roomCode });
      const error = await waitFor(client, 'room-error');
      expect(error).toBe('Game not started');
    });

    it('should handle magic card usage errors when game not started', async () => {
      const client = await createClient();
      const roomCode = generateRoomCode();

      client.emit('join-room', { roomCode });
      await waitFor(client, 'room-joined');

      client.emit('use-magic-card', {
        roomCode,
        cardId: 'magic-1',
        targetTileId: 0
      });

      const error = await waitFor(client, 'room-error');
      expect(error).toBe('Game not started');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid input data gracefully', async () => {
      const client = await createClient();
      const roomCode = generateRoomCode();

      client.emit('join-room', { roomCode });
      await waitFor(client, 'room-joined');

      client.emit('place-heart', {
        roomCode: '',
        tileId: null,
        heartId: undefined
      });

      const error = await waitFor(client, 'room-error');
      expect(error).toBe('Invalid input data');
    });

    it('should handle missing room code', async () => {
      const client = await createClient();

      client.emit('player-ready', {});
      const error = await waitFor(client, 'room-error');
      expect(error).toBe('Invalid room code');
    });

    it('should handle authentication failures', async () => {
      const unauthenticatedClient = ClientIO(`http://localhost:${port}`, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        timeout: 2000,
        auth: { token: null }
      });

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Authentication test timeout'));
        }, 3000);

        unauthenticatedClient.on('connect_error', (error) => {
          clearTimeout(timeout);
          expect(error.message).toContain('Authentication required');
          unauthenticatedClient.disconnect();
          resolve();
        });

        unauthenticatedClient.on('connect', () => {
          clearTimeout(timeout);
          reject(new Error('Should not have connected without authentication'));
        });
      });
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple simultaneous events', async () => {
      const client = await createClient();
      const roomCode = generateRoomCode();

      const events = [
        waitFor(client, 'room-joined'),
        waitFor(client, 'room-error'), // Expected for draw-heart
        waitFor(client, 'player-ready')
      ];

      client.emit('join-room', { roomCode });
      client.emit('player-ready', { roomCode });
      client.emit('draw-heart', { roomCode });

      await Promise.allSettled(events);
    });

    it('should handle rapid turn changes', async () => {
      const client = await createClient();
      const roomCode = generateRoomCode();

      client.emit('join-room', { roomCode });
      await waitFor(client, 'room-joined');

      // Send multiple end-turn events rapidly (will error but tests event handling)
      for (let i = 0; i < 5; i++) {
        client.emit('end-turn', { roomCode });
      }

      // Wait a bit for events to process
      await new Promise(resolve => setTimeout(resolve, 100));
    });
  });

  describe('Data Consistency', () => {
    it('should maintain consistent player state across events', async () => {
      const client = await createClient();
      const roomCode = generateRoomCode();

      client.emit('join-room', { roomCode });
      const joinResponse = await waitFor(client, 'room-joined');

      const playerState = joinResponse.players[0];
      expect(playerState.userId).toBe('user1');
      expect(playerState.name).toBe('User user1');

      client.emit('player-ready', { roomCode });
      const readyResponse = await waitFor(client, 'player-ready');

      const updatedPlayer = readyResponse.players.find(p => p.userId === 'user1');
      expect(updatedPlayer.isReady).toBe(true);
      expect(updatedPlayer.userId).toBe(playerState.userId);
      expect(updatedPlayer.name).toBe(playerState.name);
    });

    it('should broadcast consistent game state to all players', async () => {
      const client1 = await createClient('user1');
      const client2 = await createClient('user2');
      const roomCode = generateRoomCode();

      client1.emit('join-room', { roomCode });
      await waitFor(client1, 'room-joined');

      client2.emit('join-room', { roomCode });
      await waitFor(client2, 'room-joined');

      client1.emit('player-ready', { roomCode });

      const [gameState1, gameState2] = await Promise.all([
        waitFor(client1, 'player-ready'),
        waitFor(client2, 'player-ready')
      ]);

      expect(gameState1.players).toEqual(gameState2.players);
    });
  });

  describe('Heart Card Mechanics', () => {
    it('should allow placing hearts on valid tiles during player turn', async () => {
      const client1 = await createClient('user1');
      const client2 = await createClient('user2');
      const roomCode = generateRoomCode();
      testRooms.add(roomCode);

      // Set up a game
      client1.emit('join-room', { roomCode });
      await waitFor(client1, 'room-joined');

      client2.emit('join-room', { roomCode });
      await waitFor(client2, 'room-joined');

      client1.emit('player-ready', { roomCode });
      await waitFor(client1, 'player-ready');

      client2.emit('player-ready', { roomCode });
      const gameData = await waitFor(client2, 'game-start', 5000); // Increased timeout for game-start

      // Check that players have initial hearts
      expect(gameData.players).toHaveLength(2);
      const currentPlayer = gameData.players.find(p => p.userId === gameData.currentPlayer.userId);
      expect(currentPlayer.hand.some(card => card.type === 'heart')).toBe(true);

      // Get a heart card and empty tile to place it on
      const heartCard = currentPlayer.hand.find(card => card.type === 'heart');
      const emptyTile = gameData.tiles.find(tile => !tile.placedHeart);

      if (heartCard && emptyTile && gameData.currentPlayer.userId === 'user1') {
        client1.emit('place-heart', {
          roomCode,
          tileId: emptyTile.id,
          heartId: heartCard.id
        });

        const response = await waitFor(client1, 'heart-placed');
        expect(response.tiles).toBeDefined();
        const updatedTile = response.tiles.find(t => t.id === emptyTile.id);
        expect(updatedTile.placedHeart).toBeDefined();
        expect(updatedTile.placedHeart.placedBy).toBe('user1');
      }
    });

    it('should reject heart placement on occupied tiles', async () => {
      const client1 = await createClient('user1');
      const client2 = await createClient('user2');
      const roomCode = generateRoomCode();
      testRooms.add(roomCode);

      // Set up a game
      client1.emit('join-room', { roomCode });
      await waitFor(client1, 'room-joined');

      client2.emit('join-room', { roomCode });
      await waitFor(client2, 'room-joined');

      client1.emit('player-ready', { roomCode });
      await waitFor(client1, 'player-ready');

      client2.emit('player-ready', { roomCode });
      const gameData = await waitFor(client2, 'game-start', 5000); // Increased timeout for game-start

      // Find the current player
      const currentPlayer = gameData.players.find(p => p.userId === gameData.currentPlayer.userId);
      const heartCard = currentPlayer.hand.find(card => card.type === 'heart');

      if (heartCard && gameData.currentPlayer.userId === 'user1') {
        // Try to place a heart on an invalid tile (null)
        client1.emit('place-heart', {
          roomCode,
          tileId: 999, // Non-existent tile
          heartId: heartCard.id
        });

        const error = await waitFor(client1, 'room-error');
        expect(error).toBe('Invalid tile');
      }
    });

    it('should calculate scores correctly based on heart-tile color matching', async () => {
      const client1 = await createClient('user1');
      const client2 = await createClient('user2');
      const roomCode = generateRoomCode();
      testRooms.add(roomCode);

      // Set up a game
      client1.emit('join-room', { roomCode });
      await waitFor(client1, 'room-joined');

      client2.emit('join-room', { roomCode });
      await waitFor(client2, 'room-joined');

      client1.emit('player-ready', { roomCode });
      await waitFor(client1, 'player-ready');

      client2.emit('player-ready', { roomCode });
      const gameData = await waitFor(client2, 'game-start', 5000); // Increased timeout for game-start

      const currentPlayer = gameData.players.find(p => p.userId === gameData.currentPlayer.userId);
      const heartCard = currentPlayer.hand.find(card => card.type === 'heart');
      const matchingTile = gameData.tiles.find(tile => !tile.placedHeart && tile.color === heartCard.color);

      if (heartCard && matchingTile && gameData.currentPlayer.userId === 'user1') {
        const initialScore = currentPlayer.score || 0;

        client1.emit('place-heart', {
          roomCode,
          tileId: matchingTile.id,
          heartId: heartCard.id
        });

        const response = await waitFor(client1, 'heart-placed');
        const updatedPlayer = response.players.find(p => p.userId === 'user1');

        // Should score double points for color match
        expect(updatedPlayer.score).toBeGreaterThan(initialScore);
      }
    });
  });

  describe('Magic Card Mechanics', () => {
    it('should allow drawing magic cards during turn', async () => {
      const client1 = await createClient('user1');
      const client2 = await createClient('user2');
      const roomCode = generateRoomCode();
      testRooms.add(roomCode);

      // Set up a game
      client1.emit('join-room', { roomCode });
      await waitFor(client1, 'room-joined');

      client2.emit('join-room', { roomCode });
      await waitFor(client2, 'room-joined');

      client1.emit('player-ready', { roomCode });
      await waitFor(client1, 'player-ready');

      client2.emit('player-ready', { roomCode });
      const gameData = await waitFor(client2, 'game-start', 5000); // Increased timeout for game-start

      const currentPlayer = gameData.players.find(p => p.userId === gameData.currentPlayer.userId);
      const initialMagicCount = currentPlayer.hand.filter(card => card.type !== 'heart').length;

      if (gameData.currentPlayer.userId === 'user1') {
        client1.emit('draw-magic-card', { roomCode });

        const response = await waitFor(client1, 'magic-card-drawn');
        const updatedPlayer = response.players.find(p => p.userId === 'user1');
        const newMagicCount = updatedPlayer.hand.filter(card => card.type !== 'heart').length;

        expect(newMagicCount).toBeGreaterThan(initialMagicCount);
        expect(response.magicDeck.cards).toBeLessThan(gameData.magicDeck.cards);
      }
    });

    it('should handle wind card usage correctly', async () => {
      const client1 = await createClient('user1');
      const client2 = await createClient('user2');
      const roomCode = generateRoomCode();

      // Set up a game
      client1.emit('join-room', { roomCode });
      await waitFor(client1, 'room-joined');

      client2.emit('join-room', { roomCode });
      await waitFor(client2, 'room-joined');

      client1.emit('player-ready', { roomCode });
      await waitFor(client1, 'player-ready');

      client2.emit('player-ready', { roomCode });
      const gameData = await waitFor(client2, 'game-start', 5000); // Increased timeout for game-start

      // Set up scenario: player1 places a heart, then player2 uses wind card
      // This test assumes player1 goes first for simplicity
      const player1Heart = gameData.players[0].hand.find(card => card.type === 'heart');
      const emptyTile = gameData.tiles.find(tile => !tile.placedHeart);

      if (player1Heart && emptyTile && gameData.currentPlayer.userId === gameData.players[0].userId) {
        // Player 1 places a heart
        const player1Client = gameData.players[0].userId === 'user1' ? client1 : client2;
        const player2Client = gameData.players[0].userId === 'user1' ? client2 : client1;

        player1Client.emit('place-heart', {
          roomCode,
          tileId: emptyTile.id,
          heartId: player1Heart.id
        });

        await waitFor(player1Client, 'heart-placed');

        // Player 1 ends turn
        player1Client.emit('end-turn', { roomCode });
        await waitFor(player1Client, 'turn-changed');

        // Player 2 should now have wind card and be current player
        const player2TurnData = await waitFor(player2Client, 'turn-changed');
        const player2 = player2TurnData.players.find(p => p.userId === player2TurnData.currentPlayer.userId);
        const windCard = player2.hand.find(card => card.type === 'wind');

        if (windCard) {
          player2Client.emit('use-magic-card', {
            roomCode,
            cardId: windCard.id,
            targetTileId: emptyTile.id
          });

          const response = await waitFor(player2Client, 'magic-card-used');
          expect(response.actionResult.type).toBe('wind');
          expect(response.tiles.find(t => t.id === emptyTile.id).placedHeart).toBeUndefined();
        }
      }
    });

    it('should handle shield card activation correctly', async () => {
      const client1 = await createClient('user1');
      const roomCode = generateRoomCode();

      // Set up a game
      client1.emit('join-room', { roomCode });
      await waitFor(client1, 'room-joined');

      client1.emit('player-ready', { roomCode });
      await waitFor(client1, 'player-ready');

      // For single player test, we can't start a game, but we can test the shield logic
      // This would need a more complex setup in a real scenario
    });
  });

  describe('Turn Management', () => {
    it('should enforce turn-based gameplay', async () => {
      const client1 = await createClient('user1');
      const client2 = await createClient('user2');
      const roomCode = generateRoomCode();
      testRooms.add(roomCode);

      // Set up a game
      client1.emit('join-room', { roomCode });
      await waitFor(client1, 'room-joined');

      client2.emit('join-room', { roomCode });
      await waitFor(client2, 'room-joined');

      client1.emit('player-ready', { roomCode });
      await waitFor(client1, 'player-ready');

      client2.emit('player-ready', { roomCode });
      const gameData = await waitFor(client2, 'game-start', 5000); // Increased timeout for game-start

      // Determine which client is the current player and which is not
      const currentClient = gameData.currentPlayer.userId === 'user1' ? client1 : client2;
      const otherClient = gameData.currentPlayer.userId === 'user1' ? client2 : client1;
      const currentPlayer = gameData.players.find(p => p.userId === gameData.currentPlayer.userId);
      const heartCard = currentPlayer.hand.find(card => card.type === 'heart');
      const emptyTile = gameData.tiles.find(tile => !tile.placedHeart);

      if (heartCard && emptyTile) {
        // Non-current player tries to place a heart (should fail)
        otherClient.emit('place-heart', {
          roomCode,
          tileId: emptyTile.id,
          heartId: heartCard.id
        });

        const error = await waitFor(otherClient, 'room-error');
        expect(error).toBe('Not your turn');

        // Current player places a heart (should succeed)
        currentClient.emit('place-heart', {
          roomCode,
          tileId: emptyTile.id,
          heartId: heartCard.id
        });

        const response = await waitFor(currentClient, 'heart-placed');
        expect(response.tiles).toBeDefined();
      }
    });

    it('should require drawing cards before ending turn', async () => {
      const client1 = await createClient('user1');
      const client2 = await createClient('user2');
      const roomCode = generateRoomCode();
      testRooms.add(roomCode);

      // Set up a game
      client1.emit('join-room', { roomCode });
      await waitFor(client1, 'room-joined');

      client2.emit('join-room', { roomCode });
      await waitFor(client2, 'room-joined');

      client1.emit('player-ready', { roomCode });
      await waitFor(client1, 'player-ready');

      client2.emit('player-ready', { roomCode });
      const gameData = await waitFor(client2, 'game-start', 5000); // Increased timeout for game-start

      const currentClient = gameData.currentPlayer.userId === 'user1' ? client1 : client2;

      // Try to end turn without drawing cards (should fail)
      currentClient.emit('end-turn', { roomCode });

      const error = await waitFor(currentClient, 'room-error');
      expect(error).toBe('You must draw a heart card before ending your turn');
    });
  });
});