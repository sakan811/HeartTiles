import { describe, it, expect, beforeEach } from 'vitest';

describe('Magic Card Usage Limits', () => {
  let mockRoom;
  let userId;

  beforeEach(() => {
    userId = 'test-user';
    mockRoom = {
      gameState: {
        playerActions: {}
      }
    };
  });

  // Simulate the functions from server.js
  function canUseMoreMagicCards(room, userId) {
    const playerActions = room.gameState.playerActions[userId] || { magicCardsUsed: 0 };
    return (playerActions.magicCardsUsed || 0) < 1;
  }

  function recordMagicCardUsage(room, userId) {
    if (!room.gameState.playerActions) {
      room.gameState.playerActions = {};
    }

    if (!room.gameState.playerActions[userId]) {
      room.gameState.playerActions[userId] = {
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0
      };
    }

    room.gameState.playerActions[userId].magicCardsUsed = (room.gameState.playerActions[userId].magicCardsUsed || 0) + 1;
  }

  function resetPlayerActions(room, userId) {
    if (!room.gameState.playerActions) {
      room.gameState.playerActions = {};
    }
    room.gameState.playerActions[userId] = {
      drawnHeart: false,
      drawnMagic: false,
      heartsPlaced: 0,
      magicCardsUsed: 0
    };
  }

  it('should allow using 1 magic card per turn', () => {
    // Initially player should be able to use magic cards
    expect(canUseMoreMagicCards(mockRoom, userId)).toBe(true);

    // After using 1 magic card, should not be able to use another
    recordMagicCardUsage(mockRoom, userId);
    expect(canUseMoreMagicCards(mockRoom, userId)).toBe(false);
  });

  it('should reset magic card usage limit after turn ends', () => {
    // Use a magic card
    recordMagicCardUsage(mockRoom, userId);
    expect(canUseMoreMagicCards(mockRoom, userId)).toBe(false);

    // Reset actions (end turn)
    resetPlayerActions(mockRoom, userId);
    expect(canUseMoreMagicCards(mockRoom, userId)).toBe(true);
  });

  it('should handle multiple players independently', () => {
    const userId2 = 'test-user-2';

    // Player 1 uses a magic card
    recordMagicCardUsage(mockRoom, userId);
    expect(canUseMoreMagicCards(mockRoom, userId)).toBe(false);

    // Player 2 should still be able to use magic cards
    expect(canUseMoreMagicCards(mockRoom, userId2)).toBe(true);
  });

  it('should handle missing player actions gracefully', () => {
    expect(canUseMoreMagicCards(mockRoom, 'non-existent-user')).toBe(true);
  });

  it('should allow exactly 1 magic card usage per turn', () => {
    // Start with no usage
    expect(canUseMoreMagicCards(mockRoom, userId)).toBe(true);

    // Use 1 magic card
    recordMagicCardUsage(mockRoom, userId);
    expect(mockRoom.gameState.playerActions[userId].magicCardsUsed).toBe(1);

    // Should not allow more
    expect(canUseMoreMagicCards(mockRoom, userId)).toBe(false);
  });

  it('should correctly track magic card usage count', () => {
    // Use magic card multiple times (should be prevented by game logic)
    recordMagicCardUsage(mockRoom, userId);
    recordMagicCardUsage(mockRoom, userId);
    recordMagicCardUsage(mockRoom, userId);

    // Should track the count correctly even if used multiple times
    expect(mockRoom.gameState.playerActions[userId].magicCardsUsed).toBe(2);
    expect(canUseMoreMagicCards(mockRoom, userId)).toBe(false);
  });
});