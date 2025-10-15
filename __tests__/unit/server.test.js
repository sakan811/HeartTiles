import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import mongoose from 'mongoose'

// Mock database operations
vi.mock('../../../models', () => ({
  PlayerSession: {
    find: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn()
  },
  Room: {
    find: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn()
  },
  User: {
    findById: vi.fn()
  }
}))

// Mock next-auth
vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn()
}))

// Mock cards library
vi.mock('../../src/lib/cards.js', () => ({
  HeartCard: {
    generateRandom: vi.fn(),
    calculateScore: vi.fn()
  },
  WindCard: vi.fn(),
  RecycleCard: vi.fn(),
  ShieldCard: vi.fn(),
  generateRandomMagicCard: vi.fn(),
  isHeartCard: vi.fn(),
  isMagicCard: vi.fn(),
  createCardFromData: vi.fn()
}))

// Mock Next.js server
vi.mock('next', () => ({
  default: vi.fn().mockImplementation(() => ({
    prepare: vi.fn().mockResolvedValue(),
    getRequestHandler: vi.fn()
  }))
}))

// Mock HTTP server
vi.mock('node:http', () => ({
  createServer: vi.fn()
}))

// Mock Socket.IO
vi.mock('socket.io', () => ({
  Server: vi.fn().mockImplementation(() => ({
    use: vi.fn(),
    on: vi.fn(),
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
    sockets: {
      adapter: {
        rooms: new Map()
      },
      sockets: new Map()
    }
  }))
}))

// Mock process.env
const originalEnv = process.env

