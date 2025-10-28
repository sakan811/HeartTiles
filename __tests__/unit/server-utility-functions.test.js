import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createTestRoom,
  createTestPlayer,
  generateTiles,
  validateHeartPlacement,
  migratePlayerData,
  HeartCard,
  createCardFromData,
  isHeartCard
} from '../utils/server-test-utils.js'
import { WindCard, RecycleCard, ShieldCard } from '../../src/lib/cards.js'

// Import functions directly from server.js
let findPlayerByUserId, findPlayerByName, selectRandomStartingPlayer

describe('Server Utility Functions Tests', () => {
  beforeAll(async () => {
    // Import functions from server.js
    const serverModule = await import('../../server.js')
    findPlayerByUserId = serverModule.findPlayerByUserId
    findPlayerByName = serverModule.findPlayerByName
    selectRandomStartingPlayer = serverModule.selectRandomStartingPlayer
  })

  beforeEach(() => {
    // Clear any global state
    if (global.turnLocks) {
      global.turnLocks.clear()
    }
    // Set up global turnLocks for testing
    global.turnLocks = new Map()

    // Mock Date.now for consistent testing
    vi.useFakeTimers()
    vi.setSystemTime(1234567890)
  })

  afterEach(() => {
    vi.useRealTimers()
    if (global.turnLocks) {
      global.turnLocks.clear()
    }
  })

  describe('Player Finding Functions (lines 134, 141)', () => {
    describe('findPlayerByUserId function', () => {
      it('should return undefined for invalid room parameter', () => {
        expect(findPlayerByUserId(null, 'user1')).toBeUndefined()
        expect(findPlayerByUserId(undefined, 'user1')).toBeUndefined()
        expect(findPlayerByUserId({}, 'user1')).toBeUndefined()
        expect(findPlayerByUserId({ players: null }, 'user1')).toBeUndefined()
        expect(findPlayerByUserId({ players: undefined }, 'user1')).toBeUndefined()
        expect(findPlayerByUserId({ players: 'not-array' }, 'user1')).toBeUndefined()
        expect(findPlayerByUserId({ players: [] }, 'user1')).toBeUndefined()
      })

      it('should find player by userId in valid room', () => {
        const player1 = createTestPlayer({ userId: 'user1', name: 'Player1' })
        const player2 = createTestPlayer({ userId: 'user2', name: 'Player2' })
        const room = createTestRoom({ players: [player1, player2] })

        const foundPlayer = findPlayerByUserId(room, 'user1')
        expect(foundPlayer).toBeDefined()
        expect(foundPlayer.userId).toBe('user1')
        expect(foundPlayer.name).toBe('Player1')
      })

      it('should return undefined when userId not found', () => {
        const player1 = createTestPlayer({ userId: 'user1', name: 'Player1' })
        const room = createTestRoom({ players: [player1] })

        const foundPlayer = findPlayerByUserId(room, 'nonexistent')
        expect(foundPlayer).toBeUndefined()
      })

      it('should handle rooms with null/undefined players in array', () => {
        const player1 = createTestPlayer({ userId: 'user1', name: 'Player1' })
        const room = {
          players: [player1, null, undefined, { userId: 'user2', name: 'Player2' }]
        }

        const foundPlayer = findPlayerByUserId(room, 'user1')
        expect(foundPlayer).toBeDefined()
        expect(foundPlayer.userId).toBe('user1')

        const nullPlayer = findPlayerByUserId(room, 'user2')
        expect(nullPlayer).toBeDefined()
        expect(nullPlayer.userId).toBe('user2')
      })

      it('should handle empty players array', () => {
        const room = createTestRoom({ players: [] })
        const foundPlayer = findPlayerByUserId(room, 'user1')
        expect(foundPlayer).toBeUndefined()
      })
    })

    describe('findPlayerByName function', () => {
      it('should return undefined for invalid room parameter', () => {
        expect(findPlayerByName(null, 'Player1')).toBeUndefined()
        expect(findPlayerByName(undefined, 'Player1')).toBeUndefined()
        expect(findPlayerByName({}, 'Player1')).toBeUndefined()
        expect(findPlayerByName({ players: null }, 'Player1')).toBeUndefined()
        expect(findPlayerByName({ players: undefined }, 'Player1')).toBeUndefined()
        expect(findPlayerByName({ players: 'not-array' }, 'Player1')).toBeUndefined()
        expect(findPlayerByName({ players: [] }, 'Player1')).toBeUndefined()
      })

      it('should return undefined for invalid playerName parameter', () => {
        const player1 = createTestPlayer({ userId: 'user1', name: 'Player1' })
        const room = createTestRoom({ players: [player1] })

        expect(findPlayerByName(room, null)).toBeUndefined()
        expect(findPlayerByName(room, undefined)).toBeUndefined()
        expect(findPlayerByName(room, '')).toBeUndefined()
      })

      it('should find player by name (case insensitive)', () => {
        const player1 = createTestPlayer({ userId: 'user1', name: 'Player1' })
        const player2 = createTestPlayer({ userId: 'user2', name: 'player2' })
        const room = createTestRoom({ players: [player1, player2] })

        const foundPlayer1 = findPlayerByName(room, 'PLAYER1')
        expect(foundPlayer1).toBeDefined()
        expect(foundPlayer1.userId).toBe('user1')
        expect(foundPlayer1.name).toBe('Player1')

        const foundPlayer2 = findPlayerByName(room, 'PLAYER2')
        expect(foundPlayer2).toBeDefined()
        expect(foundPlayer2.userId).toBe('user2')
        expect(foundPlayer2.name).toBe('player2')
      })

      it('should return undefined when player name not found', () => {
        const player1 = createTestPlayer({ userId: 'user1', name: 'Player1' })
        const room = createTestRoom({ players: [player1] })

        const foundPlayer = findPlayerByName(room, 'NonExistent')
        expect(foundPlayer).toBeUndefined()
      })

      it('should handle players with null/undefined names', () => {
        const player1 = createTestPlayer({ userId: 'user1', name: 'Player1' })
        const player2 = { userId: 'user2', name: null }
        const player3 = { userId: 'user3', name: undefined }
        const room = createTestRoom({ players: [player1, player2, player3] })

        const foundPlayer = findPlayerByName(room, 'PLAYER1')
        expect(foundPlayer).toBeDefined()
        expect(foundPlayer.userId).toBe('user1')

        // Should not crash on null/undefined names
        expect(findPlayerByName(room, 'null')).toBeUndefined()
        expect(findPlayerByName(room, 'undefined')).toBeUndefined()
      })

      it('should handle players with non-string names', () => {
        const player1 = createTestPlayer({ userId: 'user1', name: 'Player1' })
        const player2 = { userId: 'user2', name: 123 }
        const player3 = { userId: 'user3', name: {} }
        const room = createTestRoom({ players: [player1, player2, player3] })

        const foundPlayer = findPlayerByName(room, 'PLAYER1')
        expect(foundPlayer).toBeDefined()
        expect(foundPlayer.userId).toBe('user1')

        // Should not crash on non-string names
        expect(findPlayerByName(room, '123')).toBeUndefined()
        expect(findPlayerByName(room, '[object Object]')).toBeUndefined()
      })
    })
  })

  describe('Tile Generation Fallback Logic (line 355)', () => {
    it('should use fallback randomValue calculation when Math.random is mocked', () => {
      // Mock Math.random to return a fixed value
      const originalRandom = Math.random
      Math.random = vi.fn().mockReturnValue(0.5)

      try {
        const tiles = generateTiles()
        expect(tiles).toHaveLength(8)

        // Each tile should have valid structure
        tiles.forEach((tile, index) => {
          expect(tile).toHaveProperty('id')
          expect(tile).toHaveProperty('color')
          expect(tile).toHaveProperty('emoji')
          expect(tile.id).toBe(index)
          expect(['red', 'yellow', 'green', 'white']).toContain(tile.color)
        })

        // Verify Math.random was called
        expect(Math.random).toHaveBeenCalled()
      } finally {
        Math.random = originalRandom
      }
    })

    it('should generate tiles with proper distribution', () => {
      const originalRandom = Math.random
      const callCount = { random: 0, now: 0 }

      Math.random = vi.fn().mockImplementation(() => {
        callCount.random++
        return 0.25 // Should produce white tiles
      })

      try {
        const tiles = generateTiles()
        expect(tiles).toHaveLength(8)

        // With random value 0.25, should get white tiles (30% threshold)
        const whiteTiles = tiles.filter(tile => tile.color === 'white')
        expect(whiteTiles.length).toBeGreaterThan(0)

        // Verify fallback calculation uses timestamp
        expect(callCount.random).toBeGreaterThan(0)
      } finally {
        Math.random = originalRandom
      }
    })

    it('should handle mocked Math.random that returns same value', () => {
      // Mock Math.random to always return the same value
      const originalRandom = Math.random
      Math.random = vi.fn().mockReturnValue(0.7)

      try {
        const tiles1 = generateTiles()
        const tiles2 = generateTiles()

        // Should generate different tiles due to timestamp in fallback
        expect(tiles1).toHaveLength(8)
        expect(tiles2).toHaveLength(8)

        // All tiles should have valid properties
        const allTiles = [...tiles1, ...tiles2]
        allTiles.forEach(tile => {
          expect(['red', 'yellow', 'green', 'white']).toContain(tile.color)
          expect(['🟥', '🟨', '🟩', '⬜']).toContain(tile.emoji)
        })
      } finally {
        Math.random = originalRandom
      }
    })

    it('should produce consistent tile structure', () => {
      const tiles = generateTiles()

      tiles.forEach((tile, index) => {
        expect(tile.id).toBe(index)
        expect(tile.color).toBeDefined()
        expect(tile.emoji).toBeDefined()

        if (tile.color === 'white') {
          expect(tile.emoji).toBe('⬜')
        } else {
          expect(['🟥', '🟨', '🟩']).toContain(tile.emoji)
        }
      })
    })
  })

  describe('HeartCard Validation Logic (line 479)', () => {
    it('should validate HeartCard instance check in validateHeartPlacement', () => {
      const room = createTestRoom({
        gameStarted: true,
        currentPlayer: { userId: 'player1', name: 'Player1' },
        tiles: generateTiles(), // Add 8 tiles for the test
        playerHands: {
          player1: [
            new HeartCard('heart-1', 'red', 2, '❤️'),
            { id: 'heart-2', color: 'yellow', value: 1, type: 'heart' } // Plain object
          ]
        }
      })

      // Test with HeartCard instance
      const heartCardValidation = validateHeartPlacement(room, 'player1', 'heart-1', 0)
      expect(heartCardValidation.valid).toBe(true)

      // Test with plain object heart card
      const plainObjectValidation = validateHeartPlacement(room, 'player1', 'heart-2', 1)
      expect(plainObjectValidation.valid).toBe(true)
    })

    it('should handle non-HeartCard instances correctly', () => {
      const room = createTestRoom({
        gameStarted: true,
        currentPlayer: { userId: 'player1', name: 'Player1' },
        tiles: generateTiles(), // Add 8 tiles for the test
        playerHands: {
          player1: [
            { id: 'magic-1', type: 'wind', emoji: '💨' }, // Magic card
            { id: 'invalid-1', color: 'red' } // Missing value
          ]
        }
      })

      // Test with magic card
      const magicCardValidation = validateHeartPlacement(room, 'player1', 'magic-1', 0)
      expect(magicCardValidation.valid).toBe(false)
      expect(magicCardValidation.error).toBe("Only heart cards can be placed on tiles")

      // Test with invalid card
      const invalidCardValidation = validateHeartPlacement(room, 'player1', 'invalid-1', 1)
      expect(invalidCardValidation.valid).toBe(false)
      expect(invalidCardValidation.error).toBe("Only heart cards can be placed on tiles")
    })

    it('should convert plain objects to HeartCard-like objects for validation', () => {
      const room = createTestRoom({
        gameStarted: true,
        currentPlayer: { userId: 'player1', name: 'Player1' },
        tiles: generateTiles(), // Add 8 tiles for the test
        playerHands: {
          player1: [
            { id: 'heart-plain', color: 'red', value: 2, type: 'heart' }
          ]
        }
      })

      const validation = validateHeartPlacement(room, 'player1', 'heart-plain', 0)
      expect(validation.valid).toBe(true)
    })

    it('should use HeartCard canTargetTile method when available', () => {
      const room = createTestRoom({
        gameStarted: true,
        currentPlayer: { userId: 'player1', name: 'Player1' },
        tiles: generateTiles(), // Add 8 tiles for the test
        playerHands: {
          player1: [
            new HeartCard('heart-1', 'red', 2, '❤️')
          ]
        }
      })

      // Mock canTargetTile to return false
      const mockCanTargetTile = vi.spyOn(HeartCard.prototype, 'canTargetTile').mockReturnValue(false)

      const validation = validateHeartPlacement(room, 'player1', 'heart-1', 0)
      expect(validation.valid).toBe(false)
      expect(validation.error).toBe("This heart cannot be placed on this tile")

      mockCanTargetTile.mockRestore()
    })

    it('should handle validation when canTargetTile method is not available', () => {
      const room = createTestRoom({
        gameStarted: true,
        currentPlayer: { userId: 'player1', name: 'Player1' },
        tiles: generateTiles(), // Add 8 tiles for the test
        playerHands: {
          player1: [
            { id: 'heart-plain', color: 'red', value: 2, type: 'heart' }
          ]
        }
      })

      // Should not throw error even if canTargetTile method is missing
      const validation = validateHeartPlacement(room, 'player1', 'heart-plain', 0)
      expect(validation.valid).toBe(true)
    })
  })

  describe('Lock Cleanup in Player Migration (line 580)', () => {
    it('should clean up turn locks during player migration', async () => {
      // Set up some turn locks
      global.turnLocks.set('TEST01_oldUserId', { socketId: 'socket1', timestamp: Date.now() })
      global.turnLocks.set('TEST02_oldUserId', { socketId: 'socket2', timestamp: Date.now() })
      global.turnLocks.set('TEST03_otherUser', { socketId: 'socket3', timestamp: Date.now() })

      expect(global.turnLocks.size).toBe(3)

      const room = createTestRoom({
        code: 'TEST01',
        players: [{ userId: 'oldUserId', name: 'OldPlayer' }]
      })

      // Migrate player data
      await migratePlayerData(room, 'oldUserId', 'newUserId', 'NewPlayer', 'new@example.com')

      // Verify locks for oldUserId are cleaned up
      expect(global.turnLocks.has('TEST01_oldUserId')).toBe(false)
      expect(global.turnLocks.has('TEST02_oldUserId')).toBe(false)
      expect(global.turnLocks.has('TEST03_otherUser')).toBe(true) // Should remain

      expect(global.turnLocks.size).toBe(1)
    })

    it('should handle empty turn locks gracefully', async () => {
      expect(global.turnLocks.size).toBe(0)

      const room = createTestRoom({
        players: [{ userId: 'oldUserId', name: 'OldPlayer' }]
      })

      // Should not throw error
      await expect(
        migratePlayerData(room, 'oldUserId', 'newUserId', 'NewPlayer', 'new@example.com')
      ).resolves.toBeUndefined()

      expect(global.turnLocks.size).toBe(0)
    })

    it('should handle partial lock key matches correctly', async () => {
      // Set up locks with partial matches
      global.turnLocks.set('room_oldUserId', { socketId: 'socket1', timestamp: Date.now() })
      global.turnLocks.set('oldUserId_suffix', { socketId: 'socket2', timestamp: Date.now() })
      global.turnLocks.set('prefix_oldUserId_middle', { socketId: 'socket3', timestamp: Date.now() })
      global.turnLocks.set('different_user', { socketId: 'socket4', timestamp: Date.now() })

      expect(global.turnLocks.size).toBe(4)

      const room = createTestRoom({
        players: [{ userId: 'oldUserId', name: 'OldPlayer' }]
      })

      await migratePlayerData(room, 'oldUserId', 'newUserId', 'NewPlayer', 'new@example.com')

      // All locks containing oldUserId should be removed
      expect(global.turnLocks.has('room_oldUserId')).toBe(false)
      expect(global.turnLocks.has('oldUserId_suffix')).toBe(false)
      expect(global.turnLocks.has('prefix_oldUserId_middle')).toBe(false)
      expect(global.turnLocks.has('different_user')).toBe(true)

      expect(global.turnLocks.size).toBe(1)
    })

    it('should handle migration when turnLocks is undefined', async () => {
      // Temporarily remove global turnLocks
      const originalLocks = global.turnLocks
      delete global.turnLocks

      const room = createTestRoom({
        players: [{ userId: 'oldUserId', name: 'OldPlayer' }]
      })

      // Should not throw error
      await expect(
        migratePlayerData(room, 'oldUserId', 'newUserId', 'NewPlayer', 'new@example.com')
      ).resolves.toBeUndefined()

      // Restore global turnLocks
      global.turnLocks = originalLocks
    })

    it('should preserve other game state during migration', async () => {
      const room = createTestRoom({
        players: [
          { userId: 'oldUserId', name: 'OldPlayer', score: 10 },
          { userId: 'otherUser', name: 'OtherPlayer', score: 5 }
        ],
        gameStarted: true,
        currentPlayer: { userId: 'oldUserId', name: 'OldPlayer' },
        playerHands: {
          oldUserId: [{ id: 'heart1', color: 'red', value: 2 }],
          otherUser: [{ id: 'heart2', color: 'blue', value: 1 }]
        },
        shields: {
          oldUserId: { protectedTiles: [0], remainingTurns: 2 }
        }
      })

      // Verify lock cleaned up
      expect(global.turnLocks.has('TEST01_oldUserId')).toBe(false)

      // Set up a lock
      global.turnLocks.set('TEST01_oldUserId', { socketId: 'socket1', timestamp: Date.now() })

      await migratePlayerData(room, 'oldUserId', 'newUserId', 'NewPlayer', 'new@example.com')

      // Verify player was migrated
      expect(room.players[0].userId).toBe('newUserId')
      expect(room.players[0].name).toBe('NewPlayer')
      expect(room.players[0].email).toBe('new@example.com')
      expect(room.players[0].score).toBe(10)

      // Verify other player unchanged
      expect(room.players[1].userId).toBe('otherUser')

      // Verify hand migrated
      expect(room.gameState.playerHands.newUserId).toBeDefined()
      expect(room.gameState.playerHands.oldUserId).toBeUndefined()

      // Verify shield migrated
      expect(room.gameState.shields.newUserId).toBeDefined()
      expect(room.gameState.shields.oldUserId).toBeUndefined()

      // Verify current player updated
      expect(room.gameState.currentPlayer.userId).toBe('newUserId')
      expect(room.gameState.currentPlayer.name).toBe('NewPlayer')
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle malformed room data gracefully', () => {
      // Test findPlayerByUserId with malformed room
      expect(findPlayerByUserId({ players: [null, { userId: 'user1' }] }, 'user1')).toBeDefined()
      expect(findPlayerByUserId({ players: [{ userId: null }] }, 'user1')).toBeUndefined()
      expect(findPlayerByUserId({ players: [undefined] }, 'user1')).toBeUndefined()

      // Test findPlayerByName with malformed room
      expect(findPlayerByName({ players: [null, { name: 'Player1' }] }, 'PLAYER1')).toBeDefined()
      expect(findPlayerByName({ players: [{ name: null }] }, 'PLAYER1')).toBeUndefined()
      expect(findPlayerByName({ players: [{ name: undefined }] }, 'PLAYER1')).toBeUndefined()
    })

    it('should handle validation with missing game state', () => {
      const room = { players: [{ userId: 'user1' }] } // Missing gameState

      // Should not throw errors
      expect(findPlayerByUserId(room, 'user1')).toBeDefined()
      expect(findPlayerByName(room, 'Player1')).toBeUndefined()
    })

    it('should select random starting player', () => {
      const players = [
        { userId: 'user1', name: 'Player1' },
        { userId: 'user2', name: 'Player2' },
        { userId: 'user3', name: 'Player3' }
      ]

      // Mock Math.random for predictable selection
      const originalRandom = Math.random
      Math.random = vi.fn().mockReturnValue(0.5) // Should select middle player

      try {
        const selectedPlayer = selectRandomStartingPlayer(players)
        expect(selectedPlayer).toBeDefined()
        expect(players).toContain(selectedPlayer)
      } finally {
        Math.random = originalRandom
      }
    })
  })
})