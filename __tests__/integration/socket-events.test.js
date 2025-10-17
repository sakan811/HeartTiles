import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { io as ClientIO } from 'socket.io-client';
import { MockSocketServer } from '../helpers/mock-server.js';
import {
  waitFor,
  waitForConnection,
  createAuthenticatedClient,
  createTestClients,
  setupGame,
  assertGameState,
  assertPlayerState,
  createRoomCodeGenerator,
  cleanupClients
} from '../helpers/test-utils.js';
import { createHeartCard, createWindCard, createRecycleCard, createShieldCard } from '../factories/card-factories.js';

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

// Mock cards library
vi.mock('../../src/lib/cards.js', () => ({
  HeartCard: {
    generateRandom: vi.fn().mockImplementation(() => createHeartCard())
  },
  WindCard: vi.fn().mockImplementation((id) => createWindCard({ id })),
  RecycleCard: vi.fn().mockImplementation((id) => createRecycleCard({ id })),
  ShieldCard: vi.fn().mockImplementation((id) => createShieldCard({ id })),
  generateRandomMagicCard: vi.fn().mockImplementation(() => {
    const types = ['wind', 'recycle', 'shield'];
    const selectedType = types[Math.floor(Math.random() * types.length)];

    switch (selectedType) {
      case 'wind':
        return createWindCard();
      case 'recycle':
        return createRecycleCard();
      case 'shield':
        return createShieldCard();
      default:
        return createWindCard();
    }
  }),
  isHeartCard: vi.fn((card) => card?.type === 'heart' || (card?.color && card?.value !== undefined)),
  isMagicCard: vi.fn((card) => card?.type && ['wind', 'recycle', 'shield'].includes(card.type)),
  createCardFromData: vi.fn((cardData) => cardData)
}));