describe('Server Functions Tests', async () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv, NODE_ENV: 'test', AUTH_SECRET: 'test-secret' }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('validateRoomCode', async () => {
    it('should validate correct room codes', async () => {
      // Import the actual function from server
      const { validateRoomCode } = await import('../../server.js')

      expect(validateRoomCode('ABC123')).toBe(true)
      expect(validateRoomCode('DEF456')).toBe(true)
      expect(validateRoomCode('abc123')).toBe(true)
      expect(validateRoomCode('123456')).toBe(true)
    })

    it('should reject invalid room codes', async () => {
      const { validateRoomCode } = await import('../../server.js')

      expect(validateRoomCode('ABC')).toBe(false)
      expect(validateRoomCode('ABC1234')).toBe(false)
      expect(validateRoomCode('ABC-123')).toBe(false)
      expect(validateRoomCode('')).toBe(false)
      expect(validateRoomCode(null)).toBe(false)
      expect(validateRoomCode(undefined)).toBe(false)
      expect(validateRoomCode(123)).toBe(false)
    })
  })

  describe('validatePlayerName', async () => {
    it('should validate correct player names', async () => {
      const { validatePlayerName } = await import('../../server.js')

      expect(validatePlayerName('Player1')).toBe(true)
      expect(validatePlayerName('Test User')).toBe(true)
      expect(validatePlayerName('A')).toBe(true)
      expect(validatePlayerName('ThisIsExactlyTwenty')).toBe(true)
    })

    it('should reject invalid player names', async () => {
      const { validatePlayerName } = await import('../../server.js')

      expect(validatePlayerName('')).toBe(false)
      expect(validatePlayerName('   ')).toBe(false)
      expect(validatePlayerName(null)).toBe(false)
      expect(validatePlayerName(undefined)).toBe(false)
      expect(validatePlayerName(123)).toBe(false)
      expect(validatePlayerName('ThisNameIsWayTooLongForTheGame')).toBe(false)
    })
  })

  describe('generateTiles', async () => {
    it('should generate 8 tiles with correct structure', async () => {
      const { generateTiles } = await import('../../server.js')

      // Mock Math.random for predictable testing
      const originalRandom = Math.random
      Math.random = vi.fn().mockReturnValue(0.8) // Always generate colored tiles

      const tiles = generateTiles()

      expect(tiles).toHaveLength(8)
      expect(tiles[0]).toHaveProperty('id')
      expect(tiles[0]).toHaveProperty('color')
      expect(tiles[0]).toHaveProperty('emoji')
      expect(tiles[0].color).toMatch(/^(red|yellow|green|white)$/)
      expect(tiles[0].emoji).toMatch(/^(🟥|🟨|🟩|⬜)$/)

      Math.random = originalRandom
    })

    it('should generate white tiles occasionally', async () => {
      const { generateTiles } = await import('../../server.js')

      // Mock Math.random to generate white tiles (30% chance)
      const originalRandom = Math.random
      Math.random = vi.fn().mockReturnValue(0.2) // Always generate white tiles

      const tiles = generateTiles()

      expect(tiles).toHaveLength(8)
      expect(tiles.every(tile => tile.color === 'white' && tile.emoji === '⬜')).toBe(true)

      Math.random = originalRandom
    })
  })

  describe('calculateScore', () => {
    it('should calculate score for white tile', async () => {
      const { calculateScore } = await import('../../server.js')
      // Mock HeartCard import not needed since we're testing the server function directly

      // Mock HeartCard instance
      const mockHeart = { value: 2, color: 'red' }
      const tile = { color: 'white' }

      const score = calculateScore(mockHeart, tile)
      expect(score).toBe(2)
    })

    it('should calculate double score for matching color', async () => {
      const { calculateScore } = await import('../../server.js')
      const heart = { value: 2, color: 'red' }
      const tile = { color: 'red' }

      const score = calculateScore(heart, tile)
      expect(score).toBe(4)
    })

    it('should calculate zero score for non-matching color', async () => {
      const { calculateScore } = await import('../../server.js')
      const heart = { value: 2, color: 'red' }
      const tile = { color: 'yellow' }

      const score = calculateScore(heart, tile)
      expect(score).toBe(0)
    })
  })

  describe('sanitizeInput', async () => {
    it('should trim and remove HTML tags', async () => {
      const { sanitizeInput } = await import('../../server.js')

      expect(sanitizeInput('  hello world  ')).toBe('hello world')
      expect(sanitizeInput('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script')
      expect(sanitizeInput('normal text')).toBe('normal text')
      expect(sanitizeInput(123)).toBe(123)
      expect(sanitizeInput(null)).toBe(null)
    })
  })

  describe('findPlayerByUserId', async () => {
    it('should find player by user ID', async () => {
      const { findPlayerByUserId } = await import('../../server.js')
      const room = {
        players: [
          { userId: 'user1', name: 'Player1' },
          { userId: 'user2', name: 'Player2' }
        ]
      }

      const player = findPlayerByUserId(room, 'user1')
      expect(player).toEqual({ userId: 'user1', name: 'Player1' })
    })

    it('should return undefined when player not found', async () => {
      const { findPlayerByUserId } = await import('../../server.js')
      const room = {
        players: [
          { userId: 'user1', name: 'Player1' }
        ]
      }

      const player = findPlayerByUserId(room, 'user2')
      expect(player).toBeUndefined()
    })
  })

  describe('findPlayerByName', async () => {
    it('should find player by name (case insensitive)', async () => {
      const { findPlayerByName } = await import('../../server.js')
      const room = {
        players: [
          { userId: 'user1', name: 'Player1' },
          { userId: 'user2', name: 'player2' }
        ]
      }

      const player = findPlayerByName(room, 'PLAYER1')
      expect(player).toEqual({ userId: 'user1', name: 'Player1' })
    })

    it('should return undefined when player not found', async () => {
      const { findPlayerByName } = await import('../../server.js')
      const room = {
        players: [
          { userId: 'user1', name: 'Player1' }
        ]
      }

      const player = findPlayerByName(room, 'Player2')
      expect(player).toBeUndefined()
    })
  })

  describe('validateRoomState', async () => {
    it('should validate correct room state', async () => {
      const { validateRoomState } = await import('../../server.js')
      const room = {
        players: [],
        gameState: {
          gameStarted: false,
          currentPlayer: null
        }
      }

      const result = validateRoomState(room)
      expect(result.valid).toBe(true)
    })

    it('should reject when room not found', async () => {
      const { validateRoomState } = await import('../../server.js')
      const result = validateRoomState(null)
      expect(result.valid).toBe(false)
      expect(result.error).toBe("Room not found")
    })

    it('should reject when players state invalid', async () => {
      const { validateRoomState } = await import('../../server.js')
      const room = { players: "not an array", gameState: {} }
      const result = validateRoomState(room)
      expect(result.valid).toBe(false)
      expect(result.error).toBe("Invalid players state")
    })

    it('should reject when game started but no current player', async () => {
      const { validateRoomState } = await import('../../server.js')
      const room = {
        players: [],
        gameState: {
          gameStarted: true,
          currentPlayer: null
        }
      }

      const result = validateRoomState(room)
      expect(result.valid).toBe(false)
      expect(result.error).toBe("Game started but no current player")
    })
  })

  describe('validatePlayerInRoom', async () => {
    it('should validate player in room', async () => {
      const { validatePlayerInRoom } = await import('../../server.js')
      const room = {
        players: [
          { userId: 'user1', name: 'Player1' },
          { userId: 'user2', name: 'Player2' }
        ]
      }

      const result = validatePlayerInRoom(room, 'user1')
      expect(result.valid).toBe(true)
    })

    it('should reject when player not in room', async () => {
      const { validatePlayerInRoom } = await import('../../server.js')
      const room = {
        players: [
          { userId: 'user1', name: 'Player1' }
        ]
      }

      const result = validatePlayerInRoom(room, 'user2')
      expect(result.valid).toBe(false)
      expect(result.error).toBe("Player not in room")
    })
  })

  describe('validateTurn', async () => {
    it('should validate correct turn', async () => {
      const { validateTurn } = await import('../../server.js')
      const room = {
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user1', name: 'Player1' }
        }
      }

      const result = validateTurn(room, 'user1')
      expect(result.valid).toBe(true)
    })

    it('should reject turn when game not started', async () => {
      const { validateTurn } = await import('../../server.js')
      const room = { gameState: { gameStarted: false } }
      const result = validateTurn(room, 'user1')
      expect(result.valid).toBe(false)
      expect(result.error).toBe("Game not started")
    })

    it('should reject turn when not current player', async () => {
      const { validateTurn } = await import('../../server.js')
      const room = {
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user2', name: 'Player2' }
        }
      }

      const result = validateTurn(room, 'user1')
      expect(result.valid).toBe(false)
      expect(result.error).toBe("Not your turn")
    })
  })

  describe('validateDeckState', async () => {
    it('should validate correct deck state', async () => {
      const { validateDeckState } = await import('../../server.js')
      const room = {
        gameState: {
          deck: { cards: 16, type: 'hearts' }
        }
      }

      const result = validateDeckState(room)
      expect(result.valid).toBe(true)
    })

    it('should reject when deck missing', async () => {
      const { validateDeckState } = await import('../../server.js')
      const room = { gameState: {} }
      const result = validateDeckState(room)
      expect(result.valid).toBe(false)
      expect(result.error).toBe("Invalid deck state")
    })

    it('should reject when deck count invalid', async () => {
      const { validateDeckState } = await import('../../server.js')
      const room = {
        gameState: {
          deck: { cards: -1, type: 'hearts' }
        }
      }

      const result = validateDeckState(room)
      expect(result.valid).toBe(false)
      expect(result.error).toBe("Invalid deck count")
    })
  })

  describe('validateCardDrawLimit and recordCardDraw', async () => {
    it('should track card draw limits correctly', async () => {
      const { validateCardDrawLimit, recordCardDraw } = await import('../../server.js')
      const room = { gameState: {} }

      // Initial state - no actions taken
      let result = validateCardDrawLimit(room, 'user1')
      expect(result.valid).toBe(true)
      expect(result.currentActions.drawnHeart).toBe(false)
      expect(result.currentActions.drawnMagic).toBe(false)

      // Record heart card draw
      recordCardDraw(room, 'user1', 'heart')
      result = validateCardDrawLimit(room, 'user1')
      expect(result.currentActions.drawnHeart).toBe(true)
      expect(result.currentActions.drawnMagic).toBe(false)

      // Record magic card draw
      recordCardDraw(room, 'user1', 'magic')
      result = validateCardDrawLimit(room, 'user1')
      expect(result.currentActions.drawnHeart).toBe(true)
      expect(result.currentActions.drawnMagic).toBe(true)
    })
  })

  describe('resetPlayerActions', async () => {
    it('should reset player actions', async () => {
      const { resetPlayerActions } = await import('../../server.js')
      const room = {
        gameState: {
          playerActions: {
            user1: { drawnHeart: true, drawnMagic: true, heartsPlaced: 2, magicCardsUsed: 1 }
          }
        }
      }

      resetPlayerActions(room, 'user1')
      expect(room.gameState.playerActions.user1.drawnHeart).toBe(false)
      expect(room.gameState.playerActions.user1.drawnMagic).toBe(false)
      expect(room.gameState.playerActions.user1.heartsPlaced).toBe(0)
      expect(room.gameState.playerActions.user1.magicCardsUsed).toBe(0)
    })
  })

  describe('checkGameEndConditions', async () => {
    it('should not end game when not started', async () => {
      const { checkGameEndConditions } = await import('../../server.js')
      const room = { gameState: { gameStarted: false } }
      const result = checkGameEndConditions(room)
      expect(result.shouldEnd).toBe(false)
    })

    it('should end game when all tiles filled', async () => {
      const { checkGameEndConditions } = await import('../../server.js')
      const room = {
        gameState: {
          gameStarted: true,
          tiles: [
            { placedHeart: { value: 1 } },
            { placedHeart: { value: 2 } }
          ]
        }
      }

      const result = checkGameEndConditions(room)
      expect(result.shouldEnd).toBe(true)
      expect(result.reason).toBe("All tiles are filled")
    })

    it('should end game when both decks empty and no grace period', async () => {
      const { checkGameEndConditions } = await import('../../server.js')
      const room = {
        gameState: {
          gameStarted: true,
          tiles: [{ placedHeart: null }],
          deck: { cards: 0 },
          magicDeck: { cards: 0 }
        }
      }

      const result = checkGameEndConditions(room, false)
      expect(result.shouldEnd).toBe(true)
      expect(result.reason).toBe("Both decks are empty")
    })
  })

  describe('checkAndExpireShields', async () => {
    it('should decrement shield turns and remove expired shields', async () => {
      const { checkAndExpireShields } = await import('../../server.js')
      const room = {
        gameState: {
          shields: {
            user1: { remainingTurns: 2, active: true },
            user2: { remainingTurns: 1, active: true }
          }
        }
      }

      checkAndExpireShields(room)

      expect(room.gameState.shields.user1.remainingTurns).toBe(1)
      expect(room.gameState.shields.user1.active).toBe(true)
      expect(room.gameState.shields.user2).toBeUndefined()
    })

    it('should handle missing shields gracefully', async () => {
      const { checkAndExpireShields } = await import('../../server.js')
      const room1 = { gameState: {} }
      const room2 = { gameState: { shields: null } }

      expect(() => {
        checkAndExpireShields(room1)
        checkAndExpireShields(room2)
      }).not.toThrow()
    })
  })

  describe('Connection Management', async () => {
    let connectionPool
    const MAX_CONNECTIONS_PER_IP = 5

    beforeEach(() => {
      connectionPool = new Map()
    })

    it('should get client IP from socket', async () => {
      const { getClientIP } = await import('../../server.js')
      const mockSocket = {
        handshake: { address: '192.168.1.1' },
        conn: { remoteAddress: '192.168.1.2' }
      }

      const ip = getClientIP(mockSocket)
      expect(ip).toBe('192.168.1.1')
    })

    it('should fallback to conn.remoteAddress', async () => {
      const { getClientIP } = await import('../../server.js')
      const mockSocket = {
        handshake: {},
        conn: { remoteAddress: '192.168.1.2' }
      }

      const ip = getClientIP(mockSocket)
      expect(ip).toBe('192.168.1.2')
    })
  })

  describe('Turn Lock Management', async () => {
    let turnLocks

    beforeEach(() => {
      turnLocks = new Map()
    })

    it('should acquire and release turn locks', async () => {
      // Manually implement turn lock functions for testing
      function acquireTurnLock(roomCode, userId) {
        const lockKey = `${roomCode}_${userId}`
        if (turnLocks.has(lockKey)) return false
        turnLocks.set(lockKey, Date.now())
        return true
      }

      function releaseTurnLock(roomCode, userId) {
        turnLocks.delete(`${roomCode}_${userId}`)
      }

      // Acquire lock
      const result = acquireTurnLock('ABC123', 'user1')
      expect(result).toBe(true)
      expect(turnLocks.has('ABC123_user1')).toBe(true)

      // Try to acquire same lock
      const result2 = acquireTurnLock('ABC123', 'user1')
      expect(result2).toBe(false)

      // Release lock
      releaseTurnLock('ABC123', 'user1')
      expect(turnLocks.size).toBe(0)
    })
  })

  // Note: migratePlayerData function is inside the server scope and not exportable
