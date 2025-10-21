import { describe, it, expect, beforeEach } from 'vitest';

// Mock server functions for testing
function checkGameEndConditions(room, allowDeckEmptyGracePeriod = true) {
  if (!room?.gameState?.gameStarted) return { shouldEnd: false, reason: null };

  // Condition 1: All tiles are filled (have hearts)
  const allTilesFilled = room.gameState.tiles.every(tile => tile.placedHeart);
  if (allTilesFilled) {
    return { shouldEnd: true, reason: "All tiles are filled" };
  }

  // Condition 2: Any deck is empty
  const heartDeckEmpty = room.gameState.deck.cards <= 0;
  const magicDeckEmpty = room.gameState.magicDeck.cards <= 0;
  const anyDeckEmpty = heartDeckEmpty || magicDeckEmpty;

  // If grace period is allowed, don't end game immediately when deck becomes empty
  // This allows the current player to finish their turn
  if (anyDeckEmpty && !allowDeckEmptyGracePeriod) {
    if (heartDeckEmpty && magicDeckEmpty) {
      return { shouldEnd: true, reason: "Both decks are empty" };
    } else {
      const emptyDeck = heartDeckEmpty ? "Heart" : "Magic";
      return { shouldEnd: true, reason: `${emptyDeck} deck is empty` };
    }
  }

  return { shouldEnd: false, reason: null };
}

describe('Deck Empty Game End Rules', () => {
  let mockRoom;

  beforeEach(() => {
    mockRoom = {
      gameState: {
        gameStarted: true,
        tiles: [
          { id: 1, color: 'red', emoji: '🟥', placedHeart: null },
          { id: 2, color: 'yellow', emoji: '🟨', placedHeart: { color: 'red', value: 2, emoji: '❤️', placedBy: 'player1' } },
          { id: 3, color: 'green', emoji: '🟩', placedHeart: null },
          { id: 4, color: 'white', emoji: '⬜', placedHeart: { color: 'yellow', value: 1, emoji: '💛', placedBy: 'player2' } },
          { id: 5, color: 'red', emoji: '🟥', placedHeart: null },
          { id: 6, color: 'yellow', emoji: '🟨', placedHeart: null },
          { id: 7, color: 'green', emoji: '🟩', placedHeart: null },
          { id: 8, color: 'white', emoji: '⬜', placedHeart: null }
        ],
        deck: { emoji: '💌', cards: 10, } emoji: '💌', }
        magicDeck: { emoji: '🔮', cards: 10, } emoji: '🔮', type: 'magic' }
      }
    };
  });

  describe('Grace Period Behavior', () => {
    it('should not end game when deck becomes empty during card draw (grace period)', () => {
      // Simulate heart deck becoming empty
      mockRoom.gameState.deck.cards = 0;
      mockRoom.gameState.magicDeck.cards = 5;

      // With grace period (during card draw), game should not end
      const result = checkGameEndConditions(mockRoom, true);
      expect(result.shouldEnd).toBe(false);
      expect(result.reason).toBe(null);
    });

    it('should not end game when magic deck becomes empty during card draw (grace period)', () => {
      // Simulate magic deck becoming empty
      mockRoom.gameState.deck.cards = 5;
      mockRoom.gameState.magicDeck.cards = 0;

      // With grace period (during card draw), game should not end
      const result = checkGameEndConditions(mockRoom, true);
      expect(result.shouldEnd).toBe(false);
      expect(result.reason).toBe(null);
    });

    it('should not end game when both decks become empty during card draw (grace period)', () => {
      // Simulate both decks becoming empty
      mockRoom.gameState.deck.cards = 0;
      mockRoom.gameState.magicDeck.cards = 0;

      // With grace period (during card draw), game should not end
      const result = checkGameEndConditions(mockRoom, true);
      expect(result.shouldEnd).toBe(false);
      expect(result.reason).toBe(null);
    });
  });

  describe('Turn End Behavior', () => {
    it('should end game when heart deck is empty after player finishes turn', () => {
      // Simulate heart deck becoming empty
      mockRoom.gameState.deck.cards = 0;
      mockRoom.gameState.magicDeck.cards = 5;

      // Without grace period (after turn end), game should end
      const result = checkGameEndConditions(mockRoom, false);
      expect(result.shouldEnd).toBe(true);
      expect(result.reason).toBe("Heart deck is empty");
    });

    it('should end game when magic deck is empty after player finishes turn', () => {
      // Simulate magic deck becoming empty
      mockRoom.gameState.deck.cards = 5;
      mockRoom.gameState.magicDeck.cards = 0;

      // Without grace period (after turn end), game should end
      const result = checkGameEndConditions(mockRoom, false);
      expect(result.shouldEnd).toBe(true);
      expect(result.reason).toBe("Magic deck is empty");
    });

    it('should end game when both decks are empty after player finishes turn', () => {
      // Simulate both decks becoming empty
      mockRoom.gameState.deck.cards = 0;
      mockRoom.gameState.magicDeck.cards = 0;

      // Without grace period (after turn end), game should end
      const result = checkGameEndConditions(mockRoom, false);
      expect(result.shouldEnd).toBe(true);
      expect(result.reason).toBe("Both decks are empty");
    });

    it('should not end game when decks have cards after turn ends', () => {
      // Both decks have cards
      mockRoom.gameState.deck.cards = 3;
      mockRoom.gameState.magicDeck.cards = 2;

      // Without grace period, game should not end
      const result = checkGameEndConditions(mockRoom, false);
      expect(result.shouldEnd).toBe(false);
      expect(result.reason).toBe(null);
    });
  });

  describe('Other Game End Conditions', () => {
    it('should end game when all tiles are filled', () => {
      // Fill all tiles with hearts
      mockRoom.gameState.tiles = mockRoom.gameState.tiles.map((tile, index) => ({
        ...tile,
        placedHeart: {
          color: index % 3 === 0 ? 'red' : index % 3 === 1 ? 'yellow' : 'green',
          value: Math.floor(Math.random() * 3) + 1,
          emoji: index % 3 === 0 ? '❤️' : index % 3 === 1 ? '💛' : '💚',
          placedBy: index % 2 === 0 ? 'player1' : 'player2'
        }
      }));

      // Game should end regardless of deck state
      const result = checkGameEndConditions(mockRoom, false);
      expect(result.shouldEnd).toBe(true);
      expect(result.reason).toBe("All tiles are filled");
    });

    it('should not end game when game is not started', () => {
      mockRoom.gameState.gameStarted = false;

      const result = checkGameEndConditions(mockRoom, false);
      expect(result.shouldEnd).toBe(false);
      expect(result.reason).toBe(null);
    });
  });

  describe('Deck State Edge Cases', () => {
    it('should handle negative deck count as empty', () => {
      mockRoom.gameState.deck.cards = -1;
      mockRoom.gameState.magicDeck.cards = 5;

      const result = checkGameEndConditions(mockRoom, false);
      expect(result.shouldEnd).toBe(true);
      expect(result.reason).toBe("Heart deck is empty");
    });

    it('should handle zero deck count correctly', () => {
      mockRoom.gameState.deck.cards = 0;
      mockRoom.gameState.magicDeck.cards = 0;

      const result = checkGameEndConditions(mockRoom, false);
      expect(result.shouldEnd).toBe(true);
      expect(result.reason).toBe("Both decks are empty");
    });
  });
});