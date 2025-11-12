import { describe, it, expect } from 'vitest';
import { createMockRoom } from './setup.js';
import { recordCardDraw } from '../utils/server-test-utils.js';

describe('recordCardDraw Integration Tests', () => {
  it('should record heart card draw for player', () => {
    const room = createMockRoom('TEST01');
    const userId = 'player-1';

    // Initially no playerActions
    expect(room.gameState.playerActions).toEqual({});

    recordCardDraw(room, userId, 'heart');

    // Verify heart draw recorded
    expect(room.gameState.playerActions[userId]).toEqual({
      drawnHeart: true,
      drawnMagic: false,
      heartsPlaced: 0,
      magicCardsUsed: 0
    });
  });

  it('should record magic card draw for player', () => {
    const room = createMockRoom('TEST02');
    const userId = 'player-1';

    recordCardDraw(room, userId, 'magic');

    expect(room.gameState.playerActions[userId]).toEqual({
      drawnHeart: false,
      drawnMagic: true,
      heartsPlaced: 0,
      magicCardsUsed: 0
    });
  });

  it('should preserve existing action counts when recording draws', () => {
    const room = createMockRoom('TEST03');
    const userId = 'player-1';

    // Manually set some existing actions
    room.gameState.playerActions[userId] = {
      drawnHeart: false,
      drawnMagic: false,
      heartsPlaced: 1,
      magicCardsUsed: 1
    };

    recordCardDraw(room, userId, 'heart');

    expect(room.gameState.playerActions[userId]).toEqual({
      drawnHeart: true,
      drawnMagic: false,
      heartsPlaced: 1,
      magicCardsUsed: 1
    });
  });

  it('should handle multiple draws for same player', () => {
    const room = createMockRoom('TEST04');
    const userId = 'player-1';

    recordCardDraw(room, userId, 'heart');
    recordCardDraw(room, userId, 'magic');

    expect(room.gameState.playerActions[userId]).toEqual({
      drawnHeart: true,
      drawnMagic: true,
      heartsPlaced: 0,
      magicCardsUsed: 0
    });
  });

  it('should handle invalid card types gracefully', () => {
    const room = createMockRoom('TEST05');
    const userId = 'player-1';

    recordCardDraw(room, userId, 'invalid');

    // Should not set any draw flags for invalid card type
    expect(room.gameState.playerActions[userId]).toEqual({
      drawnHeart: false,
      drawnMagic: false,
      heartsPlaced: 0,
      magicCardsUsed: 0
    });
  });
});