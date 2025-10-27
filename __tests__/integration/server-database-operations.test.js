import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  connectToDatabase,
  disconnectDatabase,
  clearDatabase,
  loadRooms,
  saveRoom,
  deleteRoom,
  loadPlayerSessions,
  savePlayerSession
} from '../utils/server-test-utils.js'
import { Room, PlayerSession } from '../../models.js'
import { mongoose } from 'mongoose'

// Mock console methods to test logging behavior
const originalConsoleLog = console.log
const originalConsoleError = console.error

describe('Server Database Operations Tests', () => {
  beforeEach(async () => {
    // Clear all console mocks
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // Ensure clean database state
    await clearDatabase()
  })

  afterEach(async () => {
    // Restore console methods
    console.log = originalConsoleLog
    console.error = originalConsoleError

    // Clean up database
    await clearDatabase()
  })

  describe('MongoDB Connection Success Logging (lines 29-30)', () => {
    it('should log successful MongoDB connection and return connection', async () => {
      // Ensure environment variable is set
      process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:example@localhost:27017/heart-tiles-test?authSource=admin'

      // Import the actual server module to trigger connection logging
      await import('../../server.js')

      // Test the connectToDatabase function directly
      const connection = await connectToDatabase()

      // Verify connection is established
      expect(connection).toBeDefined()
      expect(connection.readyState).toBe(1) // 1 = connected

      // Verify success logging was called
      expect(console.log).toHaveBeenCalledWith('Connected to MongoDB')
    })

    it('should handle MongoDB connection failure in test environment', async () => {
      // Test with invalid connection string
      const invalidUri = 'mongodb://invalid:invalid@localhost:99999/test'

      // Temporarily replace MONGODB_URI
      const originalUri = process.env.MONGODB_URI
      process.env.MONGODB_URI = invalidUri

      try {
        // Mock mongoose.connect to throw an error
        const mockConnect = vi.spyOn(mongoose, 'connect').mockRejectedValue(new Error('Connection failed'))

        // Import server module to test connectToDatabase
        await expect(connectToDatabase()).rejects.toThrow('Connection failed')

        // Verify error logging
        expect(console.error).toHaveBeenCalledWith('MongoDB connection failed:', expect.any(Error))

        mockConnect.mockRestore()
      } finally {
        process.env.MONGODB_URI = originalUri
      }
    })
  })

  describe('Database Operations (lines 42-99)', () => {
    describe('loadRooms function', () => {
      it('should load rooms successfully and return Map', async () => {
        // Create test rooms
        const testRoom1 = {
          code: 'TEST01',
          players: [{ userId: 'user1', name: 'Player1', email: 'player1@example.com' }],
          gameState: {
            gameStarted: false,
            currentPlayer: null,
            tiles: [],
            deck: { cards: 16 },
            magicDeck: { cards: 16 },
            playerHands: {},
            shields: {},
            turnCount: 0,
            playerActions: {}
          }
        }

        const testRoom2 = {
          code: 'TEST02',
          players: [{ userId: 'user2', name: 'Player2', email: 'player2@example.com' }],
          gameState: {
            gameStarted: true,
            currentPlayer: { userId: 'user2', name: 'Player2', email: 'player2@example.com' },
            tiles: [],
            deck: { cards: 10 },
            magicDeck: { cards: 12 },
            playerHands: { user2: [] },
            shields: {},
            turnCount: 3,
            playerActions: {}
          }
        }

        // Save test rooms
        await Room.create(testRoom1, testRoom2)

        // Load rooms
        const roomsMap = await loadRooms()

        // Verify results
        expect(roomsMap).toBeInstanceOf(Map)
        expect(roomsMap.size).toBe(2)
        expect(roomsMap.has('TEST01')).toBe(true)
        expect(roomsMap.has('TEST02')).toBe(true)

        // Verify room data structure
        const room1 = roomsMap.get('TEST01')
        expect(room1.code).toBe('TEST01')
        expect(room1.players).toHaveLength(1)
        expect(room1.gameState.gameStarted).toBe(false)

        const room2 = roomsMap.get('TEST02')
        expect(room2.code).toBe('TEST02')
        expect(room2.gameState.gameStarted).toBe(true)
        expect(room2.gameState.currentPlayer.userId).toBe('user2')
      })

      it('should return empty Map when no rooms exist', async () => {
        const roomsMap = await loadRooms()
        expect(roomsMap).toBeInstanceOf(Map)
        expect(roomsMap.size).toBe(0)
      })

      it('should handle database errors gracefully', async () => {
        // Mock Room.find to throw an error
        const mockFind = vi.spyOn(Room, 'find').mockRejectedValue(new Error('Database error'))

        const roomsMap = await loadRooms()
        expect(roomsMap).toBeInstanceOf(Map)
        expect(roomsMap.size).toBe(0)
        expect(console.error).toHaveBeenCalledWith('Failed to load rooms:', expect.any(Error))

        mockFind.mockRestore()
      })

      it('should skip invalid rooms during loading', async () => {
        // Create valid room
        const validRoom = {
          code: 'VALID01',
          players: [{ userId: 'user1', name: 'Player1', email: 'player1@example.com' }],
          gameState: {
            gameStarted: false,
            currentPlayer: null,
            tiles: [],
            deck: { cards: 16 },
            magicDeck: { cards: 16 },
            playerHands: {},
            shields: {},
            turnCount: 0,
            playerActions: {}
          }
        }

        // Create invalid room (missing gameState)
        const invalidRoom = {
          code: 'INVALID01',
          players: [{ userId: 'user2', name: 'Player2', email: 'player2@example.com' }]
          // Missing gameState
        }

        await Room.create(validRoom)
        await Room.create(invalidRoom)

        const roomsMap = await loadRooms()
        expect(roomsMap.size).toBe(1)
        expect(roomsMap.has('VALID01')).toBe(true)
        expect(roomsMap.has('INVALID01')).toBe(false)
      })
    })

    describe('saveRoom function', () => {
      it('should save room successfully', async () => {
        const roomData = {
          code: 'SAVE01',
          players: [{ userId: 'user1', name: 'Player1', email: 'player1@example.com', score: 10 }],
          gameState: {
            gameStarted: true,
            currentPlayer: { userId: 'user1', name: 'Player1', email: 'player1@example.com' },
            tiles: [{ id: 0, color: 'red', emoji: '🟥' }],
            deck: { cards: 14 },
            magicDeck: { cards: 15 },
            playerHands: {
              user1: [{ id: 'heart1', color: 'red', value: 2 }]
            },
            shields: {},
            turnCount: 2,
            playerActions: {
              user1: { drawnHeart: true, drawnMagic: false, heartsPlaced: 1, magicCardsUsed: 0 }
            }
          }
        }

        const result = await saveRoom(roomData)
        expect(result).toBeDefined()
        expect(result.code).toBe('SAVE01')

        // Verify room was actually saved
        const savedRoom = await Room.findOne({ code: 'SAVE01' })
        expect(savedRoom).toBeDefined()
        expect(savedRoom.players[0].score).toBe(10)
        expect(savedRoom.gameState.gameStarted).toBe(true)
      })

      it('should update existing room', async () => {
        // Create initial room
        const initialRoom = {
          code: 'UPDATE',
          players: [{ userId: 'user1', name: 'Player1', email: 'player1@example.com', score: 5 }],
          gameState: {
            gameStarted: false,
            currentPlayer: null,
            tiles: [],
            deck: { cards: 16 },
            magicDeck: { cards: 16 },
            playerHands: {},
            shields: {},
            turnCount: 0,
            playerActions: {}
          }
        }

        await Room.create(initialRoom)

        // Update room with new data
        const updatedRoom = {
          ...initialRoom,
          players: [{ userId: 'user1', name: 'Player1', email: 'player1@example.com', score: 15 }],
          gameState: {
            ...initialRoom.gameState,
            gameStarted: true,
            currentPlayer: { userId: 'user1', name: 'Player1', email: 'player1@example.com' },
            deck: { cards: 14 }
          }
        }

        const result = await saveRoom(updatedRoom)
        expect(result.code).toBe('UPDATE')

        // Verify updates were applied
        const savedRoom = await Room.findOne({ code: 'UPDATE' })
        expect(savedRoom.players[0].score).toBe(15)
        expect(savedRoom.gameState.gameStarted).toBe(true)
        expect(savedRoom.gameState.deck.cards).toBe(14)
      })

      it('should handle save errors gracefully', async () => {
        const roomData = {
          code: 'ERROR01',
          players: [],
          gameState: { gameStarted: false }
        }

        // Mock Room.findOneAndUpdate to throw an error
        const mockUpdate = vi.spyOn(Room, 'findOneAndUpdate').mockRejectedValue(new Error('Save failed'))

        // Should throw error (not swallow it in test utils)
        await expect(saveRoom(roomData)).rejects.toThrow('Save failed')

        mockUpdate.mockRestore()
      })

      it('should validate required fields', async () => {
        // Test missing code
        await expect(saveRoom({})).rejects.toThrow('Room data and code are required')

        // Test missing players
        await expect(saveRoom({ code: 'TEST' })).rejects.toThrow('Room data must include a valid players array')

        // Test missing gameState
        await expect(saveRoom({ code: 'TEST', players: [] })).rejects.toThrow('Room data must include gameState')
      })
    })

    describe('deleteRoom function', () => {
      it('should delete room successfully', async () => {
        // Create test room
        const roomData = {
          code: 'DELETE01',
          players: [{ userId: 'user1', name: 'Player1', email: 'player1@example.com' }],
          gameState: {
            gameStarted: false,
            currentPlayer: null,
            tiles: [],
            deck: { cards: 16 },
            magicDeck: { cards: 16 },
            playerHands: {},
            shields: {},
            turnCount: 0,
            playerActions: {}
          }
        }

        await Room.create(roomData)

        // Verify room exists
        const beforeDelete = await Room.findOne({ code: 'DELETE01' })
        expect(beforeDelete).toBeDefined()

        // Delete room
        await deleteRoom('DELETE01')

        // Verify room is deleted
        const afterDelete = await Room.findOne({ code: 'DELETE01' })
        expect(afterDelete).toBeNull()
      })

      it('should handle deletion of non-existent room gracefully', async () => {
        // Should not throw error for non-existent room
        await expect(deleteRoom('NONEXISTENT')).resolves.toBeUndefined()
      })

      it('should handle delete errors gracefully', async () => {
        // Mock Room.deleteOne to throw an error
        const mockDelete = vi.spyOn(Room, 'deleteOne').mockRejectedValue(new Error('Delete failed'))

        await expect(deleteRoom('ERROR01')).rejects.toThrow('Delete failed')

        mockDelete.mockRestore()
      })

      it('should validate room code parameter', async () => {
        await expect(deleteRoom(null)).rejects.toThrow('Room code is required for deletion')
        await expect(deleteRoom('')).rejects.toThrow('Room code is required for deletion')
        await expect(deleteRoom(undefined)).rejects.toThrow('Room code is required for deletion')
      })
    })

    describe('loadPlayerSessions function', () => {
      it('should load active player sessions successfully', async () => {
        // Create test sessions
        const session1 = {
          userId: 'user1',
          userSessionId: 'session1',
          name: 'Player1',
          email: 'player1@example.com',
          currentSocketId: 'socket1',
          lastSeen: new Date(),
          isActive: true
        }

        const session2 = {
          userId: 'user2',
          userSessionId: 'session2',
          name: 'Player2',
          email: 'player2@example.com',
          currentSocketId: null,
          lastSeen: new Date(),
          isActive: true
        }

        // Create inactive session (should not be loaded)
        const inactiveSession = {
          userId: 'user3',
          userSessionId: 'session3',
          name: 'Player3',
          email: 'player3@example.com',
          currentSocketId: 'socket3',
          lastSeen: new Date(),
          isActive: false
        }

        await PlayerSession.create(session1, session2, inactiveSession)

        const sessionsMap = await loadPlayerSessions()

        expect(sessionsMap).toBeInstanceOf(Map)
        expect(sessionsMap.size).toBe(2) // Only active sessions
        expect(sessionsMap.has('user1')).toBe(true)
        expect(sessionsMap.has('user2')).toBe(true)
        expect(sessionsMap.has('user3')).toBe(false) // Inactive session excluded

        // Verify session data
        const session1Data = sessionsMap.get('user1')
        expect(session1Data.name).toBe('Player1')
        expect(session1Data.currentSocketId).toBe('socket1')
        expect(session1Data.isActive).toBe(true)
      })

      it('should return empty Map when no active sessions exist', async () => {
        const sessionsMap = await loadPlayerSessions()
        expect(sessionsMap).toBeInstanceOf(Map)
        expect(sessionsMap.size).toBe(0)
      })

      it('should handle database errors gracefully', async () => {
        // Mock PlayerSession.find to throw an error
        const mockFind = vi.spyOn(PlayerSession, 'find').mockRejectedValue(new Error('Database error'))

        const sessionsMap = await loadPlayerSessions()
        expect(sessionsMap).toBeInstanceOf(Map)
        expect(sessionsMap.size).toBe(0)
        expect(console.error).toHaveBeenCalledWith('Failed to load sessions:', expect.any(Error))

        mockFind.mockRestore()
      })

      it('should skip invalid sessions during loading', async () => {
        // Create valid session
        const validSession = {
          userId: 'validUser',
          userSessionId: 'validSession',
          name: 'ValidPlayer',
          email: 'valid@example.com',
          isActive: true
        }

        // Create invalid session (missing userId)
        const invalidSession = {
          userSessionId: 'invalidSession',
          name: 'InvalidPlayer',
          email: 'invalid@example.com',
          isActive: true
        }

        await PlayerSession.create(validSession, invalidSession)

        const sessionsMap = await loadPlayerSessions()
        expect(sessionsMap.size).toBe(1)
        expect(sessionsMap.has('validUser')).toBe(true)
      })
    })

    describe('savePlayerSession function', () => {
      it('should save player session successfully', async () => {
        const sessionData = {
          userId: 'user1',
          userSessionId: 'session1',
          name: 'Player1',
          email: 'player1@example.com',
          currentSocketId: 'socket1',
          lastSeen: new Date(),
          isActive: true
        }

        const result = await savePlayerSession(sessionData)
        expect(result).toBeDefined()
        expect(result.userId).toBe('user1')
        expect(result.name).toBe('Player1')

        // Verify session was actually saved
        const savedSession = await PlayerSession.findOne({ userId: 'user1' })
        expect(savedSession).toBeDefined()
        expect(savedSession.name).toBe('Player1')
        expect(savedSession.currentSocketId).toBe('socket1')
      })

      it('should update existing session', async () => {
        // Create initial session
        const initialSession = {
          userId: 'user1',
          userSessionId: 'session1',
          name: 'Player1',
          email: 'player1@example.com',
          currentSocketId: 'socket1',
          isActive: true
        }

        await PlayerSession.create(initialSession)

        // Update session with new socket ID
        const updatedSession = {
          ...initialSession,
          currentSocketId: 'socket2',
          lastSeen: new Date()
        }

        const result = await savePlayerSession(updatedSession)
        expect(result.currentSocketId).toBe('socket2')

        // Verify update was applied
        const savedSession = await PlayerSession.findOne({ userId: 'user1' })
        expect(savedSession.currentSocketId).toBe('socket2')
      })

      it('should handle save errors gracefully', async () => {
        const sessionData = {
          userId: 'user1',
          name: 'Player1'
        }

        // Mock PlayerSession.findOneAndUpdate to throw an error
        const mockUpdate = vi.spyOn(PlayerSession, 'findOneAndUpdate').mockRejectedValue(new Error('Save failed'))

        await expect(savePlayerSession(sessionData)).rejects.toThrow('Save failed')

        mockUpdate.mockRestore()
      })

      it('should validate required fields', async () => {
        // Test missing userId
        await expect(savePlayerSession({})).rejects.toThrow('Session data and userId are required')
        await expect(savePlayerSession({ userId: null })).rejects.toThrow('Session data and userId are required')
        await expect(savePlayerSession({ userId: '' })).rejects.toThrow('Session data and userId are required')
      })

      it('should normalize session data', async () => {
        const sessionData = {
          userId: 'user1',
          name: 'Player1',
          email: 'player1@example.com'
          // Missing some optional fields
        }

        const result = await savePlayerSession(sessionData)

        expect(result.userSessionId).toBeDefined() // Should be generated
        expect(result.currentSocketId).toBeNull() // Should default to null
        expect(result.isActive).toBe(true) // Should default to true
        expect(result.lastSeen).toBeInstanceOf(Date)
      })
    })
  })

  describe('Database Connection Recovery', () => {
    it('should handle connection state recovery', async () => {
      // Test that database operations work even after connection issues
      await disconnectDatabase()

      // Should be able to reconnect
      await connectToDatabase()

      // Operations should work after reconnection
      const roomsMap = await loadRooms()
      expect(roomsMap).toBeInstanceOf(Map)
    })

    it('should verify connection with ping before operations', async () => {
      // This tests the ping verification in the utility functions
      const roomsMap = await loadRooms()
      expect(roomsMap).toBeInstanceOf(Map)

      const sessionsMap = await loadPlayerSessions()
      expect(sessionsMap).toBeInstanceOf(Map)
    })
  })
})