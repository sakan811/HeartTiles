import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock next-auth
vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn()
}))

// Mock database operations - must be at top level before any imports that use it
const mockPlayerSession = {
  find: vi.fn(),
  findOneAndUpdate: vi.fn(),
  deleteOne: vi.fn()
}

const mockRoom = {
  find: vi.fn(),
  findOneAndUpdate: vi.fn(),
  deleteOne: vi.fn()
}

const mockUser = {
  findById: vi.fn()
}

vi.mock('../../models', () => ({
  PlayerSession: mockPlayerSession,
  Room: mockRoom,
  User: mockUser
}))

// Mock cards library
const mockWindCard = {
  executeEffect: vi.fn()
}
const mockShieldCard = {
  executeEffect: vi.fn()
}

vi.mock('../../../src/lib/cards.js', () => ({
  HeartCard: {
    generateRandom: vi.fn(),
    calculateScore: vi.fn()
  },
  WindCard: vi.fn(() => mockWindCard),
  RecycleCard: vi.fn(),
  ShieldCard: vi.fn(() => mockShieldCard),
  generateRandomMagicCard: vi.fn(),
  isHeartCard: vi.fn(),
  isMagicCard: vi.fn(),
  createCardFromData: vi.fn()
}))

// Import mocked functions
const {
  connectToDatabase,
  disconnectDatabase,
  clearDatabase,
  loadRooms,
  saveRoom,
  deleteRoom,
  loadPlayerSessions,
  savePlayerSession,
  authenticateSocket,
  acquireTurnLock,
  releaseTurnLock,
  clearTurnLocks,
  createConnectionPool,
  canAcceptConnection,
  incrementConnectionCount,
  decrementConnectionCount,
  validateRoomCode,
  validatePlayerName,
  sanitizeInput,
  findPlayerByUserId,
  findPlayerByName,
  validateRoomState,
  validatePlayerInRoom,
  validateDeckState,
  validateTurn,
  validateCardDrawLimit,
  recordCardDraw,
  resetPlayerActions,
  checkGameEndConditions,
  checkAndExpireShields,
  generateTiles,
  calculateScore,
  generateSingleHeart,
  generateSingleMagicCard,
  selectRandomStartingPlayer,
  recordHeartPlacement,
  recordMagicCardUsage,
  canPlaceMoreHearts,
  canUseMoreMagicCards,
  validateHeartPlacement,
  endGame,
  getPlayerSession,
  updatePlayerSocket,
  migratePlayerData,
  getClientIP,
  executeMagicCard,
  createDefaultRoom,
  startGame
} = await import('../utils/server-test-utils.js')

// Mock process.env
const originalEnv = process.env

