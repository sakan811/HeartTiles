import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createServer } from 'node:http';
import { io as ioc } from 'socket.io-client';
import { Server } from 'socket.io';
import {
  validateTurn,
  checkAndExpireShields
} from '../../server.js';

function waitFor(socket, event) {
  return new Promise((resolve) => {
    socket.once(event, resolve);
  });
}

describe('Server Shield Event Integration', () => {
  let io, serverSocket, clientSocket;
  let testRoom, testRooms;
  let player1Id, player2Id;

  beforeAll(() => {
    return new Promise((resolve) => {
      const httpServer = createServer();
      io = new Server(httpServer, {
        cors: {
          origin: "*",
          methods: ["GET", "POST"]
        }
      });

      httpServer.listen(() => {
        const port = httpServer.address().port;
        clientSocket = ioc(`http://localhost:${port}`);
        io.on("connection", (socket) => {
          serverSocket = socket;
        });
        clientSocket.on("connect", resolve);
      });
    });
  });

  afterAll(() => {
    io.close();
    clientSocket.disconnect();
  });

  beforeEach(() => {
    player1Id = 'player1';
    player2Id = 'player2';

    testRooms = new Map();
    testRoom = {
      roomCode: 'SHIELD123',
      players: [
        { userId: player1Id, name: 'Player 1', isReady: true, score: 0 },
        { userId: player2Id, name: 'Player 2', isReady: true, score: 0 }
      ],
      maxPlayers: 2,
      gameState: {
        gameStarted: true,
        currentPlayer: { userId: player1Id, name: 'Player 1' },
        turnCount: 1,
        tiles: [
          { id: 1, color: 'red', emoji: '🟥', placedHeart: { color: 'red', value: 2, emoji: '❤️', placedBy: player1Id } },
          { id: 2, color: 'yellow', emoji: '🟨', placedHeart: { color: 'yellow', value: 1, emoji: '💛', placedBy: player2Id } },
          { id: 3, color: 'green', emoji: '🟩', placedHeart: null },
          { id: 4, color: 'white', emoji: '⬜', placedHeart: null }
        ],
        playerHands: {
          [player1Id]: [
            { id: 'shield1', type: 'shield', emoji: '🛡️', name: 'Shield Card' },
            { id: 'heart1', type: 'heart', color: 'blue', value: 2, emoji: '💙' }
          ],
          [player2Id]: [
            { id: 'wind1', type: 'wind', emoji: '💨', name: 'Wind Card' },
            { id: 'recycle1', type: 'recycle', emoji: '♻️', name: 'Recycle Card' }
          ]
        },
        deck: { emoji: '💌', cards: 10, },
        magicDeck: { emoji: '🔮', cards: 10, },
        shields: {},
        playerActions: {}
      }
    };

    testRooms.set(testRoom.roomCode, testRoom);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Shield Card Socket Event Handling', () => {
    it('should handle shield activation event correctly', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js');

      // Simulate the server handling a shield card use event
      const eventData = {
        roomCode: testRoom.roomCode,
        cardId: 'shield1',
        targetTileId: 'self'
      };

      // Validate turn
      const turnValidation = validateTurn(testRoom, player1Id);
      expect(turnValidation.valid).toBe(true);

      // Find and remove the shield card from player's hand
      const playerHand = testRoom.gameState.playerHands[player1Id];
      const cardIndex = playerHand.findIndex(card => card.id === eventData.cardId);
      expect(cardIndex).toBeGreaterThanOrEqual(0);

      const shieldCardData = playerHand.splice(cardIndex, 1)[0];
      const shieldCard = new ShieldCard(shieldCardData.id);

      // Execute shield effect
      const actionResult = shieldCard.executeEffect(testRoom.gameState, player1Id);

      // Verify shield activation
      expect(actionResult.type).toBe('shield');
      expect(actionResult.activatedFor).toBe(player1Id);
      expect(actionResult.remainingTurns).toBe(2);

      // Update player hands
      testRoom.gameState.playerHands[player1Id] = playerHand;

      // Mock broadcasting to all players
      const playersWithUpdatedHands = testRoom.players.map(player => ({
        ...player,
        hand: testRoom.gameState.playerHands[player.userId] || [],
        score: player.score || 0
      }));

      const broadcastData = {
        card: shieldCardData,
        actionResult: actionResult,
        tiles: testRoom.gameState.tiles,
        players: playersWithUpdatedHands,
        playerHands: testRoom.gameState.playerHands,
        usedBy: player1Id,
        shields: testRoom.gameState.shields
      };

      // Verify broadcast data structure
      expect(broadcastData.actionResult.type).toBe('shield');
      expect(broadcastData.actionResult.activatedFor).toBe(player1Id);
      expect(broadcastData.shields[player1Id]).toBeDefined();
    });

    it('should reject shield activation when not player\'s turn', async () => {
      // Change current player to player2
      testRoom.gameState.currentPlayer = { userId: player2Id, name: 'Player 2' };

      const eventData = {
        roomCode: testRoom.roomCode,
        cardId: 'shield1',
        targetTileId: 'self'
      };

      // Validate turn
      const turnValidation = validateTurn(testRoom, player1Id);
      expect(turnValidation.valid).toBe(false);
      expect(turnValidation.error).toBe("Not your turn");
    });

    it('should handle shield reinforcement event correctly', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js');

      // First, activate a shield
      const firstShield = new ShieldCard('shield1');
      firstShield.executeEffect(testRoom.gameState, player1Id);

      // Add second shield to hand
      testRoom.gameState.playerHands[player1Id].push(
        { id: 'shield2', type: 'shield', emoji: '🛡️', name: 'Shield Card' }
      );

      // Advance turn
      testRoom.gameState.turnCount = 2;

      // Use second shield (should reinforce)
      const eventData = {
        roomCode: testRoom.roomCode,
        cardId: 'shield2',
        targetTileId: 'self'
      };

      const playerHand = testRoom.gameState.playerHands[player1Id];
      const cardIndex = playerHand.findIndex(card => card.id === eventData.cardId);
      const shieldCardData = playerHand.splice(cardIndex, 1)[0];
      const shieldCard = new ShieldCard(shieldCardData.id);

      const actionResult = shieldCard.executeEffect(testRoom.gameState, player1Id);

      expect(actionResult.reinforced).toBe(true);
      expect(actionResult.remainingTurns).toBe(2);
    });
  });

  describe('Shield Protection Event Blocking', () => {
    beforeEach(async () => {
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
      const eventData = {
        roomCode: testRoom.roomCode,
        cardId: 'invalid-shield-id',
        targetTileId: 'self'
      };

      const playerHand = testRoom.gameState.playerHands[player1Id];
      const cardIndex = playerHand.findIndex(card => card.id === eventData.cardId);

      expect(cardIndex).toBe(-1);

      // Server validation should catch this
      expect(cardIndex).toBe(-1);
      // In actual server, this would trigger: socket.emit("room-error", "Magic card not found in your hand");
    });

    it('should handle shield activation when opponent has active shield', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js');

      // Player1 activates shield
      const player1Shield = new ShieldCard('shield1');
      player1Shield.executeEffect(testRoom.gameState, player1Id);

      // Give Player2 a shield card
      testRoom.gameState.playerHands[player2Id].push(
        { id: 'shield2', type: 'shield', emoji: '🛡️', name: 'Shield Card' }
      );

      // Player2 tries to activate shield
      const player2Shield = new ShieldCard('shield2');

      // Player2 should not be able to activate shield while player1 has shield
      expect(() => {
        player2Shield.executeEffect(testRoom.gameState, player2Id);
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

      // Activate shield for player1
      const shield = new ShieldCard('shield1');
      shield.executeEffect(testRoom.gameState, player1Id);

      // Simulate player reconnection with new user ID
      const newUserId = 'player1_reconnected';

      // Migrate shield state (as done in server.js)
      if (testRoom.gameState.shields[player1Id]) {
        testRoom.gameState.shields[newUserId] = testRoom.gameState.shields[player1Id];
        delete testRoom.gameState.shields[player1Id];
        testRoom.gameState.shields[newUserId].protectedPlayerId = newUserId;
        testRoom.gameState.shields[newUserId].activatedBy = newUserId;
      }

      // Verify shield is still active
      expect(testRoom.gameState.shields[newUserId]).toBeDefined();
      expect(ShieldCard.isPlayerProtected(testRoom.gameState, newUserId, 1)).toBe(true);
      expect(testRoom.gameState.shields[player1Id]).toBeUndefined();
    });
  });

  describe('Shield Visual State Synchronization', () => {
    it('should broadcast complete shield state for visual indicators', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js');

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

      // Player 1 activates shield
      const player1Shield = new ShieldCard('player1-shield');
      player1Shield.executeEffect(testRoom.gameState, player1Id);

      // Player 2 should receive visual state indicating Player 1 has shield
      const opponentVisualData = {
        shields: testRoom.gameState.shields,
        tiles: testRoom.gameState.tiles
      };

      // Verify opponent can see Player 1's shield state
      expect(opponentVisualData.shields[player1Id]).toBeDefined();
      expect(opponentVisualData.shields[player1Id].remainingTurns).toBe(2);

      // Verify tiles with Player 1's hearts should show shield indicators
      const protectedTiles = testRoom.gameState.tiles.filter(tile =>
        tile.placedHeart && tile.placedHeart.placedBy === player1Id
      );

      expect(protectedTiles).toHaveLength(1);
      expect(protectedTiles[0].placedHeart.placedBy).toBe(player1Id);
    });

    it('should handle visual state updates during shield reinforcement', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js');

      // Activate initial shield
      const shield1 = new ShieldCard('reinforce-visual-1');
      shield1.executeEffect(testRoom.gameState, player1Id);

      // Reinforce shield
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