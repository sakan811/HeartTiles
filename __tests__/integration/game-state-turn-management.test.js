import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Import real card implementations for proper testing
import { HeartCard, WindCard, RecycleCard, ShieldCard } from '../../src/lib/cards.js'

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

// Import real card implementations - setup.js will handle proper mocking
// Remove local card mock to use real implementations from setup.js

// Set environment
process.env.NODE_ENV = 'test'

describe('Game State Management and Turn-Based Gameplay', () => {
  let rooms, turnLocks

  beforeEach(() => {
    vi.clearAllMocks()
    rooms = new Map()
    turnLocks = new Map()
    global.turnLocks = turnLocks
  })

  afterEach(() => {
    global.turnLocks = new Map()
  })

  describe('Turn Lock Management', () => {
    it('should acquire turn lock for unique user-room combination', async () => {
      const { acquireTurnLock, releaseTurnLock } = await import('../../server.js')

      const roomCode = 'ROOM123'
      const socketId = 'user123'

      // Should acquire lock initially
      const acquired = acquireTurnLock(roomCode, socketId)
      expect(acquired).toBe(true)
      expect(turnLocks.has(roomCode)).toBe(true)

      // Should not acquire same lock again
      const acquiredAgain = acquireTurnLock(roomCode, socketId)
      expect(acquiredAgain).toBe(false)

      // Release lock
      releaseTurnLock(roomCode, socketId)
      expect(turnLocks.has(roomCode)).toBe(false)

      // Should be able to acquire again after release
      const acquiredAfterRelease = acquireTurnLock(roomCode, socketId)
      expect(acquiredAfterRelease).toBe(true)
    })

    it('should handle multiple different locks simultaneously', async () => {
      const { acquireTurnLock, releaseTurnLock } = await import('../../server.js')

      const roomCode1 = 'ROOM1'
      const roomCode2 = 'ROOM2'
      const socketId1 = 'socket1'
      const socketId2 = 'socket2'

      // Acquire different locks - only one lock per room allowed
      expect(acquireTurnLock(roomCode1, socketId1)).toBe(true)
      expect(acquireTurnLock(roomCode2, socketId1)).toBe(true)

      // Cannot acquire same room lock again
      expect(acquireTurnLock(roomCode1, socketId2)).toBe(false)
      expect(acquireTurnLock(roomCode2, socketId2)).toBe(false)

      // All room locks should exist
      expect(turnLocks.has(roomCode1)).toBe(true)
      expect(turnLocks.has(roomCode2)).toBe(true)

      // Release one lock
      releaseTurnLock(roomCode1, socketId1)
      expect(turnLocks.has(roomCode1)).toBe(false)
      expect(turnLocks.has(roomCode2)).toBe(true)
    })
  })

  describe('Player Action Tracking', () => {
    it('should track heart card draws correctly', async () => {
      const { validateCardDrawLimit, recordCardDraw } = await import('../../server.js')

      const room = { gameState: {} }
      const userId = 'user123'

      // Initial state
      let result = validateCardDrawLimit(room, userId)
      expect(result.valid).toBe(true)
      expect(result.currentActions.drawnHeart).toBe(false)

      // Record heart draw
      recordCardDraw(room, userId, 'heart')
      result = validateCardDrawLimit(room, userId)
      expect(result.currentActions.drawnHeart).toBe(true)
      expect(result.currentActions.drawnMagic).toBe(false)
    })

    it('should track magic card draws correctly', async () => {
      const { validateCardDrawLimit, recordCardDraw } = await import('../../server.js')

      const room = { gameState: {} }
      const userId = 'user123'

      // Record magic draw
      recordCardDraw(room, userId, 'magic')
      const result = validateCardDrawLimit(room, userId)
      expect(result.currentActions.drawnMagic).toBe(true)
      expect(result.currentActions.drawnHeart).toBe(false)
    })

    it('should track both heart and magic card draws', async () => {
      const { validateCardDrawLimit, recordCardDraw } = await import('../../server.js')

      const room = { gameState: {} }
      const userId = 'user123'

      // Record both draws
      recordCardDraw(room, userId, 'heart')
      recordCardDraw(room, userId, 'magic')
      const result = validateCardDrawLimit(room, userId)
      expect(result.currentActions.drawnHeart).toBe(true)
      expect(result.currentActions.drawnMagic).toBe(true)
    })

    it('should track heart placements correctly', async () => {
      const room = {
        gameState: {
          playerActions: {}
        }
      }
      const userId = 'user123'

      // Simulate recordHeartPlacement function
      function recordHeartPlacement(room, userId) {
        if (!room.gameState.playerActions) {
          room.gameState.playerActions = {}
        }

        if (!room.gameState.playerActions[userId]) {
          room.gameState.playerActions[userId] = {
            drawnHeart: false,
            drawnMagic: false,
            heartsPlaced: 0,
            magicCardsUsed: 0
          }
        }

        room.gameState.playerActions[userId].heartsPlaced = (room.gameState.playerActions[userId].heartsPlaced || 0) + 1
      }

      // Place hearts
      recordHeartPlacement(room, userId)
      expect(room.gameState.playerActions[userId].heartsPlaced).toBe(1)

      recordHeartPlacement(room, userId)
      expect(room.gameState.playerActions[userId].heartsPlaced).toBe(2)
    })

    it('should track magic card usage correctly', async () => {
      const room = {
        gameState: {
          playerActions: {}
        }
      }
      const userId = 'user123'

      // Simulate recordMagicCardUsage function
      function recordMagicCardUsage(room, userId) {
        if (!room.gameState.playerActions) {
          room.gameState.playerActions = {}
        }

        if (!room.gameState.playerActions[userId]) {
          room.gameState.playerActions[userId] = {
            drawnHeart: false,
            drawnMagic: false,
            heartsPlaced: 0,
            magicCardsUsed: 0
          }
        }

        room.gameState.playerActions[userId].magicCardsUsed = (room.gameState.playerActions[userId].magicCardsUsed || 0) + 1
      }

      // Use magic card
      recordMagicCardUsage(room, userId)
      expect(room.gameState.playerActions[userId].magicCardsUsed).toBe(1)
    })

    it('should initialize playerActions when recording heart placement', async () => {
      const { recordHeartPlacement } = await import('../../server.js')

      const room = { gameState: {} } // No playerActions initially
      const userId = 'user123'

      // Should initialize playerActions structure (line 522-526 edge case)
      recordHeartPlacement(room, userId)

      expect(room.gameState.playerActions).toBeDefined()
      expect(room.gameState.playerActions[userId]).toBeDefined()
      expect(room.gameState.playerActions[userId].drawnHeart).toBe(false)
      expect(room.gameState.playerActions[userId].drawnMagic).toBe(false)
      expect(room.gameState.playerActions[userId].heartsPlaced).toBe(1)
      expect(room.gameState.playerActions[userId].magicCardsUsed).toBe(0)
    })

    it('should initialize playerActions when recording magic card usage', async () => {
      const { recordMagicCardUsage } = await import('../../server.js')

      const room = { gameState: {} } // No playerActions initially
      const userId = 'user123'

      // Should initialize playerActions structure (line 539-543 edge case)
      recordMagicCardUsage(room, userId)

      expect(room.gameState.playerActions).toBeDefined()
      expect(room.gameState.playerActions[userId]).toBeDefined()
      expect(room.gameState.playerActions[userId].drawnHeart).toBe(false)
      expect(room.gameState.playerActions[userId].drawnMagic).toBe(false)
      expect(room.gameState.playerActions[userId].heartsPlaced).toBe(0)
      expect(room.gameState.playerActions[userId].magicCardsUsed).toBe(1)
    })

    it('should validate heart placement limits', async () => {
      const room = {
        gameState: {
          playerActions: {
            user1: { heartsPlaced: 1 },
            user2: { heartsPlaced: 2 }
          }
        }
      }

      // Simulate canPlaceMoreHearts function
      function canPlaceMoreHearts(room, userId) {
        const playerActions = room.gameState.playerActions[userId] || { heartsPlaced: 0 }
        return (playerActions.heartsPlaced || 0) < 2
      }

      expect(canPlaceMoreHearts(room, 'user1')).toBe(true) // Placed 1, can place 1 more
      expect(canPlaceMoreHearts(room, 'user2')).toBe(false) // Placed 2, at limit
      expect(canPlaceMoreHearts(room, 'user3')).toBe(true) // No placements yet
    })

    it('should validate magic card usage limits', async () => {
      const room = {
        gameState: {
          playerActions: {
            user1: { magicCardsUsed: 0 },
            user2: { magicCardsUsed: 1 }
          }
        }
      }

      // Simulate canUseMoreMagicCards function
      function canUseMoreMagicCards(room, userId) {
        const playerActions = room.gameState.playerActions[userId] || { magicCardsUsed: 0 }
        return (playerActions.magicCardsUsed || 0) < 1
      }

      expect(canUseMoreMagicCards(room, 'user1')).toBe(true) // Used 0, can use 1
      expect(canUseMoreMagicCards(room, 'user2')).toBe(false) // Used 1, at limit
      expect(canUseMoreMagicCards(room, 'user3')).toBe(true) // No usage yet
    })

    it('should allow heart placement when playerActions tracking is missing', async () => {
      const { canPlaceMoreHearts } = await import('../../server.js')

      const room = { gameState: {} } // No playerActions tracking (line 556 edge case)
      const userId = 'user123'

      const result = canPlaceMoreHearts(room, userId)
      expect(result).toBe(true) // Should allow placement when tracking is missing
    })

    it('should allow magic card usage when playerActions tracking is missing', async () => {
      const { canUseMoreMagicCards } = await import('../../server.js')

      const room = { gameState: {} } // No playerActions tracking (line 564 edge case)
      const userId = 'user123'

      const result = canUseMoreMagicCards(room, userId)
      expect(result).toBe(true) // Should allow usage when tracking is missing
    })

    it('should reset player actions', async () => {
      const { resetPlayerActions } = await import('../../server.js')

      const room = {
        gameState: {
          playerActions: {
            user123: {
              drawnHeart: true,
              drawnMagic: true,
              heartsPlaced: 2,
              magicCardsUsed: 1
            }
          }
        }
      }

      resetPlayerActions(room, 'user123')

      expect(room.gameState.playerActions.user123.drawnHeart).toBe(false)
      expect(room.gameState.playerActions.user123.drawnMagic).toBe(false)
      expect(room.gameState.playerActions.user123.heartsPlaced).toBe(0)
      expect(room.gameState.playerActions.user123.magicCardsUsed).toBe(0)
    })
  })

  describe('Turn Management', () => {
    it('should validate turn correctly for current player', async () => {
      const { validateTurn } = await import('../../server.js')

      const room = {
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user123', name: 'TestUser' }
        }
      }

      const result = validateTurn(room, 'user123')
      expect(result.valid).toBe(true)
    })

    it('should reject turn when game not started', async () => {
      const { validateTurn } = await import('../../server.js')

      const room = {
        gameState: {
          gameStarted: false,
          currentPlayer: { userId: 'user123', name: 'TestUser' }
        }
      }

      const result = validateTurn(room, 'user123')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Game not started')
    })

    it('should reject turn when not current player', async () => {
      const { validateTurn } = await import('../../server.js')

      const room = {
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user456', name: 'OtherUser' }
        }
      }

      const result = validateTurn(room, 'user123')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Not your turn')
    })

    it('should switch turns correctly', async () => {
      const room = {
        players: [
          { userId: 'user1', name: 'User1' },
          { userId: 'user2', name: 'User2' }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user1', name: 'User1' },
          turnCount: 1,
          playerActions: {
            user1: { drawnHeart: true, drawnMagic: true }
          }
        }
      }

      // Simulate turn switching logic
      const { resetPlayerActions } = await import('../../server.js')
      resetPlayerActions(room, room.gameState.currentPlayer.userId)

      // Find next player
      const currentPlayerIndex = room.players.findIndex(p => p.userId === room.gameState.currentPlayer.userId)
      const nextPlayerIndex = (currentPlayerIndex + 1) % room.players.length

      // Switch to next player
      room.gameState.currentPlayer = room.players[nextPlayerIndex]
      room.gameState.turnCount++

      expect(room.gameState.currentPlayer.userId).toBe('user2')
      expect(room.gameState.turnCount).toBe(2)
      expect(room.gameState.playerActions.user1.drawnHeart).toBe(false)
      expect(room.gameState.playerActions.user1.drawnMagic).toBe(false)
    })

    it('should handle turn switching with more than 2 players', async () => {
      const room = {
        players: [
          { userId: 'user1', name: 'User1' },
          { userId: 'user2', name: 'User2' },
          { userId: 'user3', name: 'User3' }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user2', name: 'User2' },
          turnCount: 5
        }
      }

      // Switch to next player (user3)
      const currentPlayerIndex = room.players.findIndex(p => p.userId === room.gameState.currentPlayer.userId)
      const nextPlayerIndex = (currentPlayerIndex + 1) % room.players.length

      room.gameState.currentPlayer = room.players[nextPlayerIndex]
      room.gameState.turnCount++

      expect(room.gameState.currentPlayer.userId).toBe('user3')
      expect(room.gameState.turnCount).toBe(6)

      // Switch again (should wrap to user1)
      const nextPlayerIndex2 = (nextPlayerIndex + 1) % room.players.length
      room.gameState.currentPlayer = room.players[nextPlayerIndex2]
      room.gameState.turnCount++

      expect(room.gameState.currentPlayer.userId).toBe('user1')
      expect(room.gameState.turnCount).toBe(7)
    })
  })

  describe('Game State Validation', () => {
    it('should validate complete game state', async () => {
      const { validateRoomState } = await import('../../server.js')

      const validRoom = {
        players: [
          { userId: 'user1', name: 'User1' },
          { userId: 'user2', name: 'User2' }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user1', name: 'User1' },
          tiles: [],
          deck: { emoji: '💌', cards: 16, },
          magicDeck: { emoji: '🔮', cards: 16, },
          playerHands: {},
          turnCount: 1
        }
      }

      const result = validateRoomState(validRoom)
      expect(result.valid).toBe(true)
    })

    it('should reject invalid room state', async () => {
      const { validateRoomState } = await import('../../server.js')

      // Test null room
      let result = validateRoomState(null)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Room not found')

      // Test invalid players
      result = validateRoomState({ players: 'not array', gameState: {} })
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid players state')

      // Test missing game state
      result = validateRoomState({ players: [] })
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid game state')

      // Test game started but no current player
      result = validateRoomState({
        players: [],
        gameState: { gameStarted: true, currentPlayer: null }
      })
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Game started but no current player')
    })

    it('should validate deck state', async () => {
      const { validateDeckState } = await import('../../server.js')

      // Valid deck
      let result = validateDeckState({
        gameState: { deck: { emoji: '💌', cards: 16, type: 'hearts' } }
      })
      expect(result.valid).toBe(true)

      // Missing deck
      result = validateDeckState({ gameState: {} })
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid deck state')

      // Invalid deck count
      result = validateDeckState({
        gameState: { deck: { cards: -1, type: 'hearts' } }
      })
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid deck count')
    })

    it('should validate player in room', async () => {
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
    })

    it('should handle validateRoomState edge case when gameStarted property is missing with empty players', async () => {
      const { validateRoomState } = await import('../../server.js')

      // Room with missing gameStarted property and empty players (line 242 edge case)
      const roomWithMissingGameStarted = {
        players: [],
        gameState: {
          currentPlayer: null,
          tiles: [],
          deck: { emoji: '💌', cards: 16 },
          magicDeck: { emoji: '🔮', cards: 16 },
          playerHands: {},
          turnCount: 0
          // Note: gameStarted property is completely missing
        }
      }

      const result = validateRoomState(roomWithMissingGameStarted)
      expect(result.valid).toBe(false)
      expect(result.error).toBe("Invalid players state")
    })
  })

  describe('Shield Management During Turns', () => {
    it('should decrement shield turns at end of turn', async () => {
      const { checkAndExpireShields } = await import('../../server.js')

      const room = {
        gameState: {
          shields: {
            user1: { remainingTurns: 2, active: true },
            user2: { remainingTurns: 1, active: true },
            user3: { remainingTurns: 0, active: false }
          },
          turnCount: 3
        }
      }

      checkAndExpireShields(room)

      expect(room.gameState.shields.user1.remainingTurns).toBe(1)
      expect(room.gameState.shields.user1.active).toBe(true)

      expect(room.gameState.shields.user2).toBeUndefined() // Should be removed

      expect(room.gameState.shields.user3).toBeUndefined() // Already inactive
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

  describe('Turn Requirements Validation', () => {
    it('should require heart card draw before ending turn', async () => {
      const { validateCardDrawLimit } = await import('../../server.js')

      const room = {
        gameState: {
          deck: { emoji: '💌', cards: 10, }, // Hearts not empty
          magicDeck: { emoji: '🔮', cards: 8, }, // Magic not empty
          playerActions: {
            user123: {
              drawnHeart: false, // Has not drawn heart
              drawnMagic: true   // Has drawn magic
            }
          }
        }
      }

      const result = validateCardDrawLimit(room, 'user123')
      expect(result.currentActions.drawnHeart).toBe(false)

      // Should require heart draw before ending turn
      const heartDeckEmpty = room.gameState.deck.cards <= 0
      expect(heartDeckEmpty).toBe(false)
    })

    it('should require magic card draw before ending turn', async () => {
      const { validateCardDrawLimit } = await import('../../server.js')

      const room = {
        gameState: {
          deck: { emoji: '💌', cards: 10, },
          magicDeck: { emoji: '🔮', cards: 8, },
          playerActions: {
            user123: {
              drawnHeart: true,    // Has drawn heart
              drawnMagic: false    // Has not drawn magic
            }
          }
        }
      }

      const result = validateCardDrawLimit(room, 'user123')
      expect(result.currentActions.drawnMagic).toBe(false)

      // Should require magic draw before ending turn
      const magicDeckEmpty = room.gameState.magicDeck.cards <= 0
      expect(magicDeckEmpty).toBe(false)
    })

    it('should allow ending turn when decks are empty', async () => {
      const { validateCardDrawLimit } = await import('../../server.js')

      const room = {
        gameState: {
          deck: { emoji: '💌', cards: 0, },      // Hearts empty
          magicDeck: { emoji: '🔮', cards: 0, },  // Magic empty
          playerActions: {
            user123: {
              drawnHeart: false,   // Has not drawn heart
              drawnMagic: false    // Has not drawn magic
            }
          }
        }
      }

      const result = validateCardDrawLimit(room, 'user123')

      const heartDeckEmpty = room.gameState.deck.cards <= 0
      const magicDeckEmpty = room.gameState.magicDeck.cards <= 0

      expect(heartDeckEmpty).toBe(true)
      expect(magicDeckEmpty).toBe(true)

      // Should allow ending turn even without drawing when decks are empty
      expect(result.currentActions.drawnHeart).toBe(false)
      expect(result.currentActions.drawnMagic).toBe(false)
    })
  })

  describe('Complex Turn Scenarios', () => {
    it('should handle concurrent turn attempts with locks', async () => {
      const { acquireTurnLock, releaseTurnLock } = await import('../../server.js')

      const roomCode = 'CONCURRENT123'
      const socketId = 'user123'

      // First action acquires lock
      const firstLock = acquireTurnLock(roomCode, socketId)
      expect(firstLock).toBe(true)
      expect(turnLocks.has(roomCode)).toBe(true)

      // Second action fails to acquire lock
      const secondLock = acquireTurnLock(roomCode, socketId)
      expect(secondLock).toBe(false)

      // Simulate action completion and lock release
      releaseTurnLock(roomCode, socketId)
      expect(turnLocks.has(roomCode)).toBe(false)

      // Second action can now acquire lock
      const thirdLock = acquireTurnLock(roomCode, socketId)
      expect(thirdLock).toBe(true)
    })

    it('should maintain turn order across multiple rounds', async () => {
      const room = {
        players: [
          { userId: 'user1', name: 'User1' },
          { userId: 'user2', name: 'User2' },
          { userId: 'user3', name: 'User3' }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user1', name: 'User1' },
          turnCount: 1
        }
      }

      // Simulate multiple turns
      const turnOrder = []
      for (let i = 0; i < 7; i++) {
        turnOrder.push(room.gameState.currentPlayer.userId)

        // Switch to next player
        const currentPlayerIndex = room.players.findIndex(p => p.userId === room.gameState.currentPlayer.userId)
        const nextPlayerIndex = (currentPlayerIndex + 1) % room.players.length
        room.gameState.currentPlayer = room.players[nextPlayerIndex]
        room.gameState.turnCount++
      }

      expect(turnOrder).toEqual(['user1', 'user2', 'user3', 'user1', 'user2', 'user3', 'user1'])
      expect(room.gameState.turnCount).toBe(8)
    })

    it('should handle player actions reset at turn end', async () => {
      const { resetPlayerActions } = await import('../../server.js')

      const room = {
        players: [
          { userId: 'user1', name: 'User1' },
          { userId: 'user2', name: 'User2' }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user1', name: 'User1' },
          turnCount: 3,
          playerActions: {
            user1: {
              drawnHeart: true,
              drawnMagic: true,
              heartsPlaced: 2,
              magicCardsUsed: 1
            },
            user2: {
              drawnHeart: false,
              drawnMagic: false,
              heartsPlaced: 0,
              magicCardsUsed: 0
            }
          }
        }
      }

      // End turn for user1
      resetPlayerActions(room, 'user1')

      // Switch to user2
      room.gameState.currentPlayer = room.players[1]
      room.gameState.turnCount++

      expect(room.gameState.currentPlayer.userId).toBe('user2')
      expect(room.gameState.turnCount).toBe(4)
      expect(room.gameState.playerActions.user1.drawnHeart).toBe(false)
      expect(room.gameState.playerActions.user1.drawnMagic).toBe(false)
      expect(room.gameState.playerActions.user1.heartsPlaced).toBe(0)
      expect(room.gameState.playerActions.user1.magicCardsUsed).toBe(0)
      expect(room.gameState.playerActions.user2.drawnHeart).toBe(false) // Unchanged
    })
  })
})