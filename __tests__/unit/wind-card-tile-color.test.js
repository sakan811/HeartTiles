import { describe, it, expect, beforeEach } from 'vitest';
import { WindCard, HeartCard, createCardFromData } from '../../src/lib/cards.js';

describe('Wind Card - Tile Color Restoration', () => {
  let mockGameState;
  let player1Id, player2Id;
  let windCard;

  beforeEach(() => {
    player1Id = 'player1';
    player2Id = 'player2';
    windCard = new WindCard('wind1');

    mockGameState = {
      turnCount: 1,
      tiles: [
        {
          id: 1,
          color: 'white', // After heart placement, tile shows heart color (red on white tile = white)
          emoji: '⬜', // After heart placement, tile shows tile emoji (not heart emoji)
          placedHeart: {
            color: 'red',
            value: 2,
            emoji: '❤️',
            placedBy: player2Id,
            originalTileColor: 'white' // Original tile before heart was white
          }
        },
        {
          id: 2,
          color: 'yellow', // After heart placement, tile shows heart color
          emoji: '🟨', // After heart placement, tile shows tile emoji (not heart emoji)
          placedHeart: {
            color: 'red',
            value: 3,
            emoji: '❤️',
            placedBy: player2Id,
            originalTileColor: 'yellow' // Original tile before heart was yellow
          }
        },
        {
          id: 3,
          color: 'green', // After heart placement, tile shows heart color
          emoji: '🟩', // After heart placement, tile shows tile emoji (not heart emoji)
          placedHeart: {
            color: 'yellow',
            value: 1,
            emoji: '💛',
            placedBy: player2Id,
            originalTileColor: 'green' // Original tile before heart was green
          }
        },
        {
          id: 4,
          color: 'red', // After heart placement, tile shows heart color
          emoji: '🟥', // After heart placement, tile shows tile emoji (not heart emoji)
          placedHeart: {
            color: 'green',
            value: 2,
            emoji: '💚',
            placedBy: player2Id,
            originalTileColor: 'red' // Original tile before heart was red
          }
        }
      ],
      shields: {}
    };
  });

  describe('Tile Color Restoration Logic', () => {
    it('should restore tile to original white color when removing red heart', () => {
      const targetTileId = 1;
      const targetTile = mockGameState.tiles.find(t => t.id === targetTileId);

      // Verify initial state - tile is white (red heart on white tile = white)
      expect(targetTile.color).toBe('white');
      expect(targetTile.placedHeart.originalTileColor).toBe('white');

      // Execute Wind card effect
      const result = windCard.executeEffect(mockGameState, targetTileId, player1Id);

      // Verify tile is restored to original white color
      expect(result.newTileState.color).toBe('white');
      expect(result.newTileState.emoji).toBe('⬜');
      expect(result.newTileState.placedHeart).toBeUndefined();
      expect(result.removedHeart).toBeDefined();
      expect(result.removedHeart.color).toBe('red');
    });

    it('should restore tile to original yellow color when removing red heart', () => {
      const targetTileId = 2;
      const targetTile = mockGameState.tiles.find(t => t.id === targetTileId);

      // Verify initial state - tile is yellow (red heart on yellow tile = yellow)
      expect(targetTile.color).toBe('yellow');
      expect(targetTile.placedHeart.originalTileColor).toBe('yellow');

      // Execute Wind card effect
      const result = windCard.executeEffect(mockGameState, targetTileId, player1Id);

      // Verify tile is restored to original yellow color
      expect(result.newTileState.color).toBe('yellow');
      expect(result.newTileState.emoji).toBe('🟨');
      expect(result.newTileState.placedHeart).toBeUndefined();
      expect(result.removedHeart).toBeDefined();
      expect(result.removedHeart.color).toBe('red');
    });

    it('should restore tile to original green color when removing yellow heart', () => {
      const targetTileId = 3;
      const targetTile = mockGameState.tiles.find(t => t.id === targetTileId);

      // Verify initial state - tile is green (yellow heart on green tile = green)
      expect(targetTile.color).toBe('green');
      expect(targetTile.placedHeart.originalTileColor).toBe('green');

      // Execute Wind card effect
      const result = windCard.executeEffect(mockGameState, targetTileId, player1Id);

      // Verify tile is restored to original green color
      expect(result.newTileState.color).toBe('green');
      expect(result.newTileState.emoji).toBe('🟩');
      expect(result.newTileState.placedHeart).toBeUndefined();
      expect(result.removedHeart).toBeDefined();
      expect(result.removedHeart.color).toBe('yellow');
    });

    it('should restore tile to original red color when removing green heart', () => {
      const targetTileId = 4;
      const targetTile = mockGameState.tiles.find(t => t.id === targetTileId);

      // Verify initial state - tile is red (green heart on red tile = red)
      expect(targetTile.color).toBe('red');
      expect(targetTile.placedHeart.originalTileColor).toBe('red');

      // Execute Wind card effect
      const result = windCard.executeEffect(mockGameState, targetTileId, player1Id);

      // Verify tile is restored to original red color
      expect(result.newTileState.color).toBe('red');
      expect(result.newTileState.emoji).toBe('🟥');
      expect(result.newTileState.placedHeart).toBeUndefined();
      expect(result.removedHeart).toBeDefined();
      expect(result.removedHeart.color).toBe('green');
    });

    it('should handle case where originalTileColor is not stored (fallback to current color)', () => {
      const targetTileId = 1;
      const targetTile = mockGameState.tiles.find(t => t.id === targetTileId);

      // Remove originalTileColor to test fallback behavior
      delete targetTile.placedHeart.originalTileColor;

      // Execute Wind card effect
      const result = windCard.executeEffect(mockGameState, targetTileId, player1Id);

      // Should fallback to current tile color
      expect(result.newTileState.color).toBe('white');
      expect(result.newTileState.emoji).toBe('⬜');
      expect(result.newTileState.placedHeart).toBeUndefined();
    });
  });

  describe('Wind Card Validation', () => {
    it('should only target opponent hearts', () => {
      // Player 1 should not be able to target their own heart
      const player1Tile = {
        id: 5,
        color: 'blue',
        emoji: '🟦',
        placedHeart: {
          color: 'blue',
          value: 2,
          emoji: '💙',
          placedBy: player1Id
        }
      };
      mockGameState.tiles.push(player1Tile);

      expect(() => {
        windCard.executeEffect(mockGameState, 5, player1Id);
      }).toThrow('Invalid target for Wind card');
    });

    it('should not target empty tiles', () => {
      const emptyTile = { id: 6, color: 'white', emoji: '⬜', placedHeart: null };
      mockGameState.tiles.push(emptyTile);

      expect(() => {
        windCard.executeEffect(mockGameState, 6, player1Id);
      }).toThrow('Invalid target for Wind card');
    });
  });
});