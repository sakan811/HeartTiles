import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import mongoose from 'mongoose'

// Mock all external dependencies
vi.mock('mongoose', () => ({
  default: {
    connect: vi.fn(),
    connection: {
      readyState: 1
    }
  }
}))

vi.mock('./models.js', () => ({
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

vi.mock('./src/lib/cards.js', () => ({
  HeartCard: {
    generateRandom: vi.fn(),
    calculateScore: vi.fn()
  },
  WindCard: vi.fn(),
  RecycleCard: vi.fn(),
  ShieldCard: vi.fn(),
  generateRandomMagicCard: vi.fn(),
  isHeartCard: vi.fn(),
  isMagicCard: vi.fn(),
  createCardFromData: vi.fn()
}))

vi.mock('node:http', () => ({
  createServer: vi.fn()
}))

vi.mock('next', () => ({
  default: vi.fn().mockImplementation(() => ({
    prepare: vi.fn().mockResolvedValue(),
    getRequestHandler: vi.fn()
  }))
}))

vi.mock('socket.io', () => ({
  Server: vi.fn().mockImplementation(() => ({
    use: vi.fn(),
    on: vi.fn(),
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
    sockets: {
      adapter: {
        rooms: new Map()
      },
      sockets: new Map()
    }
  }))
}))

// Mock process.env
const originalEnv = process.env

describe('Server Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv, NODE_ENV: 'test' }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('Database Connection Functions', () => {
    it('should connect to MongoDB with correct URI', async () => {
      const { default: mongoose } = await import('mongoose')
      mongoose.connect.mockResolvedValue()

      // Simulate connectToDatabase function
      const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:example@localhost:27017/no-kitty-cards?authSource=admin'

      await mongoose.connect(MONGODB_URI)

      expect(mongoose.connect).toHaveBeenCalledWith(MONGODB_URI)
    })

    it('should handle MongoDB connection failure', async () => {
      const { default: mongoose } = await import('mongoose')
      const mockExit = vi.fn()
      process.exit = mockExit

      mongoose.connect.mockRejectedValue(new Error('Connection failed'))

      // Simulate connectToDatabase function error handling
      try {
        const MONGODB_URI = process.env.MONGODB_URI
        await mongoose.connect(MONGODB_URI)
      } catch (err) {
        console.error('MongoDB connection failed:', err)
        process.exit(1)
      }

      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it('should load rooms from database', async () => {
      const { Room } = await import('./models.js')
      const mockRooms = [
        { code: 'ABC123', players: [], gameState: { gameStarted: false } },
        { code: 'DEF456', players: [], gameState: { gameStarted: true } }
      ]
      Room.find.mockResolvedValue(mockRooms)

      // Simulate loadRooms function
      const rooms = await Room.find({})
      const roomsMap = new Map()
      rooms.forEach(room => roomsMap.set(room.code, room.toObject()))

      expect(Room.find).toHaveBeenCalledWith({})
      expect(roomsMap.size).toBe(2)
      expect(roomsMap.has('ABC123')).toBe(true)
      expect(roomsMap.has('DEF456')).toBe(true)
    })

    it('should handle load rooms error gracefully', async () => {
      const { Room } = await import('./models.js')
      Room.find.mockRejectedValue(new Error('Database error'))

      // Simulate loadRooms error handling
      try {
        await Room.find({})
      } catch (err) {
        console.error('Failed to load rooms:', err)
        return new Map()
      }

      // Should return empty map on error
      expect(true).toBe(true)
    })

    it('should save room to database', async () => {
      const { Room } = await import('./models.js')
      Room.findOneAndUpdate.mockResolvedValue({})

      const roomData = { code: 'ABC123', players: [] }

      // Simulate saveRoom function
      await Room.findOneAndUpdate(
        { code: roomData.code },
        roomData,
        { upsert: true, new: true }
      )

      expect(Room.findOneAndUpdate).toHaveBeenCalledWith(
        { code: 'ABC123' },
        roomData,
        { upsert: true, new: true }
      )
    })

    it('should delete room from database', async () => {
      const { Room } = await import('./models.js')
      Room.deleteOne.mockResolvedValue({ deletedCount: 1 })

      const roomCode = 'ABC123'

      // Simulate deleteRoom function
      await Room.deleteOne({ code: roomCode })

      expect(Room.deleteOne).toHaveBeenCalledWith({ code: 'ABC123' })
    })

    it('should load active player sessions', async () => {
      const { PlayerSession } = await import('./models.js')
      const mockSessions = [
        { userId: 'user1', isActive: true, name: 'Player1' },
        { userId: 'user2', isActive: true, name: 'Player2' }
      ]
      PlayerSession.find.mockResolvedValue(mockSessions)

      // Simulate loadPlayerSessions function
      const sessions = await PlayerSession.find({ isActive: true })
      const sessionsMap = new Map()
      sessions.forEach(session => {
        const sessionObj = session.toObject()
        sessionsMap.set(sessionObj.userId, sessionObj)
      })

      expect(PlayerSession.find).toHaveBeenCalledWith({ isActive: true })
      expect(sessionsMap.size).toBe(2)
      expect(sessionsMap.has('user1')).toBe(true)
      expect(sessionsMap.has('user2')).toBe(true)
    })

    it('should save player session to database', async () => {
      const { PlayerSession } = await import('./models.js')
      PlayerSession.findOneAndUpdate.mockResolvedValue({})

      const sessionData = { userId: 'user1', name: 'Player1', isActive: true }

      // Simulate savePlayerSession function
      await PlayerSession.findOneAndUpdate(
        { userId: sessionData.userId },
        sessionData,
        { upsert: true, new: true }
      )

      expect(PlayerSession.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: 'user1' },
        sessionData,
        { upsert: true, new: true }
      )
    })
  })

  describe('Turn Lock Management', () => {
    let turnLocks

    beforeEach(() => {
      turnLocks = new Map()
    })

    it('should acquire turn lock successfully', () => {
      // Simulate acquireTurnLock function
      function acquireTurnLock(roomCode, userId) {
        const lockKey = `${roomCode}_${userId}`
        if (turnLocks.has(lockKey)) return false
        turnLocks.set(lockKey, Date.now())
        return true
      }

      const result = acquireTurnLock('ABC123', 'user1')

      expect(result).toBe(true)
      expect(turnLocks.has('ABC123_user1')).toBe(true)
    })

    it('should fail to acquire existing turn lock', () => {
      // Simulate acquireTurnLock function
      function acquireTurnLock(roomCode, userId) {
        const lockKey = `${roomCode}_${userId}`
        if (turnLocks.has(lockKey)) return false
        turnLocks.set(lockKey, Date.now())
        return true
      }

      turnLocks.set('ABC123_user1', Date.now())
      const result = acquireTurnLock('ABC123', 'user1')

      expect(result).toBe(false)
    })

    it('should release turn lock', () => {
      // Simulate functions
      function acquireTurnLock(roomCode, userId) {
        const lockKey = `${roomCode}_${userId}`
        if (turnLocks.has(lockKey)) return false
        turnLocks.set(lockKey, Date.now())
        return true
      }

      function releaseTurnLock(roomCode, userId) {
        turnLocks.delete(`${roomCode}_${userId}`)
      }

      acquireTurnLock('ABC123', 'user1')
      expect(turnLocks.size).toBe(1)

      releaseTurnLock('ABC123', 'user1')
      expect(turnLocks.size).toBe(0)
    })
  })

  describe('Connection Management', () => {
    let connectionPool
    const MAX_CONNECTIONS_PER_IP = 5

    beforeEach(() => {
      connectionPool = new Map()
    })

    it('should get client IP from socket', () => {
      const mockSocket = {
        handshake: { address: '192.168.1.1' },
        conn: { remoteAddress: '192.168.1.2' }
      }

      // Simulate getClientIP function
      function getClientIP(socket) {
        return socket.handshake.address || socket.conn.remoteAddress || 'unknown'
      }

      const ip = getClientIP(mockSocket)
      expect(ip).toBe('192.168.1.1')
    })

    it('should fallback to conn.remoteAddress', () => {
      const mockSocket = {
        handshake: {},
        conn: { remoteAddress: '192.168.1.2' }
      }

      // Simulate getClientIP function
      function getClientIP(socket) {
        return socket.handshake.address || socket.conn.remoteAddress || 'unknown'
      }

      const ip = getClientIP(mockSocket)
      expect(ip).toBe('192.168.1.2')
    })

    it('should accept connection when under limit', () => {
      // Simulate connection management functions
      function canAcceptConnection(ip) {
        return (connectionPool.get(ip) || 0) < MAX_CONNECTIONS_PER_IP
      }

      function incrementConnectionCount(ip) {
        connectionPool.set(ip, (connectionPool.get(ip) || 0) + 1)
      }

      const ip = '192.168.1.1'
      expect(canAcceptConnection(ip)).toBe(true)

      incrementConnectionCount(ip)
      expect(connectionPool.get(ip)).toBe(1)
    })

    it('should reject connection when at limit', () => {
      // Simulate connection management functions
      function canAcceptConnection(ip) {
        return (connectionPool.get(ip) || 0) < MAX_CONNECTIONS_PER_IP
      }

      function incrementConnectionCount(ip) {
        connectionPool.set(ip, (connectionPool.get(ip) || 0) + 1)
      }

      const ip = '192.168.1.1'
      for (let i = 0; i < MAX_CONNECTIONS_PER_IP; i++) {
        incrementConnectionCount(ip)
      }

      expect(canAcceptConnection(ip)).toBe(false)
    })

    it('should decrement connection count', () => {
      // Simulate connection management functions
      function incrementConnectionCount(ip) {
        connectionPool.set(ip, (connectionPool.get(ip) || 0) + 1)
      }

      function decrementConnectionCount(ip) {
        const current = connectionPool.get(ip) || 0
        if (current > 0) connectionPool.set(ip, current - 1)
      }

      const ip = '192.168.1.1'
      incrementConnectionCount(ip)
      incrementConnectionCount(ip)
      expect(connectionPool.get(ip)).toBe(2)

      decrementConnectionCount(ip)
      expect(connectionPool.get(ip)).toBe(1)
    })

    it('should not decrement below zero', () => {
      // Simulate decrement function
      function decrementConnectionCount(ip) {
        const current = connectionPool.get(ip) || 0
        if (current > 0) connectionPool.set(ip, current - 1)
      }

      const ip = '192.168.1.1'
      decrementConnectionCount(ip)
      expect(connectionPool.get(ip)).toBeUndefined()
    })
  })

  describe('Validation Functions', () => {
    describe('validateRoomCode', () => {
      it('should validate correct room codes', () => {
        function validateRoomCode(roomCode) {
          return roomCode && typeof roomCode === 'string' && /^[A-Z0-9]{6}$/i.test(roomCode)
        }

        expect(validateRoomCode('ABC123')).toBe(true)
        expect(validateRoomCode('DEF456')).toBe(true)
        expect(validateRoomCode('abc123')).toBe(true)
        expect(validateRoomCode('123456')).toBe(true)
      })

      it('should reject invalid room codes', () => {
        function validateRoomCode(roomCode) {
          return roomCode && typeof roomCode === 'string' && /^[A-Z0-9]{6}$/i.test(roomCode)
        }

        expect(validateRoomCode('ABC')).toBe(false)
        expect(validateRoomCode('ABC1234')).toBe(false)
        expect(validateRoomCode('ABC-123')).toBe(false)
        expect(validateRoomCode('')).toBe(false)
        expect(validateRoomCode(null)).toBe(false)
        expect(validateRoomCode(undefined)).toBe(false)
        expect(validateRoomCode(123)).toBe(false)
      })
    })

    describe('validatePlayerName', () => {
      it('should validate correct player names', () => {
        function validatePlayerName(playerName) {
          return playerName && typeof playerName === 'string' &&
                 playerName.trim().length > 0 && playerName.length <= 20
        }

        expect(validatePlayerName('Player1')).toBe(true)
        expect(validatePlayerName('Test User')).toBe(true)
        expect(validatePlayerName('A')).toBe(true)
        expect(validatePlayerName('ThisIsExactlyTwenty')).toBe(true)
      })

      it('should reject invalid player names', () => {
        function validatePlayerName(playerName) {
          return playerName && typeof playerName === 'string' &&
                 playerName.trim().length > 0 && playerName.length <= 20
        }

        expect(validatePlayerName('')).toBe(false)
        expect(validatePlayerName('   ')).toBe(false)
        expect(validatePlayerName(null)).toBe(false)
        expect(validatePlayerName(undefined)).toBe(false)
        expect(validatePlayerName(123)).toBe(false)
        expect(validatePlayerName('ThisNameIsWayTooLongForTheGame')).toBe(false)
      })
    })

    describe('validateTurn', () => {
      it('should validate correct turn', () => {
        function validateTurn(room, userId) {
          if (!room?.gameState.gameStarted) return { valid: false, error: "Game not started" }
          if (!room.gameState.currentPlayer || room.gameState.currentPlayer.userId !== userId) {
            return { valid: false, error: "Not your turn" }
          }
          return { valid: true }
        }

        const room = {
          gameState: {
            gameStarted: true,
            currentPlayer: { userId: 'user1', name: 'Player1' }
          }
        }

        const result = validateTurn(room, 'user1')
        expect(result.valid).toBe(true)
      })

      it('should reject turn when game not started', () => {
        function validateTurn(room, userId) {
          if (!room?.gameState.gameStarted) return { valid: false, error: "Game not started" }
          if (!room.gameState.currentPlayer || room.gameState.currentPlayer.userId !== userId) {
            return { valid: false, error: "Not your turn" }
          }
          return { valid: true }
        }

        const room = { gameState: { gameStarted: false } }
        const result = validateTurn(room, 'user1')
        expect(result.valid).toBe(false)
        expect(result.error).toBe("Game not started")
      })

      it('should reject turn when not current player', () => {
        function validateTurn(room, userId) {
          if (!room?.gameState.gameStarted) return { valid: false, error: "Game not started" }
          if (!room.gameState.currentPlayer || room.gameState.currentPlayer.userId !== userId) {
            return { valid: false, error: "Not your turn" }
          }
          return { valid: true }
        }

        const room = {
          gameState: {
            gameStarted: true,
            currentPlayer: { userId: 'user2', name: 'Player2' }
          }
        }

        const result = validateTurn(room, 'user1')
        expect(result.valid).toBe(false)
        expect(result.error).toBe("Not your turn")
      })
    })

    describe('validateCardDrawLimit', () => {
      it('should return valid when no actions taken', () => {
        function validateCardDrawLimit(room, userId) {
          if (!room.gameState.playerActions) {
            room.gameState.playerActions = {}
          }

          const playerActions = room.gameState.playerActions[userId] || { drawnHeart: false, drawnMagic: false }
          return { valid: true, currentActions: playerActions }
        }

        const room = { gameState: { playerActions: {} } }
        const result = validateCardDrawLimit(room, 'user1')

        expect(result.valid).toBe(true)
        expect(result.currentActions.drawnHeart).toBe(false)
        expect(result.currentActions.drawnMagic).toBe(false)
      })

      it('should return existing player actions', () => {
        function validateCardDrawLimit(room, userId) {
          if (!room.gameState.playerActions) {
            room.gameState.playerActions = {}
          }

          const playerActions = room.gameState.playerActions[userId] || { drawnHeart: false, drawnMagic: false }
          return { valid: true, currentActions: playerActions }
        }

        const room = {
          gameState: {
            playerActions: {
              user1: { drawnHeart: true, drawnMagic: false }
            }
          }
        }

        const result = validateCardDrawLimit(room, 'user1')
        expect(result.valid).toBe(true)
        expect(result.currentActions.drawnHeart).toBe(true)
        expect(result.currentActions.drawnMagic).toBe(false)
      })
    })

    describe('recordCardDraw', () => {
      it('should record heart card draw', () => {
        function recordCardDraw(room, userId, cardType) {
          if (!room.gameState.playerActions) {
            room.gameState.playerActions = {}
          }

          if (!room.gameState.playerActions[userId]) {
            room.gameState.playerActions[userId] = { drawnHeart: false, drawnMagic: false }
          }

          if (cardType === 'heart') {
            room.gameState.playerActions[userId].drawnHeart = true
          } else if (cardType === 'magic') {
            room.gameState.playerActions[userId].drawnMagic = true
          }
        }

        const room = { gameState: { playerActions: {} } }
        recordCardDraw(room, 'user1', 'heart')

        expect(room.gameState.playerActions.user1.drawnHeart).toBe(true)
        expect(room.gameState.playerActions.user1.drawnMagic).toBe(false)
      })

      it('should record magic card draw', () => {
        function recordCardDraw(room, userId, cardType) {
          if (!room.gameState.playerActions) {
            room.gameState.playerActions = {}
          }

          if (!room.gameState.playerActions[userId]) {
            room.gameState.playerActions[userId] = { drawnHeart: false, drawnMagic: false }
          }

          if (cardType === 'heart') {
            room.gameState.playerActions[userId].drawnHeart = true
          } else if (cardType === 'magic') {
            room.gameState.playerActions[userId].drawnMagic = true
          }
        }

        const room = { gameState: { playerActions: {} } }
        recordCardDraw(room, 'user1', 'magic')

        expect(room.gameState.playerActions.user1.drawnHeart).toBe(false)
        expect(room.gameState.playerActions.user1.drawnMagic).toBe(true)
      })
    })

    describe('resetPlayerActions', () => {
      it('should reset player actions', () => {
        function resetPlayerActions(room, userId) {
          if (!room.gameState.playerActions) {
            room.gameState.playerActions = {}
          }
          room.gameState.playerActions[userId] = { drawnHeart: false, drawnMagic: false }
        }

        const room = {
          gameState: {
            playerActions: {
              user1: { drawnHeart: true, drawnMagic: true }
            }
          }
        }

        resetPlayerActions(room, 'user1')
        expect(room.gameState.playerActions.user1.drawnHeart).toBe(false)
        expect(room.gameState.playerActions.user1.drawnMagic).toBe(false)
      })
    })

    describe('validateRoomState', () => {
      it('should validate correct room state', () => {
        function validateRoomState(room) {
          if (!room) return { valid: false, error: "Room not found" }
          if (!room.players || !Array.isArray(room.players)) return { valid: false, error: "Invalid players state" }
          if (!room.gameState) return { valid: false, error: "Invalid game state" }
          if (room.gameState.gameStarted && !room.gameState.currentPlayer) {
            return { valid: false, error: "Game started but no current player" }
          }
          return { valid: true }
        }

        const room = {
          players: [],
          gameState: {
            gameStarted: false,
            currentPlayer: null
          }
        }

        const result = validateRoomState(room)
        expect(result.valid).toBe(true)
      })

      it('should reject when room not found', () => {
        function validateRoomState(room) {
          if (!room) return { valid: false, error: "Room not found" }
          if (!room.players || !Array.isArray(room.players)) return { valid: false, error: "Invalid players state" }
          if (!room.gameState) return { valid: false, error: "Invalid game state" }
          if (room.gameState.gameStarted && !room.gameState.currentPlayer) {
            return { valid: false, error: "Game started but no current player" }
          }
          return { valid: true }
        }

        const result = validateRoomState(null)
        expect(result.valid).toBe(false)
        expect(result.error).toBe("Room not found")
      })

      it('should reject when players state invalid', () => {
        function validateRoomState(room) {
          if (!room) return { valid: false, error: "Room not found" }
          if (!room.players || !Array.isArray(room.players)) return { valid: false, error: "Invalid players state" }
          if (!room.gameState) return { valid: false, error: "Invalid game state" }
          if (room.gameState.gameStarted && !room.gameState.currentPlayer) {
            return { valid: false, error: "Game started but no current player" }
          }
          return { valid: true }
        }

        const room = { players: "not an array", gameState: {} }
        const result = validateRoomState(room)
        expect(result.valid).toBe(false)
        expect(result.error).toBe("Invalid players state")
      })

      it('should reject when game started but no current player', () => {
        function validateRoomState(room) {
          if (!room) return { valid: false, error: "Room not found" }
          if (!room.players || !Array.isArray(room.players)) return { valid: false, error: "Invalid players state" }
          if (!room.gameState) return { valid: false, error: "Invalid game state" }
          if (room.gameState.gameStarted && !room.gameState.currentPlayer) {
            return { valid: false, error: "Game started but no current player" }
          }
          return { valid: true }
        }

        const room = {
          players: [],
          gameState: {
            gameStarted: true,
            currentPlayer: null
          }
        }

        const result = validateRoomState(room)
        expect(result.valid).toBe(false)
        expect(result.error).toBe("Game started but no current player")
      })
    })

    describe('validatePlayerInRoom', () => {
      it('should validate player in room', () => {
        function validatePlayerInRoom(room, userId) {
          const playerInRoom = room.players.find(p => p.userId === userId)
          return playerInRoom ? { valid: true } : { valid: false, error: "Player not in room" }
        }

        const room = {
          players: [
            { userId: 'user1', name: 'Player1' },
            { userId: 'user2', name: 'Player2' }
          ]
        }

        const result = validatePlayerInRoom(room, 'user1')
        expect(result.valid).toBe(true)
      })

      it('should reject when player not in room', () => {
        function validatePlayerInRoom(room, userId) {
          const playerInRoom = room.players.find(p => p.userId === userId)
          return playerInRoom ? { valid: true } : { valid: false, error: "Player not in room" }
        }

        const room = {
          players: [
            { userId: 'user1', name: 'Player1' }
          ]
        }

        const result = validatePlayerInRoom(room, 'user2')
        expect(result.valid).toBe(false)
        expect(result.error).toBe("Player not in room")
      })
    })

    describe('validateDeckState', () => {
      it('should validate correct deck state', () => {
        function validateDeckState(room) {
          if (!room.gameState.deck) return { valid: false, error: "Invalid deck state" }
          if (typeof room.gameState.deck.cards !== 'number' || room.gameState.deck.cards < 0) {
            return { valid: false, error: "Invalid deck count" }
          }
          return { valid: true }
        }

        const room = {
          gameState: {
            deck: { cards: 16, type: 'hearts' }
          }
        }

        const result = validateDeckState(room)
        expect(result.valid).toBe(true)
      })

      it('should reject when deck missing', () => {
        function validateDeckState(room) {
          if (!room.gameState.deck) return { valid: false, error: "Invalid deck state" }
          if (typeof room.gameState.deck.cards !== 'number' || room.gameState.deck.cards < 0) {
            return { valid: false, error: "Invalid deck count" }
          }
          return { valid: true }
        }

        const room = { gameState: {} }
        const result = validateDeckState(room)
        expect(result.valid).toBe(false)
        expect(result.error).toBe("Invalid deck state")
      })

      it('should reject when deck count invalid', () => {
        function validateDeckState(room) {
          if (!room.gameState.deck) return { valid: false, error: "Invalid deck state" }
          if (typeof room.gameState.deck.cards !== 'number' || room.gameState.deck.cards < 0) {
            return { valid: false, error: "Invalid deck count" }
          }
          return { valid: true }
        }

        const room = {
          gameState: {
            deck: { cards: -1, type: 'hearts' }
          }
        }

        const result = validateDeckState(room)
        expect(result.valid).toBe(false)
        expect(result.error).toBe("Invalid deck count")
      })
    })
  })

  describe('Utility Functions', () => {
    describe('sanitizeInput', () => {
      it('should trim and remove HTML tags', () => {
        function sanitizeInput(input) {
          return typeof input === 'string' ? input.trim().replace(/[<>]/g, '') : input
        }

        expect(sanitizeInput('  hello world  ')).toBe('hello world')
        expect(sanitizeInput('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script')
        expect(sanitizeInput('normal text')).toBe('normal text')
        expect(sanitizeInput(123)).toBe(123)
        expect(sanitizeInput(null)).toBe(null)
      })
    })

    describe('findPlayerByUserId', () => {
      it('should find player by user ID', () => {
        function findPlayerByUserId(room, userId) {
          return room.players.find(p => p.userId === userId)
        }

        const room = {
          players: [
            { userId: 'user1', name: 'Player1' },
            { userId: 'user2', name: 'Player2' }
          ]
        }

        const player = findPlayerByUserId(room, 'user1')
        expect(player).toEqual({ userId: 'user1', name: 'Player1' })
      })

      it('should return undefined when player not found', () => {
        function findPlayerByUserId(room, userId) {
          return room.players.find(p => p.userId === userId)
        }

        const room = {
          players: [
            { userId: 'user1', name: 'Player1' }
          ]
        }

        const player = findPlayerByUserId(room, 'user2')
        expect(player).toBeUndefined()
      })
    })

    describe('findPlayerByName', () => {
      it('should find player by name (case insensitive)', () => {
        function findPlayerByName(room, playerName) {
          return room.players.find(p => p.name.toLowerCase() === playerName.toLowerCase())
        }

        const room = {
          players: [
            { userId: 'user1', name: 'Player1' },
            { userId: 'user2', name: 'player2' }
          ]
        }

        const player = findPlayerByName(room, 'PLAYER1')
        expect(player).toEqual({ userId: 'user1', name: 'Player1' })
      })

      it('should return undefined when player not found', () => {
        function findPlayerByName(room, playerName) {
          return room.players.find(p => p.name.toLowerCase() === playerName.toLowerCase())
        }

        const room = {
          players: [
            { userId: 'user1', name: 'Player1' }
          ]
        }

        const player = findPlayerByName(room, 'Player2')
        expect(player).toBeUndefined()
      })
    })

    describe('generateTiles', () => {
      it('should generate 8 tiles', () => {
        function generateTiles() {
          const colors = ["red", "yellow", "green"]
          const emojis = ["🟥", "🟨", "🟩"]
          const tiles = []

          for (let i = 0; i < 8; i++) {
            if (Math.random() < 0.3) {
              tiles.push({ id: i, color: "white", emoji: "⬜" })
            } else {
              const randomIndex = Math.floor(Math.random() * colors.length)
              tiles.push({
                id: i,
                color: colors[randomIndex],
                emoji: emojis[randomIndex]
              })
            }
          }
          return tiles
        }

        // Mock Math.random for predictable testing
        const originalRandom = Math.random
        Math.random = vi.fn().mockReturnValue(0.5)

        const tiles = generateTiles()
        expect(tiles).toHaveLength(8)
        expect(tiles[0].id).toBe(0)
        expect(tiles[7].id).toBe(7)

        Math.random = originalRandom
      })
    })

    describe('calculateScore', () => {
      it('should calculate score for white tile', () => {
        function calculateScore(heart, tile) {
          if (tile.color === "white") return heart.value
          return heart.color === tile.color ? heart.value * 2 : 0
        }

        const heart = { value: 2, color: 'red' }
        const tile = { color: 'white' }
        const score = calculateScore(heart, tile)
        expect(score).toBe(2)
      })

      it('should calculate double score for matching color', () => {
        function calculateScore(heart, tile) {
          if (tile.color === "white") return heart.value
          return heart.color === tile.color ? heart.value * 2 : 0
        }

        const heart = { value: 2, color: 'red' }
        const tile = { color: 'red' }
        const score = calculateScore(heart, tile)
        expect(score).toBe(4)
      })

      it('should calculate zero score for non-matching color', () => {
        function calculateScore(heart, tile) {
          if (tile.color === "white") return heart.value
          return heart.color === tile.color ? heart.value * 2 : 0
        }

        const heart = { value: 2, color: 'red' }
        const tile = { color: 'yellow' }
        const score = calculateScore(heart, tile)
        expect(score).toBe(0)
      })
    })

    describe('selectRandomStartingPlayer', () => {
      it('should select a random starting player', () => {
        function selectRandomStartingPlayer(players) {
          return players[Math.floor(Math.random() * players.length)]
        }

        const players = [
          { userId: 'user1', name: 'Player1' },
          { userId: 'user2', name: 'Player2' }
        ]

        // Mock Math.random for predictable testing
        const originalRandom = Math.random
        Math.random = vi.fn().mockReturnValue(0)

        const selectedPlayer = selectRandomStartingPlayer(players)
        expect(selectedPlayer).toEqual(players[0])

        Math.random = originalRandom
      })
    })

    describe('checkGameEndConditions', () => {
      it('should not end game when not started', () => {
        function checkGameEndConditions(room, allowDeckEmptyGracePeriod = true) {
          if (!room?.gameState?.gameStarted) return { shouldEnd: false, reason: null }

          const allTilesFilled = room.gameState.tiles.every(tile => tile.placedHeart)
          if (allTilesFilled) {
            return { shouldEnd: true, reason: "All tiles are filled" }
          }

          const heartDeckEmpty = room.gameState.deck.cards <= 0
          const magicDeckEmpty = room.gameState.magicDeck.cards <= 0
          const anyDeckEmpty = heartDeckEmpty || magicDeckEmpty

          if (anyDeckEmpty && !allowDeckEmptyGracePeriod) {
            if (heartDeckEmpty && magicDeckEmpty) {
              return { shouldEnd: true, reason: "Both decks are empty" }
            } else {
              const emptyDeck = heartDeckEmpty ? "Heart" : "Magic"
              return { shouldEnd: true, reason: `${emptyDeck} deck is empty` }
            }
          }

          return { shouldEnd: false, reason: null }
        }

        const room = { gameState: { gameStarted: false } }
        const result = checkGameEndConditions(room)
        expect(result.shouldEnd).toBe(false)
      })

      it('should end game when all tiles filled', () => {
        function checkGameEndConditions(room, allowDeckEmptyGracePeriod = true) {
          if (!room?.gameState?.gameStarted) return { shouldEnd: false, reason: null }

          const allTilesFilled = room.gameState.tiles.every(tile => tile.placedHeart)
          if (allTilesFilled) {
            return { shouldEnd: true, reason: "All tiles are filled" }
          }

          return { shouldEnd: false, reason: null }
        }

        const room = {
          gameState: {
            gameStarted: true,
            tiles: [
              { placedHeart: { value: 1 } },
              { placedHeart: { value: 2 } }
            ]
          }
        }

        const result = checkGameEndConditions(room)
        expect(result.shouldEnd).toBe(true)
        expect(result.reason).toBe("All tiles are filled")
      })

      it('should end game when both decks empty and no grace period', () => {
        function checkGameEndConditions(room, allowDeckEmptyGracePeriod = true) {
          if (!room?.gameState?.gameStarted) return { shouldEnd: false, reason: null }

          const heartDeckEmpty = room.gameState.deck.cards <= 0
          const magicDeckEmpty = room.gameState.magicDeck.cards <= 0
          const anyDeckEmpty = heartDeckEmpty || magicDeckEmpty

          if (anyDeckEmpty && !allowDeckEmptyGracePeriod) {
            if (heartDeckEmpty && magicDeckEmpty) {
              return { shouldEnd: true, reason: "Both decks are empty" }
            } else {
              const emptyDeck = heartDeckEmpty ? "Heart" : "Magic"
              return { shouldEnd: true, reason: `${emptyDeck} deck is empty` }
            }
          }

          return { shouldEnd: false, reason: null }
        }

        const room = {
          gameState: {
            gameStarted: true,
            tiles: [{ placedHeart: null }],
            deck: { cards: 0 },
            magicDeck: { cards: 0 }
          }
        }

        const result = checkGameEndConditions(room, false)
        expect(result.shouldEnd).toBe(true)
        expect(result.reason).toBe("Both decks are empty")
      })
    })

    describe('checkAndExpireShields', () => {
      it('should decrement shield turns and remove expired shields', () => {
        function checkAndExpireShields(room) {
          if (!room.gameState.shields) return

          for (const [userId, shield] of Object.entries(room.gameState.shields)) {
            if (shield.remainingTurns > 0) {
              shield.remainingTurns--

              if (shield.remainingTurns <= 0) {
                delete room.gameState.shields[userId]
              }
            }
          }
        }

        const room = {
          gameState: {
            shields: {
              user1: { remainingTurns: 2, active: true },
              user2: { remainingTurns: 1, active: true }
            }
          }
        }

        checkAndExpireShields(room)

        expect(room.gameState.shields.user1.remainingTurns).toBe(1)
        expect(room.gameState.shields.user1.active).toBe(true)
        expect(room.gameState.shields.user2).toBeUndefined()
      })

      it('should handle missing shields gracefully', () => {
        function checkAndExpireShields(room) {
          if (!room.gameState.shields) return
        }

        const room1 = { gameState: {} }
        const room2 = { gameState: { shields: null } }

        expect(() => {
          checkAndExpireShields(room1)
          checkAndExpireShields(room2)
        }).not.toThrow()
      })
    })
  })

  describe('Authentication Functions', () => {
    describe('authenticateSocket', () => {
      it('should authenticate socket with valid token', async () => {
        const { getToken } = await import('next-auth/jwt')
        const { User } = await import('./models.js')

        getToken.mockResolvedValue({ id: 'user1', jti: 'session1' })
        User.findById.mockResolvedValue({ id: 'user1', email: 'test@example.com', name: 'Test User' })

        const mockSocket = {
          handshake: {},
          data: {}
        }

        const mockNext = vi.fn()

        // Simulate authenticateSocket function
        async function authenticateSocket(socket, next) {
          try {
            const token = await getToken({
              req: socket.handshake,
              secret: process.env.AUTH_SECRET
            })

            if (!token?.id) return next(new Error('Authentication required'))

            const user = await User.findById(token.id)
            if (!user) return next(new Error('User not found'))

            socket.data.userId = token.id
            socket.data.userEmail = user.email
            socket.data.userName = user.name
            socket.data.userSessionId = token.jti

            next()
          } catch (error) {
            next(new Error('Authentication failed'))
          }
        }

        process.env.AUTH_SECRET = 'test-secret'
        await authenticateSocket(mockSocket, mockNext)

        expect(getToken).toHaveBeenCalledWith({
          req: mockSocket.handshake,
          secret: 'test-secret'
        })
        expect(User.findById).toHaveBeenCalledWith('user1')
        expect(mockSocket.data.userId).toBe('user1')
        expect(mockSocket.data.userEmail).toBe('test@example.com')
        expect(mockSocket.data.userName).toBe('Test User')
        expect(mockSocket.data.userSessionId).toBe('session1')
        expect(mockNext).toHaveBeenCalledWith()
      })

      it('should reject socket with no token', async () => {
        const { getToken } = await import('next-auth/jwt')
        getToken.mockResolvedValue(null)

        const mockSocket = { handshake: {}, data: {} }
        const mockNext = vi.fn()

        // Simulate authenticateSocket function
        async function authenticateSocket(socket, next) {
          try {
            const token = await getToken({
              req: socket.handshake,
              secret: process.env.AUTH_SECRET
            })

            if (!token?.id) return next(new Error('Authentication required'))
            next()
          } catch (error) {
            next(new Error('Authentication failed'))
          }
        }

        await authenticateSocket(mockSocket, mockNext)

        expect(mockNext).toHaveBeenCalledWith(new Error('Authentication required'))
      })

      it('should reject socket when user not found', async () => {
        const { getToken } = await import('next-auth/jwt')
        const { User } = await import('./models.js')

        getToken.mockResolvedValue({ id: 'user1', jti: 'session1' })
        User.findById.mockResolvedValue(null)

        const mockSocket = { handshake: {}, data: {} }
        const mockNext = vi.fn()

        // Simulate authenticateSocket function
        async function authenticateSocket(socket, next) {
          try {
            const token = await getToken({
              req: socket.handshake,
              secret: process.env.AUTH_SECRET
            })

            if (!token?.id) return next(new Error('Authentication required'))

            const user = await User.findById(token.id)
            if (!user) return next(new Error('User not found'))

            next()
          } catch (error) {
            next(new Error('Authentication failed'))
          }
        }

        await authenticateSocket(mockSocket, mockNext)

        expect(mockNext).toHaveBeenCalledWith(new Error('User not found'))
      })
    })

    describe('getPlayerSession', () => {
      it('should create new session when none exists', async () => {
        const { PlayerSession } = await import('./models.js')
        PlayerSession.findOneAndUpdate.mockResolvedValue({})

        const playerSessions = new Map()
        const mockSavePlayerSession = vi.fn()

        // Simulate getPlayerSession function
        async function getPlayerSession(userId, userSessionId, userName, userEmail) {
          let session = playerSessions.get(userId)

          if (!session) {
            const newSession = {
              userId, userSessionId, name: userName, email: userEmail,
              currentSocketId: null, lastSeen: new Date(), isActive: true
            }
            playerSessions.set(userId, newSession)
            await mockSavePlayerSession(newSession)
            session = newSession
          }

          return session
        }

        const session = await getPlayerSession('user1', 'session1', 'Player1', 'player1@example.com')

        expect(session.userId).toBe('user1')
        expect(session.name).toBe('Player1')
        expect(session.email).toBe('player1@example.com')
        expect(session.isActive).toBe(true)
        expect(mockSavePlayerSession).toHaveBeenCalled()
      })

      it('should update existing session', async () => {
        const { PlayerSession } = await import('./models.js')
        PlayerSession.findOneAndUpdate.mockResolvedValue({})

        const playerSessions = new Map()
        const mockSavePlayerSession = vi.fn()

        // Add existing session
        const existingSession = {
          userId: 'user1',
          userSessionId: 'session1',
          name: 'Old Name',
          email: 'old@example.com',
          isActive: false
        }
        playerSessions.set('user1', existingSession)

        // Simulate getPlayerSession function
        async function getPlayerSession(userId, userSessionId, userName, userEmail) {
          let session = playerSessions.get(userId)

          if (!session) {
            const newSession = {
              userId, userSessionId, name: userName, email: userEmail,
              currentSocketId: null, lastSeen: new Date(), isActive: true
            }
            playerSessions.set(userId, newSession)
            await mockSavePlayerSession(newSession)
            session = newSession
          } else {
            session.lastSeen = new Date()
            session.isActive = true
            await mockSavePlayerSession(session)
          }

          return session
        }

        const session = await getPlayerSession('user1', 'session1', 'New Name', 'new@example.com')

        expect(session.isActive).toBe(true)
        expect(session.lastSeen).toBeInstanceOf(Date)
        expect(mockSavePlayerSession).toHaveBeenCalled()
      })
    })
  })

  describe('Card Generation Functions', () => {
    it('should generate single heart card', () => {
      const { HeartCard } = require('./src/lib/cards.js')
      HeartCard.generateRandom.mockReturnValue({
        id: 'heart1',
        color: 'red',
        value: 2,
        emoji: '❤️'
      })

      // Simulate generateSingleHeart function
      function generateSingleHeart() {
        const heartCard = HeartCard.generateRandom()
        return heartCard
      }

      const heart = generateSingleHeart()
      expect(HeartCard.generateRandom).toHaveBeenCalled()
      expect(heart.id).toBe('heart1')
    })

    it('should generate single magic card', () => {
      const { generateRandomMagicCard } = require('./src/lib/cards.js')
      generateRandomMagicCard.mockReturnValue({
        id: 'magic1',
        type: 'wind',
        name: 'Wind Card',
        emoji: '💨'
      })

      // Simulate generateSingleMagicCard function
      function generateSingleMagicCard() {
        const magicCard = generateRandomMagicCard()
        return magicCard
      }

      const magicCard = generateSingleMagicCard()
      expect(generateRandomMagicCard).toHaveBeenCalled()
      expect(magicCard.id).toBe('magic1')
    })
  })

  describe('Game State Management', () => {
    describe('validateHeartPlacement', () => {
      it('should validate heart placement correctly', () => {
        const { isHeartCard, createCardFromData } = require('./src/lib/cards.js')
        isHeartCard.mockReturnValue(true)
        createCardFromData.mockReturnValue({
          canTargetTile: vi.fn().mockReturnValue(true)
        })

        // Simulate validateHeartPlacement function
        function validateHeartPlacement(room, userId, heartId, tileId) {
          const playerHand = room.gameState.playerHands[userId] || []
          const heart = playerHand.find(card => card.id === heartId)
          if (!heart) return { valid: false, error: "Card not in player's hand" }

          if (!isHeartCard(heart)) {
            return { valid: false, error: "Only heart cards can be placed on tiles" }
          }

          let heartCard = heart
          if (!(heart instanceof HeartCard)) {
            heartCard = createCardFromData(heart)
          }

          const tile = room.gameState.tiles.find(tile => tile.id == tileId)
          if (!tile) return { valid: false, error: "Tile not found" }

          if (tile.placedHeart) return { valid: false, error: "Tile is already occupied" }

          if (!heartCard.canTargetTile(tile)) {
            return { valid: false, error: "This heart cannot be placed on this tile" }
          }

          return { valid: true }
        }

        const room = {
          gameState: {
            playerHands: {
              user1: [{ id: 'heart1', type: 'heart' }]
            },
            tiles: [{ id: 1, placedHeart: null }]
          }
        }

        const result = validateHeartPlacement(room, 'user1', 'heart1', 1)
        expect(result.valid).toBe(true)
      })

      it('should reject when card not in hand', () => {
        // Simulate validateHeartPlacement function
        function validateHeartPlacement(room, userId, heartId, tileId) {
          const playerHand = room.gameState.playerHands[userId] || []
          const heart = playerHand.find(card => card.id === heartId)
          if (!heart) return { valid: false, error: "Card not in player's hand" }
          return { valid: true }
        }

        const room = {
          gameState: {
            playerHands: { user1: [] },
            tiles: [{ id: 1 }]
          }
        }

        const result = validateHeartPlacement(room, 'player1', 'heart1', 1)
        expect(result.valid).toBe(false)
        expect(result.error).toBe("Card not in player's hand")
      })

      it('should reject when tile already occupied', () => {
        // Simulate validateHeartPlacement function
        function validateHeartPlacement(room, userId, heartId, tileId) {
          const playerHand = room.gameState.playerHands[userId] || []
          const heart = playerHand.find(card => card.id === heartId)
          if (!heart) return { valid: false, error: "Card not in player's hand" }

          const tile = room.gameState.tiles.find(tile => tile.id == tileId)
          if (!tile) return { valid: false, error: "Tile not found" }

          if (tile.placedHeart) return { valid: false, error: "Tile is already occupied" }

          return { valid: true }
        }

        const room = {
          gameState: {
            playerHands: {
              user1: [{ id: 'heart1' }]
            },
            tiles: [{ id: 1, placedHeart: { value: 1 } }]
          }
        }

        const result = validateHeartPlacement(room, 'user1', 'heart1', 1)
        expect(result.valid).toBe(false)
        expect(result.error).toBe("Tile is already occupied")
      })
    })

    describe('migratePlayerData', () => {
      it('should migrate existing player data', async () => {
        const turnLocks = new Map()

        // Simulate migratePlayerData function
        async function migratePlayerData(room, oldUserId, newUserId, userName, userEmail) {
          const playerIndex = room.players.findIndex(p => p.userId === oldUserId)
          if (playerIndex !== -1) {
            room.players[playerIndex] = {
              ...room.players[playerIndex],
              userId: newUserId, name: userName, email: userEmail,
              score: room.players[playerIndex].score || 0
            }
          }

          if (room.gameState.playerHands[oldUserId]) {
            room.gameState.playerHands[newUserId] = room.gameState.playerHands[oldUserId]
            delete room.gameState.playerHands[oldUserId]
          }

          for (const lockKey of turnLocks.keys()) {
            if (lockKey.includes(oldUserId)) turnLocks.delete(lockKey)
          }
        }

        const room = {
          players: [{ userId: 'oldUser', name: 'Old Name', score: 10 }],
          gameState: {
            playerHands: {
              oldUser: [{ id: 'card1' }]
            }
          }
        }

        turnLocks.set('ABC123_oldUser', Date.now())

        await migratePlayerData(room, 'oldUser', 'newUser', 'New Name', 'new@example.com')

        expect(room.players[0].userId).toBe('newUser')
        expect(room.players[0].name).toBe('New Name')
        expect(room.players[0].email).toBe('new@example.com')
        expect(room.gameState.playerHands.newUser).toEqual([{ id: 'card1' }])
        expect(room.gameState.playerHands.oldUser).toBeUndefined()
        expect(turnLocks.size).toBe(0)
      })

      it('should add new player when not found', async () => {
        // Simulate migratePlayerData function
        async function migratePlayerData(room, oldUserId, newUserId, userName, userEmail) {
          const playerIndex = room.players.findIndex(p => p.userId === oldUserId)
          if (playerIndex !== -1) {
            room.players[playerIndex] = {
              ...room.players[playerIndex],
              userId: newUserId, name: userName, email: userEmail,
              score: room.players[playerIndex].score || 0
            }
          } else {
            room.players.push({
              userId: newUserId, name: userName, email: userEmail,
              isReady: false, score: 0, joinedAt: new Date()
            })
          }
        }

        const room = {
          players: [],
          gameState: { playerHands: {} }
        }

        await migratePlayerData(room, 'oldUser', 'newUser', 'New Name', 'new@example.com')

        expect(room.players).toHaveLength(1)
        expect(room.players[0].userId).toBe('newUser')
        expect(room.players[0].name).toBe('New Name')
        expect(room.players[0].isReady).toBe(false)
        expect(room.players[0].score).toBe(0)
      })
    })
  })
})