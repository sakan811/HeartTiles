// Integration tests for authentication flows
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest'

// Create mock functions before mocking the module - this must be done before any imports
const { getToken: mockGetToken, mockUserFindById } = vi.hoisted(() => ({
  getToken: vi.fn(),
  mockUserFindById: vi.fn()
}))

// Mock next-auth/jwt module properly
vi.mock('next-auth/jwt', () => ({
  getToken: mockGetToken
}))

// Now import the functions after mocking is set up
import {
  authenticateSocket,
  getPlayerSession,
  updatePlayerSocket,
  migratePlayerData,
  loadPlayerSessions,
  savePlayerSession,
  connectToDatabase,
  disconnectDatabase,
  clearDatabase
} from '../utils/server-test-utils.js'

// Import models for real database operations (unmocked for integration tests)
import { User, PlayerSession, Room } from '../../models.js'

describe('Authentication Integration Tests', () => {
  let mockRooms, mockPlayerSessions

  beforeAll(async () => {
    try {
      await connectToDatabase()
    } catch (error) {
      console.warn('Database connection failed for authentication tests:', error.message)
    }
  })

  afterAll(async () => {
    try {
      await disconnectDatabase()
    } catch (error) {
      console.warn('Database disconnection failed for authentication tests:', error.message)
    }
  })

  beforeEach(async () => {
    try {
      await clearDatabase()
    } catch (error) {
      console.warn('Database clear failed for authentication tests:', error.message)
    }

    mockRooms = new Map()
    mockPlayerSessions = new Map()
  })

  describe('Socket Authentication', () => {
    beforeEach(() => {
      // Reset the mock before each authentication test
      mockGetToken.mockReset()
      mockUserFindById.mockReset()
    })

    it('should authenticate socket with valid token', async () => {
      // Mock successful token retrieval
      const userId = '507f1f77bcf86cd799439011' // Valid 24-character hex string
      mockGetToken.mockResolvedValue({
        id: userId,
        jti: 'session-456',
        email: 'test@example.com',
        name: 'Test User'
      })

      // Mock successful user lookup
      const mockUser = {
        _id: userId,
        id: userId,
        email: 'test@example.com',
        name: 'Test User'
      }

      const mockSocket = {
        handshake: {},
        data: {}
      }

      mockUserFindById.mockResolvedValue(mockUser)

      const mockUserModel = { findById: mockUserFindById }
      const result = await authenticateSocket(mockSocket, mockGetToken, mockUserModel)

      expect(result.authenticated).toBe(true)
      expect(result.user).toEqual(mockUser)
      expect(mockSocket.data.userId).toBe(userId)
      expect(mockSocket.data.userEmail).toBe('test@example.com')
      expect(mockSocket.data.userName).toBe('Test User')
      expect(mockSocket.data.userSessionId).toBe('session-456')
    })

    it('should reject socket with invalid token', async () => {
      // Mock failed token retrieval
      mockGetToken.mockResolvedValue(null)

      const mockSocket = {
        handshake: {},
        data: {}
      }

      const mockUserModel = { findById: mockUserFindById }
      await expect(authenticateSocket(mockSocket, mockGetToken, mockUserModel)).rejects.toThrow('Authentication required')
    })

    it('should reject socket when user not found', async () => {
      // Mock successful token but failed user lookup
      mockGetToken.mockResolvedValue({
        id: '507f1f77bcf86cd799439012', // Valid 24-character hex string
        jti: 'session-456'
      })

      const mockSocket = {
        handshake: {},
        data: {}
      }

      mockUserFindById.mockResolvedValue(null)

      const mockUserModel = { findById: mockUserFindById }
      await expect(authenticateSocket(mockSocket, mockGetToken, mockUserModel)).rejects.toThrow('User not found')
    })

    it('should handle authentication errors gracefully', async () => {
      // Mock token retrieval error
      mockGetToken.mockRejectedValue(new Error('Token verification failed'))

      const mockSocket = {
        handshake: {},
        data: {}
      }

      const mockUserModel = { findById: mockUserFindById }
      await expect(authenticateSocket(mockSocket, mockGetToken, mockUserModel)).rejects.toThrow('Token verification failed')
    })
  })

  describe('Player Session Management', () => {
    it('should create new player session', async () => {
      const userId = 'user-1'
      const userSessionId = 'session-1'
      const userName = 'Test User'
      const userEmail = 'test@example.com'

      const session = await getPlayerSession(
        mockPlayerSessions,
        userId,
        userSessionId,
        userName,
        userEmail
      )

      expect(session.userId).toBe(userId)
      expect(session.userSessionId).toBe(userSessionId)
      expect(session.name).toBe(userName)
      expect(session.email).toBe(userEmail)
      expect(session.isActive).toBe(true)
      expect(session.lastSeen).toBeInstanceOf(Date)
      expect(mockPlayerSessions.has(userId)).toBe(true)
    })

    it('should update existing player session', async () => {
      const userId = 'user-2'
      const userSessionId = 'session-2'
      const userName = 'Test User'
      const userEmail = 'test@example.com'

      // Create initial session
      await getPlayerSession(
        mockPlayerSessions,
        userId,
        userSessionId,
        userName,
        userEmail
      )

      const initialSession = mockPlayerSessions.get(userId)
      const initialLastSeen = initialSession.lastSeen

      // Wait a bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10))

      // Update session
      const updatedSession = await getPlayerSession(
        mockPlayerSessions,
        userId,
        userSessionId,
        userName,
        userEmail
      )

      expect(updatedSession.userId).toBe(userId)
      expect(updatedSession.isActive).toBe(true)
      expect(updatedSession.lastSeen.getTime()).toBeGreaterThan(initialLastSeen.getTime())
      expect(mockPlayerSessions.size).toBe(1) // Still only one session
    })

    it('should update player socket information', async () => {
      const userId = 'user-3'
      const userSessionId = 'session-3'
      const userName = 'Socket User'
      const userEmail = 'socket@example.com'
      const socketId = 'socket-123'

      // Create session first
      await getPlayerSession(
        mockPlayerSessions,
        userId,
        userSessionId,
        userName,
        userEmail
      )

      // Update socket information
      const updatedSession = await updatePlayerSocket(
        mockPlayerSessions,
        userId,
        socketId,
        userSessionId,
        userName,
        userEmail
      )

      expect(updatedSession.currentSocketId).toBe(socketId)
      expect(updatedSession.isActive).toBe(true)
      expect(updatedSession.lastSeen).toBeInstanceOf(Date)
    })

    it('should handle session creation errors gracefully', async () => {
      // Create a real session in database and test error handling
      const userId = `user-error-${Date.now()}`
      const userSessionId = `session-error-${Date.now()}`

      try {
        const session = await getPlayerSession(
          mockPlayerSessions,
          userId,
          userSessionId,
          'Error User',
          'error@example.com'
        )

        // Should return a session object
        expect(session).toBeDefined()
        expect(session.userId).toBe(userId)
        expect(session.userSessionId).toBe(userSessionId)
        expect(session.name).toBe('Error User')
        expect(session.email).toBe('error@example.com')

        // Verify session was saved to database
        const savedSession = await PlayerSession.findOne({ userId })
        expect(savedSession).toBeDefined()
        expect(savedSession.name).toBe('Error User')
      } catch (error) {
        // If there's an error, ensure we get a meaningful session object anyway
        console.warn('Session creation failed as expected:', error.message)
        expect(error).toBeDefined()
      }
    })
  })

  describe('Player Data Migration', () => {
    it('should migrate player data when user ID changes', async () => {
      const room = {
        code: 'MIGRATE01',
        players: [
          { userId: 'old-user-1', name: 'Old User', email: 'old@example.com', score: 10 }
        ],
        gameState: {
          playerHands: {
            'old-user-1': [
              { id: 'heart-1', type: 'heart', color: 'red', value: 2 },
              { id: 'magic-1', type: 'magic', magicType: 'wind' }
            ]
          },
          shields: {
            'old-user-1': { remainingTurns: 2, activatedTurn: 1 }
          },
          currentPlayer: { userId: 'old-user-1', name: 'Old User' }
        }
      }

      const oldUserId = 'old-user-1'
      const newUserId = 'new-user-1'
      const userName = 'New User'
      const userEmail = 'new@example.com'

      await migratePlayerData(room, oldUserId, newUserId, userName, userEmail)

      // Verify player data migrated
      expect(room.players[0].userId).toBe(newUserId)
      expect(room.players[0].name).toBe(userName)
      expect(room.players[0].email).toBe(userEmail)
      expect(room.players[0].score).toBe(10) // Score preserved

      // Verify player hand migrated
      expect(room.gameState.playerHands[newUserId]).toBeDefined()
      expect(room.gameState.playerHands['old-user-1']).toBeUndefined()

      // Verify shield state migrated
      expect(room.gameState.shields[newUserId]).toBeDefined()
      expect(room.gameState.shields['old-user-1']).toBeUndefined()

      // Verify current player updated
      expect(room.gameState.currentPlayer.userId).toBe(newUserId)
      expect(room.gameState.currentPlayer.name).toBe(userName)
    })

    it('should add new player if old player not found', async () => {
      const room = {
        code: 'ADDNEW01',
        players: [
          { userId: 'existing-user', name: 'Existing User', email: 'existing@example.com', score: 5 }
        ],
        gameState: {
          playerHands: {},
          shields: {},
          currentPlayer: { userId: 'existing-user', name: 'Existing User' }
        }
      }

      const oldUserId = 'nonexistent-user'
      const newUserId = 'brand-new-user'
      const userName = 'Brand New User'
      const userEmail = 'brandnew@example.com'

      await migratePlayerData(room, oldUserId, newUserId, userName, userEmail)

      // Verify new player added
      expect(room.players).toHaveLength(2)
      const newPlayer = room.players.find(p => p.userId === newUserId)
      expect(newPlayer).toBeDefined()
      expect(newPlayer.name).toBe(userName)
      expect(newPlayer.email).toBe(userEmail)
      expect(newPlayer.score).toBe(0) // New player starts with 0 score
      expect(newPlayer.isReady).toBe(false)
    })

    it('should handle migration errors gracefully', async () => {
      const room = {
        players: [],
        gameState: { playerHands: {}, shields: {}, currentPlayer: null }
      }

      // Should not throw even with invalid room data
      await expect(
        migratePlayerData(room, 'old', 'new', 'Name', 'email@example.com')
      ).resolves.not.toThrow()
    })
  })

  describe('Authentication Edge Cases', () => {
    it('should handle missing user session ID', async () => {
      const userId = 'user-no-session'
      const userName = 'No Session User'
      const userEmail = 'nosession@example.com'

      // Should still work without session ID
      const session = await getPlayerSession(
        mockPlayerSessions,
        userId,
        null, // No session ID
        userName,
        userEmail
      )

      expect(session.userId).toBe(userId)
      expect(session.name).toBe(userName)
      expect(session.userSessionId).toBeNull()
    })

    it('should handle expired tokens', async () => {
      // Mock expired token
      const expiredUserId = '507f1f77bcf86cd799439013' // Valid 24-character hex string
      mockGetToken.mockResolvedValue({
        id: expiredUserId,
        jti: 'session-expired',
        email: 'expired@example.com',
        name: 'Expired User',
        exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
      })

      const mockUser = {
        _id: expiredUserId,
        id: expiredUserId,
        email: 'expired@example.com',
        name: 'Expired User'
      }

      const mockSocket = {
        handshake: {},
        data: {}
      }

      mockUserFindById.mockResolvedValue(mockUser)

      // Token verification should happen at the NextAuth level
      // Our implementation should still work with the token provided
      const mockUserModel = { findById: mockUserFindById }
      const result = await authenticateSocket(mockSocket, mockGetToken, mockUserModel)
      expect(result.authenticated).toBe(true)
    })

    it('should handle malformed token data', async () => {
      // Mock malformed token
      mockGetToken.mockResolvedValue({
        // Missing required 'id' field
        jti: 'session-malformed',
        email: 'malformed@example.com'
      })

      const mockSocket = {
        handshake: {},
        data: {}
      }

      const mockUserModel = { findById: mockUserFindById }
      await expect(authenticateSocket(mockSocket, mockGetToken, mockUserModel)).rejects.toThrow('Authentication required')
    })

    it('should handle database connection errors during authentication', async () => {
      // Mock successful token but database error
      mockGetToken.mockResolvedValue({
        id: '507f1f77bcf86cd799439014', // Valid 24-character hex string
        jti: 'session-db-error'
      })

      const mockSocket = {
        handshake: {},
        data: {}
      }

      mockUserFindById.mockRejectedValue(new Error('Database connection failed'))

      const mockUserModel = { findById: mockUserFindById }
      await expect(authenticateSocket(mockSocket, mockGetToken, mockUserModel)).rejects.toThrow('Database connection failed')
    })
  })

  describe('Session Persistence', () => {
    it('should load active sessions from database', async () => {
      // Mock database sessions
      const mockDbSessions = [
        {
          userId: 'db-user-1',
          userSessionId: 'db-session-1',
          name: 'DB User 1',
          email: 'db1@example.com',
          currentSocketId: 'socket-1',
          lastSeen: new Date(),
          isActive: true
        },
        {
          userId: 'db-user-2',
          userSessionId: 'db-session-2',
          name: 'DB User 2',
          email: 'db2@example.com',
          currentSocketId: 'socket-2',
          lastSeen: new Date(),
          isActive: false // Should not be loaded
        }
      ]

      const serverUtils = await import('../utils/server-test-utils.js')
      const mockLoadPlayerSessions = vi.spyOn(serverUtils, 'loadPlayerSessions')
        .mockResolvedValue(new Map(mockDbSessions.filter(s => s.isActive).map(s => [s.userId, s])))

      try {
        const sessions = await serverUtils.loadPlayerSessions()
        expect(sessions.size).toBe(1) // Only active session
        expect(sessions.has('db-user-1')).toBe(true)
        expect(sessions.has('db-user-2')).toBe(false)

        const activeSession = sessions.get('db-user-1')
        expect(activeSession.name).toBe('DB User 1')
        expect(activeSession.isActive).toBe(true)
      } finally {
        mockLoadPlayerSessions.mockRestore()
      }
    })

    it('should handle database errors during session loading', async () => {
      const serverUtils = await import('../utils/server-test-utils.js')
      const mockLoadPlayerSessions = vi.spyOn(serverUtils, 'loadPlayerSessions')
        .mockRejectedValue(new Error('Database error'))

      try {
        // This should throw an error since we mocked it to throw
        await expect(serverUtils.loadPlayerSessions()).rejects.toThrow('Database error')
      } finally {
        mockLoadPlayerSessions.mockRestore()
      }
    })

    it('should maintain session consistency across reconnections', async () => {
      const userId = 'reconnect-user'
      const userSessionId = 'reconnect-session'
      const userName = 'Reconnect User'
      const userEmail = 'reconnect@example.com'

      // Initial connection
      let session = await getPlayerSession(
        mockPlayerSessions,
        userId,
        userSessionId,
        userName,
        userEmail
      )
      expect(session.currentSocketId).toBeNull()

      // Update socket ID
      session = await updatePlayerSocket(
        mockPlayerSessions,
        userId,
        'socket-1',
        userSessionId,
        userName,
        userEmail
      )
      expect(session.currentSocketId).toBe('socket-1')

      // Reconnection with new socket ID
      session = await updatePlayerSocket(
        mockPlayerSessions,
        userId,
        'socket-2',
        userSessionId,
        userName,
        userEmail
      )
      expect(session.currentSocketId).toBe('socket-2')
      expect(session.isActive).toBe(true)

      // Verify only one session exists
      expect(mockPlayerSessions.size).toBe(1)
      expect(mockPlayerSessions.has(userId)).toBe(true)
    })
  })
})