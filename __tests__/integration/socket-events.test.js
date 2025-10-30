import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createServer } from 'node:http';
import { io as ioc } from 'socket.io-client';
import { Server } from 'socket.io';
import { connectToDatabase, disconnectDatabase, clearDatabase } from '../utils/server-test-utils.js';

function waitFor(socket, event) {
  return new Promise((resolve) => {
    socket.once(event, resolve);
  });
}

// Shared rooms Map for all sockets in the test server
const sharedTestRooms = new Map();

// Enhanced socket handlers for testing with real game logic
function setupBasicSocketHandlers(socket, io) {

  socket.on('join-room', (data) => {
    const { roomCode } = data;
    const { userId, userName, userEmail } = socket.data || {};

    if (!sharedTestRooms.has(roomCode)) {
      sharedTestRooms.set(roomCode, {
        code: roomCode,
        players: [],
        maxPlayers: 2,
        gameState: {
          tiles: [
            { id: 0, color: 'red', emoji: '🟥', placedHeart: null },
            { id: 1, color: 'yellow', emoji: '🟨', placedHeart: null },
            { id: 2, color: 'green', emoji: '🟩', placedHeart: null },
            { id: 3, color: 'white', emoji: '⬜', placedHeart: null }
          ],
          gameStarted: false,
          currentPlayer: null,
          deck: { emoji: '💌', cards: 16, type: 'hearts' },
          magicDeck: { emoji: '🔮', cards: 16, type: 'magic' },
          playerHands: {},
          shields: {},
          turnCount: 0,
          playerActions: {}
        }
      });
    }

    const room = sharedTestRooms.get(roomCode);

    // Check if room is full
    if (room.players.length >= room.maxPlayers) {
      socket.emit('room-error', 'Room is full');
      return;
    }

    const player = {
      userId: userId || socket.userId || `test-user-${Date.now()}`,
      name: userName || socket.name || 'Test User',
      email: userEmail || 'test@example.com',
      isReady: false,
      score: 0,
      joinedAt: new Date()
    };

    room.players.push(player);
    socket.join(roomCode);
    socket.data.roomCode = roomCode;

    socket.emit('room-joined', {
      roomCode,
      players: room.players,
      playerId: player.userId
    });

    io.to(roomCode).emit('player-joined', {
      roomCode,
      players: room.players
    });
  });

  socket.on('player-ready', (data) => {
    const { roomCode } = data;
    const { userId } = socket.data || {};
    const room = sharedTestRooms.get(roomCode);

    if (!room) {
      socket.emit('room-error', 'Room not found');
      return;
    }

    const player = room.players.find(p => p.userId === (userId || socket.userId));
    if (!player) {
      socket.emit('room-error', 'Player not in room');
      return;
    }

    player.isReady = !player.isReady;

    // Check if game should start
    if (room.players.length === 2 && room.players.every(p => p.isReady)) {
      room.gameState.gameStarted = true;
      room.gameState.currentPlayer = room.players[0];
      room.gameState.turnCount = 1;

      // Initialize player hands and actions
      room.players.forEach(player => {
        room.gameState.playerHands[player.userId] = [];
        room.gameState.playerActions[player.userId] = {
          drawnHeart: false,
          drawnMagic: false,
          heartsPlaced: 0,
          magicCardsUsed: 0
        };
      });

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

      // Send personalized game-start data to each player
      room.players.forEach(player => {
        const playerSocket = Array.from(io.sockets.sockets.values())
          .find(s => s.data && s.data.userId === player.userId);
        if (playerSocket) {
          playerSocket.emit('game-start', { ...gameStartData, playerId: player.userId });
        }
      });
    } else {
      io.to(roomCode).emit('player-ready', {
        roomCode,
        players: room.players
      });
    }
  });

  socket.on('leave-room', (data) => {
    const { roomCode } = data;
    const { userId } = socket.data || {};
    const room = sharedTestRooms.get(roomCode);

    if (room) {
      room.players = room.players.filter(p => p.userId !== (userId || socket.userId));
      socket.leave(roomCode);
      socket.data.roomCode = null;

      io.to(roomCode).emit('player-left', {
        roomCode,
        players: room.players
      });

      if (room.players.length === 0) {
        sharedTestRooms.delete(roomCode);
      }
    }
  });

  socket.on('disconnect', () => {
    const roomCode = socket.data?.roomCode;
    const { userId } = socket.data || {};

    if (roomCode) {
      const room = sharedTestRooms.get(roomCode);
      if (room) {
        room.players = room.players.filter(p => p.userId !== (userId || socket.userId));

        if (room.players.length === 0) {
          sharedTestRooms.delete(roomCode);
        } else {
          io.to(roomCode).emit('player-left', {
            roomCode,
            players: room.players
          });
        }
      }
    }
  });
}

