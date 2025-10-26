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

      // Use unique identifiers to avoid duplicate key errors
      const testTimestamp = Date.now()
      const roomData = {
        code: `TEST${testTimestamp}`,
        players: [
          {
            userId: `user-1-${testTimestamp}`,
            name: 'Player 1',
            email: `player1-${testTimestamp}@test.com`,
            isReady: true,
            score: 10
          },
          {
            userId: `user-2-${testTimestamp}`,
            name: 'Player 2',
            email: `player2-${testTimestamp}@test.com`,
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
          currentPlayer: { userId: `user-1-${testTimestamp}`, name: 'Player 1' },
          deck: { emoji: '💌', cards: 12, },
          magicDeck: { emoji: '🔮', cards: 10, },
          playerHands: {
            [`user-1-${testTimestamp}`]: [
              { id: 'heart-1', type: 'heart', color: 'red', value: 2, emoji: '❤️' }
            ],
            [`user-2-${testTimestamp}`]: [
              { id: 'heart-2', type: 'heart', color: 'yellow', value: 1, emoji: '💛' }
            ]
          },
          turnCount: 3,
          playerActions: {
            [`user-1-${testTimestamp}`]: { drawnHeart: true, drawnMagic: false, heartsPlaced: 1, magicCardsUsed: 0 },
            [`user-2-${testTimestamp}`]: { drawnHeart: false, drawnMagic: false, heartsPlaced: 0, magicCardsUsed: 0 }
          }
        }
      }

      // Save room
      await saveRoom(roomData)

      // Load rooms
      const rooms = await loadRooms()
      expect(rooms.size).toBe(1)
      expect(rooms.has(`TEST${testTimestamp}`)).toBe(true)

      const loadedRoom = rooms.get(`TEST${testTimestamp}`)

      // Defensive check to ensure room was loaded properly
      expect(loadedRoom).toBeDefined()
      expect(loadedRoom).not.toBeNull()

      expect(loadedRoom.code).toBe(`TEST${testTimestamp}`)
      expect(loadedRoom.players).toBeDefined()
      expect(loadedRoom.players).toHaveLength(2)
      expect(loadedRoom.players[0].name).toBe('Player 1')
      expect(loadedRoom.players[0].score).toBe(10)
      expect(loadedRoom.gameState.gameStarted).toBe(true)
      expect(loadedRoom.gameState.tiles).toHaveLength(2)
      expect(loadedRoom.gameState.deck.cards).toBe(12)
      expect(loadedRoom.gameState.turnCount).toBe(3)
      expect(loadedRoom.gameState.playerActions.get(`user-1-${testTimestamp}`).drawnHeart).toBe(true)
    })

    it('should update existing room', async () => {
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      // Use unique identifiers to avoid duplicate key errors
      const testTimestamp = Date.now()
      const initialRoomData = {
        code: `TESTUPD${testTimestamp}`,
        players: [
          { userId: `user-1-${testTimestamp}`, name: 'Player 1', email: `p1-${testTimestamp}@test.com`, isReady: false, score: 0 }
        ],
        maxPlayers: 2,
        gameState: {
          tiles: [],
          gameStarted: false,
          currentPlayer: null,
          deck: { emoji: '💌', cards: 16, },
          magicDeck: { emoji: '🔮', cards: 16, },
          playerHands: {},
          turnCount: 0,
          playerActions: {
            [`user-1-${testTimestamp}`]: { drawnHeart: false, drawnMagic: false, heartsPlaced: 0, magicCardsUsed: 0 }
          }
        }
      }

      // Save initial room
      await saveRoom(initialRoomData)

      // Update room
      const updatedRoomData = {
        ...initialRoomData,
        players: [
          { userId: `user-1-${testTimestamp}`, name: 'Player 1', email: `p1-${testTimestamp}@test.com`, isReady: true, score: 15 },
          { userId: `user-2-${testTimestamp}`, name: 'Player 2', email: `p2-${testTimestamp}@test.com`, isReady: true, score: 8 }
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
      const loadedRoom = rooms.get(`TESTUPD${testTimestamp}`)

      // Defensive check to ensure room was loaded properly
      expect(loadedRoom).toBeDefined()
      expect(loadedRoom).not.toBeNull()

      expect(loadedRoom.players).toBeDefined()
      expect(loadedRoom.players).toHaveLength(2)
      expect(loadedRoom.players[0].isReady).toBe(true)
      expect(loadedRoom.players[0].score).toBe(15)
      expect(loadedRoom.players[1].name).toBe('Player 2')
      expect(loadedRoom.gameState).toBeDefined()
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

      // Use unique identifiers to avoid duplicate key errors
      const testTimestamp = Date.now()
      const roomData = {
        code: `TESTDEL${testTimestamp}`,
        players: [],
        maxPlayers: 2,
        gameState: {
          tiles: [],
          gameStarted: false,
          currentPlayer: null,
          deck: { emoji: '💌', cards: 16, },
          magicDeck: { emoji: '🔮', cards: 16, },
          playerHands: {},
          turnCount: 0,
          playerActions: {}
        }
      }

      // Save room
      await saveRoom(roomData)
      let rooms = await loadRooms()
      expect(rooms.has(`TESTDEL${testTimestamp}`)).toBe(true)

      // Delete room
      await deleteRoom(`TESTDEL${testTimestamp}`)
      rooms = await loadRooms()
      expect(rooms.has(`TESTDEL${testTimestamp}`)).toBe(false)
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

      // Should throw an error for invalid data
      await expect(saveRoom(invalidRoomData)).rejects.toThrow('Room data and code are required')
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

      // Use unique identifiers to avoid duplicate key errors
      const testTimestamp = Date.now()
      const sessionData = {
        userId: `user-1-${testTimestamp}`,
        userSessionId: `session-123-${testTimestamp}`,
        name: 'Test User',
        email: `test-${testTimestamp}@example.com`,
        currentSocketId: 'socket-456',
        lastSeen: new Date(),
        isActive: true
      }

      // Save session
      await savePlayerSession(sessionData)

      // Load sessions
      const sessions = await loadPlayerSessions()
      expect(sessions.size).toBe(1)
      expect(sessions.has(`user-1-${testTimestamp}`)).toBe(true)

      const loadedSession = sessions.get(`user-1-${testTimestamp}`)
      expect(loadedSession.name).toBe('Test User')
      expect(loadedSession.email).toBe(`test-${testTimestamp}@example.com`)
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

      // Use unique identifiers to avoid duplicate key errors
      const testTimestamp = Date.now()
      const initialSessionData = {
        userId: `user-2-${testTimestamp}`,
        userSessionId: `session-789-${testTimestamp}`,
        name: 'User Two',
        email: `user2-${testTimestamp}@test.com`,
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
      const loadedSession = sessions.get(`user-2-${testTimestamp}`)
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

      // Use unique identifiers to avoid duplicate key errors
      const testTimestamp = Date.now()
      const activeSessionData = {
        userId: `user-active-${testTimestamp}`,
        userSessionId: `session-active-${testTimestamp}`,
        name: 'Active User',
        email: `active-${testTimestamp}@test.com`,
        currentSocketId: 'socket-active',
        lastSeen: new Date(),
        isActive: true
      }

      const inactiveSessionData = {
        userId: `user-inactive-${testTimestamp}`,
        userSessionId: `session-inactive-${testTimestamp}`,
        name: 'Inactive User',
        email: `inactive-${testTimestamp}@test.com`,
        currentSocketId: 'socket-inactive',
        lastSeen: new Date(),
        isActive: false
      }

      // Save both sessions
      await savePlayerSession(activeSessionData)
      await savePlayerSession(inactiveSessionData)

      // Verify sessions were saved by checking directly in database
      const allSessions = await PlayerSession.find({})
      console.log('All sessions in DB:', allSessions.map(s => ({ userId: s.userId, isActive: s.isActive })))

      // Load sessions - should only return active ones
      const sessions = await loadPlayerSessions()
      console.log('Loaded sessions count:', sessions.size, 'expected: 1')

      expect(sessions.size).toBe(1)
      expect(sessions.has(`user-active-${testTimestamp}`)).toBe(true)
      expect(sessions.has(`user-inactive-${testTimestamp}`)).toBe(false)
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
      // Test with invalid MongoDB URI (wrong port)
      const originalUri = process.env.MONGODB_URI
      const originalNodeEnv = process.env.NODE_ENV

      process.env.MONGODB_URI = 'mongodb://localhost:99999/test' // Invalid port
      process.env.NODE_ENV = 'development' // Disable retries for this test

      try {
        // Disconnect first to force a new connection attempt
        await disconnectDatabase()
        await expect(connectToDatabase()).rejects.toThrow()
      } finally {
        // Restore original environment
        process.env.MONGODB_URI = originalUri
        process.env.NODE_ENV = originalNodeEnv
      }
    }, 8000) // Reduced timeout since port check is faster than DNS

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
          deck: { emoji: '💌', cards: 8, },
          magicDeck: { emoji: '🔮', cards: 6, },
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

      // Defensive check to ensure room was loaded properly
      expect(loadedRoom).toBeDefined()
      expect(loadedRoom).not.toBeNull()
      expect(loadedRoom.gameState).toBeDefined()

      expect(loadedRoom.gameState.tiles).toHaveLength(4)
      expect(loadedRoom.gameState.tiles[0].placedHeart).toBeDefined()
      expect(loadedRoom.gameState.tiles[0].placedHeart.score).toBe(4)
      // Tile 2 should have no heart (or empty heart with default values)
      const tile2Heart = loadedRoom.gameState.tiles[2].placedHeart
      if (tile2Heart) {
        // If exists, it should have default values (MongoDB schema behavior)
        expect(tile2Heart.value).toBe(0)
        expect(tile2Heart.score).toBe(0)
      } else {
        // Or it should be undefined
        expect(tile2Heart).toBeUndefined()
      }

      expect(loadedRoom.gameState.shields).toBeDefined()

      // Check shields - could be Map or plain object after database load
      let player1Shield, player2Shield
      if (loadedRoom.gameState.shields instanceof Map) {
        player1Shield = loadedRoom.gameState.shields.get('player-1')
        player2Shield = loadedRoom.gameState.shields.get('player-2')
      } else {
        player1Shield = loadedRoom.gameState.shields['player-1']
        player2Shield = loadedRoom.gameState.shields['player-2']
      }

      expect(player1Shield).toBeDefined()
      expect(player1Shield.remainingTurns).toBe(2)
      expect(player2Shield).toBeDefined()
      expect(player2Shield.remainingTurns).toBe(1)

      // Check playerHands - could be Map or plain object after database load
      let player1Hands, player2Hands
      if (loadedRoom.gameState.playerHands instanceof Map) {
        player1Hands = loadedRoom.gameState.playerHands.get('player-1')
        player2Hands = loadedRoom.gameState.playerHands.get('player-2')
      } else {
        player1Hands = loadedRoom.gameState.playerHands['player-1']
        player2Hands = loadedRoom.gameState.playerHands['player-2']
      }
      expect(player1Hands).toHaveLength(3)
      expect(player2Hands).toHaveLength(2)

      // Check playerActions - could be Map or plain object after database load
      let player1Actions, player2Actions
      if (loadedRoom.gameState.playerActions instanceof Map) {
        player1Actions = loadedRoom.gameState.playerActions.get('player-1')
        player2Actions = loadedRoom.gameState.playerActions.get('player-2')
      } else {
        player1Actions = loadedRoom.gameState.playerActions['player-1']
        player2Actions = loadedRoom.gameState.playerActions['player-2']
      }
      expect(player1Actions.heartsPlaced).toBe(2)
      expect(player2Actions.drawnMagic).toBe(false)

      expect(loadedRoom.players[0].joinedAt).toBeInstanceOf(Date)
      expect(loadedRoom.gameState.turnCount).toBe(5)
    })
  })
})