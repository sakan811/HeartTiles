import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  connectToDatabase,
  disconnectDatabase,
  clearDatabase
} from '../utils/server-test-utils.js'
import { Room } from '../../models.js'
import { deleteRoom } from '../../models.js'

// Mock console methods to test logging behavior
const originalConsoleError = console.error

describe('deleteRoom function Integration Tests (models.js lines 213-220)', () => {
  beforeEach(async () => {
    // Mock console.error to test error logging
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // Ensure clean database state
    await clearDatabase()
  })

  afterEach(async () => {
    // Restore console methods
    console.error = originalConsoleError

    // Clean up database
    await clearDatabase()
  })

  describe('Successful Room Deletion', () => {
    it('should successfully delete an existing room from database', async () => {
      // Create test room with complete game state
      const roomData = {
        code: 'DELETE1',
        players: [
          {
            userId: 'user1',
            name: 'Player1',
            email: 'player1@example.com',
            isReady: true,
            score: 5,
            joinedAt: new Date()
          },
          {
            userId: 'user2',
            name: 'Player2',
            email: 'player2@example.com',
            isReady: false,
            score: 3,
            joinedAt: new Date()
          }
        ],
        maxPlayers: 2,
        gameState: {
          tiles: [
            { id: 0, color: 'red', emoji: '🟥', placedHeart: null },
            { id: 1, color: 'yellow', emoji: '🟨', placedHeart: null },
            { id: 2, color: 'green', emoji: '🟩', placedHeart: null },
            { id: 3, color: 'white', emoji: '⬜', placedHeart: null }
          ],
          gameStarted: false,
          currentPlayer: null,
          deck: { emoji: '💌', cards: 16, type: 'hearts' },
          magicDeck: { emoji: '🔮', cards: 16, type: 'magic' },
          playerHands: {
            user1: [
              { id: 'heart-1', type: 'heart', color: 'red', value: 2, emoji: '❤️' }
            ],
            user2: [
              { id: 'heart-2', type: 'heart', color: 'yellow', value: 1, emoji: '💛' }
            ]
          },
          shields: {},
          turnCount: 0,
          playerActions: {
            user1: { drawnHeart: false, drawnMagic: false, heartsPlaced: 0, magicCardsUsed: 0 },
            user2: { drawnHeart: false, drawnMagic: false, heartsPlaced: 0, magicCardsUsed: 0 }
          }
        }
      }

      // Save room to database
      const createdRoom = await Room.create(roomData)
      expect(createdRoom).toBeDefined()
      expect(createdRoom.code).toBe('DELETE1')

      // Verify room exists before deletion
      const beforeDelete = await Room.findOne({ code: 'DELETE1' })
      expect(beforeDelete).toBeDefined()
      expect(beforeDelete.players).toHaveLength(2)

      // Get initial room count
      const initialCount = await Room.countDocuments()
      expect(initialCount).toBe(1)

      // Delete room using the function from models.js
      await deleteRoom('DELETE1')

      // Verify room is completely removed from database
      const afterDelete = await Room.findOne({ code: 'DELETE1' })
      expect(afterDelete).toBeNull()

      // Verify room count decreased
      const finalCount = await Room.countDocuments()
      expect(finalCount).toBe(0)

      // Verify console.error was not called (successful operation)
      expect(console.error).not.toHaveBeenCalled()
    })

    it('should delete room with complex game state including shields and placed hearts', async () => {
      // Create room with active game state
      const roomWithActiveGame = {
        code: 'GAME01',
        players: [
          {
            userId: 'player1',
            name: 'ActivePlayer1',
            email: 'active1@example.com',
            isReady: true,
            score: 12,
            joinedAt: new Date()
          }
        ],
        maxPlayers: 2,
        gameState: {
          tiles: [
            {
              id: 0,
              color: 'red',
              emoji: '🟥',
              placedHeart: {
                value: 2,
                color: 'red',
                emoji: '❤️',
                placedBy: 'player1',
                score: 4
              }
            },
            {
              id: 1,
              color: 'yellow',
              emoji: '🟨',
              placedHeart: null
            }
          ],
          gameStarted: true,
          currentPlayer: {
            userId: 'player1',
            name: 'ActivePlayer1',
            email: 'active1@example.com',
            isReady: true
          },
          deck: { emoji: '💌', cards: 10, type: 'hearts' },
          magicDeck: { emoji: '🔮', cards: 12, type: 'magic' },
          playerHands: {
            player1: [
              { id: 'heart-3', type: 'heart', color: 'green', value: 3, emoji: '💚' },
              { id: 'magic-1', type: 'magic', magicType: 'wind', emoji: '💨' }
            ]
          },
          shields: {
            'tile-0': {
              playerId: 'player1',
              expiresAt: 5,
              createdAt: 1
            }
          },
          turnCount: 3,
          playerActions: {
            player1: { drawnHeart: true, drawnMagic: false, heartsPlaced: 1, magicCardsUsed: 0 }
          }
        }
      }

      // Save complex room
      await Room.create(roomWithActiveGame)

      // Verify complex room exists
      const complexRoom = await Room.findOne({ code: 'GAME01' })
      expect(complexRoom).toBeDefined()
      expect(complexRoom.gameState.shields).toBeDefined()
      expect(complexRoom.gameState.tiles[0].placedHeart).toBeDefined()

      // Delete complex room
      await deleteRoom('GAME01')

      // Verify complex room is completely removed
      const deletedRoom = await Room.findOne({ code: 'GAME01' })
      expect(deletedRoom).toBeNull()
    })

    it('should delete multiple rooms successfully', async () => {
      // Create multiple test rooms
      const rooms = ['MULTI01', 'MULTI02', 'MULTI03']

      for (const roomCode of rooms) {
        await Room.create({
          code: roomCode,
          players: [
            {
              userId: `user-${roomCode}`,
              name: `User${roomCode}`,
              email: `${roomCode.toLowerCase()}@example.com`,
              isReady: true,
              score: 0,
              joinedAt: new Date()
            }
          ],
          gameState: {
            gameStarted: false,
            currentPlayer: null,
            tiles: [],
            deck: { emoji: '💌', cards: 16, type: 'hearts' },
            magicDeck: { emoji: '🔮', cards: 16, type: 'magic' },
            playerHands: {},
            shields: {},
            turnCount: 0,
            playerActions: {}
          }
        })
      }

      // Verify all rooms exist
      expect(await Room.countDocuments()).toBe(3)

      // Delete rooms one by one
      for (const roomCode of rooms) {
        await deleteRoom(roomCode)

        // Verify specific room was deleted
        const deletedRoom = await Room.findOne({ code: roomCode })
        expect(deletedRoom).toBeNull()
      }

      // Verify all rooms are deleted
      expect(await Room.countDocuments()).toBe(0)
    })
  })

  describe('Non-existent Room Deletion', () => {
    it('should handle deletion of non-existent room without error', async () => {
      // Verify database is empty
      expect(await Room.countDocuments()).toBe(0)

      // Attempt to delete non-existent room - models.js version should not throw
      await expect(deleteRoom('NONEXISTENT')).resolves.toBeUndefined()

      // Verify database is still empty
      expect(await Room.countDocuments()).toBe(0)

      // Console.error should not be called for simple non-existent deletion
      expect(console.error).not.toHaveBeenCalled()
    })

    it('should handle deletion with various invalid room codes', async () => {
      const invalidCodes = [null, undefined, '', 'SHORT', 'VERYLONGCODETHATEXCEEDSLIMIT', '123456', 'abcdef']

      for (const invalidCode of invalidCodes) {
        // These should not throw errors in models.js version
        await expect(deleteRoom(invalidCode)).resolves.toBeUndefined()

        // Verify database remains empty
        expect(await Room.countDocuments()).toBe(0)
      }

      expect(console.error).not.toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      // Create a room first
      await Room.create({
        code: 'ERROR01',
        players: [
          {
            userId: 'errorUser',
            name: 'ErrorUser',
            email: 'error@example.com',
            isReady: true,
            score: 0,
            joinedAt: new Date()
          }
        ],
        gameState: {
          gameStarted: false,
          currentPlayer: null,
          tiles: [],
          deck: { emoji: '💌', cards: 16, type: 'hearts' },
          magicDeck: { emoji: '🔮', cards: 16, type: 'magic' },
          playerHands: {},
          shields: {},
          turnCount: 0,
          playerActions: {}
        }
      })

      // Mock Room.deleteOne to throw a database error
      const mockDeleteOne = vi.spyOn(Room, 'deleteOne').mockRejectedValue(new Error('Database connection lost'))

      // Should throw the database error
      await expect(deleteRoom('ERROR01')).rejects.toThrow('Database connection lost')

      // Verify error was logged to console
      expect(console.error).toHaveBeenCalledWith('Failed to delete room:', expect.any(Error))

      // Restore mock
      mockDeleteOne.mockRestore()
    })

    it('should handle MongoDB operation timeout errors', async () => {
      // Create a room
      await Room.create({
        code: 'TIMEOUT',
        players: [
          {
            userId: 'timeoutUser',
            name: 'TimeoutUser',
            email: 'timeout@example.com',
            isReady: true,
            score: 0,
            joinedAt: new Date()
          }
        ],
        gameState: {
          gameStarted: false,
          currentPlayer: null,
          tiles: [],
          deck: { emoji: '💌', cards: 16, type: 'hearts' },
          magicDeck: { emoji: '🔮', cards: 16, type: 'magic' },
          playerHands: {},
          shields: {},
          turnCount: 0,
          playerActions: {}
        }
      })

      // Mock Room.deleteOne to throw a timeout error
      const timeoutError = new Error('Operation timed out')
      timeoutError.name = 'MongoTimeoutError'
      const mockDeleteOne = vi.spyOn(Room, 'deleteOne').mockRejectedValue(timeoutError)

      // Should throw the timeout error
      await expect(deleteRoom('TIMEOUT')).rejects.toThrow('Operation timed out')

      // Verify error was logged
      expect(console.error).toHaveBeenCalledWith('Failed to delete room:', timeoutError)

      mockDeleteOne.mockRestore()
    })

    it('should handle validation errors from MongoDB', async () => {
      // Create a room first
      await Room.create({
        code: 'VALID01',
        players: [
          {
            userId: 'validUser',
            name: 'ValidUser',
            email: 'valid@example.com',
            isReady: true,
            score: 0,
            joinedAt: new Date()
          }
        ],
        gameState: {
          gameStarted: false,
          currentPlayer: null,
          tiles: [],
          deck: { emoji: '💌', cards: 16, type: 'hearts' },
          magicDeck: { emoji: '🔮', cards: 16, type: 'magic' },
          playerHands: {},
          shields: {},
          turnCount: 0,
          playerActions: {}
        }
      })

      // Mock Room.deleteOne to throw a validation error
      const validationError = new Error('Validation failed')
      validationError.name = 'ValidationError'
      const mockDeleteOne = vi.spyOn(Room, 'deleteOne').mockRejectedValue(validationError)

      // Should throw the validation error
      await expect(deleteRoom('VALID01')).rejects.toThrow('Validation failed')

      // Verify error was logged
      expect(console.error).toHaveBeenCalledWith('Failed to delete room:', validationError)

      mockDeleteOne.mockRestore()
    })
  })

  describe('Database State Verification', () => {
    it('should verify room is completely removed from all database operations', async () => {
      const roomCode = 'VERIFY1'

      // Create room with full data
      await Room.create({
        code: roomCode,
        players: [
          {
            userId: 'verifyUser',
            name: 'VerifyUser',
            email: 'verify@example.com',
            isReady: true,
            score: 10,
            joinedAt: new Date()
          }
        ],
        gameState: {
          tiles: [
            { id: 0, color: 'red', emoji: '🟥', placedHeart: null },
            { id: 1, color: 'green', emoji: '🟩', placedHeart: null }
          ],
          gameStarted: true,
          currentPlayer: {
            userId: 'verifyUser',
            name: 'VerifyUser',
            email: 'verify@example.com',
            isReady: true
          },
          deck: { emoji: '💌', cards: 14, type: 'hearts' },
          magicDeck: { emoji: '🔮', cards: 15, type: 'magic' },
          playerHands: {
            verifyUser: [
              { id: 'test-heart', type: 'heart', color: 'red', value: 2, emoji: '❤️' },
              { id: 'test-magic', type: 'magic', magicType: 'shield', emoji: '🛡️' }
            ]
          },
          shields: {
            'tile-0': { playerId: 'verifyUser', expiresAt: 3, createdAt: 1 }
          },
          turnCount: 2,
          playerActions: {
            verifyUser: { drawnHeart: true, drawnMagic: true, heartsPlaced: 1, magicCardsUsed: 1 }
          }
        }
      })

      // Verify room exists with all data
      const existingRoom = await Room.findOne({ code: roomCode })
      expect(existingRoom).toBeDefined()
      expect(existingRoom.players).toHaveLength(1)
      expect(existingRoom.gameState.tiles).toHaveLength(2)
      expect(existingRoom.gameState.playerHands.verifyUser).toHaveLength(2)

      // Delete room
      await deleteRoom(roomCode)

      // Verify room cannot be found by any method
      const findByCode = await Room.findOne({ code: roomCode })
      expect(findByCode).toBeNull()

      const findById = await Room.findById(existingRoom._id)
      expect(findById).toBeNull()

      const findByQuery = await Room.findOne({ 'players.userId': 'verifyUser' })
      expect(findByQuery).toBeNull()

      // Verify count operations
      const countByCode = await Room.countDocuments({ code: roomCode })
      expect(countByCode).toBe(0)

      const countByPlayer = await Room.countDocuments({ 'players.userId': 'verifyUser' })
      expect(countByPlayer).toBe(0)

      // Verify find operations return empty arrays
      const findAll = await Room.find({ code: roomCode })
      expect(findAll).toHaveLength(0)

      const findByPlayer = await Room.find({ 'players.userId': 'verifyUser' })
      expect(findByPlayer).toHaveLength(0)
    })

    it('should maintain database consistency when multiple rooms exist', async () => {
      // Create multiple rooms
      const roomCodes = ['CONSIS1', 'CONSIS2', 'CONSIS3', 'CONSIS4']

      for (const code of roomCodes) {
        await Room.create({
          code: code,
          players: [
            {
              userId: `user-${code}`,
              name: `User${code}`,
              email: `${code.toLowerCase()}@example.com`,
              isReady: true,
              score: Math.floor(Math.random() * 20),
              joinedAt: new Date()
            }
          ],
          gameState: {
            gameStarted: Math.random() > 0.5,
            currentPlayer: null,
            tiles: [],
            deck: { emoji: '💌', cards: 16, type: 'hearts' },
            magicDeck: { emoji: '🔮', cards: 16, type: 'magic' },
            playerHands: {},
            shields: {},
            turnCount: 0,
            playerActions: {}
          }
        })
      }

      // Verify all rooms exist
      expect(await Room.countDocuments()).toBe(4)

      // Delete middle rooms
      await deleteRoom('CONSIS2')
      await deleteRoom('CONSIS3')

      // Verify remaining rooms still exist and are unaffected
      const remainingRoom1 = await Room.findOne({ code: 'CONSIS1' })
      expect(remainingRoom1).toBeDefined()
      expect(remainingRoom1.code).toBe('CONSIS1')

      const remainingRoom4 = await Room.findOne({ code: 'CONSIS4' })
      expect(remainingRoom4).toBeDefined()
      expect(remainingRoom4.code).toBe('CONSIS4')

      // Verify deleted rooms don't exist
      expect(await Room.findOne({ code: 'CONSIS2' })).toBeNull()
      expect(await Room.findOne({ code: 'CONSIS3' })).toBeNull()

      // Verify final count
      expect(await Room.countDocuments()).toBe(2)
    })
  })

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle room codes with special characters and edge cases', async () => {
      const edgeCaseCodes = ['EDGE123', '123456', 'A1B2C3', 'TEST99']

      for (const code of edgeCaseCodes) {
        // Create room with edge case code
        await Room.create({
          code: code,
          players: [
            {
              userId: `edge-${code}`,
              name: `Edge${code}`,
              email: `edge${code.toLowerCase()}@example.com`,
              isReady: true,
              score: 0,
              joinedAt: new Date()
            }
          ],
          gameState: {
            gameStarted: false,
            currentPlayer: null,
            tiles: [],
            deck: { emoji: '💌', cards: 16, type: 'hearts' },
            magicDeck: { emoji: '🔮', cards: 16, type: 'magic' },
            playerHands: {},
            shields: {},
            turnCount: 0,
            playerActions: {}
          }
        })

        // Delete room
        await deleteRoom(code)

        // Verify deletion
        const deletedRoom = await Room.findOne({ code: code })
        expect(deletedRoom).toBeNull()
      }
    })

    it('should handle rapid successive deletions without errors', async () => {
      // Create multiple rooms quickly
      const roomCodes = []
      for (let i = 0; i < 10; i++) {
        const code = `RAPID${String(i).padStart(2, '0')}`
        roomCodes.push(code)

        await Room.create({
          code: code,
          players: [
            {
              userId: `rapid-user-${i}`,
              name: `RapidUser${i}`,
              email: `rapid${i}@example.com`,
              isReady: true,
              score: i,
              joinedAt: new Date()
            }
          ],
          gameState: {
            gameStarted: false,
            currentPlayer: null,
            tiles: [],
            deck: { emoji: '💌', cards: 16, type: 'hearts' },
            magicDeck: { emoji: '🔮', cards: 16, type: 'magic' },
            playerHands: {},
            shields: {},
            turnCount: 0,
            playerActions: {}
          }
        })
      }

      expect(await Room.countDocuments()).toBe(10)

      // Delete all rooms rapidly in succession
      const deletePromises = roomCodes.map(code => deleteRoom(code))
      await Promise.all(deletePromises)

      // Verify all rooms are deleted
      expect(await Room.countDocuments()).toBe(0)

      // Verify no errors were logged
      expect(console.error).not.toHaveBeenCalled()
    })
  })
})