describe('Socket.IO Events Integration Tests', () => {
  let io, serverSocket, clientSocket;
  let httpServer;
  let port;
  let testRooms = new Set();

  beforeAll(() => {
    return new Promise((resolve) => {
      httpServer = createServer();
      io = new Server(httpServer, {
        cors: {
          origin: "*",
          methods: ["GET", "POST"]
        }
      });

      io.on('connection', (socket) => {
        serverSocket = socket;
        // Set auth data for testing
        socket.data = {
          userId: 'test-user',
          userName: 'Test User',
          userEmail: 'test@example.com',
          userSessionId: 'test-session'
        };
        setupBasicSocketHandlers(socket, io);
      });

      httpServer.listen(() => {
        port = httpServer.address().port;
        clientSocket = ioc(`http://localhost:${port}`);
        clientSocket.on('connect', resolve);
      });
    });
  }, 15000);

  afterAll(() => {
    if (clientSocket) clientSocket.disconnect();
    if (io) io.close();
    if (httpServer) httpServer.close();
  });

  // Setup and cleanup for each test
  beforeEach(() => {
    sharedTestRooms.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up rooms created during this test
    sharedTestRooms.clear();
  });

  describe('Enhanced Socket.IO Event Patterns', () => {
    it('should work with basic emit/receive pattern', () => {
      return new Promise((resolve) => {
        clientSocket.on('hello', (arg) => {
          expect(arg).toEqual('world');
          resolve();
        });
        serverSocket.emit('hello', 'world');
      });
    });

    it('should work with acknowledgements', () => {
      return new Promise((resolve) => {
        serverSocket.on('hi', (cb) => {
          cb('hola');
        });
        clientSocket.emit('hi', (arg) => {
          expect(arg).toEqual('hola');
          resolve();
        });
      });
    });

    it('should work with emitWithAck()', async () => {
      serverSocket.on('foo', (cb) => {
        cb('bar');
      });
      const result = await clientSocket.emitWithAck('foo');
      expect(result).toEqual('bar');
    });

    it('should work with waitFor()', () => {
      clientSocket.emit('baz');
      return waitFor(serverSocket, 'baz');
    });
  });

  describe('Complete Room Management Flow', () => {
    it('should handle complete room lifecycle with multiple players', async () => {
      const roomCode = 'ROOM01';

      // Create second client for testing
      const clientSocket2 = ioc(`http://localhost:${port}`);
      await new Promise(resolve => clientSocket2.on('connect', resolve));

      // Set auth data for second client
      clientSocket2.data = {
        userId: 'test-user-2',
        userName: 'Test User 2',
        userEmail: 'test2@example.com'
      };

      // First player joins
      clientSocket.emit('join-room', { roomCode });
      const joinResponse1 = await waitFor(clientSocket, 'room-joined');

      expect(joinResponse1.players).toHaveLength(1);
      expect(joinResponse1.players[0].userId).toBe('test-user');
      expect(joinResponse1.players[0].name).toBe('Test User');
      expect(joinResponse1.players[0].isReady).toBe(false);
      expect(joinResponse1.playerId).toBe('test-user');

      // Second player joins
      clientSocket2.emit('join-room', { roomCode });
      const joinResponse2 = await waitFor(clientSocket2, 'room-joined');

      expect(joinResponse2.players).toHaveLength(2);
      expect(joinResponse2.players[1].userId).toBe('test-user-2');

      // Both players should receive player-joined event
      const playerJoinedEvent1 = await waitFor(clientSocket, 'player-joined');
      expect(playerJoinedEvent1.players).toHaveLength(2);

      // First player ready
      clientSocket.emit('player-ready', { roomCode });
      const readyEvent1 = await waitFor(clientSocket, 'player-ready');
      expect(readyEvent1.players[0].isReady).toBe(true);
      expect(readyEvent1.players[1].isReady).toBe(false);

      // Second player ready - should start game
      clientSocket2.emit('player-ready', { roomCode });
      const gameStartEvent1 = await waitFor(clientSocket, 'game-start');
      const gameStartEvent2 = await waitFor(clientSocket2, 'game-start');

      // Verify game started
      expect(gameStartEvent1.gameStarted).toBe(true);
      expect(gameStartEvent1.currentPlayer.userId).toBe('test-user');
      expect(gameStartEvent1.turnCount).toBe(1);
      expect(gameStartEvent1.playerId).toBe('test-user');

      expect(gameStartEvent2.gameStarted).toBe(true);
      expect(gameStartEvent2.currentPlayer.userId).toBe('test-user');
      expect(gameStartEvent2.playerId).toBe('test-user-2');

      // First player leaves
      clientSocket.emit('leave-room', { roomCode });
      const leaveEvent = await waitFor(clientSocket2, 'player-left');
      expect(leaveEvent.players).toHaveLength(1);
      expect(leaveEvent.players[0].userId).toBe('test-user-2');

      clientSocket2.disconnect();
    });

    it('should handle room full scenario correctly', async () => {
      const roomCode = 'FULL01';

      // Create three clients
      const client2 = ioc(`http://localhost:${port}`);
      const client3 = ioc(`http://localhost:${port}`);

      await Promise.all([
        new Promise(resolve => client2.on('connect', resolve)),
        new Promise(resolve => client3.on('connect', resolve))
      ]);

      // Set auth data
      client2.data = { userId: 'user2', userName: 'User 2' };
      client3.data = { userId: 'user3', userName: 'User 3' };

      // All three try to join
      clientSocket.emit('join-room', { roomCode });
      client2.emit('join-room', { roomCode });

      await waitFor(clientSocket, 'room-joined');
      await waitFor(client2, 'room-joined');

      // Third should get room full error
      client3.emit('join-room', { roomCode });
      const errorEvent = await waitFor(client3, 'room-error');
      expect(errorEvent).toBe('Room is full');

      client2.disconnect();
      client3.disconnect();
    });

    it('should handle room not found errors', async () => {
      // Try to toggle ready in non-existent room
      clientSocket.emit('player-ready', { roomCode: 'NOTEXIST' });
      const errorEvent = await waitFor(clientSocket, 'room-error');
      expect(errorEvent).toBe('Room not found');
    });

    it('should handle disconnect cleanup properly', async () => {
      const roomCode = 'DISC01';
      const client2 = ioc(`http://localhost:${port}`);

      await new Promise(resolve => client2.on('connect', resolve));
      client2.data = { userId: 'user2', userName: 'User 2' };

      // Both join
      clientSocket.emit('join-room', { roomCode });
      client2.emit('join-room', { roomCode });

      await waitFor(clientSocket, 'room-joined');
      await waitFor(client2, 'room-joined');

      // First client disconnects
      clientSocket.disconnect();

      // Second client should receive player-left event
      const disconnectEvent = await waitFor(client2, 'player-left');
      expect(disconnectEvent.players).toHaveLength(1);
      expect(disconnectEvent.players[0].userId).toBe('user2');

      client2.disconnect();
    });
  });

  describe('Game State Management via Socket.IO', () => {
    it('should handle game start with proper state initialization', async () => {
      const roomCode = 'GAME01';
      const client2 = ioc(`http://localhost:${port}`);

      await new Promise(resolve => client2.on('connect', resolve));
      client2.data = { userId: 'user2', userName: 'User 2' };

      // Both join and ready up
      clientSocket.emit('join-room', { roomCode });
      client2.emit('join-room', { roomCode });

      await waitFor(clientSocket, 'room-joined');
      await waitFor(client2, 'room-joined');

      clientSocket.emit('player-ready', { roomCode });
      client2.emit('player-ready', { roomCode });

      const gameStartEvent = await waitFor(clientSocket, 'game-start');

      // Verify complete game state
      expect(gameStartEvent.gameStarted).toBe(true);
      expect(gameStartEvent.tiles).toHaveLength(4);
      expect(gameStartEvent.currentPlayer).toBeDefined();
      expect(gameStartEvent.turnCount).toBe(1);
      expect(gameStartEvent.deck).toBeDefined();
      expect(gameStartEvent.magicDeck).toBeDefined();
      expect(gameStartEvent.playerHands).toBeDefined();
      expect(gameStartEvent.playerActions).toBeDefined();

      // Verify player-specific data
      expect(gameStartEvent.playerId).toBe('test-user');
      expect(gameStartEvent.players).toHaveLength(2);

      client2.disconnect();
    });

    it('should handle room not found errors', async () => {
      const roomCode = 'ERROR01';

      // Try to ready up in a room that doesn't exist
      clientSocket.emit('player-ready', { roomCode });
      const errorEvent = await waitFor(clientSocket, 'room-error');
      expect(errorEvent).toBe('Room not found');
    });

    it('should handle player not in room errors', async () => {
      const roomCode = 'PLAYERNOT01';

      // First, manually create a room in the shared testRooms
      sharedTestRooms.set(roomCode, {
        code: roomCode,
        players: [
          { userId: 'user2', userName: 'User 2', isReady: false, score: 0 }
        ],
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
      });

      // Client1 (who hasn't joined) tries to ready up in that room
      clientSocket.emit('player-ready', { roomCode });
      const errorEvent = await waitFor(clientSocket, 'room-error');
      expect(errorEvent).toBe('Player not in room');
    });

    it('should handle proper data isolation between rooms', async () => {
      const room1 = 'ISOLATE01';
      const room2 = 'ISOLATE02';
      const client2 = ioc(`http://localhost:${port}`);

      await new Promise(resolve => client2.on('connect', resolve));
      client2.data = { userId: 'user2', userName: 'User 2' };

      // Players join different rooms
      clientSocket.emit('join-room', { roomCode: room1 });
      client2.emit('join-room', { roomCode: room2 });

      const join1 = await waitFor(clientSocket, 'room-joined');
      const join2 = await waitFor(client2, 'room-joined');

      expect(join1.players).toHaveLength(1);
      expect(join2.players).toHaveLength(1);
      expect(join1.roomCode).toBe(room1);
      expect(join2.roomCode).toBe(room2);

      // Ready states should be isolated
      clientSocket.emit('player-ready', { roomCode: room1 });
      const ready1 = await waitFor(clientSocket, 'player-ready');
      expect(ready1.players[0].isReady).toBe(true);

      // Second room should not be affected
      const ready2 = await waitFor(client2, 'player-ready');
      expect(ready2.players[0].isReady).toBe(false);

      client2.disconnect();
    });
  });
});