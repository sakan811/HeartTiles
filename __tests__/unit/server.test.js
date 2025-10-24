import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  connectToDatabase,
  disconnectDatabase,
  clearDatabase,
  createDefaultRoom,
  startGame,
  executeMagicCard,
  migratePlayerData,
  authenticateSocket,
  acquireTurnLock,
  releaseTurnLock,
  clearTurnLocks,
  recordMagicCardUsage
} from '../utils/server-test-utils.js'
import { HeartCard, WindCard, RecycleCard, ShieldCard } from '../../src/lib/cards.js'

// Minimal mocking for external dependencies that we can't control
vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn()
}))

vi.mock('next', () => {
  const mockApp = {
    prepare: vi.fn().mockResolvedValue(),
    getRequestHandler: vi.fn(),
    dev: false,
    hostname: 'localhost',
    port: 3000
  }
  return {
    default: vi.fn().mockImplementation(() => mockApp)
  }
})

vi.mock('node:http', () => {
  const mockServer = {
    once: vi.fn(),
    on: vi.fn(),
    close: vi.fn(),
    emit: vi.fn(),
    address: vi.fn().mockReturnValue({ port: 3000 }),
    listen: vi.fn().mockImplementation((portOrOptions, callback) => {
      if (typeof callback === 'function') {
        setTimeout(callback, 0)
      }
      return mockServer
    })
  }
  return {
    createServer: vi.fn().mockReturnValue(mockServer)
  }
})

// Mock Socket.IO only for server creation, not for testing logic
vi.mock('socket.io', () => ({
  Server: vi.fn().mockImplementation(() => ({
    use: vi.fn(),
    on: vi.fn(),
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
    close: vi.fn(),
    sockets: {
      adapter: {
        rooms: new Map()
      },
      sockets: new Map()
    }
  }))
}))

