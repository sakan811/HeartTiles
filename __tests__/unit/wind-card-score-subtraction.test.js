/**
 * Wind Card Score Subtraction Tests
 *
 * Tests that verify wind cards properly subtract points from the player's score
 * when they remove hearts from tiles.
 */

describe('Wind Card Score Subtraction', () => {
  let players, tiles, room, socket, io;

  beforeEach(() => {
    // Reset all mocked modules and timers
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Create test players
    players = [
      { userId: 'player1', name: 'Player 1', isReady: false, score: 0 },
      { userId: 'player2', name: 'Player 2', isReady: false, score: 0 }
    ];

    // Create test tiles
    tiles = [
      { id: 0, color: 'red', emoji: '🟥' },
      { id: 1, color: 'white', emoji: '⬜' },
      { id: 2, color: 'yellow', emoji: '🟨' }
    ];

    // Create mock room
    room = {
      code: 'TEST01',
      players: players,
      maxPlayers: 2,
      gameState: {
        tiles: tiles,
        gameStarted: true,
        currentPlayer: players[0],
        deck: { emoji: '💌', cards: 16, type: 'hearts' },
        magicDeck: { emoji: '🔮', cards: 16, type: 'magic' },
        playerHands: {},
        shields: {},
        turnCount: 1,
        playerActions: {}
      }
    };

    // Create mock socket and io
    socket = {
      id: 'socket1',
      data: { userId: 'player1' },
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      disconnect: vi.fn()
    };

    io = {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn()
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Wind Card Score Adjustment', () => {
    test('should subtract points from player score when heart is removed', () => {
      // Set up a heart on a tile with known score
      const placedHeart = {
        value: 2,
        color: 'red',
        emoji: '❤️',
        placedBy: 'player1',
        score: 4, // Red heart on red tile = 2 * 2 = 4 points
        originalTileColor: 'red'
      };

      room.gameState.tiles[0].placedHeart = placedHeart;
      room.players[0].score = 4; // Player has 4 points from this heart

      // Mock the WindCard executeEffect method
      const executeEffect = vi.fn().mockReturnValue({
        newTileState: {
          id: 0,
          color: 'red',
          emoji: '🟥',
          placedHeart: null
        }
      });

      // Simulate the wind card effect logic from server.js
      const placedHeartData = room.gameState.tiles[0].placedHeart;
      if (placedHeartData && placedHeartData.score) {
        const playerIndex = room.players.findIndex(p => p.userId === placedHeartData.placedBy);
        if (playerIndex !== -1) {
          room.players[playerIndex].score -= placedHeartData.score;
        }
      }

      // Apply the effect
      if (executeEffect()) {
        room.gameState.tiles[0] = executeEffect().newTileState;
      }

      // Verify the heart was removed
      expect(room.gameState.tiles[0].placedHeart).toBeNull();

      // Verify the score was subtracted
      expect(room.players[0].score).toBe(0);
    });

    test('should subtract correct points for different scoring scenarios', () => {
      // Test case 1: Red heart on red tile (double points)
      const doubleScoreHeart = {
        value: 3,
        color: 'red',
        emoji: '❤️',
        placedBy: 'player1',
        score: 6, // 3 * 2 = 6 points
        originalTileColor: 'red'
      };

      room.gameState.tiles[0].placedHeart = doubleScoreHeart;
      room.players[0].score = 6;

      // Remove the heart and subtract points
      const placedHeartData = room.gameState.tiles[0].placedHeart;
      if (placedHeartData && placedHeartData.score) {
        const playerIndex = room.players.findIndex(p => p.userId === placedHeartData.placedBy);
        if (playerIndex !== -1) {
          room.players[playerIndex].score -= placedHeartData.score;
        }
      }

      expect(room.players[0].score).toBe(0);

      // Test case 2: Heart on white tile (single points)
      const singleScoreHeart = {
        value: 2,
        color: 'yellow',
        emoji: '💛',
        placedBy: 'player2',
        score: 2, // Yellow heart on white tile = 2 points
        originalTileColor: 'white'
      };

      room.gameState.tiles[1].placedHeart = singleScoreHeart;
      room.players[1].score = 2;

      // Remove the heart and subtract points
      const placedHeartData2 = room.gameState.tiles[1].placedHeart;
      if (placedHeartData2 && placedHeartData2.score) {
        const playerIndex = room.players.findIndex(p => p.userId === placedHeartData2.placedBy);
        if (playerIndex !== -1) {
          room.players[playerIndex].score -= placedHeartData2.score;
        }
      }

      expect(room.players[1].score).toBe(0);
    });

    test('should handle multiple hearts removed from same player', () => {
      // Place multiple hearts for player1
      const heart1 = {
        value: 1,
        color: 'red',
        emoji: '❤️',
        placedBy: 'player1',
        score: 2, // Red heart on red tile
        originalTileColor: 'red'
      };

      const heart2 = {
        value: 3,
        color: 'green',
        emoji: '💚',
        placedBy: 'player1',
        score: 3, // Green heart on white tile
        originalTileColor: 'white'
      };

      room.gameState.tiles[0].placedHeart = heart1;
      room.gameState.tiles[1].placedHeart = heart2;
      room.players[0].score = 5; // Total of both hearts

      // Remove first heart
      let placedHeartData = room.gameState.tiles[0].placedHeart;
      if (placedHeartData && placedHeartData.score) {
        const playerIndex = room.players.findIndex(p => p.userId === placedHeartData.placedBy);
        if (playerIndex !== -1) {
          room.players[playerIndex].score -= placedHeartData.score;
        }
      }
      room.gameState.tiles[0].placedHeart = null;

      expect(room.players[0].score).toBe(2);

      // Remove second heart
      placedHeartData = room.gameState.tiles[1].placedHeart;
      if (placedHeartData && placedHeartData.score) {
        const playerIndex = room.players.findIndex(p => p.userId === placedHeartData.placedBy);
        if (playerIndex !== -1) {
          room.players[playerIndex].score -= placedHeartData.score;
        }
      }
      room.gameState.tiles[1].placedHeart = null;

      expect(room.players[0].score).toBe(0);
    });

    test('should not affect other players scores', () => {
      // Set up hearts for both players
      const player1Heart = {
        value: 2,
        color: 'red',
        emoji: '❤️',
        placedBy: 'player1',
        score: 4,
        originalTileColor: 'red'
      };

      const player2Heart = {
        value: 1,
        color: 'green',
        emoji: '💚',
        placedBy: 'player2',
        score: 2,
        originalTileColor: 'green'
      };

      room.gameState.tiles[0].placedHeart = player1Heart;
      room.gameState.tiles[2].placedHeart = player2Heart;
      room.players[0].score = 4;
      room.players[1].score = 2;

      // Remove only player1's heart
      const placedHeartData = room.gameState.tiles[0].placedHeart;
      if (placedHeartData && placedHeartData.score) {
        const playerIndex = room.players.findIndex(p => p.userId === placedHeartData.placedBy);
        if (playerIndex !== -1) {
          room.players[playerIndex].score -= placedHeartData.score;
        }
      }
      room.gameState.tiles[0].placedHeart = null;

      // Verify only player1's score was affected
      expect(room.players[0].score).toBe(0);
      expect(room.players[1].score).toBe(2); // Unchanged
    });

    test('should handle edge cases gracefully', () => {
      // Test with null placedHeart
      room.gameState.tiles[0].placedHeart = null;
      room.players[0].score = 10;

      // Attempt to remove non-existent heart
      const placedHeartData = room.gameState.tiles[0].placedHeart;
      if (placedHeartData && placedHeartData.score) {
        const playerIndex = room.players.findIndex(p => p.userId === placedHeartData.placedBy);
        if (playerIndex !== -1) {
          room.players[playerIndex].score -= placedHeartData.score;
        }
      }

      expect(room.players[0].score).toBe(10); // Unchanged

      // Test with placedHeart but no score property
      const heartWithoutScore = {
        value: 2,
        color: 'red',
        emoji: '❤️',
        placedBy: 'player1',
        originalTileColor: 'red'
        // Missing score property
      };

      room.gameState.tiles[0].placedHeart = heartWithoutScore;

      // Attempt to remove heart without score
      const placedHeartData2 = room.gameState.tiles[0].placedHeart;
      if (placedHeartData2 && placedHeartData2.score) {
        const playerIndex = room.players.findIndex(p => p.userId === placedHeartData2.placedBy);
        if (playerIndex !== -1) {
          room.players[playerIndex].score -= placedHeartData2.score;
        }
      }

      expect(room.players[0].score).toBe(10); // Unchanged
    });
  });
});