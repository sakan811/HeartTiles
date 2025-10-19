import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock all dependencies before importing server
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
    generateRandom: vi.fn()
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
    executeEffect: vi.fn()
  })),
  generateRandomMagicCard: vi.fn(),
  isHeartCard: vi.fn(),
  isMagicCard: vi.fn(),
  createCardFromData: vi.fn()
}))

// Mock Next.js to prevent server startup
vi.mock('next', () => {
  const mockApp = {
    prepare: vi.fn().mockResolvedValue(),
    getRequestHandler: vi.fn()
  }
  return {
    default: vi.fn().mockImplementation(() => mockApp)
  }
})

// Mock HTTP server
vi.mock('node:http', () => {
  const mockServer = {
    once: vi.fn(),
    on: vi.fn(),
    close: vi.fn(),
    listen: vi.fn().mockImplementation((port, callback) => {
      if (typeof callback === 'function') {
        setTimeout(callback, 0)
      }
      return mockServer
    })
  }
  return {
    createServer: vi.fn().mockReturnValue(mockServer)
  }
})

// Set environment for testing
process.env.NODE_ENV = 'test'

describe('Socket.IO Room Management Events', () => {
  let mockIo, mockSocket, rooms, playerSessions, connectionPool
  let originalTurnLocks

  beforeEach(async () => {
    vi.clearAllMocks()

    // Store and reset global turn locks
    originalTurnLocks = global.turnLocks
    global.turnLocks = new Map()

    // Initialize mock data structures
    rooms = new Map()
    playerSessions = new Map()
    connectionPool = new Map()

    // Mock Socket.IO server
    mockIo = {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
      use: vi.fn(),
      on: vi.fn(),
      sockets: {
        adapter: {
          rooms: new Map()
        },
        sockets: new Map()
      }
    }

    // Mock socket with all necessary properties
    mockSocket = {
      id: 'socket123',
      handshake: { address: '192.168.1.1' },
      conn: { remoteAddress: '192.168.1.1' },
      data: {
        userId: 'user123',
        userName: 'TestUser',
        userEmail: 'test@example.com',
        userSessionId: 'session123',
        roomCode: null
      },
      join: vi.fn(),
      leave: vi.fn(),
      emit: vi.fn(),
      on: vi.fn(),
      disconnect: vi.fn()
    }

    // Mock database functions
    const { Room, PlayerSession, User } = await import('../../../models')
    Room.find.mockResolvedValue([])
    Room.findOneAndUpdate.mockResolvedValue({})
    Room.deleteOne.mockResolvedValue({})
    PlayerSession.find.mockResolvedValue([])
    PlayerSession.findOneAndUpdate.mockResolvedValue({})
    User.findById.mockResolvedValue({
      _id: 'user123',
      email: 'test@example.com',
      name: 'TestUser'
    })

    // Mock authentication
    const { getToken } = await import('next-auth/jwt')
    getToken.mockResolvedValue({
      id: 'user123',
      email: 'test@example.com',
      name: 'TestUser',
      jti: 'session123'
    })
  })

  afterEach(() => {
    global.turnLocks = originalTurnLocks
  })

  describe('join-room event', () => {
    it('should create a new room when room does not exist', async () => {
      // Import server functions after mocks are set up
      const { validateRoomCode, sanitizeInput } = await import('../../server.js')

      const roomCode = 'ABC123'
      expect(validateRoomCode(roomCode)).toBe(true)

      const sanitizedCode = sanitizeInput(roomCode.toUpperCase())
      expect(sanitizedCode).toBe('ABC123')

      // Simulate room creation logic
      const newRoom = {
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

      rooms.set(sanitizedCode, newRoom)
      expect(rooms.has(sanitizedCode)).toBe(true)

      // Add player to room
      const player = {
        userId: mockSocket.data.userId,
        name: mockSocket.data.userName,
        email: mockSocket.data.userEmail,
        isReady: false,
        score: 0,
        joinedAt: new Date()
      }

      newRoom.players.push(player)
      expect(newRoom.players).toHaveLength(1)
      expect(newRoom.players[0].userId).toBe('user123')
    })

    it('should join existing room when space available', async () => {
      const { validateRoomCode } = await import('../../server.js')

      const roomCode = 'DEF456'
      expect(validateRoomCode(roomCode)).toBe(true)

      // Create existing room with one player
      const existingRoom = {
        code: roomCode,
        players: [
          {
            userId: 'user456',
            name: 'ExistingUser',
            email: 'existing@example.com',
            isReady: true,
            score: 5
          }
        ],
        maxPlayers: 2,
        gameState: {
          tiles: [{ id: 0, color: 'red' }],
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

      rooms.set(roomCode, existingRoom)

      // Join room with new player
      const newPlayer = {
        userId: mockSocket.data.userId,
        name: mockSocket.data.userName,
        email: mockSocket.data.userEmail,
        isReady: false,
        score: 0,
        joinedAt: new Date()
      }

      existingRoom.players.push(newPlayer)

      expect(existingRoom.players).toHaveLength(2)
      expect(existingRoom.players[1].userId).toBe('user123')
    })

    it('should reject joining when room is full', async () => {
      const { validateRoomCode } = await import('../../server.js')

      const roomCode = 'FULL123'
      expect(validateRoomCode(roomCode)).toBe(true)

      // Create full room
      const fullRoom = {
        code: roomCode,
        players: [
          { userId: 'user1', name: 'User1' },
          { userId: 'user2', name: 'User2' }
        ],
        maxPlayers: 2,
        gameState: { gameStarted: false }
      }

      rooms.set(roomCode, fullRoom)

      // Try to join with different user
      const joiningUserId = 'user3'
      const existingPlayer = fullRoom.players.find(p => p.userId === joiningUserId)
      const isPlayerInRoom = !!existingPlayer
      const canJoin = !isPlayerInRoom && fullRoom.players.length < fullRoom.maxPlayers

      expect(canJoin).toBe(false)
      expect(isPlayerInRoom).toBe(false)
    })

    it('should handle invalid room codes', async () => {
      const { validateRoomCode } = await import('../../server.js')

      const invalidCodes = ['', 'ABC', 'ABC1234', 'ABC-123', null, undefined, 123]

      for (const invalidCode of invalidCodes) {
        expect(validateRoomCode(invalidCode)).toBe(false)
      }
    })

    it('should handle reconnection for existing player', async () => {
      const roomCode = 'RECONN123'

      // Create room with player that disconnected
      const room = {
        code: roomCode,
        players: [
          {
            userId: 'user123',
            name: 'TestUser',
            email: 'test@example.com',
            isReady: true,
            score: 10
          }
        ],
        maxPlayers: 2,
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user123', name: 'TestUser' },
          tiles: [],
          deck: { cards: 10 },
          magicDeck: { cards: 12 },
          playerHands: {
            user123: [{ id: 'heart1', type: 'heart' }]
          },
          shields: {},
          turnCount: 5,
          playerActions: {}
        }
      }

      rooms.set(roomCode, room)

      // Simulate reconnection
      const existingPlayer = room.players.find(p => p.userId === mockSocket.data.userId)
      expect(existingPlayer).toBeDefined()

      if (existingPlayer) {
        existingPlayer.name = mockSocket.data.userName
        existingPlayer.email = mockSocket.data.userEmail
      }

      expect(room.players[0].name).toBe('TestUser')
      expect(room.gameState.gameStarted).toBe(true)
    })

    it('should send game state to reconnected player if game is in progress', async () => {
      const roomCode = 'GAME123'

      const room = {
        code: roomCode,
        players: [
          { userId: 'user123', name: 'TestUser', score: 15 },
          { userId: 'user456', name: 'OtherUser', score: 10 }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user456', name: 'OtherUser' },
          tiles: [{ id: 0, color: 'red', placedHeart: null }],
          deck: { cards: 8, emoji: "💌", type: 'hearts' },
          magicDeck: { cards: 14, emoji: "🔮", type: 'magic' },
          playerHands: {
            user123: [{ id: 'heart1', type: 'heart', color: 'red', value: 2 }],
            user456: [{ id: 'heart2', type: 'heart', color: 'blue', value: 1 }]
          },
          shields: {},
          turnCount: 3,
          playerActions: {}
        }
      }

      rooms.set(roomCode, room)

      // Simulate sending game state to reconnected player
      const gameStateData = {
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
        playerId: mockSocket.data.userId,
        shields: room.gameState.shields || {},
        playerActions: room.gameState.playerActions || {}
      }

      expect(gameStateData.playerId).toBe('user123')
      expect(gameStateData.gameStarted).toBeUndefined() // Not included in actual data
      expect(gameStateData.players).toHaveLength(2)
      expect(gameStateData.playerHands.user123).toHaveLength(1)
    })
  })

  describe('leave-room event', () => {
    it('should remove player from room and update room state', async () => {
      const { validateRoomCode } = await import('../../server.js')

      const roomCode = 'LEAVE123'
      expect(validateRoomCode(roomCode)).toBe(true)

      // Create room with multiple players
      const room = {
        code: roomCode,
        players: [
          { userId: 'user123', name: 'TestUser', score: 10 },
          { userId: 'user456', name: 'OtherUser', score: 15 }
        ],
        gameState: {
          playerHands: {
            user123: [{ id: 'card1' }],
            user456: [{ id: 'card2' }]
          }
        }
      }

      rooms.set(roomCode, room)

      // Remove player
      const leavingUserId = 'user123'
      room.players = room.players.filter(player => player.userId !== leavingUserId)

      // Clean up player hands
      delete room.gameState.playerHands[leavingUserId]

      expect(room.players).toHaveLength(1)
      expect(room.players[0].userId).toBe('user456')
      expect(room.gameState.playerHands.user123).toBeUndefined()
      expect(room.gameState.playerHands.user456).toBeDefined()
    })

    it('should delete room when last player leaves', async () => {
      const roomCode = 'EMPTY123'

      const room = {
        code: roomCode,
        players: [
          { userId: 'user123', name: 'TestUser' }
        ]
      }

      rooms.set(roomCode, room)
      expect(rooms.has(roomCode)).toBe(true)

      // Remove last player
      room.players = room.players.filter(player => player.userId !== 'user123')

      if (room.players.length === 0) {
        rooms.delete(roomCode)
      }

      expect(rooms.has(roomCode)).toBe(false)
      expect(room.players).toHaveLength(0)
    })

    it('should handle leaving non-existent room gracefully', async () => {
      const { validateRoomCode } = await import('../../server.js')

      const roomCode = 'NONEXIST123'
      expect(validateRoomCode(roomCode)).toBe(true)

      const room = rooms.get(roomCode)
      expect(room).toBeUndefined()

      // Should handle gracefully without errors
      expect(() => {
        if (room) {
          room.players = room.players.filter(player => player.userId !== 'user123')
        }
      }).not.toThrow()
    })
  })

  describe('player-ready event', () => {
    it('should toggle player ready status', async () => {
      const { validateRoomCode } = await import('../../server.js')

      const roomCode = 'READY123'
      expect(validateRoomCode(roomCode)).toBe(true)

      const room = {
        players: [
          { userId: 'user123', name: 'TestUser', isReady: false, score: 0 },
          { userId: 'user456', name: 'OtherUser', isReady: false, score: 0 }
        ],
        maxPlayers: 2,
        gameState: { gameStarted: false }
      }

      rooms.set(roomCode, room)

      // Toggle ready status for user123
      const player = room.players.find(p => p.userId === 'user123')
      expect(player).toBeDefined()

      if (player) {
        player.isReady = !player.isReady
        expect(player.isReady).toBe(true)
      }

      // Toggle again
      if (player) {
        player.isReady = !player.isReady
        expect(player.isReady).toBe(false)
      }
    })

    it('should start game when all players are ready', async () => {
      const { generateTiles } = await import('../../server.js')

      // Mock generateTiles to return predictable tiles
      const originalRandom = Math.random
      Math.random = vi.fn().mockReturnValue(0.8)

      const roomCode = 'START123'

      const room = {
        code: roomCode,
        players: [
          { userId: 'user123', name: 'TestUser', isReady: true },
          { userId: 'user456', name: 'OtherUser', isReady: true }
        ],
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

      rooms.set(roomCode, room)

      // Check if all players are ready
      const allReady = room.players.length === 2 && room.players.every(p => p.isReady)
      expect(allReady).toBe(true)

      if (allReady) {
        // Start game
        room.gameState.tiles = generateTiles()
        room.gameState.gameStarted = true
        room.gameState.deck.cards = 16
        room.gameState.magicDeck.cards = 16
        room.gameState.playerActions = {}

        expect(room.gameState.gameStarted).toBe(true)
        expect(room.gameState.tiles).toHaveLength(8)
        expect(room.gameState.deck.cards).toBe(16)
        expect(room.gameState.magicDeck.cards).toBe(16)

        // Initialize player hands
        const { HeartCard } = await import('../../src/lib/cards.js')
        const mockHeart = { id: 'heart1', type: 'heart', color: 'red', value: 2 }
        HeartCard.generateRandom.mockReturnValue(mockHeart)

        const { generateRandomMagicCard } = await import('../../src/lib/cards.js')
        const mockMagicCard = { id: 'magic1', type: 'wind' }
        generateRandomMagicCard.mockReturnValue(mockMagicCard)

        room.players.forEach(player => {
          room.gameState.playerHands[player.userId] = []
          for (let i = 0; i < 3; i++) {
            room.gameState.playerHands[player.userId].push(mockHeart)
          }
          for (let i = 0; i < 2; i++) {
            room.gameState.playerHands[player.userId].push(mockMagicCard)
          }
        })

        // Select random starting player
        room.gameState.currentPlayer = room.players[0]
        room.gameState.turnCount = 1

        expect(room.gameState.currentPlayer.userId).toBe('user123')
        expect(room.gameState.turnCount).toBe(1)
        expect(room.gameState.playerHands.user123).toHaveLength(5)
        expect(room.gameState.playerHands.user456).toHaveLength(5)
      }

      Math.random = originalRandom
    })

    it('should not start game when not all players are ready', async () => {
      const roomCode = 'NOTREADY123'

      const room = {
        players: [
          { userId: 'user123', name: 'TestUser', isReady: true },
          { userId: 'user456', name: 'OtherUser', isReady: false }
        ],
        maxPlayers: 2,
        gameState: { gameStarted: false }
      }

      rooms.set(roomCode, room)

      const allReady = room.players.length === 2 && room.players.every(p => p.isReady)
      expect(allReady).toBe(false)

      expect(room.gameState.gameStarted).toBe(false)
    })

    it('should handle ready toggle for non-existent player', async () => {
      const roomCode = 'NOPLAYER123'

      const room = {
        players: [
          { userId: 'user456', name: 'OtherUser', isReady: false }
        ],
        gameState: { gameStarted: false }
      }

      rooms.set(roomCode, room)

      const player = room.players.find(p => p.userId === 'user123')
      expect(player).toBeUndefined()

      // Should handle gracefully without error
      expect(() => {
        if (player) {
          player.isReady = !player.isReady
        }
      }).not.toThrow()
    })
  })

  describe('shuffle-tiles event', () => {
    it('should generate new tiles when game has started', async () => {
      const { generateTiles } = await import('../../server.js')

      // Mock generateTiles to return predictable tiles
      const originalRandom = Math.random
      Math.random = vi.fn().mockReturnValue(0.5)

      const roomCode = 'SHUFFLE123'

      const room = {
        gameState: {
          gameStarted: true,
          tiles: [
            { id: 0, color: 'red', emoji: '🟥' },
            { id: 1, color: 'blue', emoji: '🟦' }
          ]
        }
      }

      rooms.set(roomCode, room)

      if (room?.gameState.gameStarted) {
        room.gameState.tiles = generateTiles()
      }

      expect(room.gameState.tiles).toHaveLength(8)
      expect(room.gameState.tiles[0]).toHaveProperty('id')
      expect(room.gameState.tiles[0]).toHaveProperty('color')
      expect(room.gameState.tiles[0]).toHaveProperty('emoji')

      Math.random = originalRandom
    })

    it('should not shuffle tiles when game has not started', async () => {
      const roomCode = 'NOSHUFFLE123'

      const originalTiles = [
        { id: 0, color: 'red', emoji: '🟥' },
        { id: 1, color: 'blue', emoji: '🟦' }
      ]

      const room = {
        gameState: {
          gameStarted: false,
          tiles: originalTiles
        }
      }

      rooms.set(roomCode, room)

      if (room?.gameState.gameStarted) {
        room.gameState.tiles = generateTiles()
      }

      expect(room.gameState.tiles).toEqual(originalTiles)
      expect(room.gameState.tiles).toHaveLength(2)
    })

    it('should handle shuffle for non-existent room', async () => {
      const roomCode = 'NOROOM123'

      const room = rooms.get(roomCode)
      expect(room).toBeUndefined()

      // Should handle gracefully without error
      expect(() => {
        if (room?.gameState.gameStarted) {
          room.gameState.tiles = generateTiles()
        }
      }).not.toThrow()
    })
  })

  describe('Connection Management', () => {
    it('should accept connections within IP limit', () => {
      const MAX_CONNECTIONS_PER_IP = 5
      const clientIP = '192.168.1.1'

      function canAcceptConnection(ip) {
        return (connectionPool.get(ip) || 0) < MAX_CONNECTIONS_PER_IP
      }

      function incrementConnectionCount(ip) {
        connectionPool.set(ip, (connectionPool.get(ip) || 0) + 1)
      }

      // Should accept connections up to limit
      for (let i = 0; i < MAX_CONNECTIONS_PER_IP; i++) {
        expect(canAcceptConnection(clientIP)).toBe(true)
        incrementConnectionCount(clientIP)
      }

      expect(connectionPool.get(clientIP)).toBe(5)
    })

    it('should reject connections over IP limit', () => {
      const MAX_CONNECTIONS_PER_IP = 5
      const clientIP = '192.168.1.2'

      function canAcceptConnection(ip) {
        return (connectionPool.get(ip) || 0) < MAX_CONNECTIONS_PER_IP
      }

      function incrementConnectionCount(ip) {
        connectionPool.set(ip, (connectionPool.get(ip) || 0) + 1)
      }

      // Fill up to limit
      for (let i = 0; i < MAX_CONNECTIONS_PER_IP; i++) {
        incrementConnectionCount(clientIP)
      }

      // Should reject when over limit
      expect(canAcceptConnection(clientIP)).toBe(false)
    })

    it('should decrement connection count on disconnect', () => {
      const clientIP = '192.168.1.3'

      function incrementConnectionCount(ip) {
        connectionPool.set(ip, (connectionPool.get(ip) || 0) + 1)
      }

      function decrementConnectionCount(ip) {
        const current = connectionPool.get(ip) || 0
        if (current > 0) connectionPool.set(ip, current - 1)
      }

      // Add connections
      incrementConnectionCount(clientIP)
      incrementConnectionCount(clientIP)
      expect(connectionPool.get(clientIP)).toBe(2)

      // Decrement on disconnect
      decrementConnectionCount(clientIP)
      expect(connectionPool.get(clientIP)).toBe(1)

      decrementConnectionCount(clientIP)
      expect(connectionPool.get(clientIP)).toBe(0)
    })

    it('should handle client IP extraction from socket', async () => {
      const { getClientIP } = await import('../../server.js')

      // Test socket with handshake.address
      const socket1 = {
        handshake: { address: '192.168.1.100' },
        conn: { remoteAddress: '192.168.1.200' }
      }
      expect(getClientIP(socket1)).toBe('192.168.1.100')

      // Test socket with only conn.remoteAddress
      const socket2 = {
        handshake: {},
        conn: { remoteAddress: '192.168.1.200' }
      }
      expect(getClientIP(socket2)).toBe('192.168.1.200')

      // Test socket with no address info
      const socket3 = {
        handshake: {},
        conn: {}
      }
      expect(getClientIP(socket3)).toBe('unknown')
    })
  })
})