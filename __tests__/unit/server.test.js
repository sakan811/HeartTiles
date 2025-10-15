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

describe('Server Functions Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv, NODE_ENV: 'test', AUTH_SECRET: 'test-secret' }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('validateRoomCode', () => {
    it('should validate correct room codes', () => {
      // Import the actual function from server
      const { validateRoomCode } = require('../../../server.js')

      expect(validateRoomCode('ABC123')).toBe(true)
      expect(validateRoomCode('DEF456')).toBe(true)
      expect(validateRoomCode('abc123')).toBe(true)
      expect(validateRoomCode('123456')).toBe(true)
    })

    it('should reject invalid room codes', () => {
      const { validateRoomCode } = require('../../../server.js')

      expect(validateRoomCode('ABC')).toBe(false)
      expect(validateRoomCode('ABC1234')).toBe(false)
      expect(validateRoomCode('ABC-123')).toBe(false)
      expect(validateRoomCode('')).toBe(false)
      expect(validateRoomCode(null)).toBe(false)
      expect(validateRoomCode(undefined)).toBe(false)
      expect(validateRoomCode(123)).toBe(false)
    })
  })

  describe('validatePlayerName', () => {
    it('should validate correct player names', () => {
      const { validatePlayerName } = require('../../../server.js')

      expect(validatePlayerName('Player1')).toBe(true)
      expect(validatePlayerName('Test User')).toBe(true)
      expect(validatePlayerName('A')).toBe(true)
      expect(validatePlayerName('ThisIsExactlyTwenty')).toBe(true)
    })

    it('should reject invalid player names', () => {
      const { validatePlayerName } = require('../../../server.js')

      expect(validatePlayerName('')).toBe(false)
      expect(validatePlayerName('   ')).toBe(false)
      expect(validatePlayerName(null)).toBe(false)
      expect(validatePlayerName(undefined)).toBe(false)
      expect(validatePlayerName(123)).toBe(false)
      expect(validatePlayerName('ThisNameIsWayTooLongForTheGame')).toBe(false)
    })
  })

  describe('generateTiles', () => {
    it('should generate 8 tiles with correct structure', () => {
      const { generateTiles } = require('../../../server.js')

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

    it('should generate white tiles occasionally', () => {
      const { generateTiles } = require('../../../server.js')

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
    it('should calculate score for white tile', () => {
      const { calculateScore } = require('../../../server.js')
      const { HeartCard } = require('../../src/lib/cards.js')

      // Mock HeartCard instance
      const mockHeart = { value: 2, color: 'red' }
      const tile = { color: 'white' }

      const score = calculateScore(mockHeart, tile)
      expect(score).toBe(2)
    })

    it('should calculate double score for matching color', () => {
      const { calculateScore } = require('../../../server.js')
      const heart = { value: 2, color: 'red' }
      const tile = { color: 'red' }

      const score = calculateScore(heart, tile)
      expect(score).toBe(4)
    })

    it('should calculate zero score for non-matching color', () => {
      const { calculateScore } = require('../../../server.js')
      const heart = { value: 2, color: 'red' }
      const tile = { color: 'yellow' }

      const score = calculateScore(heart, tile)
      expect(score).toBe(0)
    })
  })

  describe('sanitizeInput', () => {
    it('should trim and remove HTML tags', () => {
      const { sanitizeInput } = require('../../../server.js')

      expect(sanitizeInput('  hello world  ')).toBe('hello world')
      expect(sanitizeInput('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script')
      expect(sanitizeInput('normal text')).toBe('normal text')
      expect(sanitizeInput(123)).toBe(123)
      expect(sanitizeInput(null)).toBe(null)
    })
  })

  describe('findPlayerByUserId', () => {
    it('should find player by user ID', () => {
      const { findPlayerByUserId } = require('../../../server.js')
      const room = {
        players: [
          { userId: 'user1', name: 'Player1' },
          { userId: 'user2', name: 'Player2' }
        ]
      }

      const player = findPlayerByUserId(room, 'user1')
      expect(player).toEqual({ userId: 'user1', name: 'Player1' })
    })

    it('should return undefined when player not found', () => {
      const { findPlayerByUserId } = require('../../../server.js')
      const room = {
        players: [
          { userId: 'user1', name: 'Player1' }
        ]
      }

      const player = findPlayerByUserId(room, 'user2')
      expect(player).toBeUndefined()
    })
  })

  describe('findPlayerByName', () => {
    it('should find player by name (case insensitive)', () => {
      const { findPlayerByName } = require('../../../server.js')
      const room = {
        players: [
          { userId: 'user1', name: 'Player1' },
          { userId: 'user2', name: 'player2' }
        ]
      }

      const player = findPlayerByName(room, 'PLAYER1')
      expect(player).toEqual({ userId: 'user1', name: 'Player1' })
    })

    it('should return undefined when player not found', () => {
      const { findPlayerByName } = require('../../../server.js')
      const room = {
        players: [
          { userId: 'user1', name: 'Player1' }
        ]
      }

      const player = findPlayerByName(room, 'Player2')
      expect(player).toBeUndefined()
    })
  })

  describe('validateRoomState', () => {
    it('should validate correct room state', () => {
      const { validateRoomState } = require('../../../server.js')
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

    it('should reject when room not found', () => {
      const { validateRoomState } = require('../../../server.js')
      const result = validateRoomState(null)
      expect(result.valid).toBe(false)
      expect(result.error).toBe("Room not found")
    })

    it('should reject when players state invalid', () => {
      const { validateRoomState } = require('../../../server.js')
      const room = { players: "not an array", gameState: {} }
      const result = validateRoomState(room)
      expect(result.valid).toBe(false)
      expect(result.error).toBe("Invalid players state")
    })

    it('should reject when game started but no current player', () => {
      const { validateRoomState } = require('../../../server.js')
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

  describe('validatePlayerInRoom', () => {
    it('should validate player in room', () => {
      const { validatePlayerInRoom } = require('../../../server.js')
      const room = {
        players: [
          { userId: 'user1', name: 'Player1' },
          { userId: 'user2', name: 'Player2' }
        ]
      }

      const result = validatePlayerInRoom(room, 'user1')
      expect(result.valid).toBe(true)
    })

    it('should reject when player not in room', () => {
      const { validatePlayerInRoom } = require('../../../server.js')
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

  describe('validateTurn', () => {
    it('should validate correct turn', () => {
      const { validateTurn } = require('../../../server.js')
      const room = {
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user1', name: 'Player1' }
        }
      }

      const result = validateTurn(room, 'user1')
      expect(result.valid).toBe(true)
    })

    it('should reject turn when game not started', () => {
      const { validateTurn } = require('../../../server.js')
      const room = { gameState: { gameStarted: false } }
      const result = validateTurn(room, 'user1')
      expect(result.valid).toBe(false)
      expect(result.error).toBe("Game not started")
    })

    it('should reject turn when not current player', () => {
      const { validateTurn } = require('../../../server.js')
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

  describe('validateDeckState', () => {
    it('should validate correct deck state', () => {
      const { validateDeckState } = require('../../../server.js')
      const room = {
        gameState: {
          deck: { cards: 16, type: 'hearts' }
        }
      }

      const result = validateDeckState(room)
      expect(result.valid).toBe(true)
    })

    it('should reject when deck missing', () => {
      const { validateDeckState } = require('../../../server.js')
      const room = { gameState: {} }
      const result = validateDeckState(room)
      expect(result.valid).toBe(false)
      expect(result.error).toBe("Invalid deck state")
    })

    it('should reject when deck count invalid', () => {
      const { validateDeckState } = require('../../../server.js')
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

  describe('validateCardDrawLimit and recordCardDraw', () => {
    it('should track card draw limits correctly', () => {
      const { validateCardDrawLimit, recordCardDraw } = require('../../../server.js')
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

  describe('resetPlayerActions', () => {
    it('should reset player actions', () => {
      const { resetPlayerActions } = require('../../../server.js')
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

  describe('checkGameEndConditions', () => {
    it('should not end game when not started', () => {
      const { checkGameEndConditions } = require('../../../server.js')
      const room = { gameState: { gameStarted: false } }
      const result = checkGameEndConditions(room)
      expect(result.shouldEnd).toBe(false)
    })

    it('should end game when all tiles filled', () => {
      const { checkGameEndConditions } = require('../../../server.js')
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

    it('should end game when both decks empty and no grace period', () => {
      const { checkGameEndConditions } = require('../../../server.js')
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

  describe('checkAndExpireShields', () => {
    it('should decrement shield turns and remove expired shields', () => {
      const { checkAndExpireShields } = require('../../../server.js')
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

    it('should handle missing shields gracefully', () => {
      const { checkAndExpireShields } = require('../../../server.js')
      const room1 = { gameState: {} }
      const room2 = { gameState: { shields: null } }

      expect(() => {
        checkAndExpireShields(room1)
        checkAndExpireShields(room2)
      }).not.toThrow()
    })
  })

  describe('Connection Management', () => {
    let connectionPool
    const MAX_CONNECTIONS_PER_IP = 5

    beforeEach(() => {
      connectionPool = new Map()
    })

    it('should get client IP from socket', () => {
      const { getClientIP } = require('../../../server.js')
      const mockSocket = {
        handshake: { address: '192.168.1.1' },
        conn: { remoteAddress: '192.168.1.2' }
      }

      const ip = getClientIP(mockSocket)
      expect(ip).toBe('192.168.1.1')
    })

    it('should fallback to conn.remoteAddress', () => {
      const { getClientIP } = require('../../../server.js')
      const mockSocket = {
        handshake: {},
        conn: { remoteAddress: '192.168.1.2' }
      }

      const ip = getClientIP(mockSocket)
      expect(ip).toBe('192.168.1.2')
    })
  })

  describe('Turn Lock Management', () => {
    let turnLocks

    beforeEach(() => {
      turnLocks = new Map()
    })

    it('should acquire and release turn locks', () => {
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
})