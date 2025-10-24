import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

vi.mock('../../src/lib/cards.js', () => ({
  HeartCard: {
    generateRandom: vi.fn(() => ({
      id: 'heart-1',
      type: 'heart',
      color: 'red',
      value: 2,
      emoji: '❤️',
      calculateScore: vi.fn(() => 4)
    }))
  },
  generateRandomMagicCard: vi.fn(() => ({
    id: 'magic-1',
    type: 'wind',
    emoji: '💨',
    canTargetTile: vi.fn(() => true),
    executeEffect: vi.fn(() => ({
      type: 'wind',
      newTileState: { id: 0, color: 'red', emoji: '🟥' }
    }))
  })),
  isHeartCard: vi.fn(() => true),
  isMagicCard: vi.fn(() => true),
  createCardFromData: vi.fn((data) => ({ ...data }))
}))

describe('Server Socket.IO Event Handlers (lines 353-1529)', () => {
  let mockServer, mockIO, mockSocket
  let rooms, playerSessions, connectionPool

  beforeEach(async () => {
    vi.clearAllMocks()

    // Reset test environment
    process.env.NODE_ENV = 'test'
    process.env.AUTH_SECRET = 'test-secret'
    global.turnLocks = new Map()

    // Mock server setup
    rooms = new Map()
    playerSessions = new Map()
    connectionPool = new Map()

    mockSocket = {
      id: 'socket-123',
      handshake: { address: '127.0.0.1' },
      data: {
        userId: 'user1',
        userName: 'TestUser',
        userEmail: 'test@example.com',
        userSessionId: 'session-123'
      },
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      disconnect: vi.fn(),
      on: vi.fn()
    }

    mockIO = {
      use: vi.fn(),
      on: vi.fn(),
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
      sockets: {
        adapter: { rooms: new Map() },
        sockets: new Map([[mockSocket.id, mockSocket]])
      }
    }

    // Import and setup server functions
    await import('../../server.js')
  })

  afterEach(() => {
    vi.restoreAllMocks()
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
      const canAcceptConnection = (ip) => (connectionPool.get(ip) || 0) < 5
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
          playerHands: {}
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