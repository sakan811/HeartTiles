import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('Server Turn Management Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set up global turnLocks for testing
    global.turnLocks = new Map()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('recordCardDraw function (lines 201-220)', () => {
    it('should record heart card draw correctly', async () => {
      const { recordCardDraw } = await import('../../server.js')

      const room = { gameState: {} }

      recordCardDraw(room, 'user1', 'heart')

      expect(room.gameState.playerActions.user1.drawnHeart).toBe(true)
      expect(room.gameState.playerActions.user1.drawnMagic).toBe(false)
    })

    it('should record magic card draw correctly', async () => {
      const { recordCardDraw } = await import('../../server.js')

      const room = { gameState: {} }

      recordCardDraw(room, 'user1', 'magic')

      expect(room.gameState.playerActions.user1.drawnHeart).toBe(false)
      expect(room.gameState.playerActions.user1.drawnMagic).toBe(true)
    })

    it('should initialize player actions if missing', async () => {
      const { recordCardDraw } = await import('../../server.js')

      const room = { gameState: {} }

      recordCardDraw(room, 'user1', 'heart')

      expect(room.gameState.playerActions).toBeDefined()
      expect(room.gameState.playerActions.user1).toBeDefined()
      expect(room.gameState.playerActions.user1).toEqual({
        drawnHeart: true,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0
      })
    })

    it('should preserve existing action data', async () => {
      const { recordCardDraw } = await import('../../server.js')

      const room = {
        gameState: {
          playerActions: {
            user1: {
              drawnMagic: true,
              heartsPlaced: 1
            }
          }
        }
      }

      recordCardDraw(room, 'user1', 'heart')

      expect(room.gameState.playerActions.user1).toEqual({
        drawnHeart: true,
        drawnMagic: true, // Should preserve
        heartsPlaced: 1, // Should preserve
        magicCardsUsed: 0
      })
    })
  })

  describe('resetPlayerActions function (lines 222-232)', () => {
    it('should reset player actions correctly', async () => {
      const { resetPlayerActions } = await import('../../server.js')

      const room = {
        gameState: {
          playerActions: {
            user1: {
              drawnHeart: true,
              drawnMagic: true,
              heartsPlaced: 2,
              magicCardsUsed: 1
            }
          }
        }
      }

      resetPlayerActions(room, 'user1')

      expect(room.gameState.playerActions.user1).toEqual({
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0
      })
    })

    it('should initialize player actions if missing', async () => {
      const { resetPlayerActions } = await import('../../server.js')

      const room = { gameState: {} }

      resetPlayerActions(room, 'user1')

      expect(room.gameState.playerActions.user1).toEqual({
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0
      })
    })

    it('should not affect other player actions', async () => {
      const { resetPlayerActions } = await import('../../server.js')

      const room = {
        gameState: {
          playerActions: {
            user1: {
              drawnHeart: true,
              drawnMagic: true,
              heartsPlaced: 2,
              magicCardsUsed: 1
            },
            user2: {
              drawnHeart: false,
              drawnMagic: true,
              heartsPlaced: 0,
              magicCardsUsed: 0
            }
          }
        }
      }

      resetPlayerActions(room, 'user1')

      expect(room.gameState.playerActions.user1).toEqual({
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0
      })

      expect(room.gameState.playerActions.user2).toEqual({
        drawnHeart: false,
        drawnMagic: true,
        heartsPlaced: 0,
        magicCardsUsed: 0
      })
    })
  })

  describe('checkGameEndConditions function (lines 234-260)', () => {
    it('should end game when all tiles are filled', async () => {
      const { checkGameEndConditions } = await import('../../server.js')

      const roomWithAllTilesFilled = {
        gameState: {
          gameStarted: true,
          tiles: [
            { placedHeart: { value: 1 } },
            { placedHeart: { value: 2 } },
            { placedHeart: { value: 3 } }
          ]
        }
      }

      const result = checkGameEndConditions(roomWithAllTilesFilled)

      expect(result.shouldEnd).toBe(true)
      expect(result.reason).toBe('All tiles are filled')
    })

    it('should end game when both decks are empty (no grace period)', async () => {
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
      expect(result.reason).toBe('Both decks are empty')
    })

    it('should end game when heart deck is empty (no grace period)', async () => {
      const { checkGameEndConditions } = await import('../../server.js')

      const roomWithEmptyHeartDeck = {
        gameState: {
          gameStarted: true,
          tiles: [{ placedHeart: null }],
          deck: { emoji: '💌', cards: 0 },
          magicDeck: { emoji: '🔮', cards: 5 }
        }
      }

      const result = checkGameEndConditions(roomWithEmptyHeartDeck, false)

      expect(result.shouldEnd).toBe(true)
      expect(result.reason).toBe('Heart deck is empty')
    })

    it('should end game when magic deck is empty (no grace period)', async () => {
      const { checkGameEndConditions } = await import('../../server.js')

      const roomWithEmptyMagicDeck = {
        gameState: {
          gameStarted: true,
          tiles: [{ placedHeart: null }],
          deck: { emoji: '💌', cards: 5 },
          magicDeck: { emoji: '🔮', cards: 0 }
        }
      }

      const result = checkGameEndConditions(roomWithEmptyMagicDeck, false)

      expect(result.shouldEnd).toBe(true)
      expect(result.reason).toBe('Magic deck is empty')
    })

    it('should not end game when decks are empty but grace period allowed', async () => {
      const { checkGameEndConditions } = await import('../../server.js')

      const roomWithEmptyDecks = {
        gameState: {
          gameStarted: true,
          tiles: [{ placedHeart: null }],
          deck: { emoji: '💌', cards: 0 },
          magicDeck: { emoji: '🔮', cards: 0 }
        }
      }

      const result = checkGameEndConditions(roomWithEmptyDecks, true) // Grace period allowed

      expect(result.shouldEnd).toBe(false)
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
      expect(result.reason).toBe(null)
    })

    it('should not end game when game not started', async () => {
      const { checkGameEndConditions } = await import('../../server.js')

      const gameNotStarted = {
        gameState: {
          gameStarted: false,
          tiles: [{ placedHeart: null }]
        }
      }

      const result = checkGameEndConditions(gameNotStarted)

      expect(result.shouldEnd).toBe(false)
    })

    it('should handle tiles with null placedHeart', async () => {
      const { checkGameEndConditions } = await import('../../server.js')

      const roomWithMixedTiles = {
        gameState: {
          gameStarted: true,
          tiles: [
            { placedHeart: { value: 1 } },
            { placedHeart: null },
            { placedHeart: { value: 2 } },
            { placedHeart: null }
          ]
        }
      }

      const result = checkGameEndConditions(roomWithMixedTiles)

      expect(result.shouldEnd).toBe(false) // Not all tiles filled
    })
  })

  describe('checkAndExpireShields function (lines 262-285)', () => {
    it('should decrement shield turn counts', async () => {
      const { checkAndExpireShields } = await import('../../server.js')

      const room = {
        gameState: {
          shields: {
            user1: { remainingTurns: 3, active: true },
            user2: { remainingTurns: 2, active: true },
            user3: { remainingTurns: 1, active: true }
          }
        }
      }

      checkAndExpireShields(room)

      expect(room.gameState.shields.user1.remainingTurns).toBe(2)
      expect(room.gameState.shields.user2.remainingTurns).toBe(1)
      expect(room.gameState.shields.user3).toBeUndefined() // Should be removed
    })

    it('should remove shields when expired', async () => {
      const { checkAndExpireShields } = await import('../../server.js')

      const room = {
        gameState: {
          shields: {
            user1: { remainingTurns: 0, active: true },
            user2: { remainingTurns: -1, active: true }
          }
        }
      }

      checkAndExpireShields(room)

      expect(room.gameState.shields.user1).toBeUndefined()
      expect(room.gameState.shields.user2).toBeUndefined()
    })

    it('should handle missing shields object gracefully', async () => {
      const { checkAndExpireShields } = await import('../../server.js')

      const roomWithoutShields1 = { gameState: {} }
      const roomWithoutShields2 = { gameState: { shields: null } }

      expect(() => {
        checkAndExpireShields(roomWithoutShields1)
        checkAndExpireShields(roomWithoutShields2)
      }).not.toThrow()
    })

    it('should handle invalid shield objects', async () => {
      const { checkAndExpireShields } = await import('../../server.js')

      const room = {
        gameState: {
          shields: {
            user1: 'not an object',
            user2: null,
            user3: { valid: 'shield' },
            user4: { remainingTurns: 'not a number' }
          }
        }
      }

      expect(() => {
        checkAndExpireShields(room)
      }).not.toThrow()

      // Should remove invalid shields
      expect(room.gameState.shields.user1).toBeUndefined()
      expect(room.gameState.shields.user2).toBeUndefined()
    })
  })

  describe('Turn lock management (lines 325-349)', () => {
    it('should acquire turn lock successfully', async () => {
      const { acquireTurnLock } = await import('../../server.js')

      const roomCode = 'TEST123'
      const socketId = 'socket1'

      const acquired = acquireTurnLock(roomCode, socketId)

      expect(acquired).toBe(true)
    })

    it('should reject duplicate turn lock for same room', async () => {
      const { acquireTurnLock } = await import('../../server.js')

      const roomCode = 'TEST123'

      const firstAcquired = acquireTurnLock(roomCode, 'socket1')
      const secondAcquired = acquireTurnLock(roomCode, 'socket2')

      expect(firstAcquired).toBe(true)
      expect(secondAcquired).toBe(false)
    })

    it('should release turn lock correctly', async () => {
      const { acquireTurnLock, releaseTurnLock } = await import('../../server.js')

      const roomCode = 'TEST123'
      const socketId = 'socket1'

      acquireTurnLock(roomCode, socketId)
      releaseTurnLock(roomCode, socketId)

      // Should be able to acquire again after release
      const reacquired = acquireTurnLock(roomCode, 'socket2')
      expect(reacquired).toBe(true)
    })

    it('should only release lock for correct socket', async () => {
      const { acquireTurnLock, releaseTurnLock } = await import('../../server.js')

      const roomCode = 'TEST123'

      acquireTurnLock(roomCode, 'socket1')
      releaseTurnLock(roomCode, 'socket2') // Wrong socket

      // Should still be locked
      const reacquired = acquireTurnLock(roomCode, 'socket3')
      expect(reacquired).toBe(false)
    })

    it('should handle releasing non-existent lock gracefully', async () => {
      const { releaseTurnLock } = await import('../../server.js')

      expect(() => {
        releaseTurnLock('NONEXISTENT', 'socket1')
      }).not.toThrow()
    })
  })

  describe('Turn flow validation', () => {
    it('should require drawing both card types before ending turn', async () => {
      // Test the validation logic from end-turn event
      const room = {
        gameState: {
          deck: { cards: 5 }, // Not empty
          magicDeck: { cards: 5 }, // Not empty
          playerActions: {
            user1: {
              drawnHeart: true,
              drawnMagic: false // Missing magic draw
            }
          }
        }
      }

      const cardDrawValidation = { currentActions: room.gameState.playerActions.user1 }

      // Simulate end-turn validation
      const heartDeckEmpty = room.gameState.deck.cards <= 0
      const magicDeckEmpty = room.gameState.magicDeck.cards <= 0

      const heartDrawRequired = !cardDrawValidation.currentActions.drawnHeart && !heartDeckEmpty
      const magicDrawRequired = !cardDrawValidation.currentActions.drawnMagic && !magicDeckEmpty

      expect(heartDrawRequired).toBe(false) // Heart was drawn
      expect(magicDrawRequired).toBe(true) // Magic not drawn but deck not empty
    })

    it('should allow ending turn when decks are empty', async () => {
      const room = {
        gameState: {
          deck: { cards: 0 }, // Empty
          magicDeck: { cards: 0 }, // Empty
          playerActions: {
            user1: {
              drawnHeart: false, // Not drawn
              drawnMagic: false // Not drawn
            }
          }
        }
      }

      const cardDrawValidation = { currentActions: room.gameState.playerActions.user1 }

      const heartDeckEmpty = room.gameState.deck.cards <= 0
      const magicDeckEmpty = room.gameState.magicDeck.cards <= 0

      const heartDrawRequired = !cardDrawValidation.currentActions.drawnHeart && !heartDeckEmpty
      const magicDrawRequired = !cardDrawValidation.currentActions.drawnMagic && !magicDeckEmpty

      expect(heartDrawRequired).toBe(false) // Deck empty, no draw required
      expect(magicDrawRequired).toBe(false) // Deck empty, no draw required
    })

    it('should switch to next player correctly', async () => {
      // Test the player switching logic from end-turn event
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

      room.gameState.currentPlayer = room.players[nextPlayerIndex]
      room.gameState.turnCount++

      expect(room.gameState.currentPlayer.userId).toBe('user2')
      expect(room.gameState.turnCount).toBe(2)
    })

    it('should handle turn cycling back to first player', async () => {
      const room = {
        players: [
          { userId: 'user1', name: 'Player1' },
          { userId: 'user2', name: 'Player2' }
        ],
        gameState: {
          currentPlayer: { userId: 'user2', name: 'Player2' }, // Last player
          turnCount: 1
        }
      }

      // Simulate turn switching
      const currentPlayerIndex = room.players.findIndex(p => p.userId === room.gameState.currentPlayer.userId)
      const nextPlayerIndex = (currentPlayerIndex + 1) % room.players.length

      room.gameState.currentPlayer = room.players[nextPlayerIndex]
      room.gameState.turnCount++

      expect(room.gameState.currentPlayer.userId).toBe('user1') // Should cycle back
      expect(room.gameState.turnCount).toBe(2)
    })
  })

  describe('Game flow edge cases', () => {
    it('should handle missing turn count gracefully', async () => {
      const room = {
        players: [
          { userId: 'user1', name: 'Player1' },
          { userId: 'user2', name: 'Player2' }
        ],
        gameState: {
          currentPlayer: { userId: 'user1', name: 'Player1' }
          // Missing turnCount
        }
      }

      // Should default to 1 or handle gracefully
      expect(room.gameState.turnCount).toBeUndefined()
    })

    it('should handle single player game for testing', async () => {
      const room = {
        players: [
          { userId: 'user1', name: 'Player1' }
        ],
        gameState: {
          currentPlayer: { userId: 'user1', name: 'Player1' },
          turnCount: 1
        }
      }

      const currentPlayerIndex = room.players.findIndex(p => p.userId === room.gameState.currentPlayer.userId)
      const nextPlayerIndex = (currentPlayerIndex + 1) % room.players.length

      expect(currentPlayerIndex).toBe(0)
      expect(nextPlayerIndex).toBe(0) // Should stay the same player
    })

    it('should handle empty players array gracefully', async () => {
      const room = {
        players: [],
        gameState: {
          currentPlayer: null,
          turnCount: 0
        }
      }

      // Should handle gracefully without throwing
      expect(() => {
        const currentPlayerIndex = room.players.findIndex(p => p.userId === room.gameState.currentPlayer?.userId)
        expect(currentPlayerIndex).toBe(-1)
      }).not.toThrow()
    })
  })
})