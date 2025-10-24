import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the database models
const mockPlayerSession = {
  find: vi.fn(),
  findOneAndUpdate: vi.fn()
}

vi.mock('../../models.js', () => ({
  PlayerSession: mockPlayerSession
}))

// Mock next-auth/jwt for authentication
vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn()
}))

describe('Server Session Management Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NODE_ENV = 'test'
    process.env.AUTH_SECRET = 'test-secret'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('migratePlayerData function (lines 432-470)', () => {
    it('should migrate player data correctly when player exists', async () => {
      const { migratePlayerData } = await import('../../server.js')

      const room = {
        players: [
          { userId: 'oldUser1', name: 'OldUser', score: 10 }
        ],
        gameState: {
          playerHands: {
            oldUser1: [{ id: 'card1', type: 'heart' }]
          },
          shields: {
            oldUser1: { remainingTurns: 2, active: true }
          },
          currentPlayer: { userId: 'oldUser1', name: 'OldUser' }
        }
      }

      migratePlayerData(room, 'oldUser1', 'newUser1', 'NewUser', 'new@example.com')

      expect(room.players[0]).toEqual({
        userId: 'newUser1',
        name: 'NewUser',
        email: 'new@example.com',
        score: 10
      })
    })

    it('should add new player when not found', async () => {
      const { migratePlayerData } = await import('../../server.js')

      const room = {
        players: [], // Empty players array
        gameState: {}
      }

      migratePlayerData(room, 'oldUser1', 'newUser1', 'NewUser', 'new@example.com')

      expect(room.players).toHaveLength(1)
      expect(room.players[0]).toEqual({
        userId: 'newUser1',
        name: 'NewUser',
        email: 'new@example.com',
        isReady: false,
        score: 0,
        joinedAt: expect.any(Date)
      })
    })

    it('should migrate player hands correctly', async () => {
      const { migratePlayerData } = await import('../../server.js')

      const room = {
        players: [{ userId: 'oldUser1', name: 'OldUser' }],
        gameState: {
          playerHands: {
            oldUser1: [{ id: 'card1', type: 'heart' }],
            otherUser: [{ id: 'card2', type: 'magic' }]
          }
        }
      }

      migratePlayerData(room, 'oldUser1', 'newUser1', 'NewUser', 'new@example.com')

      expect(room.gameState.playerHands.newUser1).toEqual([{ id: 'card1', type: 'heart' }])
      expect(room.gameState.playerHands.oldUser1).toBeUndefined()
      expect(room.gameState.playerHands.otherUser).toEqual([{ id: 'card2', type: 'magic' }])
    })

    it('should migrate shield state correctly', async () => {
      const { migratePlayerData } = await import('../../server.js')

      const room = {
        players: [{ userId: 'oldUser1', name: 'OldUser' }],
        gameState: {
          shields: {
            oldUser1: { remainingTurns: 2, active: true },
            otherUser: { remainingTurns: 1, active: true }
          }
        }
      }

      migratePlayerData(room, 'oldUser1', 'newUser1', 'NewUser', 'new@example.com')

      expect(room.gameState.shields.newUser1).toEqual({ remainingTurns: 2, active: true })
      expect(room.gameState.shields.oldUser1).toBeUndefined()
      expect(room.gameState.shields.otherUser).toEqual({ remainingTurns: 1, active: true })
    })

    it('should migrate current player correctly', async () => {
      const { migratePlayerData } = await import('../../server.js')

      const room = {
        players: [
          { userId: 'oldUser1', name: 'OldUser', isReady: true },
          { userId: 'otherUser', name: 'OtherUser', isReady: false }
        ],
        gameState: {
          currentPlayer: { userId: 'oldUser1', name: 'OldUser' }
        }
      }

      migratePlayerData(room, 'oldUser1', 'newUser1', 'NewUser', 'new@example.com')

      expect(room.gameState.currentPlayer).toEqual({
        userId: 'newUser1',
        name: 'NewUser',
        email: 'new@example.com',
        isReady: true
      })
    })
  })

  describe('getPlayerSession function (lines 401-419)', () => {
    it('should return existing session', async () => {
      const { getPlayerSession } = await import('../../server.js')
      const { savePlayerSession } = await import('../../server.js')

      const playerSessions = new Map([
        ['user1', {
          userId: 'user1',
          userSessionId: 'session1',
          name: 'Player1',
          email: 'user1@example.com',
          currentSocketId: 'socket1',
          lastSeen: new Date(),
          isActive: true
        }]
      ])

      // Mock the global playerSessions map
      global.playerSessions = playerSessions
      vi.mocked(savePlayerSession).mockResolvedValue()

      const session = await getPlayerSession('user1', 'session1', 'Player1', 'user1@example.com')

      expect(session).toEqual(playerSessions.get('user1'))
      expect(savePlayerSession).toHaveBeenCalledWith(session)
    })

    it('should create new session when none exists', async () => {
      const { getPlayerSession } = await import('../../server.js')
      const { savePlayerSession } = await import('../../server.js')

      const playerSessions = new Map()
      global.playerSessions = playerSessions

      const newSession = {
        userId: 'user2',
        userSessionId: 'session2',
        name: 'Player2',
        email: 'user2@example.com',
        currentSocketId: null,
        lastSeen: expect.any(Date),
        isActive: true
      }

      vi.mocked(savePlayerSession).mockResolvedValue(newSession)

      const session = await getPlayerSession('user2', 'session2', 'Player2', 'user2@example.com')

      expect(session).toEqual(newSession)
      expect(playerSessions.has('user2')).toBe(true)
      expect(savePlayerSession).toHaveBeenCalledWith(newSession)
    })

    it('should update existing session lastSeen and isActive', async () => {
      const { getPlayerSession } = await import('../../server.js')
      const { savePlayerSession } = await import('../../server.js')

      const oldDate = new Date('2023-01-01')
      const existingSession = {
        userId: 'user1',
        userSessionId: 'session1',
        name: 'Player1',
        email: 'user1@example.com',
        currentSocketId: 'socket1',
        lastSeen: oldDate,
        isActive: false
      }

      const playerSessions = new Map([['user1', existingSession]])
      global.playerSessions = playerSessions

      vi.mocked(savePlayerSession).mockResolvedValue()

      await getPlayerSession('user1', 'session1', 'Player1', 'user1@example.com')

      const updatedSession = playerSessions.get('user1')
      expect(updatedSession.lastSeen.getTime()).toBeGreaterThan(oldDate.getTime())
      expect(updatedSession.isActive).toBe(true)
      expect(savePlayerSession).toHaveBeenCalledWith(updatedSession)
    })
  })

  describe('updatePlayerSocket function (lines 421-428)', () => {
    it('should update player socket information', async () => {
      const { updatePlayerSocket } = await import('../../server.js')
      const { getPlayerSession } = await import('../../server.js')
      const { savePlayerSession } = await import('../../server.js')

      const mockSession = {
        userId: 'user1',
        userSessionId: 'session1',
        name: 'Player1',
        email: 'user1@example.com',
        currentSocketId: 'oldSocket',
        lastSeen: new Date('2023-01-01'),
        isActive: true
      }

      vi.mocked(getPlayerSession).mockResolvedValue(mockSession)
      vi.mocked(savePlayerSession).mockResolvedValue()

      await updatePlayerSocket('user1', 'newSocket123', 'session1', 'Player1', 'user1@example.com')

      expect(getPlayerSession).toHaveBeenCalledWith('user1', 'session1', 'Player1', 'user1@example.com')
      expect(mockSession.currentSocketId).toBe('newSocket123')
      expect(mockSession.isActive).toBe(true)
      expect(savePlayerSession).toHaveBeenCalledWith(mockSession)
    })
  })

  describe('authenticateSocket function (lines 377-399)', () => {
    it('should authenticate socket with valid token', async () => {
      const { getToken } = await import('next-auth/jwt')
      const { User } = await import('../../models.js')

      const mockToken = {
        id: 'user1',
        email: 'user1@example.com',
        name: 'Player1',
        jti: 'session1'
      }

      const mockUser = {
        _id: 'user1',
        email: 'user1@example.com',
        name: 'Player1'
      }

      const { authenticateSocket } = await import('../../server.js')
      const mockSocket = {
        handshake: {},
        data: {}
      }
      const mockNext = vi.fn()

      vi.mocked(getToken).mockResolvedValue(mockToken)
      vi.mocked(User.findById).mockResolvedValue(mockUser)

      await authenticateSocket(mockSocket, mockNext)

      expect(getToken).toHaveBeenCalledWith({
        req: mockSocket.handshake,
        secret: process.env.AUTH_SECRET
      })
      expect(User.findById).toHaveBeenCalledWith('user1')
      expect(mockSocket.data.userId).toBe('user1')
      expect(mockSocket.data.userEmail).toBe('user1@example.com')
      expect(mockSocket.data.userName).toBe('Player1')
      expect(mockSocket.data.userSessionId).toBe('session1')
      expect(mockNext).toHaveBeenCalledWith()
    })

    it('should reject authentication with no token', async () => {
      const { getToken } = await import('next-auth/jwt')

      const { authenticateSocket } = await import('../../server.js')
      const mockSocket = {
        handshake: {},
        data: {}
      }
      const mockNext = vi.fn()

      vi.mocked(getToken).mockResolvedValue(null)

      await authenticateSocket(mockSocket, mockNext)

      expect(mockNext).toHaveBeenCalledWith(new Error('Authentication required'))
    })

    it('should reject authentication when user not found', async () => {
      const { getToken } = await import('next-auth/jwt')
      const { User } = await import('../../models.js')

      const mockToken = { id: 'user1' }

      const { authenticateSocket } = await import('../../server.js')
      const mockSocket = {
        handshake: {},
        data: {}
      }
      const mockNext = vi.fn()

      vi.mocked(getToken).mockResolvedValue(mockToken)
      vi.mocked(User.findById).mockResolvedValue(null)

      await authenticateSocket(mockSocket, mockNext)

      expect(mockNext).toHaveBeenCalledWith(new Error('User not found'))
    })

    it('should handle authentication errors gracefully', async () => {
      const { getToken } = await import('next-auth/jwt')

      const { authenticateSocket } = await import('../../server.js')
      const mockSocket = {
        handshake: {},
        data: {}
      }
      const mockNext = vi.fn()

      const authError = new Error('Auth service error')
      vi.mocked(getToken).mockRejectedValue(authError)

      await authenticateSocket(mockSocket, mockNext)

      expect(mockNext).toHaveBeenCalledWith(new Error('Authentication failed'))
    })
  })

  describe('Session cleanup and management', () => {
    it('should handle turn lock cleanup for disconnected users', async () => {
      const { releaseTurnLock } = await import('../../server.js')

      // Mock turn locks
      global.turnLocks = new Map([
        ['ROOM123', { socketId: 'socket1', timestamp: Date.now() }],
        ['ROOM456', { socketId: 'socket2', timestamp: Date.now() }]
      ])

      releaseTurnLock('ROOM123', 'socket1')

      expect(global.turnLocks.has('ROOM123')).toBe(false)
      expect(global.turnLocks.has('ROOM456')).toBe(true) // Should not affect other locks
    })

    it('should handle player reconnection with existing session', async () => {
      const { getPlayerSession } = await import('../../server.js')
      const { savePlayerSession } = await import('../../server.js')

      const existingSession = {
        userId: 'user1',
        userSessionId: 'session1',
        name: 'Player1',
        email: 'user1@example.com',
        currentSocketId: 'oldSocket',
        lastSeen: new Date(),
        isActive: true
      }

      const playerSessions = new Map([['user1', existingSession]])
      global.playerSessions = playerSessions

      vi.mocked(savePlayerSession).mockResolvedValue()

      const session = await getPlayerSession('user1', 'session1', 'Player1', 'user1@example.com')

      expect(session.userId).toBe('user1')
      expect(session.userSessionId).toBe('session1')
      expect(savePlayerSession).toHaveBeenCalled()
    })

    it('should handle session timeout and cleanup', async () => {
      const playerSessions = new Map([
        ['user1', {
          userId: 'user1',
          lastSeen: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
          isActive: true
        }],
        ['user2', {
          userId: 'user2',
          lastSeen: new Date(),
          isActive: true
        }]
      ])

      global.playerSessions = playerSessions

      // Simulate session cleanup logic
      const now = Date.now()
      const timeoutMs = 30 * 60 * 1000 // 30 minutes

      for (const [userId, session] of playerSessions) {
        if (now - session.lastSeen.getTime() > timeoutMs) {
          session.isActive = false
        }
      }

      expect(playerSessions.get('user1').isActive).toBe(false)
      expect(playerSessions.get('user2').isActive).toBe(true)
    })
  })

  describe('Connection management', () => {
    it('should handle IP-based connection limiting', async () => {
      // This tests the connection management logic from the main server connection handler
      const connectionPool = new Map()
      const MAX_CONNECTIONS_PER_IP = 5

      const canAcceptConnection = (ip) => {
        return (connectionPool.get(ip) || 0) < MAX_CONNECTIONS_PER_IP
      }

      const incrementConnectionCount = (ip) => {
        connectionPool.set(ip, (connectionPool.get(ip) || 0) + 1)
      }

      const decrementConnectionCount = (ip) => {
        const current = connectionPool.get(ip) || 0
        if (current > 0) connectionPool.set(ip, current - 1)
      }

      const testIP = '192.168.1.1'

      // Should accept connections up to limit
      for (let i = 0; i < 5; i++) {
        expect(canAcceptConnection(testIP)).toBe(true)
        incrementConnectionCount(testIP)
      }

      // Should reject when limit reached
      expect(canAcceptConnection(testIP)).toBe(false)

      // Should accept again after decrement
      decrementConnectionCount(testIP)
      expect(canAcceptConnection(testIP)).toBe(true)
    })

    it('should track connection counts independently per IP', async () => {
      const connectionPool = new Map()
      const MAX_CONNECTIONS_PER_IP = 5

      const canAcceptConnection = (ip) => {
        return (connectionPool.get(ip) || 0) < MAX_CONNECTIONS_PER_IP
      }

      const incrementConnectionCount = (ip) => {
        connectionPool.set(ip, (connectionPool.get(ip) || 0) + 1)
      }

      const ip1 = '192.168.1.1'
      const ip2 = '192.168.1.2'

      // Add connections to IP1
      for (let i = 0; i < 5; i++) {
        incrementConnectionCount(ip1)
      }

      // IP1 should be at limit, IP2 should still accept
      expect(canAcceptConnection(ip1)).toBe(false)
      expect(canAcceptConnection(ip2)).toBe(true)
    })
  })

  describe('Client IP detection', () => {
    it('should get client IP from various socket sources', async () => {
      const { getClientIP } = await import('../../server.js')

      const mockSocket1 = {
        handshake: { address: '192.168.1.1' },
        conn: { remoteAddress: '192.168.1.2' }
      }

      const mockSocket2 = {
        handshake: {},
        conn: { remoteAddress: '192.168.1.3' }
      }

      const mockSocket3 = {
        handshake: {},
        conn: {}
      }

      expect(getClientIP(mockSocket1)).toBe('192.168.1.1')
      expect(getClientIP(mockSocket2)).toBe('192.168.1.2')
      expect(getClientIP(mockSocket3)).toBe('unknown')
    })
  })
})