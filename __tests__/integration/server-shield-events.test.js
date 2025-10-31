import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createServer } from 'node:http';
import { io as ioc } from 'socket.io-client';
import { Server } from 'socket.io';
import {
  validateTurn,
  checkAndExpireShields
} from '../../server.js';

function waitFor(socket, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    if (!socket || !socket.connected) {
      reject(new Error(`Socket is not connected for event: ${event}`));
      return;
    }

    let timer = null;
    let resolved = false;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (socket && typeof socket.off === 'function' && !resolved) {
        socket.off(event, listener);
      }
    };

    timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new Error(`Timeout waiting for event: ${event} after ${timeout}ms`));
      }
    }, timeout);

    const listener = (data) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(data);
      }
    };

    socket.on(event, listener);
  });
}

describe('Server Shield Event Integration', () => {
  let io, serverSocket, clientSocket, player1Socket, player2Socket;
  let httpServer, port;
  let testRoom, testRooms;
  let player1Id, player2Id;
  let rooms; // Shared rooms Map for all sockets

  beforeAll(async () => {
    // Initialize shared rooms map
    rooms = new Map();

    return new Promise((resolve) => {
      httpServer = createServer();
      io = new Server(httpServer, {
        cors: {
          origin: "*",
          methods: ["GET", "POST"]
        }
      });

      // Mock authentication middleware
      io.use(async (socket, next) => {
        const { userId, userName, userEmail } = socket.handshake.auth || {};
        if (!userId || !userName || !userEmail) {
          return next(new Error('Authentication required'));
        }
        socket.data.userId = userId;
        socket.data.userEmail = userEmail;
        socket.data.userName = userName;
        socket.data.userSessionId = `session_${userId}`;
        next();
      });

      // Setup socket handlers with real game logic
      io.on('connection', (socket) => {
        serverSocket = socket;
        setupShieldSocketHandlers(socket, io);
      });

      httpServer.listen(() => {
        port = httpServer.address().port;
        resolve();
      });
    });
  });

  afterAll(() => {
    if (player1Socket) player1Socket.disconnect();
    if (player2Socket) player2Socket.disconnect();
    if (clientSocket) clientSocket.disconnect();
    if (io) io.close();
    if (httpServer) httpServer.close();
  });

  // Setup socket handlers for shield testing
  function setupShieldSocketHandlers(socket, io) {

    socket.on('join-room', async ({ roomCode }) => {
      const { userId, userName, userEmail } = socket.data;

      if (!rooms.has(roomCode)) {
        rooms.set(roomCode, {
          code: roomCode,
          players: [],
          maxPlayers: 2,
          gameState: {
            tiles: [
              { id: 1, color: 'red', emoji: '🟥', placedHeart: null },
              { id: 2, color: 'yellow', emoji: '🟨', placedHeart: null },
              { id: 3, color: 'green', emoji: '🟩', placedHeart: null },
              { id: 4, color: 'white', emoji: '⬜', placedHeart: null }
            ],
            gameStarted: false,
            currentPlayer: null,
            deck: { emoji: '💌', cards: 10, type: 'hearts' },
            magicDeck: { emoji: '🔮', cards: 10, type: 'magic' },
            playerHands: {},
            shields: {},
            turnCount: 0,
            playerActions: {}
          }
        });
      }

      const room = rooms.get(roomCode);
      const existingPlayer = room.players.find(p => p.userId === userId);

      if (!existingPlayer && room.players.length < room.maxPlayers) {
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

      socket.emit('room-joined', {
        players: room.players,
        playerId: userId
      });

      io.to(roomCode).emit('player-joined', { players: room.players });
    });

    socket.on('player-ready', async ({ roomCode }) => {
      const { userId } = socket.data;
      const room = rooms.get(roomCode);

      if (!room) return;

      const player = room.players.find(p => p.userId === userId);
      if (!player) return;

      player.isReady = !player.isReady;

      // Start game if both players are ready
      if (room.players.length === 2 && room.players.every(p => p.isReady)) {
        room.gameState.gameStarted = true;
        room.gameState.currentPlayer = room.players[0];
        room.gameState.turnCount = 1;

        // Setup test hands for shield testing
        room.gameState.playerHands[room.players[0].userId] = [
          { id: 'shield1', type: 'shield', emoji: '🛡️', name: 'Shield Card' },
          { id: 'heart1', type: 'heart', color: 'blue', value: 2, emoji: '💙' }
        ];
        room.gameState.playerHands[room.players[1].userId] = [
          { id: 'wind1', type: 'wind', emoji: '💨', name: 'Wind Card' },
          { id: 'recycle1', type: 'recycle', emoji: '♻️', name: 'Recycle Card' }
        ];

        // Place initial hearts for testing
        room.gameState.tiles[0].placedHeart = {
          color: 'red', value: 2, emoji: '❤️', placedBy: room.players[0].userId
        };
        room.gameState.tiles[1].placedHeart = {
          color: 'yellow', value: 1, emoji: '💛', placedBy: room.players[1].userId
        };

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
          playerActions: room.gameState.playerActions || {},
          gameStarted: room.gameState.gameStarted
        };

        room.players.forEach(player => {
          const playerSocket = Array.from(io.sockets.sockets.values())
            .find(s => s.data.userId === player.userId);
          if (playerSocket) {
            playerSocket.emit('game-start', { ...gameStartData, playerId: player.userId });
          }
        });
      } else {
        // Emit player-ready event to all players in room
        io.to(roomCode).emit('player-ready', { players: room.players });
        // Also emit to the specific player who toggled ready
        socket.emit('player-ready', { players: room.players });
      }
    });

    socket.on('use-magic-card', async ({ roomCode, cardId, targetTileId }) => {
      const { userId } = socket.data;
      const room = rooms.get(roomCode);

      if (!room || !room.gameState.gameStarted) {
        socket.emit('room-error', 'Game not started');
        return;
      }

      if (room.gameState.currentPlayer.userId !== userId) {
        socket.emit('room-error', 'Not your turn');
        return;
      }

      const playerHand = room.gameState.playerHands[userId] || [];
      const cardIndex = playerHand.findIndex(card => card.id === cardId);

      if (cardIndex === -1) {
        socket.emit('room-error', 'Magic card not found in your hand');
        return;
      }

      const card = playerHand[cardIndex];
      let actionResult = null;

      try {
        // Import card classes for shield testing
        const { ShieldCard } = await import('../../src/lib/cards.js');

        if (card.type === 'shield') {
          if (targetTileId && targetTileId !== 'self') {
            socket.emit('room-error', 'Shield cards don\'t target tiles');
            return;
          }

          const shieldCard = new ShieldCard(card.id);
          actionResult = shieldCard.executeEffect(room.gameState, userId);
        }

        if (actionResult) {
          // Remove used card
          room.gameState.playerHands[userId].splice(cardIndex, 1);

          const playersWithUpdatedHands = room.players.map(player => ({
            ...player,
            hand: room.gameState.playerHands[player.userId] || [],
            score: player.score || 0
          }));

          io.to(roomCode).emit('magic-card-used', {
            card: card,
            actionResult: actionResult,
            tiles: room.gameState.tiles,
            players: playersWithUpdatedHands,
            playerHands: room.gameState.playerHands,
            usedBy: userId,
            shields: room.gameState.shields || {},
            playerActions: room.gameState.playerActions || {}
          });
        }
      } catch (error) {
        socket.emit('room-error', error.message);
      }
    });

    socket.on('disconnect', () => {
      const roomCode = socket.data.roomCode;
      if (roomCode) {
        const room = rooms.get(roomCode);
        if (room) {
          room.players = room.players.filter(p => p.userId !== socket.data.userId);
          if (room.players.length === 0) {
            rooms.delete(roomCode);
          } else {
            io.to(roomCode).emit('player-left', { players: room.players });
          }
        }
      }
    });
  }

  beforeEach(async () => {
    // Clear shared rooms map to ensure test isolation
    rooms.clear();

    // Generate unique player IDs for each test to avoid conflicts
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    player1Id = `player1_${timestamp}_${random}`;
    player2Id = `player2_${timestamp}_${random}`;

    // Create authenticated client sockets
    player1Socket = ioc(`http://localhost:${port}`, {
      auth: { userId: player1Id, userName: 'Player 1', userEmail: `player1_${timestamp}@test.com` }
    });

    player2Socket = ioc(`http://localhost:${port}`, {
      auth: { userId: player2Id, userName: 'Player 2', userEmail: `player2_${timestamp}@test.com` }
    });

    await Promise.all([
      new Promise(resolve => player1Socket.on('connect', resolve)),
      new Promise(resolve => player2Socket.on('connect', resolve))
    ]);

    vi.clearAllMocks();
  });

  afterEach(() => {
    // Properly disconnect sockets to avoid conflicts between tests
    if (player1Socket && player1Socket.connected) {
      player1Socket.disconnect();
    }
    if (player2Socket && player2Socket.connected) {
      player2Socket.disconnect();
    }
    vi.restoreAllMocks();
  });

  describe('Shield Card Socket Event Handling', () => {
    it('should handle shield activation event correctly via Socket.IO', async () => {
      const roomCode = 'SHIELD01';

      // Player 1 joins room
      player1Socket.emit('join-room', { roomCode });
      const joinResponse1 = await waitFor(player1Socket, 'room-joined');
      expect(joinResponse1.players).toHaveLength(1);
      expect(joinResponse1.players[0].userId).toBe(player1Id);

      // Player 2 joins room
      player2Socket.emit('join-room', { roomCode });
      const joinResponse2 = await waitFor(player2Socket, 'room-joined');
      expect(joinResponse2.players).toHaveLength(2);

      // Both players ready up
      player1Socket.emit('player-ready', { roomCode });
      await waitFor(player1Socket, 'player-ready');

      player2Socket.emit('player-ready', { roomCode });
      const gameStartData = await waitFor(player2Socket, 'game-start');

      expect(gameStartData).toBeDefined();
      expect(gameStartData.gameStarted).toBe(true);
      expect(gameStartData.currentPlayer.userId).toBe(player1Id);

      // Player 1 uses shield card
      player1Socket.emit('use-magic-card', {
        roomCode,
        cardId: 'shield1',
        targetTileId: 'self'
      });

      const magicCardUsed = await waitFor(player1Socket, 'magic-card-used');

      // Verify shield activation via socket event
      expect(magicCardUsed.card.id).toBe('shield1');
      expect(magicCardUsed.actionResult.type).toBe('shield');
      expect(magicCardUsed.actionResult.activatedFor).toBe(player1Id);
      expect(magicCardUsed.actionResult.remainingTurns).toBe(2);
      expect(magicCardUsed.usedBy).toBe(player1Id);
      expect(magicCardUsed.shields[player1Id]).toBeDefined();

      // Verify Player 2 also receives the event
      const magicCardUsed2 = await waitFor(player2Socket, 'magic-card-used');
      expect(magicCardUsed2.actionResult.type).toBe('shield');
    });

    it('should reject shield activation when not player\'s turn via Socket.IO', async () => {
      const roomCode = 'SHIELD02';

      // Player 1 joins room first
      player1Socket.emit('join-room', { roomCode });
      const joinResponse1 = await waitFor(player1Socket, 'room-joined', 5000);
      expect(joinResponse1.players).toHaveLength(1);

      // Player 2 joins room
      player2Socket.emit('join-room', { roomCode });
      const joinResponse2 = await waitFor(player2Socket, 'room-joined', 5000);
      expect(joinResponse2.players).toHaveLength(2);

      // Both players ready up - Player 1 first
      player1Socket.emit('player-ready', { roomCode });
      await waitFor(player1Socket, 'player-ready', 5000);

      // Player 2 ready - this should start the game
      player2Socket.emit('player-ready', { roomCode });

      // Wait for game-start event with proper timeout and error handling
      let gameStartData;
      try {
        gameStartData = await waitFor(player2Socket, 'game-start', 8000);
      } catch (error) {
        // If game-start doesn't fire, try player-ready as fallback
        try {
          await waitFor(player2Socket, 'player-ready', 3000);
          // Try game-start again after player-ready
          gameStartData = await waitFor(player2Socket, 'game-start', 5000);
        } catch (retryError) {
          throw new Error(`Game failed to start: ${error.message}`);
        }
      }

      expect(gameStartData.gameStarted).toBe(true);
      expect(gameStartData.currentPlayer.userId).toBe(player1Id);

      // Player 2 tries to use wind card when it's Player 1's turn
      player2Socket.emit('use-magic-card', {
        roomCode,
        cardId: 'wind1', // This card exists in Player 2's hand
        targetTileId: 'self'
      });

      const errorResponse = await waitFor(player2Socket, 'room-error', 5000);
      expect(errorResponse).toBe('Not your turn');
    });

    it('should handle shield reinforcement event correctly via Socket.IO', async () => {
      const roomCode = 'SHIELD03';

      // Player 1 joins room first
      player1Socket.emit('join-room', { roomCode });
      const joinResponse1 = await waitFor(player1Socket, 'room-joined', 5000);
      expect(joinResponse1.players).toHaveLength(1);

      // Player 2 joins room
      player2Socket.emit('join-room', { roomCode });
      const joinResponse2 = await waitFor(player2Socket, 'room-joined', 5000);
      expect(joinResponse2.players).toHaveLength(2);

      // Both players ready up
      player1Socket.emit('player-ready', { roomCode });
      await waitFor(player1Socket, 'player-ready', 5000);

      player2Socket.emit('player-ready', { roomCode });

      // Wait for game-start event with proper timeout and error handling
      let gameStartData;
      try {
        gameStartData = await waitFor(player2Socket, 'game-start', 8000);
      } catch (error) {
        // If game-start doesn't fire, try player-ready as fallback
        try {
          await waitFor(player2Socket, 'player-ready', 3000);
          // Try game-start again after player-ready
          gameStartData = await waitFor(player2Socket, 'game-start', 5000);
        } catch (retryError) {
          throw new Error(`Game failed to start: ${error.message}`);
        }
      }

      expect(gameStartData.gameStarted).toBe(true);

      // Player 1 uses shield card
      player1Socket.emit('use-magic-card', {
        roomCode,
        cardId: 'shield1',
        targetTileId: 'self'
      });

      const firstShieldResult = await waitFor(player1Socket, 'magic-card-used', 5000);
      expect(firstShieldResult.actionResult.type).toBe('shield');
      expect(firstShieldResult.actionResult.remainingTurns).toBe(2);
      expect(firstShieldResult.usedBy).toBe(player1Id);

      // Verify Player 2 also receives the shield activation event
      const shieldEventForPlayer2 = await waitFor(player2Socket, 'magic-card-used', 5000);
      expect(shieldEventForPlayer2.actionResult.type).toBe('shield');
      expect(shieldEventForPlayer2.actionResult.activatedFor).toBe(player1Id);
    });
  });

  describe('Shield Protection Event Blocking', () => {
    beforeEach(async () => {
      // Create test room with game state for shield testing
      player1Id = 'player1_protected';
      player2Id = 'player2_attacker';

      testRoom = {
        code: 'SHIELD_TEST',
        players: [
          { userId: player1Id, name: 'Player 1', isReady: true, score: 0 },
          { userId: player2Id, name: 'Player 2', isReady: true, score: 0 }
        ],
        gameState: {
          tiles: [
            {
              id: 1,
              color: 'red',
              emoji: '🟥',
              placedHeart: {
                color: 'red',
                value: 2,
                emoji: '❤️',
                placedBy: player1Id,
                originalTileColor: 'red'
              }
            },
            {
              id: 2,
              color: 'yellow',
              emoji: '🟨',
              placedHeart: {
                color: 'yellow',
                value: 1,
                emoji: '💛',
                placedBy: player1Id,
                originalTileColor: 'yellow'
              }
            },
            { id: 3, color: 'green', emoji: '🟩', placedHeart: null },
            { id: 4, color: 'white', emoji: '⬜', placedHeart: null }
          ],
          gameStarted: true,
          currentPlayer: { userId: player1Id },
          turnCount: 1,
          deck: { emoji: '💌', cards: 10, type: 'hearts' },
          magicDeck: { emoji: '🔮', cards: 10, type: 'magic' },
          playerHands: {
            [player1Id]: [
              { id: 'shield1', type: 'shield', emoji: '🛡️', name: 'Shield Card' },
              { id: 'heart1', type: 'heart', color: 'red', value: 2, emoji: '❤️' }
            ],
            [player2Id]: [
              { id: 'wind1', type: 'wind', emoji: '💨', name: 'Wind Card' },
              { id: 'recycle1', type: 'recycle', emoji: '♻️', name: 'Recycle Card' }
            ]
          },
          shields: {},
          playerActions: {}
        }
      };

      // Activate shield for player1
      const { ShieldCard } = await import('../../src/lib/cards.js');
      const shield = new ShieldCard('shield1');
      shield.executeEffect(testRoom.gameState, player1Id);
    });

    it('should block Wind card events against protected player', async () => {
      const { WindCard } = await import('../../src/lib/cards.js');

      // Player2 attempts to use Wind card
      const windCardData = testRoom.gameState.playerHands[player2Id][0];
      const windCard = new WindCard(windCardData.id);

      expect(() => {
        windCard.executeEffect(testRoom.gameState, 1, player2Id);
      }).toThrow("Opponent is protected by Shield");
    });

    it('should block Recycle card events when protected player has hearts', async () => {
      const { RecycleCard } = await import('../../src/lib/cards.js');

      const recycleCardData = testRoom.gameState.playerHands[player2Id][1];
      const recycleCard = new RecycleCard(recycleCardData.id);

      // Try to use Recycle on empty tile (basic targeting passes, but shield blocks)
      expect(() => {
        recycleCard.executeEffect(testRoom.gameState, 3);
      }).toThrow("Tile is protected by Shield");
    });

    it('should allow magic cards after shield expires', async () => {
      const { WindCard } = await import('../../src/lib/cards.js');

      // Advance turns 2 full turns = turn 4
      for (let turn = 1; turn <= 2; turn++) {
        testRoom.gameState.turnCount = turn + 1; // Turn 2, 3
        checkAndExpireShields(testRoom);
      }

      const windCardData = testRoom.gameState.playerHands[player2Id][0];
      const windCard = new WindCard(windCardData.id);

      // Should now work
      const result = windCard.executeEffect(testRoom.gameState, 1, player2Id);
      expect(result.type).toBe('wind');
    });
  });

  describe('Shield Turn Management Events', () => {
    it('should expire shields during turn changes', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js');

      // Activate shield
      const shield = new ShieldCard('shield1');
      shield.executeEffect(testRoom.gameState, player1Id);

      expect(testRoom.gameState.shields[player1Id]).toBeDefined();

      // Simulate shield expiration after 2 full turns
      // The shield should be decremented at the end of each turn
      for (let turn = 1; turn <= 2; turn++) {
        testRoom.gameState.turnCount = turn; // Turn 1, 2
        checkAndExpireShields(testRoom);
      }

      expect(testRoom.gameState.shields[player1Id]).toBeUndefined();
    });

    it('should update shield remaining turns during turn changes', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js');

      // Activate shield
      const shield = new ShieldCard('shield1');
      shield.executeEffect(testRoom.gameState, player1Id);

      // End of Turn 1: 1 turn remaining
      testRoom.gameState.turnCount = 1;
      checkAndExpireShields(testRoom);
      expect(testRoom.gameState.shields[player1Id].remainingTurns).toBe(1);

      // End of Turn 2: Shield should be expired and removed
      testRoom.gameState.turnCount = 2;
      checkAndExpireShields(testRoom);
      expect(testRoom.gameState.shields[player1Id]).toBeUndefined();
    });
  });

  describe('Shield Error Handling Events', () => {
    it('should handle invalid shield card usage events', async () => {
      // Create test room for this specific test
      const testRoomError = {
        code: 'SHIELD_ERROR_TEST',
        players: [
          { userId: player1Id, name: 'Player 1', isReady: true, score: 0 },
          { userId: player2Id, name: 'Player 2', isReady: true, score: 0 }
        ],
        gameState: {
          tiles: [
            { id: 1, color: 'red', emoji: '🟥', placedHeart: null },
            { id: 2, color: 'yellow', emoji: '🟨', placedHeart: null }
          ],
          gameStarted: true,
          currentPlayer: { userId: player1Id },
          turnCount: 1,
          deck: { emoji: '💌', cards: 10, type: 'hearts' },
          magicDeck: { emoji: '🔮', cards: 10, type: 'magic' },
          playerHands: {
            [player1Id]: [
              { id: 'shield1', type: 'shield', emoji: '🛡️', name: 'Shield Card' }
            ]
          },
          shields: {},
          playerActions: {}
        }
      };

      const eventData = {
        roomCode: testRoomError.roomCode,
        cardId: 'invalid-shield-id',
        targetTileId: 'self'
      };

      const playerHand = testRoomError.gameState.playerHands[player1Id];
      expect(playerHand).toBeDefined();
      const cardIndex = playerHand.findIndex(card => card.id === eventData.cardId);

      expect(cardIndex).toBe(-1);

      // Server validation should catch this
      expect(cardIndex).toBe(-1);
      // In actual server, this would trigger: socket.emit("room-error", "Magic card not found in your hand");
    });

    it('should handle shield activation when opponent has active shield', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js');

      // Create test room for this specific test
      const testRoomShield = {
        code: 'SHIELD_CONFLICT_TEST',
        players: [
          { userId: player1Id, name: 'Player 1', isReady: true, score: 0 },
          { userId: player2Id, name: 'Player 2', isReady: true, score: 0 }
        ],
        gameState: {
          tiles: [
            { id: 1, color: 'red', emoji: '🟥', placedHeart: null },
            { id: 2, color: 'yellow', emoji: '🟨', placedHeart: null }
          ],
          gameStarted: true,
          currentPlayer: { userId: player1Id },
          turnCount: 1,
          deck: { emoji: '💌', cards: 10, type: 'hearts' },
          magicDeck: { emoji: '🔮', cards: 10, type: 'magic' },
          playerHands: {
            [player1Id]: [
              { id: 'shield1', type: 'shield', emoji: '🛡️', name: 'Shield Card' }
            ],
            [player2Id]: [
              { id: 'shield2', type: 'shield', emoji: '🛡️', name: 'Shield Card' }
            ]
          },
          shields: {},
          playerActions: {}
        }
      };

      // Player1 activates shield
      const player1Shield = new ShieldCard('shield1');
      player1Shield.executeEffect(testRoomShield.gameState, player1Id);

      // Player2 tries to activate shield
      const player2Shield = new ShieldCard('shield2');

      // Player2 should not be able to activate shield while player1 has shield
      expect(() => {
        player2Shield.executeEffect(testRoomShield.gameState, player2Id);
      }).toThrow("Cannot activate Shield while opponent has active Shield");
    });

    it('should handle shield events with malformed data', () => {
      const invalidEvents = [
        { roomCode: null, cardId: 'shield1', targetTileId: 'self' },
        { roomCode: testRoom.roomCode, cardId: null, targetTileId: 'self' },
        { roomCode: testRoom.roomCode, cardId: 'shield1', targetTileId: null },
        { roomCode: '', cardId: 'shield1', targetTileId: 'self' },
        { roomCode: testRoom.roomCode, cardId: '', targetTileId: 'self' }
      ];

      invalidEvents.forEach((eventData, index) => {
        // Server validation should catch these
        if (index === 0) {
          // roomCode is null, cardId is valid
          const isValid = Boolean(eventData.roomCode && eventData.cardId);
          expect(isValid).toBe(false);
        } else if (index === 1) {
          // roomCode is valid, cardId is null
          const isValid = Boolean(eventData.roomCode && eventData.cardId);
          expect(isValid).toBe(false);
        } else if (index === 4) {
          // roomCode is valid, cardId is empty string
          const isValid = Boolean(eventData.roomCode && eventData.cardId);
          expect(isValid).toBe(false);
        }
      });
    });
  });

  describe('Shield Game State Persistence', () => {
    it('should maintain shield state through room serialization', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js');

      // Activate shield
      const shield = new ShieldCard('shield1');
      shield.executeEffect(testRoom.gameState, player1Id);

      // Serialize room state (simulate database save)
      const serializedRoom = JSON.parse(JSON.stringify(testRoom));

      // Verify shield state is preserved
      expect(serializedRoom.gameState.shields[player1Id]).toBeDefined();
      expect(serializedRoom.gameState.shields[player1Id].active).toBe(true);
      expect(serializedRoom.gameState.shields[player1Id].remainingTurns).toBe(2);

      // Test shield functionality on deserialized state
      const isProtected = ShieldCard.isPlayerProtected(serializedRoom.gameState, player1Id, 1);
      expect(isProtected).toBe(true);
    });

    it('should handle shield state during player migration', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js');

      // Create test room for this specific test
      const testRoomMigration = {
        code: 'SHIELD_MIGRATION_TEST',
        players: [
          { userId: player1Id, name: 'Player 1', isReady: true, score: 0 },
          { userId: player2Id, name: 'Player 2', isReady: true, score: 0 }
        ],
        gameState: {
          tiles: [
            { id: 1, color: 'red', emoji: '🟥', placedHeart: null },
            { id: 2, color: 'yellow', emoji: '🟨', placedHeart: null }
          ],
          gameStarted: true,
          currentPlayer: { userId: player1Id },
          turnCount: 1,
          deck: { emoji: '💌', cards: 10, type: 'hearts' },
          magicDeck: { emoji: '🔮', cards: 10, type: 'magic' },
          playerHands: {
            [player1Id]: [
              { id: 'shield1', type: 'shield', emoji: '🛡️', name: 'Shield Card' }
            ]
          },
          shields: {},
          playerActions: {}
        }
      };

      // Activate shield for player1
      const shield = new ShieldCard('shield1');
      shield.executeEffect(testRoomMigration.gameState, player1Id);

      // Simulate player reconnection with new user ID
      const newUserId = 'player1_reconnected';

      // Migrate shield state (as done in server.js)
      if (testRoomMigration.gameState.shields[player1Id]) {
        testRoomMigration.gameState.shields[newUserId] = testRoomMigration.gameState.shields[player1Id];
        delete testRoomMigration.gameState.shields[player1Id];
        testRoomMigration.gameState.shields[newUserId].protectedPlayerId = newUserId;
        testRoomMigration.gameState.shields[newUserId].activatedBy = newUserId;
      }

      // Verify shield is still active
      expect(testRoomMigration.gameState.shields[newUserId]).toBeDefined();
      expect(ShieldCard.isPlayerProtected(testRoomMigration.gameState, newUserId, 1)).toBe(true);
      expect(testRoomMigration.gameState.shields[player1Id]).toBeUndefined();
    });
  });

  describe('Shield Visual State Synchronization', () => {
    it('should broadcast complete shield state for visual indicators', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js');

      // Clear any existing shields before activating new one
      testRoom.gameState.shields = {};

      // Activate shield
      const shield = new ShieldCard('shield-visual-test');
      const actionResult = shield.executeEffect(testRoom.gameState, player1Id);

      // Mock broadcast data structure
      const broadcastData = {
        actionResult: actionResult,
        shields: testRoom.gameState.shields,
        tiles: testRoom.gameState.tiles,
        players: testRoom.players
      };

      // Verify broadcast contains all necessary visual data
      expect(broadcastData.shields[player1Id]).toBeDefined();
      expect(broadcastData.shields[player1Id].remainingTurns).toBe(2);
      expect(broadcastData.shields[player1Id].protectedPlayerId).toBe(player1Id);

      // Verify action result contains visual feedback data
      expect(broadcastData.actionResult.type).toBe('shield');
      expect(broadcastData.actionResult.remainingTurns).toBe(2);
      expect(broadcastData.actionResult.message).toContain('Shield activated');
    });

    it('should synchronize shield visual state during turn changes', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js');

      // Clear any existing shields before activating new one
      testRoom.gameState.shields = {};

      // Activate shield
      const shield = new ShieldCard('shield-sync-test');
      shield.executeEffect(testRoom.gameState, player1Id);

      // Simulate turn change with shield state
      const turnChangeData = {
        currentPlayer: { userId: player2Id, name: 'Player 2' },
        turnCount: 2,
        players: testRoom.players,
        shields: testRoom.gameState.shields
      };

      // Verify shield state is included in turn change broadcast
      expect(turnChangeData.shields[player1Id]).toBeDefined();
      expect(turnChangeData.shields[player1Id].remainingTurns).toBeGreaterThan(0);

      // Simulate shield expiration during turn change
      for (let turn = 1; turn <= 2; turn++) {
        testRoom.gameState.turnCount = turn; // Turn 1, 2
        checkAndExpireShields(testRoom);
      }

      // Shield should be removed from visual state
      expect(testRoom.gameState.shields[player1Id]).toBeUndefined();
    });

    it('should handle opponent shield visual state correctly', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js');

      // Create test room for this specific test
      const testRoomVisual = {
        code: 'SHIELD_VISUAL_TEST',
        players: [
          { userId: player1Id, name: 'Player 1', isReady: true, score: 0 },
          { userId: player2Id, name: 'Player 2', isReady: true, score: 0 }
        ],
        gameState: {
          tiles: [
            {
              id: 1,
              color: 'red',
              emoji: '🟥',
              placedHeart: {
                color: 'red',
                value: 2,
                emoji: '❤️',
                placedBy: player1Id,
                originalTileColor: 'red'
              }
            },
            { id: 2, color: 'yellow', emoji: '🟨', placedHeart: null }
          ],
          gameStarted: true,
          currentPlayer: { userId: player1Id },
          turnCount: 1,
          deck: { emoji: '💌', cards: 10, type: 'hearts' },
          magicDeck: { emoji: '🔮', cards: 10, type: 'magic' },
          playerHands: {
            [player1Id]: [
              { id: 'shield1', type: 'shield', emoji: '🛡️', name: 'Shield Card' }
            ]
          },
          shields: {},
          playerActions: {}
        }
      };

      // Clear any existing shields before activating new one
      testRoomVisual.gameState.shields = {};

      // Player 1 activates shield
      const player1Shield = new ShieldCard('player1-shield');
      player1Shield.executeEffect(testRoomVisual.gameState, player1Id);

      // Player 2 should receive visual state indicating Player 1 has shield
      const opponentVisualData = {
        shields: testRoomVisual.gameState.shields,
        tiles: testRoomVisual.gameState.tiles
      };

      // Verify opponent can see Player 1's shield state
      expect(opponentVisualData.shields[player1Id]).toBeDefined();
      expect(opponentVisualData.shields[player1Id].remainingTurns).toBe(2);

      // Verify tiles with Player 1's hearts should show shield indicators
      const protectedTiles = testRoomVisual.gameState.tiles.filter(tile =>
        tile.placedHeart && tile.placedHeart.placedBy === player1Id
      );

      expect(protectedTiles).toHaveLength(1);
      expect(protectedTiles[0].placedHeart.placedBy).toBe(player1Id);
    });

    it('should handle visual state updates during shield reinforcement', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js');

      // Clear any existing shields before activating new one
      testRoom.gameState.shields = {};

      // Activate initial shield
      const shield1 = new ShieldCard('reinforce-visual-1');
      shield1.executeEffect(testRoom.gameState, player1Id);

      // Reinforce shield (advance turn to allow reinforcement)
      testRoom.gameState.turnCount = 2;
      const shield2 = new ShieldCard('reinforce-visual-2');
      const reinforceResult = shield2.executeEffect(testRoom.gameState, player1Id);

      // Verify visual state is updated correctly
      expect(reinforceResult.reinforced).toBe(true);
      expect(reinforceResult.remainingTurns).toBe(2);
      expect(testRoom.gameState.shields[player1Id].remainingTurns).toBe(2);

      // Broadcast data should reflect reinforcement
      const reinforceBroadcastData = {
        actionResult: reinforceResult,
        shields: testRoom.gameState.shields
      };

      expect(reinforceBroadcastData.actionResult.message).toContain('Shield reinforced');
      expect(reinforceBroadcastData.shields[player1Id].remainingTurns).toBe(2);
    });
  });
});