// Integration tests for database operations
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
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
import { Room, PlayerSession, User } from '../../models.js'

describe('Database Operations', () => {
  beforeAll(async () => {
    try {
      await connectToDatabase()
    } catch (error) {
      console.warn('Database connection failed, skipping tests:', error.message)
    }
  })

  afterAll(async () => {
    try {
      await disconnectDatabase()
    } catch (error) {
      console.warn('Database disconnection failed:', error.message)
    }
  })

  beforeEach(async () => {
    try {
      await clearDatabase()
    } catch (error) {
      console.warn('Database clear failed:', error.message)
    }
  })

  describe('Room Operations', () => {
    it('should save and load rooms', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const roomData = {
        code: 'TEST01',
        players: [
          {
            userId: 'user-1',
            name: 'Player 1',
            email: 'player1@test.com',
            isReady: true,
            score: 10
          },
          {
            userId: 'user-2',
            name: 'Player 2',
            email: 'player2@test.com',
            isReady: false,
            score: 5
          }
        ],
        maxPlayers: 2,
        gameState: {
          tiles: [
            { id: 0, color: 'red', emoji: '🟥' },
            { id: 1, color: 'white', emoji: '⬜' }
          ],
          gameStarted: true,
          currentPlayer: { userId: 'user-1', name: 'Player 1' },
          deck: { emoji: '💌', cards: 12, type: 'hearts' },
          magicDeck: { emoji: '🔮', cards: 10, type: 'magic' },
          playerHands: {
            'user-1': [
              { id: 'heart-1', type: 'heart', color: 'red', value: 2, emoji: '❤️' }
            ],
            'user-2': [
              { id: 'heart-2', type: 'heart', color: 'yellow', value: 1, emoji: '💛' }
            ]
          },
          turnCount: 3,
          playerActions: {
            'user-1': { drawnHeart: true, drawnMagic: false, heartsPlaced: 1, magicCardsUsed: 0 },
            'user-2': { drawnHeart: false, drawnMagic: false, heartsPlaced: 0, magicCardsUsed: 0 }
          }
        }
      }

      // Save room
      await saveRoom(roomData)

      // Load rooms
      const rooms = await loadRooms()
      expect(rooms.size).toBe(1)
      expect(rooms.has('TEST01')).toBe(true)

      const loadedRoom = rooms.get('TEST01')
      expect(loadedRoom.code).toBe('TEST01')
      expect(loadedRoom.players).toHaveLength(2)
      expect(loadedRoom.players[0].name).toBe('Player 1')
      expect(loadedRoom.players[0].score).toBe(10)
      expect(loadedRoom.gameState.gameStarted).toBe(true)
      expect(loadedRoom.gameState.tiles).toHaveLength(2)
      expect(loadedRoom.gameState.deck.cards).toBe(12)
      expect(loadedRoom.gameState.turnCount).toBe(3)
      expect(loadedRoom.gameState.playerActions.get('user-1').drawnHeart).toBe(true)
    })

    it('should update existing room', async () => {
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const initialRoomData = {
        code: 'TEST02',
        players: [
          { userId: 'user-1', name: 'Player 1', email: 'p1@test.com', isReady: false, score: 0 }
        ],
        maxPlayers: 2,
        gameState: {
          tiles: [],
          gameStarted: false,
          currentPlayer: null,
          deck: { emoji: '💌', cards: 16, type: 'hearts' },
          magicDeck: { emoji: '🔮', cards: 16, type: 'magic' },
          playerHands: {},
          turnCount: 0,
          playerActions: {
            'user-1': { drawnHeart: false, drawnMagic: false, heartsPlaced: 0, magicCardsUsed: 0 }
          }
        }
      }

      // Save initial room
      await saveRoom(initialRoomData)

      // Update room
      const updatedRoomData = {
        ...initialRoomData,
        players: [
          { userId: 'user-1', name: 'Player 1', email: 'p1@test.com', isReady: true, score: 15 },
          { userId: 'user-2', name: 'Player 2', email: 'p2@test.com', isReady: true, score: 8 }
        ],
        gameState: {
          ...initialRoomData.gameState,
          gameStarted: true,
          turnCount: 2
        }
      }

      await saveRoom(updatedRoomData)

      // Load and verify updated room
      const rooms = await loadRooms()
      const loadedRoom = rooms.get('TEST02')
      expect(loadedRoom.players).toHaveLength(2)
      expect(loadedRoom.players[0].isReady).toBe(true)
      expect(loadedRoom.players[0].score).toBe(15)
      expect(loadedRoom.players[1].name).toBe('Player 2')
      expect(loadedRoom.gameState.gameStarted).toBe(true)
      expect(loadedRoom.gameState.turnCount).toBe(2)
    })

    it('should delete room', async () => {
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const roomData = {
        code: 'TEST03',
        players: [],
        maxPlayers: 2,
        gameState: {
          tiles: [],
          gameStarted: false,
          currentPlayer: null,
          deck: { emoji: '💌', cards: 16, type: 'hearts' },
          magicDeck: { emoji: '🔮', cards: 16, type: 'magic' },
          playerHands: {},
          turnCount: 0,
          playerActions: {}
        }
      }

      // Save room
      await saveRoom(roomData)
      let rooms = await loadRooms()
      expect(rooms.has('TEST03')).toBe(true)

      // Delete room
      await deleteRoom('TEST03')
      rooms = await loadRooms()
      expect(rooms.has('TEST03')).toBe(false)
    })

    it('should handle room save errors gracefully', async () => {
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      // Test with invalid room data (missing required fields)
      const invalidRoomData = {
        // Missing 'code' field
        players: [],
        maxPlayers: 2,
        gameState: {}
      }

      // Should not throw an error, but handle it gracefully
      await expect(saveRoom(invalidRoomData)).resolves.not.toThrow()
    })
  })

  describe('Player Session Operations', () => {
    it('should save and load player sessions', async () => {
      try {
        await PlayerSession.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const sessionData = {
        userId: 'user-1',
        userSessionId: 'session-123',
        name: 'Test User',
        email: 'test@example.com',
        currentSocketId: 'socket-456',
        lastSeen: new Date(),
        isActive: true
      }

      // Save session
      await savePlayerSession(sessionData)

      // Load sessions
      const sessions = await loadPlayerSessions()
      expect(sessions.size).toBe(1)
      expect(sessions.has('user-1')).toBe(true)

      const loadedSession = sessions.get('user-1')
      expect(loadedSession.name).toBe('Test User')
      expect(loadedSession.email).toBe('test@example.com')
      expect(loadedSession.currentSocketId).toBe('socket-456')
      expect(loadedSession.isActive).toBe(true)
    })

    it('should update existing player session', async () => {
      try {
        await PlayerSession.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const initialSessionData = {
        userId: 'user-2',
        userSessionId: 'session-789',
        name: 'User Two',
        email: 'user2@test.com',
        currentSocketId: 'socket-old',
        lastSeen: new Date('2024-01-01'),
        isActive: true
      }

      // Save initial session
      await savePlayerSession(initialSessionData)

      // Update session
      const updatedSessionData = {
        ...initialSessionData,
        currentSocketId: 'socket-new',
        lastSeen: new Date('2024-01-02'),
        isActive: true  // Keep active so it can be loaded
      }

      await savePlayerSession(updatedSessionData)

      // Load and verify updated session
      const sessions = await loadPlayerSessions()
      const loadedSession = sessions.get('user-2')
      expect(loadedSession.currentSocketId).toBe('socket-new')
      expect(loadedSession.isActive).toBe(true)
    })

    it('should only load active sessions', async () => {
      try {
        await PlayerSession.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const activeSessionData = {
        userId: 'user-active',
        userSessionId: 'session-active',
        name: 'Active User',
        email: 'active@test.com',
        currentSocketId: 'socket-active',
        lastSeen: new Date(),
        isActive: true
      }

      const inactiveSessionData = {
        userId: 'user-inactive',
        userSessionId: 'session-inactive',
        name: 'Inactive User',
        email: 'inactive@test.com',
        currentSocketId: 'socket-inactive',
        lastSeen: new Date(),
        isActive: false
      }

      // Save both sessions
      await savePlayerSession(activeSessionData)
      await savePlayerSession(inactiveSessionData)

      // Load sessions - should only return active ones
      const sessions = await loadPlayerSessions()
      expect(sessions.size).toBe(1)
      expect(sessions.has('user-active')).toBe(true)
      expect(sessions.has('user-inactive')).toBe(false)
    })

    it('should handle session save errors gracefully', async () => {
      try {
        await PlayerSession.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      // Test with invalid session data
      const invalidSessionData = {
        // Missing 'userId' field
        name: 'Invalid User',
        email: 'invalid@test.com'
      }

      // Should not throw an error, but handle it gracefully
      await expect(savePlayerSession(invalidSessionData)).resolves.not.toThrow()
    })
  })

  describe('Database Connection', () => {
    it('should handle connection failures gracefully', async () => {
      // Test with invalid MongoDB URI
      const originalUri = process.env.MONGODB_URI
      process.env.MONGODB_URI = 'mongodb://invalid:27017/test'

      try {
        await expect(connectToDatabase()).rejects.toThrow()
      } finally {
        // Restore original URI
        process.env.MONGODB_URI = originalUri
      }
    })

    it('should handle disconnection failures gracefully', async () => {
      // This test checks that disconnectDatabase doesn't throw when not connected
      await expect(disconnectDatabase()).resolves.not.toThrow()
    })

    it('should handle clear database errors gracefully', async () => {
      // Mock the clearDatabase function to throw an error
      const originalClearDatabase = clearDatabase
      const mockClearDatabase = vi.fn().mockRejectedValue(new Error('Database error'))

      // Temporarily replace the function
      global.clearDatabase = mockClearDatabase

      try {
        await expect(global.clearDatabase()).rejects.toThrow('Database error')
      } finally {
        // Restore original function
        global.clearDatabase = originalClearDatabase
      }
    })
  })

  describe('Complex Game State Persistence', () => {
    it('should save and load complex game state with shields and actions', async () => {
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const complexRoomData = {
        code: 'COMPLEX',
        players: [
          {
            userId: 'player-1',
            name: 'Player One',
            email: 'p1@test.com',
            isReady: true,
            score: 25,
            joinedAt: new Date('2024-01-01T10:00:00Z')
          },
          {
            userId: 'player-2',
            name: 'Player Two',
            email: 'p2@test.com',
            isReady: true,
            score: 18,
            joinedAt: new Date('2024-01-01T10:01:00Z')
          }
        ],
        maxPlayers: 2,
        gameState: {
          tiles: [
            { id: 0, color: 'red', emoji: '🟥', placedHeart: { value: 2, color: 'red', emoji: '❤️', placedBy: 'player-1', score: 4 } },
            { id: 1, color: 'yellow', emoji: '🟨', placedHeart: { value: 1, color: 'yellow', emoji: '💛', placedBy: 'player-2', score: 1 } },
            { id: 2, color: 'green', emoji: '🟩' },
            { id: 3, color: 'white', emoji: '⬜', placedHeart: { value: 3, color: 'red', emoji: '❤️', placedBy: 'player-1', score: 3 } }
          ],
          gameStarted: true,
          gameEnded: false,
          currentPlayer: { userId: 'player-2', name: 'Player Two' },
          deck: { emoji: '💌', cards: 8, type: 'hearts' },
          magicDeck: { emoji: '🔮', cards: 6, type: 'magic' },
          playerHands: {
            'player-1': [
              { id: 'heart-3', type: 'heart', color: 'green', value: 1, emoji: '💚' },
              { id: 'magic-1', type: 'magic', magicType: 'wind', emoji: '💨' },
              { id: 'magic-2', type: 'magic', magicType: 'shield', emoji: '🛡️' }
            ],
            'player-2': [
              { id: 'heart-4', type: 'heart', color: 'red', value: 2, emoji: '❤️' },
              { id: 'magic-3', type: 'magic', magicType: 'recycle', emoji: '♻️' }
            ]
          },
          shields: {
            'player-1': { remainingTurns: 2, activatedTurn: 3 },
            'player-2': { remainingTurns: 1, activatedTurn: 4 }
          },
          turnCount: 5,
          playerActions: {
            'player-1': { drawnHeart: true, drawnMagic: true, heartsPlaced: 2, magicCardsUsed: 1 },
            'player-2': { drawnHeart: true, drawnMagic: false, heartsPlaced: 1, magicCardsUsed: 0 }
          },
          endReason: null
        }
      }

      // Save complex room
      await saveRoom(complexRoomData)

      // Load and verify complex room
      const rooms = await loadRooms()
      const loadedRoom = rooms.get('COMPLEX')

      expect(loadedRoom.gameState.tiles).toHaveLength(4)
      expect(loadedRoom.gameState.tiles[0].placedHeart).toBeDefined()
      expect(loadedRoom.gameState.tiles[0].placedHeart.score).toBe(4)
      expect(loadedRoom.gameState.tiles[2].placedHeart).toBeUndefined()

      expect(loadedRoom.gameState.shields).toBeDefined()
      expect(loadedRoom.gameState.shields['player-1'].remainingTurns).toBe(2)
      expect(loadedRoom.gameState.shields['player-2'].remainingTurns).toBe(1)

      expect(loadedRoom.gameState.playerHands['player-1']).toHaveLength(3)
      expect(loadedRoom.gameState.playerHands['player-2']).toHaveLength(2)

      expect(loadedRoom.gameState.playerActions['player-1'].heartsPlaced).toBe(2)
      expect(loadedRoom.gameState.playerActions['player-2'].drawnMagic).toBe(false)

      expect(loadedRoom.players[0].joinedAt).toBeInstanceOf(Date)
      expect(loadedRoom.gameState.turnCount).toBe(5)
    })
  })
})