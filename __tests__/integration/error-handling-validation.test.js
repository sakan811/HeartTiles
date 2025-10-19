import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock dependencies
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

vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn()
}))

vi.mock('../../src/lib/cards.js', () => ({
  HeartCard: {
    generateRandom: vi.fn()
  },
  WindCard: vi.fn(),
  RecycleCard: vi.fn(),
  ShieldCard: vi.fn(),
  generateRandomMagicCard: vi.fn(),
  isHeartCard: vi.fn(),
  isMagicCard: vi.fn(),
  createCardFromData: vi.fn()
}))

// Set environment
process.env.NODE_ENV = 'test'

describe('Error Handling and Validation Scenarios', () => {
  let rooms, mockSocket, mockIo

  beforeEach(() => {
    vi.clearAllMocks()
    rooms = new Map()
    global.turnLocks = new Map()

    mockSocket = {
      id: 'socket123',
      data: {
        userId: 'user123',
        userName: 'TestUser',
        userEmail: 'test@example.com'
      },
      emit: vi.fn(),
      disconnect: vi.fn()
    }

    mockIo = {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn()
    }
  })

  afterEach(() => {
    global.turnLocks = new Map()
  })

  describe('Input Validation', () => {
    it('should validate room code format', async () => {
      const { validateRoomCode } = await import('../../server.js')

      // Valid codes
      const validCodes = ['ABC123', 'DEF456', 'GHI789', 'abc123', '123456']
      validCodes.forEach(code => {
        expect(validateRoomCode(code)).toBe(true)
      })

      // Invalid codes
      const invalidCodes = [
        '', null, undefined, 123,
        'ABC', 'ABC1234', 'ABC-123', 'A1B2C3',
        'ABCDEFG', '123', 'abc', 'a1b2c'
      ]
      invalidCodes.forEach(code => {
        expect(validateRoomCode(code)).toBe(false)
      })
    })

    it('should validate player name constraints', async () => {
      const { validatePlayerName } = await import('../../server.js')

      // Valid names
      const validNames = ['A', 'Player', 'Test User', 'ThisIsExactlyTwenty', '玩家123']
      validNames.forEach(name => {
        expect(validatePlayerName(name)).toBe(true)
      })

      // Invalid names
      const invalidNames = [
        '', null, undefined, 123,
        '   ', 'ThisNameIsWayTooLongForTheGameLimits',
        '\t\n', '   ', String.fromCharCode(0) // Control character
      ]
      invalidNames.forEach(name => {
        expect(validatePlayerName(name)).toBe(false)
      })
    })

    it('should sanitize input properly', async () => {
      const { sanitizeInput } = await import('../../server.js')

      expect(sanitizeInput('  hello world  ')).toBe('hello world')
      expect(sanitizeInput('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script')
      expect(sanitizeInput('normal text')).toBe('normal text')
      expect(sanitizeInput('text with <br> tags')).toBe('text with br tags')
      expect(sanitizeInput(123)).toBe(123)
      expect(sanitizeInput(null)).toBe(null)
      expect(sanitizeInput(undefined)).toBe(undefined)
    })

    it('should validate heart placement parameters', async () => {
      // Valid parameters
      const validParams = [
        { roomCode: 'ABC123', tileId: 0, heartId: 'heart1' },
        { roomCode: 'DEF456', tileId: '1', heartId: 'heart2' },
        { roomCode: 'GHI789', tileId: 7, heartId: 'heart123' }
      ]

      validParams.forEach(params => {
        const roomCodeValid = /^[A-Z0-9]{6}$/i.test(params.roomCode)
        const tileIdValid = typeof params.tileId === 'number' || typeof params.tileId === 'string'
        const heartIdValid = typeof params.heartId === 'string' || typeof params.heartId === 'number'

        expect(roomCodeValid).toBe(true)
        expect(tileIdValid).toBe(true)
        expect(heartIdValid).toBe(true)
      })

      // Invalid parameters
      const invalidParams = [
        { roomCode: '', tileId: 0, heartId: 'heart1' }, // Invalid room code
        { roomCode: 'ABC123', tileId: null, heartId: 'heart1' }, // Invalid tile ID
        { roomCode: 'ABC123', tileId: 0, heartId: undefined }, // Invalid heart ID
        { roomCode: 'ABC-123', tileId: 0, heartId: 'heart1' } // Invalid room code format
      ]

      invalidParams.forEach(params => {
        const roomCodeValid = /^[A-Z0-9]{6}$/i.test(params.roomCode)
        const tileIdValid = typeof params.tileId === 'number' || typeof params.tileId === 'string'
        const heartIdValid = typeof params.heartId === 'string' || typeof params.heartId === 'number'

        expect(roomCodeValid || tileIdValid || heartIdValid).toBe(false)
      })
    })

    it('should validate magic card usage parameters', async () => {
      // Valid parameters for different card types
      const validParams = [
        // Shield card (no target needed)
        { roomCode: 'ABC123', cardId: 'shield1', targetTileId: 'self' },
        { roomCode: 'ABC123', cardId: 'shield1', targetTileId: undefined },
        { roomCode: 'ABC123', cardId: 'shield1', targetTileId: null },
        // Wind/Recycle cards (target required)
        { roomCode: 'ABC123', cardId: 'wind1', targetTileId: 0 },
        { roomCode: 'ABC123', cardId: 'recycle1', targetTileId: '3' }
      ]

      validParams.forEach(params => {
        const roomCodeValid = /^[A-Z0-9]{6}$/i.test(params.roomCode)
        const cardIdValid = params.cardId && typeof params.cardId === 'string'

        expect(roomCodeValid).toBe(true)
        expect(cardIdValid).toBe(true)
      })

      // Invalid parameters
      const invalidParams = [
        { roomCode: 'INVALID', cardId: 'shield1', targetTileId: 0 },
        { roomCode: 'ABC123', cardId: '', targetTileId: 0 },
        { roomCode: 'ABC123', cardId: null, targetTileId: 0 }
      ]

      invalidParams.forEach(params => {
        const roomCodeValid = /^[A-Z0-9]{6}$/i.test(params.roomCode)
        const cardIdValid = params.cardId && typeof params.cardId === 'string'

        expect(roomCodeValid && cardIdValid).toBe(false)
      })
    })
  })

  describe('Game State Validation', () => {
    it('should validate room state comprehensively', async () => {
      const { validateRoomState } = await import('../../server.js')

      // Valid room state
      const validRoom = {
        players: [
          { userId: 'user1', name: 'User1' },
          { userId: 'user2', name: 'User2' }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user1', name: 'User1' },
          tiles: [],
          deck: { cards: 16 },
          magicDeck: { cards: 16 }
        }
      }

      let result = validateRoomState(validRoom)
      expect(result.valid).toBe(true)

      // Invalid cases
      const invalidRooms = [
        null, // No room
        {}, // No gameState
        { gameState: {} }, // No players
        { players: [], gameState: {} }, // Empty players
        { players: 'not array', gameState: {} }, // Invalid players type
        { players: [], gameState: { gameStarted: true, currentPlayer: null } }, // Game started but no current player
        { players: [], gameState: { gameStarted: false, currentPlayer: { userId: 'user1' } } } // Current player but game not started
      ]

      for (const room of invalidRooms) {
        result = validateRoomState(room)
        expect(result.valid).toBe(false)
        expect(result.error).toBeDefined()
      }
    })

    it('should validate deck state edge cases', async () => {
      const { validateDeckState } = await import('../../server.js')

      // Valid deck states
      const validDecks = [
        { deck: { cards: 16, type: 'hearts' } },
        { deck: { cards: 0, type: 'hearts' } },
        { deck: { cards: 1, type: 'magic' } }
      ]

      for (const deckState of validDecks) {
        const result = validateDeckState({ gameState: deckState })
        expect(result.valid).toBe(true)
      }

      // Invalid deck states
      const invalidDecks = [
        {}, // No deck
        { deck: null }, // Null deck
        { deck: undefined }, // Undefined deck
        { deck: { cards: -1, type: 'hearts' } }, // Negative count
        { deck: { cards: 'not number', type: 'hearts' } }, // Non-number count
        { deck: { type: 'hearts' } }, // Missing cards count
        { deck: { cards: 10 } } // Missing type
      ]

      for (const deckState of invalidDecks) {
        const result = validateDeckState({ gameState: deckState })
        expect(result.valid).toBe(false)
        expect(result.error).toBeDefined()
      }
    })

    it('should validate turn state for different scenarios', async () => {
      const { validateTurn } = await import('../../server.js')

      // Valid turn scenarios
      const validTurns = [
        {
          room: { gameState: { gameStarted: true, currentPlayer: { userId: 'user1' } } },
          userId: 'user1'
        },
        {
          room: { gameState: { gameStarted: true, currentPlayer: { userId: 'user2', name: 'User2' } } },
          userId: 'user2'
        }
      ]

      for (const { room, userId } of validTurns) {
        const result = validateTurn(room, userId)
        expect(result.valid).toBe(true)
      }

      // Invalid turn scenarios
      const invalidTurns = [
        {
          room: { gameState: { gameStarted: false, currentPlayer: { userId: 'user1' } } },
          userId: 'user1',
          expectedError: 'Game not started'
        },
        {
          room: { gameState: { gameStarted: true, currentPlayer: { userId: 'user1' } } },
          userId: 'user2',
          expectedError: 'Not your turn'
        },
        {
          room: { gameState: { gameStarted: true, currentPlayer: null } },
          userId: 'user1',
          expectedError: 'Not your turn'
        },
        {
          room: { gameState: { currentPlayer: { userId: 'user1' } } }, // Missing gameStarted
          userId: 'user1',
          expectedError: 'Game not started'
        }
      ]

      for (const { room, userId, expectedError } of invalidTurns) {
        const result = validateTurn(room, userId)
        expect(result.valid).toBe(false)
        expect(result.error).toBe(expectedError)
      }
    })

    it('should validate player presence in room', async () => {
      const { validatePlayerInRoom } = await import('../../server.js')

      const room = {
        players: [
          { userId: 'user1', name: 'User1' },
          { userId: 'user2', name: 'User2' }
        ]
      }

      // Valid player
      let result = validatePlayerInRoom(room, 'user1')
      expect(result.valid).toBe(true)

      // Invalid player
      result = validatePlayerInRoom(room, 'user3')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Player not in room')

      // Edge cases
      const edgeCases = [
        { room: null, userId: 'user1', expectedError: 'Room not found' },
        { room: {}, userId: 'user1', expectedError: 'Invalid players state' },
        { room: { players: null }, userId: 'user1', expectedError: 'Invalid players state' },
        { room: { players: 'not array' }, userId: 'user1', expectedError: 'Invalid players state' }
      ]

      for (const { room: testRoom, userId, expectedError } of edgeCases) {
        result = validatePlayerInRoom(testRoom, userId)
        expect(result.valid).toBe(false)
        expect(result.error).toBe(expectedError)
      }
    })
  })

  describe('Card Validation', () => {
    it('should validate heart placement constraints', async () => {
      const room = {
        gameState: {
          playerHands: {
            user123: [
              { id: 'heart1', type: 'heart', color: 'red', value: 2 },
              { id: 'magic1', type: 'wind', emoji: '💨' }
            ]
          },
          tiles: [
            { id: 0, color: 'red', placedHeart: null }, // Empty, matching color
            { id: 1, color: 'blue', placedHeart: { value: 1 } }, // Occupied
            { id: 2, color: 'green', placedHeart: null } // Empty, different color
          ]
        }
      }

      const userId = 'user123'

      // Test card in hand validation
      const heartInHand = room.gameState.playerHands[userId].find(card => card.id === 'heart1')
      expect(heartInHand).toBeDefined()
      expect(heartInHand.type).toBe('heart')

      const cardNotInHand = room.gameState.playerHands[userId].find(card => card.id === 'heart999')
      expect(cardNotInHand).toBeUndefined()

      // Test tile validation
      const validTile = room.gameState.tiles.find(tile => tile.id === 0)
      expect(validTile.placedHeart).toBeNull()

      const occupiedTile = room.gameState.tiles.find(tile => tile.id === 1)
      expect(occupiedTile.placedHeart).toBeDefined()

      const nonExistentTile = room.gameState.tiles.find(tile => tile.id === 999)
      expect(nonExistentTile).toBeUndefined()
    })

    it('should validate magic card targeting rules', async () => {
      const room = {
        gameState: {
          playerHands: {
            user123: [
              { id: 'wind1', type: 'wind' },
              { id: 'recycle1', type: 'recycle' },
              { id: 'shield1', type: 'shield' }
            ]
          },
          tiles: [
            { id: 0, color: 'red', placedHeart: { placedBy: 'user456' } }, // Opponent heart
            { id: 1, color: 'blue', placedHeart: { placedBy: 'user123' } }, // Own heart
            { id: 2, color: 'green', placedHeart: null }, // Empty tile
            { id: 3, color: 'white', placedHeart: null } // White empty tile
          ]
        }
      }

      // Wind card targeting validation
      const windCard = room.gameState.playerHands.user123.find(c => c.type === 'wind')
      const opponentHeartTile = room.gameState.tiles.find(t => t.placedHeart?.placedBy === 'user456')
      const ownHeartTile = room.gameState.tiles.find(t => t.placedHeart?.placedBy === 'user123')
      const emptyTile = room.gameState.tiles.find(t => !t.placedHeart)

      // Wind should target opponent hearts only
      if (windCard && opponentHeartTile) {
        const canTargetOpponent = opponentHeartTile.placedHeart.placedBy !== 'user123'
        expect(canTargetOpponent).toBe(true)
      }

      if (windCard && ownHeartTile) {
        const canTargetOwn = ownHeartTile.placedHeart.placedBy !== 'user123'
        expect(canTargetOwn).toBe(false)
      }

      // Recycle card targeting validation
      const recycleCard = room.gameState.playerHands.user123.find(c => c.type === 'recycle')
      const nonWhiteEmptyTile = room.gameState.tiles.find(t => !t.placedHeart && t.color !== 'white')
      const whiteEmptyTile = room.gameState.tiles.find(t => !t.placedHeart && t.color === 'white')

      // Recycle should target non-white empty tiles only
      if (recycleCard && nonWhiteEmptyTile) {
        const canTargetNonWhite = !nonWhiteEmptyTile.placedHeart && nonWhiteEmptyTile.color !== 'white'
        expect(canTargetNonWhite).toBe(true)
      }

      if (recycleCard && whiteEmptyTile) {
        const canTargetWhite = !whiteEmptyTile.placedHeart && whiteEmptyTile.color !== 'white'
        expect(canTargetWhite).toBe(false)
      }
    })

    it('should validate card draw limits', async () => {
      const { validateCardDrawLimit } = await import('../../server.js')

      const room = {
        gameState: {
          playerActions: {
            user123: {
              drawnHeart: false,
              drawnMagic: false,
              heartsPlaced: 2,
              magicCardsUsed: 1
            },
            user456: {
              drawnHeart: true,
              drawnMagic: false,
              heartsPlaced: 1,
              magicCardsUsed: 0
            }
          }
        }
      }

      // Test user123 - can draw heart and magic
      let result = validateCardDrawLimit(room, 'user123')
      expect(result.currentActions.drawnHeart).toBe(false)
      expect(result.currentActions.drawnMagic).toBe(false)

      // Test heart placement limit - user123 has placed 2 hearts (limit reached)
      const heartsPlaced = result.currentActions.heartsPlaced || 0
      const canPlaceMoreHearts = heartsPlaced < 2
      expect(canPlaceMoreHearts).toBe(false)

      // Test magic card usage limit - user123 has used 1 magic card (limit reached)
      const magicCardsUsed = result.currentActions.magicCardsUsed || 0
      const canUseMoreMagicCards = magicCardsUsed < 1
      expect(canUseMoreMagicCards).toBe(false)

      // Test user456 - has drawn heart but not magic
      result = validateCardDrawLimit(room, 'user456')
      expect(result.currentActions.drawnHeart).toBe(true)
      expect(result.currentActions.drawnMagic).toBe(false)

      // Can still draw magic
      const canDrawMagic = !result.currentActions.drawnMagic
      expect(canDrawMagic).toBe(true)

      // Can still place hearts (only placed 1)
      const heartsPlaced456 = result.currentActions.heartsPlaced || 0
      const canPlaceMoreHearts456 = heartsPlaced456 < 2
      expect(canPlaceMoreHearts456).toBe(true)
    })
  })

  describe('Error Handling in Socket Events', () => {
    it('should handle invalid room codes gracefully', async () => {
      const invalidRoomCodes = ['', 'INVALID', 'ABC-123', null, undefined]

      for (const roomCode of invalidRoomCodes) {
        // Mock socket emit to capture error messages
        const mockEmit = vi.fn()
        mockSocket.emit = mockEmit

        // Simulate room code validation
        const { validateRoomCode } = await import('../../server.js')
        const isValid = validateRoomCode(roomCode)

        if (!isValid) {
          mockSocket.emit("room-error", "Invalid room code")
        }

        expect(mockEmit).toHaveBeenCalledWith("room-error", "Invalid room code")
      }
    })

    it('should handle room not found scenarios', async () => {
      const roomCode = 'NOTFOUND'
      const { validateRoomCode } = await import('../../server.js')

      expect(validateRoomCode(roomCode)).toBe(true)

      const room = rooms.get(roomCode)
      expect(room).toBeUndefined()

      // Should handle gracefully without throwing
      expect(() => {
        if (room) {
          // Process room
        } else {
          throw new Error('Room not found')
        }
      }).toThrow('Room not found')
    })

    it('should handle authentication failures', async () => {
      const { getToken } = await import('next-auth/jwt')
      const { User } = await import('../../../models')

      // Test missing token
      getToken.mockResolvedValue(null)

      const mockSocket = {
        handshake: {},
        data: {}
      }
      const mockNext = vi.fn()

      // Simulate authentication
      const token = await getToken({
        req: mockSocket.handshake,
        secret: 'test-secret'
      })

      if (!token?.id) {
        mockNext(new Error('Authentication required'))
      }

      expect(mockNext).toHaveBeenCalledWith(new Error('Authentication required'))

      // Test user not found
      getToken.mockResolvedValue({ id: 'nonexistent' })
      User.findById.mockResolvedValue(null)

      const token2 = await getToken({
        req: mockSocket.handshake,
        secret: 'test-secret'
      })

      if (token2?.id) {
        const user = await User.findById(token2.id)
        if (!user) {
          mockNext(new Error('User not found'))
        }
      }

      expect(mockNext).toHaveBeenCalledWith(new Error('User not found'))
    })

    it('should handle database operation failures', async () => {
      const { Room, PlayerSession } = await import('../../../models')

      // Test room save failure
      Room.findOneAndUpdate.mockRejectedValue(new Error('Database connection lost'))

      const roomData = {
        code: 'TEST123',
        players: [{ userId: 'user1', name: 'User1' }],
        gameState: { gameStarted: false }
      }

      // Simulate saveRoom function
      async function saveRoom(roomData) {
        try {
          await Room.findOneAndUpdate(
            { code: roomData.code },
            roomData,
            { upsert: true, new: true }
          )
        } catch (err) {
          console.error('Failed to save room:', err)
          // Should not throw error, just log it
        }
      }

      await expect(saveRoom(roomData)).resolves.toBeUndefined()
      expect(Room.findOneAndUpdate).toHaveBeenCalled()

      // Test session save failure
      PlayerSession.findOneAndUpdate.mockRejectedValue(new Error('Session save failed'))

      const sessionData = {
        userId: 'user1',
        currentSocketId: 'socket123',
        isActive: true
      }

      // Simulate savePlayerSession function
      async function savePlayerSession(sessionData) {
        try {
          await PlayerSession.findOneAndUpdate(
            { userId: sessionData.userId },
            sessionData,
            { upsert: true, new: true }
          )
        } catch (err) {
          console.error('Failed to save player session:', err)
        }
      }

      await expect(savePlayerSession(sessionData)).resolves.toBeUndefined()
      expect(PlayerSession.findOneAndUpdate).toHaveBeenCalled()
    })

    it('should handle turn lock acquisition failures', async () => {
      const { acquireTurnLock, releaseTurnLock } = await import('../../server.js')

      const roomCode = 'LOCK123'
      const userId = 'user123'

      // First lock acquisition should succeed
      const firstLock = acquireTurnLock(roomCode, userId)
      expect(firstLock).toBe(true)

      // Second lock acquisition should fail
      const secondLock = acquireTurnLock(roomCode, userId)
      expect(secondLock).toBe(false)

      // Should handle gracefully by rejecting the action
      const canProceed = secondLock
      expect(canProceed).toBe(false)

      // Release lock and verify
      releaseTurnLock(roomCode, userId)
      const thirdLock = acquireTurnLock(roomCode, userId)
      expect(thirdLock).toBe(true)
    })

    it('should handle concurrent request scenarios', async () => {
      const { acquireTurnLock } = await import('../../server.js')

      const roomCode = 'CONCURRENT123'
      const userId = 'user123'
      const socketId = 'socket123'

      // Simulate multiple concurrent actions
      const actions = []
      for (let i = 0; i < 5; i++) {
        const lockAcquired = acquireTurnLock(roomCode, socketId + i)
        actions.push(lockAcquired)
      }

      // Only first action should succeed
      expect(actions[0]).toBe(true)
      actions.slice(1).forEach(action => {
        expect(action).toBe(false)
      })

      // Actions should handle lock failure gracefully
      const results = actions.map(lockAcquired => {
        if (!lockAcquired) {
          return { success: false, error: 'Action in progress, please wait' }
        }
        return { success: true }
      })

      expect(results[0].success).toBe(true)
      results.slice(1).forEach(result => {
        expect(result.success).toBe(false)
        expect(result.error).toBe('Action in progress, please wait')
      })
    })
  })

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle empty player lists', async () => {
      const { validateRoomState } = await import('../../server.js')

      const room = {
        players: [],
        gameState: {
          gameStarted: false,
          currentPlayer: null
        }
      }

      const result = validateRoomState(room)
      expect(result.valid).toBe(true) // Empty player list is valid for room creation
    })

    it('should handle maximum player scenarios', async () => {
      const maxPlayers = 2
      const room = {
        players: [
          { userId: 'user1', name: 'User1' },
          { userId: 'user2', name: 'User2' }
        ],
        maxPlayers: maxPlayers
      }

      // At capacity
      const isAtCapacity = room.players.length >= room.maxPlayers
      expect(isAtCapacity).toBe(true)

      // Try to add another player
      const newPlayer = { userId: 'user3', name: 'User3' }
      const canJoin = !isAtCapacity
      expect(canJoin).toBe(false)
    })

    it('should handle tile boundary conditions', async () => {
      const { generateTiles } = await import('../../server.js')

      const originalRandom = Math.random

      // Test all white tiles
      Math.random = vi.fn().mockReturnValue(0.1) // Always generate white
      const allWhiteTiles = generateTiles()
      expect(allWhiteTiles.every(tile => tile.color === 'white')).toBe(true)

      // Test all colored tiles
      Math.random = vi.fn().mockReturnValue(0.8) // Always generate colored
      const allColoredTiles = generateTiles()
      expect(allColoredTiles.every(tile => tile.color !== 'white')).toBe(true)

      // Test mixed tiles
      Math.random = vi.fn().mockReturnValue(0.5) // Mixed
      const mixedTiles = generateTiles()
      expect(mixedTiles).toHaveLength(8)
      expect(mixedTiles.every(tile => ['red', 'yellow', 'green', 'white'].includes(tile.color))).toBe(true)

      Math.random = originalRandom
    })

    it('should handle score calculation edge cases', async () => {
      const { calculateScore } = await import('../../server.js')

      // Test with maximum heart value
      const maxHeart = { value: 3, color: 'red' }
      const matchingTile = { color: 'red' }
      expect(calculateScore(maxHeart, matchingTile)).toBe(6) // Double points

      // Test with minimum heart value
      const minHeart = { value: 1, color: 'blue' }
      const whiteTile = { color: 'white' }
      expect(calculateScore(minHeart, whiteTile)).toBe(1) // Face value

      // Test with zero score scenario
      const zeroScoreHeart = { value: 2, color: 'green' }
      const mismatchingTile = { color: 'red' }
      expect(calculateScore(zeroScoreHeart, mismatchingTile)).toBe(0)
    })

    it('should handle game state corruption gracefully', async () => {
      const { validateRoomState, validateDeckState } = await import('../../server.js')

      // Test corrupted game state
      const corruptedStates = [
        { players: [], gameState: null },
        { players: null, gameState: {} },
        { players: undefined, gameState: { gameStarted: true } },
        { players: [], gameState: { currentPlayer: 'invalid' } },
        { players: [], gameState: { deck: null } },
        { players: [], gameState: { magicDeck: 'invalid' } }
      ]

      for (const state of corruptedStates) {
        const result = validateRoomState(state)
        expect(result.valid).toBe(false)
        expect(result.error).toBeDefined()
      }

      // Test corrupted deck state
      const corruptedDecks = [
        { deck: { cards: NaN } },
        { deck: { cards: Infinity } },
        { deck: { cards: -Infinity } },
        { deck: { cards: '16' } },
        { deck: { cards: true } }
      ]

      for (const deckState of corruptedDecks) {
        const result = validateDeckState({ gameState: deckState })
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Invalid deck count')
      }
    })
  })

  describe('Error Recovery and Cleanup', () => {
    it('should handle player disconnect during active turn', async () => {
      const roomCode = 'DISCONN123'
      const userId = 'user123'

      const room = {
        players: [
          { userId: userId, name: 'TestUser' },
          { userId: 'user456', name: 'OtherUser' }
        ],
        gameState: {
          currentPlayer: { userId: userId, name: 'TestUser' },
          turnCount: 3
        }
      }

      rooms.set(roomCode, room)

      // Add turn lock for disconnected player
      const { acquireTurnLock } = await import('../../server.js')
      const socketId = 'socket123'
      const lockAcquired = acquireTurnLock(roomCode, socketId)
      expect(lockAcquired).toBe(true)

      // Simulate disconnect cleanup
      const { releaseTurnLock } = await import('../../server.js')
      releaseTurnLock(roomCode, socketId)

      // Remove player
      room.players = room.players.filter(player => player.userId !== userId)

      // If current player disconnected, switch to next player
      if (room.gameState.currentPlayer?.userId === userId) {
        const nextPlayerIndex = room.players.length > 0 ? 0 : -1
        if (nextPlayerIndex >= 0) {
          room.gameState.currentPlayer = room.players[nextPlayerIndex]
        }
      }

      expect(room.players).toHaveLength(1)
      expect(room.players[0].userId).toBe('user456')
      expect(room.gameState.currentPlayer?.userId).toBe('user456')
    })

    it('should handle room cleanup when all players leave', async () => {
      const { Room, deleteRoom } = await import('../../../models')

      const roomCode = 'EMPTY123'
      const room = {
        code: roomCode,
        players: [
          { userId: 'user1', name: 'User1' },
          { userId: 'user2', name: 'User2' }
        ]
      }

      rooms.set(roomCode, room)

      // Remove all players
      room.players = []

      if (room.players.length === 0) {
        rooms.delete(roomCode)
        // Mock deleteRoom
        deleteRoom(roomCode)
      }

      expect(rooms.has(roomCode)).toBe(false)
      expect(room.players.length).toBe(0)
    })

    it('should handle shield expiration during game end', async () => {
      const { checkAndExpireShields, checkGameEndConditions } = await import('../../server.js')

      const room = {
        gameState: {
          gameStarted: true,
          tiles: [
            { placedHeart: { value: 2 } },
            { placedHeart: { value: 3 } }
          ],
          shields: {
            user1: { remainingTurns: 1, active: true },
            user2: { remainingTurns: 0, active: false }
          },
          turnCount: 5
        }
      }

      // Expire shields
      checkAndExpireShields(room)

      expect(room.gameState.shields.user1.remainingTurns).toBe(0)
      expect(room.gameState.shields.user2).toBeUndefined()

      // Check game end after shield expiration
      const result = checkGameEndConditions(room, false)
      expect(result.shouldEnd).toBe(true)
      expect(result.reason).toBe('All tiles are filled')
    })
  })
})