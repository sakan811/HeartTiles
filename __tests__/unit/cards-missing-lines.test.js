import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  HeartCard,
  WindCard,
  RecycleCard,
  ShieldCard,
  generateHeartDeck,
  generateMagicDeck,
  generateRandomMagicCard,
  createCardFromData,
  isHeartCard,
  isMagicCard,
  getCardType
} from '../../src/lib/cards.js'

describe('Cards Missing Lines Coverage Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateHeartDeck function (lines 396-402)', () => {
    it('should generate default 16 heart cards', () => {
      const hearts = generateHeartDeck()

      expect(hearts).toHaveLength(16)
      hearts.forEach(heart => {
        expect(heart).toBeInstanceOf(HeartCard)
        expect(heart.type).toBe('heart')
        expect(['red', 'yellow', 'green']).toContain(heart.color)
        expect(heart.value).toBeGreaterThanOrEqual(1)
        expect(heart.value).toBeLessThanOrEqual(3)
        expect(['❤️', '💛', '💚']).toContain(heart.emoji)
      })
    })

    it('should generate custom count of heart cards', () => {
      const hearts = generateHeartDeck(5)

      expect(hearts).toHaveLength(5)
      hearts.forEach(heart => {
        expect(heart).toBeInstanceOf(HeartCard)
        expect(heart.type).toBe('heart')
      })
    })

    it('should generate unique heart cards', () => {
      const hearts = generateHeartDeck(10)

      const ids = hearts.map(heart => heart.id)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(10)
    })

    it('should handle zero count', () => {
      const hearts = generateHeartDeck(0)
      expect(hearts).toHaveLength(0)
    })
  })

  describe('generateMagicDeck function (lines 404-423)', () => {
    it('should generate exactly 16 magic cards', () => {
      const cards = generateMagicDeck()

      expect(cards).toHaveLength(16)
    })

    it('should generate correct distribution of magic cards', () => {
      const cards = generateMagicDeck()

      const windCards = cards.filter(card => card.type === 'wind')
      const recycleCards = cards.filter(card => card.type === 'recycle')
      const shieldCards = cards.filter(card => card.type === 'shield')

      expect(windCards).toHaveLength(6)
      expect(recycleCards).toHaveLength(5)
      expect(shieldCards).toHaveLength(5)
    })

    it('should generate magic cards in correct order', () => {
      const cards = generateMagicDeck()

      // First 6 should be wind cards
      for (let i = 0; i < 6; i++) {
        expect(cards[i].type).toBe('wind')
        expect(cards[i]).toBeInstanceOf(WindCard)
      }

      // Next 5 should be recycle cards
      for (let i = 6; i < 11; i++) {
        expect(cards[i].type).toBe('recycle')
        expect(cards[i]).toBeInstanceOf(RecycleCard)
      }

      // Last 5 should be shield cards
      for (let i = 11; i < 16; i++) {
        expect(cards[i].type).toBe('shield')
        expect(cards[i]).toBeInstanceOf(ShieldCard)
      }
    })

    it('should generate magic cards with unique IDs', () => {
      const cards = generateMagicDeck()

      const ids = cards.map(card => card.id)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(16)
    })

    it('should generate cards with sequential time-based IDs', () => {
      const originalDateNow = Date.now
      const mockTime = 1640995200000 // Fixed timestamp
      Date.now = vi.fn().mockReturnValue(mockTime)

      const cards = generateMagicDeck()

      expect(cards[0].id).toBe(mockTime + 1)
      expect(cards[1].id).toBe(mockTime + 2)
      expect(cards[15].id).toBe(mockTime + 16)

      Date.now = originalDateNow
    })
  })

  describe('generateRandomMagicCard function (lines 425-446)', () => {
    it('should generate a magic card', () => {
      const card = generateRandomMagicCard()

      expect(card).toBeDefined()
      expect(['wind', 'recycle', 'shield']).toContain(card.type)
    })

    it('should use weighted random selection', () => {
      // Test multiple generations to ensure distribution roughly matches weights
      const cards = []
      for (let i = 0; i < 100; i++) {
        cards.push(generateRandomMagicCard())
      }

      const windCount = cards.filter(c => c.type === 'wind').length
      const recycleCount = cards.filter(c => c.type === 'recycle').length
      const shieldCount = cards.filter(c => c.type === 'shield').length

      // Should be roughly distributed according to weights (6:5:5)
      expect(windCount).toBeGreaterThan(0)
      expect(recycleCount).toBeGreaterThan(0)
      expect(shieldCount).toBeGreaterThan(0)

      // Wind should be more common than both recycle and shield combined in most cases
      // With weight 6 vs 5+5, wind should have at least 20% of total
      expect(windCount).toBeGreaterThan(10) // At least 10 out of 100

      // Total should be exactly 100 cards
      expect(windCount + recycleCount + shieldCount).toBe(100)
    })

    it('should generate cards with unique IDs', () => {
      const cards = []
      for (let i = 0; i < 10; i++) {
        cards.push(generateRandomMagicCard())
      }

      const ids = cards.map(card => card.id)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(10)
    })

    it('should generate time-based IDs', () => {
      const originalDateNow = Date.now
      const mockTime = 1640995200000
      Date.now = vi.fn().mockReturnValue(mockTime)

      const card = generateRandomMagicCard()

      expect(card.id).toBeGreaterThanOrEqual(mockTime)
      expect(card.id).toBeLessThan(mockTime + 1)

      Date.now = originalDateNow
    })

    it('should select wind when random value favors it', () => {
      // Mock Math.random to return a value that should select wind
      const originalMathRandom = Math.random
      Math.random = vi.fn().mockReturnValue(0.1) // Should favor wind

      const card = generateRandomMagicCard()

      expect(card.type).toBe('wind')
      expect(card).toBeInstanceOf(WindCard)

      Math.random = originalMathRandom
    })

    it('should select shield when random value favors it', () => {
      // Mock Math.random to return a value that should select shield
      const originalMathRandom = Math.random
      Math.random = vi.fn().mockReturnValue(0.9) // Should favor shield

      const card = generateRandomMagicCard()

      expect(card.type).toBe('shield')
      expect(card).toBeInstanceOf(ShieldCard)

      Math.random = originalMathRandom
    })
  })

  describe('createCardFromData function (lines 448-456)', () => {
    it('should create heart card from type heart data', () => {
      const cardData = {
        type: 'heart',
        id: 'heart1',
        color: 'red',
        value: 2,
        emoji: '❤️'
      }

      const card = createCardFromData(cardData)

      expect(card).toBeInstanceOf(HeartCard)
      expect(card.id).toBe('heart1')
      expect(card.color).toBe('red')
      expect(card.value).toBe(2)
      expect(card.emoji).toBe('❤️')
    })

    it('should create heart card from color/value data', () => {
      const cardData = {
        id: 'heart2',
        color: 'yellow',
        value: 3,
        emoji: '💛'
      }

      const card = createCardFromData(cardData)

      expect(card).toBeInstanceOf(HeartCard)
      expect(card.color).toBe('yellow')
      expect(card.value).toBe(3)
      expect(card.emoji).toBe('💛')
    })

    it('should create wind card from wind type data', () => {
      const cardData = {
        type: 'wind',
        id: 'wind1'
      }

      const card = createCardFromData(cardData)

      expect(card).toBeInstanceOf(WindCard)
      expect(card.type).toBe('wind')
      expect(card.id).toBe('wind1')
      expect(card.emoji).toBe('💨')
    })

    it('should create recycle card from recycle type data', () => {
      const cardData = {
        type: 'recycle',
        id: 'recycle1'
      }

      const card = createCardFromData(cardData)

      expect(card).toBeInstanceOf(RecycleCard)
      expect(card.type).toBe('recycle')
      expect(card.id).toBe('recycle1')
      expect(card.emoji).toBe('♻️')
    })

    it('should create shield card from shield type data', () => {
      const cardData = {
        type: 'shield',
        id: 'shield1'
      }

      const card = createCardFromData(cardData)

      expect(card).toBeInstanceOf(ShieldCard)
      expect(card.type).toBe('shield')
      expect(card.id).toBe('shield1')
      expect(card.emoji).toBe('🛡️')
    })

    it('should throw error for invalid card data', () => {
      const invalidCardData = {
        type: 'invalid',
        id: 'invalid1'
      }

      expect(() => {
        createCardFromData(invalidCardData)
      }).toThrow('Invalid card data')
    })

    it('should throw error for card data with no recognizable properties', () => {
      const invalidCardData = {
        id: 'weird1',
        someProperty: 'someValue'
      }

      expect(() => {
        createCardFromData(invalidCardData)
      }).toThrow('Invalid card data')
    })

    it('should throw error for empty card data', () => {
      expect(() => {
        createCardFromData({})
      }).toThrow('Invalid card data')

      expect(() => {
        createCardFromData(null)
      }).toThrow('Invalid card data')

      expect(() => {
        createCardFromData(undefined)
      }).toThrow('Invalid card data')
    })
  })

  describe('isHeartCard function (lines 459-461)', () => {
    it('should return true for HeartCard instances', () => {
      const heartCard = new HeartCard('test1', 'red', 2, '❤️')

      expect(isHeartCard(heartCard)).toBe(true)
    })

    it('should return true for heart card objects with color and value', () => {
      const heartCardObject = {
        id: 'test2',
        color: 'yellow',
        value: 3,
        emoji: '💛'
      }

      expect(isHeartCard(heartCardObject)).toBe(true)
    })

    it('should return true for heart cards with valid emojis', () => {
      const heartCards = [
        { color: 'red', value: 2, emoji: '❤️' },
        { color: 'yellow', value: 1, emoji: '💛' },
        { color: 'green', value: 3, emoji: '💚' }
      ]

      heartCards.forEach(card => {
        expect(isHeartCard(card)).toBe(true)
      })
    })

    it('should return false for heart cards with invalid emojis', () => {
      const invalidHeartCards = [
        { color: 'red', value: 2, emoji: '💙' }, // Blue not valid
        { color: 'yellow', value: 1, emoji: '🧡' }, // Orange not valid
        { color: 'green', value: 3, emoji: '💜' } // Purple not valid
      ]

      invalidHeartCards.forEach(card => {
        expect(isHeartCard(card)).toBe(false)
      })
    })

    it('should return false for magic card objects', () => {
      const magicCards = [
        { type: 'wind', emoji: '💨' },
        { type: 'recycle', emoji: '♻️' },
        { type: 'shield', emoji: '🛡️' }
      ]

      magicCards.forEach(card => {
        expect(isHeartCard(card)).toBe(false)
      })
    })

    it('should return false for WindCard instances', () => {
      const windCard = new WindCard('test3')
      expect(isHeartCard(windCard)).toBe(false)
    })

    it('should return false for objects with color but no value', () => {
      const invalidCard = { color: 'red', emoji: '❤️' }
      expect(isHeartCard(invalidCard)).toBe(false)
    })

    it('should return false for objects with value but no color', () => {
      const invalidCard = { value: 2, emoji: '❤️' }
      expect(isHeartCard(invalidCard)).toBe(false)
    })
  })

  describe('isMagicCard function (lines 463-465)', () => {
    it('should return true for WindCard instances', () => {
      const windCard = new WindCard('test1')
      expect(isMagicCard(windCard)).toBe(true)
    })

    it('should return true for RecycleCard instances', () => {
      const recycleCard = new RecycleCard('test2')
      expect(isMagicCard(recycleCard)).toBe(true)
    })

    it('should return true for ShieldCard instances', () => {
      const shieldCard = new ShieldCard('test3')
      expect(isMagicCard(shieldCard)).toBe(true)
    })

    it('should return true for magic card objects with valid types', () => {
      const magicCardObjects = [
        { type: 'wind', emoji: '💨' },
        { type: 'recycle', emoji: '♻️' },
        { type: 'shield', emoji: '🛡️' }
      ]

      magicCardObjects.forEach(card => {
        expect(isMagicCard(card)).toBe(true)
      })
    })

    it('should return false for heart card objects', () => {
      const heartCard = {
        color: 'red',
        value: 2,
        emoji: '❤️'
      }

      expect(isMagicCard(heartCard)).toBe(false)
    })

    it('should return false for HeartCard instances', () => {
      const heartCard = new HeartCard('test4', 'red', 2, '❤️')
      expect(isMagicCard(heartCard)).toBe(false)
    })

    it('should return false for magic card objects with invalid types', () => {
      const invalidMagicCards = [
        { type: 'invalid', emoji: '❌' },
        { type: 'fire', emoji: '🔥' },
        { type: 'water', emoji: '💧' }
      ]

      invalidMagicCards.forEach(card => {
        expect(isMagicCard(card)).toBe(false)
      })
    })

    it('should return false for objects with no type property', () => {
      const invalidCard = { emoji: '💨', name: 'Magic Card' }
      expect(isMagicCard(invalidCard)).toBe(false)
    })
  })

  describe('getCardType function (lines 467-471)', () => {
    it('should return "heart" for heart cards', () => {
      const heartCard = new HeartCard('test1', 'red', 2, '❤️')
      expect(getCardType(heartCard)).toBe('heart')

      const heartObject = { color: 'yellow', value: 3, emoji: '💛' }
      expect(getCardType(heartObject)).toBe('heart')
    })

    it('should return "magic" for magic cards', () => {
      const windCard = new WindCard('test2')
      expect(getCardType(windCard)).toBe('magic')

      const recycleObject = { type: 'recycle', emoji: '♻️' }
      expect(getCardType(recycleObject)).toBe('magic')
    })

    it('should return "magic" for all magic card types', () => {
      const magicCards = [
        new WindCard('test3'),
        new RecycleCard('test4'),
        new ShieldCard('test5'),
        { type: 'wind', emoji: '💨' },
        { type: 'recycle', emoji: '♻️' },
        { type: 'shield', emoji: '🛡️' }
      ]

      magicCards.forEach(card => {
        expect(getCardType(card)).toBe('magic')
      })
    })

    it('should return "unknown" for invalid card data', () => {
      const invalidCards = [
        { type: 'invalid', emoji: '❌' },
        { color: 'purple', value: 2, emoji: '💜' }, // Invalid heart color
        { someProperty: 'someValue' },
        {},
        null,
        undefined
      ]

      invalidCards.forEach(card => {
        expect(getCardType(card)).toBe('unknown')
      })
    })

    it('should handle edge cases gracefully', () => {
      expect(getCardType(null)).toBe('unknown')
      expect(getCardType(undefined)).toBe('unknown')
      expect(getCardType({})).toBe('unknown')
      expect(getCardType('string')).toBe('unknown')
      expect(getCardType(123)).toBe('unknown')
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle malformed card data in createCardFromData', () => {
      const malformedData = {
        type: 'heart',
        id: 'test',
        color: null,
        value: undefined,
        emoji: ''
      }

      expect(() => {
        createCardFromData(malformedData)
      }).not.toThrow() // Should still create the card as it has required properties
    })

    it('should handle negative values in heart card generation', () => {
      // Test that generateHeartDeck handles internal edge cases
      const hearts = generateHeartDeck(1)
      expect(hearts).toHaveLength(1)
      expect(hearts[0].value).toBeGreaterThan(0)
    })

    it('should handle Math.random edge cases', () => {
      const originalMathRandom = Math.random

      // Test Math.random returning 0
      Math.random = vi.fn().mockReturnValue(0)
      const card1 = generateRandomMagicCard()
      expect(card1.type).toBe('wind')

      // Test Math.random returning 1 (actually should be less than 1, but test edge case)
      Math.random = vi.fn().mockReturnValue(0.999)
      const card2 = generateRandomMagicCard()
      expect(['wind', 'recycle', 'shield']).toContain(card2.type)

      Math.random = originalMathRandom
    })

    it('should handle Date.now edge cases in card generation', () => {
      const originalDateNow = Date.now

      // Test Date.now returning 0
      Date.now = vi.fn().mockReturnValue(0)
      const heartCard = HeartCard.generateRandom()
      expect(heartCard.id).toBe(0)

      const magicCard = generateRandomMagicCard()
      expect(magicCard.id).toBe(0)

      Date.now = originalDateNow
    })

    it('should handle extremely large counts in generateHeartDeck', () => {
      expect(() => {
        generateHeartDeck(1000)
      }).not.toThrow()

      const hearts = generateHeartDeck(100)
      expect(hearts).toHaveLength(100)
      hearts.forEach(heart => {
        expect(heart).toBeInstanceOf(HeartCard)
      })
    })
  })
})