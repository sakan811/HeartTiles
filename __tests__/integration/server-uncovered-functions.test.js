import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { createServer } from 'node:http'
import { io as ioc } from 'socket.io-client'
import { Server } from 'socket.io'
import {
  connectToDatabase,
  disconnectDatabase,
  clearDatabase,
  clearTurnLocks
} from '../utils/server-test-utils.js'
import { Room } from '../../models.js'
import { createMockRoom, createMockUser, createMockGameState } from './setup.js'
import { HeartCard, WindCard, RecycleCard, ShieldCard } from '../../src/lib/cards.js'

function waitFor(socket, event) {
  return new Promise((resolve) => {
    socket.once(event, resolve)
  })
}

// Import functions directly from server.js for testing real implementation
let validateRoomState,
  generateTiles,
  recordHeartPlacement,
  recordMagicCardUsage,
  canPlaceMoreHearts,
  canUseMoreMagicCards,
  validateHeartPlacement

describe('Server Uncovered Functions Integration Tests', () => {
  let io, serverSocket, clientSocket

  beforeAll(async () => {
    // Set up Socket.IO server
    await new Promise((resolve) => {
      const httpServer = createServer()
      io = new Server(httpServer, {
        cors: {
          origin: "*",
          methods: ["GET", "POST"]
        }
      })

      httpServer.listen(() => {
        const port = httpServer.address().port
        clientSocket = ioc(`http://localhost:${port}`)
        io.on("connection", (socket) => {
          serverSocket = socket
        })
        clientSocket.on("connect", resolve)
      })
    })

    try {
      await connectToDatabase()
      // Import functions from server.js to test real implementation
      const serverModule = await import('../../server.js')
      validateRoomState = serverModule.validateRoomState
      generateTiles = serverModule.generateTiles
      recordHeartPlacement = serverModule.recordHeartPlacement
      recordMagicCardUsage = serverModule.recordMagicCardUsage
      canPlaceMoreHearts = serverModule.canPlaceMoreHearts
      canUseMoreMagicCards = serverModule.canUseMoreMagicCards
      validateHeartPlacement = serverModule.validateHeartPlacement
    } catch (error) {
      console.warn('Database connection failed, skipping tests:', error.message)
    }
  }, 15000)

  afterAll(async () => {
    // Clean up Socket.IO server
    if (io) io.close()
    if (clientSocket) clientSocket.disconnect()

    try {
      await clearDatabase()
      await disconnectDatabase()
    } catch (error) {
      console.warn('Database cleanup failed:', error.message)
    }
  })

  beforeEach(async () => {
    try {
      await clearDatabase()
      await clearTurnLocks()
    } catch (error) {
      console.warn('Database clear failed:', error.message)
    }
    vi.clearAllMocks()
  })

  describe('validateRoomState - Line 242 edge case', () => {
    it('should return invalid when gameStarted property is missing entirely and players array is empty', () => {
      // Create room state where gameStarted property doesn't exist at all (not undefined)
      const room = {
        players: [], // Empty players array
        gameState: {
          // gameStarted property completely missing
          tiles: [],
          deck: { hearts: [], magic: [] },
          playerHands: {},
          currentTurn: null,
          scores: {}
        }
      }

      const result = validateRoomState(room)

      expect(result.valid).toBe(false)
      expect(result.error).toBe("Invalid players state")
    })

    it('should return valid when gameStarted property is missing but players array is not empty', () => {
      const testUser = createMockUser()
      const room = {
        players: [testUser], // Non-empty players array
        gameState: {
          // gameStarted property completely missing
          tiles: [],
          deck: { hearts: [], magic: [] },
          playerHands: {},
          currentTurn: null,
          scores: {}
        }
      }

      const result = validateRoomState(room)

      expect(result.valid).toBe(true)
    })

    it('should return valid when gameStarted is explicitly undefined regardless of player count', () => {
      const room = {
        players: [], // Empty players array
        gameState: {
          gameStarted: undefined, // Explicitly undefined
          tiles: [],
          deck: { hearts: [], magic: [] },
          playerHands: {},
          currentTurn: null,
          scores: {}
        }
      }

      const result = validateRoomState(room)

      expect(result.valid).toBe(true)
    })
  })

  describe('generateTiles - Lines 443-447 fallback logic', () => {
    let originalMathRandom

    beforeEach(() => {
      originalMathRandom = Math.random
    })

    afterEach(() => {
      Math.random = originalMathRandom
    })

    it('should use fallback logic when Math.random returns undefined', () => {
      // Mock Math.random to return undefined
      Math.random = vi.fn().mockReturnValue(undefined)

      const tiles = generateTiles()

      expect(tiles).toBeDefined()
      expect(tiles).toHaveLength(8)
      expect(Math.random).toHaveBeenCalled()

      // Verify tiles have valid structure (generateTiles doesn't include placedHeart)
      tiles.forEach(tile => {
        expect(tile).toHaveProperty('id')
        expect(tile).toHaveProperty('color')
        expect(tile).toHaveProperty('emoji')
        expect(['white', 'red', 'yellow', 'green']).toContain(tile.color)
      })
    })

    it('should use fallback logic when Math.random returns null', () => {
      // Mock Math.random to return null
      Math.random = vi.fn().mockReturnValue(null)

      const tiles = generateTiles()

      expect(tiles).toBeDefined()
      expect(tiles).toHaveLength(8)
      expect(Math.random).toHaveBeenCalled()

      // Verify tiles have valid structure (generateTiles doesn't include placedHeart)
      tiles.forEach(tile => {
        expect(tile).toHaveProperty('id')
        expect(tile).toHaveProperty('color')
        expect(tile).toHaveProperty('emoji')
        expect(['white', 'red', 'yellow', 'green']).toContain(tile.color)
      })
    })

    it('should use fallback logic when Math.random is not available', () => {
      // Mock Math.random to be undefined (as if it doesn't exist)
      const originalRandom = Math.random
      Math.random = undefined

      const tiles = generateTiles()

      expect(tiles).toBeDefined()
      expect(tiles).toHaveLength(8)

      // Verify tiles have valid structure (generateTiles doesn't include placedHeart)
      tiles.forEach(tile => {
        expect(tile).toHaveProperty('id')
        expect(tile).toHaveProperty('color')
        expect(tile).toHaveProperty('emoji')
        expect(['white', 'red', 'yellow', 'green']).toContain(tile.color)
      })

      // Restore Math.random
      Math.random = originalRandom
    })
  })

  describe('recordHeartPlacement - Lines 522, 526 initialization', () => {
    it('should initialize playerActions object when missing (line 522)', () => {
      const testUser = createMockUser()
      const room = createMockRoom({
        players: [testUser],
        gameState: {
          ...createMockGameState(),
          // playerActions is completely missing
        }
      })

      recordHeartPlacement(room, testUser.userId)

      expect(room.gameState.playerActions).toBeDefined()
      expect(room.gameState.playerActions[testUser.userId]).toBeDefined()
      expect(room.gameState.playerActions[testUser.userId].heartsPlaced).toBe(1)
    })

    it('should initialize playerActions for userId when missing (line 526)', () => {
      const testUser = createMockUser()
      const room = createMockRoom({
        players: [testUser],
        gameState: {
          ...createMockGameState(),
          playerActions: {
            // Missing entry for testUser.userId
            'otherUserId': {
              drawnHeart: false,
              drawnMagic: false,
              heartsPlaced: 2,
              magicCardsUsed: 1
            }
          }
        }
      })

      recordHeartPlacement(room, testUser.userId)

      expect(room.gameState.playerActions[testUser.userId]).toBeDefined()
      expect(room.gameState.playerActions[testUser.userId].heartsPlaced).toBe(1)
      expect(room.gameState.playerActions[testUser.userId].drawnHeart).toBe(false)
      expect(room.gameState.playerActions[testUser.userId].drawnMagic).toBe(false)
      expect(room.gameState.playerActions[testUser.userId].magicCardsUsed).toBe(0)
    })

    it('should increment existing heartsPlaced count', () => {
      const testUser = createMockUser()
      const room = createMockRoom({
        players: [testUser],
        gameState: {
          ...createMockGameState(),
          playerActions: {
            [testUser.userId]: {
              drawnHeart: false,
              drawnMagic: false,
              heartsPlaced: 1,
              magicCardsUsed: 0
            }
          }
        }
      })

      recordHeartPlacement(room, testUser.userId)

      expect(room.gameState.playerActions[testUser.userId].heartsPlaced).toBe(2)
    })
  })

  describe('recordMagicCardUsage - Lines 539, 543 initialization', () => {
    it('should initialize playerActions object when missing (line 539)', () => {
      const testUser = createMockUser()
      const room = createMockRoom({
        players: [testUser],
        gameState: {
          ...createMockGameState(),
          // playerActions is completely missing
        }
      })

      recordMagicCardUsage(room, testUser.userId)

      expect(room.gameState.playerActions).toBeDefined()
      expect(room.gameState.playerActions[testUser.userId]).toBeDefined()
      expect(room.gameState.playerActions[testUser.userId].magicCardsUsed).toBe(1)
    })

    it('should initialize playerActions for userId when missing (line 543)', () => {
      const testUser = createMockUser()
      const room = createMockRoom({
        players: [testUser],
        gameState: {
          ...createMockGameState(),
          playerActions: {
            // Missing entry for testUser.userId
            'otherUserId': {
              drawnHeart: true,
              drawnMagic: false,
              heartsPlaced: 2,
              magicCardsUsed: 1
            }
          }
        }
      })

      recordMagicCardUsage(room, testUser.userId)

      expect(room.gameState.playerActions[testUser.userId]).toBeDefined()
      expect(room.gameState.playerActions[testUser.userId].magicCardsUsed).toBe(1)
      expect(room.gameState.playerActions[testUser.userId].drawnHeart).toBe(false)
      expect(room.gameState.playerActions[testUser.userId].drawnMagic).toBe(false)
      expect(room.gameState.playerActions[testUser.userId].heartsPlaced).toBe(0)
    })

    it('should increment existing magicCardsUsed count', () => {
      const testUser = createMockUser()
      const room = createMockRoom({
        players: [testUser],
        gameState: {
          ...createMockGameState(),
          playerActions: {
            [testUser.userId]: {
              drawnHeart: false,
              drawnMagic: false,
              heartsPlaced: 1,
              magicCardsUsed: 1
            }
          }
        }
      })

      recordMagicCardUsage(room, testUser.userId)

      expect(room.gameState.playerActions[testUser.userId].magicCardsUsed).toBe(2)
    })
  })

  describe('canPlaceMoreHearts - Line 556 fallback when playerActions undefined', () => {
    it('should return true when playerActions is undefined (line 556)', () => {
      const testUser = createMockUser()
      const room = createMockRoom({
        players: [testUser],
        gameState: {
          ...createMockGameState(),
          // playerActions is undefined
          playerActions: undefined
        }
      })

      const result = canPlaceMoreHearts(room, testUser.userId)

      expect(result).toBe(true)
    })

    it('should return true when gameState is undefined', () => {
      const testUser = createMockUser()
      const room = createMockRoom({
        players: [testUser],
        gameState: undefined
      })

      const result = canPlaceMoreHearts(room, testUser.userId)

      expect(result).toBe(true)
    })

    it('should return true when room is null/undefined', () => {
      const testUser = createMockUser()

      expect(canPlaceMoreHearts(null, testUser.userId)).toBe(true)
      expect(canPlaceMoreHearts(undefined, testUser.userId)).toBe(true)
    })

    it('should return false when player has already placed 2 hearts', () => {
      const testUser = createMockUser()
      const room = createMockRoom({
        players: [testUser],
        gameState: {
          ...createMockGameState(),
          playerActions: {
            [testUser.userId]: {
              drawnHeart: false,
              drawnMagic: false,
              heartsPlaced: 2,
              magicCardsUsed: 0
            }
          }
        }
      })

      const result = canPlaceMoreHearts(room, testUser.userId)

      expect(result).toBe(false)
    })

    it('should return true when player has placed less than 2 hearts', () => {
      const testUser = createMockUser()
      const room = createMockRoom({
        players: [testUser],
        gameState: {
          ...createMockGameState(),
          playerActions: {
            [testUser.userId]: {
              drawnHeart: false,
              drawnMagic: false,
              heartsPlaced: 1,
              magicCardsUsed: 0
            }
          }
        }
      })

      const result = canPlaceMoreHearts(room, testUser.userId)

      expect(result).toBe(true)
    })
  })

  describe('canUseMoreMagicCards - Line 564 fallback when playerActions undefined', () => {
    it('should return true when playerActions is undefined (line 564)', () => {
      const testUser = createMockUser()
      const room = createMockRoom({
        players: [testUser],
        gameState: {
          ...createMockGameState(),
          // playerActions is undefined
          playerActions: undefined
        }
      })

      const result = canUseMoreMagicCards(room, testUser.userId)

      expect(result).toBe(true)
    })

    it('should return true when gameState is undefined', () => {
      const testUser = createMockUser()
      const room = createMockRoom({
        players: [testUser],
        gameState: undefined
      })

      const result = canUseMoreMagicCards(room, testUser.userId)

      expect(result).toBe(true)
    })

    it('should return true when room is null/undefined', () => {
      const testUser = createMockUser()

      expect(canUseMoreMagicCards(null, testUser.userId)).toBe(true)
      expect(canUseMoreMagicCards(undefined, testUser.userId)).toBe(true)
    })

    it('should return false when player has already used 1 magic card', () => {
      const testUser = createMockUser()
      const room = createMockRoom({
        players: [testUser],
        gameState: {
          ...createMockGameState(),
          playerActions: {
            [testUser.userId]: {
              drawnHeart: false,
              drawnMagic: false,
              heartsPlaced: 1,
              magicCardsUsed: 1
            }
          }
        }
      })

      const result = canUseMoreMagicCards(room, testUser.userId)

      expect(result).toBe(false)
    })

    it('should return true when player has used 0 magic cards', () => {
      const testUser = createMockUser()
      const room = createMockRoom({
        players: [testUser],
        gameState: {
          ...createMockGameState(),
          playerActions: {
            [testUser.userId]: {
              drawnHeart: false,
              drawnMagic: false,
              heartsPlaced: 1,
              magicCardsUsed: 0
            }
          }
        }
      })

      const result = canUseMoreMagicCards(room, testUser.userId)

      expect(result).toBe(true)
    })
  })

  describe('validateHeartPlacement - Line 588 HeartCard instance branch', () => {
    let testRoom, testUser, heartCard

    beforeEach(() => {
      testUser = createMockUser()
      heartCard = new HeartCard('red', 2)

      testRoom = createMockRoom({
        players: [testUser],
        gameState: {
          ...createMockGameState(),
          playerHands: {
            [testUser.userId]: [heartCard]
          },
          tiles: [
            { id: 'tile1', color: 'red', placedHeart: { value: 0, color: null } },
            { id: 'tile2', color: 'white', placedHeart: { value: 0, color: null } }
          ]
        }
      })
    })

    it('should handle HeartCard instance with canTargetTile method (line 588)', () => {
      // Create a HeartCard that has the canTargetTile method
      const heartWithMethod = new HeartCard('red', 2)
      heartWithMethod.canTargetTile = vi.fn().mockReturnValue(true)

      testRoom.gameState.playerHands[testUser.userId] = [heartWithMethod]

      const result = validateHeartPlacement(testRoom, testUser.userId, heartWithMethod.id, 'tile1')

      expect(result.valid).toBe(true)
      expect(heartWithMethod.canTargetTile).toHaveBeenCalled()
    })

    it('should handle HeartCard instance without canTargetTile method', () => {
      // Create a plain HeartCard instance without canTargetTile method
      const plainHeartCard = new HeartCard('red', 2)
      delete plainHeartCard.canTargetTile

      testRoom.gameState.playerHands[testUser.userId] = [plainHeartCard]

      const result = validateHeartPlacement(testRoom, testUser.userId, plainHeartCard.id, 'tile1')

      expect(result.valid).toBe(true)
    })

    it('should handle plain object heart card', () => {
      // Create a plain object heart card
      const plainHeart = {
        id: 'heart-123',
        type: 'heart',
        color: 'red',
        value: 2
      }

      testRoom.gameState.playerHands[testUser.userId] = [plainHeart]

      const result = validateHeartPlacement(testRoom, testUser.userId, plainHeart.id, 'tile1')

      expect(result.valid).toBe(true)
    })
  })

  describe('validateHeartPlacement - Lines 600, 607 error cases', () => {
    let testRoom, testUser, heartCard

    beforeEach(() => {
      testUser = createMockUser()
      heartCard = new HeartCard('red', 2)
    })

    it('should return error for occupied tile (line 600)', () => {
      const occupiedTile = { id: 'tile1', color: 'red', placedHeart: { value: 2, color: 'red' } }

      testRoom = createMockRoom({
        players: [testUser],
        gameState: {
          ...createMockGameState(),
          playerHands: {
            [testUser.userId]: [heartCard]
          },
          tiles: [occupiedTile]
        }
      })

      const result = validateHeartPlacement(testRoom, testUser.userId, heartCard.id, 'tile1')

      expect(result.valid).toBe(false)
      expect(result.error).toBe("Tile is already occupied")
    })

    it('should return error for heart-tile combination when canTargetTile returns false (line 607)', () => {
      // Create a heart card that cannot target a specific tile
      const heartWithMethod = new HeartCard('red', 2)
      heartWithMethod.canTargetTile = vi.fn().mockReturnValue(false)

      const incompatibleTile = { id: 'tile1', color: 'yellow', placedHeart: { value: 0, color: null } }

      testRoom = createMockRoom({
        players: [testUser],
        gameState: {
          ...createMockGameState(),
          playerHands: {
            [testUser.userId]: [heartWithMethod]
          },
          tiles: [incompatibleTile]
        }
      })

      const result = validateHeartPlacement(testRoom, testUser.userId, heartWithMethod.id, 'tile1')

      expect(result.valid).toBe(false)
      expect(result.error).toBe("This heart cannot be placed on this tile")
      expect(heartWithMethod.canTargetTile).toHaveBeenCalledWith(incompatibleTile)
    })

    it('should return error for non-existent tile', () => {
      testRoom = createMockRoom({
        players: [testUser],
        gameState: {
          ...createMockGameState(),
          playerHands: {
            [testUser.userId]: [heartCard]
          },
          tiles: []
        }
      })

      const result = validateHeartPlacement(testRoom, testUser.userId, heartCard.id, 'non-existent-tile')

      expect(result.valid).toBe(false)
      expect(result.error).toBe("Tile not found")
    })

    it('should return error for non-heart card', () => {
      const windCard = new WindCard()

      testRoom = createMockRoom({
        players: [testUser],
        gameState: {
          ...createMockGameState(),
          playerHands: {
            [testUser.userId]: [windCard]
          },
          tiles: [
            { id: 'tile1', color: 'red', placedHeart: { value: 0, color: null } }
          ]
        }
      })

      const result = validateHeartPlacement(testRoom, testUser.userId, windCard.id, 'tile1')

      expect(result.valid).toBe(false)
      expect(result.error).toBe("Only heart cards can be placed on tiles")
    })

    it('should return error for card not in player hand', () => {
      const heartNotInHand = new HeartCard('red', 2)

      testRoom = createMockRoom({
        players: [testUser],
        gameState: {
          ...createMockGameState(),
          playerHands: {
            [testUser.userId]: [] // Empty hand
          },
          tiles: [
            { id: 'tile1', color: 'red', placedHeart: { value: 0, color: null } }
          ]
        }
      })

      const result = validateHeartPlacement(testRoom, testUser.userId, heartNotInHand.id, 'tile1')

      expect(result.valid).toBe(false)
      expect(result.error).toBe("Card not in player's hand")
    })
  })

  describe('Edge case combinations', () => {
    it('should handle multiple fallback scenarios in sequence', () => {
      const testUser = createMockUser()

      // Start with room missing gameState entirely
      let room = createMockRoom({
        players: [testUser]
        // gameState missing entirely
      })

      // Test canPlaceMoreHearts with missing gameState
      expect(canPlaceMoreHearts(room, testUser.userId)).toBe(true)

      // Test canUseMoreMagicCards with missing gameState
      expect(canUseMoreMagicCards(room, testUser.userId)).toBe(true)

      // Add gameState but missing playerActions
      room.gameState = createMockGameState()
      // playerActions still missing

      // Record actions should initialize everything
      recordHeartPlacement(room, testUser.userId)
      expect(room.gameState.playerActions[testUser.userId].heartsPlaced).toBe(1)

      recordMagicCardUsage(room, testUser.userId)
      expect(room.gameState.playerActions[testUser.userId].magicCardsUsed).toBe(1)
    })
  })
})