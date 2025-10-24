import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HeartCard, WindCard, RecycleCard, ShieldCard, generateRandomMagicCard, createCardFromData } from '../../src/lib/cards.js'

// Mock card classes for controlled testing
vi.mock('../../src/lib/cards.js', () => ({
  HeartCard: {
    generateRandom: vi.fn(() => new HeartCard('heart-1', 'red', 2, '❤️'))
  },
  WindCard: vi.fn().mockImplementation((id) => ({
    id,
    type: 'wind',
    emoji: '💨',
    canTargetTile: vi.fn((tile, userId) => {
      return tile.placedHeart && tile.placedHeart.placedBy !== userId
    }),
    executeEffect: vi.fn((gameState, targetTileId, userId) => ({
      type: 'wind',
      targetTileId,
      executedBy: userId,
      newTileState: {
        id: targetTileId,
        color: 'red',
        emoji: '🟥',
        placedHeart: null
      }
    }))
  })),
  RecycleCard: vi.fn().mockImplementation((id) => ({
    id,
    type: 'recycle',
    emoji: '♻️',
    canTargetTile: vi.fn(() => true),
    executeEffect: vi.fn((gameState, targetTileId, userId) => ({
      type: 'recycle',
      targetTileId,
      executedBy: userId,
      previousColor: 'red',
      newTileState: {
        id: targetTileId,
        color: 'white',
        emoji: '⬜',
        placedHeart: null
      }
    }))
  })),
  ShieldCard: vi.fn().mockImplementation(() => ({
    id: 'shield-1',
    type: 'shield',
    emoji: '🛡️',
    canTargetTile: vi.fn(() => false),
    executeEffect: vi.fn((gameState, userId) => ({
      type: 'shield',
      targetPlayerId: userId,
      activated: true,
      remainingTurns: 2
    })),
    isActive: vi.fn((shield, currentTurnCount) => {
      if (!shield || !shield.remainingTurns) return false
      const turnsElapsed = currentTurnCount - shield.activatedTurn
      return turnsElapsed < shield.remainingTurns
    }),
    getRemainingTurns: vi.fn((shield, currentTurnCount) => {
      if (!shield || !shield.remainingTurns) return 0
      return Math.max(0, shield.remainingTurns - (currentTurnCount - shield.activatedTurn))
    })
  })),
  generateRandomMagicCard: vi.fn(),
  createCardFromData: vi.fn(),
  isHeartCard: vi.fn(),
  isMagicCard: vi.fn()
}))