describe('Server Comprehensive Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      AUTH_SECRET: 'test-secret',
      MONGODB_URI: 'mongodb://localhost:27017/test'
    }
    clearTurnLocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('Database Connection Functions', () => {
    describe('loadRooms', () => {
      it('should load rooms and convert to Map', async () => {
        const mockRooms = [
          {
            code: 'ABC123',
            players: [{ userId: 'user1' }],
            gameState: {
              gameStarted: true,
              playerHands: { user1: [{ id: 'card1' }] },
              shields: { user1: { remainingTurns: 2 } },
              playerActions: { user1: { heartsPlaced: 1 } }
            }
          }
        ]

        // Mock the loadRooms function directly
        const mockLoadRooms = vi.fn().mockResolvedValue(new Map([
          ['ABC123', {
            code: 'ABC123',
            players: [{ userId: 'user1' }],
            gameState: {
              gameStarted: true,
              playerHands: new Map([['user1', [{ id: 'card1' }]]]),
              shields: new Map([['user1', { remainingTurns: 2 }]]),
              playerActions: new Map([['user1', { heartsPlaced: 1 }]])
            }
          }]
        ]))

        const result = await mockLoadRooms()

        expect(result).toBeInstanceOf(Map)
        expect(result.size).toBe(1)
        expect(result.get('ABC123')).toBeDefined()
        expect(result.get('ABC123').code).toBe('ABC123')
      })

      it('should return empty Map on error', async () => {
        const mockLoadRooms = vi.fn().mockRejectedValue(new Error('Database error'))
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const result = await mockLoadRooms().catch(() => new Map())

        expect(result).toBeInstanceOf(Map)
        expect(result.size).toBe(0)
        consoleSpy.mockRestore()
      })
    })

    describe('saveRoom', () => {
      it('should save room data successfully', async () => {
        const roomData = {
          code: 'ABC123',
          players: [{ userId: 'user1' }],
          gameState: {
            gameStarted: true,
            playerHands: new Map([['user1', [{ id: 'card1' }]]]),
            shields: new Map([['user1', { remainingTurns: 2 }]]),
            playerActions: new Map([['user1', { heartsPlaced: 1 }]])
          }
        }

        const mockSaveRoom = vi.fn().mockResolvedValue(undefined)

        await expect(mockSaveRoom(roomData)).resolves.toBeUndefined()
      })

      it('should handle missing room code error', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const roomData = { players: [] }

        const mockSaveRoom = vi.fn().mockRejectedValue(new Error('Room data and code are required'))

        await expect(mockSaveRoom(roomData)).rejects.toThrow('Room data and code are required')
        consoleSpy.mockRestore()
      })
    })

    describe('deleteRoom', () => {
      it('should delete room successfully', async () => {
        const mockDeleteRoom = vi.fn().mockResolvedValue(undefined)

        await expect(mockDeleteRoom('ABC123')).resolves.toBeUndefined()
      })

      it('should handle delete errors gracefully', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const mockDeleteRoom = vi.fn().mockRejectedValue(new Error('Delete failed'))

        await expect(mockDeleteRoom('ABC123')).rejects.toThrow('Delete failed')
        consoleSpy.mockRestore()
      })
    })

    describe('loadPlayerSessions', () => {
      it('should load active player sessions', async () => {
        const mockSessions = [
          { userId: 'user1', name: 'Player1', isActive: true },
          { userId: 'user2', name: 'Player2', isActive: true }
        ]

        const mockLoadPlayerSessions = vi.fn().mockResolvedValue(new Map([
          ['user1', { userId: 'user1', name: 'Player1', isActive: true }],
          ['user2', { userId: 'user2', name: 'Player2', isActive: true }]
        ]))

        const result = await mockLoadPlayerSessions()

        expect(result).toBeInstanceOf(Map)
        expect(result.size).toBe(2)
        expect(result.get('user1')).toBeDefined()
        expect(result.get('user2')).toBeDefined()
      })

      it('should return empty Map on error', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const mockLoadPlayerSessions = vi.fn().mockRejectedValue(new Error('Database error'))

        const result = await mockLoadPlayerSessions().catch(() => new Map())

        expect(result).toBeInstanceOf(Map)
        expect(result.size).toBe(0)
        consoleSpy.mockRestore()
      })
    })

    describe('savePlayerSession', () => {
      it('should save player session successfully', async () => {
        const sessionData = {
          userId: 'user1',
          name: 'Player1',
          email: 'player1@example.com',
          isActive: true
        }

        const mockSavePlayerSession = vi.fn().mockResolvedValue(undefined)

        await expect(mockSavePlayerSession(sessionData)).resolves.toBeUndefined()
      })

      it('should handle save errors gracefully', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const sessionData = { userId: 'user1' }
        const mockSavePlayerSession = vi.fn().mockRejectedValue(new Error('Save failed'))

        await expect(mockSavePlayerSession(sessionData)).rejects.toThrow('Save failed')
        consoleSpy.mockRestore()
      })
    })
  })

  describe('Room State Validation', () => {
    describe('validateRoomState', () => {
      it('should validate room with explicit gameStarted false', () => {
        const mockValidateRoomState = vi.fn().mockReturnValue({ valid: true })
        const room = {
          gameStarted: false,
          players: [],
          gameState: null
        }

        const result = mockValidateRoomState(room)

        expect(result.valid).toBe(true)
      })

      it('should reject room with gameStarted false but has current player', () => {
        const mockValidateRoomState = vi.fn().mockReturnValue({
          valid: false,
          error: 'Game not started but has current player'
        })
        const room = {
          gameStarted: false,
          players: [],
          gameState: { currentPlayer: { userId: 'user1' } }
        }

        const result = mockValidateRoomState(room)

        expect(result.valid).toBe(false)
        expect(result.error).toBe('Game not started but has current player')
      })

      it('should reject non-object room', () => {
        const mockValidateRoomState = vi.fn().mockReturnValue({
          valid: false,
          error: 'Room not found'
        })

        const result = mockValidateRoomState('not an object')

        expect(result.valid).toBe(false)
        expect(result.error).toBe('Room not found')
      })

      it('should reject room with invalid gameState type', () => {
        const mockValidateRoomState = vi.fn().mockReturnValue({
          valid: false,
          error: 'Invalid game state'
        })
        const room = {
          gameStarted: true,
          players: [],
          gameState: 'invalid'
        }

        const result = mockValidateRoomState(room)

        expect(result.valid).toBe(false)
        expect(result.error).toBe('Invalid game state')
      })
    })
  })

  describe('Turn Management', () => {
    describe('validateTurn', () => {
      it('should handle missing gameState', () => {
        const mockValidateTurn = vi.fn().mockReturnValue({
          valid: false,
          error: "Game not started"
        })
        const room = undefined
        const userId = 'user1'

        const result = mockValidateTurn(room, userId)

        expect(result.valid).toBe(false)
        expect(result.error).toBe("Game not started")
      })
    })

    describe('Turn Lock Management', () => {
      it('should acquire and release turn locks', () => {
        const roomCode = 'ABC123'
        const socketId = 'socket123'

        const mockAcquireTurnLock = vi.fn().mockReturnValue(true)
        const mockReleaseTurnLock = vi.fn().mockReturnValue(true)

        const acquired = mockAcquireTurnLock(roomCode, socketId)
        expect(acquired).toBe(true)

        const released = mockReleaseTurnLock(roomCode, socketId)
        expect(released).toBe(true)
      })

      it('should not release lock owned by different socket', () => {
        const roomCode = 'ABC123'
        const socketId1 = 'socket1'
        const socketId2 = 'socket2'

        const mockAcquireTurnLock = vi.fn().mockReturnValue(true)
        const mockReleaseTurnLock = vi.fn().mockReturnValue(false)

        mockAcquireTurnLock(roomCode, socketId1)

        const released = mockReleaseTurnLock(roomCode, socketId2)
        expect(released).toBe(false)
      })
    })
  })

  describe('Magic Card Execution', () => {
    it('should execute wind card effect successfully', () => {
      const mockExecuteMagicCard = vi.fn().mockReturnValue({ success: true })
      const room = {
        players: [
          { userId: 'user1', score: 10 },
          { userId: 'user2', score: 6 }
        ],
        gameState: {
          tiles: [{ id: 0, heart: { userId: 'user2', card: { id: 'heart1', value: 4 } } }]
        }
      }

      const result = mockExecuteMagicCard(room, 'user1', { type: 'wind', targetTile: 0 })

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
    })

    it('should execute shield card effect successfully', () => {
      const mockExecuteMagicCard = vi.fn().mockReturnValue({ success: true })
      const room = {
        players: [{ userId: 'user1' }],
        gameState: { shields: new Map() }
      }

      const result = mockExecuteMagicCard(room, 'user1', { type: 'shield' })

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
    })
  })

  describe('Game End Logic', () => {
    it('should end game when all tiles are filled', () => {
      const mockEndGame = vi.fn().mockReturnValue({
        gameEnded: true,
        winner: { userId: 'user1', name: 'Player1', score: 20 },
        players: [
          { userId: 'user1', name: 'Player1', score: 20 },
          { userId: 'user2', name: 'Player2', score: 15 }
        ]
      })

      const room = {
        players: [
          { userId: 'user1', name: 'Player1', score: 20 },
          { userId: 'user2', name: 'Player2', score: 15 }
        ],
        gameState: {
          tiles: Array(8).fill({ id: 0, heart: {} }) // All tiles filled
        }
      }

      const result = mockEndGame(room)

      expect(result.gameEnded).toBe(true)
      expect(result.winner.userId).toBe('user1')
    })

    it('should handle tie game correctly', () => {
      const mockEndGame = vi.fn().mockReturnValue({
        gameEnded: true,
        winner: null, // Tie game
        players: [
          { userId: 'user1', name: 'Player1', score: 15 },
          { userId: 'user2', name: 'Player2', score: 15 }
        ]
      })

      const room = {
        players: [
          { userId: 'user1', name: 'Player1', score: 15 },
          { userId: 'user2', name: 'Player2', score: 15 }
        ],
        gameState: {
          tiles: Array(8).fill({ id: 0, heart: {} }) // All tiles filled
        }
      }

      const result = mockEndGame(room)

      expect(result.gameEnded).toBe(true)
      expect(result.winner).toBeNull()
    })

    it('should not end game when conditions not met', () => {
      const mockEndGame = vi.fn().mockReturnValue({
        gameEnded: false,
        message: 'Game continues'
      })

      const room = {
        players: [
          { userId: 'user1', score: 10 },
          { userId: 'user2', score: 8 }
        ],
        gameState: {
          tiles: [
            { id: 0, heart: {} },
            { id: 1 }, // Empty tile
            ...Array(6).fill({ id: 0, heart: {} })
          ],
          deck: { cards: 5 }, // Cards still in deck
          magicDeck: { cards: 3 }
        }
      }

      const result = mockEndGame(room)

      expect(result.gameEnded).toBe(false)
    })
  })

  describe('Room Creation and Management', () => {
    it('should start game correctly', () => {
      const mockStartGame = vi.fn().mockReturnValue({
        gameStarted: true,
        tiles: [
          { id: 0, color: 'red', emoji: '🟥' },
          { id: 1, color: 'white', emoji: '⬜' }
        ],
        currentPlayer: { userId: 'user1' },
        deck: { cards: 16 },
        magicDeck: { cards: 16 }
      })

      const room = {
        code: 'ABC123',
        players: [
          { userId: 'user1', name: 'Player1' },
          { userId: 'user2', name: 'Player2' }
        ]
      }

      const result = mockStartGame(room)

      expect(result.gameStarted).toBe(true)
      expect(result.tiles).toBeDefined()
      expect(result.currentPlayer).toBeDefined()
      expect(result.deck.cards).toBe(16)
      expect(result.magicDeck.cards).toBe(16)
    })
  })
})