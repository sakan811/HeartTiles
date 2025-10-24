import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HeartCard, WindCard, RecycleCard, ShieldCard } from '../../src/lib/cards.js'

describe('Server Room Management Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set test environment
    process.env.NODE_ENV = 'test'
  })

  describe('validateRoomState function (lines 128-149)', () => {
    it('should validate room with valid state', async () => {
      const { validateRoomState } = await import('../../server.js')

      const validRoom = {
        players: [],
        gameState: {
          gameStarted: false,
          currentPlayer: null
        }
      }

      const result = validateRoomState(validRoom)
      expect(result.valid).toBe(true)
    })

    it('should reject room with null or undefined', async () => {
      const { validateRoomState } = await import('../../server.js')

      expect(validateRoomState(null).valid).toBe(false)
      expect(validateRoomState(undefined).valid).toBe(false)
      expect(validateRoomState('string').valid).toBe(false)
    })

    it('should reject room with invalid players array', async () => {
      const { validateRoomState } = await import('../../server.js')

      const roomWithInvalidPlayers = {
        players: 'not an array',
        gameState: { gameStarted: false }
      }

      const result = validateRoomState(roomWithInvalidPlayers)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid players state')
    })

    it('should reject room with missing or invalid gameState', async () => {
      const { validateRoomState } = await import('../../server.js')

      const roomWithNoGameState = {
        players: []
      }

      const result1 = validateRoomState(roomWithNoGameState)
      expect(result1.valid).toBe(false)
      expect(result1.error).toBe('Invalid game state')

      const roomWithInvalidGameState = {
        players: [],
        gameState: 'not an object'
      }

      const result2 = validateRoomState(roomWithInvalidGameState)
      expect(result2.valid).toBe(false)
      expect(result2.error).toBe('Invalid game state')
    })

    it('should reject room with gameStarted=true but no currentPlayer', async () => {
      const { validateRoomState } = await import('../../server.js')

      const gameStartedNoCurrent = {
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

    it('should reject room with gameStarted=false but has currentPlayer', async () => {
      const { validateRoomState } = await import('../../server.js')

      const gameNotStartedWithCurrent = {
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

    it('should reject room with undefined gameStarted and no players', async () => {
      const { validateRoomState } = await import('../../server.js')

      const noGameStartedNoPlayers = {
        players: [],
        gameState: {}
      }

      const result = validateRoomState(noGameStartedNoPlayers)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid players state')
    })
  })

  describe('validatePlayerInRoom function (lines 151-156)', () => {
    it('should validate player present in room', async () => {
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

    it('should reject player not in room', async () => {
      const { validatePlayerInRoom } = await import('../../server.js')

      const room = {
        players: [{ userId: 'user1', name: 'Player1' }]
      }

      const result = validatePlayerInRoom(room, 'user2')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Player not in room')
    })

    it('should handle invalid room object', async () => {
      const { validatePlayerInRoom } = await import('../../server.js')

      expect(validatePlayerInRoom(null, 'user1').valid).toBe(false)
      expect(validatePlayerInRoom(undefined, 'user1').valid).toBe(false)
      expect(validatePlayerInRoom('not object', 'user1').valid).toBe(false)
    })

    it('should handle missing players array', async () => {
      const { validatePlayerInRoom } = await import('../../server.js')

      const roomWithoutPlayers = {
        notPlayers: 'not an array'
      }

      const result = validatePlayerInRoom(roomWithoutPlayers, 'user1')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid players state')
    })
  })

  describe('validateDeckState function (lines 158-176)', () => {
    it('should validate proper deck state', async () => {
      const { validateDeckState } = await import('../../server.js')

      const roomWithValidDeck = {
        gameState: {
          deck: {
            emoji: '💌',
            cards: 16,
            type: 'hearts'
          }
        }
      }

      const result = validateDeckState(roomWithValidDeck)
      expect(result.valid).toBe(true)
    })

    it('should reject room with missing deck', async () => {
      const { validateDeckState } = await import('../../server.js')

      expect(validateDeckState(null).valid).toBe(false)
      expect(validateDeckState({}).valid).toBe(false)
      expect(validateDeckState({ gameState: {} }).valid).toBe(false)
      expect(validateDeckState({ gameState: { deck: null } }).valid).toBe(false)
    })

    it('should reject invalid deck count values', async () => {
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

    it('should reject invalid deck type', async () => {
      const { validateDeckState } = await import('../../server.js')

      const invalidTypeRooms = [
        { gameState: { deck: { cards: 16, type: '' } } },
        { gameState: { deck: { cards: 16, type: null } } },
        { gameState: { deck: { cards: 16, type: undefined } } },
        { gameState: { deck: { cards: 16, type: 123 } } }
      ]

      for (const room of invalidTypeRooms) {
        const result = validateDeckState(room)
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Invalid deck type')
      }
    })
  })

  describe('validateTurn function (lines 178-184)', () => {
    it('should validate current player turn', async () => {
      const { validateTurn } = await import('../../server.js')

      const roomWithGameStarted = {
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user1', name: 'Player1' }
        }
      }

      const result = validateTurn(roomWithGameStarted, 'user1')
      expect(result.valid).toBe(true)
    })

    it('should reject when game not started', async () => {
      const { validateTurn } = await import('../../server.js')

      const roomNotStarted = {
        gameState: {
          gameStarted: false,
          currentPlayer: { userId: 'user1', name: 'Player1' }
        }
      }

      const result = validateTurn(roomNotStarted, 'user1')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Game not started')
    })

    it('should reject wrong player turn', async () => {
      const { validateTurn } = await import('../../server.js')

      const roomWithDifferentPlayer = {
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user1', name: 'Player1' }
        }
      }

      const result = validateTurn(roomWithDifferentPlayer, 'user2')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Not your turn')
    })

    it('should handle invalid room state', async () => {
      const { validateTurn } = await import('../../server.js')

      expect(validateTurn(null, 'user1').valid).toBe(false)
      expect(validateTurn({}, 'user1').valid).toBe(false)
      expect(validateTurn({ gameState: null }, 'user1').valid).toBe(false)
    })
  })

  describe('validateCardDrawLimit function (lines 186-199)', () => {
    it('should initialize player actions when not present', async () => {
      const { validateCardDrawLimit } = await import('../../server.js')

      const room = { gameState: {} }

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

    it('should return existing player actions', async () => {
      const { validateCardDrawLimit } = await import('../../server.js')

      const existingActions = {
        drawnHeart: true,
        drawnMagic: false,
        heartsPlaced: 1,
        magicCardsUsed: 0
      }

      const room = {
        gameState: {
          playerActions: {
            user1: existingActions
          }
        }
      }

      const result = validateCardDrawLimit(room, 'user1')

      expect(result.valid).toBe(true)
      expect(result.currentActions).toEqual(existingActions)
    })

    it('should handle different players independently', async () => {
      const { validateCardDrawLimit } = await import('../../server.js')

      const room = {
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

  describe('Game state validation edge cases', () => {
    it('should handle complex room states', async () => {
      const { validateRoomState } = await import('../../server.js')

      const complexRoom = {
        players: [
          { userId: 'user1', name: 'Player1', score: 10 },
          { userId: 'user2', name: 'Player2', score: 5 }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user1', name: 'Player1' },
          turnCount: 5,
          tiles: [],
          playerHands: {
            user1: [],
            user2: []
          }
        }
      }

      const result = validateRoomState(complexRoom)
      expect(result.valid).toBe(true)
    })

    it('should handle partial room states', async () => {
      const { validateRoomState } = await import('../../server.js')

      // Room with some but not all properties
      const partialRoom = {
        players: [],
        gameState: {
          gameStarted: undefined, // Explicitly undefined
          currentPlayer: null
        }
      }

      const result = validateRoomState(partialRoom)
      expect(result.valid).toBe(true) // Should be valid when gameStarted is undefined
    })
  })
})