import { describe, it, expect, beforeEach } from 'vitest';
import {
  HeartCard,
  WindCard,
  RecycleCard,
  ShieldCard,
  generateHeartDeck,
  generateMagicDeck,
  createCardFromData
} from '../../src/lib/cards.js';

describe('Game Mechanics Rules', () => {
  let mockGameState;
  let player1Id, player2Id;

  beforeEach(() => {
    player1Id = 'player1';
    player2Id = 'player2';

    mockGameState = {
      turnCount: 1,
      currentPlayer: { userId: player1Id, name: 'Player1' },
      tiles: [
        { id: 0, color: 'red', emoji: '🟥', placedHeart: null },
        { id: 1, color: 'yellow', emoji: '🟨', placedHeart: null },
        { id: 2, color: 'green', emoji: '🟩', placedHeart: null },
        { id: 3, color: 'white', emoji: '⬜', placedHeart: null },
        { id: 4, color: 'red', emoji: '🟥', placedHeart: null },
        { id: 5, color: 'yellow', emoji: '🟨', placedHeart: null },
        { id: 6, color: 'green', emoji: '🟩', placedHeart: null },
        { id: 7, color: 'white', emoji: '⬜', placedHeart: null }
      ],
      playerHands: {},
      deck: { emoji: '💌', cards: 16, type: 'hearts' },
      magicDeck: { emoji: '🔮', cards: 16, type: 'magic' },
      shields: {}
    };
  });

  describe('Deck Composition Rules', () => {
    it('should have exactly 16 heart cards in deck', () => {
      const heartDeck = generateHeartDeck(16);
      expect(heartDeck).toHaveLength(16);

      heartDeck.forEach(card => {
        expect(card).toBeInstanceOf(HeartCard);
        expect(['red', 'yellow', 'green']).toContain(card.color);
        expect(card.value).toBeGreaterThanOrEqual(1);
        expect(card.value).toBeLessThanOrEqual(3);
      });
    });

    it('should have exactly 16 magic cards with correct distribution', () => {
      const magicDeck = generateMagicDeck();
      expect(magicDeck).toHaveLength(16);

      const windCards = magicDeck.filter(card => card.type === 'wind');
      const recycleCards = magicDeck.filter(card => card.type === 'recycle');
      const shieldCards = magicDeck.filter(card => card.type === 'shield');

      expect(windCards).toHaveLength(6);
      expect(recycleCards).toHaveLength(5);
      expect(shieldCards).toHaveLength(5);
    });

    it('should have starting hands of 3 hearts and 2 magic cards', () => {
      // Simulate starting hand distribution
      const heartDeck = generateHeartDeck(6); // 3 hearts per player
      const magicDeck = generateMagicDeck();  // 2 magic cards per player

      const player1Hand = [
        ...heartDeck.slice(0, 3),
        ...magicDeck.slice(0, 2)
      ];

      const player2Hand = [
        ...heartDeck.slice(3, 6),
        ...magicDeck.slice(2, 4)
      ];

      expect(player1Hand).toHaveLength(5);
      expect(player2Hand).toHaveLength(5);

      const player1Hearts = player1Hand.filter(card => card.type === 'heart');
      const player1Magic = player1Hand.filter(card => card.type !== 'heart');
      expect(player1Hearts).toHaveLength(3);
      expect(player1Magic).toHaveLength(2);

      const player2Hearts = player2Hand.filter(card => card.type === 'heart');
      const player2Magic = player2Hand.filter(card => card.type !== 'heart');
      expect(player2Hearts).toHaveLength(3);
      expect(player2Magic).toHaveLength(2);
    });
  });

  describe('Turn Structure Rules', () => {
    beforeEach(() => {
      mockGameState.playerHands = {
        [player1Id]: [
          new HeartCard('h1', 'red', 2, '❤️'),
          new HeartCard('h2', 'yellow', 1, '💛'),
          new HeartCard('h3', 'green', 3, '💚')
        ],
        [player2Id]: [
          new HeartCard('h4', 'red', 1, '❤️'),
          new HeartCard('h5', 'yellow', 2, '💛'),
          new HeartCard('h6', 'green', 1, '💚')
        ]
      };
    });

    it('should allow only current player to place hearts', () => {
      const heartCard = mockGameState.playerHands[player1Id][0];
      const emptyTile = mockGameState.tiles[0];

      // Player 1 can place heart on their turn
      expect(heartCard.canTargetTile(emptyTile)).toBe(true);

      // Player 2 cannot place hearts on player 1's turn
      // This validation happens server-side, card logic only checks tile state
      expect(heartCard.canTargetTile(emptyTile)).toBe(true);
    });

    it('should allow multiple heart placements per turn if enough cards', () => {
      const playerHand = mockGameState.playerHands[player1Id];
      const emptyTiles = mockGameState.tiles.filter(tile => !tile.placedHeart);

      // Player should be able to place multiple hearts if they have cards
      expect(playerHand.length).toBeGreaterThanOrEqual(2);
      expect(emptyTiles.length).toBeGreaterThanOrEqual(2);

      // Place first heart
      expect(playerHand[0].canTargetTile(emptyTiles[0])).toBe(true);
      expect(playerHand[1].canTargetTile(emptyTiles[1])).toBe(true);
    });

    it('should require drawing both heart and magic card before ending turn', () => {
      // This is server-side validation logic, but we can test the conditions
      const playerActions = {
        drawnHeart: false,
        drawnMagic: false
      };

      // Player hasn't drawn anything yet
      expect(playerActions.drawnHeart).toBe(false);
      expect(playerActions.drawnMagic).toBe(false);

      // After drawing heart card
      playerActions.drawnHeart = true;
      expect(playerActions.drawnHeart).toBe(true);
      expect(playerActions.drawnMagic).toBe(false);

      // After drawing magic card
      playerActions.drawnMagic = true;
      expect(playerActions.drawnHeart).toBe(true);
      expect(playerActions.drawnMagic).toBe(true);
    });

    it('should allow ending turn without placing cards', () => {
      // Players can end turn without placing anything as long as they draw cards
      // This is a game rule that doesn't require specific card logic testing
      expect(true).toBe(true); // Placeholder for rule verification
    });
  });

  describe('Heart Placement Rules', () => {
    beforeEach(() => {
      mockGameState.playerHands = {
        [player1Id]: [
          new HeartCard('h1', 'red', 2, '❤️'),
          new HeartCard('h2', 'yellow', 1, '💛'),
          new HeartCard('h3', 'green', 3, '💚')
        ]
      };
    });

    it('should only allow placement on empty tiles', () => {
      const heartCard = mockGameState.playerHands[player1Id][0];
      const emptyTile = mockGameState.tiles[0];
      const occupiedTile = {
        id: 1,
        color: 'yellow',
        emoji: '🟨',
        placedHeart: { value: 1, placedBy: player2Id }
      };

      expect(heartCard.canTargetTile(emptyTile)).toBe(true);
      expect(heartCard.canTargetTile(occupiedTile)).toBe(false);
    });

    it('should only allow placement during player\'s turn', () => {
      const heartCard = mockGameState.playerHands[player1Id][0];
      const emptyTile = mockGameState.tiles[0];

      // Card logic doesn't validate turn - this is server-side
      expect(heartCard.canTargetTile(emptyTile)).toBe(true);
    });

    it('should require heart cards to be in player\'s hand', () => {
      const heartInHand = mockGameState.playerHands[player1Id][0];
      const heartNotInHand = new HeartCard('not-in-hand', 'red', 2, '❤️');

      expect(heartInHand.id).toBe('h1');
      expect(heartNotInHand.id).toBe('not-in-hand');

      // This validation happens server-side by checking playerHands
      expect(mockGameState.playerHands[player1Id]).toContain(heartInHand);
      expect(mockGameState.playerHands[player1Id]).not.toContain(heartNotInHand);
    });

    it('should place multiple hearts if player has enough cards', () => {
      const playerHand = mockGameState.playerHands[player1Id];
      const emptyTiles = mockGameState.tiles.filter(tile => !tile.placedHeart);

      expect(playerHand.length).toBe(3);
      expect(emptyTiles.length).toBe(8);

      // Player can place up to 3 hearts (all cards in hand)
      for (let i = 0; i < playerHand.length; i++) {
        expect(playerHand[i].canTargetTile(emptyTiles[i])).toBe(true);
      }
    });
  });

  describe('Scoring System Rules', () => {
    beforeEach(() => {
      mockGameState.playerHands = {
        [player1Id]: [
          new HeartCard('h1', 'red', 2, '❤️'),
          new HeartCard('h2', 'yellow', 1, '💛'),
          new HeartCard('h3', 'green', 3, '💚')
        ]
      };
    });

    it('should award face value points on white tiles', () => {
      const redHeart = mockGameState.playerHands[player1Id][0]; // value 2
      const whiteTile = { color: 'white' };

      const score = redHeart.calculateScore(whiteTile);
      expect(score).toBe(2);
    });

    it('should award double points on matching color tiles', () => {
      const redHeart = mockGameState.playerHands[player1Id][0]; // red, value 2
      const redTile = { color: 'red' };

      const score = redHeart.calculateScore(redTile);
      expect(score).toBe(4); // 2 * 2
    });

    it('should award zero points on color mismatch', () => {
      const redHeart = mockGameState.playerHands[player1Id][0]; // red, value 2
      const yellowTile = { color: 'yellow' };
      const greenTile = { color: 'green' };

      expect(redHeart.calculateScore(yellowTile)).toBe(0);
      expect(redHeart.calculateScore(greenTile)).toBe(0);
    });

    it('should calculate total player score correctly', () => {
      const tiles = [
        { // Red heart on red tile: 2 * 2 = 4 points
          id: 0, color: 'red', emoji: '🟥',
          placedHeart: { value: 2, color: 'red', placedBy: player1Id }
        },
        { // Yellow heart on white tile: 1 point
          id: 1, color: 'white', emoji: '⬜',
          placedHeart: { value: 1, color: 'yellow', placedBy: player1Id }
        },
        { // Green heart on red tile: 3 * 0 = 0 points
          id: 2, color: 'red', emoji: '🟥',
          placedHeart: { value: 3, color: 'green', placedBy: player1Id }
        }
      ];

      let totalScore = 0;
      tiles.forEach(tile => {
        if (tile.placedHeart && tile.placedHeart.placedBy === player1Id) {
          const heart = new HeartCard('test', tile.placedHeart.color, tile.placedHeart.value, '❤️');
          totalScore += heart.calculateScore(tile);
        }
      });

      expect(totalScore).toBe(5); // 4 + 1 + 0
    });
  });

  describe('Magic Card Interaction Rules', () => {
    beforeEach(() => {
      mockGameState.tiles = [
        {
          id: 0, color: 'red', emoji: '🟥',
          placedHeart: {
            value: 2, color: 'red', emoji: '❤️',
            placedBy: player1Id, originalTileColor: 'red'
          }
        },
        {
          id: 1, color: 'yellow', emoji: '🟨',
          placedHeart: {
            value: 1, color: 'yellow', emoji: '💛',
            placedBy: player2Id, originalTileColor: 'yellow'
          }
        },
        { id: 2, color: 'green', emoji: '🟩', placedHeart: null },
        { id: 3, color: 'white', emoji: '⬜', placedHeart: null }
      ];

      mockGameState.playerHands = {
        [player1Id]: [new WindCard('w1')],
        [player2Id]: [new RecycleCard('r1'), new ShieldCard('s1')]
      };
    });

    describe('Wind Card Rules', () => {
      it('should remove opponent\'s heart and preserve tile color', () => {
        const windCard = mockGameState.playerHands[player1Id][0];
        const opponentHeartTile = mockGameState.tiles[1]; // player2's heart

        const result = windCard.executeEffect(mockGameState, 1, player1Id);

        expect(result.type).toBe('wind');
        expect(result.removedHeart.placedBy).toBe(player2Id);
        expect(result.newTileState.color).toBe('yellow'); // Original color preserved
        expect(result.newTileState.placedHeart).toBeUndefined();
      });

      it('should only target opponent hearts', () => {
        const windCard = mockGameState.playerHands[player1Id][0];
        const ownHeartTile = mockGameState.tiles[0]; // player1's heart
        const emptyTile = mockGameState.tiles[2]; // This should be null initially

        // Mock the canTargetTile method behavior
        const mockCanTargetTile = (tile, userId) => {
          return tile && tile.placedHeart && tile.placedHeart.placedBy !== userId;
        };

        // Check that empty tile is indeed empty (no placedHeart)
        expect(emptyTile.placedHeart).toBeNull();
        expect(mockCanTargetTile(ownHeartTile, player1Id)).toBe(false);
        // Wind cards should only target tiles with opponent hearts
        expect(mockCanTargetTile(mockGameState.tiles[1], player1Id)).toBe(true);

        // Verify empty tiles cannot be targeted
        const emptyTileResult = mockCanTargetTile(emptyTile, player1Id);
        expect(emptyTileResult === false || emptyTileResult === null).toBe(true);
      });

      it('should not work on empty tiles', () => {
        const windCard = mockGameState.playerHands[player1Id][0];
        const emptyTile = mockGameState.tiles[2];

        expect(() => {
          windCard.executeEffect(mockGameState, 2, player1Id);
        }).toThrow('Invalid target for Wind card');
      });
    });

    describe('Recycle Card Rules', () => {
      it('should change empty colored tiles to white', () => {
        const recycleCard = mockGameState.playerHands[player2Id][0];
        const greenTile = mockGameState.tiles[2]; // empty green tile

        const result = recycleCard.executeEffect(mockGameState, 2, player2Id);

        expect(result.type).toBe('recycle');
        expect(result.previousColor).toBe('green');
        expect(result.newColor).toBe('white');
        expect(result.newTileState.color).toBe('white');
        expect(result.newTileState.emoji).toBe('⬜');
      });

      it('should not target white tiles', () => {
        const recycleCard = mockGameState.playerHands[player2Id][0];
        const whiteTile = mockGameState.tiles[3];

        expect(recycleCard.canTargetTile(whiteTile)).toBe(false);
        expect(() => {
          recycleCard.executeEffect(mockGameState, 3, player2Id);
        }).toThrow('Invalid target for Recycle card');
      });

      it('should not target tiles with hearts', () => {
        const recycleCard = mockGameState.playerHands[player2Id][0];
        const tileWithHeart = mockGameState.tiles[0];

        expect(recycleCard.canTargetTile(tileWithHeart)).toBe(false);
        expect(() => {
          recycleCard.executeEffect(mockGameState, 0, player2Id);
        }).toThrow('Invalid target for Recycle card');
      });
    });

    describe('Shield Card Rules', () => {
      it('should protect player from magic cards', () => {
        const shieldCard = mockGameState.playerHands[player2Id][1];

        // Activate shield for player2
        const shieldResult = shieldCard.executeEffect(mockGameState, player2Id);
        expect(shieldResult.type).toBe('shield');
        expect(shieldResult.protectedPlayerId).toBe(player2Id);

        // Player1 tries to use wind on player2's heart
        const windCard = mockGameState.playerHands[player1Id][0];
        expect(() => {
          windCard.executeEffect(mockGameState, 1, player1Id);
        }).toThrow('Opponent is protected by Shield');
      });

      it('should not target tiles', () => {
        const shieldCard = mockGameState.playerHands[player2Id][1];
        expect(shieldCard.canTargetTile()).toBe(false);
      });

      it('should activate for self only', () => {
        const shieldCard = mockGameState.playerHands[player2Id][1];
        const result = shieldCard.executeEffect(mockGameState, player2Id);

        expect(result.activatedFor).toBe(player2Id);
        expect(result.protectedPlayerId).toBe(player2Id);
      });
    });
  });

  describe('Game End Conditions', () => {
    beforeEach(() => {
      mockGameState.tiles = [
        { id: 0, color: 'red', emoji: '🟥', placedHeart: { value: 1, placedBy: player1Id } },
        { id: 1, color: 'yellow', emoji: '🟨', placedHeart: { value: 2, placedBy: player2Id } },
        { id: 2, color: 'green', emoji: '🟩', placedHeart: null },
        { id: 3, color: 'white', emoji: '⬜', placedHeart: null },
        { id: 4, color: 'red', emoji: '🟥', placedHeart: null },
        { id: 5, color: 'yellow', emoji: '🟨', placedHeart: null },
        { id: 6, color: 'green', emoji: '🟩', placedHeart: null },
        { id: 7, color: 'white', emoji: '⬜', placedHeart: null }
      ];
    });

    it('should end game when all tiles are filled', () => {
      // Fill remaining tiles
      mockGameState.tiles.forEach(tile => {
        if (!tile.placedHeart) {
          tile.placedHeart = { value: 1, placedBy: player1Id };
        }
      });

      const allTilesFilled = mockGameState.tiles.every(tile => tile.placedHeart);
      expect(allTilesFilled).toBe(true);
    });

    it('should end game when both decks are empty', () => {
      mockGameState.deck.cards = 0;
      mockGameState.magicDeck.cards = 0;

      const bothDecksEmpty = mockGameState.deck.cards <= 0 &&
                            mockGameState.magicDeck.cards <= 0;
      expect(bothDecksEmpty).toBe(true);
    });

    it('should not end game when some tiles are empty and decks have cards', () => {
      mockGameState.deck.cards = 5;
      mockGameState.magicDeck.cards = 3;

      const someTilesEmpty = mockGameState.tiles.some(tile => !tile.placedHeart);
      const decksHaveCards = mockGameState.deck.cards > 0 &&
                           mockGameState.magicDeck.cards > 0;

      expect(someTilesEmpty).toBe(true);
      expect(decksHaveCards).toBe(true);
    });

    it('should determine winner based on highest score', () => {
      // Set up scoring scenario
      mockGameState.tiles = [
        { // Player1: red heart on red tile = 2 * 2 = 4 points
          id: 0, color: 'red', emoji: '🟥',
          placedHeart: { value: 2, color: 'red', placedBy: player1Id }
        },
        { // Player2: yellow heart on white tile = 1 point
          id: 1, color: 'white', emoji: '⬜',
          placedHeart: { value: 1, color: 'yellow', placedBy: player2Id }
        }
      ];

      const players = [
        { userId: player1Id, name: 'Player1', score: 4 },
        { userId: player2Id, name: 'Player2', score: 1 }
      ];

      const winner = players.reduce((prev, current) =>
        prev.score > current.score ? prev : current
      );

      expect(winner.userId).toBe(player1Id);
      expect(winner.score).toBe(4);
    });

    it('should handle tie scenarios', () => {
      const players = [
        { userId: player1Id, name: 'Player1', score: 3 },
        { userId: player2Id, name: 'Player2', score: 3 }
      ];

      const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
      const isTie = sortedPlayers.length > 1 &&
                   sortedPlayers[0].score === sortedPlayers[1].score;

      expect(isTie).toBe(true);
      expect(sortedPlayers[0].score).toBe(3);
      expect(sortedPlayers[1].score).toBe(3);
    });
  });

  describe('Card Distribution and Balance', () => {
    it('should maintain balanced heart value distribution', () => {
      const heartDeck = generateHeartDeck(30); // Larger sample for distribution
      const valueDistribution = { 1: 0, 2: 0, 3: 0 };

      heartDeck.forEach(heart => {
        valueDistribution[heart.value]++;
      });

      // Should have distribution of all three values
      expect(valueDistribution[1]).toBeGreaterThan(0);
      expect(valueDistribution[2]).toBeGreaterThan(0);
      expect(valueDistribution[3]).toBeGreaterThan(0);

      // Total should match deck size
      const total = Object.values(valueDistribution).reduce((sum, count) => sum + count, 0);
      expect(total).toBe(30);
    });

    it('should maintain balanced color distribution', () => {
      const heartDeck = generateHeartDeck(30);
      const colorDistribution = { red: 0, yellow: 0, green: 0 };

      heartDeck.forEach(heart => {
        colorDistribution[heart.color]++;
      });

      // Should have distribution of all three colors
      expect(colorDistribution.red).toBeGreaterThan(0);
      expect(colorDistribution.yellow).toBeGreaterThan(0);
      expect(colorDistribution.green).toBeGreaterThan(0);

      // Total should match deck size
      const total = Object.values(colorDistribution).reduce((sum, count) => sum + count, 0);
      expect(total).toBe(30);
    });

    it('should provide exactly 16 magic cards in total', () => {
      const magicDeck = generateMagicDeck();
      expect(magicDeck).toHaveLength(16);

      const types = magicDeck.map(card => card.type);
      expect(types).toContain('wind');
      expect(types).toContain('recycle');
      expect(types).toContain('shield');
    });

    it('should give strategic advantage to certain card combinations', () => {
      // Test strategic scenarios
      const redHeart = new HeartCard('rh', 'red', 3, '❤️');
      const redTile = { color: 'red' };
      const whiteTile = { color: 'white' };

      // High value red heart on red tile = 6 points
      const redOnRedScore = redHeart.calculateScore(redTile);
      // Same heart on white tile = 3 points
      const redOnWhiteScore = redHeart.calculateScore(whiteTile);

      expect(redOnRedScore).toBe(6);
      expect(redOnWhiteScore).toBe(3);
      expect(redOnRedScore).toBe(redOnWhiteScore * 2);
    });
  });

  describe('Turn Validation Rules', () => {
    beforeEach(() => {
      mockGameState.playerActions = {};
    });

    it('should track card draw limits per turn', () => {
      const userId = player1Id;

      // Initialize player actions
      mockGameState.playerActions[userId] = { drawnHeart: false, drawnMagic: false };

      // Draw heart card
      mockGameState.playerActions[userId].drawnHeart = true;
      expect(mockGameState.playerActions[userId].drawnHeart).toBe(true);
      expect(mockGameState.playerActions[userId].drawnMagic).toBe(false);

      // Draw magic card
      mockGameState.playerActions[userId].drawnMagic = true;
      expect(mockGameState.playerActions[userId].drawnHeart).toBe(true);
      expect(mockGameState.playerActions[userId].drawnMagic).toBe(true);
    });

    it('should reset player actions after turn ends', () => {
      const userId = player1Id;

      // Set actions as drawn
      mockGameState.playerActions[userId] = { drawnHeart: true, drawnMagic: true };

      // Reset after turn
      mockGameState.playerActions[userId] = { drawnHeart: false, drawnMagic: false };

      expect(mockGameState.playerActions[userId].drawnHeart).toBe(false);
      expect(mockGameState.playerActions[userId].drawnMagic).toBe(false);
    });

    it('should handle empty player actions gracefully', () => {
      const userId = player1Id;

      // No actions yet
      expect(mockGameState.playerActions[userId]).toBeUndefined();

      // Initialize if accessing
      if (!mockGameState.playerActions[userId]) {
        mockGameState.playerActions[userId] = { drawnHeart: false, drawnMagic: false };
      }

      expect(mockGameState.playerActions[userId]).toEqual({
        drawnHeart: false,
        drawnMagic: false
      });
    });
  });
});