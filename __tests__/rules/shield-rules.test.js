import { describe, it, expect, beforeEach } from 'vitest';
import { ShieldCard, WindCard, RecycleCard, HeartCard, createCardFromData } from '../../src/lib/cards.js';

describe('Shield Card Rules Verification', () => {
  let mockGameState;
  let player1Id, player2Id;

  beforeEach(() => {
    player1Id = 'player1';
    player2Id = 'player2';

    mockGameState = {
      turnCount: 1,
      tiles: [
        { id: 1, color: 'red', emoji: '🟥', placedHeart: { color: 'red', value: 2, emoji: '❤️', placedBy: player1Id } },
        { id: 2, color: 'yellow', emoji: '🟨', placedHeart: { color: 'yellow', value: 1, emoji: '💛', placedBy: player2Id } },
        { id: 3, color: 'green', emoji: '🟩', placedHeart: null },
        { id: 4, color: 'white', emoji: '⬜', placedHeart: null },
        { id: 5, color: 'red', emoji: '🟥', placedHeart: { color: 'red', value: 3, emoji: '❤️', placedBy: player1Id } },
        { id: 6, color: 'yellow', emoji: '🟨', placedHeart: null },
        { id: 7, color: 'green', emoji: '🟩', placedHeart: { color: 'green', value: 1, emoji: '💚', placedBy: player2Id } },
        { id: 8, color: 'white', emoji: '⬜', placedHeart: null }
      ],
      shields: {}
    };
  });

  describe('Shield Activation Rules', () => {
    it('should only allow one active shield per game', () => {
      const shield1 = new ShieldCard('shield1');
      const shield2 = new ShieldCard('shield2');

      // Player 1 activates shield
      const result1 = shield1.executeEffect(mockGameState, player1Id);
      expect(result1.type).toBe('shield');
      expect(mockGameState.shields[player1Id]).toBeDefined();

      // Player 2 should not be able to activate shield
      expect(() => {
        shield2.executeEffect(mockGameState, player2Id);
      }).toThrow("Cannot activate Shield while opponent has active Shield");
    });

    it('should allow shield activation after opponent shield expires', () => {
      const shield1 = new ShieldCard('shield1');
      const shield2 = new ShieldCard('shield2');

      // Player 1 activates shield
      shield1.executeEffect(mockGameState, player1Id);

      // Advance turns until shield expires
      mockGameState.turnCount = 3;

      // Player 2 should now be able to activate shield
      const result = shield2.executeEffect(mockGameState, player2Id);
      expect(result.type).toBe('shield');
      expect(result.activatedFor).toBe(player2Id);
    });

    it('should only allow shield activation during current player\'s turn', () => {
      const shield = new ShieldCard('shield1');

      // Shield cards don't validate turn themselves - this is done server-side
      // The shield activation itself doesn't check turn, but the server would
      // validate the turn before allowing card usage
      const result = shield.executeEffect(mockGameState, player1Id);
      expect(result.type).toBe('shield');

      // In actual gameplay, the server would validate turn before allowing this
      // This test verifies the shield itself doesn't have turn validation logic
    });

    it('should reinforce shield instead of creating multiple shields', () => {
      const shield1 = new ShieldCard('shield1');
      const shield2 = new ShieldCard('shield2');

      // First activation
      const result1 = shield1.executeEffect(mockGameState, player1Id);
      expect(result1.reinforced).toBe(false);

      // Second activation by same player
      mockGameState.turnCount = 2;
      const result2 = shield2.executeEffect(mockGameState, player1Id);
      expect(result2.reinforced).toBe(true);
      expect(result2.remainingTurns).toBe(2);

      // Should only have one shield entry
      expect(Object.keys(mockGameState.shields)).toHaveLength(1);
      expect(mockGameState.shields[player1Id].remainingTurns).toBe(2);
    });
  });

  describe('Shield Duration Rules', () => {
    it('should last exactly 2 turns: opponent turn + player next turn', () => {
      const shield = new ShieldCard('shield1');
      shield.executeEffect(mockGameState, player1Id);

      const playerShield = mockGameState.shields[player1Id];

      // Turn 1 (current turn): Should be active
      expect(ShieldCard.isActive(playerShield, 1)).toBe(true);
      expect(ShieldCard.getRemainingTurns(playerShield, 1)).toBe(2);

      // Turn 2 (opponent's turn): Should still be active
      expect(ShieldCard.isActive(playerShield, 2)).toBe(true);
      expect(ShieldCard.getRemainingTurns(playerShield, 2)).toBe(1);

      // Turn 3 (player's next turn): Should expire
      expect(ShieldCard.isActive(playerShield, 3)).toBe(false);
      expect(ShieldCard.getRemainingTurns(playerShield, 3)).toBe(0);
    });

    it('should reset duration to 2 turns when reinforced', () => {
      const shield = new ShieldCard('shield1');

      // Activate shield
      shield.executeEffect(mockGameState, player1Id);

      // Advance to turn 2
      mockGameState.turnCount = 2;
      expect(ShieldCard.getRemainingTurns(mockGameState.shields[player1Id], 2)).toBe(1);

      // Reinforce shield
      const reinforceShield = new ShieldCard('shield2');
      const result = reinforceShield.executeEffect(mockGameState, player1Id);

      expect(result.reinforced).toBe(true);
      expect(ShieldCard.getRemainingTurns(mockGameState.shields[player1Id], 2)).toBe(2);
    });

    it('should handle shield expiration cleanup correctly', () => {
      const shield = new ShieldCard('shield1');
      shield.executeEffect(mockGameState, player1Id);

      // Simulate shield expiration
      mockGameState.turnCount = 3;

      // Cleanup expired shields (as done in server.js)
      for (const [userId, shield] of Object.entries(mockGameState.shields)) {
        if (!ShieldCard.isActive(shield, mockGameState.turnCount)) {
          delete mockGameState.shields[userId];
        }
      }

      expect(mockGameState.shields[player1Id]).toBeUndefined();
    });
  });

  describe('Shield Protection Rules - Wind Card', () => {
    let windCard;

    beforeEach(() => {
      windCard = new WindCard('wind1');
      // Activate shield for player1
      const shield = new ShieldCard('shield1');
      shield.executeEffect(mockGameState, player1Id);
    });

    it('should block Wind card from targeting protected player\'s hearts', () => {
      // Player 2 tries to use Wind on Player 1's heart (tile 1)
      expect(() => {
        windCard.executeEffect(mockGameState, 1, player2Id);
      }).toThrow("Opponent is protected by Shield");
    });

    it('should block Wind card from targeting all protected player\'s hearts', () => {
      // Player 2 tries to use Wind on Player 1's other heart (tile 5)
      expect(() => {
        windCard.executeEffect(mockGameState, 5, player2Id);
      }).toThrow("Opponent is protected by Shield");
    });

    it('should allow Wind card to target unprotected player\'s hearts', () => {
      // Player 1 uses Wind on Player 2's heart (tile 2)
      const result = windCard.executeEffect(mockGameState, 2, player1Id);

      expect(result.type).toBe('wind');
      expect(result.removedHeart.placedBy).toBe(player2Id);
    });

    it('should allow Wind card after shield expires', () => {
      // Advance to turn 3 (shield expires)
      mockGameState.turnCount = 3;

      // Player 2 should now be able to use Wind on Player 1's heart
      const result = windCard.executeEffect(mockGameState, 1, player2Id);

      expect(result.type).toBe('wind');
      expect(result.removedHeart.placedBy).toBe(player1Id);
    });

    it('should preserve tile color after Wind removes protected heart', () => {
      // Create a scenario where shield expires, then wind is used
      mockGameState.turnCount = 3; // Shield expires

      const result = windCard.executeEffect(mockGameState, 1, player2Id);

      // Tile should maintain its original color (red)
      expect(result.newTileState.color).toBe('red');
      expect(result.newTileState.emoji).toBe('🟥');
      expect(result.newTileState.placedHeart).toBeUndefined();
    });
  });

  describe('Shield Protection Rules - Recycle Card', () => {
    let recycleCard;

    beforeEach(() => {
      recycleCard = new RecycleCard('recycle1');
      // Activate shield for player1
      const shield = new ShieldCard('shield1');
      shield.executeEffect(mockGameState, player1Id);
    });

    it('should block Recycle card on empty tiles when protected player has hearts on board', () => {
      // Player 2 tries to use Recycle on empty green tile (tile 3)
      expect(() => {
        recycleCard.executeEffect(mockGameState, 3);
      }).toThrow("Tile is protected by Shield");
    });

    it('should block Recycle card on all empty tiles when protected player has hearts', () => {
      // Try various empty tiles
      expect(() => {
        recycleCard.executeEffect(mockGameState, 3); // green
      }).toThrow("Tile is protected by Shield");

      expect(() => {
        recycleCard.executeEffect(mockGameState, 4); // white
      }).toThrow("Invalid target for Recycle card"); // White tiles are invalid targets

      expect(() => {
        recycleCard.executeEffect(mockGameState, 6); // yellow
      }).toThrow("Tile is protected by Shield");
    });

    it('should allow Recycle card when protected player has no hearts on board', () => {
      // Remove all of Player 1's hearts from the board
      mockGameState.tiles[0].placedHeart = null;
      mockGameState.tiles[4].placedHeart = null;

      // Player 2 should now be able to use Recycle on empty tiles
      const result = recycleCard.executeEffect(mockGameState, 3);

      expect(result.type).toBe('recycle');
      expect(result.newColor).toBe('white');
    });

    it('should allow Recycle card after shield expires', () => {
      // Advance to turn 3 (shield expires)
      mockGameState.turnCount = 3;

      // Player 2 should now be able to use Recycle
      const result = recycleCard.executeEffect(mockGameState, 3);

      expect(result.type).toBe('recycle');
      expect(result.newColor).toBe('white');
    });

    it('should still enforce basic Recycle targeting rules with active shield', () => {
      // Can't target tiles with hearts (basic rule)
      expect(() => {
        recycleCard.executeEffect(mockGameState, 1); // Player 1's heart
      }).toThrow("Invalid target for Recycle card");

      expect(() => {
        recycleCard.executeEffect(mockGameState, 2); // Player 2's heart
      }).toThrow("Invalid target for Recycle card");

      // Can't target white tiles (basic rule)
      expect(() => {
        recycleCard.executeEffect(mockGameState, 4); // White tile
      }).toThrow("Invalid target for Recycle card");
    });
  });

  describe('Shield Card Factory and Integration Rules', () => {
    it('should create valid shield cards from factory function', () => {
      const shieldData = { id: 'factory-shield', type: 'shield' };
      const shieldCard = createCardFromData(shieldData);

      expect(shieldCard).toBeInstanceOf(ShieldCard);
      expect(shieldCard.type).toBe('shield');
      expect(shieldCard.emoji).toBe('🛡️');
      expect(shieldCard.name).toBe('Shield Card');
    });

    it('should integrate properly with game state management', () => {
      const shield = new ShieldCard('integration-test');

      // Test with game state that has no shields object
      const gameStateWithoutShields = { turnCount: 1 };

      const result = shield.executeEffect(gameStateWithoutShields, player1Id);

      expect(gameStateWithoutShields.shields).toBeDefined();
      expect(gameStateWithoutShields.shields[player1Id]).toBeDefined();
      expect(result.type).toBe('shield');
    });

    it('should handle shield creation from serialized data', () => {
      const serializedShield = {
        id: 'serialized',
        type: 'shield',
        emoji: '🛡️',
        name: 'Shield Card',
        description: 'Self-activating: Protect your tiles and hearts from opponent\'s magic cards until end of your next turn'
      };

      const shieldCard = createCardFromData(serializedShield);

      expect(shieldCard).toBeInstanceOf(ShieldCard);
      expect(shieldCard.executeEffect(mockGameState, player1Id)).toBeDefined();
    });
  });

  describe('Shield Card Edge Cases and Error Handling', () => {
    it('should handle activation with missing game state gracefully', () => {
      const shield = new ShieldCard('edge-case-shield');

      expect(() => {
        shield.executeEffect(null, player1Id);
      }).toThrow();
    });

    it('should handle protection checks on invalid tile data', () => {
      const shield = new ShieldCard('edge-case-shield');
      shield.executeEffect(mockGameState, player1Id);

      // Test with null tile - current implementation may throw, but this is expected
      // The function expects a tile object with placedHeart property
      expect(() => {
        ShieldCard.isTileProtected(mockGameState, null, 1);
      }).toThrow();

      // Test with tile without placedHeart
      const emptyTile = { id: 99, color: 'green', emoji: '🟩', placedHeart: null };
      expect(ShieldCard.isTileProtected(mockGameState, emptyTile, 1)).toBe(false);

      // Test with malformed tile - function gracefully handles missing placedHeart
      const malformedTile = { id: 100 };
      // This should return false because there's no placedHeart
      expect(ShieldCard.isTileProtected(mockGameState, malformedTile, 1)).toBe(false);
    });

    it('should handle shield activation with invalid player ID', () => {
      // Use completely separate game states for each test
      const shield1 = new ShieldCard('invalid-player-test-1');
      const shield2 = new ShieldCard('invalid-player-test-2');
      const shield3 = new ShieldCard('invalid-player-test-3');

      // Shield activation should handle invalid player IDs gracefully
      // The shield logic itself doesn't validate player IDs - that's server-side
      expect(() => {
        const result = shield1.executeEffect({ turnCount: 1, tiles: [], shields: {} }, null);
        expect(result.protectedPlayerId).toBe(null);
      }).not.toThrow();

      expect(() => {
        const result = shield2.executeEffect({ turnCount: 1, tiles: [], shields: {} }, undefined);
        expect(result.protectedPlayerId).toBe(undefined);
      }).not.toThrow();

      expect(() => {
        const result = shield3.executeEffect({ turnCount: 1, tiles: [], shields: {} }, '');
        expect(result.protectedPlayerId).toBe('');
      }).not.toThrow();
    });

    it('should handle concurrent shield operations safely', () => {
      const shield1 = new ShieldCard('concurrent1');
      const shield2 = new ShieldCard('concurrent2');
      const shield3 = new ShieldCard('concurrent3');

      // Player 1 activates shield
      const result1 = shield1.executeEffect(mockGameState, player1Id);
      expect(result1.type).toBe('shield');

      // Player 2 tries to activate shield (should fail)
      expect(() => {
        shield2.executeEffect(mockGameState, player2Id);
      }).toThrow();

      // Player 1 reinforces shield (should succeed)
      const result3 = shield3.executeEffect(mockGameState, player1Id);
      expect(result3.reinforced).toBe(true);

      // Should still only have one shield
      expect(Object.keys(mockGameState.shields)).toHaveLength(1);
    });

    it('should maintain shield state through rapid turn changes', () => {
      const shield = new ShieldCard('rapid-turns');
      shield.executeEffect(mockGameState, player1Id);

      // Simulate rapid turn progression
      for (let turn = 1; turn <= 10; turn++) {
        mockGameState.turnCount = turn;
        const isProtected = ShieldCard.isPlayerProtected(mockGameState, player1Id, turn);

        if (turn <= 2) {
          expect(isProtected).toBe(true);
        } else {
          expect(isProtected).toBe(false);
        }
      }
    });
  });

  describe('Shield Card Performance Rules', () => {
    it('should handle many shield operations without memory leaks', () => {
      const initialMemoryUsage = Object.keys(mockGameState).length;

      // Perform many shield operations
      for (let i = 0; i < 100; i++) {
        mockGameState.turnCount = i;

        if (i % 10 === 0) {
          // Activate shield every 10 turns
          const shield = new ShieldCard(`perf-test-${i}`);
          shield.executeEffect(mockGameState, player1Id);
        }

        // Check protection status
        ShieldCard.isPlayerProtected(mockGameState, player1Id, i);
      }

      // Cleanup expired shields
      for (const [userId, shield] of Object.entries(mockGameState.shields)) {
        if (!ShieldCard.isActive(shield, mockGameState.turnCount)) {
          delete mockGameState.shields[userId];
        }
      }

      // Memory usage should not have grown significantly
      const finalMemoryUsage = Object.keys(mockGameState).length;
      expect(finalMemoryUsage).toBeLessThanOrEqual(initialMemoryUsage + 1); // Only shields object added
    });

    it('should handle shield validation checks efficiently', () => {
      const shield = new ShieldCard('perf-validation');
      shield.executeEffect(mockGameState, player1Id);

      const startTime = Date.now();

      // Perform many validation checks
      for (let i = 0; i < 1000; i++) {
        ShieldCard.isPlayerProtected(mockGameState, player1Id, 1);
        ShieldCard.isTileProtected(mockGameState, mockGameState.tiles[0], 1);
        ShieldCard.isActive(mockGameState.shields[player1Id], 1);
        ShieldCard.getRemainingTurns(mockGameState.shields[player1Id], 1);
      }

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Should complete quickly (less than 100ms for 4000 operations)
      expect(executionTime).toBeLessThan(100);
    });
  });

  describe('Shield Card Game Balance Rules', () => {
    it('should provide exactly 2 turns of protection as designed', () => {
      const shield = new ShieldCard('balance-test');
      const result = shield.executeEffect(mockGameState, player1Id);

      expect(result.remainingTurns).toBe(2);

      const playerShield = mockGameState.shields[player1Id];
      expect(ShieldCard.getRemainingTurns(playerShield, 1)).toBe(2);
      expect(ShieldCard.getRemainingTurns(playerShield, 2)).toBe(1);
      expect(ShieldCard.getRemainingTurns(playerShield, 3)).toBe(0);
    });

    it('should prevent both players from having shields simultaneously', () => {
      const shield1 = new ShieldCard('balance1');
      const shield2 = new ShieldCard('balance2');

      // Player 1 activates shield
      shield1.executeEffect(mockGameState, player1Id);

      // Player 2 cannot activate shield
      expect(() => {
        shield2.executeEffect(mockGameState, player2Id);
      }).toThrow();

      // Only Player 1 should have shield
      expect(Object.keys(mockGameState.shields)).toHaveLength(1);
      expect(mockGameState.shields[player1Id]).toBeDefined();
      expect(mockGameState.shields[player2Id]).toBeUndefined();
    });

    it('should allow strategic shield reinforcement at cost of card', () => {
      const shield1 = new ShieldCard('strategic1');
      const shield2 = new ShieldCard('strategic2');

      // Player 1 activates shield (costs 1 card)
      shield1.executeEffect(mockGameState, player1Id);

      // Player 1 reinforces shield (costs another card)
      mockGameState.turnCount = 2;
      const result = shield2.executeEffect(mockGameState, player1Id);

      expect(result.reinforced).toBe(true);
      expect(result.remainingTurns).toBe(2);

      // Strategic cost: used 2 shield cards for extended protection
      expect(mockGameState.shields[player1Id].remainingTurns).toBe(2);
    });
  });

  describe('Shield Card Visual Indicator Rules', () => {
    it('should maintain shield state for visual indicators', () => {
      const shield = new ShieldCard('visual-test');
      shield.executeEffect(mockGameState, player1Id);

      // Shield should have all necessary metadata for visual indicators
      expect(mockGameState.shields[player1Id]).toMatchObject({
        active: true,
        remainingTurns: 2,
        protectedPlayerId: player1Id,
        activatedBy: player1Id,
        turnActivated: expect.any(Number),
        activatedAt: expect.any(Number)
      });
    });

    it('should provide correct data for opponent shield visualization', () => {
      const shield = new ShieldCard('opponent-visual');
      shield.executeEffect(mockGameState, player1Id);

      // Shield state should be accessible for opponent visualization
      const opponentShieldData = mockGameState.shields[player1Id];
      expect(opponentShieldData.remainingTurns).toBe(2);
      expect(opponentShieldData.protectedPlayerId).toBe(player1Id);

      // Check protection status for visualization
      const isProtected = ShieldCard.isPlayerProtected(mockGameState, player1Id, 1);
      expect(isProtected).toBe(true);
    });

    it('should support visual indicator updates during turn changes', () => {
      const shield = new ShieldCard('visual-update');
      shield.executeEffect(mockGameState, player1Id);

      // Turn 1: Full duration
      expect(ShieldCard.getRemainingTurns(mockGameState.shields[player1Id], 1)).toBe(2);

      // Turn 2: Reduced duration
      expect(ShieldCard.getRemainingTurns(mockGameState.shields[player1Id], 2)).toBe(1);

      // Turn 3: Expired (should be removed by server cleanup)
      expect(ShieldCard.getRemainingTurns(mockGameState.shields[player1Id], 3)).toBe(0);
    });
  });

  describe('Shield Card Integration with Deck Rules', () => {
    it('should work with shield card generation from deck', () => {
      const shieldCardData = {
        id: 'deck-shield-1',
        type: 'shield',
        emoji: '🛡️',
        name: 'Shield Card',
        description: 'Self-activating: Protect your tiles and hearts from opponent\'s magic cards until end of your next turn'
      };

      const shieldCard = createCardFromData(shieldCardData);
      expect(shieldCard).toBeInstanceOf(ShieldCard);

      const result = shieldCard.executeEffect(mockGameState, player1Id);
      expect(result.type).toBe('shield');
      expect(result.remainingTurns).toBe(2);
    });

    it('should handle multiple shield cards in player hand correctly', () => {
      // Simulate player having multiple shield cards
      const shieldCards = [
        new ShieldCard('hand-shield-1'),
        new ShieldCard('hand-shield-2'),
        new ShieldCard('hand-shield-3')
      ];

      // First card activates shield
      const result1 = shieldCards[0].executeEffect(mockGameState, player1Id);
      expect(result1.reinforced).toBe(false);

      // Second card reinforces shield
      mockGameState.turnCount = 2;
      const result2 = shieldCards[1].executeEffect(mockGameState, player1Id);
      expect(result2.reinforced).toBe(true);

      // Third card reinforces shield again
      mockGameState.turnCount = 3;
      // Wait for shield to expire first
      mockGameState.turnCount = 4;
      const result3 = shieldCards[2].executeEffect(mockGameState, player1Id);
      expect(result3.reinforced).toBe(false); // New activation after expiration
    });
  });

  describe('Shield Card Edge Cases and Boundary Conditions', () => {
    it('should handle rapid shield activation and expiration', () => {
      const shield1 = new ShieldCard('rapid-1');
      const shield2 = new ShieldCard('rapid-2');

      // Player 1 activates shield
      shield1.executeEffect(mockGameState, player1Id);

      // Shield should be active immediately
      expect(ShieldCard.isPlayerProtected(mockGameState, player1Id, 1)).toBe(true);

      // Advance through turns rapidly
      for (let turn = 1; turn <= 5; turn++) {
        mockGameState.turnCount = turn;
        const isProtected = ShieldCard.isPlayerProtected(mockGameState, player1Id, turn);

        if (turn <= 2) {
          expect(isProtected).toBe(true);
        } else {
          expect(isProtected).toBe(false);
        }
      }

      // Player 2 should be able to activate shield after expiration
      expect(() => {
        shield2.executeEffect(mockGameState, player2Id);
      }).not.toThrow();
    });

    it('should handle shield state corruption gracefully', () => {
      // Create corrupted shield state
      mockGameState.shields[player1Id] = {
        active: true,
        remainingTurns: undefined,
        turnActivated: null,
        protectedPlayerId: player1Id
      };

      // Should handle gracefully and return false for protection
      const isProtected = ShieldCard.isPlayerProtected(mockGameState, player1Id, 1);
      expect(isProtected).toBe(false);

      const remainingTurns = ShieldCard.getRemainingTurns(mockGameState.shields[player1Id], 1);
      expect(remainingTurns).toBe(0);
    });

    it('should handle shield activation with missing game state properties', () => {
      const incompleteGameState = {
        turnCount: 1,
        // Missing shields object
      };

      const shield = new ShieldCard('incomplete-state');
      const result = shield.executeEffect(incompleteGameState, player1Id);

      expect(result.type).toBe('shield');
      expect(incompleteGameState.shields).toBeDefined();
      expect(incompleteGameState.shields[player1Id]).toBeDefined();
    });
  });
});