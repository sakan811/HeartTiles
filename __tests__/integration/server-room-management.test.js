import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { createServer } from 'node:http'
import { io as ioc } from 'socket.io-client'
import { Server } from 'socket.io'
import { Room } from '../../models.js'
import { createMockSocket, createMockRoom, waitForAsync } from './setup.js'
import { HeartCard, WindCard, RecycleCard, ShieldCard } from '../../src/lib/cards.js'

// Import database utilities from server-test-utils for integration tests
import {
  connectToDatabase,
  disconnectDatabase,
  clearDatabase,
  clearTurnLocks
} from '../utils/server-test-utils.js'

function waitFor(socket, event) {
  return new Promise((resolve) => {
    socket.once(event, resolve)
  })
}

// Import real server functions to ensure server.js code is executed and covered
import {
  validateRoomState,
  validatePlayerInRoom,
  validateDeckState,
  validateTurn,
  validateCardDrawLimit,
  validateHeartPlacement,
  canPlaceMoreHearts,
  canUseMoreMagicCards,
  recordHeartPlacement,
  recordMagicCardUsage,
  recordCardDraw,
  resetPlayerActions,
  checkAndExpireShields,
  selectRandomStartingPlayer,
  generateTiles,
  calculateScore,
  checkGameEndConditions,
  sanitizeInput,
  getClientIP,
  validateRoomCode,
  validatePlayerName,
  findPlayerByUserId,
  findPlayerByName,
  generateSingleHeart,
  generateSingleMagicCard,
  acquireTurnLock,
  releaseTurnLock,
  migratePlayerData
} from '../../server.js'

// Helper function to generate valid room codes (exactly 6 chars, uppercase + numbers)
// Using timestamp and random to ensure uniqueness across test runs
function generateValidRoomCode(prefix = 'TEST') {
  const timestamp = Date.now().toString(36).slice(-2).toUpperCase()
  const random = Math.floor(Math.random() * 100).toString().padStart(2, '0')
  // Take exactly 6 characters from the combination
  const code = `${prefix}${timestamp}${random}`.slice(0, 6).toUpperCase()
  // Ensure it's exactly 6 characters and contains only valid characters
  return code.length === 6 && /^[A-Z0-9]+$/.test(code) ? code : 'TEST12'
}

