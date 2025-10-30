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

// Basic socket handlers for testing
function setupBasicSocketHandlers(socket, io) {
  const rooms = new Map();

  socket.on('join-room', (data) => {
    const { roomCode } = data;
    if (!rooms.has(roomCode)) {
      rooms.set(roomCode, {
        players: [],
        gameState: { gameStarted: false }
      });
    }

    const room = rooms.get(roomCode);
    const player = {
      userId: socket.userId || 'test-user',
      name: socket.name || 'Test User',
      isReady: false,
      score: 0
    };

    room.players.push(player);
    socket.join(roomCode);

    socket.emit('room-joined', {
      roomCode,
      players: room.players,
      playerId: player.userId
    });
  });

  socket.on('player-ready', (data) => {
    const { roomCode } = data;
    const room = rooms.get(roomCode);
    if (room) {
      const player = room.players.find(p => p.userId === socket.userId);
      if (player) {
        player.isReady = !player.isReady;
        io.to(roomCode).emit('player-ready', {
          roomCode,
          players: room.players
        });
      }
    }
  });

  socket.on('leave-room', (data) => {
    const { roomCode } = data;
    const room = rooms.get(roomCode);
    if (room) {
      room.players = room.players.filter(p => p.userId !== socket.userId);
      socket.leave(roomCode);
      socket.emit('player-left', {
        roomCode,
        players: room.players
      });

      if (room.players.length === 0) {
        rooms.delete(roomCode);
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
        socket.userId = 'test-user';
        socket.name = 'Test User';
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
    testRooms.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up rooms created during this test
    testRooms.clear();
  });

  describe('Authentication & Room Management', () => {
    it('should work', () => {
      return new Promise((resolve) => {
        clientSocket.on('hello', (arg) => {
          expect(arg).toEqual('world');
          resolve();
        });
        serverSocket.emit('hello', 'world');
      });
    });

    it('should work with an acknowledgement', () => {
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

    it('should allow room joining', async () => {
      const roomCode = 'TEST01';
      testRooms.add(roomCode);

      clientSocket.emit('join-room', { roomCode });
      const response = await waitFor(clientSocket, 'room-joined');

      expect(response.players).toHaveLength(1);
      expect(response.players[0].userId).toBe('test-user');
      expect(response.players[0].name).toBe('Test User');
      expect(response.players[0].isReady).toBe(false);
      expect(response.roomCode).toBe(roomCode);
    });

    it('should toggle player ready state correctly', async () => {
      const roomCode = 'TEST02';
      testRooms.add(roomCode);

      // Join room first
      clientSocket.emit('join-room', { roomCode });
      await waitFor(clientSocket, 'room-joined');

      // Toggle ready state to true
      clientSocket.emit('player-ready', { roomCode });
      let response = await waitFor(clientSocket, 'player-ready');
      expect(response.players[0].isReady).toBe(true);

      // Toggle ready state back to false
      clientSocket.emit('player-ready', { roomCode });
      response = await waitFor(clientSocket, 'player-ready');
      expect(response.players[0].isReady).toBe(false);
    });

    it('should handle room leaving and cleanup correctly', async () => {
      const roomCode = 'TEST03';
      testRooms.add(roomCode);

      // Join room first
      clientSocket.emit('join-room', { roomCode });
      await waitFor(clientSocket, 'room-joined');

      // Leave room
      clientSocket.emit('leave-room', { roomCode });
      const response = await waitFor(clientSocket, 'player-left');
      expect(response.players).toHaveLength(0);
    });
  });
});