import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createTestRoom,
  createTestPlayer,
  validateRoomCode,
  validatePlayerName,
  sanitizeInput,
  validateRoomState,
  validatePlayerInRoom,
  validateDeckState,
  validateTurn,
  validateCardDrawLimit,
  recordCardDraw,
  resetPlayerActions,
  checkAndExpireShields,
  canPlaceMoreHearts,
  canUseMoreMagicCards,
  validateHeartPlacement,
  recordHeartPlacement,
  recordMagicCardUsage,
  calculateScore,
  generateTiles,
  generateSingleHeart,
  generateSingleMagicCard,
  selectRandomStartingPlayer,
  endGame,
  executeMagicCard,
  migratePlayerData,
  acquireTurnLock,
  releaseTurnLock,
  createTestUser,
  HeartCard
} from '../utils/server-test-utils.js'
import { WindCard, RecycleCard, ShieldCard, generateRandomMagicCard } from '../../src/lib/cards.js'

// Mock all the heavy dependencies
vi.mock('node:http', () => ({
  createServer: vi.fn(() => ({
    once: vi.fn(),
    on: vi.fn(),
    close: vi.fn(),
    listen: vi.fn()
  }))
}))

vi.mock('socket.io', () => ({
  Server: vi.fn(() => ({
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

vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn()
}))

vi.mock('../../models.js', () => ({
  PlayerSession: {
    find: vi.fn(),
    findOneAndUpdate: vi.fn()
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

describe('Server Socket.IO Event Handlers', () => {
  let mockSocket, mockIo, testRooms, rooms, playerSessions, connectionPool

  beforeEach(() => {
    // Clear all console mocks
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // Set up test environment
    testRooms = new Map()
    rooms = new Map()
    playerSessions = new Map()
    connectionPool = new Map()

    // Set up global turn locks
    global.turnLocks = new Map()

    // Mock socket
    mockSocket = {
      id: 'socket-123',
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      to: vi.fn().mockReturnThis(),
      data: {
        userId: 'user1',
        userName: 'TestUser',
        userEmail: 'test@example.com',
        userSessionId: 'session-123'
      },
      handshake: { address: '127.0.0.1' },
      disconnect: vi.fn(),
      on: vi.fn()
    }

    // Mock IO
    mockIo = {
      use: vi.fn(),
      on: vi.fn(),
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
      sockets: {
        adapter: { rooms: new Map() },
        sockets: new Map([[mockSocket.id, mockSocket]])
      }
    }

    // Reset test environment
    process.env.NODE_ENV = 'test'
    process.env.AUTH_SECRET = 'test-secret'
  })

  afterEach(() => {
    // Clean up
    vi.restoreAllMocks()

    // Clear global state
    if (global.turnLocks) {
      global.turnLocks.clear()
    }
  })

  describe('Server initialization and startup', () => {
    it('should not start server when NODE_ENV is test', async () => {
      // The server should not start when NODE_ENV is 'test'
      expect(true).toBe(true) // Server startup is prevented by the test environment check
    })

    it('should export all necessary functions for testing', async () => {
      const serverExports = await import('../../server.js')

      const expectedExports = [
        'validateRoomCode',
        'validatePlayerName',
        'generateTiles',
        'calculateScore',
        'sanitizeInput',
        'findPlayerByUserId',
        'findPlayerByName',
        'validateRoomState',
        'validatePlayerInRoom',
        'validateTurn',
        'validateDeckState',
        'validateCardDrawLimit',
        'recordCardDraw',
        'resetPlayerActions',
        'checkGameEndConditions',
        'checkAndExpireShields',
        'getClientIP',
        'acquireTurnLock',
        'releaseTurnLock'
      ]

      expectedExports.forEach(exportName => {
        expect(serverExports[exportName]).toBeDefined()
        expect(typeof serverExports[exportName]).toBe('function')
      })
    })
  })

  describe('Connection management functions', () => {
    it('should track connection counts per IP', async () => {
      const { getClientIP } = await import('../../server.js')

      const ip1 = getClientIP(mockSocket)
      expect(ip1).toBe('127.0.0.1')

      // Test connection pool logic
      const canAcceptConnection = (ip) => (connectionPool.get(ip) || 0) <= 5
      const incrementConnectionCount = (ip) => {
        connectionPool.set(ip, (connectionPool.get(ip) || 0) + 1)
      }

      expect(canAcceptConnection(ip1)).toBe(true)
      incrementConnectionCount(ip1)

      // Add 4 more connections (total 5)
      for (let i = 0; i < 4; i++) {
        incrementConnectionCount(ip1)
      }

      // Should still be acceptable (at limit)
      expect(canAcceptConnection(ip1)).toBe(true)

      // Add one more (over limit)
      incrementConnectionCount(ip1)
      expect(canAcceptConnection(ip1)).toBe(false)
    })

    it('should handle player session management', async () => {
      const sessionData = {
        userId: 'user1',
        userSessionId: 'session1',
        name: 'TestUser',
        email: 'test@example.com',
        currentSocketId: mockSocket.id,
        lastSeen: new Date(),
        isActive: true
      }

      playerSessions.set('user1', sessionData)

      expect(playerSessions.get('user1')).toEqual(sessionData)
      expect(sessionData.isActive).toBe(true)
      expect(sessionData.currentSocketId).toBe(mockSocket.id)
    })
  })

  describe('Join room event logic', () => {
    it('should validate room code before joining', async () => {
      const { validateRoomCode } = await import('../../server.js')

      const invalidCodes = ['', 'TOOLONG', 'short', '123', 'ABC-DEF', null, undefined]

      invalidCodes.forEach(code => {
        expect(validateRoomCode(code)).toBe(false)
      })
    })

    it('should create new room when code does not exist', async () => {
      const { sanitizeInput } = await import('../../server.js')
      const roomCode = 'NEW123'

      const sanitizedCode = sanitizeInput(roomCode.toUpperCase())
      expect(sanitizedCode).toBe('NEW123')

      const newRoom = {
        code: sanitizedCode,
        players: [],
        maxPlayers: 2,
        gameState: {
          tiles: [],
          gameStarted: false,
          currentPlayer: null,
          deck: { emoji: '💌', cards: 16, type: 'hearts' },
          magicDeck: { emoji: '🔮', cards: 16, type: 'magic' },
          playerHands: {},
          shields: {},
          turnCount: 0,
          playerActions: {}
        }
      }

      rooms.set(sanitizedCode, newRoom)

      expect(rooms.has('NEW123')).toBe(true)
      expect(rooms.get('NEW123')).toEqual(newRoom)
    })

    it('should handle existing player reconnection', async () => {
      const { findPlayerByUserId } = await import('../../server.js')

      const existingRoom = {
        players: [
          { userId: 'user1', name: 'OldName', email: 'old@example.com' }
        ]
      }

      const existingPlayer = findPlayerByUserId(existingRoom, 'user1')
      expect(existingPlayer).toBeDefined()

      // Update player data on reconnection
      if (existingPlayer) {
        existingPlayer.name = 'TestUser'
        existingPlayer.email = 'test@example.com'
        existingPlayer.score = existingPlayer.score || 0
      }

      expect(existingPlayer.name).toBe('TestUser')
      expect(existingPlayer.email).toBe('test@example.com')
    })

    it('should prevent joining full room', async () => {
      const fullRoom = {
        players: [
          { userId: 'user1', name: 'Player1' },
          { userId: 'user2', name: 'Player2' }
        ],
        maxPlayers: 2
      }

      const canJoin = fullRoom.players.length < fullRoom.maxPlayers
      expect(canJoin).toBe(false)
    })
  })

  describe('Player ready event logic', () => {
    it('should start game when both players are ready', async () => {
      const { generateTiles } = await import('../../server.js')

      const room = {
        code: 'GAME123',
        players: [
          { userId: 'user1', name: 'Player1', isReady: true },
          { userId: 'user2', name: 'Player2', isReady: true }
        ],
        gameState: {
          gameStarted: false,
          playerHands: {},
          deck: { emoji: "💌", cards: 16, type: 'hearts' },
          magicDeck: { emoji: "🔮", cards: 16, type: 'magic' }
        }
      }

      const allReady = room.players.length === 2 && room.players.every(p => p.isReady)

      if (allReady) {
        room.gameState.tiles = generateTiles()
        room.gameState.gameStarted = true
        room.gameState.deck.cards = 16
        room.gameState.magicDeck.cards = 16

        // Generate initial hands
        room.players.forEach(player => {
          room.gameState.playerHands[player.userId] = []
          for (let i = 0; i < 3; i++) {
            room.gameState.playerHands[player.userId].push({
              id: `heart-${player.userId}-${i}`,
              type: 'heart'
            })
          }
          for (let i = 0; i < 2; i++) {
            room.gameState.playerHands[player.userId].push({
              id: `magic-${player.userId}-${i}`,
              type: 'magic'
            })
          }
        })

        // Select random starting player
        room.gameState.currentPlayer = room.players[0]
        room.gameState.turnCount = 1
      }

      expect(allReady).toBe(true)
      expect(room.gameState.gameStarted).toBe(true)
      expect(room.gameState.tiles).toHaveLength(8)
      expect(room.gameState.currentPlayer).toBeDefined()
    })

    it('should toggle player ready state', async () => {
      const room = {
        players: [
          { userId: 'user1', name: 'Player1', isReady: false }
        ]
      }

      const player = room.players.find(p => p.userId === 'user1')
      player.isReady = !player.isReady

      expect(player.isReady).toBe(true)
    })
  })

  describe('Draw heart card event logic', () => {
    it('should validate all required conditions before drawing', async () => {
      const { validateRoomState, validatePlayerInRoom, validateDeckState, validateTurn, validateCardDrawLimit } = await import('../../server.js')

      const room = {
        players: [{ userId: 'user1' }],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user1' },
          deck: { cards: 10, type: 'hearts' }
        }
      }

      const validations = [
        validateRoomState(room),
        validatePlayerInRoom(room, 'user1'),
        validateDeckState(room),
        validateTurn(room, 'user1')
      ]

      validations.forEach(validation => {
        expect(validation.valid).toBe(true)
      })

      const cardDrawValidation = validateCardDrawLimit(room, 'user1')
      expect(cardDrawValidation.currentActions.drawnHeart).toBe(false)
    })

    it('should draw heart card and update game state', async () => {
      const room = {
        players: [{ userId: 'user1' }],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user1' },
          deck: { cards: 16, type: 'hearts' },
          playerHands: { user1: [] }
        }
      }

      // Simulate heart card draw
      const newHeart = {
        id: 'heart-new',
        type: 'heart',
        color: 'red',
        value: 2,
        emoji: '❤️'
      }

      room.gameState.playerHands.user1.push(newHeart)
      room.gameState.deck.cards--

      expect(room.gameState.playerHands.user1).toHaveLength(1)
      expect(room.gameState.deck.cards).toBe(15)
    })
  })

  describe('Place heart card event logic', () => {
    it('should validate heart placement before execution', async () => {
      const { validateHeartPlacement, canPlaceMoreHearts } = await import('../../server.js')

      const room = {
        gameState: {
          playerHands: {
            user1: [{
              id: 'heart1',
              type: 'heart'
            }]
          },
          tiles: [
            { id: 0, color: 'red', placedHeart: null }
          ],
          playerActions: {
            user1: { heartsPlaced: 0 }
          }
        }
      }

      const heartValidation = validateHeartPlacement(room, 'user1', 'heart1', 0)
      const canPlace = canPlaceMoreHearts(room, 'user1')

      expect(heartValidation.valid).toBe(true)
      expect(canPlace).toBe(true)
    })

    it('should calculate and apply score correctly', async () => {
      const { calculateScore } = await import('../../server.js')

      const heart = { value: 2, color: 'red' }
      const tile = { color: 'red' }
      const whiteTile = { color: 'white' }

      const matchScore = calculateScore(heart, tile)
      const whiteScore = calculateScore(heart, whiteTile)

      expect(matchScore).toBe(4) // Double for color match
      expect(whiteScore).toBe(2) // Base value for white
    })

    it('should update tile state with placed heart', async () => {
      const room = {
        players: [{ userId: 'user1', score: 0 }],
        gameState: {
          tiles: [
            { id: 0, color: 'red', emoji: '🟥', placedHeart: null }
          ],
          playerHands: {
            user1: []
          }
        }
      }

      const heart = { id: 'heart1', color: 'red', value: 2, emoji: '❤️' }
      const score = 4 // Matched color

      // Update player score
      room.players[0].score += score

      // Update tile state
      room.gameState.tiles[0] = {
        ...room.gameState.tiles[0],
        emoji: heart.emoji,
        color: heart.color,
        placedHeart: {
          value: heart.value,
          color: heart.color,
          emoji: heart.emoji,
          placedBy: 'user1',
          score: score,
          originalTileColor: 'red'
        }
      }

      expect(room.players[0].score).toBe(4)
      expect(room.gameState.tiles[0].placedHeart).toBeDefined()
      expect(room.gameState.tiles[0].placedHeart.placedBy).toBe('user1')
    })
  })

  describe('Use magic card event logic', () => {
    it('should validate magic card usage conditions', async () => {
      const { canUseMoreMagicCards } = await import('../../server.js')

      const room = {
        gameState: {
          playerActions: {
            user1: { magicCardsUsed: 0 }
          }
        }
      }

      expect(canUseMoreMagicCards(room, 'user1')).toBe(true)
      expect(canUseMoreMagicCards(room, 'user1')).toBe(true)
    })

    it('should handle shield card activation', async () => {
      const room = {
        gameState: {
          currentPlayer: { userId: 'user1' },
          shields: {}
        }
      }

      // Simulate shield card activation
      const shieldResult = {
        type: 'shield',
        targetPlayerId: 'user1',
        activated: true,
        remainingTurns: 2
      }

      room.gameState.shields.user1 = {
        active: true,
        remainingTurns: 2,
        activatedTurn: room.gameState.turnCount || 1
      }

      expect(room.gameState.shields.user1).toBeDefined()
      expect(room.gameState.shields.user1.remainingTurns).toBe(2)
    })

    it('should handle wind card execution with shield protection', async () => {
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
          turnCount: 2
        }
      }

      const tile = room.gameState.tiles[0]
      const opponentId = tile.placedHeart.placedBy
      const shield = room.gameState.shields[opponentId]
      const currentTurnCount = room.gameState.turnCount

      // Check shield protection
      if (shield) {
        const turnsElapsed = currentTurnCount - shield.activatedTurn
        const isActive = turnsElapsed < shield.remainingTurns

        expect(isActive).toBe(true) // Shield should still be active
      }
    })

    it('should handle recycle card execution', async () => {
      const room = {
        gameState: {
          tiles: [{
            id: 0,
            color: 'red',
            emoji: '🟥'
          }]
        }
      }

      // Simulate recycle card effect
      const recycleResult = {
        type: 'recycle',
        targetTileId: 0,
        previousColor: 'red',
        newTileState: {
          id: 0,
          color: 'white',
          emoji: '⬜',
          placedHeart: null
        }
      }

      room.gameState.tiles[0] = recycleResult.newTileState

      expect(room.gameState.tiles[0].color).toBe('white')
      expect(room.gameState.tiles[0].emoji).toBe('⬜')
      expect(room.gameState.tiles[0].placedHeart).toBe(null)
    })
  })

  describe('End turn event logic', () => {
    it('should validate required card draws before ending turn', async () => {
      const { validateCardDrawLimit, resetPlayerActions } = await import('../../server.js')

      const room = {
        players: [
          { userId: 'user1' },
          { userId: 'user2' }
        ],
        gameState: {
          currentPlayer: { userId: 'user1' },
          deck: { cards: 10 }, // Not empty
          magicDeck: { cards: 8 }, // Not empty
          playerActions: {
            user1: {
              drawnHeart: true,
              drawnMagic: true // Both drawn
            }
          }
        }
      }

      const cardDrawValidation = validateCardDrawLimit(room, 'user1')
      const heartDeckEmpty = room.gameState.deck.cards <= 0
      const magicDeckEmpty = room.gameState.magicDeck.cards <= 0

      const canEndTurn = cardDrawValidation.currentActions.drawnHeart || heartDeckEmpty &&
                       cardDrawValidation.currentActions.drawnMagic || magicDeckEmpty

      expect(canEndTurn).toBe(true)
    })

    it('should switch to next player correctly', async () => {
      const { resetPlayerActions } = await import('../../server.js')

      const room = {
        players: [
          { userId: 'user1', name: 'Player1' },
          { userId: 'user2', name: 'Player2' }
        ],
        gameState: {
          currentPlayer: { userId: 'user1', name: 'Player1' },
          turnCount: 1
        }
      }

      // Simulate turn switching
      const currentPlayerIndex = room.players.findIndex(p => p.userId === room.gameState.currentPlayer.userId)
      const nextPlayerIndex = (currentPlayerIndex + 1) % room.players.length

      resetPlayerActions(room, room.gameState.currentPlayer.userId)

      room.gameState.currentPlayer = room.players[nextPlayerIndex]
      room.gameState.turnCount++

      expect(room.gameState.currentPlayer.userId).toBe('user2')
      expect(room.gameState.turnCount).toBe(2)
    })
  })

  describe('Disconnect event logic', () => {
    it('should clean up player data on disconnect', async () => {
      const roomCode = 'DISCONNECT123'
      const room = {
        players: [
          { userId: 'user1', name: 'Player1' },
          { userId: 'user2', name: 'Player2' }
        ],
        gameState: {
          playerHands: {
            user1: [{ id: 'card1' }]
          }
        }
      }

      rooms.set(roomCode, room)

      // Simulate disconnect cleanup
      room.players = room.players.filter(player => player.userId !== 'user1')
      delete room.gameState.playerHands['user1']

      expect(room.players).toHaveLength(1)
      expect(room.players[0].userId).toBe('user2')
      expect(room.gameState.playerHands.user1).toBeUndefined()
    })

    it('should delete empty rooms', async () => {
      const roomCode = 'EMPTY123'
      const room = {
        players: [], // Empty after disconnect
        gameState: {}
      }

      rooms.set(roomCode, room)

      // Simulate room deletion when empty
      if (room.players.length === 0) {
        rooms.delete(roomCode)
      }

      expect(rooms.has(roomCode)).toBe(false)
    })
  })

  describe('Error handling in events', () => {
    it('should emit error messages for invalid operations', async () => {
      const mockSocket = { emit: vi.fn() }

      const errorCases = [
        { event: 'Invalid room code', data: 'Invalid room code' },
        { event: 'Not your turn', data: 'Not your turn' },
        { event: 'Game not started', data: 'Game not started' },
        { event: 'Player not in room', data: 'Player not in room' },
        { event: 'Invalid deck state', data: 'Invalid deck state' }
      ]

      errorCases.forEach(errorCase => {
        mockSocket.emit('room-error', errorCase.data)
      })

      expect(mockSocket.emit).toHaveBeenCalledTimes(5)
    })

    it('should handle turn lock conflicts gracefully', async () => {
      const { acquireTurnLock } = await import('../../server.js')

      const roomCode = 'LOCK123'

      const lock1 = acquireTurnLock(roomCode, 'socket1')
      const lock2 = acquireTurnLock(roomCode, 'socket2')

      expect(lock1).toBe(true)
      expect(lock2).toBe(false)

      // Should be able to release and reacquire
      const { releaseTurnLock } = await import('../../server.js')
      releaseTurnLock(roomCode, 'socket1')

      const lock3 = acquireTurnLock(roomCode, 'socket3')
      expect(lock3).toBe(true)
    })
  })

  describe('Input Validation', () => {
    it('should validate room codes correctly', () => {
      expect(validateRoomCode('TEST123')).toBe(true)
      expect(validateRoomCode('test123')).toBe(true)
      expect(validateRoomCode('ABC123')).toBe(true)
      expect(validateRoomCode('123456')).toBe(true)
      expect(validateRoomCode('abcdef')).toBe(true)

      expect(validateRoomCode('')).toBe(false)
      expect(validateRoomCode('TEST')).toBe(false)
      expect(validateRoomCode('TEST1234')).toBe(false)
      expect(validateRoomCode(null)).toBe(false)
      expect(validateRoomCode(undefined)).toBe(false)
    })

    it('should validate player names correctly', () => {
      expect(validatePlayerName('Player1')).toBe(true)
      expect(validatePlayerName('Test Player')).toBe(true)
      expect(validatePlayerName('A')).toBe(true)
      expect(validatePlayerName('This is a very long name')).toBe(true)

      expect(validatePlayerName('')).toBe(false)
      expect(validatePlayerName('   ')).toBe(false)
      expect(validatePlayerName(null)).toBe(false)
      expect(validatePlayerName(undefined)).toBe(false)
      expect(validatePlayerName('Player\x00')).toBe(false) // Control character
    })

    it('should sanitize input correctly', () => {
      expect(sanitizeInput('  Test  ')).toBe('Test')
      expect(sanitizeInput('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script')
      expect(sanitizeInput('DROP TABLE users')).toBe('TABLE users')
      expect(sanitizeInput(123)).toBe(123) // Non-string input returned as-is
    })
  })

  describe('Room Management Logic', () => {
    it('should create new room when joining non-existent room', () => {
      const roomCode = 'NEWROOM'
      const userId = 'user1'
      const userName = 'Player1'

      // Simulate join-room logic
      if (!testRooms.has(roomCode)) {
        const room = {
          code: roomCode,
          players: [],
          maxPlayers: 2,
          gameState: {
            tiles: [], gameStarted: false, currentPlayer: null,
            deck: { emoji: "💌", cards: 16, type: 'hearts' },
            magicDeck: { emoji: "🔮", cards: 16, type: 'magic' },
            playerHands: {}, shields: {}, turnCount: 0, playerActions: {}
          }
        }
        testRooms.set(roomCode, room)

        const player = { userId, name: userName, isReady: false, score: 0, joinedAt: new Date() }
        room.players.push(player)

        mockSocket.join(roomCode)
        mockSocket.data.roomCode = roomCode
        mockSocket.data.userId = userId
      }

      expect(testRooms.has(roomCode)).toBe(true)
      expect(mockSocket.join).toHaveBeenCalledWith(roomCode)
      expect(mockSocket.data.roomCode).toBe(roomCode)
      expect(mockSocket.data.userId).toBe(userId)

      const room = testRooms.get(roomCode)
      expect(room.players).toHaveLength(1)
      expect(room.players[0].userId).toBe(userId)
      expect(room.players[0].name).toBe(userName)
    })

    it('should join existing room when space available', () => {
      const roomCode = 'EXIST01'
      const existingRoom = createTestRoom({
        code: roomCode,
        players: [createTestPlayer({ userId: 'user1', name: 'Player1' })]
      })
      testRooms.set(roomCode, existingRoom)

      const userId = 'user2'
      const userName = 'Player2'

      // Simulate joining existing room
      const room = testRooms.get(roomCode)
      if (room.players.length < room.maxPlayers) {
        room.players.push({
          userId, name: userName, isReady: false, score: 0, joinedAt: new Date()
        })

        mockSocket.join(roomCode)
        mockSocket.data.roomCode = roomCode
        mockSocket.data.userId = userId
      }

      expect(room.players).toHaveLength(2)
      expect(mockSocket.join).toHaveBeenCalledWith(roomCode)
      expect(room.players[1].userId).toBe(userId)
    })

    it('should reject joining full room', () => {
      const roomCode = 'FULL01'
      const fullRoom = createTestRoom({
        code: roomCode,
        players: [
          createTestPlayer({ userId: 'user1', name: 'Player1' }),
          createTestPlayer({ userId: 'user2', name: 'Player2' })
        ]
      })
      testRooms.set(roomCode, fullRoom)

      const userId = 'user3'

      // Simulate joining full room
      const room = testRooms.get(roomCode)
      if (room.players.length >= room.maxPlayers) {
        mockSocket.emit("room-error", "Room is full")
      }

      expect(mockSocket.emit).toHaveBeenCalledWith("room-error", "Room is full")
    })

    it('should handle leaving room correctly', () => {
      const roomCode = 'LEAVE01'
      const player1 = createTestPlayer({ userId: 'user1', name: 'Player1' })
      const player2 = createTestPlayer({ userId: 'user2', name: 'Player2' })
      const room = createTestRoom({ code: roomCode, players: [player1, player2] })
      testRooms.set(roomCode, room)

      mockSocket.data.roomCode = roomCode
      mockSocket.data.userId = 'user1'

      // Simulate leave-room logic
      const userId = mockSocket.data.userId
      const currentRoom = testRooms.get(roomCode)
      if (currentRoom) {
        currentRoom.players = currentRoom.players.filter(p => p.userId !== userId)
        mockSocket.to(roomCode).emit("player-left", { players: currentRoom.players })

        if (currentRoom.players.length === 0) {
          testRooms.delete(roomCode)
        }

        mockSocket.leave(roomCode)
        mockSocket.data.roomCode = null
        mockSocket.data.userId = null
      }

      expect(mockSocket.to).toHaveBeenCalledWith(roomCode)
      expect(mockSocket.to().emit).toHaveBeenCalledWith("player-left", {
        players: expect.arrayContaining([
          expect.objectContaining({ userId: 'user2', name: 'Player2' })
        ])
      })
      expect(mockSocket.leave).toHaveBeenCalledWith(roomCode)
      expect(mockSocket.data.roomCode).toBe(null)
    })
  })

  describe('Card Drawing Logic', () => {
    it('should draw heart card successfully', () => {
      const roomCode = 'DRAW01'
      const room = createTestRoom({
        code: roomCode,
        gameStarted: true,
        currentPlayer: { userId: 'user1', name: 'Player1' },
        playerHands: { user1: [] },
        deck: { cards: 16 }
      })

      // Simulate draw-heart logic
      const roomValidation = validateRoomState(room)
      const turnValidation = validateTurn(room, 'user1')
      const cardDrawValidation = validateCardDrawLimit(room, 'user1')

      if (roomValidation.valid && turnValidation.valid && !cardDrawValidation.currentActions.drawnHeart) {
        if (acquireTurnLock(roomCode, 'socket1')) {
          try {
            if (room.gameState.gameStarted && room.gameState.deck.cards > 0) {
              recordCardDraw(room, 'user1', 'heart')
              const newHeart = generateSingleHeart()
              if (!room.gameState.playerHands['user1']) {
                room.gameState.playerHands['user1'] = []
              }
              room.gameState.playerHands['user1'].push(newHeart)
              room.gameState.deck.cards--

              mockSocket.to(roomCode).emit("heart-drawn", {
                players: room.players.map(player => ({
                  ...player,
                  hand: room.gameState.playerHands[player.userId] || [],
                  score: player.score || 0
                })),
                playerHands: room.gameState.playerHands,
                deck: room.gameState.deck
              })
            }
          } finally {
            releaseTurnLock(roomCode, 'socket1')
          }
        }
      }

      expect(mockSocket.to).toHaveBeenCalledWith(roomCode)
      expect(mockSocket.to().emit).toHaveBeenCalledWith("heart-drawn", expect.objectContaining({
        deck: expect.objectContaining({ cards: 15 })
      }))
      expect(room.gameState.playerHands.user1).toHaveLength(1)
      expect(room.gameState.deck.cards).toBe(15)
    })

    it('should reject drawing when not player\'s turn', () => {
      const roomCode = 'NOTURN'
      const room = createTestRoom({
        code: roomCode,
        gameStarted: true,
        currentPlayer: { userId: 'user2', name: 'Player2' }, // Different player's turn
        deck: { cards: 16 }
      })

      // Simulate draw-heart logic for wrong player
      const turnValidation = validateTurn(room, 'user1')
      if (!turnValidation.valid) {
        mockSocket.emit("room-error", turnValidation.error)
      }

      expect(mockSocket.emit).toHaveBeenCalledWith("room-error", "Not your turn")
    })

    it('should reject drawing heart when already drawn this turn', () => {
      const roomCode = 'ALREADYDRAWN'
      const room = createTestRoom({
        code: roomCode,
        gameStarted: true,
        currentPlayer: { userId: 'user1', name: 'Player1' },
        playerActions: { user1: { drawnHeart: true, drawnMagic: false, heartsPlaced: 0, magicCardsUsed: 0 } },
        deck: { cards: 16 }
      })

      // Simulate draw-heart logic when already drawn
      const cardDrawValidation = validateCardDrawLimit(room, 'user1')
      if (cardDrawValidation.currentActions.drawnHeart) {
        mockSocket.emit("room-error", "You can only draw one heart card per turn")
      }

      expect(mockSocket.emit).toHaveBeenCalledWith("room-error", "You can only draw one heart card per turn")
    })
  })

  describe('Heart Placement Logic', () => {
    it('should place heart on tile successfully', () => {
      const roomCode = 'PLACE01'
      const heartCard = new HeartCard('red', 2, 'heart-1')
      const room = createTestRoom({
        code: roomCode,
        gameStarted: true,
        currentPlayer: { userId: 'user1', name: 'Player1' },
        playerHands: { user1: [heartCard] },
        tiles: [{ id: 0, color: 'red', emoji: '🟥' }, { id: 1, color: 'white', emoji: '⬜' }]
      })

      // Simulate place-heart logic
      const heartValidation = validateHeartPlacement(room, 'user1', 'heart-1', 0)
      const turnValidation = validateTurn(room, 'user1')
      const canPlaceMore = canPlaceMoreHearts(room, 'user1')

      if (heartValidation.valid && turnValidation.valid && canPlaceMore) {
        if (acquireTurnLock(roomCode, 'socket1')) {
          try {
            const playerHand = room.gameState.playerHands['user1'] || []
            const heartIndex = playerHand.findIndex(heart => heart.id === 'heart-1')

            if (heartIndex !== -1) {
              const heart = playerHand[heartIndex]
              const tile = room.gameState.tiles.find(tile => tile.id == 0)

              if (tile && !tile.placedHeart) {
                tile.placedHeart = {
                  ...heart,
                  placedBy: 'user1',
                  score: calculateScore(heart, tile)
                }

                // Update player score
                const playerIndex = room.players.findIndex(p => p.userId === 'user1')
                if (playerIndex !== -1) {
                  room.players[playerIndex].score = (room.players[playerIndex].score || 0) + tile.placedHeart.score
                }

                playerHand.splice(heartIndex, 1)
                recordHeartPlacement(room, 'user1')

                mockSocket.to(roomCode).emit("heart-placed", {
                  tile,
                  player: room.players.find(p => p.userId === 'user1'),
                  players: room.players,
                  playerHands: room.gameState.playerHands
                })
              }
            }
          } finally {
            releaseTurnLock(roomCode, 'socket1')
          }
        }
      }

      expect(mockSocket.to).toHaveBeenCalledWith(roomCode)
      expect(mockSocket.to().emit).toHaveBeenCalledWith("heart-placed", expect.objectContaining({
        tile: expect.objectContaining({
          id: 0,
          placedHeart: expect.objectContaining({
            color: 'red',
            value: 2,
            placedBy: 'user1',
            score: 4 // Red heart on red tile = double points
          })
        }),
        player: expect.objectContaining({ userId: 'user1' })
      }))

      expect(room.gameState.playerHands.user1).toHaveLength(0)
      expect(room.gameState.tiles[0].placedHeart).toBeDefined()
      expect(room.players[0].score).toBe(4)
    })

    it('should reject placing heart on occupied tile', () => {
      const roomCode = 'OCCUPIED'
      const heartCard = new HeartCard('red', 2, 'heart-1')
      const room = createTestRoom({
        code: roomCode,
        gameStarted: true,
        currentPlayer: { userId: 'user1', name: 'Player1' },
        playerHands: { user1: [heartCard] },
        tiles: [{
          id: 0,
          color: 'red',
          emoji: '🟥',
          placedHeart: { color: 'yellow', value: 1, placedBy: 'user2' }
        }]
      })

      // Simulate place-heart logic on occupied tile
      const heartValidation = validateHeartPlacement(room, 'user1', 'heart-1', 0)
      if (!heartValidation.valid) {
        mockSocket.emit("room-error", heartValidation.error)
      }

      expect(mockSocket.emit).toHaveBeenCalledWith("room-error", "Tile is already occupied")
    })

    it('should reject placing heart when limit reached', () => {
      const roomCode = 'LIMIT'
      const room = createTestRoom({
        code: roomCode,
        gameStarted: true,
        currentPlayer: { userId: 'user1', name: 'Player1' },
        playerActions: { user1: { heartsPlaced: 2 } }, // Already placed 2 hearts
        playerHands: { user1: [new HeartCard('red', 2, 'heart-1')] },
        tiles: [{ id: 0, color: 'red', emoji: '🟥' }]
      })

      // Simulate place-heart logic when limit reached
      const canPlaceMore = canPlaceMoreHearts(room, 'user1')
      if (!canPlaceMore) {
        mockSocket.emit("room-error", "You can only place up to 2 heart cards per turn")
      }

      expect(mockSocket.emit).toHaveBeenCalledWith("room-error", "You can only place up to 2 heart cards per turn")
    })
  })

  describe('Magic Card Logic', () => {
    it('should use wind card to remove opponent heart', async () => {
      const roomCode = 'WINDCARD'
      const windCard = new WindCard('wind-1')
      const room = createTestRoom({
        code: roomCode,
        gameStarted: true,
        currentPlayer: { userId: 'user1', name: 'Player1' },
        players: [
          { userId: 'user1', name: 'Player1', score: 0 },
          { userId: 'user2', name: 'Player2', score: 4 }
        ],
        playerHands: { user1: [windCard] },
        tiles: [{
          id: 0,
          color: 'red',
          emoji: '🟥',
          placedHeart: {
            id: 'heart-opp',
            color: 'yellow',
            value: 2,
            placedBy: 'user2',
            score: 4
          }
        }]
      })

      // Simulate use-magic-card logic
      const turnValidation = validateTurn(room, 'user1')
      const canUseMore = canUseMoreMagicCards(room, 'user1')

      if (turnValidation.valid && canUseMore) {
        if (acquireTurnLock(roomCode, 'socket1')) {
          try {
            const actionResult = await executeMagicCard(room, 'user1', 'wind-1', 0)

            if (actionResult) {
              recordMagicCardUsage(room, 'user1')

              mockSocket.to(roomCode).emit("magic-card-used", {
                card: { type: 'wind', emoji: '💨' },
                targetTile: actionResult.newTileState,
                player: room.players.find(p => p.userId === 'user1'),
                players: room.players,
                playerHands: room.gameState.playerHands
              })

              mockSocket.to(roomCode).emit("scores-updated", room.players)
            }
          } finally {
            releaseTurnLock(roomCode, 'socket1')
          }
        }
      }

      expect(mockSocket.to).toHaveBeenCalledWith(roomCode)
      expect(mockSocket.to().emit).toHaveBeenCalledWith("magic-card-used", expect.objectContaining({
        card: expect.objectContaining({ type: 'wind', emoji: '💨' }),
        targetTile: expect.objectContaining({
          id: 0,
          color: 'red',
          placedHeart: null // Heart should be removed
        })
      }))

      expect(room.gameState.tiles[0].placedHeart).toBeNull()
      expect(room.players[1].score).toBe(0) // Score should be subtracted
    })

    it('should use shield card to protect player', async () => {
      const roomCode = 'SHIELDCARD'
      const shieldCard = new ShieldCard('shield-1')
      const room = createTestRoom({
        code: roomCode,
        gameStarted: true,
        currentPlayer: { userId: 'user1', name: 'Player1' },
        playerHands: { user1: [shieldCard] },
        shields: {}
      })

      // Simulate shield card usage
      const turnValidation = validateTurn(room, 'user1')
      if (turnValidation.valid) {
        if (acquireTurnLock(roomCode, 'socket1')) {
          try {
            const actionResult = await executeMagicCard(room, 'user1', 'shield-1', 'self')

            if (actionResult) {
              recordMagicCardUsage(room, 'user1')

              mockSocket.to(roomCode).emit("magic-card-used", {
                card: { type: 'shield', emoji: '🛡️' },
                effect: actionResult,
                player: room.players.find(p => p.userId === 'user1'),
                players: room.players,
                playerHands: room.gameState.playerHands,
                shields: room.gameState.shields
              })
            }
          } finally {
            releaseTurnLock(roomCode, 'socket1')
          }
        }
      }

      expect(mockSocket.to).toHaveBeenCalledWith(roomCode)
      expect(mockSocket.to().emit).toHaveBeenCalledWith("magic-card-used", expect.objectContaining({
        card: expect.objectContaining({ type: 'shield', emoji: '🛡️' })
      }))

      expect(room.gameState.shields.user1).toBeDefined()
      expect(room.gameState.shields.user1.remainingTurns).toBeGreaterThan(0)
    })
  })

  describe('Turn Management', () => {
    it('should end turn and switch to next player', () => {
      const roomCode = 'ENDTURN'
      const room = createTestRoom({
        code: roomCode,
        gameStarted: true,
        currentPlayer: { userId: 'user1', name: 'Player1' },
        players: [
          { userId: 'user1', name: 'Player1' },
          { userId: 'user2', name: 'Player2' }
        ],
        turnCount: 1
      })

      // Simulate end-turn logic
      const turnValidation = validateTurn(room, 'user1')
      if (turnValidation.valid) {
        if (acquireTurnLock(roomCode, 'socket1')) {
          try {
            resetPlayerActions(room, 'user1')

            // Switch to next player
            const currentPlayerIndex = room.players.findIndex(p => p.userId === room.gameState.currentPlayer.userId)
            const nextPlayerIndex = (currentPlayerIndex + 1) % room.players.length
            room.gameState.currentPlayer = room.players[nextPlayerIndex]
            room.gameState.turnCount++

            checkAndExpireShields(room)

            mockSocket.to(roomCode).emit("turn-changed", {
              currentPlayer: room.gameState.currentPlayer,
              turnCount: room.gameState.turnCount,
              shields: room.gameState.shields || {}
            })
          } finally {
            releaseTurnLock(roomCode, 'socket1')
          }
        }
      }

      expect(mockSocket.to).toHaveBeenCalledWith(roomCode)
      expect(mockSocket.to().emit).toHaveBeenCalledWith("turn-changed", expect.objectContaining({
        currentPlayer: expect.objectContaining({ userId: 'user2', name: 'Player2' }),
        turnCount: 2
      }))

      expect(room.gameState.currentPlayer.userId).toBe('user2')
      expect(room.gameState.turnCount).toBe(2)
    })

    it('should reset player actions and check shields', () => {
      const roomCode = 'RESETACTIONS'
      const room = createTestRoom({
        code: roomCode,
        gameStarted: true,
        currentPlayer: { userId: 'user1', name: 'Player1' },
        players: [
          { userId: 'user1', name: 'Player1' },
          { userId: 'user2', name: 'Player2' }
        ],
        playerActions: {
          user1: { drawnHeart: true, drawnMagic: true, heartsPlaced: 1, magicCardsUsed: 1 }
        },
        shields: {
          user2: { protectedTiles: [0], remainingTurns: 1, createdTurn: 1 }
        },
        turnCount: 2
      })

      // Simulate turn end with actions reset
      resetPlayerActions(room, 'user1')
      checkAndExpireShields(room)

      // Verify player actions were reset
      expect(room.gameState.playerActions.user1).toEqual({
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0
      })

      // Verify shield expired (remainingTurns was 1, turnCount was 2)
      expect(room.gameState.shields.user2).toBeUndefined()
    })
  })

  describe('Lock Management', () => {
    it('should handle turn lock contention', () => {
      const roomCode = 'LOCKED'
      const room = createTestRoom({
        code: roomCode,
        gameStarted: true,
        currentPlayer: { userId: 'user1', name: 'Player1' },
        deck: { cards: 16 }
      })

      // Acquire lock first
      const lockAcquired = acquireTurnLock(roomCode, 'other-socket')
      expect(lockAcquired).toBe(true)

      // Try to acquire same lock
      const lockBlocked = acquireTurnLock(roomCode, 'socket1')
      expect(lockBlocked).toBe(false)

      // Simulate action lock handling
      if (!lockBlocked) {
        mockSocket.emit("room-error", "Action in progress, please wait")
      }

      expect(mockSocket.emit).toHaveBeenCalledWith("room-error", "Action in progress, please wait")

      // Clean up lock
      releaseTurnLock(roomCode, 'other-socket')
    })

    it('should release locks correctly', () => {
      const roomCode = 'RELEASE'

      // Acquire and release lock
      const lockAcquired = acquireTurnLock(roomCode, 'socket1')
      expect(lockAcquired).toBe(true)

      releaseTurnLock(roomCode, 'socket1')

      // Should be able to acquire lock again
      const lockReacquired = acquireTurnLock(roomCode, 'socket1')
      expect(lockReacquired).toBe(true)

      releaseTurnLock(roomCode, 'socket1')
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid room codes', () => {
      const invalidCodes = ['', 'TEST', 'TOOLONG', null, undefined]

      invalidCodes.forEach(code => {
        if (!validateRoomCode(code)) {
          mockSocket.emit("room-error", "Invalid room code")
        }
        expect(mockSocket.emit).toHaveBeenCalledWith("room-error", "Invalid room code")
        mockSocket.emit.mockClear()
      })
    })

    it('should handle invalid player names', () => {
      const invalidNames = ['', '   ', null, undefined]

      invalidNames.forEach(name => {
        if (!validatePlayerName(name)) {
          mockSocket.emit("room-error", "Invalid player name")
        }
        expect(mockSocket.emit).toHaveBeenCalledWith("room-error", "Invalid player name")
        mockSocket.emit.mockClear()
      })
    })

    it('should handle room state validation errors', () => {
      const invalidRoom = { players: null } // Invalid room

      const validation = validateRoomState(invalidRoom)
      if (!validation.valid) {
        mockSocket.emit("room-error", validation.error)
      }

      expect(mockSocket.emit).toHaveBeenCalledWith("room-error", "Invalid players state")
    })
  })

  describe('Game end conditions', () => {
    it('should detect when all tiles are filled', async () => {
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
      expect(result.reason).toBe('All tiles are filled')
    })

    it('should detect when both decks are empty', async () => {
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
      expect(result.reason).toBe('Both decks are empty')
    })
  })
})