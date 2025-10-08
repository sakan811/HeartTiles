import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Shield Card End-to-End Scenarios', () => {
  let mockServer;
  let mockClient1, mockClient2;
  let roomCode;

  beforeEach(() => {
    // Mock server and client setup
    mockServer = {
      rooms: new Map(),
      io: {
        to: vi.fn(() => ({
          emit: vi.fn()
        }))
      }
    };

    mockClient1 = {
      id: 'client1',
      userId: 'user1',
      name: 'Player 1',
      socket: {
        emit: vi.fn(),
        on: vi.fn()
      }
    };

    mockClient2 = {
      id: 'client2',
      userId: 'user2',
      name: 'Player 2',
      socket: {
        emit: vi.fn(),
        on: vi.fn()
      }
    };

    roomCode = 'SHIELD1';
  });

  describe('Complete Shield Gameplay Flow', () => {
    it('should handle full shield protection scenario from activation to expiration', async () => {
      // 1. Setup game room with players
      const room = {
        roomCode,
        players: [
          { userId: mockClient1.userId, name: mockClient1.name, socketId: mockClient1.id, ready: true },
          { userId: mockClient2.userId, name: mockClient2.name, socketId: mockClient2.id, ready: true }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: mockClient1.userId, name: mockClient1.name },
          turnCount: 1,
          tiles: [
            { id: 1, color: 'red', emoji: '🟥', placedHeart: { color: 'red', value: 2, placedBy: mockClient1.userId } },
            { id: 2, color: 'yellow', emoji: '🟨', placedHeart: { color: 'yellow', value: 1, placedBy: mockClient2.userId } },
            { id: 3, color: 'green', emoji: '🟩', placedHeart: null }
          ],
          playerHands: {
            [mockClient1.userId]: [
              { id: 'shield1', type: 'shield', emoji: '🛡️' },
              { id: 'heart1', type: 'heart', color: 'blue', value: 2, emoji: '💙' }
            ],
            [mockClient2.userId]: [
              { id: 'wind1', type: 'wind', emoji: '💨' },
              { id: 'recycle1', type: 'recycle', emoji: '♻️' }
            ]
          },
          shields: {}
        }
      };

      mockServer.rooms.set(roomCode, room);

      // 2. Player 1 activates shield
      const shieldCard = room.gameState.playerHands[mockClient1.userId][0];
      const { ShieldCard } = await import('../../src/lib/cards.js');
      const actualShieldCard = new ShieldCard(shieldCard.id);

      const activationResult = actualShieldCard.executeEffect(room.gameState, mockClient1.userId);

      expect(activationResult.type).toBe('shield');
      expect(activationResult.activatedFor).toBe(mockClient1.userId);
      expect(room.gameState.shields[mockClient1.userId]).toBeDefined();

      // 3. Player 2 attempts to use Wind card (should be blocked)
      const windCard = room.gameState.playerHands[mockClient2.userId][0];
      const { WindCard } = await import('../../src/lib/cards.js');
      const actualWindCard = new WindCard(windCard.id);

      expect(() => {
        actualWindCard.executeEffect(room.gameState, 1, mockClient2.userId);
      }).toThrow("Opponent is protected by Shield");

      // 4. Player 2 attempts to use Recycle card (should be blocked on protected tiles)
      const recycleCard = room.gameState.playerHands[mockClient2.userId][1];
      const { RecycleCard } = await import('../../src/lib/cards.js');
      const actualRecycleCard = new RecycleCard(recycleCard.id);

      // Try to use Recycle on tile with heart (fails basic targeting)
      expect(() => {
        actualRecycleCard.executeEffect(room.gameState, 1);
      }).toThrow("Invalid target for Recycle card");

      // Try to use Recycle on empty tile (basic targeting passes, but shield blocks)
      expect(() => {
        actualRecycleCard.executeEffect(room.gameState, 3);
      }).toThrow("Tile is protected by Shield");

      // 5. Advance turns until shield expires
      room.gameState.turnCount = 3;

      // 6. Player 2 should now be able to use Wind card
      const windResult = actualWindCard.executeEffect(room.gameState, 1, mockClient2.userId);

      expect(windResult.type).toBe('wind');
      expect(windResult.removedHeart.placedBy).toBe(mockClient1.userId);
    });

    it('should handle shield reinforcement scenario', async () => {
      const room = {
        roomCode,
        players: [
          { userId: mockClient1.userId, name: mockClient1.name, socketId: mockClient1.id, ready: true },
          { userId: mockClient2.userId, name: mockClient2.name, socketId: mockClient2.id, ready: true }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: mockClient1.userId, name: mockClient1.name },
          turnCount: 1,
          tiles: [
            { id: 1, color: 'red', emoji: '🟥', placedHeart: { color: 'red', value: 2, placedBy: mockClient1.userId } }
          ],
          playerHands: {
            [mockClient1.userId]: [
              { id: 'shield1', type: 'shield', emoji: '🛡️' },
              { id: 'shield2', type: 'shield', emoji: '🛡️' }
            ],
            [mockClient2.userId]: [
              { id: 'wind1', type: 'wind', emoji: '💨' }
            ]
          },
          shields: {}
        }
      };

      mockServer.rooms.set(roomCode, room);

      // 1. Activate first shield
      const { ShieldCard } = await import('../../src/lib/cards.js');
      const firstShield = new ShieldCard('shield1');
      const firstResult = firstShield.executeEffect(room.gameState, mockClient1.userId);

      expect(firstResult.reinforced).toBe(false);

      // 2. Reinforce with second shield
      room.gameState.turnCount = 2;
      const secondShield = new ShieldCard('shield2');
      const secondResult = secondShield.executeEffect(room.gameState, mockClient1.userId);

      expect(secondResult.reinforced).toBe(true);
      expect(room.gameState.shields[mockClient1.userId].remainingTurns).toBe(3);

      // 3. Verify protection is still active
      const { WindCard } = await import('../../src/lib/cards.js');
      const windCard = new WindCard('wind1');

      expect(() => {
        windCard.executeEffect(room.gameState, 1, mockClient2.userId);
      }).toThrow("Opponent is protected by Shield");
    });
  });

  describe('Multiplayer Shield Interactions', () => {
    it('should handle competitive shield activation correctly', async () => {
      const room = {
        roomCode,
        players: [
          { userId: mockClient1.userId, name: mockClient1.name, socketId: mockClient1.id, ready: true },
          { userId: mockClient2.userId, name: mockClient2.name, socketId: mockClient2.id, ready: true }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: mockClient1.userId, name: mockClient1.name },
          turnCount: 1,
          tiles: [
            { id: 1, color: 'red', emoji: '🟥', placedHeart: { color: 'red', value: 2, placedBy: mockClient1.userId } },
            { id: 2, color: 'yellow', emoji: '🟨', placedHeart: { color: 'yellow', value: 1, placedBy: mockClient2.userId } }
          ],
          playerHands: {
            [mockClient1.userId]: [
              { id: 'shield1', type: 'shield', emoji: '🛡️' }
            ],
            [mockClient2.userId]: [
              { id: 'shield2', type: 'shield', emoji: '🛡️' }
            ]
          },
          shields: {}
        }
      };

      mockServer.rooms.set(roomCode, room);

      // 1. Player 1 activates shield
      const { ShieldCard } = await import('../../src/lib/cards.js');
      const player1Shield = new ShieldCard('shield1');
      player1Shield.executeEffect(room.gameState, mockClient1.userId);

      // 2. Player 2 should not be able to activate shield
      const player2Shield = new ShieldCard('shield2');

      expect(() => {
        player2Shield.executeEffect(room.gameState, mockClient2.userId);
      }).toThrow("Cannot activate Shield while opponent has active Shield");

      // 3. Switch turns
      room.gameState.currentPlayer = { userId: mockClient2.userId, name: mockClient2.name };
      room.gameState.turnCount = 2;

      // 4. Player 2 still should not be able to activate shield (Player 1's shield is still active)
      expect(() => {
        player2Shield.executeEffect(room.gameState, mockClient2.userId);
      }).toThrow("Cannot activate Shield while opponent has active Shield");

      // 5. Advance to Player 1's next turn (shield expires)
      room.gameState.currentPlayer = { userId: mockClient1.userId, name: mockClient1.name };
      room.gameState.turnCount = 3;

      // 6. Player 2 should now be able to activate shield
      const result = player2Shield.executeEffect(room.gameState, mockClient2.userId);

      expect(result.type).toBe('shield');
      expect(result.activatedFor).toBe(mockClient2.userId);
    });
  });

  describe('Shield Card Network Events', () => {
    it('should properly broadcast shield activation to all players', async () => {
      const mockEmit = vi.fn();
      const room = {
        roomCode,
        players: [
          { userId: mockClient1.userId, name: mockClient1.name, socketId: mockClient1.id, ready: true },
          { userId: mockClient2.userId, name: mockClient2.name, socketId: mockClient2.id, ready: true }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: mockClient1.userId, name: mockClient1.name },
          turnCount: 1,
          tiles: [],
          playerHands: {
            [mockClient1.userId]: [
              { id: 'shield1', type: 'shield', emoji: '🛡️' }
            ]
          },
          shields: {}
        }
      };

      // Simulate server event broadcasting
      const { ShieldCard } = await import('../../src/lib/cards.js');
      const shieldCard = new ShieldCard('shield1');
      const result = shieldCard.executeEffect(room.gameState, mockClient1.userId);

      // Verify the result structure matches what would be broadcasted
      expect(result).toMatchObject({
        type: 'shield',
        activatedFor: mockClient1.userId,
        protectedPlayerId: mockClient1.userId,
        remainingTurns: 3,
        reinforced: false,
        message: expect.stringContaining('Shield activated')
      });
    });

    it('should handle shield-related error events', async () => {
      const room = {
        roomCode,
        players: [
          { userId: mockClient1.userId, name: mockClient1.name, socketId: mockClient1.id, ready: true },
          { userId: mockClient2.userId, name: mockClient2.name, socketId: mockClient2.id, ready: true }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: mockClient1.userId, name: mockClient1.name },
          turnCount: 1,
          tiles: [],
          playerHands: {
            [mockClient1.userId]: [
              { id: 'shield1', type: 'shield', emoji: '🛡️' }
            ],
            [mockClient2.userId]: [
              { id: 'shield2', type: 'shield', emoji: '🛡️' }
            ]
          },
          shields: {}
        }
      };

      // Player 1 activates shield
      const { ShieldCard } = await import('../../src/lib/cards.js');
      const player1Shield = new ShieldCard('shield1');
      player1Shield.executeEffect(room.gameState, mockClient1.userId);

      // Player 2 attempts to activate shield (should generate error)
      const player2Shield = new ShieldCard('shield2');

      try {
        player2Shield.executeEffect(room.gameState, mockClient2.userId);
      } catch (error) {
        expect(error.message).toContain("Cannot activate Shield while opponent has active Shield");
        expect(error.message).toContain("turns remaining");
      }
    });
  });

  describe('Shield Card Persistence and Recovery', () => {
    it('should maintain shield state through game state serialization', async () => {
      const room = {
        roomCode,
        players: [
          { userId: mockClient1.userId, name: mockClient1.name, socketId: mockClient1.id, ready: true }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: mockClient1.userId, name: mockClient1.name },
          turnCount: 1,
          tiles: [],
          playerHands: {},
          shields: {}
        }
      };

      // Activate shield
      const { ShieldCard } = await import('../../src/lib/cards.js');
      const shieldCard = new ShieldCard('shield1');
      shieldCard.executeEffect(room.gameState, mockClient1.userId);

      // Serialize game state (simulate database storage)
      const serializedState = JSON.parse(JSON.stringify(room.gameState));

      // Deserialize and verify shield state is preserved
      expect(serializedState.shields[mockClient1.userId]).toBeDefined();
      expect(serializedState.shields[mockClient1.userId].active).toBe(true);
      expect(serializedState.shields[mockClient1.userId].remainingTurns).toBe(3);
      expect(serializedState.shields[mockClient1.userId].protectedPlayerId).toBe(mockClient1.userId);

      // Verify shield functionality after deserialization
      const isProtected = ShieldCard.isPlayerProtected(serializedState, mockClient1.userId, 1);
      expect(isProtected).toBe(true);
    });

    it('should handle shield state during player reconnection', async () => {
      const room = {
        roomCode,
        players: [
          { userId: mockClient1.userId, name: mockClient1.name, socketId: 'old_socket', ready: true }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: mockClient1.userId, name: mockClient1.name },
          turnCount: 1,
          tiles: [],
          playerHands: {
            [mockClient1.userId]: []
          },
          shields: {}
        }
      };

      // Activate shield before disconnection
      const { ShieldCard } = await import('../../src/lib/cards.js');
      const shieldCard = new ShieldCard('shield1');
      shieldCard.executeEffect(room.gameState, mockClient1.userId);

      // Simulate player reconnection with new socket ID
      const newUserId = 'user1_reconnected';
      const newSocketId = 'new_socket';

      // Update player and shield references (server-side migration)
      room.players[0].userId = newUserId;
      room.players[0].socketId = newSocketId;

      if (room.gameState.shields[mockClient1.userId]) {
        room.gameState.shields[newUserId] = room.gameState.shields[mockClient1.userId];
        delete room.gameState.shields[mockClient1.userId];
        room.gameState.shields[newUserId].protectedPlayerId = newUserId;
        room.gameState.shields[newUserId].activatedBy = newUserId;
      }

      // Verify shield is still active for reconnected player
      expect(room.gameState.shields[newUserId]).toBeDefined();
      expect(ShieldCard.isPlayerProtected(room.gameState, newUserId, 1)).toBe(true);
    });
  });
});