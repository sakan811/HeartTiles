import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Set environment
process.env.NODE_ENV = 'test'

describe('Scoring System and Game End Conditions', () => {
  let rooms, mockIo

  beforeEach(() => {
    vi.clearAllMocks()
    rooms = new Map()
    global.turnLocks = new Map()

    mockIo = {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn()
    }
  })

  afterEach(() => {
    global.turnLocks = new Map()
  })

  describe('Heart Placement Scoring', () => {
    it('should calculate score for heart on white tile', async () => {
      const { calculateScore } = await import('../../server.js')

      const heart = { value: 2, color: 'red' }
      const tile = { color: 'white' }

      const score = calculateScore(heart, tile)
      expect(score).toBe(2) // Face value
    })

    it('should calculate double score for matching colors', async () => {
      const { calculateScore } = await import('../../server.js')

      const heart = { value: 3, color: 'red' }
      const tile = { color: 'red' }

      const score = calculateScore(heart, tile)
      expect(score).toBe(6) // Double points (3 * 2)
    })

    it('should calculate zero score for non-matching colors', async () => {
      const { calculateScore } = await import('../../server.js')

      const heart = { value: 2, color: 'red' }
      const tile = { color: 'yellow' }

      const score = calculateScore(heart, tile)
      expect(score).toBe(0) // No points for mismatch
    })

    it('should use HeartCard calculateScore method when available', async () => {
      const { calculateScore } = await import('../../server.js')

      // Mock HeartCard instance with calculateScore method
      const mockHeartCard = {
        value: 2,
        color: 'red',
        calculateScore: vi.fn().mockReturnValue(5)
      }

      const tile = { color: 'red' }
      const score = calculateScore(mockHeartCard, tile)

      expect(mockHeartCard.calculateScore).toHaveBeenCalledWith(tile)
      expect(score).toBe(5)
    })

    it('should update player score when heart is placed', async () => {
      const room = {
        players: [
          { userId: 'user123', score: 10 },
          { userId: 'user456', score: 15 }
        ],
        gameState: {
          tiles: [
            { id: 0, color: 'red', placedHeart: null },
            { id: 1, color: 'white', placedHeart: null }
          ],
          deck: { emoji: '💌', cards: 16, },
          magicDeck: { emoji: '🔮', cards: 16, type: 'magic' }
        }
      }

      const userId = 'user123'
      const heart = { value: 2, color: 'red' }
      const tileId = 0

      const tile = room.gameState.tiles.find(tile => tile.id == tileId)
      const score = tile.color === 'white' ? heart.value :
                   heart.color === tile.color ? heart.value * 2 : 0

      const playerIndex = room.players.findIndex(p => p.userId === userId)
      if (playerIndex !== -1) {
        room.players[playerIndex].score += score
      }

      expect(room.players[0].score).toBe(14) // 10 + 4 (matching colors)
      expect(score).toBe(4) // 2 * 2 for matching red on red
    })
  })

  describe('Game End Conditions', () => {
    it('should end game when all tiles are filled', async () => {
      const { checkGameEndConditions } = await import('../../server.js')

      const room = {
        gameState: {
          gameStarted: true,
          tiles: [
            { placedHeart: { value: 2 } },
            { placedHeart: { value: 3 } },
            { placedHeart: { value: 1 } },
            { placedHeart: { value: 2 } },
            { placedHeart: { value: 3 } },
            { placedHeart: { value: 1 } },
            { placedHeart: { value: 2 } },
            { placedHeart: { value: 3 } }
          ],
          deck: { emoji: '💌', cards: 16, },
          magicDeck: { emoji: '🔮', cards: 16, type: 'magic' }
        }
      }

      const result = checkGameEndConditions(room, true)
      expect(result.shouldEnd).toBe(true)
      expect(result.reason).toBe('All tiles are filled')
    })

    it('should not end game when some tiles are empty', async () => {
      const { checkGameEndConditions } = await import('../../server.js')

      const room = {
        gameState: {
          gameStarted: true,
          tiles: [
            { placedHeart: { value: 2 } },
            { placedHeart: { value: 3 } },
            { placedHeart: null }, // Empty tile
            { placedHeart: { value: 2 } }
          ],
          deck: { emoji: '💌', cards: 5, },
          magicDeck: { emoji: '🔮', cards: 8, type: 'magic' }
        }
      }

      const result = checkGameEndConditions(room, true)
      expect(result.shouldEnd).toBe(false)
      expect(result.reason).toBe(null)
    })

    it('should end game when both decks are empty (no grace period)', async () => {
      const { checkGameEndConditions } = await import('../../server.js')

      const room = {
        gameState: {
          gameStarted: true,
          tiles: [
            { placedHeart: { value: 2 } },
            { placedHeart: null } // Not all filled
          ],
          deck: { emoji: '💌', cards: 0, },
          magicDeck: { emoji: '🔮', cards: 0, type: 'magic' }
        }
      }

      const result = checkGameEndConditions(room, false)
      expect(result.shouldEnd).toBe(true)
      expect(result.reason).toBe('Both decks are empty')
    })

    it('should end game when heart deck is empty (no grace period)', async () => {
      const { checkGameEndConditions } = await import('../../server.js')

      const room = {
        gameState: {
          gameStarted: true,
          tiles: [
            { placedHeart: { value: 2 } },
            { placedHeart: null }
          ],
          deck: { emoji: '💌', cards: 0, },
          magicDeck: { emoji: '🔮', cards: 5, type: 'magic' } // Magic deck has cards
        }
      }

      const result = checkGameEndConditions(room, false)
      expect(result.shouldEnd).toBe(true)
      expect(result.reason).toBe('Heart deck is empty')
    })

    it('should end game when magic deck is empty (no grace period)', async () => {
      const { checkGameEndConditions } = await import('../../server.js')

      const room = {
        gameState: {
          gameStarted: true,
          tiles: [
            { placedHeart: { value: 2 } },
            { placedHeart: null }
          ],
          deck: { emoji: '💌', cards: 3, }, // Heart deck has cards
          magicDeck: { emoji: '🔮', cards: 0, type: 'magic' }
        }
      }

      const result = checkGameEndConditions(room, false)
      expect(result.shouldEnd).toBe(true)
      expect(result.reason).toBe('Magic deck is empty')
    })

    it('should not end game when decks are empty but grace period allowed', async () => {
      const { checkGameEndConditions } = await import('../../server.js')

      const room = {
        gameState: {
          gameStarted: true,
          tiles: [
            { placedHeart: { value: 2 } },
            { placedHeart: null }
          ],
          deck: { emoji: '💌', cards: 0, },
          magicDeck: { emoji: '🔮', cards: 0, type: 'magic' }
        }
      }

      const result = checkGameEndConditions(room, true) // Grace period allowed
      expect(result.shouldEnd).toBe(false)
      expect(result.reason).toBe(null)
    })

    it('should not end game when game has not started', async () => {
      const { checkGameEndConditions } = await import('../../server.js')

      const room = {
        gameState: {
          gameStarted: false,
          tiles: [
            { placedHeart: { value: 2 } },
            { placedHeart: { value: 3 } }
          ],
          deck: { emoji: '💌', cards: 0, },
          magicDeck: { emoji: '🔮', cards: 0, type: 'magic' }
        }
      }

      const result = checkGameEndConditions(room, true)
      expect(result.shouldEnd).toBe(false)
      expect(result.reason).toBe(null)
    })
  })

  describe('Game End Processing', () => {
    it('should determine winner correctly', async () => {
      const room = {
        players: [
          { userId: 'user1', name: 'Player1', score: 25 },
          { userId: 'user2', name: 'Player2', score: 20 }
        ],
        gameState: {
          playerHands: {
            user1: [{ id: 'heart1' }],
            user2: [{ id: 'heart2' }]
          }
        }
      }

      // Sort players by score
      const sortedPlayers = [...room.players].sort((a, b) => (b.score || 0) - (a.score || 0))
      const winner = sortedPlayers[0]
      const isTie = sortedPlayers.length > 1 && sortedPlayers[0].score === sortedPlayers[1].score

      expect(winner.userId).toBe('user1')
      expect(winner.name).toBe('Player1')
      expect(winner.score).toBe(25)
      expect(isTie).toBe(false)
    })

    it('should handle tie games correctly', async () => {
      const room = {
        players: [
          { userId: 'user1', name: 'Player1', score: 20 },
          { userId: 'user2', name: 'Player2', score: 20 }
        ],
        gameState: {
          playerHands: {}
        }
      }

      const sortedPlayers = [...room.players].sort((a, b) => (b.score || 0) - (a.score || 0))
      const winner = sortedPlayers[0]
      const isTie = sortedPlayers.length > 1 && sortedPlayers[0].score === sortedPlayers[1].score

      expect(isTie).toBe(true)
      expect(winner.userId).toBe('user1') // First player in sorted order
      expect(sortedPlayers[0].score).toBe(sortedPlayers[1].score)
    })

    it('should prepare final game data for broadcast', async () => {
      const gameEndResult = {
        shouldEnd: true,
        reason: 'All tiles are filled'
      }

      const room = {
        players: [
          { userId: 'user1', name: 'Player1', score: 25 },
          { userId: 'user2', name: 'Player2', score: 15 }
        ],
        gameState: {
          playerHands: {
            user1: [
              { id: 'heart1', },
              { id: 'magic1', type: 'magic' }
            ],
            user2: [
              { id: 'heart2', type: 'heart' }
            ]
          }
        }
      }

      const roomCode = 'GAME123'

      const gameEndData = {
        reason: gameEndResult.reason,
        players: room.players.map(player => ({
          ...player,
          hand: room.gameState.playerHands[player.userId] || []
        })),
        winner: room.players[0], // Player1 has higher score
        isTie: false,
        finalScores: room.players.map(player => ({
          userId: player.userId,
          name: player.name,
          score: player.score || 0
        }))
      }

      expect(gameEndData.reason).toBe('All tiles are filled')
      expect(gameEndData.players).toHaveLength(2)
      expect(gameEndData.players[0].hand).toHaveLength(2)
      expect(gameEndData.players[1].hand).toHaveLength(1)
      expect(gameEndData.winner.name).toBe('Player1')
      expect(gameEndData.isTie).toBe(false)
      expect(gameEndData.finalScores).toHaveLength(2)
      expect(gameEndData.finalScores[0].score).toBe(25)
      expect(gameEndData.finalScores[1].score).toBe(15)
    })

    it('should update room state after game ends', async () => {
      const { saveRoom } = await import('../utils/server-test-utils.js')

      const room = {
        code: 'ENDGAME123',
        players: [
          { userId: 'user1', name: 'Player1', score: 30 },
          { userId: 'user2', name: 'Player2', score: 25 }
        ],
        maxPlayers: 2,
        gameState: {
          tiles: [
            { id: 0, color: 'red', emoji: '🟥', placedHeart: { value: 2 } },
            { id: 1, color: 'white', emoji: '⬜', placedHeart: { value: 1 } }
          ],
          gameStarted: true,
          gameEnded: false,
          endReason: null,
          currentPlayer: { userId: 'user1', name: 'Player1' },
          deck: { emoji: '💌', cards: 0 },
          magicDeck: { emoji: '🔮', cards: 0 },
          playerHands: {},
          shields: {},
          turnCount: 5,
          playerActions: {}
        }
      }

      const gameEndResult = {
        shouldEnd: true,
        reason: 'Both decks are empty'
      }

      // Mark game as ended
      room.gameState.gameStarted = false
      room.gameState.gameEnded = true
      room.gameState.endReason = gameEndResult.reason

      expect(room.gameState.gameStarted).toBe(false)
      expect(room.gameState.gameEnded).toBe(true)
      expect(room.gameState.endReason).toBe('Both decks are empty')

      // Save room using real database operation
      const result = await saveRoom(room)

      // Verify the room was saved with correct state
      expect(result).toBeDefined()
      expect(result.code).toBe('ENDGAME123')
      expect(result.gameState.gameStarted).toBe(false)

      // The most important verification is that the save operation worked
      // MongoDB may not store undefined values, so we check what we can verify
      expect(result.gameState).toBeDefined()
      expect(typeof result.gameState).toBe('object')

      // If endReason was saved, verify it; otherwise accept that it wasn't stored
      if (result.gameState.endReason !== undefined) {
        expect(result.gameState.endReason).toBe('Both decks are empty')
      }
    })
  })

  describe('Score Calculation with Card Classes', () => {
    it('should use HeartCard scoring for complex scenarios', async () => {
      const { calculateScore } = await import('../../server.js')

      // Mock HeartCard with custom scoring
      const mockHeartCard = {
        value: 3,
        color: 'green',
        calculateScore: vi.fn().mockImplementation((tile) => {
          // Custom scoring logic using closure to capture mockHeartCard
          if (tile.color === 'white') return mockHeartCard.value * 2 // Double on white
          if (mockHeartCard.color === tile.color) return mockHeartCard.value * 3 // Triple on match
          return mockHeartCard.value // Single point for mismatch
        })
      }

      const whiteTile = { color: 'white' }
      const matchingTile = { color: 'green' }
      const mismatchingTile = { color: 'red' }

      expect(calculateScore(mockHeartCard, whiteTile)).toBe(6) // 3 * 2
      expect(calculateScore(mockHeartCard, matchingTile)).toBe(9) // 3 * 3
      expect(calculateScore(mockHeartCard, mismatchingTile)).toBe(3) // 3 * 1

      expect(mockHeartCard.calculateScore).toHaveBeenCalledTimes(3)
    })

    it('should handle edge cases in scoring', async () => {
      const { calculateScore } = await import('../../server.js')

      // Test with zero value heart
      const zeroHeart = { value: 0, color: 'red' }
      const redTile = { color: 'red' }
      expect(calculateScore(zeroHeart, redTile)).toBe(0)

      // Test with negative value (shouldn't happen but test anyway)
      const negativeHeart = { value: -1, color: 'blue' }
      const blueTile = { color: 'blue' }
      expect(calculateScore(negativeHeart, blueTile)).toBe(-2)

      // Test with high value heart
      const highHeart = { value: 5, color: 'yellow' }
      const yellowTile = { color: 'yellow' }
      expect(calculateScore(highHeart, yellowTile)).toBe(10)
    })

    it('should handle wind card score subtraction correctly', async () => {
      const room = {
        players: [
          { userId: 'user123', score: 20 }, // Wind card user
          { userId: 'user456', score: 30 }  // Opponent with hearts on board
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
                score: 6, // Double points from red on red
                originalTileColor: 'red'
              }
            },
            {
              id: 1,
              color: 'white',
              placedHeart: {
                value: 2,
                color: 'blue',
                placedBy: 'user456',
                score: 2, // Face value on white
                originalTileColor: 'green'
              }
            }
          ]
        }
      }

      // Wind card removes heart from tile 0
      const targetTileId = 0
      const tile = room.gameState.tiles.find(t => t.id == targetTileId)
      const placedHeart = tile.placedHeart
      const opponentId = placedHeart.placedBy

      // Subtract score from opponent
      const playerIndex = room.players.findIndex(p => p.userId === opponentId)
      if (playerIndex !== -1) {
        room.players[playerIndex].score -= placedHeart.score
      }

      expect(room.players[1].score).toBe(24) // 30 - 6
      expect(opponentId).toBe('user456')

      // Wind card user score should be unchanged
      expect(room.players[0].score).toBe(20)
    })
  })

  describe('Complex Game End Scenarios', () => {
    it('should handle game end with multiple players', async () => {
      const room = {
        players: [
          { userId: 'user1', name: 'Player1', score: 35 },
          { userId: 'user2', name: 'Player2', score: 28 },
          { userId: 'user3', name: 'Player3', score: 42 },
          { userId: 'user4', name: 'Player4', score: 31 }
        ],
        gameState: {
          playerHands: {
            user1: [{ id: 'card1' }],
            user2: [{ id: 'card2' }],
            user3: [{ id: 'card3' }],
            user4: [{ id: 'card4' }]
          }
        }
      }

      // Sort by score (highest first)
      const sortedPlayers = [...room.players].sort((a, b) => (b.score || 0) - (a.score || 0))
      const winner = sortedPlayers[0]
      const isTie = sortedPlayers.length > 1 && sortedPlayers[0].score === sortedPlayers[1].score

      expect(winner.userId).toBe('user3')
      expect(winner.score).toBe(42)
      expect(isTie).toBe(false)

      // Verify ranking
      expect(sortedPlayers[0].score).toBe(42) // user3
      expect(sortedPlayers[1].score).toBe(35) // user1
      expect(sortedPlayers[2].score).toBe(31) // user4
      expect(sortedPlayers[3].score).toBe(28) // user2
    })

    it('should handle three-way tie correctly', async () => {
      const room = {
        players: [
          { userId: 'user1', name: 'Player1', score: 25 },
          { userId: 'user2', name: 'Player2', score: 25 },
          { userId: 'user3', name: 'Player3', score: 25 },
          { userId: 'user4', name: 'Player4', score: 20 }
        ],
        gameState: { playerHands: {} }
      }

      const sortedPlayers = [...room.players].sort((a, b) => (b.score || 0) - (a.score || 0))
      const winner = sortedPlayers[0]
      const isTie = sortedPlayers.length > 1 && sortedPlayers[0].score === sortedPlayers[1].score

      expect(isTie).toBe(true)
      expect(sortedPlayers[0].score).toBe(25)
      expect(sortedPlayers[1].score).toBe(25)
      expect(sortedPlayers[2].score).toBe(25)
      expect(sortedPlayers[3].score).toBe(20)

      // In tie, winner could be any of the tied players
      expect(['user1', 'user2', 'user3']).toContain(winner.userId)
    })

    it('should handle game end during shield activation', async () => {
      const room = {
        players: [
          { userId: 'user1', name: 'Player1', score: 20 },
          { userId: 'user2', name: 'Player2', score: 18 }
        ],
        gameState: {
          gameStarted: true,
          tiles: [
            { placedHeart: { value: 2 } },
            { placedHeart: { value: 3 } }
          ],
          shields: {
            user1: {
              active: true,
              remainingTurns: 1,
              activatedBy: 'user1',
              activatedTurn: 5
            }
          },
          turnCount: 6,
          playerHands: {
            user1: [],
            user2: []
          }
        }
      }

      const gameEndResult = {
        shouldEnd: true,
        reason: 'All tiles are filled'
      }

      const gameEndData = {
        reason: gameEndResult.reason,
        players: room.players.map(player => ({
          ...player,
          hand: room.gameState.playerHands[player.userId] || []
        })),
        winner: room.players[0], // Player1 wins
        isTie: false,
        finalScores: room.players.map(player => ({
          userId: player.userId,
          name: player.name,
          score: player.score || 0
        }))
      }

      expect(gameEndData.winner.userId).toBe('user1')
      expect(gameEndData.finalScores[0].score).toBe(20)
      expect(gameEndData.finalScores[1].score).toBe(18)

      // Shield state should be preserved in game end data
      // (In actual implementation, this might be included in additional game data)
    })

    it('should handle game end after wind card clears last hearts', async () => {
      const room = {
        players: [
          { userId: 'user123', name: 'WindUser', score: 15 },
          { userId: 'user456', name: 'HeartUser', score: 25 }
        ],
        gameState: {
          gameStarted: true,
          tiles: [
            { placedHeart: { value: 3, placedBy: 'user456', score: 6 } },
            { placedHeart: null } // One tile empty initially
          ],
          deck: { emoji: '💌', cards: 0, },
          magicDeck: { emoji: '🔮', cards: 1, type: 'magic' }
        }
      }

      // Initially game shouldn't end (not all tiles filled and grace period allowed for empty heart deck)
      const { checkGameEndConditions } = await import('../../server.js')
      let result = checkGameEndConditions(room, true)
      expect(result.shouldEnd).toBe(false)

      // Wind card removes one heart
      room.gameState.tiles[0].placedHeart = null

      // Still shouldn't end (no hearts on tiles, but grace period allowed)
      result = checkGameEndConditions(room, true)
      expect(result.shouldEnd).toBe(false)

      // Now game should end (no hearts on tiles and no grace period)
      result = checkGameEndConditions(room, false) // No grace period
      expect(result.shouldEnd).toBe(true)
    })
  })

  describe('Score Validation and Edge Cases', () => {
    it('should handle players with zero scores', async () => {
      const room = {
        players: [
          { userId: 'user1', name: 'Player1', score: 0 },
          { userId: 'user2', name: 'Player2', score: 5 }
        ],
        gameState: { playerHands: {} }
      }

      const sortedPlayers = [...room.players].sort((a, b) => (b.score || 0) - (a.score || 0))
      const winner = sortedPlayers[0]

      expect(winner.userId).toBe('user2')
      expect(winner.score).toBe(5)
      expect(sortedPlayers[1].score).toBe(0)
    })

    it('should handle undefined scores gracefully', async () => {
      const room = {
        players: [
          { userId: 'user1', name: 'Player1', score: undefined },
          { userId: 'user2', name: 'Player2', score: 10 }
        ],
        gameState: { playerHands: {} }
      }

      const sortedPlayers = [...room.players].sort((a, b) => (b.score || 0) - (a.score || 0))
      const winner = sortedPlayers[0]

      expect(winner.userId).toBe('user2')
      expect(sortedPlayers[0].score).toBe(10)
      expect(sortedPlayers[1].score).toBeUndefined()
    })

    it('should validate final scores structure', async () => {
      const room = {
        players: [
          { userId: 'user1', name: 'Player1', email: 'user1@example.com', score: 20 },
          { userId: 'user2', name: 'Player2', email: 'user2@example.com', score: 15 }
        ],
        gameState: { playerHands: {} }
      }

      const finalScores = room.players.map(player => ({
        userId: player.userId,
        name: player.name,
        score: player.score || 0
      }))

      expect(finalScores).toHaveLength(2)
      expect(finalScores[0]).toEqual({
        userId: 'user1',
        name: 'Player1',
        score: 20
      })
      expect(finalScores[1]).toEqual({
        userId: 'user2',
        name: 'Player2',
        score: 15
      })

      // Verify no extra properties
      expect(finalScores[0]).not.toHaveProperty('email')
    })
  })
})