describe('Server Room Management Integration Tests', () => {
  let io, serverSocket, clientSocket, player1Socket, player2Socket
  let httpServer, port

  beforeAll(async () => {
    // Connect to database
    try {
      await connectToDatabase()
    } catch (error) {
      console.warn('Database connection failed, skipping tests:', error.message)
    }

    // Setup Socket.IO server
    return new Promise((resolve) => {
      httpServer = createServer()
      io = new Server(httpServer, {
        cors: {
          origin: "*",
          methods: ["GET", "POST"]
        }
      })

      // Mock authentication middleware
      io.use(async (socket, next) => {
        const { userId, userName, userEmail } = socket.handshake.auth || {}
        if (!userId || !userName || !userEmail) {
          return next(new Error('Authentication required'))
        }
        socket.data.userId = userId
        socket.data.userEmail = userEmail
        socket.data.userName = userName
        socket.data.userSessionId = `session_${userId}`
        next()
      })

      // Setup socket handlers for room management testing
      io.on('connection', (socket) => {
        serverSocket = socket
        setupRoomSocketHandlers(socket, io)
      })

      httpServer.listen(() => {
        port = httpServer.address().port
        resolve()
      })
    })
  }, 15000)

  afterAll(async () => {
    // Cleanup sockets
    if (player1Socket) player1Socket.disconnect()
    if (player2Socket) player2Socket.disconnect()
    if (clientSocket) clientSocket.disconnect()
    if (io) io.close()
    if (httpServer) httpServer.close()

    // Cleanup database
    try {
      await clearDatabase()
      await disconnectDatabase()
    } catch (error) {
      console.warn('Database cleanup failed:', error.message)
    }
  })

  // Setup socket handlers for room management testing
  function setupRoomSocketHandlers(socket, io) {
    const rooms = new Map()

    socket.on('join-room', async ({ roomCode }) => {
      const { userId, userName, userEmail } = socket.data

      // Validate room code using real server function
      const { validateRoomCode, sanitizeInput } = await import('../../server.js')

      if (!validateRoomCode(roomCode)) {
        socket.emit('room-error', 'Invalid room code')
        return
      }

      roomCode = sanitizeInput(roomCode.toUpperCase())

      let room = rooms.get(roomCode)

      if (!room) {
        room = {
          code: roomCode,
          players: [],
          maxPlayers: 2,
          gameState: {
            tiles: [],
            gameStarted: false,
            currentPlayer: null,
            deck: { emoji: '💌', cards: 16, type: 'hearts' },
            magicDeck: { emoji: '🔮', cards: 16, type: 'magic' },
            playerHands: {},
            shields: {},
            turnCount: 0,
            playerActions: {}
          }
        }
        rooms.set(roomCode, room)
      }

      const existingPlayer = room.players.find(p => p.userId === userId)

      if (!existingPlayer && room.players.length < room.maxPlayers) {
        room.players.push({
          userId,
          name: userName,
          email: userEmail,
          isReady: false,
          score: 0,
          joinedAt: new Date()
        })
      }

      socket.join(roomCode)
      socket.data.roomCode = roomCode

      socket.emit('room-joined', {
        players: room.players,
        playerId: userId
      })

      io.to(roomCode).emit('player-joined', { players: room.players })
    })

    socket.on('player-ready', async ({ roomCode }) => {
      const { userId } = socket.data
      const room = rooms.get(roomCode)

      if (!room) return

      const player = room.players.find(p => p.userId === userId)
      if (!player) return

      player.isReady = !player.isReady
      io.to(roomCode).emit('player-ready', { players: room.players })
    })

    socket.on('leave-room', async ({ roomCode }) => {
      const { userId } = socket.data
      const room = rooms.get(roomCode)

      if (room) {
        room.players = room.players.filter(player => player.userId !== userId)
        io.to(roomCode).emit('player-left', { players: room.players })

        if (room.players.length === 0) {
          rooms.delete(roomCode)
        }
      }

      socket.leave(roomCode)
      socket.data.roomCode = null
    })

    socket.on('disconnect', () => {
      const roomCode = socket.data.roomCode
      if (roomCode) {
        const room = rooms.get(roomCode)
        if (room) {
          room.players = room.players.filter(p => p.userId !== socket.data.userId)
          if (room.players.length === 0) {
            rooms.delete(roomCode)
          } else {
            io.to(roomCode).emit('player-left', { players: room.players })
          }
        }
      }
    })
  }

  beforeEach(async () => {
    try {
      await clearDatabase()
      await clearTurnLocks()
    } catch (error) {
      console.warn('Database clear failed:', error.message)
    }

    // Create authenticated client sockets
    player1Socket = ioc(`http://localhost:${port}`, {
      auth: { userId: 'player1', userName: 'Player 1', userEmail: 'player1@test.com' }
    })

    player2Socket = ioc(`http://localhost:${port}`, {
      auth: { userId: 'player2', userName: 'Player 2', userEmail: 'player2@test.com' }
    })

    await Promise.all([
      new Promise(resolve => player1Socket.on('connect', resolve)),
      new Promise(resolve => player2Socket.on('connect', resolve))
    ])

    vi.clearAllMocks()
    process.env.NODE_ENV = 'test'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Socket.IO Room Management Events', () => {
    it('should handle room joining via Socket.IO events', async () => {
      const roomCode = 'ROOM01'

      // Player 1 joins room
      player1Socket.emit('join-room', { roomCode })
      const joinResponse1 = await waitFor(player1Socket, 'room-joined')

      expect(joinResponse1.players).toHaveLength(1)
      expect(joinResponse1.players[0].userId).toBe('player1')
      expect(joinResponse1.players[0].name).toBe('Player 1')
      expect(joinResponse1.players[0].isReady).toBe(false)
      expect(joinResponse1.playerId).toBe('player1')

      // Player 2 joins same room
      player2Socket.emit('join-room', { roomCode })
      const joinResponse2 = await waitFor(player2Socket, 'room-joined')

      expect(joinResponse2.players).toHaveLength(2)
      expect(joinResponse2.players[1].userId).toBe('player2')
      expect(joinResponse2.players[1].name).toBe('Player 2')

      // Player 1 should also receive player-joined event
      const playerJoinedEvent = await waitFor(player1Socket, 'player-joined')
      expect(playerJoinedEvent.players).toHaveLength(2)
    })

    it('should reject invalid room codes via Socket.IO events', async () => {
      const invalidRoomCodes = ['short', 'toolong12345', 'invalid@code', 'lowercase', '']

      for (const roomCode of invalidRoomCodes) {
        player1Socket.emit('join-room', { roomCode })
        const errorResponse = await waitFor(player1Socket, 'room-error')
        expect(errorResponse).toBe('Invalid room code')
      }
    })

    it('should handle room full scenario via Socket.IO events', async () => {
      const roomCode = 'FULL01'

      // Player 1 joins
      player1Socket.emit('join-room', { roomCode })
      await waitFor(player1Socket, 'room-joined')

      // Player 2 joins
      player2Socket.emit('join-room', { roomCode })
      await waitFor(player2Socket, 'room-joined')

      // Create player 3 socket
      const player3Socket = ioc(`http://localhost:${port}`, {
        auth: { userId: 'player3', userName: 'Player 3', userEmail: 'player3@test.com' }
      })
      await new Promise(resolve => player3Socket.on('connect', resolve))

      // Player 3 tries to join full room
      player3Socket.emit('join-room', { roomCode })
      const errorResponse = await waitFor(player3Socket, 'room-error')
      expect(errorResponse).toBe('Room is full')

      player3Socket.disconnect()
    })

    it('should handle player ready toggle via Socket.IO events', async () => {
      const roomCode = 'READY01'

      // Both players join
      player1Socket.emit('join-room', { roomCode })
      player2Socket.emit('join-room', { roomCode })
      await waitFor(player1Socket, 'room-joined')
      await waitFor(player2Socket, 'room-joined')

      // Player 1 toggles ready to true
      player1Socket.emit('player-ready', { roomCode })
      const readyEvent1 = await waitFor(player1Socket, 'player-ready')
      expect(readyEvent1.players[0].isReady).toBe(true)

      // Player 2 should also receive the ready event
      const readyEvent2 = await waitFor(player2Socket, 'player-ready')
      expect(readyEvent2.players[0].isReady).toBe(true)

      // Player 1 toggles ready back to false
      player1Socket.emit('player-ready', { roomCode })
      const notReadyEvent = await waitFor(player1Socket, 'player-ready')
      expect(notReadyEvent.players[0].isReady).toBe(false)
    })

    it('should handle room leaving via Socket.IO events', async () => {
      const roomCode = 'LEAVE01'

      // Both players join
      player1Socket.emit('join-room', { roomCode })
      player2Socket.emit('join-room', { roomCode })
      await waitFor(player1Socket, 'room-joined')
      await waitFor(player2Socket, 'room-joined')

      // Player 1 leaves room
      player1Socket.emit('leave-room', { roomCode })
      const leaveEvent = await waitFor(player2Socket, 'player-left')
      expect(leaveEvent.players).toHaveLength(1)
      expect(leaveEvent.players[0].userId).toBe('player2')

      // Player 1 should also receive the event
      const leaveEvent1 = await waitFor(player1Socket, 'player-left')
      expect(leaveEvent1.players).toHaveLength(1)
    })

    it('should handle player disconnect cleanup via Socket.IO events', async () => {
      const roomCode = 'DISC01'

      // Both players join
      player1Socket.emit('join-room', { roomCode })
      player2Socket.emit('join-room', { roomCode })
      await waitFor(player1Socket, 'room-joined')
      await waitFor(player2Socket, 'room-joined')

      // Player 1 disconnects
      player1Socket.disconnect()

      // Player 2 should receive player-left event
      const disconnectEvent = await waitFor(player2Socket, 'player-left')
      expect(disconnectEvent.players).toHaveLength(1)
      expect(disconnectEvent.players[0].userId).toBe('player2')
    })
  })

  describe('validateRoomState function with real database', () => {
    it('should validate room with valid state from database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { validateRoomState } = await import('../../server.js')

      // Create and save a room to the database
      const uniqueRoomCode = generateValidRoomCode('VALID')
      const roomData = createMockRoom(uniqueRoomCode)
      roomData.players = [
        { userId: 'u1', name: 'Alice', isReady: true, score: 10, joinedAt: new Date(), email: 'u1@test.com' },
        { userId: 'u2', name: 'Bob', isReady: false, score: 5, joinedAt: new Date(), email: 'u2@test.com' }
      ];
      roomData.gameState.gameStarted = true;
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load the room from database
      const dbRoom = await Room.findOne({ code: uniqueRoomCode })
      const result = validateRoomState(dbRoom)

      expect(result.valid).toBe(true)
    })

    it('should reject room with null or undefined', async () => {
      const { validateRoomState } = await import('../../server.js')

      expect(validateRoomState(null).valid).toBe(false)
      expect(validateRoomState(undefined).valid).toBe(false)
      expect(validateRoomState('string').valid).toBe(false)
    })

    it('should reject room with invalid players array from database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { validateRoomState } = await import('../../server.js')

      // Create room with invalid players structure
      const roomData = {
        code: generateValidRoomCode('INV'),
        players: 'not an array', // Invalid
        gameState: { gameStarted: false }
      }

      const result = validateRoomState(roomData)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid players state')
    })

    it('should reject room with missing or invalid gameState from database', async () => {
      const { validateRoomState } = await import('../../server.js')

      // Test room without gameState
      const roomWithoutGameState = {
        code: generateValidRoomCode('NOGAME'),
        players: []
      }

      const result1 = validateRoomState(roomWithoutGameState)
      expect(result1.valid).toBe(false)
      expect(result1.error).toBe('Invalid game state')

      // Test room with invalid gameState
      const roomWithInvalidGameState = {
        code: generateValidRoomCode('INVGAME'),
        players: [],
        gameState: 'not an object'
      }

      const result2 = validateRoomState(roomWithInvalidGameState)
      expect(result2.valid).toBe(false)
      expect(result2.error).toBe('Invalid game state')
    })

    it('should reject room with gameStarted=true but no currentPlayer from database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { validateRoomState } = await import('../../server.js')

      const gameStartedNoCurrent = {
        code: generateValidRoomCode('NOCUR'),
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

    it('should reject room with gameStarted=false but has currentPlayer from database', async () => {
      const { validateRoomState } = await import('../../server.js')

      const gameNotStartedWithCurrent = {
        code: generateValidRoomCode('HASCUR'),
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

    it('should validate complex room state with real database persistence', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { validateRoomState } = await import('../../server.js')

      const complexRoom = {
        code: generateValidRoomCode('CPLX'),
        players: [
          { userId: 'user1', name: 'Player1', score: 10, email: 'player1@test.com', isReady: true, joinedAt: new Date() },
          { userId: 'user2', name: 'Player2', score: 5, email: 'player2@test.com', isReady: false, joinedAt: new Date() }
        ],
        maxPlayers: 2,
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user1', name: 'Player1' },
          turnCount: 5,
          tiles: [
            { id: 0, color: 'red', emoji: '🟥' },
            { id: 1, color: 'white', emoji: '⬜' }
          ],
          playerHands: {
            user1: [{ id: 'heart-1', type: 'heart', color: 'red', value: 2, emoji: '❤️' }],
            user2: [{ id: 'heart-2', type: 'heart', color: 'yellow', value: 1, emoji: '💛' }]
          },
          deck: { emoji: '💌', cards: 12, type: 'hearts' },
          magicDeck: { emoji: '🔮', cards: 10, type: 'magic' },
          playerActions: {
            user1: { drawnHeart: true, drawnMagic: false, heartsPlaced: 1, magicCardsUsed: 0 },
            user2: { drawnHeart: false, drawnMagic: false, heartsPlaced: 0, magicCardsUsed: 0 }
          }
        }
      }

      // Save to database
      const savedRoom = new Room(complexRoom)
      await savedRoom.save()

      // Load from database and validate
      const dbRoom = await Room.findOne({ code: complexRoom.code })
      const result = validateRoomState(dbRoom)

      expect(result.valid).toBe(true)
    })
  })

  describe('validatePlayerInRoom function with database integration', () => {
    it('should validate player present in room from database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { validatePlayerInRoom } = await import('../../server.js')

      const uniqueRoomCode = generateValidRoomCode('PLAYER')
      const roomData = createMockRoom(uniqueRoomCode)
      roomData.players = [
        { userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: false, score: 0, joinedAt: new Date() },
        { userId: 'user2', name: 'Player2', email: 'player2@test.com', isReady: false, score: 0, joinedAt: new Date() }
      ]

      const savedRoom = new Room(roomData)
      await savedRoom.save()

      const dbRoom = await Room.findOne({ code: uniqueRoomCode })
      const result = validatePlayerInRoom(dbRoom, 'user1')

      expect(result.valid).toBe(true)
    })

    it('should reject player not in room from database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { validatePlayerInRoom } = await import('../../server.js')

      const uniqueRoomCode = generateValidRoomCode('PLAYR')
      const roomData = createMockRoom(uniqueRoomCode)
      roomData.players = [
        { userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: false, score: 0, joinedAt: new Date() }
      ]

      const savedRoom = new Room(roomData)
      await savedRoom.save()

      const dbRoom = await Room.findOne({ code: uniqueRoomCode })
      const result = validatePlayerInRoom(dbRoom, 'user2')

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Player not in room')
    })

    it('should handle invalid room object from database context', async () => {
      const { validatePlayerInRoom } = await import('../../server.js')

      expect(validatePlayerInRoom(null, 'user1').valid).toBe(false)
      expect(validatePlayerInRoom(undefined, 'user1').valid).toBe(false)
      expect(validatePlayerInRoom('not object', 'user1').valid).toBe(false)
    })

    it('should handle missing players array in database document', async () => {
      const { validatePlayerInRoom } = await import('../../server.js')

      const roomWithoutPlayers = {
        code: generateValidRoomCode('NOPLAY'),
        notPlayers: 'not an array'
      }

      const result = validatePlayerInRoom(roomWithoutPlayers, 'user1')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid players state')
    })
  })

  describe('validateDeckState function with database persistence', () => {
    it('should validate proper deck state from database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { validateDeckState } = await import('../../server.js')

      // Use unique room code to avoid duplicate key errors
      const uniqueRoomCode = generateValidRoomCode('DECK')
      const roomData = createMockRoom(uniqueRoomCode)
      roomData.gameState.deck = {
        emoji: '💌',
        cards: 16,
        type: 'hearts'
      }

      const savedRoom = new Room(roomData)
      await savedRoom.save()

      const dbRoom = await Room.findOne({ code: uniqueRoomCode })
      const result = validateDeckState(dbRoom)

      expect(result.valid).toBe(true)
    })

    it('should reject room with missing deck from database', async () => {
      const { validateDeckState } = await import('../../server.js')

      expect(validateDeckState(null).valid).toBe(false)
      expect(validateDeckState({}).valid).toBe(false)
      expect(validateDeckState({ gameState: {} }).valid).toBe(false)
      expect(validateDeckState({ gameState: { deck: null } }).valid).toBe(false)
    })

    it('should reject invalid deck count values in database context', async () => {
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
          code: `INVALID${Date.now()}`,
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

    it('should reject invalid deck type in database', async () => {
      const { validateDeckState } = await import('../../server.js')

      const invalidTypeRooms = [
        { code: generateValidRoomCode('TYPE1'), gameState: { deck: { cards: 16, type: '' } } },
        { code: generateValidRoomCode('TYPE2'), gameState: { deck: { cards: 16, type: null } } },
        { code: generateValidRoomCode('TYPE3'), gameState: { deck: { cards: 16, type: undefined } } },
        { code: generateValidRoomCode('TYPE4'), gameState: { deck: { cards: 16, type: 123 } } }
      ]

      for (const room of invalidTypeRooms) {
        const result = validateDeckState(room)
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Invalid deck type')
      }
    })
  })

  describe('validateTurn function with game state persistence', () => {
    it('should validate current player turn from database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { validateTurn } = await import('../../server.js')

      const uniqueRoomCode = generateValidRoomCode('TURN')
      const roomData = createMockRoom(uniqueRoomCode)
      roomData.gameState.gameStarted = true
      roomData.gameState.currentPlayer = { userId: 'user1', name: 'Player1' }

      const savedRoom = new Room(roomData)
      await savedRoom.save()

      const dbRoom = await Room.findOne({ code: uniqueRoomCode })
      const result = validateTurn(dbRoom, 'user1')

      expect(result.valid).toBe(true)
    })

    it('should reject when game not started from database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { validateTurn } = await import('../../server.js')

      const uniqueRoomCode = generateValidRoomCode('NRTED')
      const roomData = createMockRoom(uniqueRoomCode)
      roomData.gameState.gameStarted = false
      roomData.gameState.currentPlayer = { userId: 'user1', name: 'Player1' }

      const savedRoom = new Room(roomData)
      await savedRoom.save()

      const dbRoom = await Room.findOne({ code: uniqueRoomCode })
      const result = validateTurn(dbRoom, 'user1')

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Game not started')
    })

    it('should reject wrong player turn from database', async () => {
      const { validateTurn } = await import('../../server.js')

      const roomWithDifferentPlayer = {
        code: generateValidRoomCode('WRONG'),
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user1', name: 'Player1' }
        }
      }

      const result = validateTurn(roomWithDifferentPlayer, 'user2')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Not your turn')
    })

    it('should handle invalid room state from database context', async () => {
      const { validateTurn } = await import('../../server.js')

      expect(validateTurn(null, 'user1').valid).toBe(false)
      expect(validateTurn({}, 'user1').valid).toBe(false)
      expect(validateTurn({ gameState: null }, 'user1').valid).toBe(false)
    })
  })

  describe('validateCardDrawLimit function with persistent player actions', () => {
    it('should initialize player actions when not present in database', async () => {
      const { validateCardDrawLimit } = await import('../../server.js')

      const room = {
        code: generateValidRoomCode('NOACT'),
        gameState: {}
      }

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

    it('should return existing player actions from database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { validateCardDrawLimit } = await import('../../server.js')

      const existingActions = {
        drawnHeart: true,
        drawnMagic: false,
        heartsPlaced: 1,
        magicCardsUsed: 0
      }

      const uniqueRoomCode = generateValidRoomCode('EXIST')
      const roomData = createMockRoom(uniqueRoomCode)
      roomData.gameState.playerActions = {
        user1: existingActions
      }

      const savedRoom = new Room(roomData)
      await savedRoom.save()

      const dbRoom = await Room.findOne({ code: uniqueRoomCode })
      const result = validateCardDrawLimit(dbRoom, 'user1')

      expect(result.valid).toBe(true)
      expect(result.currentActions).toEqual(existingActions)
    })

    it('should handle different players independently with database persistence', async () => {
      const { validateCardDrawLimit } = await import('../../server.js')

      const room = {
        code: generateValidRoomCode('MULTI'),
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

  describe('Complex room state validation with database integration', () => {
    it('should handle complex room states with full database persistence', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { validateRoomState } = await import('../../server.js')

      const uniqueRoomCode = generateValidRoomCode('FPLEX')
      const complexRoom = {
        code: uniqueRoomCode,
        players: [
          {
            userId: 'user1',
            name: 'Player1',
            score: 10,
            email: 'player1@test.com',
            isReady: true,
            joinedAt: new Date()
          },
          {
            userId: 'user2',
            name: 'Player2',
            score: 5,
            email: 'player2@test.com',
            isReady: true,
            joinedAt: new Date()
          }
        ],
        maxPlayers: 2,
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user1', name: 'Player1' },
          turnCount: 5,
          tiles: [
            { id: 0, color: 'red', emoji: '🟥', placedHeart: null },
            { id: 1, color: 'yellow', emoji: '🟨', placedHeart: null },
            { id: 2, color: 'green', emoji: '🟩', placedHeart: null },
            { id: 3, color: 'white', emoji: '⬜', placedHeart: null }
          ],
          playerHands: {
            user1: [
              { id: 'heart-1', type: 'heart', color: 'red', value: 2, emoji: '❤️' },
              { id: 'heart-2', type: 'heart', color: 'yellow', value: 1, emoji: '💛' },
              { id: 'magic-1', type: 'magic', magicType: 'wind', emoji: '💨' }
            ],
            user2: [
              { id: 'heart-3', type: 'heart', color: 'green', value: 3, emoji: '💚' },
              { id: 'heart-4', type: 'heart', color: 'red', value: 2, emoji: '❤️' },
              { id: 'magic-2', type: 'magic', magicType: 'shield', emoji: '🛡️' }
            ]
          },
          deck: { emoji: '💌', cards: 12, type: 'hearts' },
          magicDeck: { emoji: '🔮', cards: 10, type: 'magic' },
          shields: {},
          playerActions: {
            user1: { drawnHeart: true, drawnMagic: false, heartsPlaced: 1, magicCardsUsed: 0 },
            user2: { drawnHeart: false, drawnMagic: false, heartsPlaced: 0, magicCardsUsed: 0 }
          }
        }
      }

      // Save to database
      const savedRoom = new Room(complexRoom)
      await savedRoom.save()
      await waitForAsync(100) // Ensure database operation completes

      // Load from database and validate
      const dbRoom = await Room.findOne({ code: uniqueRoomCode })
      const result = validateRoomState(dbRoom)

      expect(result.valid).toBe(true)
    })

    it('should handle partial room states from database context', async () => {
      const { validateRoomState } = await import('../../server.js')

      // Room with some but not all properties
      const partialRoom = {
        code: generateValidRoomCode('PARTIAL'),
        players: [],
        gameState: {
          gameStarted: undefined, // Explicitly undefined
          currentPlayer: null
        }
      }

      const result = validateRoomState(partialRoom)
      expect(result.valid).toBe(true) // Should be valid when gameStarted is undefined
    })

    it('should maintain data consistency across database operations', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { validateRoomState, validatePlayerInRoom, validateDeckState } = await import('../../server.js')

      const uniqueRoomCode = generateValidRoomCode('CONSY')
      const roomData = createMockRoom(uniqueRoomCode)
      roomData.players = [
        { userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: true, score: 0, joinedAt: new Date() }
      ]
      roomData.gameState.deck = { emoji: '💌', cards: 16, type: 'hearts' }
      roomData.gameState.magicDeck = { emoji: '🔮', cards: 16, type: 'magic' }
      roomData.gameState.gameStarted = true;

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load and perform multiple validations
      const dbRoom = await Room.findOne({ code: uniqueRoomCode })

      const roomStateResult = validateRoomState(dbRoom)

      const playerResult = validatePlayerInRoom(dbRoom, 'user1')
      const deckResult = validateDeckState(dbRoom)

      expect(roomStateResult.valid).toBe(true)
      expect(playerResult.valid).toBe(true)
      expect(deckResult.valid).toBe(true)
    })
  })

  // Direct server.js function tests to maximize coverage
  describe('Direct Server.js Function Tests', () => {
    it('should execute all imported server utility functions', async () => {
      // Test input sanitization
      const cleanInput = sanitizeInput('<script>alert("xss")</script>')
      expect(cleanInput).not.toContain('<script>')
      expect(cleanInput).not.toContain('</script>')

      // Test IP extraction
      const testSocket = {
        handshake: { address: '192.168.1.1' },
        conn: { remoteAddress: '127.0.0.1' },
        headers: { 'x-forwarded-for': '192.168.1.1' },
        connection: { remoteAddress: '127.0.0.1' }
      }
      const clientIP = getClientIP(testSocket)
      expect(clientIP).toBeDefined()

      // Test player finding functions
      const testRoom = {
        players: [
          { userId: 'user1', name: 'Alice', email: 'alice@test.com' },
          { userId: 'user2', name: 'Bob', email: 'bob@test.com' }
        ]
      }

      const foundPlayer = findPlayerByUserId(testRoom, 'user1')
      expect(foundPlayer).toBeDefined()
      expect(foundPlayer.name).toBe('Alice')

      const foundByName = findPlayerByName(testRoom, 'Bob')
      expect(foundByName).toBeDefined()
      expect(foundByName.userId).toBe('user2')

      // Test validation functions
      const testRoomCode = generateValidRoomCode('TEST')
      const validRoomCode = validateRoomCode(testRoomCode)
      expect(validRoomCode).toBe(true)

      const invalidRoomCode = validateRoomCode('TOOLONG')
      expect(invalidRoomCode).toBe(false)

      const validPlayerName = validatePlayerName('Alice')
      expect(validPlayerName).toBe(true)

      const invalidPlayerName = validatePlayerName('')
      expect(invalidPlayerName).toBe(false)

      // Test turn validation
      const gameRoom = {
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user1' }
        }
      }
      const validTurn = validateTurn(gameRoom, 'user1')
      expect(validTurn.valid).toBe(true)

      const invalidTurn = validateTurn(gameRoom, 'user2')
      expect(invalidTurn.valid).toBe(false)

      // Test game logic functions
      const tiles = generateTiles()
      expect(tiles).toBeDefined()
      expect(Array.isArray(tiles)).toBe(true)

      const score = calculateScore({ color: 'red', value: 2 }, { color: 'red' })
      expect(score).toBe(4) // Double points for matching colors

      const whiteScore = calculateScore({ color: 'blue', value: 3 }, { color: 'white' })
      expect(whiteScore).toBe(3) // Face value for white tiles

      const mismatchScore = calculateScore({ color: 'red', value: 2 }, { color: 'yellow' })
      expect(mismatchScore).toBe(0) // Zero for mismatch

      // Test game end conditions
      const gameRoomNotEnded = {
        gameState: {
          gameStarted: true,
          tiles: [{ placedHeart: { value: 2 } }, {}], // One tile filled, one empty
          deck: { cards: 10 },
          magicDeck: { cards: 8 }
        }
      }
      const notEnded = checkGameEndConditions(gameRoomNotEnded, false)
      expect(notEnded.shouldEnd).toBe(false)

      const gameRoomEnded = {
        gameState: {
          gameStarted: true,
          tiles: [{ placedHeart: { value: 2 } }, { placedHeart: { value: 1 } }], // All tiles filled
          deck: { cards: 0 }, // Empty deck
          magicDeck: { cards: 5 }
        }
      }
      const ended = checkGameEndConditions(gameRoomEnded, true)
      expect(ended.shouldEnd).toBe(true)

      // Test card generation
      const heartCard = generateSingleHeart()
      expect(heartCard).toBeDefined()
      expect(heartCard.type).toBe('heart')
      expect(['red', 'yellow', 'green']).toContain(heartCard.color)

      const magicCard = generateSingleMagicCard()
      expect(magicCard).toBeDefined()
      expect(['wind', 'recycle', 'shield']).toContain(magicCard.type)

      // Test player action validation
      const actionTestRoom = {
        gameState: {
          playerActions: {
            user1: { drawnHeart: false, drawnMagic: false, heartsPlaced: 0, magicCardsUsed: 0 }
          },
          playerHands: {
            user1: [
              { id: 'heart-1', type: 'heart', color: 'red', value: 2 },
              { id: 'heart-2', type: 'heart', color: 'yellow', value: 1 }
            ]
          },
          tiles: [{ id: 0 }, { id: 1 }, { id: 2 }]
        }
      }

      const drawLimit = validateCardDrawLimit(actionTestRoom, 'user1')
      expect(drawLimit.valid).toBe(true)

      actionTestRoom.gameState.playerActions.user1.drawnHeart = true
      actionTestRoom.gameState.playerActions.user1.drawnMagic = true
      const exceededDrawLimit = validateCardDrawLimit(actionTestRoom, 'user1')
      expect(exceededDrawLimit.valid).toBe(true) // Always valid, just tracks actions

      const heartPlacement = validateHeartPlacement(actionTestRoom, 'user1', 'heart-1', 0)
      expect(heartPlacement.valid).toBe(true)

      // Test heart placement limits
      const heartLimitRoom = {
        gameState: {
          playerActions: {
            user1: { heartsPlaced: 1 }
          }
        }
      }
      const canPlaceMore = canPlaceMoreHearts(heartLimitRoom, 'user1')
      expect(canPlaceMore).toBe(true)

      const cannotPlaceMoreRoom = {
        gameState: {
          playerActions: {
            user1: { heartsPlaced: 2 }
          }
        }
      }
      const cannotPlaceMore = canPlaceMoreHearts(cannotPlaceMoreRoom, 'user1')
      expect(cannotPlaceMore).toBe(false)

      // Test magic card usage limits
      const magicLimitRoom = {
        gameState: {
          playerActions: {
            user1: { magicCardsUsed: 0 }
          }
        }
      }
      const canUseMagic = canUseMoreMagicCards(magicLimitRoom, 'user1')
      expect(canUseMagic).toBe(true)

      const cannotUseMagicRoom = {
        gameState: {
          playerActions: {
            user1: { magicCardsUsed: 1 }
          }
        }
      }
      const cannotUseMagic = canUseMoreMagicCards(cannotUseMagicRoom, 'user1')
      expect(cannotUseMagic).toBe(false)

      // Test action recording functions
      const recordingTestRoom = {
        gameState: {
          playerHands: { user1: [] },
          playerActions: { user1: { drawnHeart: false, drawnMagic: false, heartsPlaced: 0, magicCardsUsed: 0 } }
        }
      }

      recordCardDraw(recordingTestRoom, 'user1', 'heart')
      expect(recordingTestRoom.gameState.playerActions.user1.drawnHeart).toBe(true)

      recordHeartPlacement(recordingTestRoom, 'user1', 0, { value: 2, color: 'red' })
      expect(recordingTestRoom.gameState.playerActions.user1.heartsPlaced).toBe(1)

      recordMagicCardUsage(recordingTestRoom, 'user1', 'wind')
      expect(recordingTestRoom.gameState.playerActions.user1.magicCardsUsed).toBe(1)

      resetPlayerActions(recordingTestRoom, 'user1')
      expect(recordingTestRoom.gameState.playerActions.user1.drawnHeart).toBe(false)
      expect(recordingTestRoom.gameState.playerActions.user1.heartsPlaced).toBe(0)

      // Test turn lock functions
      const lockKey = `test-lock-${Date.now()}`
      const acquired = await acquireTurnLock(lockKey, 'user1', 5000)
      expect(acquired).toBe(true)

      const released = await releaseTurnLock(lockKey, 'user1')
      expect(released).toBeUndefined() // Function doesn't return a value

      // Test shield expiration
      const roomWithShields = {
        gameState: {
          shields: {
            user1: { remainingTurns: 1, activatedTurn: 1 },
            user2: { remainingTurns: 0, activatedTurn: 1 }
          }
        },
        players: [
          { userId: 'user1', name: 'Player1' },
          { userId: 'user2', name: 'Player2' }
        ]
      }

      checkAndExpireShields(roomWithShields)
      expect(roomWithShields.gameState.shields.user2).toBeUndefined()
    })

    it('should execute player data migration functions', async () => {
      const legacyRoom = {
        players: [
          { userId: 'old-user1', name: 'OldPlayer', ready: true, isReady: true }
        ],
        gameState: {
          currentPlayer: { userId: 'old-user1', name: 'OldPlayer', email: 'old@example.com' }
        }
      }

      await migratePlayerData(legacyRoom, 'old-user1', 'new-user1', 'NewPlayer', 'new@example.com')
      expect(legacyRoom.players[0].userId).toBe('new-user1')
      expect(legacyRoom.players[0].name).toBe('NewPlayer')
      expect(legacyRoom.players[0].email).toBe('new@example.com')
      expect(legacyRoom.players[0].isReady).toBe(true) // Should preserve ready status
      expect(legacyRoom.gameState.currentPlayer).toEqual({
        userId: 'new-user1',
        name: 'NewPlayer',
        email: 'new@example.com',
        isReady: true
      })
    })

    it('should execute starting player selection', () => {
      const players = [
        { userId: 'user1', name: 'Alice' },
        { userId: 'user2', name: 'Bob' }
      ]

      const startingPlayer = selectRandomStartingPlayer(players)
      expect(startingPlayer).toBeDefined()
      expect(players).toContain(startingPlayer)
    })
  })
})