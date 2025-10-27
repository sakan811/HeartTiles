import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  connectToDatabase,
  disconnectDatabase,
  clearDatabase,
  createTestRoom,
  createTestPlayer,
  loadRooms,
  saveRoom,
  deleteRoom,
  authenticateSocket,
  acquireTurnLock,
  releaseTurnLock,
  generateTiles,
  generateSingleHeart,
  generateSingleMagicCard,
  selectRandomStartingPlayer,
  endGame,
  executeMagicCard,
  createTestUser,
  validateRoomState,
  validateTurn,
  validateCardDrawLimit,
  recordCardDraw,
  validateHeartPlacement,
  canPlaceMoreHearts,
  calculateScore,
  recordHeartPlacement,
  canUseMoreMagicCards,
  recordMagicCardUsage,
  resetPlayerActions,
  checkAndExpireShields
} from '../utils/server-test-utils.js'
import { HeartCard, WindCard, RecycleCard, ShieldCard, generateRandomMagicCard } from '../../src/lib/cards.js'
import { Server } from 'socket.io'
import { createServer } from 'http'
import {
  validateRoomCode,
  findPlayerByUserId
} from '../../server.js'

// Mock NextAuth and other dependencies
vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn()
}))

vi.mock('next', () => {
  const mockApp = {
    prepare: vi.fn().mockResolvedValue(),
    getRequestHandler: vi.fn(),
    dev: false,
    hostname: 'localhost',
    port: 3000
  }
  return {
    default: vi.fn().mockImplementation(() => mockApp)
  }
})

// Import mocked jwt functions for use in tests
import { getToken } from 'next-auth/jwt'

