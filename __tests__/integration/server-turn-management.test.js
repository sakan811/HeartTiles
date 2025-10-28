import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import {
  connectToDatabase,
  disconnectDatabase,
  clearDatabase,
  clearTurnLocks
} from '../utils/server-test-utils.js'
import { Room } from '../../models.js'
import { createMockRoom } from './setup.js'

describe('Server Turn Management Integration Tests', () => {

  beforeAll(async () => {
    try {
      await connectToDatabase()
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
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (global.turnLocks) {
      global.turnLocks.clear()
    }
  })

  describe('recordCardDraw function with database persistence', () => {
    it('should record heart card draw correctly in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { recordCardDraw } = await import('../../server.js')

      const roomData = createMockRoom('HRTDRAW')
      roomData.gameState.playerActions = {}

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and record card draw
      const dbRoom = await Room.findOne({ code: 'HRTDRAW' })
      recordCardDraw(dbRoom, 'user1', 'heart')

      expect(dbRoom.gameState.playerActions.user1.drawnHeart).toBe(true)
      expect(dbRoom.gameState.playerActions.user1.drawnMagic).toBe(false)

      // Save to database
      await dbRoom.save()

      // Verify persistence
      const updatedRoom = await Room.findOne({ code: 'HRTDRAW' })
      expect(updatedRoom.gameState.playerActions.user1.drawnHeart).toBe(true)
    })

    it('should record magic card draw correctly in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { recordCardDraw } = await import('../../server.js')

      const roomData = createMockRoom('MGCDRAW')
      roomData.gameState.playerActions = {}

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and record card draw
      const dbRoom = await Room.findOne({ code: 'MGCDRAW' })
      recordCardDraw(dbRoom, 'user1', 'magic')

      expect(dbRoom.gameState.playerActions.user1.drawnHeart).toBe(false)
      expect(dbRoom.gameState.playerActions.user1.drawnMagic).toBe(true)

      // Save to database
      await dbRoom.save()

      // Verify persistence
      const updatedRoom = await Room.findOne({ code: 'MGCDRAW' })
      expect(updatedRoom.gameState.playerActions.user1.drawnMagic).toBe(true)
    })

    it('should initialize player actions if missing in database', async () => {
      const { recordCardDraw } = await import('../../server.js')

      const room = { gameState: {} }

      recordCardDraw(room, 'user1', 'heart')

      expect(room.gameState.playerActions).toBeDefined()
      expect(room.gameState.playerActions.user1).toBeDefined()
      expect(room.gameState.playerActions.user1).toEqual({
        drawnHeart: true,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0
      })
    })

    it('should preserve existing action data in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { recordCardDraw } = await import('../../server.js')

      const roomData = createMockRoom('PRESERV')
      roomData.gameState.playerActions = {
        user1: {
          drawnMagic: true,
          heartsPlaced: 1
        }
      }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and record additional card draw
      const dbRoom = await Room.findOne({ code: 'PRESERV' })
      recordCardDraw(dbRoom, 'user1', 'heart')

      expect(dbRoom.gameState.playerActions.user1).toEqual({
        drawnHeart: true,
        drawnMagic: true, // Should preserve
        heartsPlaced: 1, // Should preserve
        magicCardsUsed: 0
      })

      // Save to database
      await dbRoom.save()

      // Verify persistence
      const updatedRoom = await Room.findOne({ code: 'PRESERV' })
      expect(updatedRoom.gameState.playerActions.user1.drawnHeart).toBe(true)
      expect(updatedRoom.gameState.playerActions.user1.drawnMagic).toBe(true)
      expect(updatedRoom.gameState.playerActions.user1.heartsPlaced).toBe(1)
    })
  })

  describe('resetPlayerActions function with database persistence', () => {
    it('should reset player actions correctly in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { resetPlayerActions } = await import('../../server.js')

      const roomData = createMockRoom('RESET01')
      roomData.gameState.playerActions = {
        user1: {
          drawnHeart: true,
          drawnMagic: true,
          heartsPlaced: 2,
          magicCardsUsed: 1
        }
      }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and reset actions
      const dbRoom = await Room.findOne({ code: 'RESET01' })
      resetPlayerActions(dbRoom, 'user1')

      expect(dbRoom.gameState.playerActions.user1).toEqual({
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0
      })

      // Save to database
      await dbRoom.save()

      // Verify persistence
      const updatedRoom = await Room.findOne({ code: 'RESET01' })
      expect(updatedRoom.gameState.playerActions.user1.drawnHeart).toBe(false)
      expect(updatedRoom.gameState.playerActions.user1.drawnMagic).toBe(false)
      expect(updatedRoom.gameState.playerActions.user1.heartsPlaced).toBe(0)
      expect(updatedRoom.gameState.playerActions.user1.magicCardsUsed).toBe(0)
    })

    it('should initialize player actions if missing in database', async () => {
      const { resetPlayerActions } = await import('../../server.js')

      const room = { gameState: {} }

      resetPlayerActions(room, 'user1')

      expect(room.gameState.playerActions.user1).toEqual({
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0
      })
    })

    it('should not affect other player actions in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { resetPlayerActions } = await import('../../server.js')

      const roomData = createMockRoom('PLAY01') // Will be converted to uppercase (6 chars)
      roomData.gameState.playerActions = {
        user1: {
          drawnHeart: true,
          drawnMagic: true,
          heartsPlaced: 2,
          magicCardsUsed: 1
        },
        user2: {
          drawnHeart: false,
          drawnMagic: true,
          heartsPlaced: 0,
          magicCardsUsed: 0
        }
      }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and reset only user1 actions
      const dbRoom = await Room.findOne({ code: 'PLAY01' }) // Will be converted to uppercase
      resetPlayerActions(dbRoom, 'user1')

      expect(dbRoom.gameState.playerActions.user1).toEqual({
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0
      })

      expect(dbRoom.gameState.playerActions.user2).toEqual({
        drawnHeart: false,
        drawnMagic: true,
        heartsPlaced: 0,
        magicCardsUsed: 0
      })

      // Save to database
      await dbRoom.save()

      // Verify persistence
      const updatedRoom = await Room.findOne({ code: 'PLAY01' }) // Will be converted to uppercase
      expect(updatedRoom.gameState.playerActions.user1.drawnHeart).toBe(false)
      expect(updatedRoom.gameState.playerActions.user2.drawnMagic).toBe(true)
    })
  })

  describe('checkGameEndConditions function with database integration', () => {
    it('should end game when all tiles are filled in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { checkGameEndConditions } = await import('../../server.js')

      const roomData = createMockRoom('ALLTILE')
      roomData.gameState.gameStarted = true
      roomData.gameState.tiles = [
        { id: 0, color: 'red', emoji: '🟥', placedHeart: { value: 1, color: 'red', emoji: '❤️' } },
        { id: 1, color: 'yellow', emoji: '🟨', placedHeart: { value: 2, color: 'yellow', emoji: '💛' } },
        { id: 2, color: 'green', emoji: '🟩', placedHeart: { value: 3, color: 'green', emoji: '💚' } }
      ]

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and check end conditions
      const dbRoom = await Room.findOne({ code: 'ALLTILE' })
      const result = checkGameEndConditions(dbRoom)

      expect(result.shouldEnd).toBe(true)
      expect(result.reason).toBe('All tiles are filled')
    })

    it('should end game when both decks are empty in database (no grace period)', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { checkGameEndConditions } = await import('../../server.js')

      const roomData = createMockRoom('EMPTYDK')
      roomData.gameState.gameStarted = true
      roomData.gameState.tiles = [{ id: 0, color: 'white', emoji: '⬜', placedHeart: null }]
      roomData.gameState.deck = { emoji: '💌', cards: 0, type: 'hearts' }
      roomData.gameState.magicDeck = { emoji: '🔮', cards: 0, type: 'magic' }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and check end conditions
      const dbRoom = await Room.findOne({ code: 'EMPTYDK' })
      const result = checkGameEndConditions(dbRoom, false)

      expect(result.shouldEnd).toBe(true)
      expect(result.reason).toBe('Both decks are empty')
    })

    it('should end game when heart deck is empty in database (no grace period)', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { checkGameEndConditions } = await import('../../server.js')

      const roomData = createMockRoom('EMPTYHT')
      roomData.gameState.gameStarted = true
      roomData.gameState.tiles = [{ id: 0, color: 'white', emoji: '⬜', placedHeart: null }]
      roomData.gameState.deck = { emoji: '💌', cards: 0, type: 'hearts' }
      roomData.gameState.magicDeck = { emoji: '🔮', cards: 5, type: 'magic' }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and check end conditions
      const dbRoom = await Room.findOne({ code: 'EMPTYHT' })
      const result = checkGameEndConditions(dbRoom, false)

      expect(result.shouldEnd).toBe(true)
      expect(result.reason).toBe('Heart deck is empty')
    })

    it('should end game when magic deck is empty in database (no grace period)', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { checkGameEndConditions } = await import('../../server.js')

      const roomData = createMockRoom('EMPTYMG')
      roomData.gameState.gameStarted = true
      roomData.gameState.tiles = [{ id: 0, color: 'white', emoji: '⬜', placedHeart: null }]
      roomData.gameState.deck = { emoji: '💌', cards: 5, type: 'hearts' }
      roomData.gameState.magicDeck = { emoji: '🔮', cards: 0, type: 'magic' }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and check end conditions
      const dbRoom = await Room.findOne({ code: 'EMPTYMG' })
      const result = checkGameEndConditions(dbRoom, false)

      expect(result.shouldEnd).toBe(true)
      expect(result.reason).toBe('Magic deck is empty')
    })

    it('should not end game when decks are empty but grace period allowed', async () => {
      const { checkGameEndConditions } = await import('../../server.js')

      const roomWithEmptyDecks = {
        gameState: {
          gameStarted: true,
          tiles: [{ placedHeart: null }],
          deck: { emoji: '💌', cards: 0 },
          magicDeck: { emoji: '🔮', cards: 0 }
        }
      }

      const result = checkGameEndConditions(roomWithEmptyDecks, true) // Grace period allowed

      expect(result.shouldEnd).toBe(false)
    })

    it('should not end game when conditions are not met in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { checkGameEndConditions } = await import('../../server.js')

      const roomData = createMockRoom('ACTIVE1')
      roomData.gameState.gameStarted = true
      roomData.gameState.tiles = [{ id: 0, color: 'white', emoji: '⬜', placedHeart: null }]
      roomData.gameState.deck = { emoji: '💌', cards: 10, type: 'hearts' }
      roomData.gameState.magicDeck = { emoji: '🔮', cards: 8, type: 'magic' }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and check end conditions
      const dbRoom = await Room.findOne({ code: 'ACTIVE1' })
      const result = checkGameEndConditions(dbRoom)

      expect(result.shouldEnd).toBe(false)
      expect(result.reason).toBe(null)
    })

    it('should not end game when game not started in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { checkGameEndConditions } = await import('../../server.js')

      const roomData = createMockRoom('NOTSTAR') // Will be converted to uppercase (7 chars)
      roomData.gameState.gameStarted = false
      roomData.gameState.tiles = [{ id: 0, color: 'white', emoji: '⬜', placedHeart: null }]

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and check end conditions
      const dbRoom = await Room.findOne({ code: 'NOTSTAR' }) // Will be converted to uppercase
      const result = checkGameEndConditions(dbRoom)

      expect(result.shouldEnd).toBe(false)
    })

    it('should handle tiles with null placedHeart in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { checkGameEndConditions } = await import('../../server.js')

      const roomData = createMockRoom('MIXEDTL')
      roomData.gameState.gameStarted = true
      roomData.gameState.tiles = [
        { id: 0, color: 'red', emoji: '🟥', placedHeart: { value: 1, color: 'red', emoji: '❤️' } },
        { id: 1, color: 'white', emoji: '⬜', placedHeart: null },
        { id: 2, color: 'yellow', emoji: '🟨', placedHeart: { value: 2, color: 'yellow', emoji: '💛' } },
        { id: 3, color: 'green', emoji: '🟩', placedHeart: null }
      ]

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and check end conditions
      const dbRoom = await Room.findOne({ code: 'MIXEDTL' })
      const result = checkGameEndConditions(dbRoom)

      expect(result.shouldEnd).toBe(false) // Not all tiles filled
    })
  })

  describe('checkAndExpireShields function with database persistence', () => {
    it('should decrement shield turn counts in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { checkAndExpireShields } = await import('../../server.js')

      const roomData = createMockRoom('SHLDDEC')
      roomData.gameState.shields = {
        user1: { remainingTurns: 3, active: true },
        user2: { remainingTurns: 2, active: true },
        user3: { remainingTurns: 1, active: true }
      }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and expire shields
      const dbRoom = await Room.findOne({ code: 'SHLDDEC' })
      checkAndExpireShields(dbRoom)

      expect(dbRoom.gameState.shields.user1.remainingTurns).toBe(2)
      expect(dbRoom.gameState.shields.user2.remainingTurns).toBe(1)
      expect(dbRoom.gameState.shields.user3).toBeUndefined() // Should be removed

      // Save to database
      await dbRoom.save()

      // Verify persistence
      const updatedRoom = await Room.findOne({ code: 'SHLDDEC' })
      expect(updatedRoom.gameState.shields.user1.remainingTurns).toBe(2)
      expect(updatedRoom.gameState.shields.user2.remainingTurns).toBe(1)
      expect(updatedRoom.gameState.shields.user3).toBeUndefined()
    })

    it('should remove shields when expired in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { checkAndExpireShields } = await import('../../server.js')

      const roomData = createMockRoom('SHLDEXP')
      roomData.gameState.shields = {
        user1: { remainingTurns: 0, active: true },
        user2: { remainingTurns: -1, active: true }
      }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and expire shields
      const dbRoom = await Room.findOne({ code: 'SHLDEXP' })
      checkAndExpireShields(dbRoom)

      expect(dbRoom.gameState.shields.user1).toBeUndefined()
      expect(dbRoom.gameState.shields.user2).toBeUndefined()

      // Save to database
      await dbRoom.save()

      // Verify persistence
      const updatedRoom = await Room.findOne({ code: 'SHLDEXP' })
      expect(updatedRoom.gameState.shields.user1).toBeUndefined()
      expect(updatedRoom.gameState.shields.user2).toBeUndefined()
    })

    it('should handle missing shields object gracefully in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { checkAndExpireShields } = await import('../../server.js')

      const roomData1 = createMockRoom('NOSHLDS') // Will be converted to uppercase (6 chars)
      roomData1.gameState = {} // No shields

      const roomData2 = createMockRoom('NULLSHD') // Will be converted to uppercase (7 chars)
      roomData2.gameState.shields = null

      // Save to database
      await new Room(roomData1).save()
      await new Room(roomData2).save()

      // Load from database and check shields
      const dbRoom1 = await Room.findOne({ code: 'NOSHLDS' }) // Will be converted to uppercase
      const dbRoom2 = await Room.findOne({ code: 'NULLSHD' }) // Will be converted to uppercase

      expect(() => {
        checkAndExpireShields(dbRoom1)
        checkAndExpireShields(dbRoom2)
      }).not.toThrow()
    })

    it('should handle invalid shield objects in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { checkAndExpireShields } = await import('../../server.js')

      const roomData = createMockRoom('INVALSH')
      roomData.gameState.shields = {
        user1: 'not an object',
        user2: null,
        user3: { remainingTurns: 2, active: true },
        user4: { remainingTurns: 'not a number' }
      }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and check shields
      const dbRoom = await Room.findOne({ code: 'INVALSH' })

      expect(() => {
        checkAndExpireShields(dbRoom)
      }).not.toThrow()

      // Should remove invalid shields and keep valid ones
      expect(dbRoom.gameState.shields.user1).toBeUndefined()
      expect(dbRoom.gameState.shields.user2).toBeUndefined()
      expect(dbRoom.gameState.shields.user3).toBeDefined()
      expect(dbRoom.gameState.shields.user4).toBeUndefined()
    })
  })

  describe('Turn lock management with database integration', () => {
    it('should acquire turn lock successfully', async () => {
      const { acquireTurnLock } = await import('../../server.js')

      const roomCode = 'TEST123'
      const socketId = 'socket1'

      const acquired = acquireTurnLock(roomCode, socketId)

      expect(acquired).toBe(true)
      expect(global.turnLocks.has(roomCode)).toBe(true)
      expect(global.turnLocks.get(roomCode).socketId).toBe(socketId)
    })

    it('should reject duplicate turn lock for same room', async () => {
      const { acquireTurnLock } = await import('../../server.js')

      const roomCode = 'TEST123'

      const firstAcquired = acquireTurnLock(roomCode, 'socket1')
      const secondAcquired = acquireTurnLock(roomCode, 'socket2')

      expect(firstAcquired).toBe(true)
      expect(secondAcquired).toBe(false)
      expect(global.turnLocks.size).toBe(1)
    })

    it('should release turn lock correctly', async () => {
      const { acquireTurnLock, releaseTurnLock } = await import('../../server.js')

      const roomCode = 'TEST123'
      const socketId = 'socket1'

      acquireTurnLock(roomCode, socketId)
      releaseTurnLock(roomCode, socketId)

      // Should be able to acquire again after release
      const reacquired = acquireTurnLock(roomCode, 'socket2')
      expect(reacquired).toBe(true)
      expect(global.turnLocks.get(roomCode).socketId).toBe('socket2')
    })

    it('should only release lock for correct socket', async () => {
      const { acquireTurnLock, releaseTurnLock } = await import('../../server.js')

      const roomCode = 'TEST123'

      acquireTurnLock(roomCode, 'socket1')
      releaseTurnLock(roomCode, 'socket2') // Wrong socket

      // Should still be locked
      const reacquired = acquireTurnLock(roomCode, 'socket3')
      expect(reacquired).toBe(false)
      expect(global.turnLocks.get(roomCode).socketId).toBe('socket1')
    })

    it('should handle releasing non-existent lock gracefully', async () => {
      const { releaseTurnLock } = await import('../../server.js')

      expect(() => {
        releaseTurnLock('NONEXISTENT', 'socket1')
      }).not.toThrow()
    })

    it('should handle turn lock expiration in database context', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { acquireTurnLock } = await import('../../server.js')

      const roomCode = 'EXPIRE01'
      const socketId = 'socket1'

      // Create old lock
      global.turnLocks.set(roomCode, {
        socketId,
        timestamp: Date.now() - 35 * 1000 // 35 seconds ago (expired)
      })

      // Should be able to acquire new lock
      const acquired = acquireTurnLock(roomCode, 'socket2')
      expect(acquired).toBe(true)
      expect(global.turnLocks.get(roomCode).socketId).toBe('socket2')
    })
  })

  describe('Turn flow validation with database persistence', () => {
    it('should require drawing both card types before ending turn in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const roomData = createMockRoom('TRNFLOW')
      roomData.gameState.deck = { emoji: '💌', cards: 5, type: 'hearts' } // Not empty
      roomData.gameState.magicDeck = { emoji: '🔮', cards: 5, type: 'magic' } // Not empty
      roomData.gameState.playerActions = {
        user1: {
          drawnHeart: true,
          drawnMagic: false // Missing magic draw
        }
      }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and validate turn flow
      const dbRoom = await Room.findOne({ code: 'TRNFLOW' })
      const cardDrawValidation = { currentActions: dbRoom.gameState.playerActions.user1 }

      // Simulate end-turn validation
      const heartDeckEmpty = dbRoom.gameState.deck.cards <= 0
      const magicDeckEmpty = dbRoom.gameState.magicDeck.cards <= 0

      const heartDrawRequired = !cardDrawValidation.currentActions.drawnHeart && !heartDeckEmpty
      const magicDrawRequired = !cardDrawValidation.currentActions.drawnMagic && !magicDeckEmpty

      expect(heartDrawRequired).toBe(false) // Heart was drawn
      expect(magicDrawRequired).toBe(true) // Magic not drawn but deck not empty
    })

    it('should allow ending turn when decks are empty in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const roomData = createMockRoom('EMPTYTR')
      roomData.gameState.deck = { emoji: '💌', cards: 0, type: 'hearts' } // Empty
      roomData.gameState.magicDeck = { emoji: '🔮', cards: 0, type: 'magic' } // Empty
      roomData.gameState.playerActions = {
        user1: {
          drawnHeart: false, // Not drawn
          drawnMagic: false // Not drawn
        }
      }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and validate turn flow
      const dbRoom = await Room.findOne({ code: 'EMPTYTR' })
      const cardDrawValidation = { currentActions: dbRoom.gameState.playerActions.user1 }

      const heartDeckEmpty = dbRoom.gameState.deck.cards <= 0
      const magicDeckEmpty = dbRoom.gameState.magicDeck.cards <= 0

      const heartDrawRequired = !cardDrawValidation.currentActions.drawnHeart && !heartDeckEmpty
      const magicDrawRequired = !cardDrawValidation.currentActions.drawnMagic && !magicDeckEmpty

      expect(heartDrawRequired).toBe(false) // Deck empty, no draw required
      expect(magicDrawRequired).toBe(false) // Deck empty, no draw required
    })

    it('should switch to next player correctly in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const roomData = createMockRoom('NEXTP1')
      roomData.players = [
        { userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: false, score: 0, joinedAt: new Date() },
        { userId: 'user2', name: 'Player2', email: 'player2@test.com', isReady: false, score: 0, joinedAt: new Date() }
      ]
      roomData.gameState.currentPlayer = { userId: 'user1', name: 'Player1' }
      roomData.gameState.turnCount = 1

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and switch player
      const dbRoom = await Room.findOne({ code: 'NEXTP1' })

      // Simulate turn switching
      const currentPlayerIndex = dbRoom.players.findIndex(p => p.userId === dbRoom.gameState.currentPlayer.userId)
      const nextPlayerIndex = (currentPlayerIndex + 1) % dbRoom.players.length

      dbRoom.gameState.currentPlayer = dbRoom.players[nextPlayerIndex]
      dbRoom.gameState.turnCount++

      expect(dbRoom.gameState.currentPlayer.userId).toBe('user2')
      expect(dbRoom.gameState.turnCount).toBe(2)

      // Save to database
      await dbRoom.save()

      // Verify persistence
      const updatedRoom = await Room.findOne({ code: 'NEXTP1' })
      expect(updatedRoom.gameState.currentPlayer.userId).toBe('user2')
      expect(updatedRoom.gameState.turnCount).toBe(2)
    })

    it('should handle turn cycling back to first player in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const roomData = createMockRoom('CYCLE01')
      roomData.players = [
        { userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: false, score: 0, joinedAt: new Date() },
        { userId: 'user2', name: 'Player2', email: 'player2@test.com', isReady: false, score: 0, joinedAt: new Date() }
      ]
      roomData.gameState.currentPlayer = { userId: 'user2', name: 'Player2' } // Last player
      roomData.gameState.turnCount = 1

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and cycle player
      const dbRoom = await Room.findOne({ code: 'CYCLE01' })

      // Simulate turn switching
      const currentPlayerIndex = dbRoom.players.findIndex(p => p.userId === dbRoom.gameState.currentPlayer.userId)
      const nextPlayerIndex = (currentPlayerIndex + 1) % dbRoom.players.length

      dbRoom.gameState.currentPlayer = dbRoom.players[nextPlayerIndex]
      dbRoom.gameState.turnCount++

      expect(dbRoom.gameState.currentPlayer.userId).toBe('user1') // Should cycle back
      expect(dbRoom.gameState.turnCount).toBe(2)

      // Save to database
      await dbRoom.save()

      // Verify persistence
      const updatedRoom = await Room.findOne({ code: 'CYCLE01' })
      expect(updatedRoom.gameState.currentPlayer.userId).toBe('user1')
      expect(updatedRoom.gameState.turnCount).toBe(2)
    })
  })

  describe('Game flow edge cases with database integration', () => {
    it('should handle missing turn count gracefully in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const roomData = createMockRoom('NOTURN') // Will be converted to uppercase (6 chars)
      roomData.players = [
        { userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: false, score: 0, joinedAt: new Date() },
        { userId: 'user2', name: 'Player2', email: 'player2@test.com', isReady: false, score: 0, joinedAt: new Date() }
      ]
      roomData.gameState.currentPlayer = { userId: 'user1', name: 'Player1' }
      // Missing turnCount

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database
      const dbRoom = await Room.findOne({ code: 'NOTURN' }) // Will be converted to uppercase

      // Should handle gracefully - defaults to 0 from createMockRoom
      expect(dbRoom.gameState.turnCount).toBe(0)
    })

    it('should handle single player game for testing in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const roomData = createMockRoom('SINGLE')
      roomData.players = [
        { userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: false, score: 0, joinedAt: new Date() }
      ]
      roomData.gameState.currentPlayer = { userId: 'user1', name: 'Player1' }
      roomData.gameState.turnCount = 1

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database
      const dbRoom = await Room.findOne({ code: 'SINGLE' })

      const currentPlayerIndex = dbRoom.players.findIndex(p => p.userId === dbRoom.gameState.currentPlayer.userId)
      const nextPlayerIndex = (currentPlayerIndex + 1) % dbRoom.players.length

      expect(currentPlayerIndex).toBe(0)
      expect(nextPlayerIndex).toBe(0) // Should stay the same player
    })

    it('should handle empty players array gracefully in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const roomData = createMockRoom('EMPTYPL')
      roomData.players = []
      roomData.gameState.currentPlayer = null
      roomData.gameState.turnCount = 0

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database
      const dbRoom = await Room.findOne({ code: 'EMPTYPL' })

      // Should handle gracefully without throwing
      expect(() => {
        const currentPlayerIndex = dbRoom.players.findIndex(p => p.userId === dbRoom.gameState.currentPlayer?.userId)
        expect(currentPlayerIndex).toBe(-1)
      }).not.toThrow()
    })

    it('should handle complex turn state with multiple database operations', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { recordCardDraw, resetPlayerActions, checkAndExpireShields } = await import('../../server.js')

      const roomData = createMockRoom('COMPLEX')
      roomData.players = [
        { userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: false, score: 0, joinedAt: new Date() },
        { userId: 'user2', name: 'Player2', email: 'player2@test.com', isReady: false, score: 0, joinedAt: new Date() }
      ]
      roomData.gameState.currentPlayer = { userId: 'user1', name: 'Player1' }
      roomData.gameState.turnCount = 1
      roomData.gameState.playerActions = {}
      roomData.gameState.shields = {
        user1: { remainingTurns: 2, active: true }
      }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and perform multiple operations
      const dbRoom = await Room.findOne({ code: 'COMPLEX' })

      // Record card draw
      recordCardDraw(dbRoom, 'user1', 'heart')
      recordCardDraw(dbRoom, 'user1', 'magic')

      // Expire shields
      checkAndExpireShields(dbRoom)

      // Reset actions for next player
      resetPlayerActions(dbRoom, 'user1')

      // Switch player
      const currentPlayerIndex = dbRoom.players.findIndex(p => p.userId === dbRoom.gameState.currentPlayer.userId)
      const nextPlayerIndex = (currentPlayerIndex + 1) % dbRoom.players.length
      dbRoom.gameState.currentPlayer = dbRoom.players[nextPlayerIndex]
      dbRoom.gameState.turnCount++

      // Save all changes to database
      await dbRoom.save()

      // Verify all changes persisted
      const updatedRoom = await Room.findOne({ code: 'COMPLEX' })

      expect(updatedRoom.gameState.currentPlayer.userId).toBe('user2')
      expect(updatedRoom.gameState.turnCount).toBe(2)
      expect(updatedRoom.gameState.playerActions.user1.drawnHeart).toBe(false) // Reset
      expect(updatedRoom.gameState.playerActions.user1.drawnMagic).toBe(false) // Reset
      expect(updatedRoom.gameState.shields.user1.remainingTurns).toBe(1) // Decremented
    })
  })
})