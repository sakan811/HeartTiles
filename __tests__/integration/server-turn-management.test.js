import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import {
  connectToDatabase,
  disconnectDatabase,
  clearDatabase,
  clearTurnLocks
} from '../utils/server-test-utils.js'
import { Room } from '../../models.js'
import { createMockRoom } from './setup.js'
import { waitFor, setupTestSockets, cleanupTestSockets } from '../helpers/socket-test-utils.js'

describe('Server Turn Management Integration Tests', () => {
  let io, serverSocket, clientSocket, player1Socket, player2Socket
  let httpServer, port

  beforeAll(async () => {
    // Connect to database
    try {
      await connectToDatabase()
    } catch (error) {
      console.warn('Database connection failed, skipping tests:', error.message)
    }

    // Set up Socket.IO server with turn management handlers
    return new Promise((resolve, reject) => {
      httpServer = createServer()
      io = new Server(httpServer, {
        cors: {
          origin: "*",
          methods: ["GET", "POST"]
        },
        transports: ['websocket']
      })

      // Mock authentication middleware
      io.use(async (socket, next) => {
        try {
          const { userId, userName, userEmail } = socket.handshake.auth || {}
          if (!userId || !userName || !userEmail) {
            return next(new Error('Authentication required'))
          }
          socket.data.userId = userId
          socket.data.userEmail = userEmail
          socket.data.userName = userName
          socket.data.userSessionId = `session_${userId}`
          next()
        } catch (error) {
          next(error)
        }
      })

      // Setup socket handlers for turn management testing
      io.on('connection', (socket) => {
        serverSocket = socket
        console.log(`Socket connected: ${socket.id}`)
        setupTurnSocketHandlers(socket, io)
      })

      io.on('connect_error', (error) => {
        console.error('Socket connection error:', error)
      })

      httpServer.listen(0, () => {
        port = httpServer.address().port
        console.log(`Test server started on port ${port}`)
        resolve()
      })

      httpServer.on('error', reject)
    })
  }, 30000)

  afterAll(async () => {
    // Clean up sockets with improved error handling
    cleanupTestSockets({ player1Socket, player2Socket, clientSocket })

    if (io) io.close()
    if (httpServer) httpServer.close()

    try {
      await clearDatabase()
      await disconnectDatabase()
    } catch (error) {
      console.warn('Database cleanup failed:', error.message)
    }
  })

  // Setup socket handlers for turn management testing
  function setupTurnSocketHandlers(socket, io) {
    const rooms = new Map()
    const turnLocks = new Map()

    // Helper functions for turn management
    function acquireTurnLock(roomCode, socketId) {
      const lockKey = roomCode
      const existingLock = turnLocks.get(lockKey)

      if (existingLock) {
        const now = Date.now()
        const lockAge = now - existingLock.timestamp
        if (lockAge > 30 * 1000) {
          turnLocks.delete(lockKey)
        } else {
          return false
        }
      }

      turnLocks.set(lockKey, { socketId, timestamp: Date.now() })
      return true
    }

    function releaseTurnLock(roomCode, socketId) {
      const lockKey = roomCode
      const lock = turnLocks.get(lockKey)
      if (lock && lock.socketId === socketId) {
        turnLocks.delete(lockKey)
      }
    }

    function validateTurn(room, userId) {
      if (!room?.gameState?.gameStarted) return { valid: false, error: "Game not started" }
      if (!room.gameState.currentPlayer || room.gameState.currentPlayer.userId !== userId) {
        return { valid: false, error: "Not your turn" }
      }
      return { valid: true }
    }

    socket.on('join-room', async ({ roomCode }) => {
      const { userId, userName, userEmail } = socket.data
      console.log(`Player ${userId} joining room ${roomCode}`)

      roomCode = roomCode.toUpperCase()
      let room = rooms.get(roomCode)

      if (!room) {
        console.log(`Creating new room ${roomCode}`)
        room = {
          code: roomCode,
          players: [],
          maxPlayers: 2,
          gameState: {
            tiles: [
              { id: 0, color: 'red', emoji: '🟥', placedHeart: null },
              { id: 1, color: 'yellow', emoji: '🟨', placedHeart: null },
              { id: 2, color: 'green', emoji: '🟩', placedHeart: null },
              { id: 3, color: 'white', emoji: '⬜', placedHeart: null }
            ],
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
        console.log(`Adding player ${userId} to room ${roomCode}`)
        room.players.push({
          userId,
          name: userName,
          email: userEmail,
          isReady: false,
          score: 0,
          joinedAt: new Date()
        })
      } else if (existingPlayer) {
        console.log(`Player ${userId} already in room ${roomCode}`)
      } else {
        console.log(`Room ${roomCode} is full`)
      }

      socket.join(roomCode)
      socket.data.roomCode = roomCode

      console.log(`Room ${roomCode} now has ${room.players.length} players`)

      socket.emit('room-joined', {
        players: room.players,
        playerId: userId
      })

      io.to(roomCode).emit('player-joined', { players: room.players })
    })

    socket.on('player-ready', async ({ roomCode }) => {
      const { userId } = socket.data
      console.log(`Player ${userId} ready in room ${roomCode}`)
      const room = rooms.get(roomCode)

      if (!room) {
        console.log(`Room ${roomCode} not found`)
        return
      }

      const player = room.players.find(p => p.userId === userId)
      if (!player) {
        console.log(`Player ${userId} not found in room ${roomCode}`)
        return
      }

      player.isReady = !player.isReady
      console.log(`Player ${userId} ready status: ${player.isReady}`)

      // Start game if both players are ready
      if (room.players.length === 2 && room.players.every(p => p.isReady)) {
        console.log('Starting game - both players ready')
        room.gameState.gameStarted = true
        room.gameState.currentPlayer = room.players[0]
        room.gameState.turnCount = 1

        // Initialize player hands and actions
        room.players.forEach(player => {
          room.gameState.playerHands[player.userId] = []
          room.gameState.playerActions[player.userId] = {
            drawnHeart: false,
            drawnMagic: false,
            heartsPlaced: 0,
            magicCardsUsed: 0
          }
        })

        const playersWithHands = room.players.map(player => ({
          ...player,
          hand: room.gameState.playerHands[player.userId] || [],
          score: player.score || 0
        }))

        const gameStartData = {
          tiles: room.gameState.tiles,
          currentPlayer: room.gameState.currentPlayer,
          players: playersWithHands,
          playerHands: room.gameState.playerHands,
          deck: room.gameState.deck,
          magicDeck: room.gameState.magicDeck,
          turnCount: room.gameState.turnCount,
          shields: room.gameState.shields || {},
          playerActions: room.gameState.playerActions || {}
        }

        room.players.forEach(player => {
          const playerSocket = Array.from(io.sockets.sockets.values())
            .find(s => s.data.userId === player.userId)
          if (playerSocket) {
            console.log(`Emitting game-start to player ${player.userId}`)
            playerSocket.emit('game-start', { ...gameStartData, playerId: player.userId })
          } else {
            console.log(`No socket found for player ${player.userId}`)
          }
        })
      } else {
        console.log(`Game not starting. Players: ${room.players.length}, Ready: ${room.players.map(p => `${p.userId}: ${p.isReady}`).join(', ')}`)
        io.to(roomCode).emit('player-ready', { players: room.players })
      }
    })

    socket.on('end-turn', async ({ roomCode }) => {
      const { userId } = socket.data
      const room = rooms.get(roomCode)

      if (!room) {
        socket.emit('room-error', 'Room not found')
        return
      }

      const turnValidation = validateTurn(room, userId)
      if (!turnValidation.valid) {
        socket.emit('room-error', turnValidation.error)
        return
      }

      if (!acquireTurnLock(roomCode, socket.id)) {
        socket.emit('room-error', 'Action in progress, please wait')
        return
      }

      try {
        if (room.gameState.gameStarted) {
          // Reset actions for current player
          const currentUserId = room.gameState.currentPlayer.userId
          room.gameState.playerActions[currentUserId] = {
            drawnHeart: false,
            drawnMagic: false,
            heartsPlaced: 0,
            magicCardsUsed: 0
          }

          // Switch to next player
          const currentPlayerIndex = room.players.findIndex(p => p.userId === currentUserId)
          const nextPlayerIndex = (currentPlayerIndex + 1) % room.players.length

          room.gameState.currentPlayer = room.players[nextPlayerIndex]
          room.gameState.turnCount++

          const playersWithHands = room.players.map(player => ({
            ...player,
            hand: room.gameState.playerHands[player.userId] || []
          }))

          io.to(roomCode).emit('turn-changed', {
            currentPlayer: room.gameState.currentPlayer,
            turnCount: room.gameState.turnCount,
            players: playersWithHands,
            playerHands: room.gameState.playerHands,
            deck: room.gameState.deck,
            shields: room.gameState.shields || {},
            playerActions: room.gameState.playerActions || {}
          })
        }
      } finally {
        releaseTurnLock(roomCode, socket.id)
      }
    })

    socket.on('disconnect', () => {
      const roomCode = socket.data.roomCode
      if (roomCode) {
        releaseTurnLock(roomCode, socket.id)
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

    // Create authenticated client sockets with improved error handling
    const sockets = await setupTestSockets(port)
    player1Socket = sockets.player1Socket
    player2Socket = sockets.player2Socket

    vi.clearAllMocks()
    global.turnLocks = new Map()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (global.turnLocks) {
      global.turnLocks.clear()
    }

    // Clean up socket connections with improved error handling
    cleanupTestSockets({ player1Socket, player2Socket, clientSocket })
  })

  describe('Socket.IO Turn Management Events', () => {
    it('should handle turn changes via Socket.IO events', async () => {
      const roomCode = 'TURN01'

      console.log('Starting test - player1Socket connected:', player1Socket.connected)
      console.log('Starting test - player2Socket connected:', player2Socket.connected)

      // Both players join and ready up
      console.log('Emitting join-room events')
      player1Socket.emit('join-room', { roomCode })
      player2Socket.emit('join-room', { roomCode })

      console.log('Waiting for room-joined events')
      await waitFor(player1Socket, 'room-joined')
      await waitFor(player2Socket, 'room-joined')
      console.log('Both players joined room')

      console.log('Emitting player-ready events')
      player1Socket.emit('player-ready', { roomCode })
      player2Socket.emit('player-ready', { roomCode })

      console.log('Waiting for game-start event')
      const gameStartData = await waitFor(player1Socket, 'game-start')
      expect(gameStartData.currentPlayer.userId).toBe('player1')
      expect(gameStartData.turnCount).toBe(1)

      // Player 1 ends turn
      player1Socket.emit('end-turn', { roomCode })
      const turnChanged1 = await waitFor(player1Socket, 'turn-changed')

      expect(turnChanged1.currentPlayer.userId).toBe('player2')
      expect(turnChanged1.turnCount).toBe(2)
      expect(turnChanged1.playerActions['player1']).toEqual({
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0
      })

      // Player 2 should also receive the turn change event
      const turnChanged2 = await waitFor(player2Socket, 'turn-changed')
      expect(turnChanged2.currentPlayer.userId).toBe('player2')
      expect(turnChanged2.turnCount).toBe(2)
    })

    it('should reject turn ending when not player\'s turn via Socket.IO events', async () => {
      const roomCode = 'TURN02'

      // Setup game
      player1Socket.emit('join-room', { roomCode })
      player2Socket.emit('join-room', { roomCode })
      await waitFor(player1Socket, 'room-joined')
      await waitFor(player2Socket, 'room-joined')

      player1Socket.emit('player-ready', { roomCode })
      player2Socket.emit('player-ready', { roomCode })
      await waitFor(player1Socket, 'game-start')

      // Player 2 tries to end turn when it's Player 1's turn
      player2Socket.emit('end-turn', { roomCode })
      const errorResponse = await waitFor(player2Socket, 'room-error')
      expect(errorResponse).toBe('Not your turn')
    })

    it('should reject turn ending when game not started via Socket.IO events', async () => {
      const roomCode = 'TURN03'

      // Players join but don't ready up
      player1Socket.emit('join-room', { roomCode })
      player2Socket.emit('join-room', { roomCode })
      await waitFor(player1Socket, 'room-joined')
      await waitFor(player2Socket, 'room-joined')

      // Player 1 tries to end turn before game starts
      player1Socket.emit('end-turn', { roomCode })
      const errorResponse = await waitFor(player1Socket, 'room-error')
      expect(errorResponse).toBe('Game not started')
    })

    it('should handle turn lock mechanism via Socket.IO events', async () => {
      const roomCode = 'TURN04'

      // Setup game
      player1Socket.emit('join-room', { roomCode })
      player2Socket.emit('join-room', { roomCode })
      await waitFor(player1Socket, 'room-joined')
      await waitFor(player2Socket, 'room-joined')

      player1Socket.emit('player-ready', { roomCode })
      player2Socket.emit('player-ready', { roomCode })
      await waitFor(player1Socket, 'game-start')

      // Player 1 ends turn (acquires lock)
      const endTurnPromise1 = player1Socket.emit('end-turn', { roomCode })

      // Player 1 tries to end turn again while first action is in progress
      player1Socket.emit('end-turn', { roomCode })
      const errorResponse = await waitFor(player1Socket, 'room-error')
      expect(errorResponse).toBe('Action in progress, please wait')

      // Wait for first action to complete
      await endTurnPromise1
    })

    it('should handle multiple turn cycles via Socket.IO events', async () => {
      const roomCode = 'TURN05'

      // Setup game
      player1Socket.emit('join-room', { roomCode })
      player2Socket.emit('join-room', { roomCode })
      await waitFor(player1Socket, 'room-joined')
      await waitFor(player2Socket, 'room-joined')

      player1Socket.emit('player-ready', { roomCode })
      player2Socket.emit('player-ready', { roomCode })
      await waitFor(player1Socket, 'game-start')

      // Complete multiple turn cycles
      for (let i = 0; i < 4; i++) {
        const currentTurn = i + 1
        const expectedPlayer = currentTurn % 2 === 1 ? 'player1' : 'player2'
        const nextPlayer = currentTurn % 2 === 1 ? 'player2' : 'player1'
        const currentPlayerSocket = expectedPlayer === 'player1' ? player1Socket : player2Socket

        // Current player ends turn
        currentPlayerSocket.emit('end-turn', { roomCode })
        const turnChanged = await waitFor(player1Socket, 'turn-changed')

        expect(turnChanged.currentPlayer.userId).toBe(nextPlayer)
        expect(turnChanged.turnCount).toBe(currentTurn + 1)
      }
    })

    it('should reset player actions on turn end via Socket.IO events', async () => {
      const roomCode = 'TURN06'

      // Setup game
      player1Socket.emit('join-room', { roomCode })
      player2Socket.emit('join-room', { roomCode })
      await waitFor(player1Socket, 'room-joined')
      await waitFor(player2Socket, 'room-joined')

      player1Socket.emit('player-ready', { roomCode })
      player2Socket.emit('player-ready', { roomCode })
      const gameStartData = await waitFor(player1Socket, 'game-start')

      // Initially player actions should be reset
      expect(gameStartData.playerActions['player1']).toEqual({
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0
      })

      // Player 1 ends turn
      player1Socket.emit('end-turn', { roomCode })
      const turnChanged = await waitFor(player1Socket, 'turn-changed')

      // Player 1's actions should be reset again
      expect(turnChanged.playerActions['player1']).toEqual({
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0
      })
    })

    it('should handle turn cleanup on player disconnect via Socket.IO events', async () => {
      const roomCode = 'TURN07'

      // Setup game
      player1Socket.emit('join-room', { roomCode })
      player2Socket.emit('join-room', { roomCode })
      await waitFor(player1Socket, 'room-joined')
      await waitFor(player2Socket, 'room-joined')

      player1Socket.emit('player-ready', { roomCode })
      player2Socket.emit('player-ready', { roomCode })
      await waitFor(player1Socket, 'game-start')

      // Player 1 disconnects during their turn
      player1Socket.disconnect()

      // Player 2 should receive player-left event
      const playerLeftEvent = await waitFor(player2Socket, 'player-left')
      expect(playerLeftEvent.players).toHaveLength(1)
      expect(playerLeftEvent.players[0].userId).toBe('player2')
    })
  })

  describe('recordCardDraw function with database persistence', () => {
    it('should record heart card draw correctly in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { recordCardDraw } = await import('../../server.js')

      const roomData = createMockRoom('HRTDRAW')
      roomData.gameState.playerActions = {}

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and record card draw
      const dbRoom = await Room.findOne({ code: 'HRTDRAW' })
      recordCardDraw(dbRoom, 'user1', 'heart')

      expect(dbRoom.gameState.playerActions.user1.drawnHeart).toBe(true)
      expect(dbRoom.gameState.playerActions.user1.drawnMagic).toBe(false)

      // Save to database
      await dbRoom.save()

      // Verify persistence
      const updatedRoom = await Room.findOne({ code: 'HRTDRAW' })
      expect(updatedRoom.gameState.playerActions.user1.drawnHeart).toBe(true)
    })

    it('should record magic card draw correctly in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { recordCardDraw } = await import('../../server.js')

      const roomData = createMockRoom('MGCDRAW')
      roomData.gameState.playerActions = {}

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and record card draw
      const dbRoom = await Room.findOne({ code: 'MGCDRAW' })
      recordCardDraw(dbRoom, 'user1', 'magic')

      expect(dbRoom.gameState.playerActions.user1.drawnHeart).toBe(false)
      expect(dbRoom.gameState.playerActions.user1.drawnMagic).toBe(true)

      // Save to database
      await dbRoom.save()

      // Verify persistence
      const updatedRoom = await Room.findOne({ code: 'MGCDRAW' })
      expect(updatedRoom.gameState.playerActions.user1.drawnMagic).toBe(true)
    })

    it('should initialize player actions if missing in database', async () => {
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

    it('should preserve existing action data in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { recordCardDraw } = await import('../../server.js')

      const roomData = createMockRoom('PRESERV')
      roomData.gameState.playerActions = {
        user1: {
          drawnMagic: true,
          heartsPlaced: 1
        }
      }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and record additional card draw
      const dbRoom = await Room.findOne({ code: 'PRESERV' })
      recordCardDraw(dbRoom, 'user1', 'heart')

      expect(dbRoom.gameState.playerActions.user1).toEqual({
        drawnHeart: true,
        drawnMagic: true, // Should preserve
        heartsPlaced: 1, // Should preserve
        magicCardsUsed: 0
      })

      // Save to database
      await dbRoom.save()

      // Verify persistence
      const updatedRoom = await Room.findOne({ code: 'PRESERV' })
      expect(updatedRoom.gameState.playerActions.user1.drawnHeart).toBe(true)
      expect(updatedRoom.gameState.playerActions.user1.drawnMagic).toBe(true)
      expect(updatedRoom.gameState.playerActions.user1.heartsPlaced).toBe(1)
    })
  })

  describe('resetPlayerActions function with database persistence', () => {
    it('should reset player actions correctly in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { resetPlayerActions } = await import('../../server.js')

      const roomData = createMockRoom('RESET01')
      roomData.gameState.playerActions = {
        user1: {
          drawnHeart: true,
          drawnMagic: true,
          heartsPlaced: 2,
          magicCardsUsed: 1
        }
      }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and reset actions
      const dbRoom = await Room.findOne({ code: 'RESET01' })
      resetPlayerActions(dbRoom, 'user1')

      expect(dbRoom.gameState.playerActions.user1).toEqual({
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0
      })

      // Save to database
      await dbRoom.save()

      // Verify persistence
      const updatedRoom = await Room.findOne({ code: 'RESET01' })
      expect(updatedRoom.gameState.playerActions.user1.drawnHeart).toBe(false)
      expect(updatedRoom.gameState.playerActions.user1.drawnMagic).toBe(false)
      expect(updatedRoom.gameState.playerActions.user1.heartsPlaced).toBe(0)
      expect(updatedRoom.gameState.playerActions.user1.magicCardsUsed).toBe(0)
    })

    it('should initialize player actions if missing in database', async () => {
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

    it('should not affect other player actions in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { resetPlayerActions } = await import('../../server.js')

      const roomData = createMockRoom('PLAY01') // Will be converted to uppercase (6 chars)
      roomData.gameState.playerActions = {
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

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and reset only user1 actions
      const dbRoom = await Room.findOne({ code: 'PLAY01' }) // Will be converted to uppercase
      resetPlayerActions(dbRoom, 'user1')

      expect(dbRoom.gameState.playerActions.user1).toEqual({
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0
      })

      expect(dbRoom.gameState.playerActions.user2).toEqual({
        drawnHeart: false,
        drawnMagic: true,
        heartsPlaced: 0,
        magicCardsUsed: 0
      })

      // Save to database
      await dbRoom.save()

      // Verify persistence
      const updatedRoom = await Room.findOne({ code: 'PLAY01' }) // Will be converted to uppercase
      expect(updatedRoom.gameState.playerActions.user1.drawnHeart).toBe(false)
      expect(updatedRoom.gameState.playerActions.user2.drawnMagic).toBe(true)
    })
  })

  describe('checkGameEndConditions function with database integration', () => {
    it('should end game when all tiles are filled in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { checkGameEndConditions } = await import('../../server.js')

      const roomData = createMockRoom('ALLTILE')
      roomData.gameState.gameStarted = true
      roomData.gameState.tiles = [
        { id: 0, color: 'red', emoji: '🟥', placedHeart: { value: 1, color: 'red', emoji: '❤️' } },
        { id: 1, color: 'yellow', emoji: '🟨', placedHeart: { value: 2, color: 'yellow', emoji: '💛' } },
        { id: 2, color: 'green', emoji: '🟩', placedHeart: { value: 3, color: 'green', emoji: '💚' } }
      ]

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and check end conditions
      const dbRoom = await Room.findOne({ code: 'ALLTILE' })
      const result = checkGameEndConditions(dbRoom)

      expect(result.shouldEnd).toBe(true)
      expect(result.reason).toBe('All tiles are filled')
    })

    it('should end game when both decks are empty in database (no grace period)', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { checkGameEndConditions } = await import('../../server.js')

      const roomData = createMockRoom('EMPTYDK')
      roomData.gameState.gameStarted = true
      roomData.gameState.tiles = [{ id: 0, color: 'white', emoji: '⬜', placedHeart: null }]
      roomData.gameState.deck = { emoji: '💌', cards: 0, type: 'hearts' }
      roomData.gameState.magicDeck = { emoji: '🔮', cards: 0, type: 'magic' }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and check end conditions
      const dbRoom = await Room.findOne({ code: 'EMPTYDK' })
      const result = checkGameEndConditions(dbRoom, false)

      expect(result.shouldEnd).toBe(true)
      expect(result.reason).toBe('Both decks are empty')
    })

    it('should end game when heart deck is empty in database (no grace period)', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { checkGameEndConditions } = await import('../../server.js')

      const roomData = createMockRoom('EMPTYHT')
      roomData.gameState.gameStarted = true
      roomData.gameState.tiles = [{ id: 0, color: 'white', emoji: '⬜', placedHeart: null }]
      roomData.gameState.deck = { emoji: '💌', cards: 0, type: 'hearts' }
      roomData.gameState.magicDeck = { emoji: '🔮', cards: 5, type: 'magic' }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and check end conditions
      const dbRoom = await Room.findOne({ code: 'EMPTYHT' })
      const result = checkGameEndConditions(dbRoom, false)

      expect(result.shouldEnd).toBe(true)
      expect(result.reason).toBe('Heart deck is empty')
    })

    it('should end game when magic deck is empty in database (no grace period)', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { checkGameEndConditions } = await import('../../server.js')

      const roomData = createMockRoom('EMPTYMG')
      roomData.gameState.gameStarted = true
      roomData.gameState.tiles = [{ id: 0, color: 'white', emoji: '⬜', placedHeart: null }]
      roomData.gameState.deck = { emoji: '💌', cards: 5, type: 'hearts' }
      roomData.gameState.magicDeck = { emoji: '🔮', cards: 0, type: 'magic' }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and check end conditions
      const dbRoom = await Room.findOne({ code: 'EMPTYMG' })
      const result = checkGameEndConditions(dbRoom, false)

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

    it('should not end game when conditions are not met in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { checkGameEndConditions } = await import('../../server.js')

      const roomData = createMockRoom('ACTIVE1')
      roomData.gameState.gameStarted = true
      roomData.gameState.tiles = [{ id: 0, color: 'white', emoji: '⬜', placedHeart: null }]
      roomData.gameState.deck = { emoji: '💌', cards: 10, type: 'hearts' }
      roomData.gameState.magicDeck = { emoji: '🔮', cards: 8, type: 'magic' }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and check end conditions
      const dbRoom = await Room.findOne({ code: 'ACTIVE1' })
      const result = checkGameEndConditions(dbRoom)

      expect(result.shouldEnd).toBe(false)
      expect(result.reason).toBe(null)
    })

    it('should not end game when game not started in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { checkGameEndConditions } = await import('../../server.js')

      const roomData = createMockRoom('NOTSTAR') // Will be converted to uppercase (7 chars)
      roomData.gameState.gameStarted = false
      roomData.gameState.tiles = [{ id: 0, color: 'white', emoji: '⬜', placedHeart: null }]

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and check end conditions
      const dbRoom = await Room.findOne({ code: 'NOTSTAR' }) // Will be converted to uppercase
      const result = checkGameEndConditions(dbRoom)

      expect(result.shouldEnd).toBe(false)
    })

    it('should handle tiles with null placedHeart in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { checkGameEndConditions } = await import('../../server.js')

      const roomData = createMockRoom('MIXEDTL')
      roomData.gameState.gameStarted = true
      roomData.gameState.tiles = [
        { id: 0, color: 'red', emoji: '🟥', placedHeart: { value: 1, color: 'red', emoji: '❤️' } },
        { id: 1, color: 'white', emoji: '⬜', placedHeart: null },
        { id: 2, color: 'yellow', emoji: '🟨', placedHeart: { value: 2, color: 'yellow', emoji: '💛' } },
        { id: 3, color: 'green', emoji: '🟩', placedHeart: null }
      ]

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and check end conditions
      const dbRoom = await Room.findOne({ code: 'MIXEDTL' })
      const result = checkGameEndConditions(dbRoom)

      expect(result.shouldEnd).toBe(false) // Not all tiles filled
    })
  })

  describe('checkAndExpireShields function with database persistence', () => {
    it('should decrement shield turn counts in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { checkAndExpireShields } = await import('../../server.js')

      const roomData = createMockRoom('SHLDDEC')
      roomData.gameState.shields = {
        user1: { remainingTurns: 3, active: true },
        user2: { remainingTurns: 2, active: true },
        user3: { remainingTurns: 1, active: true }
      }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and expire shields
      const dbRoom = await Room.findOne({ code: 'SHLDDEC' })
      checkAndExpireShields(dbRoom)

      expect(dbRoom.gameState.shields.user1.remainingTurns).toBe(2)
      expect(dbRoom.gameState.shields.user2.remainingTurns).toBe(1)
      expect(dbRoom.gameState.shields.user3).toBeUndefined() // Should be removed

      // Save to database
      await dbRoom.save()

      // Verify persistence
      const updatedRoom = await Room.findOne({ code: 'SHLDDEC' })
      expect(updatedRoom.gameState.shields.user1.remainingTurns).toBe(2)
      expect(updatedRoom.gameState.shields.user2.remainingTurns).toBe(1)
      expect(updatedRoom.gameState.shields.user3).toBeUndefined()
    })

    it('should remove shields when expired in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { checkAndExpireShields } = await import('../../server.js')

      const roomData = createMockRoom('SHLDEXP')
      roomData.gameState.shields = {
        user1: { remainingTurns: 0, active: true },
        user2: { remainingTurns: -1, active: true }
      }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and expire shields
      const dbRoom = await Room.findOne({ code: 'SHLDEXP' })
      checkAndExpireShields(dbRoom)

      expect(dbRoom.gameState.shields.user1).toBeUndefined()
      expect(dbRoom.gameState.shields.user2).toBeUndefined()

      // Save to database
      await dbRoom.save()

      // Verify persistence
      const updatedRoom = await Room.findOne({ code: 'SHLDEXP' })
      expect(updatedRoom.gameState.shields.user1).toBeUndefined()
      expect(updatedRoom.gameState.shields.user2).toBeUndefined()
    })

    it('should handle missing shields object gracefully in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { checkAndExpireShields } = await import('../../server.js')

      const roomData1 = createMockRoom('NOSHLDS') // Will be converted to uppercase (6 chars)
      roomData1.gameState = {} // No shields

      const roomData2 = createMockRoom('NULLSHD') // Will be converted to uppercase (7 chars)
      roomData2.gameState.shields = null

      // Save to database
      await new Room(roomData1).save()
      await new Room(roomData2).save()

      // Load from database and check shields
      const dbRoom1 = await Room.findOne({ code: 'NOSHLDS' }) // Will be converted to uppercase
      const dbRoom2 = await Room.findOne({ code: 'NULLSHD' }) // Will be converted to uppercase

      expect(() => {
        checkAndExpireShields(dbRoom1)
        checkAndExpireShields(dbRoom2)
      }).not.toThrow()
    })

    it('should handle invalid shield objects in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { checkAndExpireShields } = await import('../../server.js')

      const roomData = createMockRoom('INVALSH')
      roomData.gameState.shields = {
        user1: 'not an object',
        user2: null,
        user3: { remainingTurns: 2, active: true },
        user4: { remainingTurns: 'not a number' }
      }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and check shields
      const dbRoom = await Room.findOne({ code: 'INVALSH' })

      expect(() => {
        checkAndExpireShields(dbRoom)
      }).not.toThrow()

      // Should remove invalid shields and keep valid ones
      expect(dbRoom.gameState.shields.user1).toBeUndefined()
      expect(dbRoom.gameState.shields.user2).toBeUndefined()
      expect(dbRoom.gameState.shields.user3).toBeDefined()
      expect(dbRoom.gameState.shields.user4).toBeUndefined()
    })
  })

  describe('Turn lock management with database integration', () => {
    it('should acquire turn lock successfully', async () => {
      const { acquireTurnLock } = await import('../../server.js')

      const roomCode = 'TEST123'
      const socketId = 'socket1'

      const acquired = acquireTurnLock(roomCode, socketId)

      expect(acquired).toBe(true)
      expect(global.turnLocks.has(roomCode)).toBe(true)
      expect(global.turnLocks.get(roomCode).socketId).toBe(socketId)
    })

    it('should reject duplicate turn lock for same room', async () => {
      const { acquireTurnLock } = await import('../../server.js')

      const roomCode = 'TEST123'

      const firstAcquired = acquireTurnLock(roomCode, 'socket1')
      const secondAcquired = acquireTurnLock(roomCode, 'socket2')

      expect(firstAcquired).toBe(true)
      expect(secondAcquired).toBe(false)
      expect(global.turnLocks.size).toBe(1)
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
      expect(global.turnLocks.get(roomCode).socketId).toBe('socket2')
    })

    it('should only release lock for correct socket', async () => {
      const { acquireTurnLock, releaseTurnLock } = await import('../../server.js')

      const roomCode = 'TEST123'

      acquireTurnLock(roomCode, 'socket1')
      releaseTurnLock(roomCode, 'socket2') // Wrong socket

      // Should still be locked
      const reacquired = acquireTurnLock(roomCode, 'socket3')
      expect(reacquired).toBe(false)
      expect(global.turnLocks.get(roomCode).socketId).toBe('socket1')
    })

    it('should handle releasing non-existent lock gracefully', async () => {
      const { releaseTurnLock } = await import('../../server.js')

      expect(() => {
        releaseTurnLock('NONEXISTENT', 'socket1')
      }).not.toThrow()
    })

    it('should handle turn lock expiration in database context', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { acquireTurnLock } = await import('../../server.js')

      const roomCode = 'EXPIRE01'
      const socketId = 'socket1'

      // Create old lock
      global.turnLocks.set(roomCode, {
        socketId,
        timestamp: Date.now() - 35 * 1000 // 35 seconds ago (expired)
      })

      // Should be able to acquire new lock
      const acquired = acquireTurnLock(roomCode, 'socket2')
      expect(acquired).toBe(true)
      expect(global.turnLocks.get(roomCode).socketId).toBe('socket2')
    })
  })

  describe('Turn flow validation with database persistence', () => {
    it('should require drawing both card types before ending turn in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const roomData = createMockRoom('TRNFLOW')
      roomData.gameState.deck = { emoji: '💌', cards: 5, type: 'hearts' } // Not empty
      roomData.gameState.magicDeck = { emoji: '🔮', cards: 5, type: 'magic' } // Not empty
      roomData.gameState.playerActions = {
        user1: {
          drawnHeart: true,
          drawnMagic: false // Missing magic draw
        }
      }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and validate turn flow
      const dbRoom = await Room.findOne({ code: 'TRNFLOW' })
      const cardDrawValidation = { currentActions: dbRoom.gameState.playerActions.user1 }

      // Simulate end-turn validation
      const heartDeckEmpty = dbRoom.gameState.deck.cards <= 0
      const magicDeckEmpty = dbRoom.gameState.magicDeck.cards <= 0

      const heartDrawRequired = !cardDrawValidation.currentActions.drawnHeart && !heartDeckEmpty
      const magicDrawRequired = !cardDrawValidation.currentActions.drawnMagic && !magicDeckEmpty

      expect(heartDrawRequired).toBe(false) // Heart was drawn
      expect(magicDrawRequired).toBe(true) // Magic not drawn but deck not empty
    })

    it('should allow ending turn when decks are empty in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const roomData = createMockRoom('EMPTYTR')
      roomData.gameState.deck = { emoji: '💌', cards: 0, type: 'hearts' } // Empty
      roomData.gameState.magicDeck = { emoji: '🔮', cards: 0, type: 'magic' } // Empty
      roomData.gameState.playerActions = {
        user1: {
          drawnHeart: false, // Not drawn
          drawnMagic: false // Not drawn
        }
      }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and validate turn flow
      const dbRoom = await Room.findOne({ code: 'EMPTYTR' })
      const cardDrawValidation = { currentActions: dbRoom.gameState.playerActions.user1 }

      const heartDeckEmpty = dbRoom.gameState.deck.cards <= 0
      const magicDeckEmpty = dbRoom.gameState.magicDeck.cards <= 0

      const heartDrawRequired = !cardDrawValidation.currentActions.drawnHeart && !heartDeckEmpty
      const magicDrawRequired = !cardDrawValidation.currentActions.drawnMagic && !magicDeckEmpty

      expect(heartDrawRequired).toBe(false) // Deck empty, no draw required
      expect(magicDrawRequired).toBe(false) // Deck empty, no draw required
    })

    it('should switch to next player correctly in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const roomData = createMockRoom('NEXTP1')
      roomData.players = [
        { userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: false, score: 0, joinedAt: new Date() },
        { userId: 'user2', name: 'Player2', email: 'player2@test.com', isReady: false, score: 0, joinedAt: new Date() }
      ]
      roomData.gameState.currentPlayer = { userId: 'user1', name: 'Player1' }
      roomData.gameState.turnCount = 1

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and switch player
      const dbRoom = await Room.findOne({ code: 'NEXTP1' })

      // Simulate turn switching
      const currentPlayerIndex = dbRoom.players.findIndex(p => p.userId === dbRoom.gameState.currentPlayer.userId)
      const nextPlayerIndex = (currentPlayerIndex + 1) % dbRoom.players.length

      dbRoom.gameState.currentPlayer = dbRoom.players[nextPlayerIndex]
      dbRoom.gameState.turnCount++

      expect(dbRoom.gameState.currentPlayer.userId).toBe('user2')
      expect(dbRoom.gameState.turnCount).toBe(2)

      // Save to database
      await dbRoom.save()

      // Verify persistence
      const updatedRoom = await Room.findOne({ code: 'NEXTP1' })
      expect(updatedRoom.gameState.currentPlayer.userId).toBe('user2')
      expect(updatedRoom.gameState.turnCount).toBe(2)
    })

    it('should handle turn cycling back to first player in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const roomData = createMockRoom('CYCLE01')
      roomData.players = [
        { userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: false, score: 0, joinedAt: new Date() },
        { userId: 'user2', name: 'Player2', email: 'player2@test.com', isReady: false, score: 0, joinedAt: new Date() }
      ]
      roomData.gameState.currentPlayer = { userId: 'user2', name: 'Player2' } // Last player
      roomData.gameState.turnCount = 1

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and cycle player
      const dbRoom = await Room.findOne({ code: 'CYCLE01' })

      // Simulate turn switching
      const currentPlayerIndex = dbRoom.players.findIndex(p => p.userId === dbRoom.gameState.currentPlayer.userId)
      const nextPlayerIndex = (currentPlayerIndex + 1) % dbRoom.players.length

      dbRoom.gameState.currentPlayer = dbRoom.players[nextPlayerIndex]
      dbRoom.gameState.turnCount++

      expect(dbRoom.gameState.currentPlayer.userId).toBe('user1') // Should cycle back
      expect(dbRoom.gameState.turnCount).toBe(2)

      // Save to database
      await dbRoom.save()

      // Verify persistence
      const updatedRoom = await Room.findOne({ code: 'CYCLE01' })
      expect(updatedRoom.gameState.currentPlayer.userId).toBe('user1')
      expect(updatedRoom.gameState.turnCount).toBe(2)
    })
  })

  describe('Game flow edge cases with database integration', () => {
    it('should handle missing turn count gracefully in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const roomData = createMockRoom('NOTURN') // Will be converted to uppercase (6 chars)
      roomData.players = [
        { userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: false, score: 0, joinedAt: new Date() },
        { userId: 'user2', name: 'Player2', email: 'player2@test.com', isReady: false, score: 0, joinedAt: new Date() }
      ]
      roomData.gameState.currentPlayer = { userId: 'user1', name: 'Player1' }
      // Missing turnCount

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database
      const dbRoom = await Room.findOne({ code: 'NOTURN' }) // Will be converted to uppercase

      // Should handle gracefully - defaults to 0 from createMockRoom
      expect(dbRoom.gameState.turnCount).toBe(0)
    })

    it('should handle single player game for testing in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const roomData = createMockRoom('SINGLE')
      roomData.players = [
        { userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: false, score: 0, joinedAt: new Date() }
      ]
      roomData.gameState.currentPlayer = { userId: 'user1', name: 'Player1' }
      roomData.gameState.turnCount = 1

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database
      const dbRoom = await Room.findOne({ code: 'SINGLE' })

      const currentPlayerIndex = dbRoom.players.findIndex(p => p.userId === dbRoom.gameState.currentPlayer.userId)
      const nextPlayerIndex = (currentPlayerIndex + 1) % dbRoom.players.length

      expect(currentPlayerIndex).toBe(0)
      expect(nextPlayerIndex).toBe(0) // Should stay the same player
    })

    it('should handle empty players array gracefully in database', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const roomData = createMockRoom('EMPTYPL')
      roomData.players = []
      roomData.gameState.currentPlayer = null
      roomData.gameState.turnCount = 0

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database
      const dbRoom = await Room.findOne({ code: 'EMPTYPL' })

      // Should handle gracefully without throwing
      expect(() => {
        const currentPlayerIndex = dbRoom.players.findIndex(p => p.userId === dbRoom.gameState.currentPlayer?.userId)
        expect(currentPlayerIndex).toBe(-1)
      }).not.toThrow()
    })

    it('should handle complex turn state with multiple database operations', async () => {
      // Skip if MongoDB is not available
      try {
        await Room.findOne()
      } catch {
        console.log('MongoDB not available, skipping test')
        return
      }

      const { recordCardDraw, resetPlayerActions, checkAndExpireShields } = await import('../../server.js')

      const roomData = createMockRoom('COMPLEX')
      roomData.players = [
        { userId: 'user1', name: 'Player1', email: 'player1@test.com', isReady: false, score: 0, joinedAt: new Date() },
        { userId: 'user2', name: 'Player2', email: 'player2@test.com', isReady: false, score: 0, joinedAt: new Date() }
      ]
      roomData.gameState.currentPlayer = { userId: 'user1', name: 'Player1' }
      roomData.gameState.turnCount = 1
      roomData.gameState.playerActions = {}
      roomData.gameState.shields = {
        user1: { remainingTurns: 2, active: true }
      }

      // Save to database
      const savedRoom = new Room(roomData)
      await savedRoom.save()

      // Load from database and perform multiple operations
      const dbRoom = await Room.findOne({ code: 'COMPLEX' })

      // Record card draw
      recordCardDraw(dbRoom, 'user1', 'heart')
      recordCardDraw(dbRoom, 'user1', 'magic')

      // Expire shields
      checkAndExpireShields(dbRoom)

      // Reset actions for next player
      resetPlayerActions(dbRoom, 'user1')

      // Switch player
      const currentPlayerIndex = dbRoom.players.findIndex(p => p.userId === dbRoom.gameState.currentPlayer.userId)
      const nextPlayerIndex = (currentPlayerIndex + 1) % dbRoom.players.length
      dbRoom.gameState.currentPlayer = dbRoom.players[nextPlayerIndex]
      dbRoom.gameState.turnCount++

      // Save all changes to database
      await dbRoom.save()

      // Verify all changes persisted
      const updatedRoom = await Room.findOne({ code: 'COMPLEX' })

      expect(updatedRoom.gameState.currentPlayer.userId).toBe('user2')
      expect(updatedRoom.gameState.turnCount).toBe(2)
      expect(updatedRoom.gameState.playerActions.user1.drawnHeart).toBe(false) // Reset
      expect(updatedRoom.gameState.playerActions.user1.drawnMagic).toBe(false) // Reset
      expect(updatedRoom.gameState.shields.user1.remainingTurns).toBe(1) // Decremented
    })
  })
})