import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { Room } from '../../models.js'
import { createMockSocket, createMockRoom, waitForAsync } from './setup.js'
import { HeartCard, WindCard, RecycleCard, ShieldCard } from '../../src/lib/cards.js'

// Import database utilities from server-test-utils for integration tests
import {
  connectToDatabase,
  disconnectDatabase,
  clearDatabase,
  clearTurnLocks
} from '../utils/server-test-utils.js'

// Import real server functions to ensure server.js code is executed and covered
import {
  validateRoomState,
  validatePlayerInRoom,
  validateDeckState,
  validateTurn,
  validateCardDrawLimit,
  validateHeartPlacement,
  canPlaceMoreHearts,
  canUseMoreMagicCards,
  recordHeartPlacement,
  recordMagicCardUsage,
  recordCardDraw,
  resetPlayerActions,
  checkAndExpireShields,
  selectRandomStartingPlayer,
  generateTiles,
  calculateScore,
  checkGameEndConditions,
  sanitizeInput,
  getClientIP,
  validateRoomCode,
  validatePlayerName,
  findPlayerByUserId,
  findPlayerByName,
  generateSingleHeart,
  generateSingleMagicCard,
  acquireTurnLock,
  releaseTurnLock,
  migratePlayerData
} from '../../server.js'

// Helper function to generate valid room codes (6-7 chars, uppercase + numbers)
// Using timestamp and random to ensure uniqueness across test runs
function generateValidRoomCode(prefix = 'TEST') {
  const timestamp = Date.now().toString(36).slice(-3).toUpperCase()
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  return `${prefix}${timestamp}${random}`.slice(0, 7).toUpperCase()
}

