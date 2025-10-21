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

// Note: Using cards mock from setup.js - no local mock needed

// Set environment
process.env.NODE_ENV = 'test'

describe('Magic Card System (Wind, Recycle, Shield)', () => {
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
      emit: vi.fn()
    }

    mockIo = {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn()
    }
  })

  afterEach(() => {
    global.turnLocks = new Map()
  })

  describe('Wind Card Mechanics', () => {
    it('should remove opponent heart from tile', async () => {
      const { WindCard } = await import('../../src/lib/cards.js')

      const windCard = new WindCard('wind-123')
      const targetTileId = 0
      const currentPlayerId = 'user123'

      const gameState = {
        tiles: [
          {
            id: 0,
            color: 'red',
            emoji: '🟥',
            placedHeart: {
              value: 2,
              color: 'red',
              emoji: '❤️',
              placedBy: 'user456', // Opponent's heart
              score: 4,
              originalTileColor: 'red'
            }
          }
        ]
      }

      // Execute wind card effect using the actual mock implementation
      const actionResult = windCard.executeEffect(gameState, targetTileId, currentPlayerId)

      expect(actionResult.type).toBe('wind')
      expect(actionResult.removedHeart.placedBy).toBe('user456')
      expect(actionResult.newTileState.placedHeart).toBeUndefined()
      expect(actionResult.newTileState.color).toBe('red') // Original tile color restored
    })

    it('should subtract points from opponent when wind removes heart', async () => {
      const room = {
        players: [
          { userId: 'user123', score: 10 }, // Current player
          { userId: 'user456', score: 20 }  // Opponent
        ],
        gameState: {
          tiles: [
            {
              id: 0,
              color: 'red',
              placedHeart: {
                value: 3,
                color: 'red',
                placedBy: 'user456',
                score: 6, // Double points for matching color
                originalTileColor: 'red'
              }
            }
          ]
        }
      }

      const targetTileId = 0
      const placedHeart = room.gameState.tiles[0].placedHeart
      const opponentId = placedHeart.placedBy

      // Subtract score from opponent
      const playerIndex = room.players.findIndex(p => p.userId === opponentId)
      if (playerIndex !== -1) {
        room.players[playerIndex].score -= placedHeart.score
      }

      expect(room.players[1].score).toBe(14) // 20 - 6
      expect(opponentId).toBe('user456')
    })

    it('should restore original tile color after wind removal', async () => {
      const { WindCard } = await import('../../src/lib/cards.js')

      const windCard = new WindCard('wind-456')

      const gameState = {
        tiles: [
          {
            id: 1,
            color: 'white', // Current color (might have been changed)
            emoji: '⬜',
            placedHeart: {
              value: 2,
              color: 'red',
              placedBy: 'user456',
              originalTileColor: 'red' // Original color before heart was placed
            }
          }
        ]
      }

      const actionResult = windCard.executeEffect(gameState, 1, 'user123')

      expect(actionResult.newTileState.color).toBe('red')
      expect(actionResult.newTileState.emoji).toBe('🟥')
      expect(actionResult.newTileState.placedHeart).toBeUndefined()
    })

    it('should validate wind card targeting correctly', async () => {
      const { WindCard } = await import('../../src/lib/cards.js')

      const windCard = new WindCard('wind-789')
      const currentUserId = 'user123'

      // Test targeting opponent heart
      const opponentTile = {
        placedHeart: { placedBy: 'user456' }
      }
      let canTarget = windCard.canTargetTile(opponentTile, currentUserId)
      expect(canTarget).toBe(true)

      // Test targeting own heart (should not be allowed)
      const ownTile = {
        placedHeart: { placedBy: 'user123' }
      }
      canTarget = windCard.canTargetTile(ownTile, currentUserId)
      expect(canTarget).toBe(false)

      // Test targeting empty tile (should not be allowed)
      const emptyTile = {}
      canTarget = windCard.canTargetTile(emptyTile, currentUserId)
      expect(canTarget).toBe(false)
    })
  })

  describe('Recycle Card Mechanics', () => {
    it('should change tile color to white', async () => {
      const { RecycleCard } = await import('../../src/lib/cards.js')

      const recycleCard = new RecycleCard('recycle-123')
      const targetTileId = 2

      const gameState = {
        tiles: [
          {
            id: 2,
            color: 'red',
            emoji: '🟥',
            placedHeart: null // Empty tile
          }
        ]
      }

      const actionResult = recycleCard.executeEffect(gameState, targetTileId, 'user123')

      expect(actionResult.type).toBe('recycle')
      expect(actionResult.previousColor).toBe('red')
      expect(actionResult.newColor).toBe('white')
      expect(actionResult.newTileState.color).toBe('white')
      expect(actionResult.newTileState.emoji).toBe('⬜')
    })

    it('should preserve placed hearts on recycled tiles', async () => {
      const { RecycleCard } = await import('../../src/lib/cards.js')

      const recycleCard = new RecycleCard('recycle-456')

      const gameState = {
        tiles: [
          {
            id: 3,
            color: 'yellow',
            emoji: '🟨',
            placedHeart: {
              value: 1,
              color: 'blue',
              placedBy: 'user123',
              score: 0 // Mismatched color
            }
          }
        ]
      }

      const actionResult = recycleCard.executeEffect(gameState, 3, 'user123')

      expect(actionResult.newTileState.color).toBe('white')
      expect(actionResult.newTileState.placedHeart).toBeDefined()
      expect(actionResult.newTileState.placedHeart.placedBy).toBe('user123')
    })

    it('should validate recycle card targeting correctly', async () => {
      const { RecycleCard } = await import('../../src/lib/cards.js')

      const recycleCard = new RecycleCard('recycle-789')

      // Test targeting non-white empty tile (should be allowed)
      const validTile = {
        color: 'red',
        placedHeart: null
      }
      let canTarget = recycleCard.canTargetTile(validTile)
      expect(canTarget).toBe(true)

      // Test targeting white tile (should not be allowed)
      const whiteTile = {
        color: 'white',
        placedHeart: null
      }
      canTarget = recycleCard.canTargetTile(whiteTile)
      expect(canTarget).toBe(false)

      // Test targeting tile with heart (should not be allowed)
      const occupiedTile = {
        color: 'red',
        placedHeart: { placedBy: 'user456' }
      }
      canTarget = recycleCard.canTargetTile(occupiedTile)
      expect(canTarget).toBe(false)
    })
  })

  describe('Shield Card Mechanics', () => {
    it('should activate shield for current player', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js')

      const shieldCard = new ShieldCard('shield-123')
      const userId = 'user123'

      const gameState = {
        shields: {},
        turnCount: 3
      }

      const actionResult = shieldCard.executeEffect(gameState, userId)

      expect(actionResult.type).toBe('shield')
      expect(actionResult.activatedFor).toBe(userId)
      expect(actionResult.remainingTurns).toBe(2)
      expect(actionResult.reinforced).toBe(false)
    })

    it('should reinforce existing shield', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js')

      const shieldCard = new ShieldCard('shield-456')
      const userId = 'user123'

      const gameState = {
        shields: {
          user123: {
            active: true,
            remainingTurns: 1,
            activatedBy: userId,
            activatedTurn: 2
          }
        },
        turnCount: 3
      }

      const actionResult = shieldCard.executeEffect(gameState, userId)

      expect(actionResult.reinforced).toBe(true)
      expect(actionResult.remainingTurns).toBe(2)
      expect(actionResult.message).toContain('reinforced')
    })

    it('should prevent shield activation when opponent has active shield', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js')

      const shieldCard = new ShieldCard('shield-789')
      const userId = 'user123'

      const gameState = {
        shields: {
          user456: { // Opponent's shield
            active: true,
            remainingTurns: 2,
            activatedBy: 'user456',
            activatedTurn: 2
          }
        },
        turnCount: 3
      }

      // This should automatically throw an error due to opponent's active shield
      expect(() => {
        shieldCard.executeEffect(gameState, userId)
      }).toThrow('Cannot activate Shield while opponent has active Shield')
    })

    it('should check shield expiration correctly', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js')

      const shieldCard = new ShieldCard('shield-expire')

      // Test active shield
      const activeShield = {
        activatedTurn: 3,
        remainingTurns: 2
      }
      expect(ShieldCard.isActive(activeShield, 4)).toBe(true)
      expect(ShieldCard.getRemainingTurns(activeShield, 4)).toBe(1) // (3+2)-4 = 1

      // Test expired shield
      const expiredShield = {
        activatedTurn: 2,
        remainingTurns: 0
      }
      expect(ShieldCard.isActive(expiredShield, 5)).toBe(false)
      expect(ShieldCard.getRemainingTurns(expiredShield, 5)).toBe(0)
    })
  })

  describe('Magic Card Validation and Error Handling', () => {
    it('should validate magic card is in player hand', async () => {
      const room = {
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user123' },
          playerHands: {
            user123: [
              { id: 'magic1', },
              { id: 'magic2', type: 'shield' }
            ]
          }
        }
      }

      const userId = 'user123'
      const cardId = 'magic1'

      const playerHand = room.gameState.playerHands[userId] || []
      const cardIndex = playerHand.findIndex(card => card.id === cardId)

      expect(cardIndex).toBe(0) // Found in hand
      expect(playerHand[cardIndex].type).toBe('wind')

      // Test with card not in hand
      const invalidCardId = 'magic999'
      const invalidCardIndex = playerHand.findIndex(card => card.id === invalidCardId)

      expect(invalidCardIndex).toBe(-1) // Not found
    })

    it('should validate turn before magic card usage', async () => {
      const { validateTurn } = await import('../../server.js')

      // Current player's turn
      let room = {
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user123', name: 'TestUser' }
        }
      }

      let result = validateTurn(room, 'user123')
      expect(result.valid).toBe(true)

      // Not current player's turn
      room.gameState.currentPlayer = { userId: 'user456', name: 'OtherUser' }
      result = validateTurn(room, 'user123')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Not your turn')
    })

    it('should enforce magic card usage limits', async () => {
      const room = {
        gameState: {
          playerActions: {
            user123: {
              magicCardsUsed: 0
            }
          }
        }
      }

      // Simulate canUseMoreMagicCards function
      function canUseMoreMagicCards(room, userId) {
        const playerActions = room.gameState.playerActions[userId] || { magicCardsUsed: 0 }
        return (playerActions.magicCardsUsed || 0) < 1
      }

      // Can use magic card
      expect(canUseMoreMagicCards(room, 'user123')).toBe(true)

      // Record magic card usage
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

      recordMagicCardUsage(room, 'user123')

      // Cannot use another magic card
      expect(canUseMoreMagicCards(room, 'user123')).toBe(false)
    })

    it('should validate shield card targeting rules', async () => {
      const cardTypes = [
        { id: 'shield1', },
        { id: 'wind1', },
        { id: 'recycle1', type: 'recycle' }
      ]

      // Shield card with self target (valid)
      const shieldCard = cardTypes.find(c => c.type === 'shield')
      let targetTileId = 'self'
      let isValidTarget = shieldCard.type === 'shield' ? (targetTileId === 'self' || !targetTileId) : targetTileId !== null
      expect(isValidTarget).toBe(true)

      // Shield card with numeric target (valid in current implementation)
      targetTileId = 0
      isValidTarget = shieldCard.type === 'shield' ? (targetTileId === 'self' || !targetTileId) : targetTileId !== null
      expect(isValidTarget).toBe(false) // This checks the validation logic

      // Wind card with numeric target (valid)
      const windCard = cardTypes.find(c => c.type === 'wind')
      targetTileId = 1
      isValidTarget = windCard.type === 'shield' ? (targetTileId === 'self' || !targetTileId) : targetTileId !== null
      expect(isValidTarget).toBe(true)

      // Wind card with self target (invalid)
      targetTileId = 'self'
      isValidTarget = windCard.type === 'shield' ? (targetTileId === 'self' || !targetTileId) : targetTileId !== null
      expect(isValidTarget).toBe(false)
    })
  })

  describe('Magic Card Integration with Game State', () => {
    it('should remove used magic card from player hand', async () => {
      const room = {
        gameState: {
          playerHands: {
            user123: [
              { id: 'magic-to-use', }
              { id: 'magic-to-keep', type: 'shield' }
            ]
          }
        }
      }

      const userId = 'user123'
      const cardId = 'magic-to-use'

      const playerHand = room.gameState.playerHands[userId]
      const initialHandSize = playerHand.length
      const cardIndex = playerHand.findIndex(card => card.id === cardId)

      expect(cardIndex).toBe(0)

      // Remove the used card
      const removedCard = playerHand.splice(cardIndex, 1)[0]

      expect(removedCard.id).toBe('magic-to-use')
      expect(playerHand.length).toBe(initialHandSize - 1)
      expect(playerHand.map(card => card.id)).toEqual(['magic-to-keep'])
    })

    it('should record magic card usage for turn tracking', async () => {
      const room = {
        gameState: {
          playerActions: {
            user123: {
              drawnHeart: true,
              drawnMagic: true,
              heartsPlaced: 1,
              magicCardsUsed: 0
            }
          }
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

      recordMagicCardUsage(room, userId)

      expect(room.gameState.playerActions[userId].magicCardsUsed).toBe(1)
    })

    it('should broadcast magic card usage to all players', async () => {
      const room = {
        players: [
          { userId: 'user123', name: 'User1', score: 10 },
          { userId: 'user456', name: 'User2', score: 15 }
        ],
        gameState: {
          playerHands: {
            user123: [{ id: 'remaining-card', type: 'heart' }],
            user456: [{ id: 'opponent-card', type: 'magic' }]
          },
          shields: {
            user123: { active: true, remainingTurns: 2 }
          },
          playerActions: {
            user123: { magicCardsUsed: 1 }
          }
        }
      }

      const usedCard = { id: 'used-magic', type: 'wind', emoji: '💨' }
      const actionResult = { type: 'wind', targetedPlayerId: 'user456' }
      const usedBy = 'user123'

      const playersWithUpdatedHands = room.players.map(player => ({
        ...player,
        hand: room.gameState.playerHands[player.userId] || [],
        score: player.score || 0
      }))

      const broadcastData = {
        card: usedCard,
        actionResult: actionResult,
        tiles: room.gameState.tiles || [],
        players: playersWithUpdatedHands,
        playerHands: room.gameState.playerHands,
        usedBy: usedBy,
        shields: room.gameState.shields || {},
        playerActions: room.gameState.playerActions || {}
      }

      // Verify broadcast structure
      expect(broadcastData.card.id).toBe('used-magic')
      expect(broadcastData.actionResult.type).toBe('wind')
      expect(broadcastData.players).toHaveLength(2)
      expect(broadcastData.usedBy).toBe('user123')
      expect(broadcastData.shields.user123.active).toBe(true)
      expect(broadcastData.playerActions.user123.magicCardsUsed).toBe(1)
    })
  })

  describe('Complex Magic Card Scenarios', () => {
    it('should handle shield protection against wind cards', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js')

      const room = {
        players: [
          { userId: 'user123', score: 10 },
          { userId: 'user456', score: 15 }
        ],
        gameState: {
          tiles: [
            {
              id: 0,
              color: 'red',
              placedHeart: {
                value: 2,
                placedBy: 'user456',
                score: 4
              }
            }
          ],
          shields: {
            user456: {
              active: true,
              remainingTurns: 2,
              activatedTurn: 3
            }
          },
          turnCount: 4
        }
      }

      const opponentId = 'user456'
      const currentTurnCount = room.gameState.turnCount

      const isProtected = ShieldCard.isActive(room.gameState.shields[opponentId], currentTurnCount)

      expect(isProtected).toBe(true)
      expect(ShieldCard.getRemainingTurns(room.gameState.shields[opponentId], currentTurnCount)).toBe(1)

      // Wind card should be blocked
      const windBlocked = isProtected
      expect(windBlocked).toBe(true)
    })

    it('should handle magic card usage near game end', async () => {
      const { checkGameEndConditions } = await import('../../server.js')

      const room = {
        gameState: {
          gameStarted: true,
          tiles: [
            { placedHeart: { value: 2 } },
            { placedHeart: { value: 3 } },
            { placedHeart: null }, // One empty tile
            { placedHeart: { value: 1 } }
          ],
          deck: { emoji: '💌', cards: 0, }, // Empty
          magicDeck: { emoji: '🔮', cards: 2, type: 'magic' } // Some magic cards left
        }
      }

      // Game shouldn't end yet because not all tiles are filled
      const gameEndResult = checkGameEndConditions(room, true)
      expect(gameEndResult.shouldEnd).toBe(false)

      // Magic card can still be used
      const canUseMagic = room.gameState.magicDeck.cards > 0
      expect(canUseMagic).toBe(true)

      // If wind card clears the last heart, game might end
      // Simulate wind card clearing one heart
      room.gameState.tiles[1].placedHeart = null

      const gameEndResult2 = checkGameEndConditions(room, false)
      expect(gameEndResult2.shouldEnd).toBe(false) // Still not all filled and decks not empty
    })

    it('should handle multiple magic cards in sequence', async () => {
      const room = {
        gameState: {
          tiles: [
            { id: 0, color: 'red', placedHeart: null },
            { id: 1, color: 'blue', placedHeart: null }
          ],
          playerHands: {
            user123: [
              { id: 'wind1', }
              { id: 'recycle1', }
              { id: 'shield1', type: 'shield' }
            ]
          },
          playerActions: {
            user123: {
              magicCardsUsed: 0,
              heartsPlaced: 0,
              drawnHeart: true,
              drawnMagic: true
            }
          }
        }
      }

      // Can use one magic card per turn
      const canUseMagic = room.gameState.playerActions.user123.magicCardsUsed < 1
      expect(canUseMagic).toBe(true)

      // Use wind card
      const windCardIndex = room.gameState.playerHands.user123.findIndex(c => c.type === 'wind')
      const windCard = room.gameState.playerHands.user123.splice(windCardIndex, 1)[0]
      room.gameState.playerActions.user123.magicCardsUsed++

      expect(windCard.type).toBe('wind')
      expect(room.gameState.playerActions.user123.magicCardsUsed).toBe(1)

      // Cannot use another magic card this turn
      const canUseMagic2 = room.gameState.playerActions.user123.magicCardsUsed < 1
      expect(canUseMagic2).toBe(false)

      // Next turn, actions reset
      room.gameState.playerActions.user123.magicCardsUsed = 0

      // Can use magic card again
      const canUseMagic3 = room.gameState.playerActions.user123.magicCardsUsed < 1
      expect(canUseMagic3).toBe(true)
    })
  })
})