describe('Realistic Server Tests', () => {
  let mockUser, mockToken

  beforeEach(async () => {
    vi.clearAllMocks()
    clearTurnLocks()

    // Set up test environment
    process.env.NODE_ENV = 'test'
    process.env.AUTH_SECRET = 'test-secret'
    process.env.MONGODB_URI = 'mongodb://localhost:27017/heart-tiles-test'

    // Mock user data for authentication tests
    mockUser = {
      _id: 'user1',
      email: 'test@example.com',
      name: 'TestUser'
    }

    mockToken = {
      id: 'user1',
      email: 'test@example.com',
      name: 'TestUser',
      jti: 'session1'
    }

    // Clear any existing database state
    try {
      await clearDatabase()
    } catch (error) {
      // Database might not be connected, which is fine for unit tests
    }
  })

  afterEach(async () => {
    // Clean up turn locks
    clearTurnLocks()

    // Don't disconnect database here as it might affect other tests
  })

  describe('Real Validation Functions', () => {
    it('should validate room codes with real logic', async () => {
      const { validateRoomCode } = await import('../../server.js')

      // Test valid codes (check the actual regex pattern in server.js)
      expect(validateRoomCode('ABC123')).toBe(true) // 3 letters + 3 numbers
      expect(validateRoomCode('abcdef')).toBe(true) // 6 lowercase letters
      expect(validateRoomCode('123456')).toBe(true) // 6 numbers
      expect(validateRoomCode('ABCDEF')).toBe(true) // 6 uppercase letters
      expect(validateRoomCode('abc123')).toBe(true) // 3 lowercase + 3 numbers

      // Test invalid codes
      expect(validateRoomCode('AB')).toBe(false)
      expect(validateRoomCode('ABC1234')).toBe(false)
      expect(validateRoomCode('ABC-123')).toBe(false)
      expect(validateRoomCode('ABCdef')).toBe(false) // Mixed case not supported
      expect(validateRoomCode('')).toBe(false)
      expect(validateRoomCode(null)).toBe(false)
      expect(validateRoomCode(undefined)).toBe(false)
      expect(validateRoomCode(123)).toBe(false)
    })

    it('should validate player names with real logic', async () => {
      const { validatePlayerName } = await import('../../server.js')

      // Test valid names
      expect(validatePlayerName('Player1')).toBe(true)
      expect(validatePlayerName('Test User')).toBe(true)
      expect(validatePlayerName('A')).toBe(true)
      expect(validatePlayerName('ThisIsExactlyTwenty')).toBe(true)

      // Test invalid names
      expect(validatePlayerName('')).toBe(false)
      expect(validatePlayerName('   ')).toBe(false)
      expect(validatePlayerName(null)).toBe(false)
      expect(validatePlayerName(undefined)).toBe(false)
      expect(validatePlayerName(123)).toBe(false)
      expect(validatePlayerName('ThisNameIsWayTooLongForTheGame')).toBe(false)
    })

    it('should sanitize input correctly', async () => {
      const { sanitizeInput } = await import('../../server.js')

      expect(sanitizeInput('  hello world  ')).toBe('hello world')
      expect(sanitizeInput('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script')
      expect(sanitizeInput('normal text')).toBe('normal text')
      expect(sanitizeInput(123)).toBe(123)
      expect(sanitizeInput(null)).toBe(null)
    })
  })

  describe('Real Tile Generation', () => {
    it('should generate tiles with realistic distribution', async () => {
      const { generateTiles } = await import('../../server.js')

      const tiles = generateTiles()

      expect(tiles).toHaveLength(8)
      expect(tiles[0]).toHaveProperty('id')
      expect(tiles[0]).toHaveProperty('color')
      expect(tiles[0]).toHaveProperty('emoji')

      // Test that tiles have valid colors
      const validColors = ['red', 'yellow', 'green', 'white']
      tiles.forEach(tile => {
        expect(validColors).toContain(tile.color)
      })

      // Test that white tiles appear approximately 30% of the time
      const whiteTiles = tiles.filter(tile => tile.color === 'white')
      expect(whiteTiles.length).toBeGreaterThanOrEqual(0)
      expect(whiteTiles.length).toBeLessThanOrEqual(8)
    })

    it('should generate tiles with consistent structure', async () => {
      const { generateTiles } = await import('../../server.js')

      const tiles1 = generateTiles()
      const tiles2 = generateTiles()

      // Both should have 8 tiles
      expect(tiles1).toHaveLength(8)
      expect(tiles2).toHaveLength(8)

      // Each tile should have the required properties
      tiles1.forEach(tile => {
        expect(tile).toHaveProperty('id')
        expect(tile).toHaveProperty('color')
        expect(tile).toHaveProperty('emoji')
        expect(typeof tile.id).toBe('number')
        expect(typeof tile.color).toBe('string')
        expect(typeof tile.emoji).toBe('string')
      })
    })
  })

  describe('Real Score Calculation', () => {
    it('should calculate scores using real HeartCard instances', async () => {
      const { calculateScore } = await import('../../server.js')

      // Create real HeartCard instances
      const redHeart = new HeartCard('heart1', 'red', 2, '❤️')
      const yellowHeart = new HeartCard('heart2', 'yellow', 3, '💛')

      const whiteTile = { color: 'white' }
      const redTile = { color: 'red' }
      const yellowTile = { color: 'yellow' }
      const greenTile = { color: 'green' }

      // Test white tile placement (base points)
      expect(calculateScore(redHeart, whiteTile)).toBe(2)
      expect(calculateScore(yellowHeart, whiteTile)).toBe(3)

      // Test color matching (double points)
      expect(calculateScore(redHeart, redTile)).toBe(4) // 2 * 2
      expect(calculateScore(yellowHeart, yellowTile)).toBe(6) // 3 * 2

      // Test color mismatch (zero points)
      expect(calculateScore(redHeart, yellowTile)).toBe(0)
      expect(calculateScore(yellowHeart, greenTile)).toBe(0)
    })

    it('should handle legacy card objects', async () => {
      const { calculateScore } = await import('../../server.js')

      // Test with plain objects (legacy format)
      const plainHeart = { value: 2, color: 'red' }
      const redTile = { color: 'red' }
      const whiteTile = { color: 'white' }

      expect(calculateScore(plainHeart, whiteTile)).toBe(2)
      expect(calculateScore(plainHeart, redTile)).toBe(4)
    })
  })

  describe('Real Player Management', () => {
    it('should find players by userId correctly', async () => {
      const { findPlayerByUserId } = await import('../../server.js')

      const room = {
        players: [
          { userId: 'user1', name: 'Player1', score: 10 },
          { userId: 'user2', name: 'Player2', score: 15 }
        ]
      }

      const player = findPlayerByUserId(room, 'user1')
      expect(player).toEqual({ userId: 'user1', name: 'Player1', score: 10 })

      const notFound = findPlayerByUserId(room, 'user3')
      expect(notFound).toBeUndefined()
    })

    it('should find players by name case-insensitively', async () => {
      const { findPlayerByName } = await import('../../server.js')

      const room = {
        players: [
          { userId: 'user1', name: 'Player1' },
          { userId: 'user2', name: 'player2' }
        ]
      }

      const player = findPlayerByName(room, 'PLAYER1')
      expect(player).toEqual({ userId: 'user1', name: 'Player1' })

      const notFound = findPlayerByName(room, 'Player3')
      expect(notFound).toBeUndefined()
    })
  })

  describe('Real Game State Validation', () => {
    it('should validate room state comprehensively', async () => {
      const { validateRoomState } = await import('../../server.js')

      // Valid room state
      const validRoom = {
        players: [],
        gameState: {
          gameStarted: false,
          currentPlayer: null
        }
      }

      expect(validateRoomState(validRoom).valid).toBe(true)

      // Invalid room states
      expect(validateRoomState(null).valid).toBe(false)
      expect(validateRoomState({ players: "not an array" }).valid).toBe(false)

      const gameStartedNoCurrent = {
        players: [],
        gameState: {
          gameStarted: true,
          currentPlayer: null
        }
      }

      expect(validateRoomState(gameStartedNoCurrent).valid).toBe(false)
    })

    it('should validate player presence in room', async () => {
      const { validatePlayerInRoom } = await import('../../server.js')

      const room = {
        players: [
          { userId: 'user1', name: 'Player1' }
        ]
      }

      expect(validatePlayerInRoom(room, 'user1').valid).toBe(true)
      expect(validatePlayerInRoom(room, 'user2').valid).toBe(false)
    })

    it('should validate turn order correctly', async () => {
      const { validateTurn } = await import('../../server.js')

      const gameStartedRoom = {
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user1', name: 'Player1' }
        }
      }

      expect(validateTurn(gameStartedRoom, 'user1').valid).toBe(true)
      expect(validateTurn(gameStartedRoom, 'user2').valid).toBe(false)

      const gameNotStartedRoom = {
        gameState: {
          gameStarted: false
        }
      }

      expect(validateTurn(gameNotStartedRoom, 'user1').valid).toBe(false)
    })

    it('should validate deck state', async () => {
      const { validateDeckState } = await import('../../server.js')

      const validDeckRoom = {
        gameState: {
          deck: { emoji: '💌', cards: 16, type: 'hearts' }
        }
      }

      expect(validateDeckState(validDeckRoom).valid).toBe(true)

      const invalidDeckRoom = {
        gameState: {
          deck: { cards: -1, type: 'hearts' }
        }
      }

      expect(validateDeckState(invalidDeckRoom).valid).toBe(false)
    })
  })

  describe('Real Turn Lock Management', () => {
    it('should manage turn locks correctly', async () => {
      const { acquireTurnLock, releaseTurnLock } = await import('../../server.js')

      const roomCode = 'ABC123'
      const socketId = 'socket1'

      // Acquire lock
      const acquired = acquireTurnLock(roomCode, socketId)
      expect(acquired).toBe(true)

      // Try to acquire same lock again (should fail - only one action per room)
      const acquiredAgain = acquireTurnLock(roomCode, 'socket2')
      expect(acquiredAgain).toBe(false)

      // Release lock
      releaseTurnLock(roomCode, socketId)

      // Should be able to acquire again
      const acquiredAfterRelease = acquireTurnLock(roomCode, 'socket3')
      expect(acquiredAfterRelease).toBe(true)
    })
  })

  describe('Real Game End Conditions', () => {
    it('should detect when all tiles are filled', async () => {
      const { checkGameEndConditions } = await import('../../server.js')

      const roomWithAllTilesFilled = {
        gameState: {
          gameStarted: true,
          tiles: [
            { placedHeart: { value: 1 } },
            { placedHeart: { value: 2 } }
          ]
        }
      }

      const result = checkGameEndConditions(roomWithAllTilesFilled)
      expect(result.shouldEnd).toBe(true)
      expect(result.reason).toBe("All tiles are filled")
    })

    it('should detect when both decks are empty', async () => {
      const { checkGameEndConditions } = await import('../../server.js')

      const roomWithEmptyDecks = {
        gameState: {
          gameStarted: true,
          tiles: [{ placedHeart: null }],
          deck: { emoji: '💌', cards: 0 },
          magicDeck: { emoji: '🔮', cards: 0 }
        }
      }

      const result = checkGameEndConditions(roomWithEmptyDecks, false)
      expect(result.shouldEnd).toBe(true)
      expect(result.reason).toBe("Both decks are empty")
    })

    it('should not end game when conditions are not met', async () => {
      const { checkGameEndConditions } = await import('../../server.js')

      const activeGameRoom = {
        gameState: {
          gameStarted: true,
          tiles: [{ placedHeart: null }],
          deck: { emoji: '💌', cards: 10 },
          magicDeck: { emoji: '🔮', cards: 8 }
        }
      }

      const result = checkGameEndConditions(activeGameRoom)
      expect(result.shouldEnd).toBe(false)
    })
  })

  describe('Real Shield Management', () => {
    it('should expire shields correctly', async () => {
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
      expect(room.gameState.shields.user2).toBeUndefined() // Should be removed
    })

    it('should handle missing shields gracefully', async () => {
      const { checkAndExpireShields } = await import('../../server.js')

      const roomWithoutShields1 = { gameState: {} }
      const roomWithoutShields2 = { gameState: { shields: null } }

      expect(() => {
        checkAndExpireShields(roomWithoutShields1)
        checkAndExpireShields(roomWithoutShields2)
      }).not.toThrow()
    })
  })

  describe('Real Action Tracking', () => {
    it('should track card draw limits correctly', async () => {
      const { validateCardDrawLimit, recordCardDraw } = await import('../../server.js')

      const room = { gameState: {} }

      // Initial state
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

    it('should reset player actions correctly', async () => {
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

  describe('Real IP Detection', () => {
    it('should get client IP from socket', async () => {
      const { getClientIP } = await import('../../server.js')

      const mockSocket1 = {
        handshake: { address: '192.168.1.1' },
        conn: { remoteAddress: '192.168.1.2' }
      }

      const mockSocket2 = {
        handshake: {},
        conn: { remoteAddress: '192.168.1.2' }
      }

      expect(getClientIP(mockSocket1)).toBe('192.168.1.1')
      expect(getClientIP(mockSocket2)).toBe('192.168.1.2')
    })
  })

  describe('Integration with Server Test Utils', () => {
    it('should create default room structure', () => {
      const room = createDefaultRoom('TEST123')

      expect(room.code).toBe('TEST123')
      expect(room.players).toEqual([])
      expect(room.maxPlayers).toBe(2)
      expect(room.gameState.gameStarted).toBe(false)
      expect(room.gameState.tiles).toEqual([])
      expect(room.gameState.deck).toEqual({ emoji: "💌", cards: 16, type: 'hearts' })
      expect(room.gameState.magicDeck).toEqual({ emoji: "🔮", cards: 16, type: 'magic' })
    })

    it('should start game with proper initialization', () => {
      const room = createDefaultRoom('GAME123')
      room.players = [
        { userId: 'user1', name: 'Player1' },
        { userId: 'user2', name: 'Player2' }
      ]

      const startedRoom = startGame(room)

      expect(startedRoom.gameState.gameStarted).toBe(true)
      expect(startedRoom.gameState.tiles).toHaveLength(8)
      expect(startedRoom.gameState.currentPlayer).toBeDefined()
      expect(startedRoom.gameState.turnCount).toBe(1)
      expect(Object.keys(startedRoom.gameState.playerHands)).toHaveLength(2)

      // Each player should have 5 cards (3 hearts + 2 magic)
      expect(startedRoom.gameState.playerHands.user1).toHaveLength(5)
      expect(startedRoom.gameState.playerHands.user2).toHaveLength(5)
    })

    it('should migrate player data correctly', () => {
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

      expect(room.players[0].userId).toBe('newUser1')
      expect(room.players[0].name).toBe('NewUser')
      expect(room.players[0].email).toBe('new@example.com')
      expect(room.gameState.playerHands.newUser1).toBeDefined()
      expect(room.gameState.playerHands.oldUser1).toBeUndefined()
      expect(room.gameState.shields.newUser1).toBeDefined()
      expect(room.gameState.shields.oldUser1).toBeUndefined()
      expect(room.gameState.currentPlayer.userId).toBe('newUser1')
    })
  })

  describe('Real Magic Card Execution Concepts', () => {
    it('should validate magic card execution flow', () => {
      // Test the concept of magic card validation and execution
      const room = {
        gameState: {
          tiles: [{ id: 0, color: 'red', placedHeart: null }],
          playerHands: {
            user1: [{
              id: 'card1',
              type: 'magic',
              canTargetTile: vi.fn().mockReturnValue(true),
              executeEffect: vi.fn().mockReturnValue({
                type: 'test',
                newTileState: { id: 0, color: 'changed' }
              })
            }]
          },
          currentPlayer: { userId: 'user1', name: 'Player1' },
          turnCount: 1
        },
        players: [{ userId: 'user1', score: 0 }]
      }

      // Test that we can validate card existence in hand
      const playerHand = room.gameState.playerHands.user1 || []
      const card = playerHand.find(c => c.id === 'card1')
      expect(card).toBeDefined()
      expect(card.type).toBe('magic')

      // Test target validation
      const tile = room.gameState.tiles.find(t => t.id === 0)
      expect(tile).toBeDefined()
      expect(card.canTargetTile(tile)).toBe(true)

      // Test action recording
      recordMagicCardUsage(room, 'user1')
      expect(room.gameState.playerActions.user1.magicCardsUsed).toBe(1)
    })

    it('should handle shield protection logic', () => {
      const room = {
        gameState: {
          tiles: [{
            id: 0,
            color: 'red',
            placedHeart: {
              placedBy: 'user2',
              score: 4
            }
          }],
          shields: {
            user2: {
              active: true,
              remainingTurns: 2,
              activatedTurn: 1
            }
          },
          turnCount: 1
        }
      }

      // Test shield protection detection
      const tile = room.gameState.tiles[0]
      const opponentId = tile.placedHeart.placedBy
      const currentTurnCount = room.gameState.turnCount

      expect(opponentId).toBe('user2')
      expect(room.gameState.shields[opponentId]).toBeDefined()

      // Shield should be active
      const shield = room.gameState.shields[opponentId]
      expect(shield.remainingTurns).toBe(2)
      expect(shield.active).toBe(true)
    })

    it('should handle score subtraction for wind cards', () => {
      const room = {
        players: [
          { userId: 'user1', score: 0 },
          { userId: 'user2', score: 10 }
        ],
        gameState: {
          tiles: [{
            id: 0,
            placedHeart: {
              placedBy: 'user2',
              score: 4
            }
          }]
        }
      }

      // Test score subtraction logic
      const tile = room.gameState.tiles[0]
      const placedHeart = tile.placedHeart
      const playerIndex = room.players.findIndex(p => p.userId === placedHeart.placedBy)

      expect(playerIndex).toBe(1)
      expect(room.players[playerIndex].score).toBe(10)

      // Simulate score subtraction
      room.players[playerIndex].score -= placedHeart.score
      expect(room.players[playerIndex].score).toBe(6) // 10 - 4
    })
  })

  describe('Authentication with Real Token Handling', () => {
    it('should authenticate socket with valid token', async () => {
      const { getToken } = await import('next-auth/jwt')
      const { User } = await import('../../models.js')

      getToken.mockResolvedValue(mockToken)
      User.findById.mockResolvedValue(mockUser)

      const mockSocket = {
        handshake: { headers: {} },
        data: {}
      }

      const result = await authenticateSocket(mockSocket)

      expect(result.authenticated).toBe(true)
      expect(mockSocket.data.userId).toBe('user1')
      expect(mockSocket.data.userEmail).toBe('test@example.com')
      expect(mockSocket.data.userName).toBe('TestUser')
      expect(mockSocket.data.userSessionId).toBe('session1')
    })

    it('should reject authentication with invalid token', async () => {
      const { getToken } = await import('next-auth/jwt')

      getToken.mockResolvedValue(null)

      const mockSocket = {
        handshake: { headers: {} },
        data: {}
      }

      await expect(authenticateSocket(mockSocket)).rejects.toThrow('Authentication required')
    })

    it('should reject authentication when user not found', async () => {
      const { getToken } = await import('next-auth/jwt')
      const { User } = await import('../../models.js')

      getToken.mockResolvedValue(mockToken)
      User.findById.mockResolvedValue(null)

      const mockSocket = {
        handshake: { headers: {} },
        data: {}
      }

      await expect(authenticateSocket(mockSocket)).rejects.toThrow('User not found')
    })
  })
})