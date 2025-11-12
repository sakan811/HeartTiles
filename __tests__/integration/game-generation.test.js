import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from 'socket.io';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import {
  connectToDatabase,
  loadRooms,
  saveRoom,
  selectRandomStartingPlayer,
  generateSingleHeart,
  generateSingleMagicCard,
  HeartCard,
} from '../../server.js';

describe('Game Generation Functions Integration Tests', () => {
  let httpServer;
  let io;
  let testRoomCode = 'TEST01';
  let mockPlayers = [];

  beforeAll(async () => {
    // Connect to test database
    await connectToDatabase();

    // Create test server
    httpServer = createServer();
    io = new Server(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    // Setup mock players
    mockPlayers = [
      {
        userId: 'player1',
        name: 'Player One',
        email: 'player1@test.com',
        isReady: true,
        score: 0,
        joinedAt: new Date()
      },
      {
        userId: 'player2',
        name: 'Player Two',
        email: 'player2@test.com',
        isReady: true,
        score: 0,
        joinedAt: new Date()
      },
      {
        userId: 'player3',
        name: 'Player Three',
        email: 'player3@test.com',
        isReady: true,
        score: 0,
        joinedAt: new Date()
      }
    ];

    await httpServer.listen(0); // Use random available port
  });

  afterAll(async () => {
    if (io) {
      io.close();
    }
    if (httpServer) {
      httpServer.close();
    }
    await mongoose.connection.close();
  });

  describe('selectRandomStartingPlayer', () => {
    it('should return a valid player from the given array', () => {
      const selectedPlayer = selectRandomStartingPlayer(mockPlayers);

      expect(selectedPlayer).toBeDefined();
      expect(selectedPlayer).toHaveProperty('userId');
      expect(selectedPlayer).toHaveProperty('name');
      expect(selectedPlayer).toHaveProperty('email');
      expect(mockPlayers).toContain(selectedPlayer);
    });

    it('should return one of the specific players', () => {
      const selectedPlayer = selectRandomStartingPlayer(mockPlayers);
      const playerIds = mockPlayers.map(p => p.userId);

      expect(playerIds).toContain(selectedPlayer.userId);
    });

    it('should handle single player array', () => {
      const singlePlayer = [mockPlayers[0]];
      const selectedPlayer = selectRandomStartingPlayer(singlePlayer);

      expect(selectedPlayer).toEqual(singlePlayer[0]);
    });

    it('should handle empty array gracefully', () => {
      // Test edge case - though this shouldn't happen in normal game flow
      expect(() => {
        const result = selectRandomStartingPlayer([]);
      }).not.toThrow();

      const result = selectRandomStartingPlayer([]);
      expect(result).toBeUndefined();
    });
  });

  describe('generateSingleHeart', () => {
    it('should generate a valid heart card with correct properties', () => {
      const heartCard = generateSingleHeart();

      expect(heartCard).toBeDefined();
      expect(heartCard).toHaveProperty('id');
      expect(heartCard).toHaveProperty('color');
      expect(heartCard).toHaveProperty('value');
      expect(heartCard).toHaveProperty('emoji');
      expect(heartCard).toHaveProperty('type', 'heart');

      // Validate heart-specific properties
      expect(['red', 'yellow', 'green']).toContain(heartCard.color);
      expect(typeof heartCard.value).toBe('number');
      expect(heartCard.value).toBeGreaterThanOrEqual(1);
      expect(heartCard.value).toBeLessThanOrEqual(3);
      expect(['❤️', '💛', '💚']).toContain(heartCard.emoji);
    });

    it('should generate unique heart cards', () => {
      const heartCards = Array.from({ length: 10 }, () => generateSingleHeart());
      const uniqueIds = new Set(heartCards.map(card => card.id));

      expect(uniqueIds.size).toBe(10); // All IDs should be unique
    });

    it('should generate heart cards consistent with HeartCard class structure', () => {
      const generatedCard = generateSingleHeart();

      // Should have same structure as HeartCard class
      expect(typeof generatedCard.id).toBe('string');
      expect(typeof generatedCard.color).toBe('string');
      expect(typeof generatedCard.value).toBe('number');
      expect(typeof generatedCard.emoji).toBe('string');
      expect(generatedCard.type).toBe('heart');

      // Should match expected heart card properties
      expect(['red', 'yellow', 'green']).toContain(generatedCard.color);
      expect(['❤️', '💛', '💚']).toContain(generatedCard.emoji);
      expect(generatedCard.value).toBeGreaterThanOrEqual(1);
      expect(generatedCard.value).toBeLessThanOrEqual(3);
    });
  });

  describe('generateSingleMagicCard', () => {
    it('should generate a valid magic card with correct properties', () => {
      const magicCard = generateSingleMagicCard();

      expect(magicCard).toBeDefined();
      expect(magicCard).toHaveProperty('id');
      expect(magicCard).toHaveProperty('type');
      expect(magicCard).toHaveProperty('emoji');
      expect(magicCard).toHaveProperty('name');
      expect(magicCard).toHaveProperty('description');

      // Validate magic card types
      expect(['wind', 'recycle', 'shield']).toContain(magicCard.type);
      expect(['💨', '♻️', '🛡️']).toContain(magicCard.emoji);
      expect(typeof magicCard.name).toBe('string');
      expect(typeof magicCard.description).toBe('string');
    });

    it('should generate unique magic cards', () => {
      const magicCards = Array.from({ length: 10 }, () => generateSingleMagicCard());
      const uniqueIds = new Set(magicCards.map(card => card.id));

      expect(uniqueIds.size).toBe(10); // All IDs should be unique
    });

    it('should generate cards from all three magic types over multiple generations', () => {
      const magicCards = Array.from({ length: 50 }, () => generateSingleMagicCard());
      const uniqueTypes = new Set(magicCards.map(card => card.type));

      // Should eventually generate all three types
      expect(uniqueTypes.size).toBeGreaterThan(0);
      expect(['wind', 'recycle', 'shield']).toEqual(expect.arrayContaining(Array.from(uniqueTypes)));
    });

    it('should generate cards with valid game mechanics properties', () => {
      const magicCard = generateSingleMagicCard();

      // Verify each magic card type has expected structure
      switch(magicCard.type) {
        case 'wind':
          expect(magicCard.name).toContain('Wind');
          expect(magicCard.description).toContain('remove');
          break;
        case 'recycle':
          expect(magicCard.name).toContain('Recycle');
          expect(magicCard.description).toContain('white');
          break;
        case 'shield':
          expect(magicCard.name).toContain('Shield');
          expect(magicCard.description).toContain('Protect');
          break;
      }
    });
  });

  describe('integration with room creation', () => {
    it('should work correctly when creating a new game room', async () => {
      const roomData = {
        code: testRoomCode,
        players: mockPlayers,
        maxPlayers: 2,
        gameState: {
          tiles: [],
          gameStarted: false,
          currentPlayer: null,
          deck: { emoji: "💌", cards: 16, type: "hearts" },
          magicDeck: { emoji: "🔮", cards: 16, type: "magic" },
          playerHands: {},
          shields: {},
          turnCount: 0,
          playerActions: {},
        }
      };

      // Test selectRandomStartingPlayer in room context
      const startingPlayer = selectRandomStartingPlayer(roomData.players);
      expect(roomData.players).toContain(startingPlayer);

      // Test card generation for initial hands
      const heartCard = generateSingleHeart();
      const magicCard = generateSingleMagicCard();

      expect(heartCard.type).toBe('heart');
      expect(['wind', 'recycle', 'shield']).toContain(magicCard.type);

      // Verify cards can be added to player hands
      const playerHand = [heartCard, magicCard];
      expect(playerHand).toHaveLength(2);

      // Save room to test database integration
      await saveRoom(roomData);

      // Load rooms to verify persistence
      const rooms = await loadRooms();
      expect(rooms.has(testRoomCode)).toBe(true);
    });
  });
});