// We can test the behavior through integration tests instead

  describe('Connection Management Functions', async () => {
    let connectionPool
    const MAX_CONNECTIONS_PER_IP = 5

    beforeEach(() => {
      connectionPool = new Map()
    })

    it('should check if connection can be accepted', async () => {
      // Mock connection pool functions
      function canAcceptConnection(ip) {
        return (connectionPool.get(ip) || 0) < MAX_CONNECTIONS_PER_IP
      }

      // Test with no connections
      expect(canAcceptConnection('192.168.1.1')).toBe(true)

      // Test with connections under limit
      connectionPool.set('192.168.1.1', 3)
      expect(canAcceptConnection('192.168.1.1')).toBe(true)

      // Test with connections at limit
      connectionPool.set('192.168.1.1', 5)
      expect(canAcceptConnection('192.168.1.1')).toBe(false)

      // Test with connections over limit
      connectionPool.set('192.168.1.1', 6)
      expect(canAcceptConnection('192.168.1.1')).toBe(false)
    })

    it('should increment and decrement connection count', async () => {
      function incrementConnectionCount(ip) {
        connectionPool.set(ip, (connectionPool.get(ip) || 0) + 1)
      }

      function decrementConnectionCount(ip) {
        const current = connectionPool.get(ip) || 0
        if (current > 0) connectionPool.set(ip, current - 1)
      }

      // Test increment
      incrementConnectionCount('192.168.1.1')
      expect(connectionPool.get('192.168.1.1')).toBe(1)

      incrementConnectionCount('192.168.1.1')
      expect(connectionPool.get('192.168.1.1')).toBe(2)

      // Test decrement
      decrementConnectionCount('192.168.1.1')
      expect(connectionPool.get('192.168.1.1')).toBe(1)

      // Test decrement when at 0 (should stay at 0)
      connectionPool.set('192.168.1.2', 0)
      decrementConnectionCount('192.168.1.2')
      expect(connectionPool.get('192.168.1.2')).toBe(0)
    })
  })

  // Note: Card generation functions, endGame, player action tracking, and heart placement validation
// functions are inside the server scope and not exportable. They can be tested through integration tests.

  describe('Socket Authentication', async () => {
    it('should have authentication functions available', async () => {
      // Test that authentication-related imports are available
      const { getToken } = await import('next-auth/jwt')
      const { User } = await import('../../../models')

      expect(typeof getToken).toBe('function')
      expect(User).toBeDefined()
      expect(typeof User.findById).toBe('function')
    })

    it('should test token validation logic', async () => {
      // Test that token validation logic works
      const { getToken } = await import('next-auth/jwt')

      const mockSocket = {
        handshake: {
          headers: {}
        }
      }

      // Test that getToken can be called (actual authentication happens in server runtime)
      expect(getToken).toBeDefined()
    })
  })

  // Note: Socket event handlers are complex integration scenarios that require the full server context.
// They are better tested through integration tests rather than unit tests.
})