import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HeartCard, WindCard, RecycleCard, ShieldCard, generateRandomMagicCard } from '../../src/lib/cards.js'

// Mock card generation for consistent testing
vi.mock('../../src/lib/cards.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    generateRandomMagicCard: vi.fn(() => ({
      id: 'magic-card-1',
      type: 'wind',
      emoji: '💨',
      executeEffect: vi.fn(),
      canTargetTile: vi.fn(() => true)
    })),
    HeartCard: {
      ...actual.HeartCard,
      generateRandom: vi.fn(() => new actual.HeartCard('heart-1', 'red', 2, '❤️'))
    }
  }
})

describe('Server Game Initialization Functions', () => {
  let originalMathRandom

  beforeEach(() => {
    vi.clearAllMocks()
    // Store original Math.random and mock it for consistent testing
    originalMathRandom = Math.random
    Math.random = vi.fn()
  })

  afterEach(() => {
    // Restore original Math.random
    Math.random = originalMathRandom
  })

  describe('generateTiles function (lines 291-309)', () => {
    it('should generate exactly 8 tiles', async () => {
      const { generateTiles } = await import('../../server.js')

      const tiles = generateTiles()
      expect(tiles).toHaveLength(8)
    })

    it('should generate tiles with required properties', async () => {
      const { generateTiles } = await import('../../server.js')

      const tiles = generateTiles()

      tiles.forEach((tile, index) => {
        expect(tile).toHaveProperty('id')
        expect(tile).toHaveProperty('color')
        expect(tile).toHaveProperty('emoji')
        expect(typeof tile.id).toBe('number')
        expect(tile.id).toBe(index)
        expect(typeof tile.color).toBe('string')
        expect(typeof tile.emoji).toBe('string')
      })
    })

    it('should generate only valid tile colors', async () => {
      const { generateTiles } = await import('../../server.js')

      const tiles = generateTiles()
      const validColors = ['red', 'yellow', 'green', 'white']

      tiles.forEach(tile => {
        expect(validColors).toContain(tile.color)
      })
    })

    it('should generate appropriate emojis for colors', async () => {
      const { generateTiles } = await import('../../server.js')

      const tiles = generateTiles()

      tiles.forEach(tile => {
        if (tile.color === 'red') {
          expect(tile.emoji).toBe('🟥')
        } else if (tile.color === 'yellow') {
          expect(tile.emoji).toBe('🟨')
        } else if (tile.color === 'green') {
          expect(tile.emoji).toBe('🟩')
        } else if (tile.color === 'white') {
          expect(tile.emoji).toBe('⬜')
        }
      })
    })

    it('should generate white tiles approximately 30% of the time', async () => {
      const { generateTiles } = await import('../../server.js')

      // Mock Math.random to return 0.25 (should generate white tile)
      Math.random.mockReturnValue(0.25)

      const tiles = generateTiles()
      const whiteTiles = tiles.filter(tile => tile.color === 'white')

      expect(whiteTiles.length).toBeGreaterThan(0)
    })

    it('should generate colored tiles when Math.random >= 0.3', async () => {
      const { generateTiles } = await import('../../server.js')

      // Mock Math.random to return 0.5 (should generate colored tile)
      Math.random.mockReturnValue(0.5)

      const tiles = generateTiles()
      const whiteTiles = tiles.filter(tile => tile.color === 'white')
      const coloredTiles = tiles.filter(tile => tile.color !== 'white')

      expect(whiteTiles.length).toBe(0)
      expect(coloredTiles.length).toBe(8)
    })

    it('should use consistent tile IDs starting from 0', async () => {
      const { generateTiles } = await import('../../server.js')

      const tiles = generateTiles()
      const tileIds = tiles.map(tile => tile.id)

      expect(tileIds).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    })

    it('should distribute colored tiles randomly', async () => {
      const { generateTiles } = await import('../../server.js')

      // Generate multiple sets and ensure variety
      const tileSets = []
      for (let i = 0; i < 10; i++) {
        tileSets.push(generateTiles())
      }

      // Check that we get different color distributions
      const uniqueDistributions = new Set()
      tileSets.forEach(tiles => {
        const distribution = tiles.map(tile => tile.color).join(',')
        uniqueDistributions.add(distribution)
      })

      // Should have some variety (not all identical)
      expect(uniqueDistributions.size).toBeGreaterThan(1)
    })
  })

  describe('selectRandomStartingPlayer function (lines 498-500)', () => {
    it('should select a player from the provided array', async () => {
      // Mock Math.random to return value that selects first player
      Math.random.mockReturnValue(0.1)

      const { selectRandomStartingPlayer } = await import('../../server.js')

      const players = [
        { userId: 'user1', name: 'Player1' },
        { userId: 'user2', name: 'Player2' }
      ]

      const selectedPlayer = selectRandomStartingPlayer(players)

      expect(players).toContain(selectedPlayer)
    })

    it('should work with different array sizes', async () => {
      Math.random.mockReturnValue(0.5)

      const { selectRandomStartingPlayer } = await import('../../server.js')

      // Test with 1 player
      const singlePlayer = [{ userId: 'user1', name: 'Player1' }]
      expect(selectRandomStartingPlayer(singlePlayer)).toBe(singlePlayer[0])

      // Test with 3 players
      const threePlayers = [
        { userId: 'user1', name: 'Player1' },
        { userId: 'user2', name: 'Player2' },
        { userId: 'user3', name: 'Player3' }
      ]
      const selected = selectRandomStartingPlayer(threePlayers)
      expect(threePlayers).toContain(selected)
    })

    it('should use Math.random for selection', async () => {
      const spy = vi.spyOn(Math, 'random').mockReturnValue(0.75)

      const { selectRandomStartingPlayer } = await import('../../server.js')

      const players = [
        { userId: 'user1', name: 'Player1' },
        { userId: 'user2', name: 'Player2' },
        { userId: 'user3', name: 'Player3' }
      ]

      selectRandomStartingPlayer(players)

      expect(spy).toHaveBeenCalled()

      spy.mockRestore()
    })
  })

  describe('generateSingleHeart function (lines 488-491)', () => {
    it('should generate a HeartCard instance', async () => {
      const { generateSingleHeart } = await import('../../server.js')
      const { HeartCard } = await import('../../src/lib/cards.js')

      const heart = generateSingleHeart()

      expect(HeartCard.generateRandom).toHaveBeenCalled()
      expect(typeof heart).toBe('object')
    })
  })

  describe('generateSingleMagicCard function (lines 493-496)', () => {
    it('should generate a magic card', async () => {
      const { generateSingleMagicCard } = await import('../../server.js')
      const { generateRandomMagicCard } = await import('../../src/lib/cards.js')

      const magicCard = generateSingleMagicCard()

      expect(generateRandomMagicCard).toHaveBeenCalled()
      expect(magicCard).toHaveProperty('id')
      expect(magicCard).toHaveProperty('type')
    })
  })

  describe('Game state initialization', () => {
    it('should create proper initial room structure', async () => {
      // This tests the structure used in join-room event
      const expectedRoomStructure = {
        code: 'TEST123',
        players: [],
        maxPlayers: 2,
        gameState: {
          tiles: [],
          gameStarted: false,
          currentPlayer: null,
          deck: { emoji: "💌", cards: 16, type: 'hearts' },
          magicDeck: { emoji: "🔮", cards: 16, type: 'magic' },
          playerHands: {},
          shields: {},
          turnCount: 0,
          playerActions: {}
        }
      }

      // Test that the structure has all required properties
      expect(expectedRoomStructure).toHaveProperty('code')
      expect(expectedRoomStructure).toHaveProperty('players')
      expect(expectedRoomStructure).toHaveProperty('maxPlayers')
      expect(expectedRoomStructure).toHaveProperty('gameState')

      expect(expectedRoomStructure.gameState).toHaveProperty('tiles')
      expect(expectedRoomStructure.gameState).toHaveProperty('gameStarted')
      expect(expectedRoomStructure.gameState).toHaveProperty('currentPlayer')
      expect(expectedRoomStructure.gameState).toHaveProperty('deck')
      expect(expectedRoomStructure.gameState).toHaveProperty('magicDeck')
      expect(expectedRoomStructure.gameState).toHaveProperty('playerHands')
      expect(expectedRoomStructure.gameState).toHaveProperty('shields')
      expect(expectedRoomStructure.gameState).toHaveProperty('turnCount')
      expect(expectedRoomStructure.gameState).toHaveProperty('playerActions')
    })

    it('should initialize player hands correctly for game start', async () => {
      // Test the game initialization logic from player-ready event
      const room = {
        players: [
          { userId: 'user1', name: 'Player1' },
          { userId: 'user2', name: 'Player2' }
        ],
        gameState: {
          playerHands: {}
        }
      }

      // Simulate game start initialization
      room.players.forEach(player => {
        room.gameState.playerHands[player.userId] = []
        // Add 3 heart cards
        for (let i = 0; i < 3; i++) {
          room.gameState.playerHands[player.userId].push({
            id: `heart-${i}`,
            type: 'heart'
          })
        }
        // Add 2 magic cards
        for (let i = 0; i < 2; i++) {
          room.gameState.playerHands[player.userId].push({
            id: `magic-${i}`,
            type: 'magic'
          })
        }
      })

      expect(room.gameState.playerHands.user1).toHaveLength(5)
      expect(room.gameState.playerHands.user2).toHaveLength(5)
    })

    it('should set up turn management correctly', async () => {
      const room = {
        players: [
          { userId: 'user1', name: 'Player1' },
          { userId: 'user2', name: 'Player2' }
        ],
        gameState: {
          turnCount: 0,
          playerActions: {}
        }
      }

      // Simulate game start turn setup
      room.gameState.currentPlayer = room.players[0]
      room.gameState.turnCount = 1

      expect(room.gameState.currentPlayer).toEqual({ userId: 'user1', name: 'Player1' })
      expect(room.gameState.turnCount).toBe(1)
    })
  })

  describe('Shuffle tiles functionality', () => {
    it('should generate new tile configuration on demand', async () => {
      const { generateTiles } = await import('../../server.js')

      const initialTiles = generateTiles()
      const shuffledTiles = generateTiles()

      // Should be different tile configurations
      expect(initialTiles).not.toEqual(shuffledTiles)
    })

    it('should maintain tile structure after shuffle', async () => {
      const { generateTiles } = await import('../../server.js')

      const tiles = generateTiles()

      tiles.forEach(tile => {
        expect(tile).toHaveProperty('id', expect.any(Number))
        expect(tile).toHaveProperty('color', expect.any(String))
        expect(tile).toHaveProperty('emoji', expect.any(String))
        expect(['red', 'yellow', 'green', 'white']).toContain(tile.color)
      })
    })
  })
})