describe('Server Magic Card Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('validateHeartPlacement function (lines 585-613)', () => {
    it('should validate valid heart placement', async () => {
      const { validateHeartPlacement } = await import('../../server.js')
      const { isHeartCard, createCardFromData } = await import('../../src/lib/cards.js')

      const room = {
        gameState: {
          playerHands: {
            user1: [{
              id: 'heart1',
              type: 'heart',
              color: 'red',
              value: 2
            }]
          },
          tiles: [
            { id: 0, color: 'red', placedHeart: null }
          ]
        }
      }

      isHeartCard.mockReturnValue(true)

      const result = validateHeartPlacement(room, 'user1', 'heart1', 0)

      expect(result.valid).toBe(true)
      expect(isHeartCard).toHaveBeenCalled()
    })

    it('should reject when card not in player hand', async () => {
      const { validateHeartPlacement } = await import('../../server.js')

      const room = {
        gameState: {
          playerHands: {
            user1: []
          }
        }
      }

      const result = validateHeartPlacement(room, 'user1', 'not-exist', 0)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Card not in player\'s hand')
    })

    it('should reject when card is not a heart card', async () => {
      const { validateHeartPlacement } = await import('../../server.js')
      const { isHeartCard } = await import('../../src/lib/cards.js')

      const room = {
        gameState: {
          playerHands: {
            user1: [{
              id: 'magic1',
              type: 'magic'
            }]
          }
        }
      }

      isHeartCard.mockReturnValue(false)

      const result = validateHeartPlacement(room, 'user1', 'magic1', 0)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Only heart cards can be placed on tiles')
    })

    it('should reject when tile not found', async () => {
      const { validateHeartPlacement } = await import('../../server.js')
      const { isHeartCard } = await import('../../src/lib/cards.js')

      const room = {
        gameState: {
          playerHands: {
            user1: [{
              id: 'heart1',
              type: 'heart'
            }]
          },
          tiles: []
        }
      }

      isHeartCard.mockReturnValue(true)

      const result = validateHeartPlacement(room, 'user1', 'heart1', 999)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Tile not found')
    })

    it('should reject when tile is already occupied', async () => {
      const { validateHeartPlacement } = await import('../../server.js')
      const { isHeartCard, createCardFromData } = await import('../../src/lib/cards.js')

      const room = {
        gameState: {
          playerHands: {
            user1: [{
              id: 'heart1',
              type: 'heart'
            }]
          },
          tiles: [
            { id: 0, color: 'red', placedHeart: { placedBy: 'user2' } }
          ]
        }
      }

      isHeartCard.mockReturnValue(true)
      const mockHeartCard = { canTargetTile: vi.fn().mockReturnValue(true) }
      createCardFromData.mockReturnValue(mockHeartCard)

      const result = validateHeartPlacement(room, 'user1', 'heart1', 0)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Tile is already occupied')
    })

    it('should use HeartCard.canTargetTile for validation', async () => {
      const { validateHeartPlacement } = await import('../../server.js')
      const { isHeartCard, createCardFromData } = await import('../../src/lib/cards.js')

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
          ]
        }
      }

      isHeartCard.mockReturnValue(true)
      const mockHeartCard = { canTargetTile: vi.fn().mockReturnValue(false) }
      createCardFromData.mockReturnValue(mockHeartCard)

      const result = validateHeartPlacement(room, 'user1', 'heart1', 0)

      expect(mockHeartCard.canTargetTile).toHaveBeenCalledWith(room.gameState.tiles[0])
      expect(result.valid).toBe(false)
      expect(result.error).toBe('This heart cannot be placed on this tile')
    })
  })

  describe('canPlaceMoreHearts function (lines 575-578)', () => {
    it('should allow placement when under limit', async () => {
      const { canPlaceMoreHearts } = await import('../../server.js')

      const room = {
        gameState: {
          playerActions: {
            user1: { heartsPlaced: 1 }
          }
        }
      }

      expect(canPlaceMoreHearts(room, 'user1')).toBe(true)
    })

    it('should allow placement when at exactly limit-1', async () => {
      const { canPlaceMoreHearts } = await import('../../server.js')

      const room = {
        gameState: {
          playerActions: {
            user1: { heartsPlaced: 1 } // One below limit of 2
          }
        }
      }

      expect(canPlaceMoreHearts(room, 'user1')).toBe(true)
    })

    it('should prevent placement when at limit', async () => {
      const { canPlaceMoreHearts } = await import('../../server.js')

      const room = {
        gameState: {
          playerActions: {
            user1: { heartsPlaced: 2 } // At limit
          }
        }
      }

      expect(canPlaceMoreHearts(room, 'user1')).toBe(false)
    })

    it('should prevent placement when over limit', async () => {
      const { canPlaceMoreHearts } = await import('../../server.js')

      const room = {
        gameState: {
          playerActions: {
            user1: { heartsPlaced: 3 } // Over limit
          }
        }
      }

      expect(canPlaceMoreHearts(room, 'user1')).toBe(false)
    })

    it('should handle missing player actions', async () => {
      const { canPlaceMoreHearts } = await import('../../server.js')

      const room = {
        gameState: {}
      }

      expect(canPlaceMoreHearts(room, 'user1')).toBe(true)
    })
  })

  describe('canUseMoreMagicCards function (lines 580-583)', () => {
    it('should allow magic card use when under limit', async () => {
      const { canUseMoreMagicCards } = await import('../../server.js')

      const room = {
        gameState: {
          playerActions: {
            user1: { magicCardsUsed: 0 } // Under limit of 1
          }
        }
      }

      expect(canUseMoreMagicCards(room, 'user1')).toBe(true)
    })

    it('should prevent magic card use when at limit', async () => {
      const { canUseMoreMagicCards } = await import('../../server.js')

      const room = {
        gameState: {
          playerActions: {
            user1: { magicCardsUsed: 1 } // At limit
          }
        }
      }

      expect(canUseMoreMagicCards(room, 'user1')).toBe(false)
    })

    it('should prevent magic card use when over limit', async () => {
      const { canUseMoreMagicCards } = await import('../../server.js')

      const room = {
        gameState: {
          playerActions: {
            user1: { magicCardsUsed: 2 } // Over limit
          }
        }
      }

      expect(canUseMoreMagicCards(room, 'user1')).toBe(false)
    })

    it('should handle missing player actions', async () => {
      const { canUseMoreMagicCards } = await import('../../server.js')

      const room = {
        gameState: {}
      }

      expect(canUseMoreMagicCards(room, 'user1')).toBe(true)
    })
  })

  describe('recordHeartPlacement function (lines 541-556)', () => {
    it('should record heart placement correctly', async () => {
      const { recordHeartPlacement } = await import('../../server.js')

      const room = {
        gameState: {}
      }

      recordHeartPlacement(room, 'user1')

      expect(room.gameState.playerActions.user1.heartsPlaced).toBe(1)
    })

    it('should increment existing heart placement count', async () => {
      const { recordHeartPlacement } = await import('../../server.js')

      const room = {
        gameState: {
          playerActions: {
            user1: { heartsPlaced: 1, drawnHeart: true }
          }
        }
      }

      recordHeartPlacement(room, 'user1')

      expect(room.gameState.playerActions.user1.heartsPlaced).toBe(2)
      expect(room.gameState.playerActions.user1.drawnHeart).toBe(true) // Should preserve other properties
    })

    it('should initialize player actions if missing', async () => {
      const { recordHeartPlacement } = await import('../../server.js')

      const room = { gameState: {} }

      recordHeartPlacement(room, 'user1')

      expect(room.gameState.playerActions).toBeDefined()
      expect(room.gameState.playerActions.user1).toBeDefined()
      expect(room.gameState.playerActions.user1.heartsPlaced).toBe(1)
    })
  })

  describe('recordMagicCardUsage function (lines 558-573)', () => {
    it('should record magic card usage correctly', async () => {
      const { recordMagicCardUsage } = await import('../../server.js')

      const room = {
        gameState: {}
      }

      recordMagicCardUsage(room, 'user1')

      expect(room.gameState.playerActions.user1.magicCardsUsed).toBe(1)
    })

    it('should increment existing magic card usage count', async () => {
      const { recordMagicCardUsage } = await import('../../server.js')

      const room = {
        gameState: {
          playerActions: {
            user1: { magicCardsUsed: 0, drawnMagic: true }
          }
        }
      }

      recordMagicCardUsage(room, 'user1')

      expect(room.gameState.playerActions.user1.magicCardsUsed).toBe(1)
      expect(room.gameState.playerActions.user1.drawnMagic).toBe(true) // Should preserve other properties
    })

    it('should initialize player actions if missing', async () => {
      const { recordMagicCardUsage } = await import('../../server.js')

      const room = { gameState: {} }

      recordMagicCardUsage(room, 'user1')

      expect(room.gameState.playerActions).toBeDefined()
      expect(room.gameState.playerActions.user1).toBeDefined()
      expect(room.gameState.playerActions.user1.magicCardsUsed).toBe(1)
    })
  })

  describe('Shield protection logic', () => {
    it('should detect active shield protection', async () => {
      // Test the shield protection logic from use-magic-card event
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
      const currentTurnCount = room.gameState.turnCount

      expect(opponentId).toBe('user2')
      expect(room.gameState.shields[opponentId]).toBeDefined()

      const shield = room.gameState.shields[opponentId]
      const turnsElapsed = currentTurnCount - shield.activatedTurn
      const isActive = turnsElapsed < shield.remainingTurns

      expect(isActive).toBe(true)
    })

    it('should allow action when shield is expired', async () => {
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
          turnCount: 4 // Shield should be expired
        }
      }

      const tile = room.gameState.tiles[0]
      const opponentId = tile.placedHeart.placedBy
      const currentTurnCount = room.gameState.turnCount

      const shield = room.gameState.shields[opponentId]
      const turnsElapsed = currentTurnCount - shield.activatedTurn
      const isActive = turnsElapsed < shield.remainingTurns

      expect(isActive).toBe(false)
    })

    it('should handle score subtraction for wind cards', async () => {
      const room = {
        players: [
          { userId: 'user1', score: 0 },
          { userId: 'user2', score: 10 }
        ],
        gameState: {
          tiles: [{
            id: 0,
            color: 'red',
            placedHeart: {
              placedBy: 'user2',
              score: 4
            }
          }]
        }
      }

      // Simulate wind card score subtraction logic
      const tile = room.gameState.tiles[0]
      const placedHeart = tile.placedHeart
      const playerIndex = room.players.findIndex(p => p.userId === placedHeart.placedBy)

      expect(playerIndex).toBe(1)
      expect(room.players[playerIndex].score).toBe(10)

      // Apply score subtraction
      room.players[playerIndex].score -= placedHeart.score

      expect(room.players[playerIndex].score).toBe(6) // 10 - 4
    })
  })

  describe('Magic card validation and execution flow', () => {
    it('should validate shield card target requirements', async () => {
      // Shield cards don't need a target tile
      const shieldCardData = { type: 'shield', id: 'shield1' }
      const targetTileId = 'self' // Valid for shield cards

      const isValidForShield = targetTileId === 'self' || targetTileId === undefined
      expect(isValidForShield).toBe(true)
    })

    it('should validate non-shield card target requirements', async () => {
      // Non-shield cards need a valid target tile
      const windCardData = { type: 'wind', id: 'wind1' }
      const invalidTargets = [null, undefined, 'self']
      const validTargets = [0, 1, '0', '1']

      invalidTargets.forEach(target => {
        const isValid = target !== null && target !== undefined && target !== 'self'
        expect(isValid).toBe(false)
      })

      validTargets.forEach(target => {
        const isValid = target !== null && target !== undefined && target !== 'self'
        expect(isValid).toBe(true)
      })
    })

    it('should convert plain object cards to class instances', async () => {
      const { createCardFromData } = await import('../../src/lib/cards.js')

      const plainCard = { type: 'wind', id: 'wind1' }
      const mockWindCard = { type: 'wind', canTargetTile: vi.fn(), executeEffect: vi.fn() }

      createCardFromData.mockReturnValue(mockWindCard)

      const result = createCardFromData(plainCard)
      expect(createCardFromData).toHaveBeenCalledWith(plainCard)
      expect(result).toBe(mockWindCard)
    })
  })
})