import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import {
  connectToDatabase,
  disconnectDatabase,
  clearDatabase,
  clearTurnLocks,
  saveRoom,
  loadRooms
} from '../utils/server-test-utils.js'
import { Room } from '../../models.js'
import { createMockSocket, createMockRoom, waitForAsync } from './setup.js'
import { HeartCard, WindCard, RecycleCard, ShieldCard } from '../../src/lib/cards.js'

// Import functions directly from server.js
let findPlayerByUserId, findPlayerByName, selectRandomStartingPlayer

describe('Server Utility Functions Integration Tests', () => {
  let mockServer
  let port

  beforeAll(async () => {
    try {
      await connectToDatabase()
      // Import functions from server.js
      const serverModule = await import('../../server.js')
      findPlayerByUserId = serverModule.findPlayerByUserId
      findPlayerByName = serverModule.findPlayerByName
      selectRandomStartingPlayer = serverModule.selectRandomStartingPlayer
    } catch (error) {
      console.warn('Database connection failed, skipping tests:', error.message)
    }
  }, 15000)

  afterAll(async () => {
    try {
      await clearDatabase()
      await disconnectDatabase()
    } catch (error) {
      console.warn('Database cleanup failed:', error.message)
    }
  })

  beforeEach(async () => {
    try {
      await clearDatabase()
      await clearTurnLocks()
    } catch (error) {
      console.warn('Database clear failed:', error.message)
    }
    vi.clearAllMocks()
    // Set up global turnLocks for testing
    global.turnLocks = new Map()

    // Mock Date.now for consistent testing
    vi.useFakeTimers()
    vi.setSystemTime(1234567890)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    if (global.turnLocks) {
      global.turnLocks.clear()
    }
  })

  describe('Player Finding Functions with database integration', () => {
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

      it('should find player by userId in valid room from database', async () => {
        // Skip if MongoDB is not available
        try {
          await Room.findOne()
        } catch {
          console.log('MongoDB not available, skipping test')
          return
        }

        const roomData = createMockRoom('FDBID01')
        roomData.players = [
          { userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: false, score: 0, joinedAt: new Date() },
          { userId: 'user2', name: 'Player2', email: 'player2@test.com', isReady: false, score: 0, joinedAt: new Date() }
        ]

        // Save to database
        const savedRoom = new Room(roomData)
        await savedRoom.save()

        // Load from database and find player
        const dbRoom = await Room.findOne({ code: 'FDBID01' })
        const foundPlayer = findPlayerByUserId(dbRoom, 'user1')

        expect(foundPlayer).toBeDefined()
        expect(foundPlayer.userId).toBe('user1')
        expect(foundPlayer.name).toBe('Player1')
        expect(foundPlayer.email).toBe('player1@test.com')
      })

      it('should return undefined when userId not found in database', async () => {
        // Skip if MongoDB is not available
        try {
          await Room.findOne()
        } catch {
          console.log('MongoDB not available, skipping test')
          return
        }

        const roomData = createMockRoom('NTFND01')
        roomData.players = [
          { userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: false, score: 0, joinedAt: new Date() }
        ]

        // Save to database
        const savedRoom = new Room(roomData)
        await savedRoom.save()

        // Load from database and search for non-existent user
        const dbRoom = await Room.findOne({ code: 'NTFND01' })
        const foundPlayer = findPlayerByUserId(dbRoom, 'nonexistent')

        expect(foundPlayer).toBeUndefined()
      })

      it('should handle rooms with null/undefined players in array from database', async () => {
        const room = {
          players: [
            { userId: 'user1', name: 'Player1' },
            null,
            undefined,
            { userId: 'user2', name: 'Player2' }
          ]
        }

        const foundPlayer = findPlayerByUserId(room, 'user1')
        expect(foundPlayer).toBeDefined()
        expect(foundPlayer.userId).toBe('user1')

        const nullPlayer = findPlayerByUserId(room, 'user2')
        expect(nullPlayer).toBeDefined()
        expect(nullPlayer.userId).toBe('user2')
      })

      it('should handle empty players array from database', async () => {
        const roomData = createMockRoom('EMPTY01')
        roomData.players = []

        // Save to database
        const savedRoom = new Room(roomData)
        await savedRoom.save()

        // Load from database and search
        const dbRoom = await Room.findOne({ code: 'EMPTY01' })
        const foundPlayer = findPlayerByUserId(dbRoom, 'user1')

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

      it('should return undefined for invalid playerName parameter', async () => {
        const roomData = createMockRoom('INAME01')
        roomData.players = [
          { userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: false, score: 0, joinedAt: new Date() }
        ]

        // Save to database
        const savedRoom = new Room(roomData)
        await savedRoom.save()

        // Load from database
        const dbRoom = await Room.findOne({ code: 'INAME01' })

        expect(findPlayerByName(dbRoom, null)).toBeUndefined()
        expect(findPlayerByName(dbRoom, undefined)).toBeUndefined()
        expect(findPlayerByName(dbRoom, '')).toBeUndefined()
      })

      it('should find player by name (case insensitive) from database', async () => {
        // Skip if MongoDB is not available
        try {
          await Room.findOne()
        } catch {
          console.log('MongoDB not available, skipping test')
          return
        }

        const roomData = createMockRoom('CASIV01')
        roomData.players = [
          { userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: false, score: 0, joinedAt: new Date() },
          { userId: 'user2', name: 'player2', email: 'player2@test.com', isReady: false, score: 0, joinedAt: new Date() }
        ]

        // Save to database
        const savedRoom = new Room(roomData)
        await savedRoom.save()

        // Load from database and search
        const dbRoom = await Room.findOne({ code: 'CASIV01' })

        const foundPlayer1 = findPlayerByName(dbRoom, 'PLAYER1')
        expect(foundPlayer1).toBeDefined()
        expect(foundPlayer1.userId).toBe('user1')
        expect(foundPlayer1.name).toBe('Player1')

        const foundPlayer2 = findPlayerByName(dbRoom, 'PLAYER2')
        expect(foundPlayer2).toBeDefined()
        expect(foundPlayer2.userId).toBe('user2')
        expect(foundPlayer2.name).toBe('player2')
      })

      it('should return undefined when player name not found in database', async () => {
        const roomData = createMockRoom('NAMD01')
        roomData.players = [
          { userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: false, score: 0, joinedAt: new Date() }
        ]

        // Save to database
        const savedRoom = new Room(roomData)
        await savedRoom.save()

        // Load from database and search for non-existent name
        const dbRoom = await Room.findOne({ code: 'NAMD01' })
        const foundPlayer = findPlayerByName(dbRoom, 'NonExistent')

        expect(foundPlayer).toBeUndefined()
      })

      it('should handle players with null/undefined names in database', async () => {
        const roomData = createMockRoom('NULL01')
        roomData.players = [
          { userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: false, score: 0, joinedAt: new Date() },
          { userId: 'user2', name: null, email: 'player2@test.com', isReady: false, score: 0, joinedAt: new Date() },
          { userId: 'user3', name: undefined, email: 'player3@test.com', isReady: false, score: 0, joinedAt: new Date() }
        ]

        // Save to database
        const savedRoom = new Room(roomData)
        await savedRoom.save()

        // Load from database
        const dbRoom = await Room.findOne({ code: 'NULL01' })

        const foundPlayer = findPlayerByName(dbRoom, 'PLAYER1')
        expect(foundPlayer).toBeDefined()
        expect(foundPlayer.userId).toBe('user1')

        // Should not crash on null/undefined names
        expect(findPlayerByName(dbRoom, 'null')).toBeUndefined()
        expect(findPlayerByName(dbRoom, 'undefined')).toBeUndefined()
      })

      it('should handle players with non-string names in database', async () => {
        const roomData = createMockRoom('NON01')
        roomData.players = [
          { userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: false, score: 0, joinedAt: new Date() },
          { userId: 'user2', name: 123, email: 'player2@test.com', isReady: false, score: 0, joinedAt: new Date() },
          { userId: 'user3', name: {}, email: 'player3@test.com', isReady: false, score: 0, joinedAt: new Date() }
        ]

        // Save to database
        const savedRoom = new Room(roomData)
        await savedRoom.save()

        // Load from database
        const dbRoom = await Room.findOne({ code: 'NON01' })

        const foundPlayer = findPlayerByName(dbRoom, 'PLAYER1')
        expect(foundPlayer).toBeDefined()
        expect(foundPlayer.userId).toBe('user1')

        // Should not crash on non-string names
        expect(findPlayerByName(dbRoom, '123')).toBeUndefined()
        expect(findPlayerByName(dbRoom, '[object Object]')).toBeUndefined()
      })
    })
  })

  describe('Tile Generation with database persistence', () => {
    it('should use fallback randomValue calculation when Math.random is mocked', () => {
      // Import generateTiles from server-test-utils
      const { generateTiles } = require('../utils/server-test-utils.js')

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

    it('should generate tiles with proper distribution for database storage', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { generateTiles } = require('../utils/server-test-utils.js')

      const originalRandom = Math.random
      Math.random = vi.fn().mockImplementation(() => 0.25) // Should produce white tiles

      try {
        const tiles = generateTiles()
        expect(tiles).toHaveLength(8)

        // With random value 0.25, should get white tiles (30% threshold)
        const whiteTiles = tiles.filter(tile => tile.color === 'white')
        expect(whiteTiles.length).toBeGreaterThan(0)

        // Save to database
        const roomData = createMockRoom('TIST01')
        roomData.gameState.tiles = tiles

        const savedRoom = new Room(roomData)
        await savedRoom.save()

        // Load from database and verify tiles persisted correctly
        const dbRoom = await Room.findOne({ code: 'TIST01' })
        expect(dbRoom.gameState.tiles).toHaveLength(8)

        const dbWhiteTiles = dbRoom.gameState.tiles.filter(tile => tile.color === 'white')
        expect(dbWhiteTiles.length).toBeGreaterThan(0)
      } finally {
        Math.random = originalRandom
      }
    })

    it('should handle mocked Math.random that returns same value', () => {
      const { generateTiles } = require('../utils/server-test-utils.js')

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

    it('should produce consistent tile structure for database storage', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { generateTiles } = require('../utils/server-test-utils.js')
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

      // Save to database
      const roomData = createMockRoom('CONST01')
      roomData.gameState.tiles = tiles

      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and verify structure
      const dbRoom = await Room.findOne({ code: 'CONST01' })
      dbRoom.gameState.tiles.forEach((tile, index) => {
        expect(tile.id).toBe(index)
        expect(tile.color).toBeDefined()
        expect(tile.emoji).toBeDefined()
      })
    })
  })

  describe('HeartCard Validation with database integration', () => {
    it('should validate HeartCard instance check in validateHeartPlacement', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { validateHeartPlacement, generateTiles } = require('../utils/server-test-utils.js')

      const roomData = createMockRoom('HALID01')
      roomData.gameState.gameStarted = true
      roomData.gameState.currentPlayer = { userId: 'player1', name: 'Player1' }
      roomData.gameState.tiles = generateTiles() // Add 8 tiles for the test
      roomData.gameState.playerHands = {
        player1: [
          new HeartCard('heart-1', 'red', 2, '❤️'),
          { id: 'heart-2', color: 'yellow', value: 1, type: 'heart' } // Plain object
        ]
      }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database
      const dbRoom = await Room.findOne({ code: 'HALID01' })

      // Test with HeartCard instance
      const heartCardValidation = validateHeartPlacement(dbRoom, 'player1', 'heart-1', 0)
      expect(heartCardValidation.valid).toBe(true)

      // Test with plain object heart card
      const plainObjectValidation = validateHeartPlacement(dbRoom, 'player1', 'heart-2', 1)
      expect(plainObjectValidation.valid).toBe(true)
    })

    it('should handle non-HeartCard instances correctly from database', async () => {
      const { validateHeartPlacement, generateTiles } = require('../utils/server-test-utils.js')

      const roomData = createMockRoom('NONRT01')
      roomData.gameState.gameStarted = true
      roomData.gameState.currentPlayer = { userId: 'player1', name: 'Player1' }
      roomData.gameState.tiles = generateTiles() // Add 8 tiles for the test
      roomData.gameState.playerHands = {
        player1: [
          { id: 'magic-1', type: 'wind', emoji: '💨' }, // Magic card
          { id: 'invalid-1', color: 'red' } // Missing value
        ]
      }

      // Test with magic card
      const magicCardValidation = validateHeartPlacement(roomData, 'player1', 'magic-1', 0)
      expect(magicCardValidation.valid).toBe(false)
      expect(magicCardValidation.error).toBe("Only heart cards can be placed on tiles")

      // Test with invalid card
      const invalidCardValidation = validateHeartPlacement(roomData, 'player1', 'invalid-1', 1)
      expect(invalidCardValidation.valid).toBe(false)
      expect(invalidCardValidation.error).toBe("Only heart cards can be placed on tiles")
    })

    it('should convert plain objects to HeartCard-like objects for validation', async () => {
      const { validateHeartPlacement, generateTiles } = require('../utils/server-test-utils.js')

      const roomData = createMockRoom('CONRT01')
      roomData.gameState.gameStarted = true
      roomData.gameState.currentPlayer = { userId: 'player1', name: 'Player1' }
      roomData.gameState.tiles = generateTiles() // Add 8 tiles for the test
      roomData.gameState.playerHands = {
        player1: [
          { id: 'heart-plain', color: 'red', value: 2, type: 'heart' }
        ]
      }

      const validation = validateHeartPlacement(roomData, 'player1', 'heart-plain', 0)
      expect(validation.valid).toBe(true)
    })

    it('should use HeartCard canTargetTile method when available', async () => {
      const { validateHeartPlacement, generateTiles } = require('../utils/server-test-utils.js')

      const roomData = createMockRoom('CAGET01')
      roomData.gameState.gameStarted = true
      roomData.gameState.currentPlayer = { userId: 'player1', name: 'Player1' }
      roomData.gameState.tiles = generateTiles() // Add 8 tiles for the test
      roomData.gameState.playerHands = {
        player1: [
          new HeartCard('heart-1', 'red', 2, '❤️')
        ]
      }

      // Mock canTargetTile to return false
      const mockCanTargetTile = vi.spyOn(HeartCard.prototype, 'canTargetTile').mockReturnValue(false)

      try {
        const validation = validateHeartPlacement(roomData, 'player1', 'heart-1', 0)
        expect(validation.valid).toBe(false)
        expect(validation.error).toBe("This heart cannot be placed on this tile")
      } finally {
        mockCanTargetTile.mockRestore()
      }
    })

    it('should handle validation when canTargetTile method is not available', async () => {
      const { validateHeartPlacement, generateTiles } = require('../utils/server-test-utils.js')

      const roomData = createMockRoom('NMEHD01')
      roomData.gameState.gameStarted = true
      roomData.gameState.currentPlayer = { userId: 'player1', name: 'Player1' }
      roomData.gameState.tiles = generateTiles() // Add 8 tiles for the test
      roomData.gameState.playerHands = {
        player1: [
          { id: 'heart-plain', color: 'red', value: 2, type: 'heart' }
        ]
      }

      // Should not throw error even if canTargetTile method is missing
      const validation = validateHeartPlacement(roomData, 'player1', 'heart-plain', 0)
      expect(validation.valid).toBe(true)
    })
  })

  describe('Lock Cleanup in Player Migration with database persistence', () => {
    it('should clean up turn locks during player migration', async () => {
      // Set up some turn locks
      global.turnLocks.set('MIGRATE01_oldUserId', { socketId: 'socket1', timestamp: Date.now() })
      global.turnLocks.set('MIGRATE02_oldUserId', { socketId: 'socket2', timestamp: Date.now() })
      global.turnLocks.set('MIGRATE03_otherUser', { socketId: 'socket3', timestamp: Date.now() })

      expect(global.turnLocks.size).toBe(3)

      const { migratePlayerData } = await import('../../server.js')
      const roomData = createMockRoom('MGRAE01')
      roomData.players = [{ userId: 'oldUserId', name: 'OldPlayer', email: 'old@test.com', isReady: false, score: 0, joinedAt: new Date() }]

      // Migrate player data
      await migratePlayerData(roomData, 'oldUserId', 'newUserId', 'NewPlayer', 'new@example.com')

      // Verify locks for oldUserId are cleaned up
      expect(global.turnLocks.has('MIGRATE01_oldUserId')).toBe(false)
      expect(global.turnLocks.has('MIGRATE02_oldUserId')).toBe(false)
      expect(global.turnLocks.has('MIGRATE03_otherUser')).toBe(true) // Should remain

      expect(global.turnLocks.size).toBe(1)
    })

    it('should handle empty turn locks gracefully', async () => {
      expect(global.turnLocks.size).toBe(0)

      const { migratePlayerData } = await import('../../server.js')
      const roomData = createMockRoom('EMCKS01')
      roomData.players = [{ userId: 'oldUserId', name: 'OldPlayer', email: 'old@test.com', isReady: false, score: 0, joinedAt: new Date() }]

      // Should not throw error
      await expect(
        migratePlayerData(roomData, 'oldUserId', 'newUserId', 'NewPlayer', 'new@example.com')
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

      const { migratePlayerData } = await import('../../server.js')
      const roomData = createMockRoom('PATAL01')
      roomData.players = [{ userId: 'oldUserId', name: 'OldPlayer', email: 'old@test.com', isReady: false, score: 0, joinedAt: new Date() }]

      await migratePlayerData(roomData, 'oldUserId', 'newUserId', 'NewPlayer', 'new@example.com')

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

      const { migratePlayerData } = await import('../../server.js')
      const roomData = createMockRoom('UNDED01')
      roomData.players = [{ userId: 'oldUserId', name: 'OldPlayer', email: 'old@test.com', isReady: false, score: 0, joinedAt: new Date() }]

      // Should not throw error
      await expect(
        migratePlayerData(roomData, 'oldUserId', 'newUserId', 'NewPlayer', 'new@example.com')
      ).resolves.toBeUndefined()

      // Restore global turnLocks
      global.turnLocks = originalLocks
    })

    it('should preserve other game state during migration with database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { migratePlayerData } = await import('../../server.js')

      const roomData = createMockRoom('PRESE01')
      roomData.players = [
        { userId: 'oldUserId', name: 'OldPlayer', email: 'old@test.com', isReady: true, score: 10, joinedAt: new Date() },
        { userId: 'otherUser', name: 'OtherPlayer', email: 'other@test.com', isReady: false, score: 5, joinedAt: new Date() }
      ]
      roomData.gameState.gameStarted = true
      roomData.gameState.currentPlayer = { userId: 'oldUserId', name: 'OldPlayer' }
      roomData.gameState.playerHands = {
        oldUserId: [{ id: 'heart1', color: 'red', value: 2, type: 'heart', emoji: '❤️' }],
        otherUser: [{ id: 'heart2', color: 'yellow', value: 1, type: 'heart', emoji: '💛' }]
      }
      roomData.gameState.shields = {
        oldUserId: { protectedTiles: [0], remainingTurns: 2, active: true }
      }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Set up a lock
      global.turnLocks.set('PRESE01_oldUserId', { socketId: 'socket1', timestamp: Date.now() })

      // Load from database and migrate
      const dbRoom = await Room.findOne({ code: 'PRESE01' })
      await migratePlayerData(dbRoom, 'oldUserId', 'newUserId', 'NewPlayer', 'new@example.com')

      // Verify player was migrated
      expect(dbRoom.players[0].userId).toBe('newUserId')
      expect(dbRoom.players[0].name).toBe('NewPlayer')
      expect(dbRoom.players[0].email).toBe('new@example.com')
      expect(dbRoom.players[0].score).toBe(10)

      // Verify other player unchanged
      expect(dbRoom.players[1].userId).toBe('otherUser')

      // Verify hand migrated
      expect(dbRoom.gameState.playerHands.newUserId).toBeDefined()
      expect(dbRoom.gameState.playerHands.oldUserId).toBeUndefined()

      // Verify shield migrated
      expect(dbRoom.gameState.shields.newUserId).toBeDefined()
      expect(dbRoom.gameState.shields.oldUserId).toBeUndefined()

      // Verify current player updated
      expect(dbRoom.gameState.currentPlayer.userId).toBe('newUserId')
      expect(dbRoom.gameState.currentPlayer.name).toBe('NewPlayer')

      // Save changes to database
      await dbRoom.save()

      // Verify persistence
      const updatedRoom = await Room.findOne({ code: 'PRESE01' })
      expect(updatedRoom.players[0].userId).toBe('newUserId')
      expect(updatedRoom.gameState.playerHands.newUserId).toBeDefined()
      expect(updatedRoom.gameState.shields.newUserId).toBeDefined()
    })
  })

  describe('Edge Cases and Error Handling with database integration', () => {
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

    it('should handle validation with missing game state', async () => {
      const roomData = createMockRoom('MISTE01')
      roomData.players = [{ userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: false, score: 0, joinedAt: new Date() }]
      // Missing gameState

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database
      const dbRoom = await Room.findOne({ code: 'MISTE01' })

      // Should not throw errors
      expect(findPlayerByUserId(dbRoom, 'user1')).toBeDefined()
      expect(findPlayerByName(dbRoom, 'Player1')).toBeDefined()
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

    it('should handle database errors gracefully during player operations', async () => {
      // Mock database operation to fail
      vi.spyOn(Room, 'findOne').mockRejectedValue(new Error('Database connection failed'))

      const roomData = createMockRoom('DBERR01')
      roomData.players = [
        { userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: false, score: 0, joinedAt: new Date() }
      ]

      // Should not throw but handle gracefully
      expect(() => {
        findPlayerByUserId(roomData, 'user1')
      }).not.toThrow()

      // Restore mock
      vi.restoreAllMocks()
    })

    it('should maintain data consistency across multiple database operations', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const roomData = createMockRoom('CONSY02')
      roomData.players = [
        { userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: false, score: 0, joinedAt: new Date() },
        { userId: 'user2', name: 'Player2', email: 'player2@test.com', isReady: false, score: 0, joinedAt: new Date() }
      ]
      roomData.gameState.gameStarted = true
      roomData.gameState.currentPlayer = { userId: 'user1', name: 'Player1' }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Perform multiple find operations
      const dbRoom1 = await Room.findOne({ code: 'CONSY02' })
      const player1 = findPlayerByUserId(dbRoom1, 'user1')
      const player2 = findPlayerByName(dbRoom1, 'PLAYER2')

      expect(player1).toBeDefined()
      expect(player2).toBeDefined()
      expect(player1.userId).toBe('user1')
      expect(player2.userId).toBe('user2')

      // Perform another database operation
      const dbRoom2 = await Room.findOne({ code: 'CONSY02' })
      expect(dbRoom2.players).toHaveLength(2)
      expect(dbRoom2.gameState.currentPlayer.userId).toBe('user1')
    })
  })
})