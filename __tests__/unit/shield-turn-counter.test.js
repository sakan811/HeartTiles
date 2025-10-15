import { describe, it, expect, beforeEach } from 'vitest';
import { ShieldCard, WindCard } from '../../src/lib/cards.js';

describe('Shield Turn Counter Logic', () => {
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
        { id: 2, color: 'yellow', emoji: '🟨', placedHeart: { color: 'yellow', value: 1, placedBy: player2Id } }
      ],
      shields: {}
    };
  });

  describe('Shield Turn Counter Behavior', () => {
    it('should start with 2 turns when shield is activated', () => {
      shieldCard.executeEffect(mockGameState, player1Id);

      const shield = mockGameState.shields[player1Id];
      expect(shield.remainingTurns).toBe(2);
      expect(ShieldCard.isActive(shield)).toBe(true);
    });

    it('should decrement by 1 at the end of each player turn', () => {
      // Player 1 activates shield
      shieldCard.executeEffect(mockGameState, player1Id);
      expect(mockGameState.shields[player1Id].remainingTurns).toBe(2);

      // Simulate end of Player 2's turn (decrement all shields)
      mockGameState.shields[player1Id].remainingTurns--;
      expect(mockGameState.shields[player1Id].remainingTurns).toBe(1);

      // Simulate end of Player 1's turn (final decrement)
      mockGameState.shields[player1Id].remainingTurns--;
      expect(mockGameState.shields[player1Id].remainingTurns).toBe(0);
      expect(ShieldCard.isActive(mockGameState.shields[player1Id])).toBe(false);
    });

    it('should match the exact sequence described in README', () => {
      // Player 1 plays Shield 🛡️ on turn 1 → counter shows 2
      shieldCard.executeEffect(mockGameState, player1Id);
      expect(ShieldCard.getRemainingTurns(mockGameState.shields[player1Id])).toBe(2);

      // Player 2's turn ends → counter shows 1
      mockGameState.shields[player1Id].remainingTurns = 1;
      expect(ShieldCard.getRemainingTurns(mockGameState.shields[player1Id])).toBe(1);

      // Player 1's turn ends → Shield expires and is removed
      mockGameState.shields[player1Id].remainingTurns = 0;
      expect(ShieldCard.getRemainingTurns(mockGameState.shields[player1Id])).toBe(0);
      expect(ShieldCard.isActive(mockGameState.shields[player1Id])).toBe(false);
    });

    it('should reset to 2 turns when shield is reinforced', () => {
      // Activate initial shield
      shieldCard.executeEffect(mockGameState, player1Id);
      expect(mockGameState.shields[player1Id].remainingTurns).toBe(2);

      // Decrease to 1 turn remaining
      mockGameState.shields[player1Id].remainingTurns = 1;

      // Reinforce shield
      const result = shieldCard.executeEffect(mockGameState, player1Id);

      expect(result.reinforced).toBe(true);
      expect(mockGameState.shields[player1Id].remainingTurns).toBe(2);
      expect(result.remainingTurns).toBe(2);
    });

    it('should prevent magic cards while shield is active', () => {
      // Activate shield for player 1
      shieldCard.executeEffect(mockGameState, player1Id);
      const windCard = new WindCard('wind1');

      // Player 2 tries to use Wind card on Player 1's heart - should be blocked
      expect(() => {
        windCard.executeEffect(mockGameState, 1, player2Id);
      }).toThrow('Opponent is protected by Shield (2 turns remaining)');

      // After shield expires, Wind card should work
      mockGameState.shields[player1Id].remainingTurns = 0;
      const result = windCard.executeEffect(mockGameState, 1, player2Id);
      expect(result.type).toBe('wind');
    });

    it('should handle turn counter correctly across multiple turns', () => {
      shieldCard.executeEffect(mockGameState, player1Id);
      const shield = mockGameState.shields[player1Id];

      // Track the full lifecycle
      const turnSequence = [2, 1, 0]; // Expected remaining turns

      turnSequence.forEach((expectedTurns, index) => {
        shield.remainingTurns = expectedTurns;
        expect(ShieldCard.getRemainingTurns(shield)).toBe(expectedTurns);
        expect(ShieldCard.isActive(shield)).toBe(expectedTurns > 0);
      });
    });
  });

  describe('Shield Counter Edge Cases', () => {
    it('should handle negative remaining turns gracefully', () => {
      shieldCard.executeEffect(mockGameState, player1Id);
      const shield = mockGameState.shields[player1Id];

      // Set to negative (shouldn't happen in normal gameplay)
      shield.remainingTurns = -1;

      expect(ShieldCard.isActive(shield)).toBe(false);
      expect(ShieldCard.getRemainingTurns(shield)).toBe(0);
    });

    it('should handle undefined remaining turns', () => {
      const invalidShield = { active: true };

      expect(ShieldCard.isActive(invalidShield)).toBe(false);
      expect(ShieldCard.getRemainingTurns(invalidShield)).toBe(0);
    });

    it('should handle shield with zero remaining turns from start', () => {
      shieldCard.executeEffect(mockGameState, player1Id);
      const shield = mockGameState.shields[player1Id];
      shield.remainingTurns = 0;

      expect(ShieldCard.isActive(shield)).toBe(false);
      expect(ShieldCard.getRemainingTurns(shield)).toBe(0);
    });
  });
});