import { describe, it, expect, beforeEach } from 'vitest';
import { ShieldCard, WindCard, RecycleCard, createCardFromData } from '../../src/lib/cards.js';

describe('Shield Card Functionality', () => {
  let mockGameState;
  let player1Id;
  let player2Id;
  let shieldCard;

  beforeEach(() => {
    player1Id = 'player1';
    player2Id = 'player2';
    shieldCard = new ShieldCard('shield1');

    mockGameState = {
      turnCount: 1,
      tiles: [
        { id: 1, color: 'red', emoji: '🟥', placedHeart: { color: 'red', value: 2, placedBy: player1Id } },
        { id: 2, color: 'yellow', emoji: '🟨', placedHeart: { color: 'yellow', value: 1, placedBy: player2Id } },
        { id: 3, color: 'green', emoji: '🟩', placedHeart: null },
        { id: 4, color: 'white', emoji: '⬜', placedHeart: null }
      ],
      shields: {}
    };
  });

  describe('Shield Card Properties', () => {
    it('should have correct card properties', () => {
      expect(shieldCard.type).toBe('shield');
      expect(shieldCard.emoji).toBe('🛡️');
      expect(shieldCard.name).toBe('Shield Card');
      expect(shieldCard.description).toContain('Protect your tiles and hearts');
      expect(shieldCard.id).toBe('shield1');
    });

    it('should not target tiles', () => {
      expect(shieldCard.canTargetTile()).toBe(false);
    });
  });

  describe('Shield Activation', () => {
    it('should activate shield for player', () => {
      const result = shieldCard.executeEffect(mockGameState, player1Id);

      expect(result.type).toBe('shield');
      expect(result.activatedFor).toBe(player1Id);
      expect(result.protectedPlayerId).toBe(player1Id);
      expect(result.remainingTurns).toBe(2);
      expect(result.reinforced).toBe(false);
      expect(result.message).toContain('Shield activated');

      expect(mockGameState.shields[player1Id]).toBeDefined();
      expect(mockGameState.shields[player1Id].active).toBe(true);
      expect(mockGameState.shields[player1Id].remainingTurns).toBe(2);
      expect(mockGameState.shields[player1Id].protectedPlayerId).toBe(player1Id);
    });

    it('should reinforce existing shield with reset duration', () => {
      // Activate initial shield
      shieldCard.executeEffect(mockGameState, player1Id);
      mockGameState.turnCount = 2;

      // Reinforce shield
      const result = shieldCard.executeEffect(mockGameState, player1Id);

      expect(result.reinforced).toBe(true);
      expect(result.remainingTurns).toBe(2);
      expect(result.message).toContain('Shield reinforced');
      expect(mockGameState.shields[player1Id].remainingTurns).toBe(2);
    });

    it('should not activate shield when opponent has active shield', () => {
      // Opponent activates shield first
      mockGameState.shields[player2Id] = {
        active: true,
        remainingTurns: 2,
        activatedAt: Date.now(),
        activatedBy: player2Id,
        protectedPlayerId: player2Id
      };

      expect(() => {
        shieldCard.executeEffect(mockGameState, player1Id);
      }).toThrow("Cannot activate Shield while opponent has active Shield");
    });
  });

  describe('Shield Duration and Expiration', () => {
    it('should remain active while remainingTurns > 0', () => {
      shieldCard.executeEffect(mockGameState, player1Id);
      const shield = mockGameState.shields[player1Id];

      // Initial state: Should be active with 2 turns remaining
      expect(ShieldCard.isActive(shield)).toBe(true);
      expect(ShieldCard.getRemainingTurns(shield)).toBe(2);

      // After 1 turn ends: 2 turns remaining
      shield.remainingTurns = 2;
      expect(ShieldCard.isActive(shield)).toBe(true);
      expect(ShieldCard.getRemainingTurns(shield)).toBe(2);

      // After 2 turns end: 1 turn remaining
      shield.remainingTurns = 1;
      expect(ShieldCard.isActive(shield)).toBe(true);
      expect(ShieldCard.getRemainingTurns(shield)).toBe(1);

      // After 2 turns end: Should expire
      shield.remainingTurns = 0;
      expect(ShieldCard.isActive(shield)).toBe(false);
      expect(ShieldCard.getRemainingTurns(shield)).toBe(0);
    });

    it('should correctly calculate remaining turns based on counter decrements', () => {
      shieldCard.executeEffect(mockGameState, player1Id);
      const shield = mockGameState.shields[player1Id];

      // Player 1 plays Shield → counter shows 3
      expect(ShieldCard.getRemainingTurns(shield)).toBe(2);

      // Player 2's turn ends → counter decreases to 2
      shield.remainingTurns = 2;
      expect(ShieldCard.getRemainingTurns(shield)).toBe(2);

      // Player 1's turn ends → counter decreases to 1
      shield.remainingTurns = 1;
      expect(ShieldCard.getRemainingTurns(shield)).toBe(1);

      // Player 2's turn ends → Shield expires and is removed (counter reaches 0)
      shield.remainingTurns = 0;
      expect(ShieldCard.getRemainingTurns(shield)).toBe(0);
    });
  });

  describe('Shield Protection - Wind Card', () => {
    let windCard;

    beforeEach(() => {
      windCard = new WindCard('wind1');
      // Activate shield for player1
      shieldCard.executeEffect(mockGameState, player1Id);
    });

    it('should protect player tiles from Wind card', () => {
      expect(() => {
        windCard.executeEffect(mockGameState, 1, player2Id);
      }).toThrow("Opponent is protected by Shield");
    });

    it('should not protect opponent tiles from Wind card', () => {
      const result = windCard.executeEffect(mockGameState, 2, player1Id);

      expect(result.type).toBe('wind');
      expect(result.removedHeart).toBeDefined();
      expect(result.targetedPlayerId).toBe(player2Id);
    });

    it('should allow Wind card on unprotected player tiles', () => {
      // Remove shield protection by setting remainingTurns to 0
      mockGameState.shields[player1Id].remainingTurns = 0;

      const result = windCard.executeEffect(mockGameState, 1, player2Id);

      expect(result.type).toBe('wind');
      expect(result.removedHeart.placedBy).toBe(player1Id);
    });
  });

  describe('Shield Protection - Recycle Card', () => {
    let recycleCard;

    beforeEach(() => {
      recycleCard = new RecycleCard('recycle1');
      // Activate shield for player1
      shieldCard.executeEffect(mockGameState, player1Id);
    });

    it('should protect all tiles from Recycle card when shielded player has hearts on board', () => {
      // Recycle can't target tile 1 because it has a heart (fails basic targeting)
      expect(() => {
        recycleCard.executeEffect(mockGameState, 1);
      }).toThrow("Invalid target for Recycle card");

      // Recycle can target empty tiles based on basic rules, but shield blocks it
      expect(() => {
        recycleCard.executeEffect(mockGameState, 3);
      }).toThrow("Tile is protected by Shield");
    });

    it('should allow Recycle card on empty tiles when no shielded player has hearts', () => {
      // Remove player1's hearts from the board
      mockGameState.tiles[0].placedHeart = null;
      // Only tile 0 has a player1 heart initially

      const result = recycleCard.executeEffect(mockGameState, 3);

      expect(result.type).toBe('recycle');
      expect(result.newColor).toBe('white');
    });

    it('should still enforce basic Recycle targeting rules even with shield active', () => {
      // Can't target white tiles
      expect(() => {
        recycleCard.executeEffect(mockGameState, 4); // white tile
      }).toThrow("Invalid target for Recycle card");

      // Can't target tiles with hearts (basic rule)
      expect(() => {
        recycleCard.executeEffect(mockGameState, 2); // opponent's heart
      }).toThrow("Invalid target for Recycle card");
    });
  });

  describe('Shield Utility Methods', () => {
    it('should correctly check if player is protected', () => {
      expect(ShieldCard.isPlayerProtected(mockGameState, player1Id, 1)).toBe(false);

      shieldCard.executeEffect(mockGameState, player1Id);
      expect(ShieldCard.isPlayerProtected(mockGameState, player1Id, 1)).toBe(true);

      // Shield expires when remainingTurns reaches 0
      mockGameState.shields[player1Id].remainingTurns = 0;
      expect(ShieldCard.isPlayerProtected(mockGameState, player1Id, 1)).toBe(false);
    });

    it('should correctly check if tile is protected', () => {
      const protectedTile = mockGameState.tiles[0]; // Player1's heart
      const opponentTile = mockGameState.tiles[1]; // Player2's heart
      const emptyTile = mockGameState.tiles[2]; // Empty tile

      expect(ShieldCard.isTileProtected(mockGameState, protectedTile, 1)).toBe(false);
      expect(ShieldCard.isTileProtected(mockGameState, opponentTile, 1)).toBe(false);
      expect(ShieldCard.isTileProtected(mockGameState, emptyTile, 1)).toBe(false);

      shieldCard.executeEffect(mockGameState, player1Id);

      expect(ShieldCard.isTileProtected(mockGameState, protectedTile, 1)).toBe(true);
      expect(ShieldCard.isTileProtected(mockGameState, opponentTile, 1)).toBe(false);
      expect(ShieldCard.isTileProtected(mockGameState, emptyTile, 1)).toBe(false);
    });

    it('should correctly check shield replacement rules', () => {
      // Player1 activates shield
      shieldCard.executeEffect(mockGameState, player1Id);

      // Player2 should not be able to replace Player1's shield
      expect(ShieldCard.canReplaceShield(mockGameState, player1Id)).toBe(false);

      // But should be able to activate their own shield after Player1's expires
      mockGameState.shields[player1Id].remainingTurns = 0;
      expect(ShieldCard.canReplaceShield(mockGameState, player1Id)).toBe(true);
    });

    it('should correctly check activation conditions', () => {
      // Normal activation should work
      let check = ShieldCard.canActivateShield(mockGameState, player1Id);
      expect(check.canActivate).toBe(true);
      expect(check.reason).toBe(null);

      // Player2 activates shield
      shieldCard.executeEffect(mockGameState, player2Id);

      // Player1 should not be able to activate shield
      check = ShieldCard.canActivateShield(mockGameState, player1Id);
      expect(check.canActivate).toBe(false);
      expect(check.reason).toContain("Cannot activate Shield while opponent has active Shield");
    });
  });

  describe('Shield Card Integration', () => {
    it('should work with card factory function', () => {
      const factoryShield = createCardFromData({
        id: 'factory-shield',
        type: 'shield'
      });

      expect(factoryShield).toBeInstanceOf(ShieldCard);
      expect(factoryShield.type).toBe('shield');
      expect(factoryShield.emoji).toBe('🛡️');
    });

    it('should handle edge cases gracefully', () => {
      // Invalid shield data
      expect(ShieldCard.isActive(null)).toBe(false);
      expect(ShieldCard.isActive(undefined)).toBe(false);
      expect(ShieldCard.getRemainingTurns(null)).toBe(0);
      expect(ShieldCard.getRemainingTurns(undefined)).toBe(0);

      // Empty game state
      expect(ShieldCard.isPlayerProtected({}, player1Id, 1)).toBe(false);
      expect(ShieldCard.isTileProtected({}, mockGameState.tiles[0], 1)).toBe(false);
    });
  });

  describe('Shield Card State Management', () => {
    it('should properly initialize shields object if missing', () => {
      const gameStateWithoutShields = { turnCount: 1 };
      shieldCard.executeEffect(gameStateWithoutShields, player1Id);

      expect(gameStateWithoutShields.shields).toBeDefined();
      expect(gameStateWithoutShields.shields[player1Id]).toBeDefined();
    });

    it('should track shield activation metadata', () => {
      const result = shieldCard.executeEffect(mockGameState, player1Id);
      const shield = mockGameState.shields[player1Id];

      expect(shield.activatedAt).toBeTypeOf('number');
      expect(shield.activatedBy).toBe(player1Id);
      expect(shield.remainingTurns).toBe(2);
      expect(shield.protectedPlayerId).toBe(player1Id);
      expect(Date.now() - shield.activatedAt).toBeLessThan(1000); // Activated recently
    });
  });
});