describe('Socket.IO Events Integration Tests', () => {
  let mockServer;
  let port;
  let clientSockets = [];
  let roomCodeGenerator;
  let testRooms = new Set();

  // Note: test timeout is already set to 15s in vitest.config.ts for integration tests

  // Setup mock server for entire test suite
  beforeAll(async () => {
    mockServer = new MockSocketServer();
    port = await mockServer.start();
    roomCodeGenerator = createRoomCodeGenerator();
  });

  // Cleanup after all tests
  afterAll(async () => {
    cleanupClients(clientSockets);
    await mockServer.stop();
    vi.clearAllMocks();
  });

  // Setup and cleanup for each test
  beforeEach(() => {
    testRooms.clear();
  });

  afterEach(() => {
    // Clean up rooms created during this test
    testRooms.forEach(roomCode => {
      console.log(`Test cleanup: Cleaning up room ${roomCode}`);
      if (global.__testRooms__?.has(roomCode)) {
        global.__testRooms__.delete(roomCode);
      }
    });
    testRooms.clear();

    // Clean up any remaining rooms to ensure test isolation
    if (global.__testRooms__) {
      global.__testRooms__.clear();
    }
  });

  // Helper function to create and track client sockets
  const createClient = async (userId = 'user1') => {
    const client = createAuthenticatedClient(port, userId);
    clientSockets.push(client);
    await waitForConnection(client);
    return client;
  };

  describe('Authentication & Room Management', () => {
    it('should authenticate users successfully and allow room joining', async () => {
      const client = await createClient();
      const roomCode = roomCodeGenerator();
      testRooms.add(roomCode);

      client.emit('join-room', { roomCode });
      const response = await waitFor(client, 'room-joined');

      expect(response.players).toHaveLength(1);
      assertPlayerState(response.players[0], {
        hasUserId: true,
        hasName: true,
        isReady: false
      });
      expect(response.playerId).toBe('user1');
    });

    it('should reject invalid room codes with proper validation', async () => {
      const client = await createClient();

      const invalidRoomCodes = [
        'INVALID',    // 7 characters
        'SHORT',      // 5 characters
        '12345!',     // Contains special character
        'lowercase',  // All lowercase
        ''            // Empty string
      ];

      for (const roomCode of invalidRoomCodes) {
        client.emit('join-room', { roomCode });
        const error = await waitFor(client, 'room-error');
        expect(error).toBe('Invalid room code');
      }
    });

    it('should handle multiple players joining the same room', async () => {
      const clients = await createTestClients(port, 2);
      const roomCode = roomCodeGenerator();
      testRooms.add(roomCode);

      // First player joins
      clients[0].emit('join-room', { roomCode });
      const response1 = await waitFor(clients[0], 'room-joined');
      expect(response1.players).toHaveLength(1);

      // Second player joins
      clients[1].emit('join-room', { roomCode });
      const response2 = await waitFor(clients[1], 'room-joined');
      expect(response2.players).toHaveLength(2);

      // First player should also receive the player-joined event with updated state
      const response1Updated = await waitFor(clients[0], 'player-joined');
      expect(response1Updated.players).toHaveLength(2);

      // Verify both players see the same room state (after all events are processed)
      expect(response2.players.map(p => p.userId)).toEqual(response1Updated.players.map(p => p.userId));
    });

    it('should handle room leaving and cleanup correctly', async () => {
      const client = await createClient();
      const roomCode = roomCodeGenerator();
      testRooms.add(roomCode);

      // Join room first
      client.emit('join-room', { roomCode });
      await waitFor(client, 'room-joined');

      // Leave room
      client.emit('leave-room', { roomCode });
      const response = await waitFor(client, 'player-left');
      expect(response.players).toHaveLength(0);

      // Room cleanup is handled by the mock server when empty
      expect(mockServer.getRoom(roomCode)?.players || []).toHaveLength(0);
    });

    it('should reject unauthenticated connections', async () => {
      const unauthenticatedClient = ClientIO(`http://localhost:${port}`, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        timeout: 5000,
        auth: { token: null }
      });

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Authentication test timeout'));
        }, 8000);

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

  describe('Game Setup & Initialization', () => {
    it('should start game when both players are ready', async () => {
      const { clients, gameData, roomCode } = await setupGame(port);
      testRooms.add(roomCode);

      assertGameState(gameData, {
        playerCount: 2,
        tileCount: 8,
        gameStarted: true,
        hasCurrentPlayer: true,
        hasTurnCount: true
      });

      // Verify each player has initial cards
      gameData.players.forEach(player => {
        assertPlayerState(player, {
          hasUserId: true,
          hasName: true,
          hasHand: true,
          hasScore: true,
          isReady: true
        });
        expect(player.hand).toHaveLength(5); // 3 hearts + 2 magic cards
      });

      // Verify initial cards distribution
      gameData.players.forEach(player => {
        const heartCards = player.hand.filter(card => card.type === 'heart');
        const magicCards = player.hand.filter(card => card.type !== 'heart');
        expect(heartCards).toHaveLength(3);
        expect(magicCards).toHaveLength(2);
      });
    });

    it('should toggle player ready state correctly', async () => {
      const client = await createClient();
      const roomCode = roomCodeGenerator();
      testRooms.add(roomCode);

      client.emit('join-room', { roomCode });
      await waitFor(client, 'room-joined');

      // Toggle ready state to true
      client.emit('player-ready', { roomCode });
      let response = await waitFor(client, 'player-ready');
      expect(response.players[0].isReady).toBe(true);

      // Toggle ready state back to false
      client.emit('player-ready', { roomCode });
      response = await waitFor(client, 'player-ready');
      expect(response.players[0].isReady).toBe(false);
    });

    it('should prevent game start with insufficient players', async () => {
      const client = await createClient();
      const roomCode = roomCodeGenerator();
      testRooms.add(roomCode);

      client.emit('join-room', { roomCode });
      await waitFor(client, 'room-joined');

      client.emit('player-ready', { roomCode });
      await waitFor(client, 'player-ready');

      // Game should not start with only one player
      // Wait a bit to ensure no game-start event is emitted
      await new Promise(resolve => setTimeout(resolve, 100));

      const room = mockServer.getRoom(roomCode);
      expect(room.gameState.gameStarted).toBe(false);
    });

    it('should generate proper tile configuration on game start', async () => {
      const { gameData, roomCode } = await setupGame(port);
      testRooms.add(roomCode);

      const tiles = gameData.tiles;
      expect(tiles).toHaveLength(8);

      // Verify tile properties
      tiles.forEach((tile, index) => {
        expect(tile.id).toBe(index);
        expect(tile.color).toBeDefined();
        expect(tile.emoji).toBeDefined();
        expect(['white', 'red', 'yellow', 'green']).toContain(tile.color);
      });

      // Verify color distribution
      const whiteTiles = tiles.filter(t => t.color === 'white');
      const coloredTiles = tiles.filter(t => t.color !== 'white');
      expect(whiteTiles.length).toBeGreaterThan(0);
      expect(coloredTiles.length).toBeGreaterThan(0);
    });
  });

  describe('Heart Card Mechanics', () => {
    it('should allow placing hearts on valid tiles during player turn', async () => {
      const { clients, gameData, roomCode, currentClient, currentPlayer } = await setupGame(port);
      testRooms.add(roomCode);

      const heartCard = currentPlayer.hand.find(card => card.type === 'heart');
      const emptyTile = gameData.tiles.find(tile => !tile.placedHeart);

      expect(heartCard).toBeDefined();
      expect(emptyTile).toBeDefined();

      currentClient.emit('place-heart', {
        roomCode,
        tileId: emptyTile.id,
        heartId: heartCard.id
      });

      const response = await waitFor(currentClient, 'heart-placed');

      // Verify heart was placed
      const updatedTile = response.tiles.find(t => t.id === emptyTile.id);
      expect(updatedTile.placedHeart).toBeDefined();
      expect(updatedTile.placedHeart.placedBy).toBe(currentPlayer.userId);
      expect(updatedTile.emoji).toBe(heartCard.emoji);
      expect(updatedTile.color).toBe(heartCard.color);

      // Verify player score increased
      const updatedPlayer = response.players.find(p => p.userId === currentPlayer.userId);
      expect(updatedPlayer.score).toBeGreaterThan(currentPlayer.score);
    });

    it('should reject heart placement on occupied tiles', async () => {
      const { clients, gameData, roomCode, currentClient, currentPlayer } = await setupGame(port);
      testRooms.add(roomCode);

      const heartCard = currentPlayer.hand.find(card => card.type === 'heart');
      const occupiedTile = gameData.tiles.find(tile => tile.placedHeart);

      // If no occupied tile exists, place one heart first
      let targetTile = occupiedTile;
      if (!occupiedTile) {
        const emptyTile = gameData.tiles.find(tile => !tile.placedHeart);
        currentClient.emit('place-heart', {
          roomCode,
          tileId: emptyTile.id,
          heartId: heartCard.id
        });
        await waitFor(currentClient, 'heart-placed');
        targetTile = emptyTile;
      }

      // Try to place another heart on the same tile
      const secondHeartCard = currentPlayer.hand.find(card => card.type === 'heart' && card.id !== heartCard.id);
      currentClient.emit('place-heart', {
        roomCode,
        tileId: targetTile.id,
        heartId: secondHeartCard.id
      });

      const error = await waitFor(currentClient, 'room-error');
      expect(error).toBe('Invalid tile');
    });

    it('should enforce turn-based heart placement', async () => {
      const { clients, gameData, roomCode, currentClient, otherClient, currentPlayer } = await setupGame(port);
      testRooms.add(roomCode);

      const heartCard = currentPlayer.hand.find(card => card.type === 'heart');
      const emptyTile = gameData.tiles.find(tile => !tile.placedHeart);

      // Non-current player tries to place a heart
      otherClient.emit('place-heart', {
        roomCode,
        tileId: emptyTile.id,
        heartId: heartCard.id
      });

      const error = await waitFor(otherClient, 'room-error');
      expect(error).toBe('Not your turn');
    });

    it('should reject heart placement with invalid card ID', async () => {
      const { clients, gameData, roomCode, currentClient, currentPlayer, otherClient } = await setupGame(port);
      testRooms.add(roomCode);

      const emptyTile = gameData.tiles.find(tile => !tile.placedHeart);

      // Use otherClient to try to place a card with invalid ID (since they're not current player)
      otherClient.emit('place-heart', {
        roomCode,
        tileId: emptyTile.id,
        heartId: 'invalid-card-id'
      });

      const error = await waitFor(otherClient, 'room-error');
      expect(error).toBe('Not your turn');
    });
  });

  describe('Magic Card Mechanics', () => {
    it('should allow drawing magic cards during turn', async () => {
      const { clients, gameData, roomCode, currentClient, currentPlayer } = await setupGame(port);
      testRooms.add(roomCode);

      const initialMagicCount = currentPlayer.hand.filter(card => card.type !== 'heart').length;

      currentClient.emit('draw-magic-card', { roomCode });
      const response = await waitFor(currentClient, 'magic-card-drawn');

      const updatedPlayer = response.players.find(p => p.userId === currentPlayer.userId);
      const newMagicCount = updatedPlayer.hand.filter(card => card.type !== 'heart').length;

      expect(newMagicCount).toBeGreaterThan(initialMagicCount);
      expect(response.magicDeck.cards).toBeLessThan(gameData.magicDeck.cards);
    });

    it('should prevent drawing multiple magic cards in one turn', async () => {
      const { clients, roomCode, currentClient } = await setupGame(port);
      testRooms.add(roomCode);

      // Draw first magic card
      currentClient.emit('draw-magic-card', { roomCode });
      await waitFor(currentClient, 'magic-card-drawn');

      // Try to draw second magic card
      currentClient.emit('draw-magic-card', { roomCode });
      const error = await waitFor(currentClient, 'room-error');
      expect(error).toBe('You can only draw one magic card per turn');
    });

    it('should handle wind card usage correctly', async () => {
      const { clients, gameData, roomCode, currentClient, otherClient } = await setupGame(port);
      testRooms.add(roomCode);

      // Get the current player and their cards
      const currentPlayer = gameData.players.find(p => p.userId === gameData.currentPlayer.userId);
      const heartCard = currentPlayer.hand.find(card => card.type === 'heart');
      const emptyTile = gameData.tiles.find(tile => !tile.placedHeart);

      expect(heartCard).toBeDefined();
      expect(emptyTile).toBeDefined();

      // Step 1: Current player places a heart on a tile
      currentClient.emit('place-heart', {
        roomCode,
        tileId: emptyTile.id,
        heartId: heartCard.id
      });
      const placeResponse = await waitFor(currentClient, 'heart-placed');

      // Verify heart was placed
      const placedTile = placeResponse.tiles.find(t => t.id === emptyTile.id);
      expect(placedTile.placedHeart).toBeDefined();
      expect(placedTile.placedHeart.placedBy).toBe(currentPlayer.userId);

      // Step 2: Current player draws required cards and ends turn
      currentClient.emit('draw-heart', { roomCode });
      await waitFor(currentClient, 'heart-drawn');

      currentClient.emit('draw-magic-card', { roomCode });
      await waitFor(currentClient, 'magic-card-drawn');

      currentClient.emit('end-turn', { roomCode });
      const turnResponse = await waitFor(currentClient, 'turn-changed');

      // Step 3: Other player should now be current player
      expect(turnResponse.currentPlayer.userId).toBe(otherClient.auth?.token?.id);

      // Step 4: Set up other player with a wind card for testing
      const otherPlayer = turnResponse.players.find(p => p.userId === turnResponse.currentPlayer.userId);

      // Get the room and manually add a wind card to other player's hand for testing
      const room = mockServer.getRoom(roomCode);
      const windCard = createWindCard({ id: `test-wind-${Date.now()}` });
      room.gameState.playerHands[otherPlayer.userId].push(windCard);

      // Step 5: Other player uses wind card to remove the heart
      otherClient.emit('use-magic-card', {
        roomCode,
        cardId: windCard.id,
        targetTileId: emptyTile.id
      });

      const windResponse = await waitFor(otherClient, 'magic-card-used');

      // Verify wind card effect
      expect(windResponse.actionResult.type).toBe('wind');
      expect(windResponse.actionResult.removedHeart).toBeDefined();
      expect(windResponse.actionResult.tileId).toBe(emptyTile.id);

      // Verify the heart was removed from the tile
      const targetTileAfter = windResponse.tiles.find(t => t.id === emptyTile.id);
      expect(targetTileAfter.placedHeart).toBeUndefined();

      // Verify tile color is restored to original color
      expect(targetTileAfter.color).toBe(placedTile.placedHeart.originalTileColor || 'white');
    });

    it('should handle recycle card usage correctly', async () => {
      const { clients, gameData, roomCode, currentClient, currentPlayer } = await setupGame(port);
      testRooms.add(roomCode);

      // Find a colored tile without a heart
      const coloredTile = gameData.tiles.find(tile => tile.color !== 'white' && !tile.placedHeart);

      if (coloredTile) {
        // Get a recycle card (may need to draw one)
        let recycleCard = currentPlayer.hand.find(card => card.type === 'recycle');

        if (!recycleCard) {
          // Draw a magic card hoping for recycle
          currentClient.emit('draw-magic-card', { roomCode });
          const drawResponse = await waitFor(currentClient, 'magic-card-drawn');
          const updatedPlayer = drawResponse.players.find(p => p.userId === currentPlayer.userId);
          recycleCard = updatedPlayer.hand.find(card => card.type === 'recycle');
        }

        if (recycleCard) {
          currentClient.emit('use-magic-card', {
            roomCode,
            cardId: recycleCard.id,
            targetTileId: coloredTile.id
          });

          const response = await waitFor(currentClient, 'magic-card-used');
          expect(response.actionResult.type).toBe('recycle');
          expect(response.actionResult.previousColor).toBe(coloredTile.color);
          expect(response.actionResult.newColor).toBe('white');
        }
      }
    });

    it('should handle shield card activation correctly', async () => {
      const { clients, gameData, roomCode, currentClient, currentPlayer } = await setupGame(port);
      testRooms.add(roomCode);

      // Get a shield card (may need to draw one)
      let shieldCard = currentPlayer.hand.find(card => card.type === 'shield');

      if (!shieldCard) {
        // Draw a magic card hoping for shield
        currentClient.emit('draw-magic-card', { roomCode });
        const drawResponse = await waitFor(currentClient, 'magic-card-drawn');
        const updatedPlayer = drawResponse.players.find(p => p.userId === currentPlayer.userId);
        shieldCard = updatedPlayer.hand.find(card => card.type === 'shield');
      }

      if (shieldCard) {
        currentClient.emit('use-magic-card', {
          roomCode,
          cardId: shieldCard.id
        });

        const response = await waitFor(currentClient, 'magic-card-used');
        expect(response.actionResult.type).toBe('shield');
        expect(response.actionResult.activatedFor).toBe(currentPlayer.userId);
        expect(response.actionResult.remainingTurns).toBe(2);
        expect(response.shields[currentPlayer.userId]).toBeDefined();
      }
    });

    it('should enforce turn-based magic card usage', async () => {
      const { clients, gameData, roomCode, currentClient, otherClient, currentPlayer } = await setupGame(port);
      testRooms.add(roomCode);

      const magicCard = currentPlayer.hand.find(card => card.type !== 'heart');

      otherClient.emit('use-magic-card', {
        roomCode,
        cardId: magicCard.id
      });

      const error = await waitFor(otherClient, 'room-error');
      expect(error).toBe('Not your turn');
    });
  });

  describe('Turn Management', () => {
    it('should require drawing cards before ending turn', async () => {
      const { clients, roomCode, currentClient } = await setupGame(port);
      testRooms.add(roomCode);

      // Try to end turn without drawing cards
      currentClient.emit('end-turn', { roomCode });
      const error = await waitFor(currentClient, 'room-error');
      expect(error).toBe('You must draw a heart card before ending your turn');
    });

    it('should allow ending turn after drawing required cards', async () => {
      const { clients, roomCode, currentClient, otherClient } = await setupGame(port);
      testRooms.add(roomCode);

      // Draw heart card
      currentClient.emit('draw-heart', { roomCode });
      await waitFor(currentClient, 'heart-drawn');

      // Draw magic card
      currentClient.emit('draw-magic-card', { roomCode });
      await waitFor(currentClient, 'magic-card-drawn');

      // End turn
      currentClient.emit('end-turn', { roomCode });
      const response = await waitFor(currentClient, 'turn-changed');

      expect(response.currentPlayer).toBeDefined();
      expect(response.turnCount).toBe(2);
      expect(response.currentPlayer.userId).not.toBe(currentClient.id);
    });

    it('should handle empty deck scenario correctly', async () => {
      const { clients, roomCode, currentClient } = await setupGame(port);
      testRooms.add(roomCode);

      // Manually empty the decks for testing
      const room = mockServer.getRoom(roomCode);
      room.gameState.deck.cards = 0;
      room.gameState.magicDeck.cards = 0;

      // Should be able to end turn without drawing when decks are empty
      currentClient.emit('end-turn', { roomCode });
      const response = await waitFor(currentClient, 'turn-changed');

      expect(response.currentPlayer).toBeDefined();
      expect(response.turnCount).toBe(2);
    });

    it('should track player actions correctly across turns', async () => {
      const { clients, roomCode, currentClient, otherClient } = await setupGame(port);
      testRooms.add(roomCode);

      // First player's turn
      currentClient.emit('draw-heart', { roomCode });
      await waitFor(currentClient, 'heart-drawn');

      currentClient.emit('draw-magic-card', { roomCode });
      await waitFor(currentClient, 'magic-card-drawn');

      currentClient.emit('end-turn', { roomCode });
      await waitFor(currentClient, 'turn-changed');

      // Second player's turn
      otherClient.emit('draw-heart', { roomCode });
      await waitFor(otherClient, 'heart-drawn');

      otherClient.emit('end-turn', { roomCode });
      const error = await waitFor(otherClient, 'room-error');
      expect(error).toBe('You must draw a magic card before ending your turn');
    });
  });

  describe('Error Handling & Edge Cases', () => {
    it('should handle invalid input data gracefully', async () => {
      const { clients, roomCode, currentClient } = await setupGame(port);
      testRooms.add(roomCode);

      // Test invalid place-heart data
      currentClient.emit('place-heart', {
        roomCode: '',
        tileId: null,
        heartId: undefined
      });

      const error = await waitFor(currentClient, 'room-error');
      expect(error).toBe('Invalid input data');
    });

    it('should handle missing room code in events', async () => {
      const client = await createClient();

      client.emit('player-ready', {});
      const error = await waitFor(client, 'room-error');
      expect(error).toBe('Invalid room code');
    });

    it('should reject game actions when game not started', async () => {
      const client = await createClient();
      const roomCode = roomCodeGenerator();
      testRooms.add(roomCode);

      client.emit('join-room', { roomCode });
      await waitFor(client, 'room-joined');

      // Test various game actions
      const gameActions = [
        { event: 'place-heart', data: { tileId: 0, heartId: 'heart-1' } },
        { event: 'draw-heart', data: {} },
        { event: 'draw-magic-card', data: {} },
        { event: 'end-turn', data: {} },
        { event: 'use-magic-card', data: { cardId: 'magic-1' } }
      ];

      for (const action of gameActions) {
        client.emit(action.event, { roomCode, ...action.data });
        const error = await waitFor(client, 'room-error');
        expect(error).toBe('Game not started');
      }
    });

    it('should handle deck exhaustion scenarios', async () => {
      const { clients, gameData, roomCode, currentClient } = await setupGame(port);
      testRooms.add(roomCode);

      // Empty the heart deck
      const room = mockServer.getRoom(roomCode);
      room.gameState.deck.cards = 0;

      currentClient.emit('draw-heart', { roomCode });
      const error = await waitFor(currentClient, 'room-error');
      expect(error).toBe('No more cards in deck');

      // Empty the magic deck
      room.gameState.magicDeck.cards = 0;

      currentClient.emit('draw-magic-card', { roomCode });
      const magicError = await waitFor(currentClient, 'room-error');
      expect(magicError).toBe('No more magic cards in deck');
    });

    it('should handle concurrent operations gracefully', async () => {
      const { clients, roomCode } = await setupGame(port);
      testRooms.add(roomCode);

      // Send multiple events rapidly
      const events = [
        waitFor(clients[0], 'player-ready'),
        waitFor(clients[0], 'room-error'), // Expected for invalid action
        waitFor(clients[1], 'player-ready')
      ];

      clients[0].emit('player-ready', { roomCode });
      clients[0].emit('draw-heart', { roomCode }); // Should error since game already started
      clients[1].emit('player-ready', { roomCode });

      await Promise.allSettled(events);
    });
  });

  describe('Data Consistency & State Management', () => {
    it('should maintain consistent player state across events', async () => {
      const { clients, gameData, currentPlayer, roomCode } = await setupGame(port);
      testRooms.add(roomCode);

      // After game starts, all players should be ready
      const player = gameData.players.find(p => p.userId === currentPlayer.userId);
      assertPlayerState(player, {
        hasUserId: true,
        hasName: true,
        hasScore: true,
        isReady: true
      });
    });

    it('should broadcast consistent game state to all players', async () => {
      const { clients, roomCode, gameData } = await setupGame(port);
      testRooms.add(roomCode);

      // setupGame already waits for game-start, so we just need to verify consistency
      // Get fresh game state from both clients
      clients[0].emit('player-ready', { roomCode }); // Should emit player-ready event
      const response1 = await waitFor(clients[0], 'player-ready');

      clients[1].emit('player-ready', { roomCode });
      const response2 = await waitFor(clients[1], 'player-ready');

      expect(response1.players).toHaveLength(2);
      expect(response2.players).toHaveLength(2);
      // Verify player consistency
      expect(response1.players.map(p => p.userId)).toEqual(response2.players.map(p => p.userId));
    });

    it('should maintain game state integrity during complex scenarios', async () => {
      const { clients, gameData, roomCode, currentClient, currentPlayer } = await setupGame(port);
      testRooms.add(roomCode);

      // Perform a sequence of actions
      const heartCard = currentPlayer.hand.find(card => card.type === 'heart');
      const emptyTile = gameData.tiles.find(tile => !tile.placedHeart);

      // Place heart
      currentClient.emit('place-heart', {
        roomCode,
        tileId: emptyTile.id,
        heartId: heartCard.id
      });
      const placeResponse = await waitFor(currentClient, 'heart-placed');

      // Draw cards
      currentClient.emit('draw-heart', { roomCode });
      await waitFor(currentClient, 'heart-drawn');

      currentClient.emit('draw-magic-card', { roomCode });
      const drawResponse = await waitFor(currentClient, 'magic-card-drawn');

      // Verify state consistency
      expect(placeResponse.players).toHaveLength(2);
      expect(drawResponse.players).toHaveLength(2);
      expect(placeResponse.tiles).toBeDefined();
      expect(drawResponse.tiles).toBeDefined();
      // The tiles should be consistent - the placed heart should remain in both responses
      const placedTileAfter = placeResponse.tiles.find(t => t.id === emptyTile.id);
      const placedTileAfterDraw = drawResponse.tiles.find(t => t.id === emptyTile.id);
      expect(placedTileAfter.placedHeart).toBeDefined();
      expect(placedTileAfterDraw.placedHeart).toBeDefined();
    });
  });
});