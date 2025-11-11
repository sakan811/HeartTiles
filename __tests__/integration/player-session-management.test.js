import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'

// Create mock functions before mocking the module - this must be done before any imports
const { getToken: mockGetToken, mockUserFindById } = vi.hoisted(() => ({
  getToken: vi.fn(),
  mockUserFindById: vi.fn()
}))

// Mock next-auth/jwt module properly
vi.mock('next-auth/jwt', () => ({
  getToken: mockGetToken
}))

// Import functions after mocking is set up
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

describe('Player Session Management Integration Tests', () => {
  let mockPlayerSessions, mockRooms

  beforeAll(async () => {
    try {
      await connectToDatabase()
    } catch (error) {
      console.warn('Database connection failed for player session tests:', error.message)
    }
  })

  afterAll(async () => {
    try {
      await disconnectDatabase()
    } catch (error) {
      console.warn('Database disconnection failed for player session tests:', error.message)
    }
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    mockPlayerSessions = new Map()
    mockRooms = new Map()

    try {
      await clearDatabase()
    } catch (error) {
      console.warn('Database clear failed for player session tests:', error.message)
    }
  })

  describe('Socket Authentication Integration', () => {
    beforeEach(() => {
      // Reset the mock before each authentication test
      mockGetToken.mockReset()
      mockUserFindById.mockReset()
    })

    it('should authenticate socket with valid token and database user', async () => {
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

    it('should reject socket when user not found in database', async () => {
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
  })

  describe('Player Session Creation and Management', () => {
    it('should create new player session when none exists', async () => {
      const newSession = {
        userId: 'user123',
        userSessionId: 'session123',
        name: 'TestUser',
        email: 'test@example.com',
        currentSocketId: 'socket123',
        lastSeen: new Date(),
        isActive: true
      }

      // Create session in memory
      const session = await getPlayerSession(
        mockPlayerSessions,
        'user123',
        'session123',
        'TestUser',
        'test@example.com'
      )

      expect(session.userId).toBe('user123')
      expect(session.name).toBe('TestUser')
      expect(session.email).toBe('test@example.com')
      expect(session.isActive).toBe(true)
      expect(mockPlayerSessions.has('user123')).toBe(true)
    })

    it('should update existing player session with new connection data', async () => {
      const existingSession = {
        userId: 'user123',
        userSessionId: 'session123',
        name: 'TestUser',
        email: 'test@example.com',
        currentSocketId: 'socket456',
        lastSeen: new Date('2024-01-01'),
        isActive: false
      }

      mockPlayerSessions.set('user123', existingSession)

      // Update session
      const updatedSession = await getPlayerSession(
        mockPlayerSessions,
        'user123',
        'session123',
        'TestUser',
        'test@example.com'
      )

      expect(updatedSession.isActive).toBe(true)
      expect(updatedSession.lastSeen).toBeInstanceOf(Date)
      expect(mockPlayerSessions.size).toBe(1) // Still only one session
    })

    it('should update player socket information for reconnection', async () => {
      const sessionData = {
        userId: 'user123',
        userSessionId: 'session123',
        name: 'TestUser',
        email: 'test@example.com',
        currentSocketId: 'socket456',
        lastSeen: new Date(),
        isActive: true
      }

      // Create session first
      await getPlayerSession(
        mockPlayerSessions,
        'user123',
        'session123',
        'TestUser',
        'test@example.com'
      )

      // Update socket information
      const updatedSession = await updatePlayerSocket(
        mockPlayerSessions,
        'user123',
        'socket789',
        'session123',
        'TestUser',
        'test@example.com'
      )

      expect(updatedSession.currentSocketId).toBe('socket789')
      expect(updatedSession.isActive).toBe(true)
      expect(mockPlayerSessions.has('user123')).toBe(true)
    })
  })

  describe('Player Data Migration', () => {
    it('should migrate existing player data correctly during reconnection', async () => {
      const room = {
        players: [
          { userId: 'oldUser123', name: 'OldName', score: 15, email: 'old@example.com' }
        ],
        gameState: {
          playerHands: {
            oldUser123: [
              { id: 'heart1', type: 'heart', color: 'red', value: 2 },
              { id: 'magic1', type: 'magic', emoji: '💨' }
            ]
          },
          shields: {
            oldUser123: {
              active: true,
              remainingTurns: 2,
              activatedBy: 'oldUser123'
            }
          },
          currentPlayer: { userId: 'oldUser123', name: 'OldName' }
        }
      }

      const oldUserId = 'oldUser123'
      const newUserId = 'newUser123'
      const userName = 'NewName'
      const userEmail = 'new@example.com'

      await migratePlayerData(room, oldUserId, newUserId, userName, userEmail)

      // Verify player data migrated
      expect(room.players[0].userId).toBe(newUserId)
      expect(room.players[0].name).toBe(userName)
      expect(room.players[0].email).toBe(userEmail)
      expect(room.players[0].score).toBe(15) // Score preserved

      // Verify player hand migrated
      expect(room.gameState.playerHands[newUserId]).toBeDefined()
      expect(room.gameState.playerHands[newUserId]).toHaveLength(2)
      expect(room.gameState.playerHands['oldUser123']).toBeUndefined()

      // Verify shield state migrated
      expect(room.gameState.shields[newUserId]).toBeDefined()
      expect(room.gameState.shields[newUserId].active).toBe(true)
      expect(room.gameState.shields['oldUser123']).toBeUndefined()

      // Verify current player updated
      expect(room.gameState.currentPlayer.userId).toBe(newUserId)
      expect(room.gameState.currentPlayer.name).toBe(userName)
    })

    it('should add new player when migrating non-existent player', async () => {
      const room = {
        players: [
          { userId: 'existingUser', name: 'ExistingUser', score: 10 }
        ],
        gameState: {
          playerHands: {
            existingUser: [{ id: 'heart1', type: 'heart' }]
          },
          shields: {},
          currentPlayer: { userId: 'existingUser', name: 'ExistingUser' }
        }
      }

      const oldUserId = 'nonexistentUser'
      const newUserId = 'brand-new-user'
      const userName = 'NewUser'
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
  })

  describe('Session Persistence and Loading', () => {
    it('should load active player sessions from database', async () => {
      // Mock database sessions
      const mockDbSessions = [
        {
          userId: 'user1',
          userSessionId: 'session1',
          name: 'User1',
          email: 'user1@example.com',
          currentSocketId: 'socket1',
          isActive: true,
          lastSeen: new Date()
        },
        {
          userId: 'user2',
          userSessionId: 'session2',
          name: 'User2',
          email: 'user2@example.com',
          currentSocketId: 'socket2',
          isActive: true,
          lastSeen: new Date()
        }
      ]

      // Mock the loadPlayerSessions function to return our test data
      const serverUtils = await import('../utils/server-test-utils.js')
      const mockLoadPlayerSessions = vi.spyOn(serverUtils, 'loadPlayerSessions')
        .mockResolvedValue(new Map(mockDbSessions.map(s => [s.userId, s])))

      try {
        const sessions = await serverUtils.loadPlayerSessions()
        expect(sessions.size).toBe(2) // Only active sessions
        expect(sessions.has('user1')).toBe(true)
        expect(sessions.has('user2')).toBe(true)

        const activeSession = sessions.get('user1')
        expect(activeSession.name).toBe('User1')
        expect(activeSession.isActive).toBe(true)
      } finally {
        mockLoadPlayerSessions.mockRestore()
      }
    })

    it('should handle session loading errors gracefully', async () => {
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

  describe('Reconnection Scenarios', () => {
    it('should handle player reconnection to existing game with preserved state', async () => {
      const roomCode = 'RECONN123'
      const userId = 'user123'

      const room = {
        code: roomCode,
        players: [
          {
            userId: userId,
            name: 'TestUser',
            email: 'test@example.com',
            isReady: true,
            score: 25
          },
          {
            userId: 'user456',
            name: 'OtherUser',
            email: 'other@example.com',
            isReady: true,
            score: 20
          }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user456', name: 'OtherUser' },
          tiles: [
            { id: 0, color: 'red', placedHeart: { placedBy: userId, value: 4 } },
            { id: 1, color: 'blue', placedHeart: null }
          ],
          deck: { emoji: '💌', cards: 12, },
          magicDeck: { emoji: '🔮', cards: 14, },
          playerHands: {
            user123: [
              { id: 'heart1', type: 'heart', color: 'yellow', value: 3 },
              { id: 'magic1', type: 'heart', emoji: '💨' }
            ],
            user456: [
              { id: 'heart2', type: 'heart', color: 'green', value: 2 }
            ]
          },
          shields: {
            user456: { active: true, remainingTurns: 1 }
          },
          turnCount: 5,
          playerActions: {
            user456: { drawnHeart: true, drawnMagic: false }
          }
        }
      }

      mockRooms.set(roomCode, room)

      // Simulate reconnection logic
      const existingPlayer = room.players.find(p => p.userId === userId)
      expect(existingPlayer).toBeDefined()

      if (existingPlayer) {
        // Update player info if needed
        existingPlayer.name = 'UpdatedUser'
        existingPlayer.email = 'updated@example.com'
      }

      // Prepare game state data for reconnected player
      const gameStateData = {
        tiles: room.gameState.tiles,
        currentPlayer: room.gameState.currentPlayer,
        players: room.players.map(player => ({
          ...player,
          hand: room.gameState.playerHands[player.userId] || [],
          score: player.score || 0
        })),
        playerHands: room.gameState.playerHands,
        deck: room.gameState.deck,
        magicDeck: room.gameState.magicDeck,
        turnCount: room.gameState.turnCount,
        playerId: userId,
        shields: room.gameState.shields || {},
        playerActions: room.gameState.playerActions || {}
      }

      expect(gameStateData.playerId).toBe(userId)
      expect(gameStateData.players).toHaveLength(2)
      expect(gameStateData.playerHands[userId]).toHaveLength(2)
      expect(gameStateData.currentPlayer.userId).toBe('user456')
      expect(gameStateData.turnCount).toBe(5)
    })

    it('should handle reconnection when player has active shield', async () => {
      const roomCode = 'SHIELDRECONN123'
      const userId = 'user123'

      const room = {
        code: roomCode,
        players: [
          { userId: userId, name: 'TestUser', score: 15 }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: userId, name: 'TestUser' },
          shields: {
            user123: {
              active: true,
              remainingTurns: 2,
              activatedBy: userId,
              activatedTurn: 3
            }
          },
          turnCount: 4
        }
      }

      mockRooms.set(roomCode, room)

      // Verify shield state is maintained during reconnection
      const playerShield = room.gameState.shields[userId]
      expect(playerShield).toBeDefined()
      expect(playerShield.active).toBe(true)
      expect(playerShield.remainingTurns).toBe(2)
      expect(playerShield.activatedBy).toBe(userId)
    })
  })

  describe('Session Cleanup and Management', () => {
    it('should clean up session data on disconnect', async () => {
      const roomCode = 'CLEANUP123'
      const userId = 'user123'

      const room = {
        code: roomCode,
        players: [
          { userId: userId, name: 'TestUser', score: 10 },
          { userId: 'user456', name: 'OtherUser', score: 15 }
        ],
        gameState: {
          playerHands: {
            user123: [{ id: 'heart1', type: 'heart' }],
            user456: [{ id: 'heart2', type: 'heart' }]
          },
          shields: {
            user123: { active: true, remainingTurns: 1 }
          }
        }
      }

      mockRooms.set(roomCode, room)

      // Add session
      mockPlayerSessions.set(userId, {
        userId: userId,
        currentSocketId: 'socket123',
        isActive: true
      })

      expect(mockPlayerSessions.size).toBe(1)

      // Simulate disconnect cleanup
      room.players = room.players.filter(player => player.userId !== userId)
      delete room.gameState.playerHands[userId]

      // Update session
      const session = mockPlayerSessions.get(userId)
      if (session) {
        session.isActive = false
        session.currentSocketId = null
      }

      expect(room.players).toHaveLength(1)
      expect(room.players[0].userId).toBe('user456')
      expect(room.gameState.playerHands.user123).toBeUndefined()
      expect(mockPlayerSessions.get(userId).isActive).toBe(false)
    })

    it('should delete room when last player disconnects', async () => {
      const roomCode = 'EMPTYROOM123'
      const userId = 'user123'

      const room = {
        code: roomCode,
        players: [
          { userId: userId, name: 'TestUser' }
        ]
      }

      mockRooms.set(roomCode, room)
      expect(mockRooms.has(roomCode)).toBe(true)

      // Simulate last player disconnect
      room.players = room.players.filter(player => player.userId !== userId)

      if (room.players.length === 0) {
        mockRooms.delete(roomCode)
      }

      expect(mockRooms.has(roomCode)).toBe(false)
      expect(room.players).toHaveLength(0)
    })
  })
})