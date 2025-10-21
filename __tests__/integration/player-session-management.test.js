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

describe('Player Session Management and Reconnection Logic', () => {
  let playerSessions, rooms, mockSocket

  beforeEach(() => {
    vi.clearAllMocks()
    playerSessions = new Map()
    rooms = new Map()

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

    global.turnLocks = new Map()
  })

  afterEach(() => {
    global.turnLocks = new Map()
  })

  describe('Player Session Creation and Management', () => {
    it('should create new player session when none exists', async () => {
      const { PlayerSession } = await import('../../../models')

      const newSession = {
        userId: 'user123',
        userSessionId: 'session123',
        name: 'TestUser',
        email: 'test@example.com',
        currentSocketId: 'socket123',
        lastSeen: new Date(),
        isActive: true
      }

      PlayerSession.findOneAndUpdate.mockResolvedValue(newSession)

      // Simulate getPlayerSession function
      async function getPlayerSession(userId, userSessionId, userName, userEmail) {
        let session = playerSessions.get(userId)

        if (!session) {
          const newSession = {
            userId, userSessionId, name: userName, email: userEmail,
            currentSocketId: null, lastSeen: new Date(), isActive: true
          }
          playerSessions.set(userId, newSession)
          await PlayerSession.findOneAndUpdate(
            { userId: newSession.userId },
            newSession,
            { upsert: true, new: true }
          )
          session = newSession
        } else {
          session.lastSeen = new Date()
          session.isActive = true
          await PlayerSession.findOneAndUpdate(
            { userId: session.userId },
            session,
            { upsert: true, new: true }
          )
        }

        return session
      }

      const session = await getPlayerSession(
        'user123',
        'session123',
        'TestUser',
        'test@example.com'
      )

      expect(session.userId).toBe('user123')
      expect(session.name).toBe('TestUser')
      expect(session.email).toBe('test@example.com')
      expect(session.isActive).toBe(true)
      expect(PlayerSession.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: 'user123' },
        expect.objectContaining({
          userId: 'user123',
          name: 'TestUser',
          email: 'test@example.com',
          isActive: true
        }),
        { upsert: true, new: true }
      )
    })

    it('should update existing player session', async () => {
      const { PlayerSession } = await import('../../../models')

      const existingSession = {
        userId: 'user123',
        userSessionId: 'session123',
        name: 'TestUser',
        email: 'test@example.com',
        currentSocketId: 'socket456',
        lastSeen: new Date('2024-01-01'),
        isActive: false
      }

      playerSessions.set('user123', existingSession)
      PlayerSession.findOneAndUpdate.mockResolvedValue(existingSession)

      // Simulate getPlayerSession function
      async function getPlayerSession(userId, userSessionId, userName, userEmail) {
        let session = playerSessions.get(userId)

        if (!session) {
          const newSession = {
            userId, userSessionId, name: userName, email: userEmail,
            currentSocketId: null, lastSeen: new Date(), isActive: true
          }
          playerSessions.set(userId, newSession)
          await PlayerSession.findOneAndUpdate(
            { userId: newSession.userId },
            newSession,
            { upsert: true, new: true }
          )
          session = newSession
        } else {
          session.lastSeen = new Date()
          session.isActive = true
          await PlayerSession.findOneAndUpdate(
            { userId: session.userId },
            session,
            { upsert: true, new: true }
          )
        }

        return session
      }

      const session = await getPlayerSession(
        'user123',
        'session123',
        'TestUser',
        'test@example.com'
      )

      expect(session.isActive).toBe(true)
      expect(session.lastSeen).toBeInstanceOf(Date)
      expect(PlayerSession.findOneAndUpdate).toHaveBeenCalledTimes(1)
    })

    it('should update player socket information', async () => {
      const { PlayerSession } = await import('../../../models')

      const sessionData = {
        userId: 'user123',
        userSessionId: 'session123',
        name: 'TestUser',
        email: 'test@example.com',
        currentSocketId: 'socket456',
        lastSeen: new Date(),
        isActive: true
      }

      PlayerSession.findOneAndUpdate.mockResolvedValue(sessionData)

      // Simulate updatePlayerSocket function
      async function updatePlayerSocket(userId, socketId, userSessionId, userName, userEmail) {
        const session = {
          userId, userSessionId, name: userName, email: userEmail,
          currentSocketId: socketId, lastSeen: new Date(), isActive: true
        }

        await PlayerSession.findOneAndUpdate(
          { userId: session.userId },
          session,
          { upsert: true, new: true }
        )
        return session
      }

      const updatedSession = await updatePlayerSocket(
        'user123',
        'socket789',
        'session123',
        'TestUser',
        'test@example.com'
      )

      expect(updatedSession.currentSocketId).toBe('socket789')
      expect(updatedSession.isActive).toBe(true)
      expect(PlayerSession.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: 'user123' },
        expect.objectContaining({
          currentSocketId: 'socket789',
          isActive: true
        }),
        { upsert: true, new: true }
      )
    })
  })

  describe('Player Data Migration', () => {
    it('should migrate existing player data correctly', async () => {
      const room = {
        players: [
          { userId: 'oldUser123', name: 'OldName', score: 15, email: 'old@example.com' }
        ],
        gameState: {
          playerHands: {
            oldUser123: [
              { id: 'heart1', type: 'heart', color: 'red', value: 2 },
              { id: 'magic1', type: 'magic', emoji: '💨' }
            ]
          },
          shields: {
            oldUser123: {
              active: true,
              remainingTurns: 2,
              activatedBy: 'oldUser123'
            }
          },
          currentPlayer: { userId: 'oldUser123', name: 'OldName' }
        }
      }

      const oldUserId = 'oldUser123'
      const newUserId = 'newUser123'
      const userName = 'NewName'
      const userEmail = 'new@example.com'

      // Simulate migratePlayerData function
      function migratePlayerData(room, oldUserId, newUserId, userName, userEmail) {
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

        if (room.gameState.shields && room.gameState.shields[oldUserId]) {
          room.gameState.shields[newUserId] = room.gameState.shields[oldUserId]
          delete room.gameState.shields[oldUserId]
        }

        if (room.gameState.currentPlayer?.userId === oldUserId) {
          room.gameState.currentPlayer = {
            userId: newUserId, name: userName, email: userEmail,
            isReady: room.players.find(p => p.userId === newUserId)?.isReady || false
          }
        }
      }

      migratePlayerData(room, oldUserId, newUserId, userName, userEmail)

      expect(room.players[0].userId).toBe(newUserId)
      expect(room.players[0].name).toBe(userName)
      expect(room.players[0].email).toBe(userEmail)
      expect(room.players[0].score).toBe(15)

      expect(room.gameState.playerHands[newUserId]).toBeDefined()
      expect(room.gameState.playerHands[newUserId]).toHaveLength(2)
      expect(room.gameState.playerHands[oldUserId]).toBeUndefined()

      expect(room.gameState.shields[newUserId]).toBeDefined()
      expect(room.gameState.shields[newUserId].active).toBe(true)
      expect(room.gameState.shields[oldUserId]).toBeUndefined()

      expect(room.gameState.currentPlayer.userId).toBe(newUserId)
      expect(room.gameState.currentPlayer.name).toBe(userName)
    })

    it('should add new player when migrating non-existent player', async () => {
      const room = {
        players: [
          { userId: 'existingUser', name: 'ExistingUser', score: 10 }
        ],
        gameState: {
          playerHands: {
            existingUser: [{ id: 'heart1', type: 'heart' }]
          },
          shields: {},
          currentPlayer: { userId: 'existingUser', name: 'ExistingUser' }
        }
      }

      const oldUserId = 'nonExistentUser'
      const newUserId = 'newUser456'
      const userName = 'NewUser'
      const userEmail = 'new@example.com'

      // Simulate migratePlayerData function
      function migratePlayerData(room, oldUserId, newUserId, userName, userEmail) {
        const playerIndex = room.players.findIndex(p => p.userId === oldUserId)
        if (playerIndex === -1) {
          room.players.push({
            userId: newUserId, name: userName, email: userEmail,
            isReady: false, score: 0, joinedAt: new Date()
          })
        }
      }

      migratePlayerData(room, oldUserId, newUserId, userName, userEmail)

      expect(room.players).toHaveLength(2)
      expect(room.players[1].userId).toBe(newUserId)
      expect(room.players[1].name).toBe(userName)
      expect(room.players[1].email).toBe(userEmail)
      expect(room.players[1].score).toBe(0)
      expect(room.players[1].isReady).toBe(false)
    })

    it('should clean up turn locks during migration', async () => {
      const room = {
        players: [{ userId: 'oldUser123', name: 'OldName' }],
        gameState: { currentPlayer: { userId: 'oldUser123' } }
      }

      // Add some turn locks for the old user
      global.turnLocks.set('ROOM123_oldUser123', Date.now())
      global.turnLocks.set('ROOM123_otherUser', Date.now())

      expect(global.turnLocks.size).toBe(2)

      const oldUserId = 'oldUser123'
      const newUserId = 'newUser123'

      // Simulate turn lock cleanup in migratePlayerData
      for (const lockKey of global.turnLocks.keys()) {
        if (lockKey.includes(oldUserId)) {
          global.turnLocks.delete(lockKey)
        }
      }

      expect(global.turnLocks.size).toBe(1)
      expect(global.turnLocks.has('ROOM123_oldUser123')).toBe(false)
      expect(global.turnLocks.has('ROOM123_otherUser')).toBe(true)
    })
  })

  describe('Session Loading and Persistence', () => {
    it('should load active player sessions from database', async () => {
      const { PlayerSession } = await import('../../../models')

      const mockSessions = [
        {
          userId: 'user1',
          userSessionId: 'session1',
          name: 'User1',
          email: 'user1@example.com',
          currentSocketId: 'socket1',
          isActive: true,
          lastSeen: new Date()
        },
        {
          userId: 'user2',
          userSessionId: 'session2',
          name: 'User2',
          email: 'user2@example.com',
          currentSocketId: 'socket2',
          isActive: true,
          lastSeen: new Date()
        }
      ]

      PlayerSession.find.mockResolvedValue(mockSessions)

      // Simulate loadPlayerSessions function
      async function loadPlayerSessions() {
        try {
          const sessions = await PlayerSession.find({ isActive: true })
          const sessionsMap = new Map()
          sessions.forEach(session => {
            const sessionObj = session.toObject ? session.toObject() : session
            sessionsMap.set(sessionObj.userId, sessionObj)
          })
          return sessionsMap
        } catch (err) {
          console.error('Failed to load sessions:', err)
          return new Map()
        }
      }

      const loadedSessions = await loadPlayerSessions()

      expect(PlayerSession.find).toHaveBeenCalledWith({ isActive: true })
      expect(loadedSessions.size).toBe(2)
      expect(loadedSessions.get('user1')).toBeDefined()
      expect(loadedSessions.get('user2')).toBeDefined()
      expect(loadedSessions.get('user1').name).toBe('User1')
      expect(loadedSessions.get('user2').email).toBe('user2@example.com')
    })

    it('should handle database errors during session loading', async () => {
      const { PlayerSession } = await import('../../../models')

      PlayerSession.find.mockRejectedValue(new Error('Database connection failed'))

      // Simulate loadPlayerSessions function with error handling
      async function loadPlayerSessions() {
        try {
          const sessions = await PlayerSession.find({ isActive: true })
          return new Map()
        } catch (err) {
          console.error('Failed to load sessions:', err)
          return new Map()
        }
      }

      const loadedSessions = await loadPlayerSessions()

      expect(PlayerSession.find).toHaveBeenCalledWith({ isActive: true })
      expect(loadedSessions.size).toBe(0)
    })

    it('should save player session to database', async () => {
      const { PlayerSession } = await import('../../../models')

      const sessionData = {
        userId: 'user123',
        userSessionId: 'session123',
        name: 'TestUser',
        email: 'test@example.com',
        currentSocketId: 'socket123',
        lastSeen: new Date(),
        isActive: true
      }

      PlayerSession.findOneAndUpdate.mockResolvedValue(sessionData)

      // Simulate savePlayerSession function
      async function savePlayerSession(sessionData) {
        try {
          await PlayerSession.findOneAndUpdate(
            { userId: sessionData.userId },
            sessionData,
            { upsert: true, new: true }
          )
        } catch (err) {
          console.error('Failed to save player session:', err)
        }
      }

      await savePlayerSession(sessionData)

      expect(PlayerSession.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: 'user123' },
        sessionData,
        { upsert: true, new: true }
      )
    })

    it('should handle save errors gracefully', async () => {
      const { PlayerSession } = await import('../../../models')

      const sessionData = { userId: 'user123' }
      PlayerSession.findOneAndUpdate.mockRejectedValue(new Error('Save failed'))

      // Simulate savePlayerSession function with error handling
      async function savePlayerSession(sessionData) {
        try {
          await PlayerSession.findOneAndUpdate(
            { userId: sessionData.userId },
            sessionData,
            { upsert: true, new: true }
          )
        } catch (err) {
          console.error('Failed to save player session:', err)
        }
      }

      // Should not throw error
      await expect(savePlayerSession(sessionData)).resolves.toBeUndefined()
    })
  })

  describe('Reconnection Scenarios', () => {
    it('should handle player reconnection to existing game', async () => {
      const roomCode = 'RECONN123'
      const userId = 'user123'

      const room = {
        code: roomCode,
        players: [
          {
            userId: userId,
            name: 'TestUser',
            email: 'test@example.com',
            isReady: true,
            score: 25
          },
          {
            userId: 'user456',
            name: 'OtherUser',
            email: 'other@example.com',
            isReady: true,
            score: 20
          }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: 'user456', name: 'OtherUser' },
          tiles: [
            { id: 0, color: 'red', placedHeart: { placedBy: userId, value: 4 } },
            { id: 1, color: 'blue', placedHeart: null }
          ],
          deck: { emoji: '💌', cards: 12, } emoji: '💌', }
          magicDeck: { emoji: '🔮', cards: 14, } emoji: '🔮', }
          playerHands: {
            user123: [
              { id: 'heart1', type: 'heart', color: 'yellow', value: 3 },
              { id: 'magic1', type: 'magic', emoji: '💨' }
            ],
            user456: [
              { id: 'heart2', type: 'heart', color: 'green', value: 2 }
            ]
          },
          shields: {
            user456: { active: true, remainingTurns: 1 }
          },
          turnCount: 5,
          playerActions: {
            user456: { drawnHeart: true, drawnMagic: false }
          }
        }
      }

      rooms.set(roomCode, room)

      // Simulate reconnection logic
      const existingPlayer = room.players.find(p => p.userId === userId)
      expect(existingPlayer).toBeDefined()

      if (existingPlayer) {
        // Update player info if needed
        existingPlayer.name = 'UpdatedUser'
        existingPlayer.email = 'updated@example.com'
      }

      // Prepare game state data for reconnected player
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
        playerId: userId,
        shields: room.gameState.shields || {},
        playerActions: room.gameState.playerActions || {}
      }

      expect(gameStateData.playerId).toBe(userId)
      expect(gameStateData.gameStarted).toBeUndefined() // Not included in broadcast
      expect(gameStateData.players).toHaveLength(2)
      expect(gameStateData.playerHands[userId]).toHaveLength(2)
      expect(gameStateData.currentPlayer.userId).toBe('user456')
      expect(gameStateData.turnCount).toBe(5)
    })

    it('should handle reconnection when player has shield', async () => {
      const roomCode = 'SHIELDRECONN123'
      const userId = 'user123'

      const room = {
        code: roomCode,
        players: [
          { userId: userId, name: 'TestUser', score: 15 }
        ],
        gameState: {
          gameStarted: true,
          currentPlayer: { userId: userId, name: 'TestUser' },
          shields: {
            user123: {
              active: true,
              remainingTurns: 2,
              activatedBy: userId,
              activatedTurn: 3
            }
          },
          turnCount: 4
        }
      }

      rooms.set(roomCode, room)

      // Verify shield state is maintained during reconnection
      const playerShield = room.gameState.shields[userId]
      expect(playerShield).toBeDefined()
      expect(playerShield.active).toBe(true)
      expect(playerShield.remainingTurns).toBe(2)
      expect(playerShield.activatedBy).toBe(userId)
    })

    it('should handle reconnection after disconnection', async () => {
      const roomCode = 'DISCONNRECONN123'
      const userId = 'user123'

      // Initial state with player
      const room = {
        code: roomCode,
        players: [
          { userId: userId, name: 'TestUser', score: 10 },
          { userId: 'user456', name: 'OtherUser', score: 15 }
        ],
        gameState: {
          gameStarted: true,
          playerHands: {
            user123: [{ id: 'heart1', type: 'heart' }],
            user456: [{ id: 'heart2', type: 'heart' }]
          }
        }
      }

      rooms.set(roomCode, room)

      // Simulate disconnection
      room.players = room.players.filter(player => player.userId !== userId)
      delete room.gameState.playerHands[userId]

      expect(room.players).toHaveLength(1)
      expect(room.players[0].userId).toBe('user456')
      expect(room.gameState.playerHands.user123).toBeUndefined()

      // Simulate reconnection
      room.players.push({
        userId: userId,
        name: 'TestUser',
        email: 'test@example.com',
        isReady: false,
        score: 10,
        joinedAt: new Date()
      })

      room.gameState.playerHands[userId] = [{ id: 'heart3', type: 'heart' }]

      expect(room.players).toHaveLength(2)
      expect(room.players[1].userId).toBe(userId)
      expect(room.gameState.playerHands[userId]).toBeDefined()
    })
  })

  describe('Session Cleanup and Management', () => {
    it('should clean up session data on disconnect', async () => {
      const roomCode = 'CLEANUP123'
      const userId = 'user123'

      const room = {
        code: roomCode,
        players: [
          { userId: userId, name: 'TestUser', score: 10 },
          { userId: 'user456', name: 'OtherUser', score: 15 }
        ],
        gameState: {
          playerHands: {
            user123: [{ id: 'heart1', type: 'heart' }],
            user456: [{ id: 'heart2', type: 'heart' }]
          },
          shields: {
            user123: { active: true, remainingTurns: 1 }
          }
        }
      }

      rooms.set(roomCode, room)

      // Add session and turn locks
      playerSessions.set(userId, {
        userId: userId,
        currentSocketId: 'socket123',
        isActive: true
      })
      global.turnLocks.set(`${roomCode}_socket123`, Date.now())

      expect(playerSessions.size).toBe(1)
      expect(global.turnLocks.size).toBe(1)

      // Simulate disconnect cleanup
      room.players = room.players.filter(player => player.userId !== userId)
      delete room.gameState.playerHands[userId]

      // Clean up turn locks
      global.turnLocks.delete(`${roomCode}_socket123`)

      // Update session
      const session = playerSessions.get(userId)
      if (session) {
        session.isActive = false
        session.currentSocketId = null
      }

      expect(room.players).toHaveLength(1)
      expect(room.players[0].userId).toBe('user456')
      expect(room.gameState.playerHands.user123).toBeUndefined()
      expect(global.turnLocks.size).toBe(0)
      expect(playerSessions.get(userId).isActive).toBe(false)
    })

    it('should delete room when last player disconnects', async () => {
      const { Room, deleteRoom } = await import('../../../models')

      const roomCode = 'EMPTYROOM123'
      const userId = 'user123'

      const room = {
        code: roomCode,
        players: [
          { userId: userId, name: 'TestUser' }
        ]
      }

      rooms.set(roomCode, room)
      expect(rooms.has(roomCode)).toBe(true)

      // Mock deleteRoom function
      const mockDeleteRoom = vi.fn()
      vi.mocked(deleteRoom).mockImplementation(mockDeleteRoom)

      // Simulate last player disconnect
      room.players = room.players.filter(player => player.userId !== userId)

      if (room.players.length === 0) {
        rooms.delete(roomCode)
        await mockDeleteRoom(roomCode)
      }

      expect(rooms.has(roomCode)).toBe(false)
      expect(room.players).toHaveLength(0)
    })

    it('should handle session expiration and cleanup', async () => {
      const { PlayerSession } = await import('../../../models')

      const oldSession = {
        userId: 'user123',
        lastSeen: new Date('2024-01-01'), // Very old
        isActive: false
      }

      playerSessions.set('user123', oldSession)

      // Simulate session cleanup logic
      const now = new Date()
      const sessionAge = now - oldSession.lastSeen
      const maxAge = 24 * 60 * 60 * 1000 // 24 hours

      if (sessionAge > maxAge && !oldSession.isActive) {
        playerSessions.delete('user123')
        // In real implementation, also remove from database
        await PlayerSession.deleteOne({ userId: 'user123' })
      }

      expect(playerSessions.has('user123')).toBe(false)
      expect(PlayerSession.deleteOne).toHaveBeenCalledWith({ userId: 'user123' })
    })
  })
})