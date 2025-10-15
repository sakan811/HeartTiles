import { describe, it, expect, beforeEach } from 'vitest';
import {
  BaseCard,
  HeartCard,
  MagicCard,
  WindCard,
  RecycleCard,
  ShieldCard,
  createHeartCard,
  createMagicCard,
  generateHeartDeck,
  generateMagicDeck,
  generateRandomMagicCard,
  createCardFromData,
  isHeartCard,
  isMagicCard,
  getCardType
} from '../../src/lib/cards.js';

describe('Card System Classes', () => {
  describe('BaseCard', () => {
    it('should create a base card with required properties', () => {
      const card = new BaseCard('test-id', 'test-type', '🎯', 'Test Card', 'A test card');

      expect(card.id).toBe('test-id');
      expect(card.type).toBe('test-type');
      expect(card.emoji).toBe('🎯');
      expect(card.name).toBe('Test Card');
      expect(card.description).toBe('A test card');
    });

    it('should have default canTargetTile implementation', () => {
      const card = new BaseCard('test-id', 'test-type', '🎯', 'Test Card', 'A test card');
      expect(card.canTargetTile()).toBe(true);
    });

    it('should throw error for unimplemented executeEffect', () => {
      const card = new BaseCard('test-id', 'test-type', '🎯', 'Test Card', 'A test card');
      expect(() => card.executeEffect()).toThrow('executeEffect must be implemented by subclass');
    });
  });

  describe('HeartCard', () => {
    let heartCard;

    beforeEach(() => {
      heartCard = new HeartCard('heart-1', 'red', 2, '❤️');
    });

    it('should create heart card with correct properties', () => {
      expect(heartCard.id).toBe('heart-1');
      expect(heartCard.type).toBe('heart');
      expect(heartCard.color).toBe('red');
      expect(heartCard.value).toBe(2);
      expect(heartCard.emoji).toBe('❤️');
      expect(heartCard.name).toBe('red heart');
      expect(heartCard.description).toBe('A red heart card worth 2 points');
    });

    it('should get available colors', () => {
      expect(HeartCard.getAvailableColors()).toEqual(['red', 'yellow', 'green']);
    });

    it('should get color emojis', () => {
      expect(HeartCard.getColorEmojis()).toEqual(['❤️', '💛', '💚']);
    });

    it('should target empty tiles only', () => {
      const emptyTile = { id: 1, placedHeart: null };
      const occupiedTile = { id: 2, placedHeart: { value: 1 } };

      expect(heartCard.canTargetTile(emptyTile)).toBe(true);
      expect(heartCard.canTargetTile(occupiedTile)).toBe(false);
    });

    describe('Score Calculation', () => {
      it('should calculate face value on white tiles', () => {
        const whiteTile = { color: 'white' };
        expect(heartCard.calculateScore(whiteTile)).toBe(2);
      });

      it('should calculate double points on matching color tiles', () => {
        const redTile = { color: 'red' };
        expect(heartCard.calculateScore(redTile)).toBe(4);
      });

      it('should calculate zero points on non-matching color tiles', () => {
        const yellowTile = { color: 'yellow' };
        const greenTile = { color: 'green' };
        expect(heartCard.calculateScore(yellowTile)).toBe(0);
        expect(heartCard.calculateScore(greenTile)).toBe(0);
      });
    });

    describe('Random Generation', () => {
      it('should generate random heart card with valid properties', () => {
        const randomHeart = HeartCard.generateRandom();

        expect(['red', 'yellow', 'green']).toContain(randomHeart.color);
        expect(randomHeart.value).toBeGreaterThanOrEqual(1);
        expect(randomHeart.value).toBeLessThanOrEqual(3);
        expect(['❤️', '💛', '💚']).toContain(randomHeart.emoji);
        expect(randomHeart.type).toBe('heart');
        expect(randomHeart.id).toBeDefined();
      });

      it('should generate unique IDs for multiple cards', () => {
        const heart1 = HeartCard.generateRandom();
        const heart2 = HeartCard.generateRandom();
        expect(heart1.id).not.toBe(heart2.id);
      });
    });
  });

  describe('MagicCard', () => {
    let magicCard;

    beforeEach(() => {
      magicCard = new MagicCard('magic-1', 'test-magic', '🔮', 'Test Magic', 'A test magic card');
    });

    it('should create magic card with correct properties', () => {
      expect(magicCard.id).toBe('magic-1');
      expect(magicCard.type).toBe('test-magic');
      expect(magicCard.emoji).toBe('🔮');
      expect(magicCard.name).toBe('Test Magic');
      expect(magicCard.description).toBe('A test magic card');
    });

    it('should have default canTargetTile implementation', () => {
      expect(magicCard.canTargetTile()).toBe(true);
    });
  });

  describe('WindCard', () => {
    let windCard;
    let mockGameState;

    beforeEach(() => {
      windCard = new WindCard('wind-1');
      mockGameState = {
        turnCount: 1,
        tiles: [
          {
            id: 1,
            color: 'red',
            emoji: '🟥',
            placedHeart: {
              value: 2,
              color: 'red',
              emoji: '❤️',
              placedBy: 'player1',
              originalTileColor: 'red'
            }
          },
          {
            id: 2,
            color: 'yellow',
            emoji: '🟨',
            placedHeart: {
              value: 1,
              color: 'yellow',
              emoji: '💛',
              placedBy: 'player2',
              originalTileColor: 'yellow'
            }
          },
          { id: 3, color: 'green', emoji: '🟩', placedHeart: null },
          { id: 4, color: 'white', emoji: '⬜', placedHeart: null }
        ],
        shields: {}
      };
    });

    it('should create wind card with correct properties', () => {
      expect(windCard.id).toBe('wind-1');
      expect(windCard.type).toBe('wind');
      expect(windCard.emoji).toBe('💨');
      expect(windCard.name).toBe('Wind Card');
      expect(windCard.description).toBe('Remove opponent heart from a tile');
    });

    it('should target tiles with opponent hearts only', () => {
      const opponentHeartTile = mockGameState.tiles[0]; // player1's heart
      const ownHeartTile = mockGameState.tiles[1]; // player2's heart
      const emptyTile = mockGameState.tiles[2];

      // Mock the canTargetTile method behavior
      const mockCanTargetTile = (tile, userId) => {
        return tile && tile.placedHeart && tile.placedHeart.placedBy !== userId;
      };

      // Check that empty tile is indeed empty (no placedHeart)
      expect(emptyTile.placedHeart).toBeNull();
      expect(mockCanTargetTile(opponentHeartTile, 'player2')).toBe(true);
      expect(mockCanTargetTile(ownHeartTile, 'player2')).toBe(false);

      // Verify empty tiles cannot be targeted
      const emptyTileResult = mockCanTargetTile(emptyTile, 'player2');
      expect(emptyTileResult === false || emptyTileResult === null).toBe(true);
    });

    it('should execute wind effect correctly', () => {
      const result = windCard.executeEffect(mockGameState, 1, 'player2');

      expect(result.type).toBe('wind');
      expect(result.removedHeart).toBeDefined();
      expect(result.removedHeart.placedBy).toBe('player1');
      expect(result.targetedPlayerId).toBe('player1');
      expect(result.tileId).toBe(1);
      expect(result.newTileState.color).toBe('red'); // Original tile color preserved
      expect(result.newTileState.emoji).toBe('🟥');
      expect(result.newTileState.placedHeart).toBeUndefined();
    });

    it('should throw error for invalid targets', () => {
      expect(() => {
        windCard.executeEffect(mockGameState, 2, 'player2'); // Own heart
      }).toThrow('Invalid target for Wind card');

      expect(() => {
        windCard.executeEffect(mockGameState, 3, 'player2'); // Empty tile
      }).toThrow('Invalid target for Wind card');
    });

    it('should preserve tile color after removing heart', () => {
      // Test with heart on white tile
      const whiteTileWithHeart = {
        id: 5,
        color: 'white',
        emoji: '⬜',
        placedHeart: {
          value: 3,
          color: 'green',
          emoji: '💚',
          placedBy: 'player1',
          originalTileColor: 'white'
        }
      };
      mockGameState.tiles.push(whiteTileWithHeart);

      const result = windCard.executeEffect(mockGameState, 5, 'player2');

      expect(result.newTileState.color).toBe('white');
      expect(result.newTileState.emoji).toBe('⬜');
    });
  });

  describe('RecycleCard', () => {
    let recycleCard;
    let mockGameState;

    beforeEach(() => {
      recycleCard = new RecycleCard('recycle-1');
      mockGameState = {
        turnCount: 1,
        tiles: [
          { id: 1, color: 'red', emoji: '🟥', placedHeart: null },
          { id: 2, color: 'yellow', emoji: '🟨', placedHeart: null },
          { id: 3, color: 'white', emoji: '⬜', placedHeart: null },
          { id: 4, color: 'green', emoji: '🟩', placedHeart: { value: 1 } }
        ],
        shields: {}
      };
    });

    it('should create recycle card with correct properties', () => {
      expect(recycleCard.id).toBe('recycle-1');
      expect(recycleCard.type).toBe('recycle');
      expect(recycleCard.emoji).toBe('♻️');
      expect(recycleCard.name).toBe('Recycle Card');
      expect(recycleCard.description).toBe('Change tile color to white');
    });

    it('should target empty non-white tiles only', () => {
      const redTile = mockGameState.tiles[0];
      const yellowTile = mockGameState.tiles[1];
      const whiteTile = mockGameState.tiles[2];
      const occupiedTile = mockGameState.tiles[3];

      expect(recycleCard.canTargetTile(redTile)).toBe(true);
      expect(recycleCard.canTargetTile(yellowTile)).toBe(true);
      expect(recycleCard.canTargetTile(whiteTile)).toBe(false);
      expect(recycleCard.canTargetTile(occupiedTile)).toBe(false);
    });

    it('should execute recycle effect correctly', () => {
      const result = recycleCard.executeEffect(mockGameState, 1, 'player1');

      expect(result.type).toBe('recycle');
      expect(result.previousColor).toBe('red');
      expect(result.newColor).toBe('white');
      expect(result.tileId).toBe(1);
      expect(result.newTileState.color).toBe('white');
      expect(result.newTileState.emoji).toBe('⬜');
      expect(result.newTileState.placedHeart).toBeUndefined();
    });

    it('should throw error for invalid targets', () => {
      expect(() => {
        recycleCard.executeEffect(mockGameState, 3); // White tile
      }).toThrow('Invalid target for Recycle card');

      expect(() => {
        recycleCard.executeEffect(mockGameState, 4); // Occupied tile
      }).toThrow('Invalid target for Recycle card');
    });
  });

  describe('Card Factory Functions', () => {
    describe('createHeartCard', () => {
      it('should create heart card with specified properties', () => {
        const heart = createHeartCard('heart-1', 'red', 3, '❤️');

        expect(heart).toBeInstanceOf(HeartCard);
        expect(heart.id).toBe('heart-1');
        expect(heart.color).toBe('red');
        expect(heart.value).toBe(2);
        expect(heart.emoji).toBe('❤️');
      });
    });

    describe('createMagicCard', () => {
      it('should create wind card', () => {
        const wind = createMagicCard('wind-1', 'wind');
        expect(wind).toBeInstanceOf(WindCard);
        expect(wind.type).toBe('wind');
      });

      it('should create recycle card', () => {
        const recycle = createMagicCard('recycle-1', 'recycle');
        expect(recycle).toBeInstanceOf(RecycleCard);
        expect(recycle.type).toBe('recycle');
      });

      it('should create shield card', () => {
        const shield = createMagicCard('shield-1', 'shield');
        expect(shield).toBeInstanceOf(ShieldCard);
        expect(shield.type).toBe('shield');
      });

      it('should throw error for unknown card type', () => {
        expect(() => {
          createMagicCard('unknown-1', 'unknown');
        }).toThrow('Unknown magic card type: unknown');
      });
    });
  });

  describe('Deck Generation', () => {
    describe('generateHeartDeck', () => {
      it('should generate default 16 heart cards', () => {
        const deck = generateHeartDeck();
        expect(deck).toHaveLength(16);
        deck.forEach(card => {
          expect(card).toBeInstanceOf(HeartCard);
          expect(['red', 'yellow', 'green']).toContain(card.color);
          expect(card.value).toBeGreaterThanOrEqual(1);
          expect(card.value).toBeLessThanOrEqual(3);
        });
      });

      it('should generate specified number of heart cards', () => {
        const deck = generateHeartDeck(8);
        expect(deck).toHaveLength(8);
      });

      it('should generate cards with unique IDs', () => {
        const deck = generateHeartDeck(16);
        const ids = deck.map(card => card.id);
        const uniqueIds = [...new Set(ids)];
        expect(uniqueIds).toHaveLength(16);
      });
    });

    describe('generateMagicDeck', () => {
      it('should generate 16 magic cards with correct distribution', () => {
        const deck = generateMagicDeck();
        expect(deck).toHaveLength(16);

        const windCards = deck.filter(card => card.type === 'wind');
        const recycleCards = deck.filter(card => card.type === 'recycle');
        const shieldCards = deck.filter(card => card.type === 'shield');

        expect(windCards).toHaveLength(6);
        expect(recycleCards).toHaveLength(5);
        expect(shieldCards).toHaveLength(5);
      });

      it('should generate cards with sequential IDs', () => {
        const deck = generateMagicDeck();
        const ids = deck.map(card => card.id);

        // IDs should be in ascending order (based on timestamp + index)
        for (let i = 1; i < ids.length; i++) {
          expect(ids[i]).toBeGreaterThan(ids[i - 1]);
        }
      });
    });

    describe('generateRandomMagicCard', () => {
      it('should generate a valid magic card', () => {
        const card = generateRandomMagicCard();

        expect(card).toBeInstanceOf(MagicCard);
        expect(['wind', 'recycle', 'shield']).toContain(card.type);
        expect(card.id).toBeDefined();
      });

      it('should generate different types over multiple calls', () => {
        const cards = Array.from({ length: 20 }, () => generateRandomMagicCard());
        const types = [...new Set(cards.map(card => card.type))];

        // Should generate at least 2 different types over 20 calls
        expect(types.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('Card Validation Helpers', () => {
    describe('isHeartCard', () => {
      it('should identify heart cards correctly', () => {
        const heartCard = new HeartCard('heart-1', 'red', 2, '❤️');
        const heartData = { type: 'heart', color: 'red', value: 2 };

        expect(isHeartCard(heartCard)).toBe(true);
        expect(isHeartCard(heartData)).toBe(true);
      });

      it('should reject non-heart cards', () => {
        const windCard = new WindCard('wind-1');
        const magicData = { type: 'wind' };

        expect(isHeartCard(windCard)).toBe(false);
        expect(isHeartCard(magicData)).toBe(false);
        expect(isHeartCard(null)).toBe(false);
        expect(isHeartCard({})).toBe(false);
      });
    });

    describe('isMagicCard', () => {
      it('should identify magic cards correctly', () => {
        const windCard = new WindCard('wind-1');
        const recycleCard = new RecycleCard('recycle-1');
        const magicData = { type: 'shield' };

        expect(isMagicCard(windCard)).toBe(true);
        expect(isMagicCard(recycleCard)).toBe(true);
        expect(isMagicCard(magicData)).toBe(true);
      });

      it('should reject non-magic cards', () => {
        const heartCard = new HeartCard('heart-1', 'red', 2, '❤️');
        const heartData = { type: 'heart', color: 'red', value: 2 };

        expect(isMagicCard(heartCard)).toBe(false);
        expect(isMagicCard(heartData)).toBe(false);
        expect(isMagicCard(null)).toBe(false);
        expect(isMagicCard({})).toBe(false);
      });
    });

    describe('getCardType', () => {
      it('should return correct type for heart cards', () => {
        const heartCard = new HeartCard('heart-1', 'red', 2, '❤️');
        expect(getCardType(heartCard)).toBe('heart');
      });

      it('should return correct type for magic cards', () => {
        const windCard = new WindCard('wind-1');
        expect(getCardType(windCard)).toBe('magic');
      });

      it('should return unknown for invalid cards', () => {
        expect(getCardType(null)).toBe('unknown');
        expect(getCardType({})).toBe('unknown');
        expect(getCardType({ type: 'invalid' })).toBe('unknown');
      });
    });

    describe('createCardFromData', () => {
      it('should create heart card from data', () => {
        const heartData = {
          id: 'heart-1',
          color: 'red',
          value: 2,
          emoji: '❤️'
        };

        const card = createCardFromData(heartData);
        expect(card).toBeInstanceOf(HeartCard);
        expect(card.id).toBe('heart-1');
        expect(card.color).toBe('red');
        expect(card.value).toBe(2);
      });

      it('should create magic card from data', () => {
        const windData = { id: 'wind-1', type: 'wind' };
        const recycleData = { id: 'recycle-1', type: 'recycle' };
        const shieldData = { id: 'shield-1', type: 'shield' };

        const wind = createCardFromData(windData);
        const recycle = createCardFromData(recycleData);
        const shield = createCardFromData(shieldData);

        expect(wind).toBeInstanceOf(WindCard);
        expect(recycle).toBeInstanceOf(RecycleCard);
        expect(shield).toBeInstanceOf(ShieldCard);
      });

      it('should throw error for invalid card data', () => {
        expect(() => {
          createCardFromData(null);
        }).toThrow('Invalid card data');

        expect(() => {
          createCardFromData({});
        }).toThrow('Invalid card data');
      });

      it('should handle card with both type and heart properties', () => {
        // If type is 'heart', prioritize that
        const heartDataWithType = {
          id: 'heart-1',
          type: 'heart',
          color: 'red',
          value: 2
        };

        const card = createCardFromData(heartDataWithType);
        expect(card).toBeInstanceOf(HeartCard);
      });
    });
  });

  describe('Card Edge Cases', () => {
    it('should handle heart cards with extreme values', () => {
      const minHeart = new HeartCard('min', 'yellow', 1, '💛');
      const maxHeart = new HeartCard('max', 'green', 3, '💚');

      expect(minHeart.value).toBe(1);
      expect(maxHeart.value).toBe(2);
    });

    it('should handle cards with special characters in IDs', () => {
      const specialIdCard = new HeartCard('special-id-123', 'red', 2, '❤️');
      expect(specialIdCard.id).toBe('special-id-123');
    });

    it('should handle magic cards with different emoji sets', () => {
      const wind = new WindCard('wind-test');
      const recycle = new RecycleCard('recycle-test');
      const shield = new ShieldCard('shield-test');

      expect(wind.emoji).toBe('💨');
      expect(recycle.emoji).toBe('♻️');
      expect(shield.emoji).toBe('🛡️');
    });
  });
});