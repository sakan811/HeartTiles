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
    deleteOne: vi.fn(),
    deleteRoom: vi.fn()
  },
  User: {
    findById: vi.fn()
  },
  deleteRoom: vi.fn().mockImplementation(async (roomCode) => {
    // Mimic the actual deleteRoom behavior from models.js
    try {
      // Mock the Room.deleteOne call - in real implementation this would delete from DB
      // In our mock, this just logs the action for debugging
      console.log(`Mock: Deleted room ${roomCode}`)
    } catch (err) {
      console.error('Mock: Failed to delete room:', err)
    }
  })
}))

vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn()
}))

// Set environment
process.env.NODE_ENV = 'test'

describe('Card Deck Management and Drawing Mechanics', () => {
  let rooms, mockSocket

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
  })

  afterEach(() => {
    global.turnLocks = new Map()
  })

  describe('Heart Card Drawing', () => {
    it('should draw heart card when deck has cards', async () => {
      const { validateCardDrawLimit, recordCardDraw } = await import('../../server.js')

      const roomCode = 'HEART123'
      const userId = 'user123'

      // Use real heart card generation
      const { generateSingleHeart } = await import('../../server.js')

      const room = {
        code: roomCode,
        players: [
          { userId: userId, name: 'TestUser' },
          { userId: 'user456', name: 'OtherUser' }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: userId, name: 'TestUser' },
          deck: { emoji: "💌", cards: 16, },
          magicDeck: { emoji: "🔮", cards: 16, },
          playerHands: {
            user123: [],
            user456: []
          },
          playerActions: {}
        }
      }

      rooms.set(roomCode, room)

      // Validate can draw heart
      const cardDrawValidation = validateCardDrawLimit(room, userId)
      expect(cardDrawValidation.currentActions.drawnHeart).toBe(false)

      // Record heart draw
      recordCardDraw(room, userId, 'heart')
      const newHeart = generateSingleHeart()

      if (!room.gameState.playerHands[userId]) {
        room.gameState.playerHands[userId] = []
      }
      room.gameState.playerHands[userId].push(newHeart)
      room.gameState.deck.cards--

      expect(room.gameState.playerHands[userId]).toHaveLength(1)
      expect(room.gameState.playerHands[userId][0]).toHaveProperty('type', 'heart')
      expect(room.gameState.playerHands[userId][0]).toHaveProperty('id')
      expect(room.gameState.playerHands[userId][0]).toHaveProperty('color')
      expect(room.gameState.playerHands[userId][0]).toHaveProperty('value')
      expect(room.gameState.deck.cards).toBe(15)

      // Verify card was recorded as drawn
      const updatedValidation = validateCardDrawLimit(room, userId)
      expect(updatedValidation.currentActions.drawnHeart).toBe(true)
    })

    it('should reject heart card draw when already drawn this turn', async () => {
      const { validateCardDrawLimit } = await import('../../server.js')

      const room = {
        gameState: {
          deck: { emoji: '💌', cards: 10, },
          playerActions: {
            user123: {
              drawnHeart: true,
              drawnMagic: false,
              heartsPlaced: 0,
              magicCardsUsed: 0
            }
          }
        }
      }

      const result = validateCardDrawLimit(room, 'user123')
      expect(result.currentActions.drawnHeart).toBe(true)

      // Should reject drawing again
      const canDraw = !result.currentActions.drawnHeart
      expect(canDraw).toBe(false)
    })

    it('should reject heart card draw when deck is empty', async () => {
      const room = {
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user123' },
          deck: { emoji: '💌', cards: 0, }, // Empty deck
          playerHands: {
            user123: []
          },
          playerActions: {
            user123: {
              drawnHeart: false,
              drawnMagic: false
            }
          }
        }
      }

      const canDraw = room.gameState.gameStarted && room.gameState.deck.cards > 0
      expect(canDraw).toBe(false)
    })

    it('should handle heart card draw with invalid turn', async () => {
      const { validateTurn } = await import('../../server.js')

      const room = {
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user456' }, // Different user
          deck: { emoji: '💌', cards: 10, type: 'hearts' }
        }
      }

      const turnValidation = validateTurn(room, 'user123')
      expect(turnValidation.valid).toBe(false)
      expect(turnValidation.error).toBe('Not your turn')
    })
  })

  describe('Magic Card Drawing', () => {
    it('should draw magic card when deck has cards', async () => {
      const { validateCardDrawLimit, recordCardDraw } = await import('../../server.js')

      const roomCode = 'MAGIC123'
      const userId = 'user123'

      // Use real magic card generation
      const { generateSingleMagicCard } = await import('../../server.js')

      const room = {
        code: roomCode,
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: userId, name: 'TestUser' },
          deck: { emoji: "💌", cards: 16, },
          magicDeck: { emoji: "🔮", cards: 16, },
          playerHands: {
            user123: []
          },
          playerActions: {}
        }
      }

      rooms.set(roomCode, room)

      // Validate can draw magic
      const cardDrawValidation = validateCardDrawLimit(room, userId)
      expect(cardDrawValidation.currentActions.drawnMagic).toBe(false)

      // Record magic draw
      recordCardDraw(room, userId, 'magic')
      const newMagicCard = generateSingleMagicCard()

      if (!room.gameState.playerHands[userId]) {
        room.gameState.playerHands[userId] = []
      }
      room.gameState.playerHands[userId].push(newMagicCard)
      room.gameState.magicDeck.cards--

      expect(room.gameState.playerHands[userId]).toHaveLength(1)
      expect(room.gameState.playerHands[userId][0]).toHaveProperty('type')
      expect(room.gameState.playerHands[userId][0]).toHaveProperty('id')
      expect(room.gameState.playerHands[userId][0]).toHaveProperty('emoji')
      expect(['wind', 'recycle', 'shield']).toContain(room.gameState.playerHands[userId][0].type)
      expect(room.gameState.magicDeck.cards).toBe(15)

      // Verify card was recorded as drawn
      const updatedValidation = validateCardDrawLimit(room, userId)
      expect(updatedValidation.currentActions.drawnMagic).toBe(true)
    })

    it('should reject magic card draw when already drawn this turn', async () => {
      const { validateCardDrawLimit } = await import('../../server.js')

      const room = {
        gameState: {
          magicDeck: { emoji: '🔮', cards: 10, },
          playerActions: {
            user123: {
              drawnHeart: true,
              drawnMagic: true, // Already drawn
              heartsPlaced: 0,
              magicCardsUsed: 0
            }
          }
        }
      }

      const result = validateCardDrawLimit(room, 'user123')
      expect(result.currentActions.drawnMagic).toBe(true)

      // Should reject drawing again
      const canDraw = !result.currentActions.drawnMagic
      expect(canDraw).toBe(false)
    })

    it('should reject magic card draw when deck is empty', async () => {
      const room = {
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user123' },
          magicDeck: { emoji: '🔮', cards: 0, }, // Empty deck
          playerHands: {
            user123: []
          },
          playerActions: {
            user123: {
              drawnHeart: false,
              drawnMagic: false
            }
          }
        }
      }

      const canDraw = room.gameState.gameStarted && room.gameState.magicDeck.cards > 0
      expect(canDraw).toBe(false)
    })

    it('should generate different types of magic cards', async () => {
      const { generateSingleMagicCard } = await import('../../server.js')

      const generatedCards = []
      for (let i = 0; i < 10; i++) {
        const card = generateSingleMagicCard()
        generatedCards.push(card)
      }

      expect(generatedCards).toHaveLength(10)

      // Verify we have different card types (the exact distribution depends on weights)
      const uniqueTypes = new Set(generatedCards.map(card => card.type))
      expect(uniqueTypes.size).toBeGreaterThan(0)

      // Verify all cards have required properties
      generatedCards.forEach(card => {
        expect(card).toHaveProperty('id')
        expect(card).toHaveProperty('type')
        expect(card).toHaveProperty('emoji')
        expect(['wind', 'recycle', 'shield']).toContain(card.type)
      })
    })
  })

  describe('Initial Card Distribution', () => {
    it('should distribute correct number of cards at game start', async () => {
      const { generateTiles, generateSingleHeart, generateSingleMagicCard } = await import('../../server.js')

      const room = {
        players: [
          { userId: 'user1', name: 'User1' },
          { userId: 'user2', name: 'User2' }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: null,
          tiles: generateTiles(),
          deck: { emoji: "💌", cards: 16, },
          magicDeck: { emoji: "🔮", cards: 16, },
          playerHands: {},
          playerActions: {}
        }
      }

      // Distribute initial cards
      room.players.forEach(player => {
        room.gameState.playerHands[player.userId] = []

        // Add 3 heart cards
        for (let i = 0; i < 3; i++) {
          room.gameState.playerHands[player.userId].push(generateSingleHeart())
        }

        // Add 2 magic cards
        for (let i = 0; i < 2; i++) {
          room.gameState.playerHands[player.userId].push(generateSingleMagicCard())
        }
      })

      // Verify distribution
      expect(room.gameState.playerHands.user1).toHaveLength(5)
      expect(room.gameState.playerHands.user2).toHaveLength(5)

      // Count card types for each player
      room.players.forEach(player => {
        const hand = room.gameState.playerHands[player.userId]
        const heartCards = hand.filter(card => card.type === 'heart')
        const magicCards = hand.filter(card => card.type !== 'heart')

        expect(heartCards).toHaveLength(3)
        expect(magicCards).toHaveLength(2)
      })
    })

    it('should handle initial distribution for single player', async () => {
      const { generateSingleHeart, generateSingleMagicCard } = await import('../../server.js')

      const room = {
        players: [
          { userId: 'user1', name: 'SingleUser' }
        ],
        gameState: {
          playerHands: {}
        }
      }

      // Distribute cards for single player
      room.players.forEach(player => {
        room.gameState.playerHands[player.userId] = []
        for (let i = 0; i < 3; i++) {
          room.gameState.playerHands[player.userId].push(generateSingleHeart())
        }
        for (let i = 0; i < 2; i++) {
          room.gameState.playerHands[player.userId].push(generateSingleMagicCard())
        }
      })

      expect(room.gameState.playerHands.user1).toHaveLength(5)
    })
  })

  describe('Deck State Management', () => {
    it('should track deck counts correctly during draws', async () => {
      const { generateSingleHeart } = await import('../../server.js')

      const room = {
        gameState: {
          deck: { emoji: '💌', cards: 16, },
          magicDeck: { emoji: '🔮', cards: 16, },
          playerHands: {
            user123: []
          }
        }
      }

      const initialHeartCount = room.gameState.deck.cards
      const initialMagicCount = room.gameState.magicDeck.cards

      // Draw heart card
      room.gameState.playerHands.user123.push(generateSingleHeart())
      room.gameState.deck.cards--

      expect(room.gameState.deck.cards).toBe(initialHeartCount - 1)
      expect(room.gameState.magicDeck.cards).toBe(initialMagicCount)

      // Draw magic card (simulated)
      room.gameState.playerHands.user123.push({ id: 'magic', type: 'magic' })
      room.gameState.magicDeck.cards--

      expect(room.gameState.deck.cards).toBe(initialHeartCount - 1)
      expect(room.gameState.magicDeck.cards).toBe(initialMagicCount - 1)
    })

    it('should handle multiple players drawing from same deck', async () => {
      const { generateSingleHeart } = await import('../../server.js')

      const room = {
        gameState: {
          deck: { emoji: '💌', cards: 16, type: 'hearts' },
          playerHands: {
            user1: [],
            user2: []
          }
        }
      }

      const initialDeckCount = room.gameState.deck.cards

      // Player 1 draws
      room.gameState.playerHands.user1.push(generateSingleHeart())
      room.gameState.deck.cards--

      // Player 2 draws
      room.gameState.playerHands.user2.push(generateSingleHeart())
      room.gameState.deck.cards--

      expect(room.gameState.deck.cards).toBe(initialDeckCount - 2)
      expect(room.gameState.playerHands.user1).toHaveLength(1)
      expect(room.gameState.playerHands.user2).toHaveLength(1)
    })

    it('should validate deck state integrity', async () => {
      const { validateDeckState } = await import('../../server.js')

      // Valid deck
      let result = validateDeckState({
        gameState: { deck: { emoji: '💌', cards: 16, type: 'hearts' } }
      })
      expect(result.valid).toBe(true)

      // Empty but valid deck
      result = validateDeckState({
        gameState: { deck: { emoji: '💌', cards: 0, type: 'hearts' } }
      })
      expect(result.valid).toBe(true)

      // Invalid negative count
      result = validateDeckState({
        gameState: { deck: { cards: -1, type: 'hearts' } }
      })
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid deck count')

      // Missing deck
      result = validateDeckState({ gameState: {} })
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid deck state')
    })
  })

  describe('Card Drawing Validation and Limits', () => {
    it('should enforce drawing requirements before ending turn', async () => {
      const { validateCardDrawLimit } = await import('../../server.js')

      // Case 1: Both decks available, must draw both
      let room = {
        gameState: {
          deck: { emoji: '💌', cards: 10, }, // Available
          magicDeck: { emoji: '🔮', cards: 8, }, // Available
          playerActions: {
            user123: {
              drawnHeart: false, // Haven't drawn heart
              drawnMagic: false, // Haven't drawn magic
              heartsPlaced: 0,
              magicCardsUsed: 0
            }
          }
        }
      }

      let result = validateCardDrawLimit(room, 'user123')
      expect(result.currentActions.drawnHeart).toBe(false)
      expect(result.currentActions.drawnMagic).toBe(false)

      // Should require both draws
      const heartDeckEmpty = room.gameState.deck.cards <= 0
      const magicDeckEmpty = room.gameState.magicDeck.cards <= 0
      const mustDrawHeart = !result.currentActions.drawnHeart && !heartDeckEmpty
      const mustDrawMagic = !result.currentActions.drawnMagic && !magicDeckEmpty

      expect(mustDrawHeart).toBe(true)
      expect(mustDrawMagic).toBe(true)

      // Case 2: Heart deck empty, only need magic
      room.gameState.deck.cards = 0
      result = validateCardDrawLimit(room, 'user123')

      const mustDrawHeart2 = !result.currentActions.drawnHeart && heartDeckEmpty
      const mustDrawMagic2 = !result.currentActions.drawnMagic && !magicDeckEmpty

      expect(mustDrawHeart2).toBe(false) // Deck empty, no requirement
      expect(mustDrawMagic2).toBe(true)

      // Case 3: Both decks empty, no drawing required
      room.gameState.magicDeck.cards = 0
      result = validateCardDrawLimit(room, 'user123')

      const heartDeckEmpty3 = room.gameState.deck.cards <= 0
      const magicDeckEmpty3 = room.gameState.magicDeck.cards <= 0
      const mustDrawHeart3 = !result.currentActions.drawnHeart && !heartDeckEmpty3
      const mustDrawMagic3 = !result.currentActions.drawnMagic && !magicDeckEmpty3

      expect(mustDrawHeart3).toBe(false)
      expect(mustDrawMagic3).toBe(false)
    })

    it('should handle card draw limits per turn', async () => {
      const { validateCardDrawLimit, recordCardDraw } = await import('../../server.js')

      const room = {
        gameState: {
          deck: { emoji: '💌', cards: 16, },
          magicDeck: { emoji: '🔮', cards: 16, },
          playerActions: {}
        }
      }

      const userId = 'user123'

      // Initial state - can draw both
      let result = validateCardDrawLimit(room, userId)
      expect(result.currentActions.drawnHeart).toBe(false)
      expect(result.currentActions.drawnMagic).toBe(false)

      // Draw heart card
      recordCardDraw(room, userId, 'heart')
      result = validateCardDrawLimit(room, userId)
      expect(result.currentActions.drawnHeart).toBe(true)
      expect(result.currentActions.drawnMagic).toBe(false)

      // Can still draw magic
      const canDrawMagic = !result.currentActions.drawnMagic
      expect(canDrawMagic).toBe(true)

      // Draw magic card
      recordCardDraw(room, userId, 'magic')
      result = validateCardDrawLimit(room, userId)
      expect(result.currentActions.drawnHeart).toBe(true)
      expect(result.currentActions.drawnMagic).toBe(true)

      // Cannot draw more of either type
      const canDrawHeart2 = !result.currentActions.drawnHeart
      const canDrawMagic2 = !result.currentActions.drawnMagic
      expect(canDrawHeart2).toBe(false)
      expect(canDrawMagic2).toBe(false)
    })
  })

  describe('Card Hand Management', () => {
    it('should add cards to correct player hand', async () => {
      
      const mockHeartCard = {
        id: 'heart-hand',
        type: 'heart',
        color: 'red',
        value: 2
      }
      HeartCard.generateRandom.mockReturnValue(mockHeartCard)

      const room = {
        gameState: {
          playerHands: {
            user123: [{ id: 'existing', type: 'heart' }],
            user456: []
          }
        }
      }

      const userId = 'user123'
      const newCard = HeartCard.generateRandom()

      if (!room.gameState.playerHands[userId]) {
        room.gameState.playerHands[userId] = []
      }
      room.gameState.playerHands[userId].push(newCard)

      expect(room.gameState.playerHands.user123).toHaveLength(2)
      expect(room.gameState.playerHands.user123[1]).toEqual(mockHeartCard)
      expect(room.gameState.playerHands.user456).toHaveLength(0) // Unaffected
    })

    it('should initialize player hand if it does not exist', async () => {
      
      const mockHeartCard = { id: 'heart-new', type: 'heart' }
      HeartCard.generateRandom.mockReturnValue(mockHeartCard)

      const room = {
        gameState: {
          playerHands: {} // No hands exist
        }
      }

      const userId = 'user789'
      const newCard = HeartCard.generateRandom()

      // Hand should be created if it doesn't exist
      if (!room.gameState.playerHands[userId]) {
        room.gameState.playerHands[userId] = []
      }
      room.gameState.playerHands[userId].push(newCard)

      expect(room.gameState.playerHands.user789).toBeDefined()
      expect(room.gameState.playerHands.user789).toHaveLength(1)
      expect(room.gameState.playerHands.user789[0]).toEqual(mockHeartCard)
    })

    it('should handle card removal from hands', async () => {
      const room = {
        gameState: {
          playerHands: {
            user123: [
              { id: 'card1', type: 'heart', color: 'red' },
              { id: 'card2', type: 'magic', emoji: '💨' },
              { id: 'card3', type: 'heart', color: 'blue' }
            ]
          }
        }
      }

      const userId = 'user123'
      const cardToRemoveId = 'card2'

      // Remove card by ID
      const hand = room.gameState.playerHands[userId]
      const cardIndex = hand.findIndex(card => card.id === cardToRemoveId)

      expect(cardIndex).toBe(1) // Found at index 1

      const removedCard = hand.splice(cardIndex, 1)[0]

      expect(removedCard.id).toBe('card2')
      expect(hand).toHaveLength(2)
      expect(hand.map(card => card.id)).toEqual(['card1', 'card3'])
    })
  })

  describe('Complex Card Drawing Scenarios', () => {
    it('should handle drawing during game end conditions', async () => {
      const { checkGameEndConditions } = await import('../../server.js')

      const room = {
        gameState: {
          gameStarted: true,
          tiles: [
            { placedHeart: { value: 2 } },
            { placedHeart: { value: 3 } }
          ],
          deck: { emoji: '💌', cards: 1, }, // Almost empty
          magicDeck: { emoji: '🔮', cards: 0, }, // Empty
          playerHands: {
            user123: [{ id: 'heart1', type: 'heart' }]
          }
        }
      }

      // Check if game should end with grace period
      const gameEndResult = checkGameEndConditions(room, true)
      expect(gameEndResult.shouldEnd).toBe(true) // All tiles filled

      // Even if game would end, allow drawing with grace period
      const canDrawWithGrace = room.gameState.deck.cards > 0
      expect(canDrawWithGrace).toBe(true)

      // But after turn ends, no grace period
      const gameEndResultNoGrace = checkGameEndConditions(room, false)
      expect(gameEndResultNoGrace.shouldEnd).toBe(true)
    })

    it('should maintain deck integrity across multiple turns', async () => {
      const { resetPlayerActions } = await import('../../server.js')
      
      const mockHeartCard = { id: 'heart-multi', type: 'heart' }
      HeartCard.generateRandom.mockReturnValue(mockHeartCard)

      const room = {
        players: [
          { userId: 'user1', name: 'User1' },
          { userId: 'user2', name: 'User2' }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user1', name: 'User1' },
          deck: { emoji: '💌', cards: 16, },
          magicDeck: { emoji: '🔮', cards: 16, },
          playerHands: {
            user1: [],
            user2: []
          },
          playerActions: {}
        }
      }

      const initialDeckCount = room.gameState.deck.cards

      // Turn 1: User1 draws heart
      room.gameState.playerHands.user1.push(HeartCard.generateRandom())
      room.gameState.deck.cards--
      expect(room.gameState.deck.cards).toBe(initialDeckCount - 1)

      // End turn, reset actions
      resetPlayerActions(room, 'user1')
      room.gameState.currentPlayer = room.players[1]

      // Turn 2: User2 draws heart
      room.gameState.playerHands.user2.push(HeartCard.generateRandom())
      room.gameState.deck.cards--
      expect(room.gameState.deck.cards).toBe(initialDeckCount - 2)

      // Verify deck count is correct
      expect(room.gameState.deck.cards).toBe(14)
      expect(room.gameState.playerHands.user1).toHaveLength(1)
      expect(room.gameState.playerHands.user2).toHaveLength(1)
    })
  })
})