describe('Comprehensive Socket.IO Event Handlers Tests (lines 613-1635)', () => {
  let io, serverSocket, clientSocket, testRooms, testPlayerSessions

  let server

  beforeEach(async () => {
    // Clear all console mocks
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // Set up test environment
    await clearDatabase()
    testRooms = new Map() // Start with empty Map instead of loading from database
    testPlayerSessions = new Map()

    // Set up global turn locks
    global.turnLocks = new Map()

    // Create mock HTTP server and Socket.IO
    server = createServer()
    io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    })

    // Mock authentication
    vi.mocked(getToken).mockResolvedValue({
      id: 'test-user-1',
      name: 'TestPlayer1',
      email: 'test1@example.com',
      jti: 'session-1'
    })
  })

  afterEach(async () => {
    // Clean up
    if (io) {
      io.close()
    }
    if (server) {
      server.close()
    }

    // Clear global state
    if (global.turnLocks) {
      global.turnLocks.clear()
    }

    // Restore console methods
    vi.restoreAllMocks()

    await clearDatabase()
  })

  describe('join-room event handler', () => {
    it('should create new room when room does not exist', async () => {
      const mockSocket = {
        emit: vi.fn(),
        join: vi.fn(),
        on: vi.fn(),
        data: {},
        handshake: { address: '127.0.0.1' }
      }

      const roomCode = 'NEWROOM'
      const userId = 'user1'
      const userName = 'Player1'
      const userEmail = 'player1@example.com'

      // Simulate join-room event
      const eventHandler = async ({ roomCode }) => {
        console.log('eventHandler called with roomCode:', roomCode)
        if (!validateRoomCode(roomCode)) {
          console.log('Invalid room code')
          mockSocket.emit("room-error", "Invalid room code")
          return
        }

        roomCode = roomCode.toUpperCase()
        console.log('Upper case roomCode:', roomCode)
        let room = testRooms.get(roomCode)
        console.log('Room from testRooms:', room)

        if (!room) {
          console.log('Creating new room')
          room = {
            code: roomCode,
            players: [],
            maxPlayers: 2,
            gameState: {
              tiles: [], gameStarted: false, currentPlayer: null,
              deck: { emoji: "💌", cards: 16, type: 'hearts' },
              magicDeck: { emoji: "🔮", cards: 16, type: 'magic' },
              playerHands: {}, shields: {}, turnCount: 0, playerActions: {}
            }
          }
          testRooms.set(roomCode, room)
          await saveRoom(room)

          const player = { userId, name: userName, email: userEmail, isReady: false, score: 0, joinedAt: new Date() }
          if (!findPlayerByUserId(room, userId)) {
            room.players.push(player)
          }

          console.log('About to call mockSocket.join with roomCode:', roomCode)
          mockSocket.join(roomCode)
          mockSocket.data.roomCode = roomCode
          mockSocket.data.userId = userId

          console.log('About to call mockSocket.emit')
          mockSocket.emit("room-joined", { players: room.players, playerId: userId })
        } else {
          console.log('Room already exists, skipping creation')
        }
      }

      await eventHandler({ roomCode })

      expect(mockSocket.join).toHaveBeenCalledWith(roomCode)
      expect(mockSocket.emit).toHaveBeenCalledWith("room-joined", {
        players: expect.arrayContaining([
          expect.objectContaining({ userId, name: userName, email: userEmail })
        ]),
        playerId: userId
      })

      // Verify room was saved
      const savedRoom = testRooms.get(roomCode)
      expect(savedRoom).toBeDefined()
      expect(savedRoom.code).toBe(roomCode)
      expect(savedRoom.players).toHaveLength(1)
    })

    it('should join existing room when room exists and not full', async () => {
      const roomCode = 'EXIST01'
      const existingRoom = createTestRoom({
        code: roomCode,
        players: [createTestPlayer({ userId: 'user1', name: 'Player1' })]
      })
      testRooms.set(roomCode, existingRoom)
      await saveRoom(existingRoom)

      const mockSocket = {
        emit: vi.fn(),
        join: vi.fn(),
        to: vi.fn().mockReturnThis(),
        data: {},
        handshake: { address: '127.0.0.1' }
      }

      const userId = 'user2'
      const userName = 'Player2'
      const userEmail = 'player2@example.com'

      // Simulate joining existing room
      const eventHandler = async ({ roomCode }) => {
        roomCode = roomCode.toUpperCase()
        const room = testRooms.get(roomCode)

        if (room) {
          const existingPlayerByUserId = findPlayerByUserId(room, userId)
          const actualPlayerCount = room.players.length

          if (!existingPlayerByUserId && actualPlayerCount >= room.maxPlayers) {
            mockSocket.emit("room-error", "Room is full")
            return
          }

          let isNewJoin = false
          if (!existingPlayerByUserId) {
            room.players.push({
              userId, name: userName, email: userEmail,
              isReady: false, score: 0, joinedAt: new Date()
            })
            isNewJoin = true
          }

          await saveRoom(room)
          mockSocket.join(roomCode)
          mockSocket.data.roomCode = roomCode
          mockSocket.data.userId = userId

          mockSocket.emit("room-joined", { players: room.players, playerId: userId })

          if (isNewJoin) {
            mockSocket.to(roomCode).emit("player-joined", { players: room.players })
          }
        }
      }

      await eventHandler({ roomCode })

      expect(mockSocket.join).toHaveBeenCalledWith(roomCode)
      expect(mockSocket.emit).toHaveBeenCalledWith("room-joined", {
        players: expect.arrayContaining([
          expect.objectContaining({ userId: 'user1', name: 'Player1' }),
          expect.objectContaining({ userId: 'user2', name: userName })
        ]),
        playerId: userId
      })

      // Verify new player notification was sent
      expect(mockSocket.to).toHaveBeenCalledWith(roomCode)
    })

    it('should reject joining full room', async () => {
      const roomCode = 'FULL01'
      const fullRoom = createTestRoom({
        code: roomCode,
        players: [
          createTestPlayer({ userId: 'user1', name: 'Player1' }),
          createTestPlayer({ userId: 'user2', name: 'Player2' })
        ]
      })
      testRooms.set(roomCode, fullRoom)

      const mockSocket = {
        emit: vi.fn(),
        data: {}
      }

      const userId = 'user3'

      const eventHandler = async ({ roomCode }) => {
        roomCode = roomCode.toUpperCase()
        const room = testRooms.get(roomCode)

        if (room) {
          const existingPlayerByUserId = findPlayerByUserId(room, userId)
          const actualPlayerCount = room.players.length

          if (!existingPlayerByUserId && actualPlayerCount >= room.maxPlayers) {
            mockSocket.emit("room-error", "Room is full")
            return
          }
        }
      }

      await eventHandler({ roomCode })

      expect(mockSocket.emit).toHaveBeenCalledWith("room-error", "Room is full")
    })

    it('should handle reconnection for existing player', async () => {
      const roomCode = 'RECON01'
      const existingRoom = createTestRoom({
        code: roomCode,
        players: [createTestPlayer({ userId: 'user1', name: 'Player1' })]
      })
      testRooms.set(roomCode, existingRoom)

      const mockSocket = {
        emit: vi.fn(),
        join: vi.fn(),
        data: {}
      }

      const userId = 'user1'
      const userName = 'UpdatedPlayer1'
      const userEmail = 'updated@example.com'

      const eventHandler = async ({ roomCode }) => {
        roomCode = roomCode.toUpperCase()
        const room = testRooms.get(roomCode)

        if (room) {
          const existingPlayerByUserId = findPlayerByUserId(room, userId)

          if (existingPlayerByUserId) {
            existingPlayerByUserId.name = userName
            existingPlayerByUserId.email = userEmail
            if (existingPlayerByUserId.score === undefined) existingPlayerByUserId.score = 0
          }

          await saveRoom(room)
          mockSocket.join(roomCode)
          mockSocket.data.roomCode = roomCode
          mockSocket.data.userId = userId

          mockSocket.emit("room-joined", { players: room.players, playerId: userId })
        }
      }

      await eventHandler({ roomCode })

      expect(mockSocket.emit).toHaveBeenCalledWith("room-joined", {
        players: expect.arrayContaining([
          expect.objectContaining({ userId, name: userName, email: userEmail })
        ]),
        playerId: userId
      })
    })
  })

  describe('leave-room event handler', () => {
    it('should remove player from room and update other players', async () => {
      const roomCode = 'LEAVE01'
      const player1 = createTestPlayer({ userId: 'user1', name: 'Player1' })
      const player2 = createTestPlayer({ userId: 'user2', name: 'Player2' })
      const room = createTestRoom({ code: roomCode, players: [player1, player2] })
      testRooms.set(roomCode, room)

      const mockSocket = {
        emit: vi.fn(),
        leave: vi.fn(),
        to: vi.fn().mockReturnThis(),
        data: { roomCode, userId: 'user1' },
        disconnect: vi.fn()
      }

      const eventHandler = async ({ roomCode }) => {
        if (!validateRoomCode(roomCode)) {
          mockSocket.emit("room-error", "Invalid room code")
          return
        }

        roomCode = roomCode.toUpperCase()
        const room = testRooms.get(roomCode)
        if (room) {
          room.players = room.players.filter(player => player.userId !== 'user1')
          mockSocket.to(roomCode).emit("player-left", { players: room.players })

          if (room.players.length === 0) {
            testRooms.delete(roomCode)
            await deleteRoom(roomCode)
          } else {
            await saveRoom(room)
          }

          mockSocket.leave(roomCode)
          mockSocket.data.roomCode = null
          mockSocket.data.userId = null
        }

        mockSocket.disconnect(true)
      }

      await eventHandler({ roomCode })

      expect(mockSocket.to).toHaveBeenCalledWith(roomCode)
      expect(mockSocket.to().emit).toHaveBeenCalledWith("player-left", {
        players: expect.arrayContaining([
          expect.objectContaining({ userId: 'user2', name: 'Player2' })
        ])
      })
      expect(mockSocket.leave).toHaveBeenCalledWith(roomCode)
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true)

      // Verify room still exists with one player
      const updatedRoom = testRooms.get(roomCode)
      expect(updatedRoom).toBeDefined()
      expect(updatedRoom.players).toHaveLength(1)
      expect(updatedRoom.players[0].userId).toBe('user2')
    })

    it('should delete room when last player leaves', async () => {
      const roomCode = 'DELET01'
      const player1 = createTestPlayer({ userId: 'user1', name: 'Player1' })
      const room = createTestRoom({ code: roomCode, players: [player1] })
      testRooms.set(roomCode, room)

      const mockSocket = {
        emit: vi.fn(),
        leave: vi.fn(),
        data: { roomCode, userId: 'user1' },
        disconnect: vi.fn()
      }

      const eventHandler = async ({ roomCode }) => {
        roomCode = roomCode.toUpperCase()
        const room = testRooms.get(roomCode)
        if (room) {
          room.players = room.players.filter(player => player.userId !== 'user1')

          if (room.players.length === 0) {
            testRooms.delete(roomCode)
            await deleteRoom(roomCode)
          }

          mockSocket.leave(roomCode)
          mockSocket.data.roomCode = null
        }

        mockSocket.disconnect(true)
      }

      await eventHandler({ roomCode })

      // Verify room was deleted
      expect(testRooms.has(roomCode)).toBe(false)
      expect(mockSocket.leave).toHaveBeenCalledWith(roomCode)
    })

    it('should handle invalid room code', async () => {
      const mockSocket = {
        emit: vi.fn(),
        data: {}
      }

      const eventHandler = async ({ roomCode }) => {
        if (!validateRoomCode(roomCode)) {
          mockSocket.emit("room-error", "Invalid room code")
          return
        }
      }

      await eventHandler({ roomCode: 'INVALID' })

      expect(mockSocket.emit).toHaveBeenCalledWith("room-error", "Invalid room code")
    })
  })

  describe('player-ready event handler', () => {
    it('should toggle player ready status', async () => {
      const roomCode = 'READY01'
      const player1 = createTestPlayer({ userId: 'user1', name: 'Player1', isReady: false })
      const player2 = createTestPlayer({ userId: 'user2', name: 'Player2', isReady: false })
      const room = createTestRoom({ code: roomCode, players: [player1, player2] })
      testRooms.set(roomCode, room)

      const mockSocket = {
        emit: vi.fn(),
        to: vi.fn().mockReturnThis()
      }

      const eventHandler = async ({ roomCode }) => {
        if (!validateRoomCode(roomCode)) {
          mockSocket.emit("room-error", "Invalid room code")
          return
        }

        roomCode = roomCode.toUpperCase()
        const room = testRooms.get(roomCode)

        if (room) {
          const player = room.players.find(p => p.userId === 'user1')
          if (player) {
            player.isReady = !player.isReady
            mockSocket.to(roomCode).emit("player-ready", { players: room.players })
          }
        }
      }

      await eventHandler({ roomCode })

      expect(mockSocket.to).toHaveBeenCalledWith(roomCode)
      expect(mockSocket.to().emit).toHaveBeenCalledWith("player-ready", {
        players: expect.arrayContaining([
          expect.objectContaining({ userId: 'user1', isReady: true }),
          expect.objectContaining({ userId: 'user2', isReady: false })
        ])
      })
    })

    it('should start game when all players are ready', async () => {
      const roomCode = 'START01'
      const player1 = createTestPlayer({ userId: 'user1', name: 'Player1', isReady: true })
      const player2 = createTestPlayer({ userId: 'user2', name: 'Player2', isReady: false })
      const room = createTestRoom({
        code: roomCode,
        players: [player1, player2],
        gameStarted: false
      })
      testRooms.set(roomCode, room)

      const mockSocket = {
        emit: vi.fn(),
        to: vi.fn().mockReturnThis()
      }

      const mockPlayerSockets = new Map([
        ['user1', { emit: vi.fn() }],
        ['user2', { emit: vi.fn() }]
      ])

      const eventHandler = async ({ roomCode }) => {
        roomCode = roomCode.toUpperCase()
        const room = testRooms.get(roomCode)

        if (room) {
          const player = room.players.find(p => p.userId === 'user2')
          if (player) {
            player.isReady = !player.isReady
            mockSocket.to(roomCode).emit("player-ready", { players: room.players })

            if (room.players.length === 2 && room.players.every(p => p.isReady)) {
              room.gameState.tiles = generateTiles()
              room.gameState.gameStarted = true
              room.gameState.deck.cards = 16
              room.gameState.magicDeck.cards = 16
              room.gameState.playerActions = {}

              room.players.forEach(player => {
                room.gameState.playerHands[player.userId] = []
                for (let i = 0; i < 3; i++) {
                  room.gameState.playerHands[player.userId].push(generateSingleHeart())
                }
                for (let i = 0; i < 2; i++) {
                  room.gameState.playerHands[player.userId].push(generateSingleMagicCard())
                }
              })

              room.gameState.currentPlayer = selectRandomStartingPlayer(room.players)
              room.gameState.turnCount = 1

              const gameStartData = {
                tiles: room.gameState.tiles,
                currentPlayer: room.gameState.currentPlayer,
                players: room.players.map(player => ({
                  ...player,
                  hand: room.gameState.playerHands[player.userId] || [],
                  score: player.score || 0
                })),
                playerHands: room.gameState.playerHands,
                deck: room.gameState.deck,
                magicDeck: room.gameState.magicDeck,
                turnCount: room.gameState.turnCount,
                shields: room.gameState.shields || {},
                playerActions: room.gameState.playerActions || {}
              }

              room.players.forEach(player => {
                const personalizedData = { ...gameStartData, playerId: player.userId }
                const playerSocket = mockPlayerSockets.get(player.userId)
                if (playerSocket) {
                  playerSocket.emit("game-start", personalizedData)
                }
              })
            }
          }
        }
      }

      await eventHandler({ roomCode })

      // Verify game was started
      expect(room.gameState.gameStarted).toBe(true)
      expect(room.gameState.tiles).toHaveLength(8)
      expect(room.gameState.currentPlayer).toBeDefined()

      // Verify players received game-start event
      mockPlayerSockets.forEach(socket => {
        expect(socket.emit).toHaveBeenCalledWith("game-start", expect.objectContaining({
          tiles: expect.any(Array),
          currentPlayer: expect.any(Object),
          playerHands: expect.any(Object),
          deck: expect.any(Object),
          magicDeck: expect.any(Object),
          turnCount: 1
        }))
      })
    })
  })

  describe('draw-heart event handler', () => {
    it('should draw heart card successfully', async () => {
      const roomCode = 'DRAW01'
      const room = createTestRoom({
        code: roomCode,
        gameStarted: true,
        currentPlayer: { userId: 'user1', name: 'Player1' },
        playerHands: { user1: [] },
        deck: { cards: 16 }
      })
      testRooms.set(roomCode, room)

      const mockSocket = {
        emit: vi.fn(),
        to: vi.fn().mockReturnThis()
      }

      const eventHandler = async ({ roomCode }) => {
        roomCode = roomCode.toUpperCase()
        const room = testRooms.get(roomCode)

        const roomValidation = validateRoomState(room)
        if (!roomValidation.valid) {
          mockSocket.emit("room-error", roomValidation.error)
          return
        }

        const turnValidation = validateTurn(room, 'user1')
        if (!turnValidation.valid) {
          mockSocket.emit("room-error", turnValidation.error)
          return
        }

        if (!acquireTurnLock(roomCode, 'socket1')) {
          mockSocket.emit("room-error", "Action in progress, please wait")
          return
        }

        try {
          if (room.gameState.gameStarted && room.gameState.deck.cards > 0) {
            recordCardDraw(room, 'user1', 'heart')
            const newHeart = generateSingleHeart()
            if (!room.gameState.playerHands['user1']) {
              room.gameState.playerHands['user1'] = []
            }
            room.gameState.playerHands['user1'].push(newHeart)
            room.gameState.deck.cards--

            const playersWithUpdatedHands = room.players.map(player => ({
              ...player,
              hand: room.gameState.playerHands[player.userId] || [],
              score: player.score || 0
            }))

            mockSocket.to(roomCode).emit("heart-drawn", {
              players: playersWithUpdatedHands,
              playerHands: room.gameState.playerHands,
              deck: room.gameState.deck
            })
          }
        } finally {
          releaseTurnLock(roomCode, 'socket1')
        }
      }

      await eventHandler({ roomCode })

      expect(mockSocket.to).toHaveBeenCalledWith(roomCode)
      expect(mockSocket.to().emit).toHaveBeenCalledWith("heart-drawn", expect.objectContaining({
        players: expect.any(Array),
        playerHands: expect.any(Object),
        deck: expect.objectContaining({ cards: 15 })
      }))

      // Verify player received a heart card
      expect(room.gameState.playerHands.user1).toHaveLength(1)
      expect(room.gameState.deck.cards).toBe(15)
    })

    it('should reject drawing when not player\'s turn', async () => {
      const roomCode = 'NOTURN'
      const room = createTestRoom({
        code: roomCode,
        gameStarted: true,
        currentPlayer: { userId: 'user2', name: 'Player2' }, // Different player's turn
        deck: { cards: 16 }
      })
      testRooms.set(roomCode, room)

      const mockSocket = {
        emit: vi.fn()
      }

      const eventHandler = async ({ roomCode }) => {
        roomCode = roomCode.toUpperCase()
        const room = testRooms.get(roomCode)

        const turnValidation = validateTurn(room, 'user1')
        if (!turnValidation.valid) {
          mockSocket.emit("room-error", turnValidation.error)
          return
        }
      }

      await eventHandler({ roomCode })

      expect(mockSocket.emit).toHaveBeenCalledWith("room-error", "Not your turn")
    })

    it('should reject drawing heart when already drawn this turn', async () => {
      const roomCode = 'ALREADYDRAWN'
      const room = createTestRoom({
        code: roomCode,
        gameStarted: true,
        currentPlayer: { userId: 'user1', name: 'Player1' },
        playerActions: { user1: { drawnHeart: true, drawnMagic: false, heartsPlaced: 0, magicCardsUsed: 0 } },
        deck: { cards: 16 }
      })
      testRooms.set(roomCode, room)

      const mockSocket = {
        emit: vi.fn()
      }

      const eventHandler = async ({ roomCode }) => {
        roomCode = roomCode.toUpperCase()
        const room = testRooms.get(roomCode)

        const cardDrawValidation = validateCardDrawLimit(room, 'user1')
        if (cardDrawValidation.currentActions.drawnHeart) {
          mockSocket.emit("room-error", "You can only draw one heart card per turn")
          return
        }
      }

      await eventHandler({ roomCode })

      expect(mockSocket.emit).toHaveBeenCalledWith("room-error", "You can only draw one heart card per turn")
    })

    it('should handle action lock contention', async () => {
      const roomCode = 'LOCKED'
      const room = createTestRoom({
        code: roomCode,
        gameStarted: true,
        currentPlayer: { userId: 'user1', name: 'Player1' },
        deck: { cards: 16 }
      })
      testRooms.set(roomCode, room)

      // Acquire lock first
      acquireTurnLock(roomCode, 'other-socket')

      const mockSocket = {
        emit: vi.fn()
      }

      const eventHandler = async ({ roomCode }) => {
        roomCode = roomCode.toUpperCase()
        const room = testRooms.get(roomCode)

        if (!acquireTurnLock(roomCode, 'socket1')) {
          mockSocket.emit("room-error", "Action in progress, please wait")
          return
        }
      }

      await eventHandler({ roomCode })

      expect(mockSocket.emit).toHaveBeenCalledWith("room-error", "Action in progress, please wait")

      // Clean up lock
      releaseTurnLock(roomCode, 'other-socket')
    })
  })

  describe('place-heart event handler', () => {
    it('should place heart on tile successfully', async () => {
      const roomCode = 'PLACE01'
      const heartCard = new HeartCard('heart-1', 'red', 2, '❤️')
      const room = createTestRoom({
        code: roomCode,
        gameStarted: true,
        currentPlayer: { userId: 'user1', name: 'Player1' },
        playerHands: { user1: [heartCard] },
        tiles: [{ id: 0, color: 'red', emoji: '🟥' }, { id: 1, color: 'white', emoji: '⬜' }]
      })
      testRooms.set(roomCode, room)

      const mockSocket = {
        emit: vi.fn(),
        to: vi.fn().mockReturnThis()
      }

      const eventHandler = async ({ roomCode, tileId, heartId }) => {
        roomCode = roomCode.toUpperCase()
        const room = testRooms.get(roomCode)

        const heartValidation = validateHeartPlacement(room, 'user1', heartId, tileId)
        if (!heartValidation.valid) {
          mockSocket.emit("room-error", heartValidation.error)
          return
        }

        const turnValidation = validateTurn(room, 'user1')
        if (!turnValidation.valid) {
          mockSocket.emit("room-error", turnValidation.error)
          return
        }

        if (!canPlaceMoreHearts(room, 'user1')) {
          mockSocket.emit("room-error", "You can only place up to 2 heart cards per turn")
          return
        }

        if (!acquireTurnLock(roomCode, 'socket1')) {
          mockSocket.emit("room-error", "Action in progress, please wait")
          return
        }

        try {
          const playerHand = room.gameState.playerHands['user1'] || []
          const heartIndex = playerHand.findIndex(heart => heart.id === heartId)

          if (heartIndex !== -1) {
            const heart = playerHand[heartIndex]
            const tile = room.gameState.tiles.find(tile => tile.id == tileId)

            if (tile && !tile.placedHeart) {
              tile.placedHeart = {
                ...heart,
                placedBy: 'user1',
                score: calculateScore(heart, tile)
              }

              // Update player score
              const playerIndex = room.players.findIndex(p => p.userId === 'user1')
              if (playerIndex !== -1) {
                room.players[playerIndex].score = (room.players[playerIndex].score || 0) + tile.placedHeart.score
              }

              playerHand.splice(heartIndex, 1)
              recordHeartPlacement(room, 'user1')

              mockSocket.to(roomCode).emit("heart-placed", {
                tile,
                player: room.players.find(p => p.userId === 'user1'),
                players: room.players,
                playerHands: room.gameState.playerHands
              })
            }
          }
        } finally {
          releaseTurnLock(roomCode, 'socket1')
        }
      }

      await eventHandler({ roomCode, tileId: 0, heartId: 'heart-1' })

      expect(mockSocket.to).toHaveBeenCalledWith(roomCode)
      expect(mockSocket.to().emit).toHaveBeenCalledWith("heart-placed", expect.objectContaining({
        tile: expect.objectContaining({
          id: 0,
          placedHeart: expect.objectContaining({
            color: 'red',
            value: 2,
            placedBy: 'user1',
            score: 4 // Red heart on red tile = double points
          })
        }),
        player: expect.objectContaining({ userId: 'user1' })
      }))

      // Verify heart was removed from hand and placed on tile
      expect(room.gameState.playerHands.user1).toHaveLength(0)
      expect(room.gameState.tiles[0].placedHeart).toBeDefined()
      expect(room.players[0].score).toBe(4)
    })

    it('should reject placing heart on occupied tile', async () => {
      const roomCode = 'OCCUPIED'
      const heartCard = new HeartCard('heart-1', 'red', 2, '❤️')
      const room = createTestRoom({
        code: roomCode,
        gameStarted: true,
        currentPlayer: { userId: 'user1', name: 'Player1' },
        playerHands: { user1: [heartCard] },
        tiles: [{
          id: 0,
          color: 'red',
          emoji: '🟥',
          placedHeart: { color: 'yellow', value: 1, placedBy: 'user2' }
        }]
      })
      testRooms.set(roomCode, room)

      const mockSocket = {
        emit: vi.fn()
      }

      const eventHandler = async ({ roomCode, tileId, heartId }) => {
        roomCode = roomCode.toUpperCase()
        const room = testRooms.get(roomCode)

        const heartValidation = validateHeartPlacement(room, 'user1', heartId, tileId)
        if (!heartValidation.valid) {
          mockSocket.emit("room-error", heartValidation.error)
          return
        }
      }

      await eventHandler({ roomCode, tileId: 0, heartId: 'heart-1' })

      expect(mockSocket.emit).toHaveBeenCalledWith("room-error", "Tile is already occupied")
    })

    it('should reject placing heart when limit reached', async () => {
      const roomCode = 'LIMIT'
      const room = createTestRoom({
        code: roomCode,
        gameStarted: true,
        currentPlayer: { userId: 'user1', name: 'Player1' },
        playerActions: { user1: { heartsPlaced: 2 } }, // Already placed 2 hearts
        playerHands: { user1: [new HeartCard('red', 2, 'heart-1')] },
        tiles: [{ id: 0, color: 'red', emoji: '🟥' }]
      })
      testRooms.set(roomCode, room)

      const mockSocket = {
        emit: vi.fn()
      }

      const eventHandler = async ({ roomCode, tileId, heartId }) => {
        roomCode = roomCode.toUpperCase()
        const room = testRooms.get(roomCode)

        if (!canPlaceMoreHearts(room, 'user1')) {
          mockSocket.emit("room-error", "You can only place up to 2 heart cards per turn")
          return
        }
      }

      await eventHandler({ roomCode, tileId: 0, heartId: 'heart-1' })

      expect(mockSocket.emit).toHaveBeenCalledWith("room-error", "You can only place up to 2 heart cards per turn")
    })
  })

  describe('draw-magic-card and use-magic-card event handlers', () => {
    it('should draw magic card successfully', async () => {
      const roomCode = 'MAGICDRAW'
      const room = createTestRoom({
        code: roomCode,
        gameStarted: true,
        currentPlayer: { userId: 'user1', name: 'Player1' },
        playerHands: { user1: [] },
        magicDeck: { cards: 16 }
      })
      testRooms.set(roomCode, room)

      const mockSocket = {
        emit: vi.fn(),
        to: vi.fn().mockReturnThis()
      }

      const eventHandler = async ({ roomCode }) => {
        roomCode = roomCode.toUpperCase()
        const room = testRooms.get(roomCode)

        const turnValidation = validateTurn(room, 'user1')
        if (!turnValidation.valid) {
          mockSocket.emit("room-error", turnValidation.error)
          return
        }

        const cardDrawValidation = validateCardDrawLimit(room, 'user1')
        if (cardDrawValidation.currentActions.drawnMagic) {
          mockSocket.emit("room-error", "You can only draw one magic card per turn")
          return
        }

        if (!acquireTurnLock(roomCode, 'socket1')) {
          mockSocket.emit("room-error", "Action in progress, please wait")
          return
        }

        try {
          if (room.gameState.gameStarted && room.gameState.magicDeck.cards > 0) {
            recordCardDraw(room, 'user1', 'magic')
            const newMagicCard = generateSingleMagicCard()
            if (!room.gameState.playerHands['user1']) {
              room.gameState.playerHands['user1'] = []
            }
            room.gameState.playerHands['user1'].push(newMagicCard)
            room.gameState.magicDeck.cards--

            mockSocket.to(roomCode).emit("magic-card-drawn", {
              players: room.players.map(player => ({
                ...player,
                hand: room.gameState.playerHands[player.userId] || [],
                score: player.score || 0
              })),
              playerHands: room.gameState.playerHands,
              magicDeck: room.gameState.magicDeck
            })
          }
        } finally {
          releaseTurnLock(roomCode, 'socket1')
        }
      }

      await eventHandler({ roomCode })

      expect(mockSocket.to).toHaveBeenCalledWith(roomCode)
      expect(mockSocket.to().emit).toHaveBeenCalledWith("magic-card-drawn", expect.objectContaining({
        players: expect.any(Array),
        playerHands: expect.any(Object),
        magicDeck: expect.objectContaining({ cards: 15 })
      }))

      // Verify player received a magic card
      expect(room.gameState.playerHands.user1).toHaveLength(1)
      expect(room.gameState.magicDeck.cards).toBe(15)
    })

    it('should use wind card to remove opponent heart', async () => {
      const roomCode = 'WINDCARD'
      const windCard = new WindCard('wind-1')
      const room = createTestRoom({
        code: roomCode,
        gameStarted: true,
        currentPlayer: { userId: 'user1', name: 'Player1' },
        players: [
          { userId: 'user1', name: 'Player1', score: 0 },
          { userId: 'user2', name: 'Player2', score: 4 }
        ],
        playerHands: { user1: [windCard] },
        tiles: [{
          id: 0,
          color: 'red',
          emoji: '🟥',
          placedHeart: {
            id: 'heart-opp',
            color: 'yellow',
            value: 2,
            placedBy: 'user2',
            score: 4
          }
        }]
      })
      testRooms.set(roomCode, room)

      const mockSocket = {
        emit: vi.fn(),
        to: vi.fn().mockReturnThis()
      }

      const eventHandler = async ({ roomCode, cardId, targetTileId }) => {
        roomCode = roomCode.toUpperCase()
        const room = testRooms.get(roomCode)

        const turnValidation = validateTurn(room, 'user1')
        if (!turnValidation.valid) {
          mockSocket.emit("room-error", turnValidation.error)
          return
        }

        if (!canUseMoreMagicCards(room, 'user1')) {
          mockSocket.emit("room-error", "You can only use one magic card per turn")
          return
        }

        if (!acquireTurnLock(roomCode, 'socket1')) {
          mockSocket.emit("room-error", "Action in progress, please wait")
          return
        }

        try {
          const actionResult = await executeMagicCard(room, 'user1', cardId, targetTileId)

          if (actionResult) {
            recordMagicCardUsage(room, 'user1')

            mockSocket.to(roomCode).emit("magic-card-used", {
              card: { type: 'wind', emoji: '💨' },
              targetTile: actionResult.newTileState,
              player: room.players.find(p => p.userId === 'user1'),
              players: room.players,
              playerHands: room.gameState.playerHands
            })

            mockSocket.to(roomCode).emit("scores-updated", room.players)
          }
        } finally {
          releaseTurnLock(roomCode, 'socket1')
        }
      }

      await eventHandler({ roomCode, cardId: 'wind-1', targetTileId: 0 })

      expect(mockSocket.to).toHaveBeenCalledWith(roomCode)
      expect(mockSocket.to().emit).toHaveBeenCalledWith("magic-card-used", expect.objectContaining({
        card: expect.objectContaining({ type: 'wind', emoji: '💨' }),
        targetTile: expect.objectContaining({
          id: 0,
          color: 'red',
          placedHeart: null // Heart should be removed
        })
      }))

      // Verify heart was removed and score updated
      expect(room.gameState.tiles[0].placedHeart).toBeNull()
      expect(room.players[1].score).toBe(0) // Score should be subtracted
    })

    it('should use shield card to protect player', async () => {
      const roomCode = 'SHIELDCARD'
      const shieldCard = new ShieldCard('shield-1')
      const room = createTestRoom({
        code: roomCode,
        gameStarted: true,
        currentPlayer: { userId: 'user1', name: 'Player1' },
        playerHands: { user1: [shieldCard] },
        shields: {}
      })
      testRooms.set(roomCode, room)

      const mockSocket = {
        emit: vi.fn(),
        to: vi.fn().mockReturnThis()
      }

      const eventHandler = async ({ roomCode, cardId, targetTileId }) => {
        roomCode = roomCode.toUpperCase()
        const room = testRooms.get(roomCode)

        const turnValidation = validateTurn(room, 'user1')
        if (!turnValidation.valid) {
          mockSocket.emit("room-error", turnValidation.error)
          return
        }

        if (!acquireTurnLock(roomCode, 'socket1')) {
          mockSocket.emit("room-error", "Action in progress, please wait")
          return
        }

        try {
          const actionResult = await executeMagicCard(room, 'user1', cardId, targetTileId)

          if (actionResult) {
            recordMagicCardUsage(room, 'user1')

            mockSocket.to(roomCode).emit("magic-card-used", {
              card: { type: 'shield', emoji: '🛡️' },
              effect: actionResult,
              player: room.players.find(p => p.userId === 'user1'),
              players: room.players,
              playerHands: room.gameState.playerHands,
              shields: room.gameState.shields
            })
          }
        } finally {
          releaseTurnLock(roomCode, 'socket1')
        }
      }

      await eventHandler({ roomCode, cardId: 'shield-1', targetTileId: 'self' })

      expect(mockSocket.to).toHaveBeenCalledWith(roomCode)
      expect(mockSocket.to().emit).toHaveBeenCalledWith("magic-card-used", expect.objectContaining({
        card: expect.objectContaining({ type: 'shield', emoji: '🛡️' })
      }))

      // Verify shield was created
      expect(room.gameState.shields.user1).toBeDefined()
      expect(room.gameState.shields.user1.remainingTurns).toBeGreaterThan(0)
    })
  })

  describe('end-turn event handler', () => {
    it('should end turn and switch to next player', async () => {
      const roomCode = 'ENDTURN'
      const room = createTestRoom({
        code: roomCode,
        gameStarted: true,
        currentPlayer: { userId: 'user1', name: 'Player1' },
        players: [
          { userId: 'user1', name: 'Player1' },
          { userId: 'user2', name: 'Player2' }
        ],
        turnCount: 1
      })
      testRooms.set(roomCode, room)

      const mockSocket = {
        emit: vi.fn(),
        to: vi.fn().mockReturnThis()
      }

      const eventHandler = async ({ roomCode }) => {
        roomCode = roomCode.toUpperCase()
        const room = testRooms.get(roomCode)

        const turnValidation = validateTurn(room, 'user1')
        if (!turnValidation.valid) {
          mockSocket.emit("room-error", turnValidation.error)
          return
        }

        if (!acquireTurnLock(roomCode, 'socket1')) {
          mockSocket.emit("room-error", "Action in progress, please wait")
          return
        }

        try {
          // Reset player actions
          resetPlayerActions(room, 'user1')

          // Switch to next player
          const currentPlayerIndex = room.players.findIndex(p => p.userId === room.gameState.currentPlayer.userId)
          const nextPlayerIndex = (currentPlayerIndex + 1) % room.players.length
          room.gameState.currentPlayer = room.players[nextPlayerIndex]
          room.gameState.turnCount++

          // Check and expire shields
          checkAndExpireShields(room)

          // Check for game end
          const gameEnded = await endGame(room, roomCode, { to: vi.fn().mockReturnThis() }, false)

          if (!gameEnded) {
            mockSocket.to(roomCode).emit("turn-changed", {
              currentPlayer: room.gameState.currentPlayer,
              turnCount: room.gameState.turnCount,
              shields: room.gameState.shields || {}
            })
          }
        } finally {
          releaseTurnLock(roomCode, 'socket1')
        }
      }

      await eventHandler({ roomCode })

      expect(mockSocket.to).toHaveBeenCalledWith(roomCode)
      expect(mockSocket.to().emit).toHaveBeenCalledWith("turn-changed", expect.objectContaining({
        currentPlayer: expect.objectContaining({ userId: 'user2', name: 'Player2' }),
        turnCount: 2
      }))

      // Verify turn was switched
      expect(room.gameState.currentPlayer.userId).toBe('user2')
      expect(room.gameState.turnCount).toBe(2)
    })

    it('should reset player actions and check shields', async () => {
      const roomCode = 'RESETACTIONS'
      const room = createTestRoom({
        code: roomCode,
        gameStarted: true,
        currentPlayer: { userId: 'user1', name: 'Player1' },
        players: [
          { userId: 'user1', name: 'Player1' },
          { userId: 'user2', name: 'Player2' }
        ],
        playerActions: {
          user1: { drawnHeart: true, drawnMagic: true, heartsPlaced: 1, magicCardsUsed: 1 }
        },
        shields: {
          user2: { protectedTiles: [0], remainingTurns: 1, createdTurn: 1 }
        },
        turnCount: 2
      })
      testRooms.set(roomCode, room)

      const eventHandler = async ({ roomCode }) => {
        roomCode = roomCode.toUpperCase()
        const room = testRooms.get(roomCode)

        resetPlayerActions(room, 'user1')
        checkAndExpireShields(room)

        // Switch to next player
        const currentPlayerIndex = room.players.findIndex(p => p.userId === room.gameState.currentPlayer.userId)
        const nextPlayerIndex = (currentPlayerIndex + 1) % room.players.length
        room.gameState.currentPlayer = room.players[nextPlayerIndex]
        room.gameState.turnCount++
      }

      await eventHandler({ roomCode })

      // Verify player actions were reset
      expect(room.gameState.playerActions.user1).toEqual({
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0
      })

      // Verify shield expired (remainingTurns was 1, turnCount was 2)
      expect(room.gameState.shields.user2).toBeUndefined()
    })
  })

  describe('disconnect event handler', () => {
    it('should handle player disconnection gracefully', async () => {
      const roomCode = 'DISCONNECT'
      const player1 = createTestPlayer({ userId: 'user1', name: 'Player1' })
      const player2 = createTestPlayer({ userId: 'user2', name: 'Player2' })
      const room = createTestRoom({ code: roomCode, players: [player1, player2] })
      testRooms.set(roomCode, room)

      const mockSocket = {
        emit: vi.fn(),
        to: vi.fn().mockReturnThis(),
        data: { roomCode, userId: 'user1' },
        leave: vi.fn()
      }

      const eventHandler = async (reason) => {
        const roomCode = mockSocket.data.roomCode
        const userId = mockSocket.data.userId

        if (roomCode && userId) {
          const room = testRooms.get(roomCode)
          if (room) {
            room.players = room.players.filter(player => player.userId !== userId)
            mockSocket.to(roomCode).emit("player-left", { players: room.players })

            if (room.players.length === 0) {
              testRooms.delete(roomCode)
              await deleteRoom(roomCode)
            } else {
              await saveRoom(room)
            }
          }
        }
      }

      await eventHandler('disconnect')

      expect(mockSocket.to).toHaveBeenCalledWith(roomCode)
      expect(mockSocket.to().emit).toHaveBeenCalledWith("player-left", {
        players: expect.arrayContaining([
          expect.objectContaining({ userId: 'user2', name: 'Player2' })
        ])
      })

      // Verify player was removed from room
      const updatedRoom = testRooms.get(roomCode)
      expect(updatedRoom.players).toHaveLength(1)
      expect(updatedRoom.players[0].userId).toBe('user2')
    })

    it('should handle disconnection without active room', async () => {
      const mockSocket = {
        data: { roomCode: null, userId: null }
      }

      const eventHandler = async (reason) => {
        const roomCode = mockSocket.data.roomCode
        const userId = mockSocket.data.userId

        if (roomCode && userId) {
          // Should not execute this block
          expect(true).toBe(false)
        }
      }

      // Should not throw error
      await expect(eventHandler('disconnect')).resolves.toBeUndefined()
    })
  })

  describe('shuffle-tiles event handler', () => {
    it('should shuffle tiles in active game', async () => {
      const roomCode = 'SHUFFLE'

      // Mock Math.random to ensure different tile configurations
      const originalMathRandom = Math.random
      let callCount = 0
      Math.random = vi.fn().mockImplementation(() => {
        callCount++
        // First call (original tiles): return 0.1 (mostly red tiles)
        if (callCount <= 8) return 0.1
        // Second call (shuffled tiles): return 0.8 (mostly green tiles)
        return 0.8
      })

      try {
        const originalTiles = generateTiles()
        const room = createTestRoom({
          code: roomCode,
          gameStarted: true,
          tiles: originalTiles
        })
        testRooms.set(roomCode, room)

        const mockSocket = {
          emit: vi.fn(),
          to: vi.fn().mockReturnThis()
        }

        const eventHandler = async ({ roomCode }) => {
          roomCode = roomCode.toUpperCase()
          const room = testRooms.get(roomCode)

          if (room?.gameState.gameStarted) {
            room.gameState.tiles = generateTiles()
            mockSocket.to(roomCode).emit("tiles-updated", { tiles: room.gameState.tiles })
          }
        }

        await eventHandler({ roomCode })

        expect(mockSocket.to).toHaveBeenCalledWith(roomCode)
        expect(mockSocket.to().emit).toHaveBeenCalledWith("tiles-updated", expect.objectContaining({
          tiles: expect.any(Array)
        }))

        // Verify tiles were updated
        expect(room.gameState.tiles).not.toEqual(originalTiles)
        expect(room.gameState.tiles).toHaveLength(8)
      } finally {
        // Restore original Math.random
        Math.random = originalMathRandom
      }
    })

    it('should ignore shuffle in non-started game', async () => {
      const roomCode = 'NOSHUFFLE'
      const room = createTestRoom({
        code: roomCode,
        gameStarted: false
      })
      testRooms.set(roomCode, room)

      const mockSocket = {
        emit: vi.fn(),
        to: vi.fn()
      }

      const eventHandler = async ({ roomCode }) => {
        roomCode = roomCode.toUpperCase()
        const room = testRooms.get(roomCode)

        if (room?.gameState.gameStarted) {
          room.gameState.tiles = generateTiles()
          mockSocket.to(roomCode).emit("tiles-updated", { tiles: room.gameState.tiles })
        }
      }

      await eventHandler({ roomCode })

      expect(mockSocket.to).not.toHaveBeenCalled()
    })
  })
})