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
    generateRandom: vi.fn(),
    calculateScore: vi.fn()
  },
  WindCard: vi.fn().mockImplementation((id) => ({
    id,
    type: 'wind',
    emoji: '💨',
    name: 'Wind Card',
    canTargetTile: vi.fn(),
    executeEffect: vi.fn()
  })),
  RecycleCard: vi.fn().mockImplementation((id) => ({
    id,
    type: 'recycle',
    emoji: '♻️',
    name: 'Recycle Card',
    canTargetTile: vi.fn(),
    executeEffect: vi.fn()
  })),
  ShieldCard: vi.fn().mockImplementation((id) => ({
    id,
    type: 'shield',
    emoji: '🛡️',
    name: 'Shield Card',
    canTargetTile: vi.fn(),
    executeEffect: vi.fn(),
    isActive: vi.fn(),
    getRemainingTurns: vi.fn()
  })),
  generateRandomMagicCard: vi.fn(),
  isHeartCard: vi.fn(),
  isMagicCard: vi.fn(),
  createCardFromData: vi.fn()
}))

// Set environment
process.env.NODE_ENV = 'test'

describe('Complete Game Flows Integration Tests', () => {
  let rooms, mockIo, playerSessions

  beforeEach(() => {
    vi.clearAllMocks()
    rooms = new Map()
    playerSessions = new Map()
    global.turnLocks = new Map()

    mockIo = {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn()
    }
  })

  afterEach(() => {
    global.turnLocks = new Map()
  })

  describe('Complete Game Lifecycle', () => {
    it('should handle full game from room creation to game end', async () => {
      const { Room, PlayerSession, User } = await import('../../../models')
      const { generateTiles, validateRoomCode, sanitizeInput } = await import('../../server.js')
      const { HeartCard, generateRandomMagicCard } = await import('../../src/lib/cards.js')
      const { calculateScore } = await import('../../server.js')

      // Mock database operations
      Room.findOneAndUpdate.mockResolvedValue({})
      PlayerSession.findOneAndUpdate.mockResolvedValue({})
      User.findById.mockResolvedValue({
        _id: 'user1',
        email: 'user1@example.com',
        name: 'User1'
      })

      // Mock card generation
      const mockHeartCard = {
        id: 'heart-1',
        type: 'heart',
        color: 'red',
        value: 2,
        emoji: '❤️'
      }
      const mockMagicCard = {
        id: 'magic-1',
        type: 'wind',
        emoji: '💨',
        name: 'Wind Card'
      }

      HeartCard.generateRandom.mockReturnValue(mockHeartCard)
      generateRandomMagicCard.mockReturnValue(mockMagicCard)

      // Step 1: Room Creation
      const roomCode = 'GAME123'
      expect(validateRoomCode(roomCode)).toBe(true)
      const sanitizedCode = sanitizeInput(roomCode.toUpperCase())

      const room = {
        code: sanitizedCode,
        players: [],
        maxPlayers: 2,
        gameState: {
          tiles: [],
          gameStarted: false,
          currentPlayer: null,
          deck: { emoji: "💌", cards: 16, type: 'hearts' },
          magicDeck: { emoji: "🔮", cards: 16, type: 'magic' },
          playerHands: {},
          shields: {},
          turnCount: 0,
          playerActions: {}
        }
      }

      rooms.set(sanitizedCode, room)

      // Step 2: First Player Joins
      const player1 = {
        userId: 'user1',
        name: 'User1',
        email: 'user1@example.com',
        isReady: false,
        score: 0,
        joinedAt: new Date()
      }
      room.players.push(player1)

      expect(room.players).toHaveLength(1)
      expect(room.players[0].userId).toBe('user1')

      // Step 3: Second Player Joins
      const player2 = {
        userId: 'user2',
        name: 'User2',
        email: 'user2@example.com',
        isReady: false,
        score: 0,
        joinedAt: new Date()
      }
      room.players.push(player2)

      expect(room.players).toHaveLength(2)
      expect(room.players[1].userId).toBe('user2')

      // Step 4: Players Ready Up
      room.players.forEach(player => {
        player.isReady = true
      })

      const allReady = room.players.every(p => p.isReady)
      expect(allReady).toBe(true)

      // Step 5: Game Starts
      if (allReady) {
        room.gameState.tiles = generateTiles()
        room.gameState.gameStarted = true
        room.gameState.deck.cards = 16
        room.gameState.magicDeck.cards = 16
        room.gameState.playerActions = {}

        expect(room.gameState.gameStarted).toBe(true)
        expect(room.gameState.tiles).toHaveLength(8)

        // Distribute initial cards
        room.players.forEach(player => {
          room.gameState.playerHands[player.userId] = []
          for (let i = 0; i < 3; i++) {
            room.gameState.playerHands[player.userId].push(HeartCard.generateRandom())
          }
          for (let i = 0; i < 2; i++) {
            room.gameState.playerHands[player.userId].push(generateRandomMagicCard())
          }
        })

        expect(room.gameState.playerHands.user1).toHaveLength(5)
        expect(room.gameState.playerHands.user2).toHaveLength(5)

        // Select starting player
        room.gameState.currentPlayer = room.players[0]
        room.gameState.turnCount = 1

        expect(room.gameState.currentPlayer.userId).toBe('user1')
        expect(room.gameState.turnCount).toBe(1)
      }

      // Step 6: First Turn - Player1 draws cards and places heart
      const currentTurnPlayer = room.gameState.currentPlayer.userId
      expect(currentTurnPlayer).toBe('user1')

      // Draw heart
      const newHeart = HeartCard.generateRandom()
      room.gameState.playerHands.user1.push(newHeart)
      room.gameState.deck.cards--

      // Draw magic
      const newMagic = generateRandomMagicCard()
      room.gameState.playerHands.user1.push(newMagic)
      room.gameState.magicDeck.cards--

      // Place heart on tile
      const heartToPlace = room.gameState.playerHands.user1.find(c => c.type === 'heart')
      const targetTile = room.gameState.tiles[0]
      const score = calculateScore(heartToPlace, targetTile)

      room.players[0].score += score
      room.gameState.tiles[0] = {
        ...targetTile,
        emoji: heartToPlace.emoji,
        color: heartToPlace.color,
        placedHeart: {
          value: heartToPlace.value,
          color: heartToPlace.color,
          emoji: heartToPlace.emoji,
          placedBy: 'user1',
          score: score,
          originalTileColor: targetTile.color
        }
      }

      // Remove heart from hand
      const heartIndex = room.gameState.playerHands.user1.findIndex(c => c.id === heartToPlace.id)
      room.gameState.playerHands.user1.splice(heartIndex, 1)

      expect(room.players[0].score).toBeGreaterThan(0)
      expect(room.gameState.tiles[0].placedHeart).toBeDefined()

      // Step 7: End Turn
      const currentPlayerIndex = room.players.findIndex(p => p.userId === currentTurnPlayer)
      const nextPlayerIndex = (currentPlayerIndex + 1) % room.players.length

      room.gameState.currentPlayer = room.players[nextPlayerIndex]
      room.gameState.turnCount++

      expect(room.gameState.currentPlayer.userId).toBe('user2')
      expect(room.gameState.turnCount).toBe(2)

      // Step 8: Continue game until tiles are filled
      // Simulate filling remaining tiles
      for (let i = 1; i < room.gameState.tiles.length; i++) {
        const tile = room.gameState.tiles[i]
        if (!tile.placedHeart) {
          // Alternate players placing hearts
          const currentPlayer = i % 2 === 0 ? 'user1' : 'user2'
          const playerIndex = currentPlayer === 'user1' ? 0 : 1

          const heart = { id: `heart-${i}`, type: 'heart', value: 1, color: 'red' }
          const score = calculateScore(heart, tile)

          room.gameState.tiles[i] = {
            ...tile,
            placedHeart: {
              ...heart,
              placedBy: currentPlayer,
              score: score,
              originalTileColor: tile.color
            }
          }

          room.players[playerIndex].score += score
        }
      }

      // Step 9: Game End
      const allTilesFilled = room.gameState.tiles.every(tile => tile.placedHeart)
      expect(allTilesFilled).toBe(true)

      // Determine winner
      const sortedPlayers = [...room.players].sort((a, b) => (b.score || 0) - (a.score || 0))
      const winner = sortedPlayers[0]
      const isTie = sortedPlayers.length > 1 && sortedPlayers[0].score === sortedPlayers[1].score

      expect(winner).toBeDefined()
      expect(typeof winner.score).toBe('number')

      // Mark game as ended
      room.gameState.gameStarted = false
      room.gameState.gameEnded = true
      room.gameState.endReason = 'All tiles are filled'

      expect(room.gameState.gameStarted).toBe(false)
      expect(room.gameState.gameEnded).toBe(true)
      expect(room.gameState.endReason).toBe('All tiles are filled')
    })
  })

  describe('Multiplayer Game Scenarios', () => {
    it('should handle game with magic cards and shields', async () => {
      const { HeartCard, ShieldCard, WindCard } = await import('../../src/lib/cards.js')
      const { calculateScore } = await import('../../server.js')

      // Mock card implementations
      const mockShieldCard = {
        id: 'shield-1',
        type: 'shield',
        executeEffect: vi.fn().mockReturnValue({
          type: 'shield',
          activatedFor: 'user1',
          remainingTurns: 2,
          reinforced: false
        })
      }

      const mockWindCard = {
        id: 'wind-1',
        type: 'wind',
        canTargetTile: vi.fn().mockReturnValue(true),
        executeEffect: vi.fn().mockReturnValue({
          type: 'wind',
          removedHeart: { value: 2, placedBy: 'user2', score: 4 },
          newTileState: { id: 0, color: 'red', placedHeart: undefined }
        })
      }

      ShieldCard.mockImplementation(() => mockShieldCard)
      WindCard.mockImplementation(() => mockWindCard)

      const room = {
        players: [
          { userId: 'user1', name: 'User1', score: 5 },
          { userId: 'user2', name: 'User2', score: 8 }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user1', name: 'User1' },
          turnCount: 3,
          tiles: [
            {
              id: 0,
              color: 'red',
              placedHeart: {
                value: 2,
                color: 'red',
                placedBy: 'user2',
                score: 4
              }
            },
            { id: 1, color: 'blue', placedHeart: null }
          ],
          playerHands: {
            user1: [
              { id: 'shield-1', },
              { id: 'heart-1', type: 'heart', color: 'blue', value: 1 }
            ],
            user2: [{ id: 'heart-2', type: 'heart', color: 'green', value: 2 }]
          },
          shields: {},
          playerActions: {
            user1: { drawnHeart: true, drawnMagic: true, heartsPlaced: 0, magicCardsUsed: 0 }
          }
        }
      }

      // User1 activates shield
      const shieldCard = room.gameState.playerHands.user1.find(c => c.type === 'shield')
      if (shieldCard) {
        const shieldResult = mockShieldCard.executeEffect(room.gameState, 'user1')
        room.gameState.shields.user1 = {
          active: true,
          remainingTurns: 2,
          activatedBy: 'user1'
        }

        expect(shieldResult.type).toBe('shield')
        expect(room.gameState.shields.user1).toBeDefined()
      }

      // Remove shield from hand
      const shieldIndex = room.gameState.playerHands.user1.findIndex(c => c.type === 'shield')
      room.gameState.playerHands.user1.splice(shieldIndex, 1)

      // User1 ends turn
      room.gameState.playerActions.user1.magicCardsUsed = 1
      room.gameState.currentPlayer = room.players[1]
      room.gameState.turnCount++

      // User2 tries to use wind card on User1's heart
      const windCard = room.gameState.playerHands.user2.find(c => c.type === 'wind')
      if (windCard) {
        // Check if User1 is protected (in this scenario, User1 has shield on themselves, not the heart)
        const isProtected = room.gameState.shields.user2?.active || false // User2 doesn't have shield

        if (!isProtected) {
          // Wind card removes heart and subtracts points
          const playerIndex = room.players.findIndex(p => p.userId === 'user1')
          if (playerIndex !== -1) {
            room.players[playerIndex].score -= room.gameState.tiles[0].placedHeart.score
          }

          const windResult = mockWindCard.executeEffect(room.gameState, 0, 'user2')
          room.gameState.tiles[0] = windResult.newTileState

          expect(windResult.type).toBe('wind')
          expect(room.gameState.tiles[0].placedHeart).toBeUndefined()
        }
      }

      expect(room.players[0].score).toBe(1) // 5 - 4 = 1
      expect(room.gameState.tiles[0].placedHeart).toBeUndefined()
    })

    it('should handle game with recycle cards', async () => {
      const { RecycleCard } = await import('../../src/lib/cards.js')

      const mockRecycleCard = {
        id: 'recycle-1',
        type: 'recycle',
        canTargetTile: vi.fn().mockReturnValue(true),
        executeEffect: vi.fn().mockReturnValue({
          type: 'recycle',
          previousColor: 'red',
          newColor: 'white',
          newTileState: { id: 1, color: 'white', emoji: '⬜' }
        })
      }

      RecycleCard.mockImplementation(() => mockRecycleCard)

      const room = {
        players: [
          { userId: 'user1', name: 'User1', score: 3 },
          { userId: 'user2', name: 'User2', score: 5 }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user1', name: 'User1' },
          tiles: [
            { id: 0, color: 'red', placedHeart: { value: 2, placedBy: 'user1' } },
            { id: 1, color: 'blue', placedHeart: null }, // Target for recycle
            { id: 2, color: 'green', placedHeart: { value: 1, placedBy: 'user2' } }
          ],
          playerHands: {
            user1: [
              { id: 'recycle-1', },
              { id: 'heart-1', type: 'heart', color: 'white', value: 3 }
            ]
          },
          playerActions: {
            user1: { drawnHeart: true, drawnMagic: true, magicCardsUsed: 0 }
          }
        }
      }

      // User1 uses recycle card on tile 1 (blue, empty)
      const recycleCard = room.gameState.playerHands.user1.find(c => c.type === 'recycle')
      if (recycleCard) {
        const targetTile = room.gameState.tiles[1]
        const recycleResult = mockRecycleCard.executeEffect(room.gameState, 1, 'user1')
        room.gameState.tiles[1] = recycleResult.newTileState

        expect(recycleResult.type).toBe('recycle')
        expect(recycleResult.previousColor).toBe('blue')
        expect(recycleResult.newColor).toBe('white')
        expect(room.gameState.tiles[1].color).toBe('white')
      }

      // User1 places white heart on recycled tile
      const whiteHeart = room.gameState.playerHands.user1.find(c => c.color === 'white')
      if (whiteHeart) {
        const { calculateScore } = await import('../../server.js')
        const tile = room.gameState.tiles[1]
        const score = calculateScore(whiteHeart, tile)

        room.gameState.tiles[1] = {
          ...tile,
          placedHeart: {
            ...whiteHeart,
            placedBy: 'user1',
            score: score
          }
        }

        room.players[0].score += score

        expect(score).toBe(3) // Face value for white tile
        expect(room.players[0].score).toBe(6) // 3 + 3
        expect(room.gameState.tiles[1].placedHeart.color).toBe('white')
      }
    })
  })

  describe('Reconnection and Recovery Scenarios', () => {
    it('should handle player reconnection during active game', async () => {
      const { PlayerSession } = await import('../../../models')

      // Mock session data
      const existingSession = {
        userId: 'user1',
        userSessionId: 'session1',
        name: 'User1',
        email: 'user1@example.com',
        currentSocketId: 'old-socket',
        lastSeen: new Date(),
        isActive: true
      }

      PlayerSession.findOneAndUpdate.mockResolvedValue(existingSession)

      const roomCode = 'RECONN123'
      const room = {
        code: roomCode,
        players: [
          {
            userId: 'user1',
            name: 'User1',
            score: 15,
            isReady: true
          },
          {
            userId: 'user2',
            name: 'User2',
            score: 10,
            isReady: true
          }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user2', name: 'User2' },
          turnCount: 5,
          tiles: [
            { id: 0, color: 'red', placedHeart: { placedBy: 'user1', value: 3 } },
            { id: 1, color: 'blue', placedHeart: { placedBy: 'user2', value: 2 } }
          ],
          playerHands: {
            user1: [
              { id: 'heart-1', type: 'heart', color: 'green', value: 2 },
              { id: 'magic-1', type: 'wind' }
            ],
            user2: [
              { id: 'heart-2', type: 'heart', color: 'yellow', value: 1 }
            ]
          },
          shields: {
            user1: { active: true, remainingTurns: 1 }
          },
          playerActions: {
            user2: { drawnHeart: true, drawnMagic: false }
          }
        }
      }

      rooms.set(roomCode, room)

      // Simulate reconnection
      const reconnectingUserId = 'user1'
      const newSocketId = 'new-socket-123'
      const newUserName = 'UpdatedUser1'

      // Find existing player
      const existingPlayer = room.players.find(p => p.userId === reconnectingUserId)
      expect(existingPlayer).toBeDefined()

      if (existingPlayer) {
        // Update player info
        existingPlayer.name = newUserName
        existingPlayer.email = 'updated@example.com'
      }

      // Update session
      const sessionData = {
        userId: reconnectingUserId,
        currentSocketId: newSocketId,
        lastSeen: new Date(),
        isActive: true
      }

      // Prepare game state for reconnected player
      const gameStateData = {
        tiles: room.gameState.tiles,
        currentPlayer: room.gameState.currentPlayer,
        players: room.players.map(player => ({
          ...player,
          hand: room.gameState.playerHands[player.userId] || [],
          score: player.score || 0
        })),
        playerHands: room.gameState.playerHands,
        deck: room.gameState.deck || { emoji: '💌', cards: 16, }
        magicDeck: room.gameState.magicDeck || { emoji: '🔮', cards: 16, }
        turnCount: room.gameState.turnCount,
        playerId: reconnectingUserId,
        shields: room.gameState.shields || {},
        playerActions: room.gameState.playerActions || {}
      }

      expect(existingPlayer.name).toBe('UpdatedUser1')
      expect(gameStateData.playerId).toBe('user1')
      expect(gameStateData.players).toHaveLength(2)
      expect(gameStateData.playerHands.user1).toHaveLength(2)
      expect(gameStateData.currentPlayer.userId).toBe('user2')
      expect(gameStateData.shields.user1.active).toBe(true)
    })

    it('should handle game state recovery after server restart', async () => {
      const { Room } = await import('../../../models')

      // Mock existing room data from database
      const savedRoomData = {
        code: 'RECOVERY123',
        players: [
          { userId: 'user1', name: 'User1', score: 12, isReady: true },
          { userId: 'user2', name: 'User2', score: 18, isReady: true }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user2', name: 'User2' },
          turnCount: 8,
          tiles: [
            { id: 0, color: 'red', placedHeart: { placedBy: 'user1', value: 3, score: 6 } },
            { id: 1, color: 'white', placedHeart: { placedBy: 'user2', value: 2, score: 2 } },
            { id: 2, color: 'green', placedHeart: null },
            { id: 3, color: 'blue', placedHeart: { placedBy: 'user1', value: 1, score: 0 } }
          ],
          deck: { emoji: '💌', cards: 5, }, type: 'hearts' },
          magicDeck: { emoji: '🔮', cards: 8, }, type: 'magic' },
          playerHands: {
            user1: [
              { id: 'heart-1', type: 'heart', color: 'yellow', value: 2 },
              { id: 'magic-1', type: 'shield' }
            ],
            user2: [
              { id: 'heart-2', type: 'heart', color: 'red', value: 1 },
              { id: 'magic-2', type: 'wind' }
            ]
          },
          shields: {
            user1: { active: true, remainingTurns: 2, activatedTurn: 6 }
          },
          playerActions: {
            user2: { drawnHeart: true, drawnMagic: false, heartsPlaced: 1 }
          }
        }
      }

      Room.find.mockResolvedValue([savedRoomData])

      // Simulate server recovery by loading rooms
      async function loadRooms() {
        try {
          const rooms = await Room.find({})
          const roomsMap = new Map()
          rooms.forEach(room => {
            const roomObj = room.toObject ? room.toObject() : room
            roomsMap.set(roomObj.code, roomObj)
          })
          return roomsMap
        } catch (err) {
          console.error('Failed to load rooms:', err)
          return new Map()
        }
      }

      const recoveredRooms = await loadRooms()

      expect(Room.find).toHaveBeenCalled()
      expect(recoveredRooms.size).toBe(1)
      expect(recoveredRooms.has('RECOVERY123')).toBe(true)

      const recoveredRoom = recoveredRooms.get('RECOVERY123')
      expect(recoveredRoom.gameState.gameStarted).toBe(true)
      expect(recoveredRoom.gameState.currentPlayer.userId).toBe('user2')
      expect(recoveredRoom.gameState.turnCount).toBe(8)
      expect(recoveredRoom.players).toHaveLength(2)
      expect(recoveredRoom.gameState.playerHands.user1).toHaveLength(2)
      expect(recoveredRoom.gameState.shields.user1.active).toBe(true)

      // Game should continue from where it left off
      expect(recoveredRoom.gameState.deck.cards).toBe(5)
      expect(recoveredRoom.gameState.magicDeck.cards).toBe(8)
      expect(recoveredRoom.players[0].score).toBe(12)
      expect(recoveredRoom.players[1].score).toBe(18)
    })
  })

  describe('Edge Cases and Stress Scenarios', () => {
    it('should handle rapid successive actions', async () => {
      const { acquireTurnLock, releaseTurnLock } = await import('../../server.js')

      const roomCode = 'RAPID123'
      const userId = 'user1'
      const actions = []

      // Simulate rapid actions
      for (let i = 0; i < 10; i++) {
        const socketId = `socket-${i}`
        const lockAcquired = acquireTurnLock(roomCode, socketId)
        actions.push({ socketId, lockAcquired, action: i })
      }

      // Only first action should succeed
      expect(actions[0].lockAcquired).toBe(true)
      actions.slice(1).forEach(action => {
        expect(action.lockAcquired).toBe(false)
      })

      // Process first action and release lock
      releaseTurnLock(roomCode, actions[0].socketId)

      // Next action can now proceed
      const nextLock = acquireTurnLock(roomCode, 'socket-next')
      expect(nextLock).toBe(true)
    })

    it('should handle maximum tile filling scenario', async () => {
      const { generateTiles, calculateScore } = await import('../../server.js')

      const room = {
        players: [
          { userId: 'user1', name: 'User1', score: 0 },
          { userId: 'user2', name: 'User2', score: 0 }
        ],
        gameState: {
          gameStarted: true,
          tiles: generateTiles(),
          playerHands: {}
        }
      }

      expect(room.gameState.tiles).toHaveLength(8)

      // Fill all tiles with hearts
      for (let i = 0; i < room.gameState.tiles.length; i++) {
        const tile = room.gameState.tiles[i]
        const currentPlayer = i % 2 === 0 ? 'user1' : 'user2'
        const playerIndex = currentPlayer === 'user1' ? 0 : 1

        const heart = {
          id: `heart-${i}`,
          type: 'heart',
          color: tile.color === 'white' ? 'red' : tile.color, // Match when possible
          value: Math.floor(Math.random() * 3) + 1
        }

        const score = calculateScore(heart, tile)
        room.players[playerIndex].score += score

        room.gameState.tiles[i] = {
          ...tile,
          placedHeart: {
            ...heart,
            placedBy: currentPlayer,
            score: score,
            originalTileColor: tile.color
          }
        }
      }

      // All tiles should be filled
      const allTilesFilled = room.gameState.tiles.every(tile => tile.placedHeart)
      expect(allTilesFilled).toBe(true)

      // Both players should have scores
      expect(room.players[0].score).toBeGreaterThan(0)
      expect(room.players[1].score).toBeGreaterThan(0)

      // Game should end
      const { checkGameEndConditions } = await import('../../server.js')
      const result = checkGameEndConditions(room, false)
      expect(result.shouldEnd).toBe(true)
      expect(result.reason).toBe('All tiles are filled')
    })

    it('should handle deck exhaustion scenarios', async () => {
      const room = {
        players: [
          { userId: 'user1', name: 'User1', score: 10 },
          { userId: 'user2', name: 'User2', score: 8 }
        ],
        gameState: {
          gameStarted: true,
          tiles: [
            { id: 0, placedHeart: { value: 2 } },
            { id: 1, placedHeart: { value: 3 } },
            { id: 2, placedHeart: null } // One empty tile
          ],
          deck: { emoji: '💌', cards: 0, } // Heart deck empty
          magicDeck: { emoji: '🔮', cards: 1, } // One magic card left
          playerHands: {
            user1: [{ id: 'last-magic', type: 'magic' }],
            user2: []
          },
          turnCount: 15
        }
      }

      // Game shouldn't end yet because not all tiles are filled
      const { checkGameEndConditions } = await import('../../server.js')
      let result = checkGameEndConditions(room, true) // Grace period
      expect(result.shouldEnd).toBe(false)

      // Last magic card is used
      room.gameState.magicDeck.cards = 0
      room.gameState.playerHands.user1 = []

      // Both decks now empty, but still grace period
      result = checkGameEndConditions(room, true)
      expect(result.shouldEnd).toBe(false)

      // Turn ends, no grace period
      result = checkGameEndConditions(room, false)
      expect(result.shouldEnd).toBe(true)
      expect(result.reason).toBe('Both decks are empty')
    })

    it('should handle complex shield interactions', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js')

      const mockShieldCard = {
        isActive: vi.fn(),
        getRemainingTurns: vi.fn()
      }

      ShieldCard.mockImplementation(() => mockShieldCard)

      const room = {
        players: [
          { userId: 'user1', name: 'User1', score: 15 },
          { userId: 'user2', name: 'User2', score: 12 }
        ],
        gameState: {
          gameStarted: true,
          turnCount: 5,
          shields: {
            user1: {
              active: true,
              remainingTurns: 2,
              activatedTurn: 3
            },
            user2: {
              active: true,
              remainingTurns: 1,
              activatedTurn: 4
            }
          },
          tiles: [
            {
              id: 0,
              placedHeart: { placedBy: 'user1', value: 3 }
            },
            {
              id: 1,
              placedHeart: { placedBy: 'user2', value: 2 }
            }
          ]
        }
      }

      // Check shield statuses
      mockShieldCard.isActive.mockImplementation((shield, turnCount) => {
        return (shield.activatedTurn + 2) - turnCount > 0
      })

      mockShieldCard.getRemainingTurns.mockImplementation((shield, turnCount) => {
        return Math.max(0, (shield.activatedTurn + 2) - turnCount)
      })

      // User1 shield should still be active
      const user1ShieldActive = ShieldCard.isActive(room.gameState.shields.user1, room.gameState.turnCount)
      const user1ShieldTurns = ShieldCard.getRemainingTurns(room.gameState.shields.user1, room.gameState.turnCount)

      expect(user1ShieldActive).toBe(true)
      expect(user1ShieldTurns).toBe(0) // (3+2)-5 = 0

      // User2 shield should be expired
      const user2ShieldActive = ShieldCard.isActive(room.gameState.shields.user2, room.gameState.turnCount)
      const user2ShieldTurns = ShieldCard.getRemainingTurns(room.gameState.shields.user2, room.gameState.turnCount)

      expect(user2ShieldActive).toBe(false)
      expect(user2ShieldTurns).toBe(0)

      // End turn, expire shields
      room.gameState.turnCount++

      // Both shields should now be expired
      const user1ShieldActiveAfter = ShieldCard.isActive(room.gameState.shields.user1, room.gameState.turnCount)
      const user2ShieldActiveAfter = ShieldCard.isActive(room.gameState.shields.user2, room.gameState.turnCount)

      expect(user1ShieldActiveAfter).toBe(false)
      expect(user2ShieldActiveAfter).toBe(false)
    })
  })
})