// Integration tests for database operations
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { createServer } from 'node:http'
import { io as ioc } from 'socket.io-client'
import { Server } from 'socket.io'
import { Room, PlayerSession, User } from '../../models.js'

// Import database utility functions from server-test-utils.js
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

// Import real server functions to ensure server.js code is executed and covered
import {
  validateRoomState,
  validatePlayerInRoom,
  generateTiles,
  calculateScore,
  sanitizeInput,
  checkGameEndConditions
} from '../../server.js'

function waitFor(socket, event) {
  return new Promise((resolve) => {
    socket.once(event, resolve)
  })
}

describe('Database Operations Integration', () => {
  let io, serverSocket, clientSocket

  beforeAll(async () => {
    // Set up Socket.IO server
    await new Promise((resolve) => {
      const httpServer = createServer()
      io = new Server(httpServer, {
        cors: {
          origin: "*",
          methods: ["GET", "POST"]
        }
      })

      httpServer.listen(() => {
        const port = httpServer.address().port
        clientSocket = ioc(`http://localhost:${port}`)
        io.on("connection", (socket) => {
          serverSocket = socket
        })
        clientSocket.on("connect", resolve)
      })
    })

    try {
      await connectToDatabase()
    } catch (error) {
      console.warn('Database connection failed, skipping tests:', error.message)
    }
  })

  afterAll(async () => {
    // Clean up Socket.IO server
    if (io) io.close()
    if (clientSocket) clientSocket.disconnect()

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
    it('should save and load rooms with complex game state', async () => {
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

      // Add strategic delay to ensure MongoDB operation completes
      await new Promise(resolve => setTimeout(resolve, 100))

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

    it('should handle room update and deletion', async () => {
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const testTimestamp = Date.now()
      const roomData = {
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
      await saveRoom(roomData)
      await new Promise(resolve => setTimeout(resolve, 100))

      // Update room
      const updatedRoomData = {
        ...roomData,
        players: [
          { userId: `user-1-${testTimestamp}`, name: 'Player 1', email: `p1-${testTimestamp}@test.com`, isReady: true, score: 15 },
          { userId: `user-2-${testTimestamp}`, name: 'Player 2', email: `p2-${testTimestamp}@test.com`, isReady: true, score: 8 }
        ],
        gameState: {
          ...roomData.gameState,
          gameStarted: true,
          turnCount: 2
        }
      }

      await saveRoom(updatedRoomData)
      await new Promise(resolve => setTimeout(resolve, 100))

      // Load and verify updated room
      const rooms = await loadRooms()
      const loadedRoom = rooms.get(`TESTUPD${testTimestamp}`)

      expect(loadedRoom.players).toHaveLength(2)
      expect(loadedRoom.players[0].isReady).toBe(true)
      expect(loadedRoom.players[0].score).toBe(15)
      expect(loadedRoom.gameState.gameStarted).toBe(true)
      expect(loadedRoom.gameState.turnCount).toBe(2)

      // Delete room
      await deleteRoom(`TESTUPD${testTimestamp}`)
      await new Promise(resolve => setTimeout(resolve, 100))

      const finalRooms = await loadRooms()
      expect(finalRooms.has(`TESTUPD${testTimestamp}`)).toBe(false)
    })
  })

  describe('Player Session Operations', () => {
    it('should save and load player sessions with active/inactive filtering', async () => {
      try {
        await PlayerSession.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

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

      // Update session to inactive
      const inactiveSessionData = {
        ...sessionData,
        isActive: false
      }
      await savePlayerSession(inactiveSessionData)

      // Load sessions again - should not return inactive sessions
      const activeSessions = await loadPlayerSessions()
      expect(activeSessions.size).toBe(0)
    })
  })

  describe('deleteRoom Function Error Handling', () => {
    it('should handle deleteRoom function errors properly', async () => {
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const testTimestamp = Date.now()
      const roomData = {
        code: `ERRTEST${testTimestamp}`,
        players: [
          { userId: `user-1-${testTimestamp}`, name: 'Player 1', email: `p1-${testTimestamp}@test.com`, isReady: true, score: 5 }
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
          playerActions: {}
        }
      }

      // Save the room first
      await saveRoom(roomData)
      await new Promise(resolve => setTimeout(resolve, 100))

      // Mock console.error to capture error logging
      const originalConsoleError = console.error
      let consoleErrorCalled = false
      let loggedError = null

      console.error = (...args) => {
        consoleErrorCalled = true
        loggedError = args[0]
        originalConsoleError(...args)
      }

      // Import and test the actual deleteRoom function directly with mocked Room.deleteOne
      const { deleteRoom } = await import('../../models.js')

      // Mock Room.deleteOne to throw an error to test error handling
      const originalDeleteOne = Room.deleteOne
      Room.deleteOne = vi.fn().mockRejectedValue(new Error('Database connection failed'))

      // The deleteRoom function should throw the error after logging it
      await expect(deleteRoom(`ERRTEST${testTimestamp}`)).rejects.toThrow('Database connection failed')

      // Verify console.error was called (this covers lines 219-223)
      expect(consoleErrorCalled).toBe(true)
      expect(loggedError).toBe('Failed to delete room:')

      // Restore original function and console.error
      Room.deleteOne = originalDeleteOne
      console.error = originalConsoleError

      // Clean up - actually delete the room
      await originalDeleteOne.call(Room, { code: `ERRTEST${testTimestamp}` })
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

      expect(loadedRoom.players[0].joinedAt).toBeInstanceOf(Date)
      expect(loadedRoom.gameState.turnCount).toBe(5)
    })
  })

  describe('Server.js Utility Functions Integration', () => {
    it('should execute room validation functions from server.js', async () => {
      // Test room state validation
      const nullStateResult = validateRoomState(null)
      expect(nullStateResult.valid).toBe(false)
      expect(nullStateResult.error).toBeDefined()

      // Test player validation
      const mockRoomWithEmptyPlayers = { players: [] }
      const emptyPlayerResult = validatePlayerInRoom(mockRoomWithEmptyPlayers, 'test-user')
      expect(emptyPlayerResult.valid).toBe(false)
      expect(emptyPlayerResult.error).toBeDefined()

      // Test with valid room object
      const mockRoomWithPlayers = {
        players: [
          { userId: 'user1', name: 'Player 1', isReady: true },
          { userId: 'user2', name: 'Player 2', isReady: false }
        ]
      }
      const validPlayerResult = validatePlayerInRoom(mockRoomWithPlayers, 'user1')
      expect(validPlayerResult.valid).toBe(true)

      // Test room code validation via server.js
      const { validateRoomCode } = await import('../../server.js')
      const validCode = validateRoomCode('TEST01')
      expect(validCode).toBe(true) // validateRoomCode returns boolean directly

      const invalidCode = validateRoomCode('TOOLONG')
      expect(invalidCode).toBe(false) // validateRoomCode returns boolean directly
    })

    it('should execute game logic functions from server.js', async () => {
      // Test tile generation
      const tiles = generateTiles()
      expect(tiles).toBeDefined()
      expect(Array.isArray(tiles)).toBe(true)
      expect(tiles.length).toBeGreaterThan(0)
      expect(tiles.length).toBe(8) // Always generates 8 tiles

      // Test score calculation
      const heartCard = { value: 3, color: 'red' }
      const redTile = { color: 'red' }
      const blueTile = { color: 'blue' }
      const whiteTile = { color: 'white' }

      const matchingScore = calculateScore(heartCard, redTile)
      expect(matchingScore).toBe(6) // Double points for matching colors

      const mismatchScore = calculateScore(heartCard, blueTile)
      expect(mismatchScore).toBe(0) // Zero points for mismatch

      const whiteTileScore = calculateScore(heartCard, whiteTile)
      expect(whiteTileScore).toBe(3) // Face value for white tiles

      // Test game end conditions
      const mockRoomWithEmptyTiles = {
        gameState: {
          gameStarted: false,
          tiles: [],
          deck: { cards: 16 },
          magicDeck: { cards: 16 }
        }
      }
      const emptyState = checkGameEndConditions(mockRoomWithEmptyTiles, false)
      expect(emptyState.shouldEnd).toBe(false)

      const fullDeckEmpty = checkGameEndConditions(mockRoomWithEmptyTiles, true)
      expect(fullDeckEmpty.shouldEnd).toBe(false) // Game not started

      // Test utility functions
      const cleanInput = sanitizeInput('<script>alert("test")</script>')
      expect(cleanInput).not.toContain('<script>')
      expect(cleanInput).not.toContain('</script>')
    })
  })

  describe('User Authentication Integration', () => {
    it('should hash password before saving user', async () => {
      try {
        await User.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const testTimestamp = Date.now()
      const plainPassword = 'testPassword123'
      const userEmail = `test-user-${testTimestamp}@example.com`

      // Create user with plain password
      const userData = {
        name: 'Test User',
        email: userEmail,
        password: plainPassword
      }

      // Save user - this should trigger the pre-save middleware
      const savedUser = new User(userData)
      await savedUser.save()

      // Verify user was saved
      expect(savedUser._id).toBeDefined()
      expect(savedUser.name).toBe('Test User')
      expect(savedUser.email).toBe(userEmail)

      // Assert that the password is hashed (not equal to plain password)
      expect(savedUser.password).not.toBe(plainPassword)
      expect(savedUser.password).toHaveLength(60) // bcrypt hash length

      // Assert that the password starts with $2b$12$ (bcrypt format with salt rounds 12)
      expect(savedUser.password).toMatch(/^\$2b\$12\$/)

      // Test that the comparePassword method works correctly
      const isMatch = await savedUser.comparePassword(plainPassword)
      expect(isMatch).toBe(true)

      // Test that wrong password doesn't match
      const isWrongMatch = await savedUser.comparePassword('wrongPassword')
      expect(isWrongMatch).toBe(false)

      // Retrieve user from database to verify persistence
      const retrievedUser = await User.findOne({ email: userEmail })
      expect(retrievedUser).toBeDefined()
      expect(retrievedUser.password).not.toBe(plainPassword)
      expect(retrievedUser.password).toMatch(/^\$2b\$12\$/)

      // Verify the retrieved user's comparePassword method also works
      const retrievedUserMatch = await retrievedUser.comparePassword(plainPassword)
      expect(retrievedUserMatch).toBe(true)
    })

    it('should not hash password if password is not modified', async () => {
      try {
        await User.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const testTimestamp = Date.now()
      const plainPassword = 'testPassword456'
      const userEmail = `test-user-modified-${testTimestamp}@example.com`

      // Create user with plain password
      const userData = {
        name: 'Test User Modified',
        email: userEmail,
        password: plainPassword
      }

      // Save user - this should trigger the pre-save middleware
      const savedUser = new User(userData)
      await savedUser.save()

      // Get the initial hashed password
      const initialHashedPassword = savedUser.password

      // Update only the name field (not password)
      savedUser.name = 'Updated Test User'
      await savedUser.save()

      // Assert that the password hash remains unchanged
      expect(savedUser.password).toBe(initialHashedPassword)
      expect(savedUser.name).toBe('Updated Test User')

      // Verify password comparison still works
      const isMatch = await savedUser.comparePassword(plainPassword)
      expect(isMatch).toBe(true)
    })

    it('should rehash password when password field is modified', async () => {
      try {
        await User.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const testTimestamp = Date.now()
      const initialPassword = 'initialPassword123'
      const updatedPassword = 'updatedPassword456'
      const userEmail = `test-user-rehash-${testTimestamp}@example.com`

      // Create user with initial password
      const userData = {
        name: 'Test User Rehash',
        email: userEmail,
        password: initialPassword
      }

      // Save user - this should trigger the pre-save middleware
      const savedUser = new User(userData)
      await savedUser.save()

      // Get the initial hashed password
      const initialHashedPassword = savedUser.password

      // Update the password field
      savedUser.password = updatedPassword
      await savedUser.save()

      // Assert that the password hash has changed
      expect(savedUser.password).not.toBe(initialHashedPassword)
      expect(savedUser.password).toMatch(/^\$2b\$12\$/)

      // Verify old password no longer works
      const oldPasswordMatch = await savedUser.comparePassword(initialPassword)
      expect(oldPasswordMatch).toBe(false)

      // Verify new password works
      const newPasswordMatch = await savedUser.comparePassword(updatedPassword)
      expect(newPasswordMatch).toBe(true)
    })
  })
})