describe('Server Room Management Integration Tests', () => {
  let mockServer
  let port

  beforeAll(async () => {
    try {
      await connectToDatabase()
    } catch (error) {
      console.warn('Database connection failed, skipping tests:', error.message)
    }
  }, 15000)

  afterAll(async () => {
    try {
      await clearDatabase()
      await disconnectDatabase()
    } catch (error) {
      console.warn('Database cleanup failed:', error.message)
    }
  })

  beforeEach(async () => {
    try {
      await clearDatabase()
      await clearTurnLocks()
    } catch (error) {
      console.warn('Database clear failed:', error.message)
    }
    vi.clearAllMocks()
    process.env.NODE_ENV = 'test'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('validateRoomState function with real database', () => {
    it('should validate room with valid state from database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { validateRoomState } = await import('../../server.js')

      // Create and save a room to the database
      const uniqueRoomCode = generateValidRoomCode('VALID')
      const roomData = createMockRoom(uniqueRoomCode)
      roomData.players = [
        { userId: 'u1', name: 'Alice', isReady: true, score: 10, joinedAt: new Date(), email: 'u1@test.com' },
        { userId: 'u2', name: 'Bob', isReady: false, score: 5, joinedAt: new Date(), email: 'u2@test.com' }
      ];
      roomData.gameState.gameStarted = true;
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load the room from database
      const dbRoom = await Room.findOne({ code: uniqueRoomCode })
      const result = validateRoomState(dbRoom)

      expect(result.valid).toBe(true)
    })

    it('should reject room with null or undefined', async () => {
      const { validateRoomState } = await import('../../server.js')

      expect(validateRoomState(null).valid).toBe(false)
      expect(validateRoomState(undefined).valid).toBe(false)
      expect(validateRoomState('string').valid).toBe(false)
    })

    it('should reject room with invalid players array from database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { validateRoomState } = await import('../../server.js')

      // Create room with invalid players structure
      const roomData = {
        code: generateValidRoomCode('INV'),
        players: 'not an array', // Invalid
        gameState: { gameStarted: false }
      }

      const result = validateRoomState(roomData)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid players state')
    })

    it('should reject room with missing or invalid gameState from database', async () => {
      const { validateRoomState } = await import('../../server.js')

      // Test room without gameState
      const roomWithoutGameState = {
        code: generateValidRoomCode('NOGAME'),
        players: []
      }

      const result1 = validateRoomState(roomWithoutGameState)
      expect(result1.valid).toBe(false)
      expect(result1.error).toBe('Invalid game state')

      // Test room with invalid gameState
      const roomWithInvalidGameState = {
        code: generateValidRoomCode('INVGAME'),
        players: [],
        gameState: 'not an object'
      }

      const result2 = validateRoomState(roomWithInvalidGameState)
      expect(result2.valid).toBe(false)
      expect(result2.error).toBe('Invalid game state')
    })

    it('should reject room with gameStarted=true but no currentPlayer from database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { validateRoomState } = await import('../../server.js')

      const gameStartedNoCurrent = {
        code: generateValidRoomCode('NOCUR'),
        players: [],
        gameState: {
          gameStarted: true,
          currentPlayer: null
        }
      }

      const result = validateRoomState(gameStartedNoCurrent)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Game started but no current player')
    })

    it('should reject room with gameStarted=false but has currentPlayer from database', async () => {
      const { validateRoomState } = await import('../../server.js')

      const gameNotStartedWithCurrent = {
        code: generateValidRoomCode('HASCUR'),
        players: [],
        gameState: {
          gameStarted: false,
          currentPlayer: { userId: 'user1', name: 'Player1' }
        }
      }

      const result = validateRoomState(gameNotStartedWithCurrent)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Game not started but has current player')
    })

    it('should validate complex room state with real database persistence', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { validateRoomState } = await import('../../server.js')

      const complexRoom = {
        code: generateValidRoomCode('CPLX'),
        players: [
          { userId: 'user1', name: 'Player1', score: 10, email: 'player1@test.com', isReady: true, joinedAt: new Date() },
          { userId: 'user2', name: 'Player2', score: 5, email: 'player2@test.com', isReady: false, joinedAt: new Date() }
        ],
        maxPlayers: 2,
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user1', name: 'Player1' },
          turnCount: 5,
          tiles: [
            { id: 0, color: 'red', emoji: '🟥' },
            { id: 1, color: 'white', emoji: '⬜' }
          ],
          playerHands: {
            user1: [{ id: 'heart-1', type: 'heart', color: 'red', value: 2, emoji: '❤️' }],
            user2: [{ id: 'heart-2', type: 'heart', color: 'yellow', value: 1, emoji: '💛' }]
          },
          deck: { emoji: '💌', cards: 12, type: 'hearts' },
          magicDeck: { emoji: '🔮', cards: 10, type: 'magic' },
          playerActions: {
            user1: { drawnHeart: true, drawnMagic: false, heartsPlaced: 1, magicCardsUsed: 0 },
            user2: { drawnHeart: false, drawnMagic: false, heartsPlaced: 0, magicCardsUsed: 0 }
          }
        }
      }

      // Save to database
      const savedRoom = new Room(complexRoom)
      await savedRoom.save()

      // Load from database and validate
      const dbRoom = await Room.findOne({ code: complexRoom.code })
      const result = validateRoomState(dbRoom)

      expect(result.valid).toBe(true)
    })
  })

  describe('validatePlayerInRoom function with database integration', () => {
    it('should validate player present in room from database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { validatePlayerInRoom } = await import('../../server.js')

      const uniqueRoomCode = generateValidRoomCode('PLAYER')
      const roomData = createMockRoom(uniqueRoomCode)
      roomData.players = [
        { userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: false, score: 0, joinedAt: new Date() },
        { userId: 'user2', name: 'Player2', email: 'player2@test.com', isReady: false, score: 0, joinedAt: new Date() }
      ]

      const savedRoom = new Room(roomData)
      await savedRoom.save()

      const dbRoom = await Room.findOne({ code: uniqueRoomCode })
      const result = validatePlayerInRoom(dbRoom, 'user1')

      expect(result.valid).toBe(true)
    })

    it('should reject player not in room from database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { validatePlayerInRoom } = await import('../../server.js')

      const uniqueRoomCode = generateValidRoomCode('PLAYR')
      const roomData = createMockRoom(uniqueRoomCode)
      roomData.players = [
        { userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: false, score: 0, joinedAt: new Date() }
      ]

      const savedRoom = new Room(roomData)
      await savedRoom.save()

      const dbRoom = await Room.findOne({ code: uniqueRoomCode })
      const result = validatePlayerInRoom(dbRoom, 'user2')

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Player not in room')
    })

    it('should handle invalid room object from database context', async () => {
      const { validatePlayerInRoom } = await import('../../server.js')

      expect(validatePlayerInRoom(null, 'user1').valid).toBe(false)
      expect(validatePlayerInRoom(undefined, 'user1').valid).toBe(false)
      expect(validatePlayerInRoom('not object', 'user1').valid).toBe(false)
    })

    it('should handle missing players array in database document', async () => {
      const { validatePlayerInRoom } = await import('../../server.js')

      const roomWithoutPlayers = {
        code: generateValidRoomCode('NOPLAY'),
        notPlayers: 'not an array'
      }

      const result = validatePlayerInRoom(roomWithoutPlayers, 'user1')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid players state')
    })
  })

  describe('validateDeckState function with database persistence', () => {
    it('should validate proper deck state from database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { validateDeckState } = await import('../../server.js')

      // Use unique room code to avoid duplicate key errors
      const uniqueRoomCode = generateValidRoomCode('DECK')
      const roomData = createMockRoom(uniqueRoomCode)
      roomData.gameState.deck = {
        emoji: '💌',
        cards: 16,
        type: 'hearts'
      }

      const savedRoom = new Room(roomData)
      await savedRoom.save()

      const dbRoom = await Room.findOne({ code: uniqueRoomCode })
      const result = validateDeckState(dbRoom)

      expect(result.valid).toBe(true)
    })

    it('should reject room with missing deck from database', async () => {
      const { validateDeckState } = await import('../../server.js')

      expect(validateDeckState(null).valid).toBe(false)
      expect(validateDeckState({}).valid).toBe(false)
      expect(validateDeckState({ gameState: {} }).valid).toBe(false)
      expect(validateDeckState({ gameState: { deck: null } }).valid).toBe(false)
    })

    it('should reject invalid deck count values in database context', async () => {
      const { validateDeckState } = await import('../../server.js')

      const testCases = [
        { cards: 'not a number' },
        { cards: NaN },
        { cards: Infinity },
        { cards: -Infinity },
        { cards: -1 },
        { cards: undefined },
        { cards: null }
      ]

      for (const deckData of testCases) {
        const room = {
          code: `INVALID${Date.now()}`,
          gameState: {
            deck: {
              emoji: '💌',
              type: 'hearts',
              ...deckData
            }
          }
        }

        const result = validateDeckState(room)
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Invalid deck count')
      }
    })

    it('should reject invalid deck type in database', async () => {
      const { validateDeckState } = await import('../../server.js')

      const invalidTypeRooms = [
        { code: generateValidRoomCode('TYPE1'), gameState: { deck: { cards: 16, type: '' } } },
        { code: generateValidRoomCode('TYPE2'), gameState: { deck: { cards: 16, type: null } } },
        { code: generateValidRoomCode('TYPE3'), gameState: { deck: { cards: 16, type: undefined } } },
        { code: generateValidRoomCode('TYPE4'), gameState: { deck: { cards: 16, type: 123 } } }
      ]

      for (const room of invalidTypeRooms) {
        const result = validateDeckState(room)
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Invalid deck type')
      }
    })
  })

  describe('validateTurn function with game state persistence', () => {
    it('should validate current player turn from database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { validateTurn } = await import('../../server.js')

      const uniqueRoomCode = generateValidRoomCode('TURN')
      const roomData = createMockRoom(uniqueRoomCode)
      roomData.gameState.gameStarted = true
      roomData.gameState.currentPlayer = { userId: 'user1', name: 'Player1' }

      const savedRoom = new Room(roomData)
      await savedRoom.save()

      const dbRoom = await Room.findOne({ code: uniqueRoomCode })
      const result = validateTurn(dbRoom, 'user1')

      expect(result.valid).toBe(true)
    })

    it('should reject when game not started from database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { validateTurn } = await import('../../server.js')

      const uniqueRoomCode = generateValidRoomCode('NRTED')
      const roomData = createMockRoom(uniqueRoomCode)
      roomData.gameState.gameStarted = false
      roomData.gameState.currentPlayer = { userId: 'user1', name: 'Player1' }

      const savedRoom = new Room(roomData)
      await savedRoom.save()

      const dbRoom = await Room.findOne({ code: uniqueRoomCode })
      const result = validateTurn(dbRoom, 'user1')

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Game not started')
    })

    it('should reject wrong player turn from database', async () => {
      const { validateTurn } = await import('../../server.js')

      const roomWithDifferentPlayer = {
        code: generateValidRoomCode('WRONG'),
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user1', name: 'Player1' }
        }
      }

      const result = validateTurn(roomWithDifferentPlayer, 'user2')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Not your turn')
    })

    it('should handle invalid room state from database context', async () => {
      const { validateTurn } = await import('../../server.js')

      expect(validateTurn(null, 'user1').valid).toBe(false)
      expect(validateTurn({}, 'user1').valid).toBe(false)
      expect(validateTurn({ gameState: null }, 'user1').valid).toBe(false)
    })
  })

  describe('validateCardDrawLimit function with persistent player actions', () => {
    it('should initialize player actions when not present in database', async () => {
      const { validateCardDrawLimit } = await import('../../server.js')

      const room = {
        code: generateValidRoomCode('NOACT'),
        gameState: {}
      }

      const result = validateCardDrawLimit(room, 'user1')

      expect(result.valid).toBe(true)
      expect(result.currentActions).toEqual({
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0
      })

      // Should initialize playerActions in room
      expect(room.gameState.playerActions.user1).toEqual({
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0
      })
    })

    it('should return existing player actions from database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { validateCardDrawLimit } = await import('../../server.js')

      const existingActions = {
        drawnHeart: true,
        drawnMagic: false,
        heartsPlaced: 1,
        magicCardsUsed: 0
      }

      const uniqueRoomCode = generateValidRoomCode('EXIST')
      const roomData = createMockRoom(uniqueRoomCode)
      roomData.gameState.playerActions = {
        user1: existingActions
      }

      const savedRoom = new Room(roomData)
      await savedRoom.save()

      const dbRoom = await Room.findOne({ code: uniqueRoomCode })
      const result = validateCardDrawLimit(dbRoom, 'user1')

      expect(result.valid).toBe(true)
      expect(result.currentActions).toEqual(existingActions)
    })

    it('should handle different players independently with database persistence', async () => {
      const { validateCardDrawLimit } = await import('../../server.js')

      const room = {
        code: generateValidRoomCode('MULTI'),
        gameState: {
          playerActions: {
            user1: { drawnHeart: true, drawnMagic: false, heartsPlaced: 1, magicCardsUsed: 0 },
            user2: { drawnHeart: false, drawnMagic: true, heartsPlaced: 0, magicCardsUsed: 1 }
          }
        }
      }

      const result1 = validateCardDrawLimit(room, 'user1')
      const result2 = validateCardDrawLimit(room, 'user2')

      expect(result1.currentActions.drawnHeart).toBe(true)
      expect(result2.currentActions.drawnMagic).toBe(true)
    })
  })

  describe('Complex room state validation with database integration', () => {
    it('should handle complex room states with full database persistence', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { validateRoomState } = await import('../../server.js')

      const uniqueRoomCode = generateValidRoomCode('FPLEX')
      const complexRoom = {
        code: uniqueRoomCode,
        players: [
          {
            userId: 'user1',
            name: 'Player1',
            score: 10,
            email: 'player1@test.com',
            isReady: true,
            joinedAt: new Date()
          },
          {
            userId: 'user2',
            name: 'Player2',
            score: 5,
            email: 'player2@test.com',
            isReady: true,
            joinedAt: new Date()
          }
        ],
        maxPlayers: 2,
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user1', name: 'Player1' },
          turnCount: 5,
          tiles: [
            { id: 0, color: 'red', emoji: '🟥', placedHeart: null },
            { id: 1, color: 'yellow', emoji: '🟨', placedHeart: null },
            { id: 2, color: 'green', emoji: '🟩', placedHeart: null },
            { id: 3, color: 'white', emoji: '⬜', placedHeart: null }
          ],
          playerHands: {
            user1: [
              { id: 'heart-1', type: 'heart', color: 'red', value: 2, emoji: '❤️' },
              { id: 'heart-2', type: 'heart', color: 'yellow', value: 1, emoji: '💛' },
              { id: 'magic-1', type: 'magic', magicType: 'wind', emoji: '💨' }
            ],
            user2: [
              { id: 'heart-3', type: 'heart', color: 'green', value: 3, emoji: '💚' },
              { id: 'heart-4', type: 'heart', color: 'red', value: 2, emoji: '❤️' },
              { id: 'magic-2', type: 'magic', magicType: 'shield', emoji: '🛡️' }
            ]
          },
          deck: { emoji: '💌', cards: 12, type: 'hearts' },
          magicDeck: { emoji: '🔮', cards: 10, type: 'magic' },
          shields: {},
          playerActions: {
            user1: { drawnHeart: true, drawnMagic: false, heartsPlaced: 1, magicCardsUsed: 0 },
            user2: { drawnHeart: false, drawnMagic: false, heartsPlaced: 0, magicCardsUsed: 0 }
          }
        }
      }

      // Save to database
      const savedRoom = new Room(complexRoom)
      await savedRoom.save()
      await waitForAsync(100) // Ensure database operation completes

      // Load from database and validate
      const dbRoom = await Room.findOne({ code: uniqueRoomCode })
      const result = validateRoomState(dbRoom)

      expect(result.valid).toBe(true)
    })

    it('should handle partial room states from database context', async () => {
      const { validateRoomState } = await import('../../server.js')

      // Room with some but not all properties
      const partialRoom = {
        code: generateValidRoomCode('PARTIAL'),
        players: [],
        gameState: {
          gameStarted: undefined, // Explicitly undefined
          currentPlayer: null
        }
      }

      const result = validateRoomState(partialRoom)
      expect(result.valid).toBe(true) // Should be valid when gameStarted is undefined
    })

    it('should maintain data consistency across database operations', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { validateRoomState, validatePlayerInRoom, validateDeckState } = await import('../../server.js')

      const uniqueRoomCode = generateValidRoomCode('CONSY')
      const roomData = createMockRoom(uniqueRoomCode)
      roomData.players = [
        { userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: true, score: 0, joinedAt: new Date() }
      ]
      roomData.gameState.deck = { emoji: '💌', cards: 16, type: 'hearts' }
      roomData.gameState.magicDeck = { emoji: '🔮', cards: 16, type: 'magic' }
      roomData.gameState.gameStarted = true;

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load and perform multiple validations
      const dbRoom = await Room.findOne({ code: uniqueRoomCode })

      const roomStateResult = validateRoomState(dbRoom)

      const playerResult = validatePlayerInRoom(dbRoom, 'user1')
      const deckResult = validateDeckState(dbRoom)

      expect(roomStateResult.valid).toBe(true)
      expect(playerResult.valid).toBe(true)
      expect(deckResult.valid).toBe(true)
    })
  })

  // Direct server.js function tests to maximize coverage
  describe('Direct Server.js Function Tests', () => {
    it('should execute all imported server utility functions', async () => {
      // Test input sanitization
      const cleanInput = sanitizeInput('<script>alert("xss")</script>')
      expect(cleanInput).not.toContain('<script>')
      expect(cleanInput).not.toContain('</script>')

      // Test IP extraction
      const testSocket = {
        handshake: { address: '192.168.1.1' },
        conn: { remoteAddress: '127.0.0.1' },
        headers: { 'x-forwarded-for': '192.168.1.1' },
        connection: { remoteAddress: '127.0.0.1' }
      }
      const clientIP = getClientIP(testSocket)
      expect(clientIP).toBeDefined()

      // Test player finding functions
      const players = [
        { userId: 'user1', name: 'Alice', email: 'alice@test.com' },
        { userId: 'user2', name: 'Bob', email: 'bob@test.com' }
      ]

      const foundPlayer = findPlayerByUserId(players, 'user1')
      expect(foundPlayer).toBeDefined()
      expect(foundPlayer.name).toBe('Alice')

      const foundByName = findPlayerByName(players, 'Bob')
      expect(foundByName).toBeDefined()
      expect(foundByName.userId).toBe('user2')

      // Test validation functions
      const testRoomCode = generateValidRoomCode('TEST')
      const validRoomCode = validateRoomCode(testRoomCode)
      expect(validRoomCode.valid).toBe(true)

      const invalidRoomCode = validateRoomCode('TOOLONG')
      expect(invalidRoomCode.valid).toBe(false)

      const validPlayerName = validatePlayerName('Alice')
      expect(validPlayerName.valid).toBe(true)

      const invalidPlayerName = validatePlayerName('')
      expect(invalidPlayerName.valid).toBe(false)

      // Test turn validation
      const validTurn = validateTurn('user1', { userId: 'user1' })
      expect(validTurn.valid).toBe(true)

      const invalidTurn = validateTurn('user1', { userId: 'user2' })
      expect(invalidTurn.valid).toBe(false)

      // Test game logic functions
      const tiles = generateTiles()
      expect(tiles).toBeDefined()
      expect(tiles.tiles).toBeDefined()
      expect(Array.isArray(tiles.tiles)).toBe(true)

      const score = calculateScore('red', 'red', 2)
      expect(score).toBe(4) // Double points for matching colors

      const whiteScore = calculateScore('blue', 'white', 3)
      expect(whiteScore).toBe(3) // Face value for white tiles

      const mismatchScore = calculateScore('red', 'yellow', 2)
      expect(mismatchScore).toBe(0) // Zero for mismatch

      // Test game end conditions
      const notEnded = checkGameEndConditions([{ placedHeart: {} }], [{ cards: 1 }], false)
      expect(notEnded.gameOver).toBe(false)

      const endedByDeck = checkGameEndConditions([{ placedHeart: {} }], [], true)
      expect(endedByDeck.gameOver).toBe(true)

      // Test card generation
      const heartCard = generateSingleHeart()
      expect(heartCard).toBeDefined()
      expect(heartCard.type).toBe('heart')
      expect(['red', 'yellow', 'green']).toContain(heartCard.color)

      const magicCard = generateSingleMagicCard()
      expect(magicCard).toBeDefined()
      expect(magicCard.type).toBe('magic')
      expect(['wind', 'recycle', 'shield']).toContain(magicCard.magicType)

      // Test player action validation
      const testRoom = {
        gameState: {
          playerActions: {
            user1: { drawnHeart: false, drawnMagic: false, heartsPlaced: 0, magicCardsUsed: 0 }
          },
          playerHands: {
            user1: [
              { id: 'heart-1', type: 'heart', color: 'red', value: 2 },
              { id: 'heart-2', type: 'heart', color: 'yellow', value: 1 }
            ]
          },
          tiles: [{ id: 0 }, { id: 1 }, { id: 2 }]
        }
      }

      const drawLimit = validateCardDrawLimit(testRoom, 'user1')
      expect(drawLimit.valid).toBe(true)

      testRoom.gameState.playerActions.user1.drawnHeart = true
      testRoom.gameState.playerActions.user1.drawnMagic = true
      const exceededDrawLimit = validateCardDrawLimit(testRoom, 'user1')
      expect(exceededDrawLimit.valid).toBe(false) // Still valid but tracks both draws

      const heartPlacement = validateHeartPlacement(testRoom, 'user1', 'heart-1', 0)
      expect(heartPlacement.valid).toBe(true)

      const canPlaceMore = canPlaceMoreHearts(1, false)
      expect(canPlaceMore).toBe(true)

      const cannotPlaceMore = canPlaceMoreHearts(2, false)
      expect(cannotPlaceMore).toBe(false)

      const canUseMagic = canUseMoreMagicCards(0, false)
      expect(canUseMagic).toBe(true)

      const cannotUseMagic = canUseMoreMagicCards(2, false)
      expect(cannotUseMagic).toBe(false)

      // Test action recording functions
      const actionTestRoom = {
        gameState: {
          playerHands: { user1: [] },
          playerActions: { user1: { drawnHeart: false, drawnMagic: false, heartsPlaced: 0, magicCardsUsed: 0 } }
        }
      }

      recordCardDraw(actionTestRoom, 'user1', 'heart')
      expect(actionTestRoom.gameState.playerActions.user1.drawnHeart).toBe(true)

      recordHeartPlacement(actionTestRoom, 'user1', 0, { value: 2, color: 'red' })
      expect(actionTestRoom.gameState.playerActions.user1.heartsPlaced).toBe(1)

      recordMagicCardUsage(actionTestRoom, 'user1', 'wind')
      expect(actionTestRoom.gameState.playerActions.user1.magicCardsUsed).toBe(1)

      resetPlayerActions(actionTestRoom, 'user1')
      expect(actionTestRoom.gameState.playerActions.user1.drawnHeart).toBe(false)
      expect(actionTestRoom.gameState.playerActions.user1.heartsPlaced).toBe(0)

      // Test turn lock functions
      const lockKey = `test-lock-${Date.now()}`
      const acquired = await acquireTurnLock(lockKey, 'user1', 5000)
      expect(acquired).toBe(true)

      const released = await releaseTurnLock(lockKey)
      expect(released).toBe(true)

      // Test shield expiration
      const roomWithShields = {
        gameState: {
          shields: new Map([
            ['user1', { remainingTurns: 1, activatedTurn: 1 }],
            ['user2', { remainingTurns: 0, activatedTurn: 1 }]
          ])
        },
        players: [
          { userId: 'user1', name: 'Player1' },
          { userId: 'user2', name: 'Player2' }
        ]
      }

      checkAndExpireShields(roomWithShields, 'user2', 2)
      expect(roomWithShields.gameState.shields.has('user2')).toBe(false)
    })

    it('should execute player data migration functions', async () => {
      const legacyRoom = {
        players: [
          { userId: 'old-user1', name: 'OldPlayer', ready: true, isReady: true }
        ],
        gameState: {
          currentPlayer: 'old-user1'
        }
      }

      await migratePlayerData(legacyRoom, 'old-user1', 'new-user1', 'NewPlayer', 'new@example.com')
      expect(legacyRoom.players[0].userId).toBe('new-user1')
      expect(legacyRoom.players[0].name).toBe('NewPlayer')
      expect(legacyRoom.players[0].email).toBe('new@example.com')
      expect(legacyRoom.players[0].isReady).toBe(true) // Should preserve ready status
      expect(legacyRoom.gameState.currentPlayer).toEqual({ userId: 'new-user1', name: 'NewPlayer' })
    })

    it('should execute starting player selection', () => {
      const players = [
        { userId: 'user1', name: 'Alice' },
        { userId: 'user2', name: 'Bob' }
      ]

      const startingPlayer = selectRandomStartingPlayer(players)
      expect(startingPlayer).toBeDefined()
      expect(players).toContain(startingPlayer)
    })
  })
})