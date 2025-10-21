import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShieldCard, WindCard, RecycleCard, HeartCard } from '../../src/lib/cards.js';

describe('Shield Card Gameplay Integration', () => {
  let mockRoom;
  let mockSocket;
  let mockIo;
  let player1Id, player2Id;
  let player1Socket, player2Socket;

  beforeEach(() => {
    player1Id = 'player1';
    player2Id = 'player2';
    player1Socket = { id: 'socket1', userId: player1Id, emit: vi.fn() };
    player2Socket = { id: 'socket2', userId: player2Id, emit: vi.fn() };

    mockRoom = {
      roomCode: 'TEST123',
      players: [
        { userId: player1Id, name: 'Player 1', socketId: 'socket1', ready: true },
        { userId: player2Id, name: 'Player 2', socketId: 'socket2', ready: true }
      ],
      gameState: {
        gameStarted: true,
        currentPlayer: { userId: player1Id, name: 'Player 1' },
        turnCount: 1,
        tiles: [
          { id: 1, color: 'red', emoji: '🟥', placedHeart: { color: 'red', value: 2, placedBy: player1Id } },
          { id: 2, color: 'yellow', emoji: '🟨', placedHeart: { color: 'yellow', value: 1, placedBy: player2Id } },
          { id: 3, color: 'green', emoji: '🟩', placedHeart: null },
          { id: 4, color: 'white', emoji: '⬜', placedHeart: null },
          { id: 5, color: 'red', emoji: '🟥', placedHeart: { color: 'red', value: 3, placedBy: player1Id } }
        ],
        playerHands: {
          [player1Id]: [
            new ShieldCard('shield1'),
            new WindCard('wind1'),
            new HeartCard('heart1', 'green', 1, '💚')
          ],
          [player2Id]: [
            new RecycleCard('recycle1'),
            new WindCard('wind2'),
            new ShieldCard('shield2')
          ]
        },
        deck: { emoji: '💌', cards: 10, } emoji: '💌', }
        magicDeck: { emoji: '🔮', cards: 10, } emoji: '🔮', }
        shields: {}
      }
    };

    mockIo = {
      to: vi.fn(() => ({
        emit: vi.fn()
      }))
    };

    mockSocket = player1Socket;
  });

  describe('Shield Activation Flow', () => {
    it('should complete full shield activation flow', () => {
      const shieldCard = mockRoom.gameState.playerHands[player1Id][0];

      // Simulate shield activation
      const result = shieldCard.executeEffect(mockRoom.gameState, player1Id);

      expect(result.type).toBe('shield');
      expect(result.activatedFor).toBe(player1Id);
      expect(mockRoom.gameState.shields[player1Id]).toBeDefined();

      // Verify shield state
      const shield = mockRoom.gameState.shields[player1Id];
      expect(shield.active).toBe(true);
      expect(shield.remainingTurns).toBe(2);
      expect(shield.protectedPlayerId).toBe(player1Id);
    });

    it('should handle shield reinforcement correctly', () => {
      const shieldCard = mockRoom.gameState.playerHands[player1Id][0];

      // First activation
      shieldCard.executeEffect(mockRoom.gameState, player1Id);

      // Advance turn
      mockRoom.gameState.turnCount = 2;

      // Reinforcement
      const result = shieldCard.executeEffect(mockRoom.gameState, player1Id);

      expect(result.reinforced).toBe(true);
      expect(mockRoom.gameState.shields[player1Id].remainingTurns).toBe(2);
    });
  });

  describe('Shield Protection Scenarios', () => {
    beforeEach(() => {
      // Activate shield for player1
      const shieldCard = mockRoom.gameState.playerHands[player1Id][0];
      shieldCard.executeEffect(mockRoom.gameState, player1Id);
    });

    it('should protect from Wind card when shield is active', () => {
      const windCard = mockRoom.gameState.playerHands[player2Id][1];

      // Player2 tries to use Wind on Player1's tile
      expect(() => {
        windCard.executeEffect(mockRoom.gameState, 1, player2Id);
      }).toThrow("Opponent is protected by Shield");

      // Verify tile is unchanged
      expect(mockRoom.gameState.tiles[0].placedHeart).toBeDefined();
      expect(mockRoom.gameState.tiles[0].placedHeart.placedBy).toBe(player1Id);
    });

    it('should allow Wind card after shield expires', () => {
      mockRoom.gameState.turnCount = 4; // Shield expires

      const windCard = mockRoom.gameState.playerHands[player2Id][1];
      const result = windCard.executeEffect(mockRoom.gameState, 1, player2Id);

      expect(result.type).toBe('wind');
      expect(result.removedHeart.placedBy).toBe(player1Id);

      // Apply the result to update game state (as server would do)
      const tile = mockRoom.gameState.tiles.find(t => t.id === result.tileId);
      if (tile && result.newTileState) {
        Object.assign(tile, result.newTileState);
      }

      expect(mockRoom.gameState.tiles[0].placedHeart).toBeUndefined();
    });

    it('should protect from Recycle card on tiles with player hearts', () => {
      const recycleCard = mockRoom.gameState.playerHands[player2Id][0];

      // Player2 tries to use Recycle on tile with Player1's heart
      // This fails basic targeting first (tile has heart)
      expect(() => {
        recycleCard.executeEffect(mockRoom.gameState, 1);
      }).toThrow("Invalid target for Recycle card");

      // Player2 tries to use Recycle on empty tile (basic targeting passes, but shield blocks)
      expect(() => {
        recycleCard.executeEffect(mockRoom.gameState, 3);
      }).toThrow("Tile is protected by Shield");
    });

    it('should allow Recycle card on empty tiles when shielded player has no hearts', () => {
      const recycleCard = mockRoom.gameState.playerHands[player2Id][0];

      // Remove Player1's hearts from the board
      mockRoom.gameState.tiles[0].placedHeart = null;
      mockRoom.gameState.tiles[4].placedHeart = null;

      const result = recycleCard.executeEffect(mockRoom.gameState, 3); // Empty tile

      expect(result.type).toBe('recycle');
      expect(result.newColor).toBe('white');
    });
  });

  describe('Multi-Shield Interactions', () => {
    it('should prevent both players from having active shields simultaneously', () => {
      // Player1 activates shield
      const player1Shield = mockRoom.gameState.playerHands[player1Id][0];
      player1Shield.executeEffect(mockRoom.gameState, player1Id);

      // Player2 should not be able to activate shield
      const player2Shield = mockRoom.gameState.playerHands[player2Id][2];

      expect(() => {
        player2Shield.executeEffect(mockRoom.gameState, player2Id);
      }).toThrow("Cannot activate Shield while opponent has active Shield");
    });

    it('should allow shield activation after opponent\'s shield expires', () => {
      // Player1 activates shield
      const player1Shield = mockRoom.gameState.playerHands[player1Id][0];
      player1Shield.executeEffect(mockRoom.gameState, player1Id);

      // Advance turns until shield expires
      mockRoom.gameState.turnCount = 4;

      // Player2 should now be able to activate shield
      const player2Shield = mockRoom.gameState.playerHands[player2Id][2];
      const result = player2Shield.executeEffect(mockRoom.gameState, player2Id);

      expect(result.type).toBe('shield');
      expect(result.activatedFor).toBe(player2Id);
      expect(mockRoom.gameState.shields[player2Id]).toBeDefined();
    });
  });

  describe('Shield Turn Management', () => {
    it('should correctly manage shield state through turn changes', () => {
      const shieldCard = mockRoom.gameState.playerHands[player1Id][0];
      shieldCard.executeEffect(mockRoom.gameState, player1Id);

      // Turn 1: Shield active
      expect(ShieldCard.isActive(mockRoom.gameState.shields[player1Id], 1)).toBe(true);

      // Simulate turn change
      mockRoom.gameState.currentPlayer = { userId: player2Id, name: 'Player 2' };
      mockRoom.gameState.turnCount = 2;

      // Turn 2: Shield still active (opponent's turn)
      expect(ShieldCard.isActive(mockRoom.gameState.shields[player1Id], 2)).toBe(true);

      // Turn 3: Shield expires (player's next turn)
      mockRoom.gameState.turnCount = 3;
      expect(ShieldCard.isActive(mockRoom.gameState.shields[player1Id], 3)).toBe(false);

      // Turn 4: Shield still expired
      mockRoom.gameState.turnCount = 4;
      expect(ShieldCard.isActive(mockRoom.gameState.shields[player1Id], 4)).toBe(false);
    });

    it('should remove expired shields during cleanup', () => {
      const shieldCard = mockRoom.gameState.playerHands[player1Id][0];
      shieldCard.executeEffect(mockRoom.gameState, player1Id);

      // Simulate shield expiration cleanup
      mockRoom.gameState.turnCount = 4;

      // Simulate cleanup function (similar to server.js checkAndExpireShields)
      for (const [userId, shield] of Object.entries(mockRoom.gameState.shields)) {
        if (!ShieldCard.isActive(shield, mockRoom.gameState.turnCount)) {
          delete mockRoom.gameState.shields[userId];
        }
      }

      expect(mockRoom.gameState.shields[player1Id]).toBeUndefined();
    });
  });

  describe('Shield and Card Interaction Edge Cases', () => {
    it('should handle shield activation with invalid game state', () => {
      const shieldCard = new ShieldCard('test-shield');
      const invalidGameState = null;

      expect(() => {
        shieldCard.executeEffect(invalidGameState, player1Id);
      }).toThrow();
    });

    it('should handle shield protection checks on tiles without hearts', () => {
      const shieldCard = new ShieldCard('test-shield');
      shieldCard.executeEffect(mockRoom.gameState, player1Id);

      const emptyTile = { id: 99, color: 'white', emoji: '⬜', placedHeart: null };

      expect(ShieldCard.isTileProtected(mockRoom.gameState, emptyTile, 1)).toBe(false);
    });

    it('should maintain game state consistency during shield operations', () => {
      const shieldCard = mockRoom.gameState.playerHands[player1Id][0];
      const originalTileCount = mockRoom.gameState.tiles.length;
      const originalHandSize = mockRoom.gameState.playerHands[player1Id].length;

      shieldCard.executeEffect(mockRoom.gameState, player1Id);

      // Verify game state integrity
      expect(mockRoom.gameState.tiles.length).toBe(originalTileCount);
      expect(mockRoom.gameState.playerHands[player1Id].length).toBe(originalHandSize);
      expect(mockRoom.gameState.shields[player1Id]).toBeDefined();
    });
  });

  describe('Shield Card Performance and Memory', () => {
    it('should handle rapid shield activation and expiration', () => {
      const shieldCard = new ShieldCard('rapid-shield');
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        mockRoom.gameState.turnCount = i;

        if (i % 10 === 0) {
          shieldCard.executeEffect(mockRoom.gameState, player1Id);
        }

        // Check shield status without errors
        const isProtected = ShieldCard.isPlayerProtected(mockRoom.gameState, player1Id, i);
        expect(typeof isProtected).toBe('boolean');
      }
    });

    it('should not cause memory leaks with repeated shield operations', () => {
      const shieldCard = new ShieldCard('memory-test');
      const initialMemory = Object.keys(mockRoom.gameState).length;

      // Activate shield multiple times
      for (let i = 0; i < 50; i++) {
        mockRoom.gameState.turnCount = i;
        shieldCard.executeEffect(mockRoom.gameState, player1Id);
      }

      // Cleanup expired shields
      for (const [userId, shield] of Object.entries(mockRoom.gameState.shields)) {
        if (!ShieldCard.isActive(shield, mockRoom.gameState.turnCount)) {
          delete mockRoom.gameState.shields[userId];
        }
      }

      const finalMemory = Object.keys(mockRoom.gameState).length;
      expect(finalMemory).toBeLessThanOrEqual(initialMemory + 1); // Only shields object added
    });
  });
});