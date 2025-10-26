// Enhanced server test utilities with minimal mocking for realistic testing
import {
  HeartCard,
  WindCard,
  RecycleCard,
  ShieldCard,
  generateRandomMagicCard,
  isHeartCard,
  isMagicCard,
  createCardFromData
} from '../../src/lib/cards.js'
import { PlayerSession, Room, User } from '../../models.js'
import { getToken } from 'next-auth/jwt'

// Test environment utilities
export function ensureTestEnvironment() {
  if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'integration') {
    console.warn(`Warning: NODE_ENV is "${process.env.NODE_ENV}", should be "test" or "integration" for testing`)
  }
  return process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'integration'
}

// Database connection functions - real implementation for integration testing
export async function connectToDatabase() {
  // Ensure we're using test environment for integration tests
  const isTestEnvironment = ensureTestEnvironment()

  // Default to test database if not specified or in test environment
  // Add process-specific suffix to avoid conflicts when running in parallel
  const processId = process.pid || 0
  const testSuffix = process.env.VITEST_POOL_ID || processId
  const defaultTestUri = `mongodb://root:example@localhost:27017/heart-tiles-test-${testSuffix}?authSource=admin`
  const MONGODB_URI = process.env.MONGODB_URI || defaultTestUri

  const mongoose = await import('mongoose')

  // Log environment for debugging
  console.log(`Connecting to test MongoDB in ${process.env.NODE_ENV} environment`)

  // Enhanced connection options for test environment - optimized to prevent buffering timeouts
  const connectionOptions = {
    serverSelectionTimeoutMS: 10000, // Timeout for server selection
    bufferTimeoutMS: 3000, // Reduced buffer timeout to fail fast
    maxPoolSize: 3, // Smaller pool for test environment
    retryWrites: true,
    connectTimeoutMS: 8000, // Connection timeout
    socketTimeoutMS: 15000, // Socket timeout
    bufferCommands: false, // Disable command buffering
    // Add additional options for better error handling
    heartbeatFrequencyMS: 10000, // Keep connection alive
    maxIdleTimeMS: 30000, // Close idle connections
  }

  try {
    const readyState = mongoose.connection.readyState
    console.log(`MongoDB readyState: ${readyState} (0=disconnected, 1=connected, 2=connecting, 3=disconnecting)`)

    if (readyState === 1) {
      console.log('Already connected to test MongoDB')
      // Test the connection with a ping
      await mongoose.connection.db.admin().ping()
      console.log('MongoDB connection verified with ping')
      return
    }

    if (readyState === 2) {
      console.log('MongoDB connection in progress, waiting...')
      // Wait for connection to complete
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout during existing connection attempt'))
        }, 10000)

        mongoose.connection.once('connected', () => {
          clearTimeout(timeout)
          resolve()
        })
        mongoose.connection.once('error', (err) => {
          clearTimeout(timeout)
          reject(err)
        })
      })
      console.log('MongoDB connection completed')
      return
    }

    console.log('Connecting to test MongoDB...')

    // Clear any existing connection handlers to avoid duplicates
    mongoose.connection.removeAllListeners()

    await mongoose.connect(MONGODB_URI, connectionOptions)

    // Verify connection with ping
    await mongoose.connection.db.admin().ping()
    console.log('Connected and verified test MongoDB connection')
  } catch (error) {
    console.error('MongoDB connection failed:', error.message)
    // Ensure we're in a clean state
    try {
      await mongoose.disconnect()
    } catch (disconnectError) {
      console.warn('Error during cleanup disconnect:', disconnectError.message)
    }
    throw error
  }
}

export async function disconnectDatabase() {
  const mongoose = await import('mongoose')
  ensureTestEnvironment()

  try {
    const readyState = mongoose.connection.readyState
    console.log(`Disconnecting from MongoDB (readyState: ${readyState}) in ${process.env.NODE_ENV} environment`)

    if (readyState !== 0) {
      // Force close all connections to prevent hanging
      try {
        await mongoose.connection.close(true)
        console.log(`Disconnected from test MongoDB in ${process.env.NODE_ENV} environment`)
      } catch (e) {
        console.error('Error in mongoose.connection.close():', e);
      }
    } else {
      console.log('Already disconnected from test MongoDB')
    }
  } catch (err) {
    console.error('MongoDB disconnection failed:', err)
    // Don't throw error to avoid breaking test teardown
    try {
      await mongoose.disconnect()
    } catch (forceErr) {
      console.warn('Force disconnect also failed:', forceErr.message)
    }
  }
}

export async function clearDatabase() {
  const mongoose = await import('mongoose')
  ensureTestEnvironment()

  try {
    console.log('Clearing database...')
    await connectToDatabase()

    // Ensure we have a valid connection
    if (mongoose.connection.readyState !== 1) {
      console.warn('Database not connected, attempting to reconnect...')
      await connectToDatabase()
    }

    // Verify connection with a ping before clearing
    await mongoose.connection.db.admin().ping()

    // Add delay to ensure database is ready after connection and previous operations complete
    await new Promise(resolve => setTimeout(resolve, 200))

    // Force complete database clearing with drop() for thorough cleanup
    const db = mongoose.connection.db
    if (!db) {
      console.warn('Database connection not available, skipping clear')
      return
    }

    // Sequential clearing to avoid conflicts with retry logic
    const collections = ['rooms', 'playersessions', 'users']
    let clearedCount = 0

    for (const collectionName of collections) {
      let retryCount = 0
      const maxRetries = 3
      let cleared = false

      while (retryCount < maxRetries && !cleared) {
        try {
          console.log(`Dropping collection: ${collectionName} (attempt ${retryCount + 1})`)
          await db.dropCollection(collectionName)
          console.log(`Successfully dropped: ${collectionName}`)
          cleared = true
          clearedCount++
          break
        } catch (err) {
          retryCount++
          console.warn(`Drop attempt ${retryCount} failed for ${collectionName}:`, err.message)

          if (err.code === 26) {
            // Namespace not found - collection doesn't exist, which is fine
            console.log(`Collection ${collectionName} does not exist, skipping`)
            cleared = true
            clearedCount++
            break
          }

          if (retryCount >= maxRetries) {
            console.warn(`All drop attempts failed for ${collectionName}, trying fallback deleteMany`)
            // Fallback to deleteMany if drop fails
            try {
              const Model = collectionName === 'rooms' ? Room :
                            collectionName === 'playersessions' ? PlayerSession : User
              const result = await Model.deleteMany({}).maxTimeMS(5000)
              console.log(`Fallback deleteMany for ${collectionName}: deleted ${result.deletedCount} documents`)
              cleared = true
              clearedCount++
            } catch (deleteErr) {
              console.error(`Fallback deleteMany for ${collectionName} also failed:`, deleteErr.message)
            }
            break
          }

          // Add exponential backoff delay between retries
          const delay = Math.min(100 * Math.pow(2, retryCount - 1), 500)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }

      // Add delay between collections for better reliability
      if (cleared) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    // Verification step - ensure collections are actually empty
    if (clearedCount === collections.length) {
      console.log('Verifying all collections are empty...')
      let verificationPassed = true

      for (const collectionName of collections) {
        try {
          const count = await db.collection(collectionName).countDocuments()
          if (count > 0) {
            console.warn(`Collection ${collectionName} still has ${count} documents after clearing`)
            verificationPassed = false
          }
        } catch (err) {
          if (err.code !== 26) { // Ignore "namespace not found" errors
            console.warn(`Could not verify collection ${collectionName}:`, err.message)
          }
        }
      }

      if (verificationPassed) {
        console.log('All collections verified as empty')
      } else {
        console.warn('Some collections may still contain documents')
      }
    }

    // Final delay to ensure all operations complete
    await new Promise(resolve => setTimeout(resolve, 150))

    console.log(`Test database cleared in ${process.env.NODE_ENV} environment (${clearedCount}/${collections.length} collections cleared)`)
  } catch (err) {
    console.error('Failed to clear database:', err)
    // Don't throw error to avoid breaking tests
  }
}

// Room management functions - real implementation
export async function loadRooms() {
  try {
    // Ensure database connection before loading rooms
    const mongoose = await import('mongoose')
    if (mongoose.connection.readyState !== 1) {
      console.log('Database not connected, connecting before loading rooms...')
      await connectToDatabase()
    }

    // Add delay to ensure database is ready after connection and previous operations complete
    await new Promise(resolve => setTimeout(resolve, 150))

    // Verify connection with a ping before querying
    await mongoose.connection.db.admin().ping()

    // Add timeout to prevent hanging with retry logic
    let retryCount = 0
    const maxRetries = 3
    let rooms = []

    while (retryCount < maxRetries) {
      try {
        rooms = await Room.find({}).maxTimeMS(5000).exec()
        break
      } catch (findError) {
        retryCount++
        console.warn(`Room load attempt ${retryCount} failed:`, findError.message)

        if (retryCount >= maxRetries) {
          throw findError
        }

        // Add exponential backoff delay between retries
        const delay = Math.min(100 * Math.pow(2, retryCount - 1), 500)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    const roomsMap = new Map()

    rooms.forEach(room => {
      // Ensure room has required properties
      if (!room) {
        console.warn('Found null/undefined room, skipping')
        return
      }

      if (!room.code) {
        console.warn('Found room without code, skipping:', room)
        return
      }

      // Validate that required properties exist
      if (!room.players || !Array.isArray(room.players)) {
        console.warn('Found room without valid players array, skipping:', room.code)
        return
      }

      if (!room.gameState) {
        console.warn('Found room without gameState, skipping:', room.code)
        return
      }

      // Validate critical gameState properties
      if (typeof room.gameState.gameStarted !== 'boolean') {
        console.warn('Found room with invalid gameStarted state, skipping:', room.code)
        return
      }

      // Convert plain objects back to Maps for game logic
      if (room.gameState) {
        if (room.gameState.playerHands && typeof room.gameState.playerHands === 'object') {
          room.gameState.playerHands = new Map(Object.entries(room.gameState.playerHands))
        }
        if (room.gameState.shields && typeof room.gameState.shields === 'object') {
          room.gameState.shields = new Map(Object.entries(room.gameState.shields))
        }
        if (room.gameState.playerActions && typeof room.gameState.playerActions === 'object') {
          room.gameState.playerActions = new Map(Object.entries(room.gameState.playerActions))
        }
      }
      roomsMap.set(room.code, room)
    })

    console.log(`Loaded ${roomsMap.size} rooms from database (found ${rooms.length} total)`)

    // Final delay to ensure all operations are completed
    await new Promise(resolve => setTimeout(resolve, 50))

    return roomsMap
  } catch (err) {
    console.error('Failed to load rooms:', err)
    return new Map()
  }
}

export async function saveRoom(roomData) {
  try {
    // Ensure database connection before saving
    const mongoose = await import('mongoose')
    if (mongoose.connection.readyState !== 1) {
      console.log('Database not connected, connecting before saving room...')
      await connectToDatabase()
    }

    // Add delay to ensure database is ready after connection and previous operations complete
    await new Promise(resolve => setTimeout(resolve, 150))

    if (!roomData || !roomData.code) {
      throw new Error('Room data and code are required')
    }

    // Validate that required fields exist
    if (!roomData.players || !Array.isArray(roomData.players)) {
      throw new Error('Room data must include a valid players array')
    }

    if (!roomData.gameState) {
      throw new Error('Room data must include gameState')
    }

    // Convert Map objects to plain objects before deep copy to preserve data
    const roomDataCopy = { ...roomData }
    if (roomDataCopy.gameState) {
      if (roomDataCopy.gameState.playerHands instanceof Map) {
        roomDataCopy.gameState.playerHands = Object.fromEntries(roomDataCopy.gameState.playerHands)
      }
      if (roomDataCopy.gameState.shields instanceof Map) {
        roomDataCopy.gameState.shields = Object.fromEntries(roomDataCopy.gameState.shields)
      }
      if (roomDataCopy.gameState.playerActions instanceof Map) {
        roomDataCopy.gameState.playerActions = Object.fromEntries(roomDataCopy.gameState.playerActions)
      }
    }

    // Create a deep copy of the room data after Map conversion
    const roomDataToSave = JSON.parse(JSON.stringify(roomDataCopy))

    // Use findOneAndUpdate with atomic operation and comprehensive verification
    let retryCount = 0
    const maxRetries = 3
    let result = null

    while (retryCount < maxRetries && !result) {
      try {
        result = await Room.findOneAndUpdate(
          { code: roomData.code },
          roomDataToSave,
          {
            upsert: true,
            new: true,
            runValidators: false, // Disable strict validation for test flexibility
            maxTimeMS: 5000, // Add timeout to prevent hanging
            writeConcern: { w: 1, j: true } // Ensure write acknowledgment
          }
        )

        // Verify the save was successful
        if (!result) {
          throw new Error(`Failed to save room: Room not found after save operation for code ${roomData.code}`)
        }

        if (result.code !== roomData.code) {
          throw new Error(`Save verification failed: Expected room code ${roomData.code}, got ${result.code}`)
        }

        // Additional verification: ensure the document was actually written
        const verification = await Room.findOne({ code: roomData.code }).maxTimeMS(2000)
        if (!verification || verification.code !== roomData.code) {
          throw new Error(`Save verification failed: Document not found after save for code ${roomData.code}`)
        }

        console.log(`Successfully saved room ${roomData.code} on attempt ${retryCount + 1}`)
        break

      } catch (saveError) {
        retryCount++
        console.warn(`Room save attempt ${retryCount} failed for ${roomData.code}:`, saveError.message)

        if (retryCount >= maxRetries) {
          throw saveError
        }

        // Add exponential backoff delay between retries
        const delay = Math.min(100 * Math.pow(2, retryCount - 1), 500)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    if (!result) {
      throw new Error(`Failed to save room after ${maxRetries} attempts: ${roomData.code}`)
    }

    // Final delay to ensure MongoDB operation is fully committed
    await new Promise(resolve => setTimeout(resolve, 50))

    return result
  } catch (err) {
    console.error('Failed to save room:', err)
    throw err
  }
}

export async function deleteRoom(roomCode) {
  try {
    // Ensure database connection before deleting
    const mongoose = await import('mongoose')
    if (mongoose.connection.readyState !== 1) {
      console.log('Database not connected, connecting before deleting room...')
      await connectToDatabase()
    }

    // Add delay to ensure database is ready after connection and previous operations complete
    await new Promise(resolve => setTimeout(resolve, 150))

    if (!roomCode) {
      throw new Error('Room code is required for deletion')
    }

    // Verify the room exists before attempting deletion
    const existingRoom = await Room.findOne({ code: roomCode }).maxTimeMS(3000)
    if (!existingRoom) {
      console.log(`Room ${roomCode} does not exist, nothing to delete`)
      return
    }

    // Use deleteOne with write concern and verification
    let retryCount = 0
    const maxRetries = 3
    let deleted = false

    while (retryCount < maxRetries && !deleted) {
      try {
        const result = await Room.deleteOne(
          { code: roomCode },
          { writeConcern: { w: 1, j: true } }
        ).maxTimeMS(5000)

        if (result.deletedCount === 0) {
          throw new Error(`No room was deleted for code ${roomCode}`)
        }

        // Verify the deletion was successful
        const verification = await Room.findOne({ code: roomCode }).maxTimeMS(2000)
        if (verification) {
          throw new Error(`Room ${roomCode} still exists after deletion`)
        }

        console.log(`Successfully deleted room ${roomCode} on attempt ${retryCount + 1}`)
        deleted = true
        break

      } catch (deleteError) {
        retryCount++
        console.warn(`Room delete attempt ${retryCount} failed for ${roomCode}:`, deleteError.message)

        if (retryCount >= maxRetries) {
          throw deleteError
        }

        // Add exponential backoff delay between retries
        const delay = Math.min(100 * Math.pow(2, retryCount - 1), 500)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    if (!deleted) {
      throw new Error(`Failed to delete room after ${maxRetries} attempts: ${roomCode}`)
    }

    // Final delay to ensure MongoDB operation is fully committed
    await new Promise(resolve => setTimeout(resolve, 50))

  } catch (err) {
    console.error('Failed to delete room:', err)
    throw err
  }
}

// Player session functions - real implementation
export async function loadPlayerSessions() {
  try {
    // Ensure database connection before loading sessions
    const mongoose = await import('mongoose')
    if (mongoose.connection.readyState !== 1) {
      console.log('Database not connected, connecting before loading sessions...')
      await connectToDatabase()
    }

    // Add delay to ensure database is ready after connection and previous operations complete
    await new Promise(resolve => setTimeout(resolve, 150))

    // Verify connection with a ping before querying
    await mongoose.connection.db.admin().ping()

    // Add timeout with retry logic
    let retryCount = 0
    const maxRetries = 3
    let sessions = []

    while (retryCount < maxRetries) {
      try {
        sessions = await PlayerSession.find({ isActive: true }).maxTimeMS(5000).exec()
        break
      } catch (findError) {
        retryCount++
        console.warn(`Session load attempt ${retryCount} failed:`, findError.message)

        if (retryCount >= maxRetries) {
          throw findError
        }

        // Add exponential backoff delay between retries
        const delay = Math.min(100 * Math.pow(2, retryCount - 1), 500)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    const sessionsMap = new Map()

    sessions.forEach(session => {
      // Ensure session has required properties
      if (!session || !session.userId) {
        console.warn('Found session without userId, skipping:', session)
        return
      }

      // Double-check that session is actually active (in case of query issues)
      if (session.isActive === true) {
        sessionsMap.set(session.userId, session)
      } else {
        console.warn(`Skipping inactive session: ${session.userId}, isActive: ${session.isActive}`)
      }
    })

    console.log(`Loaded ${sessionsMap.size} active sessions from database (found ${sessions.length} total)`)

    // Final delay to ensure all operations are completed
    await new Promise(resolve => setTimeout(resolve, 50))

    return sessionsMap
  } catch (err) {
    console.error('Failed to load sessions:', err)
    return new Map()
  }
}

export async function savePlayerSession(sessionData) {
  try {
    // Validate input data
    if (!sessionData || !sessionData.userId) {
      throw new Error('Session data and userId are required')
    }

    // Ensure database connection before saving session
    const mongoose = await import('mongoose')
    if (mongoose.connection.readyState !== 1) {
      console.log('Database not connected, connecting before saving session...')
      await connectToDatabase()
    }

    // Add delay to ensure database is ready after connection and previous operations complete
    await new Promise(resolve => setTimeout(resolve, 150))

    // Use findOneAndUpdate with atomic operation and comprehensive verification
    let retryCount = 0
    const maxRetries = 3
    let result = null

    while (retryCount < maxRetries && !result) {
      try {
        result = await PlayerSession.findOneAndUpdate(
          { userId: sessionData.userId },
          sessionData,
          {
            upsert: true,
            new: true,
            runValidators: false, // Disable strict validation for test flexibility
            maxTimeMS: 5000, // Add timeout to prevent hanging
            writeConcern: { w: 1, j: true } // Ensure write acknowledgment
          }
        )

        // Verify the save was successful
        if (!result) {
          throw new Error(`Failed to save player session: Session not found after save operation for userId ${sessionData.userId}`)
        }

        if (result.userId !== sessionData.userId) {
          throw new Error(`Save verification failed: Expected userId ${sessionData.userId}, got ${result.userId}`)
        }

        // Additional verification: ensure the document was actually written
        const verification = await PlayerSession.findOne({ userId: sessionData.userId }).maxTimeMS(2000)
        if (!verification || verification.userId !== sessionData.userId) {
          throw new Error(`Save verification failed: Document not found after save for userId ${sessionData.userId}`)
        }

        console.log(`Successfully saved player session ${sessionData.userId} on attempt ${retryCount + 1}`)
        break

      } catch (saveError) {
        retryCount++
        console.warn(`Player session save attempt ${retryCount} failed for ${sessionData.userId}:`, saveError.message)

        if (retryCount >= maxRetries) {
          throw saveError
        }

        // Add exponential backoff delay between retries
        const delay = Math.min(100 * Math.pow(2, retryCount - 1), 500)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    if (!result) {
      throw new Error(`Failed to save player session after ${maxRetries} attempts: ${sessionData.userId}`)
    }

    // Final delay to ensure MongoDB operation is fully committed
    await new Promise(resolve => setTimeout(resolve, 50))

    return result
  } catch (err) {
    console.error('Failed to save player session:', err)
    throw err
  }
}

// Authentication utilities - real implementation with optional mocking
export async function authenticateSocket(socket, getTokenFn = getToken, UserModel = User) {
  ensureTestEnvironment()

  try {
    const token = await getTokenFn({
      req: socket.handshake,
      secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'test-secret'
    })

    if (!token?.id) {
      throw new Error('Authentication required')
    }

    const user = await UserModel.findById(token.id)
    if (!user) {
      throw new Error('User not found')
    }

    socket.data.userId = token.id
    socket.data.userEmail = user.email
    socket.data.userName = user.name
    socket.data.userSessionId = token.jti

    return { authenticated: true, user }
  } catch (error) {
    console.error('Socket authentication error:', error)
    throw error
  }
}

// Turn lock management - real implementation
let turnLocks = new Map()

export function acquireTurnLock(roomCode, userId) {
  const lockKey = `${roomCode}_${userId}`
  if (turnLocks.has(lockKey)) return false
  turnLocks.set(lockKey, Date.now())
  return true
}

export function releaseTurnLock(roomCode, userId) {
  turnLocks.delete(`${roomCode}_${userId}`)
}

export function clearTurnLocks() {
  turnLocks.clear()
}

// Connection pool management - real implementation
export function createConnectionPool() {
  return new Map()
}

export function canAcceptConnection(connectionPool, ip, maxConnections = 5) {
  return (connectionPool.get(ip) || 0) < maxConnections
}

export function incrementConnectionCount(connectionPool, ip) {
  connectionPool.set(ip, (connectionPool.get(ip) || 0) + 1)
}

export function decrementConnectionCount(connectionPool, ip) {
  const current = connectionPool.get(ip) || 0
  if (current > 0) connectionPool.set(ip, current - 1)
}

// Validation functions - real implementation (mirroring server.js)
export function validateRoomCode(roomCode) {
  if (!roomCode || typeof roomCode !== 'string') return false
  const trimmedCode = roomCode.trim()
  if (trimmedCode.length !== 6) return false
  // Room codes should be: 6 letters, 3 letters + 3 numbers, or 6 numbers
  return /^[A-Z]{6}$|^[a-z]{6}$|^[A-Z]{3}[0-9]{3}$|^[0-9]{6}|^[a-z]{3}[0-9]{3}$/.test(trimmedCode)
}

export function validatePlayerName(playerName) {
  if (!playerName || typeof playerName !== 'string') return false
  const trimmedName = playerName.trim()
  return trimmedName.length > 0 && trimmedName.length <= 20
}

export function sanitizeInput(input) {
  return typeof input === 'string' ? input.trim().replace(/[<>]/g, '') : input
}

export function findPlayerByUserId(room, userId) {
  return room.players.find(p => p.userId === userId)
}

export function findPlayerByName(room, playerName) {
  return room.players.find(p => p.name.toLowerCase() === playerName.toLowerCase())
}

export function validateRoomState(room) {
  if (!room) return { valid: false, error: "Room not found" }
  if (!room.players || !Array.isArray(room.players)) return { valid: false, error: "Invalid players state" }
  if (!room.gameState) return { valid: false, error: "Invalid game state" }
  if (room.gameState.gameStarted && !room.gameState.currentPlayer) {
    return { valid: false, error: "Game started but no current player" }
  }
  return { valid: true }
}

export function validatePlayerInRoom(room, userId) {
  const playerInRoom = room.players.find(p => p.userId === userId)
  return playerInRoom ? { valid: true } : { valid: false, error: "Player not in room" }
}

export function validateDeckState(room) {
  if (!room.gameState.deck) return { valid: false, error: "Invalid deck state" }
  if (typeof room.gameState.deck.cards !== 'number' || room.gameState.deck.cards < 0) {
    return { valid: false, error: "Invalid deck count" }
  }
  return { valid: true }
}

export function validateTurn(room, userId) {
  if (!room?.gameState.gameStarted) return { valid: false, error: "Game not started" }
  if (!room.gameState.currentPlayer || room.gameState.currentPlayer.userId !== userId) {
    return { valid: false, error: "Not your turn" }
  }
  return { valid: true }
}

export function validateCardDrawLimit(room, userId) {
  if (!room.gameState.playerActions) {
    room.gameState.playerActions = {}
  }

  const playerActions = room.gameState.playerActions[userId] || {
    drawnHeart: false,
    drawnMagic: false,
    heartsPlaced: 0,
    magicCardsUsed: 0
  }

  return { valid: true, currentActions: playerActions }
}

// Game state management - real implementation
export function recordCardDraw(room, userId, cardType) {
  if (!room.gameState.playerActions) {
    room.gameState.playerActions = {}
  }

  if (!room.gameState.playerActions[userId]) {
    room.gameState.playerActions[userId] = {
      drawnHeart: false,
      drawnMagic: false,
      heartsPlaced: 0,
      magicCardsUsed: 0
    }
  }

  if (cardType === 'heart') {
    room.gameState.playerActions[userId].drawnHeart = true
  } else if (cardType === 'magic') {
    room.gameState.playerActions[userId].drawnMagic = true
  }
}

export function resetPlayerActions(room, userId) {
  if (!room.gameState.playerActions) {
    room.gameState.playerActions = {}
  }
  room.gameState.playerActions[userId] = {
    drawnHeart: false,
    drawnMagic: false,
    heartsPlaced: 0,
    magicCardsUsed: 0
  }
}

export function checkGameEndConditions(room, allowDeckEmptyGracePeriod = true) {
  if (!room?.gameState?.gameStarted) return { shouldEnd: false, reason: null }

  // Condition 1: All tiles are filled
  const allTilesFilled = room.gameState.tiles.every(tile => tile.placedHeart)
  if (allTilesFilled) {
    return { shouldEnd: true, reason: "All tiles are filled" }
  }

  // Condition 2: Any deck is empty
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

export function checkAndExpireShields(room) {
  if (!room.gameState.shields) return

  // Decrement remaining turns for all active shields
  for (const [userId, shield] of Object.entries(room.gameState.shields)) {
    if (shield.remainingTurns > 0) {
      shield.remainingTurns--

      // Remove shield if it has expired
      if (shield.remainingTurns <= 0) {
        delete room.gameState.shields[userId]
      }
    }
  }
}

// Tile and card generation - real implementation
export function generateTiles() {
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

export function calculateScore(heart, tile) {
  // Check if heart has the calculateScore method (HeartCard instance)
  if (typeof heart.calculateScore === 'function') {
    return heart.calculateScore(tile)
  }
  // Fallback for plain objects
  if (tile.color === "white") return heart.value
  return heart.color === tile.color ? heart.value * 2 : 0
}

export function generateSingleHeart() {
  const heartCard = HeartCard.generateRandom()
  return heartCard
}

export function generateSingleMagicCard() {
  const magicCard = generateRandomMagicCard()
  return magicCard
}

export function selectRandomStartingPlayer(players) {
  return players[Math.floor(Math.random() * players.length)]
}

// Game action functions - real implementation
export function recordHeartPlacement(room, userId) {
  if (!room.gameState.playerActions) {
    room.gameState.playerActions = {}
  }

  if (!room.gameState.playerActions[userId]) {
    room.gameState.playerActions[userId] = {
      drawnHeart: false,
      drawnMagic: false,
      heartsPlaced: 0,
      magicCardsUsed: 0
    }
  }

  room.gameState.playerActions[userId].heartsPlaced = (room.gameState.playerActions[userId].heartsPlaced || 0) + 1
}

export function recordMagicCardUsage(room, userId) {
  if (!room.gameState.playerActions) {
    room.gameState.playerActions = {}
  }

  if (!room.gameState.playerActions[userId]) {
    room.gameState.playerActions[userId] = {
      drawnHeart: false,
      drawnMagic: false,
      heartsPlaced: 0,
      magicCardsUsed: 0
    }
  }

  room.gameState.playerActions[userId].magicCardsUsed = (room.gameState.playerActions[userId].magicCardsUsed || 0) + 1
}

export function canPlaceMoreHearts(room, userId) {
  const playerActions = room.gameState.playerActions[userId] || { heartsPlaced: 0 }
  return (playerActions.heartsPlaced || 0) < 2
}

export function canUseMoreMagicCards(room, userId) {
  const playerActions = room.gameState.playerActions[userId] || { magicCardsUsed: 0 }
  return (playerActions.magicCardsUsed || 0) < 1
}

export function validateHeartPlacement(room, userId, heartId, tileId) {
  const playerHand = room.gameState.playerHands[userId] || []
  const heart = playerHand.find(card => card.id === heartId)
  if (!heart) return { valid: false, error: "Card not in player's hand" }

  if (!isHeartCard(heart)) {
    return { valid: false, error: "Only heart cards can be placed on tiles" }
  }

  // Convert to HeartCard instance if needed
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

// Game end and scoring - real implementation
export async function endGame(room, roomCode, io, allowDeckEmptyGracePeriod = true) {
  const gameEndResult = checkGameEndConditions(room, allowDeckEmptyGracePeriod)
  if (!gameEndResult.shouldEnd) return false

  console.log(`Game ending in room ${roomCode}: ${gameEndResult.reason}`)

  // Determine winner based on scores
  const sortedPlayers = [...room.players].sort((a, b) => (b.score || 0) - (a.score || 0))
  const winner = sortedPlayers[0]
  const isTie = sortedPlayers.length > 1 && sortedPlayers[0].score === sortedPlayers[1].score

  const gameEndData = {
    reason: gameEndResult.reason,
    players: room.players.map(player => ({
      ...player,
      hand: room.gameState.playerHands[player.userId] || []
    })),
    winner: isTie ? null : winner,
    isTie: isTie,
    finalScores: room.players.map(player => ({
      userId: player.userId,
      name: player.name,
      score: player.score || 0
    }))
  }

  // Broadcast game over to all players
  if (io) {
    io.to(roomCode).emit("game-over", gameEndData)
  }

  // Mark game as ended
  room.gameState.gameStarted = false
  room.gameState.gameEnded = true
  room.gameState.endReason = gameEndResult.reason

  if (roomCode) {
    await saveRoom(room)
  }

  return true
}

// Player session utilities - real implementation
export async function getPlayerSession(playerSessions, userId, userSessionId, userName, userEmail) {
  let session = playerSessions.get(userId)

  if (!session) {
    const newSession = {
      userId, userSessionId, name: userName, email: userEmail,
      currentSocketId: null, lastSeen: new Date(), isActive: true
    }
    playerSessions.set(userId, newSession)
    await savePlayerSession(newSession)
    session = newSession
  } else {
    session.lastSeen = new Date()
    session.isActive = true
    await savePlayerSession(session)
  }

  return session
}

export async function updatePlayerSocket(playerSessions, userId, socketId, userSessionId, userName, userEmail) {
  const session = await getPlayerSession(playerSessions, userId, userSessionId, userName, userEmail)
  session.currentSocketId = socketId
  session.lastSeen = new Date()
  session.isActive = true
  await savePlayerSession(session)
  return session
}

// Migration utilities - real implementation
export async function migratePlayerData(room, oldUserId, newUserId, userName, userEmail) {
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

  if (room.gameState.playerHands[oldUserId]) {
    room.gameState.playerHands[newUserId] = room.gameState.playerHands[oldUserId]
    delete room.gameState.playerHands[oldUserId]
  }

  // Migrate shield state
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

  // Clean up turn locks
  for (const lockKey of turnLocks.keys()) {
    if (lockKey.includes(oldUserId)) turnLocks.delete(lockKey)
  }
}

// IP utilities - real implementation
export function getClientIP(socket) {
  return socket.handshake.address || socket.conn.remoteAddress || 'unknown'
}

// Magic card execution - real implementation
export async function executeMagicCard(room, userId, cardId, targetTileId) {
  const playerHand = room.gameState.playerHands[userId] || []
  const cardIndex = playerHand.findIndex(card => card.id === cardId)

  if (cardIndex === -1) {
    throw new Error("Magic card not found in your hand")
  }

  const card = playerHand[cardIndex]
  let actionResult = null

  // Convert plain object cards to instances if needed
  let magicCard = card
  if (!(card instanceof WindCard || card instanceof RecycleCard || card instanceof ShieldCard)) {
    magicCard = createCardFromData(card)
  }

  // Validate and execute based on card type
  if (magicCard.type === 'shield') {
    if (targetTileId && targetTileId !== 'self') {
      throw new Error("Shield cards don't target tiles")
    }

    if (room.gameState.currentPlayer.userId !== userId) {
      throw new Error("You can only use Shield cards on your own turn")
    }

    actionResult = magicCard.executeEffect(room.gameState, userId)
  } else {
    if (targetTileId === null || targetTileId === undefined || targetTileId === 'self') {
      throw new Error("Target tile is required for this card")
    }

    const tile = room.gameState.tiles.find(t => t.id == targetTileId)
    if (!tile) {
      throw new Error("Target tile not found")
    }

    if (magicCard.type === 'wind') {
      if (!magicCard.canTargetTile(tile, userId)) {
        throw new Error("Invalid target for Wind card - you can only target opponent's hearts")
      }

      // Check shield protection
      const opponentId = tile.placedHeart.placedBy
      const currentTurnCount = room.gameState.turnCount || 1
      if (room.gameState.shields && room.gameState.shields[opponentId]) {
        const shield = room.gameState.shields[opponentId]
        if (ShieldCard.isActive(shield, currentTurnCount)) {
          const remainingTurns = ShieldCard.getRemainingTurns(shield, currentTurnCount)
          throw new Error(`Opponent is protected by Shield (${remainingTurns} turns remaining)`)
        }
      }

      // Subtract score from opponent
      const placedHeart = tile.placedHeart
      if (placedHeart && placedHeart.score) {
        const playerIndex = room.players.findIndex(p => p.userId === placedHeart.placedBy)
        if (playerIndex !== -1) {
          room.players[playerIndex].score -= placedHeart.score
        }
      }

      actionResult = magicCard.executeEffect(room.gameState, targetTileId, userId)
      if (actionResult) {
        const tileIndex = room.gameState.tiles.findIndex(t => t.id == targetTileId)
        room.gameState.tiles[tileIndex] = actionResult.newTileState
      }
    } else if (magicCard.type === 'recycle') {
      if (!magicCard.canTargetTile(tile)) {
        throw new Error("Invalid target for Recycle card")
      }

      actionResult = magicCard.executeEffect(room.gameState, targetTileId, userId)
      if (actionResult) {
        const tileIndex = room.gameState.tiles.findIndex(t => t.id == targetTileId)
        room.gameState.tiles[tileIndex] = actionResult.newTileState
      }
    }
  }

  // Remove used card and record usage
  room.gameState.playerHands[userId].splice(cardIndex, 1)
  recordMagicCardUsage(room, userId)

  return actionResult
}

// Room creation utilities - real implementation
export function createDefaultRoom(roomCode) {
  return {
    code: roomCode,
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
}

export function startGame(room) {
  room.gameState.tiles = generateTiles()
  room.gameState.gameStarted = true
  room.gameState.deck.cards = 16
  room.gameState.magicDeck.cards = 16
  room.gameState.playerActions = {}

  // Deal initial cards
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

  return room
}

// Test helpers for creating realistic test data
export function createTestUser(userData = {}) {
  return {
    _id: userData._id || 'test-user-' + Math.random().toString(36).substring(2, 11),
    email: userData.email || 'test@example.com',
    name: userData.name || 'TestUser',
    ...userData
  }
}

export function createTestRoom(roomData = {}) {
  return {
    code: roomData.code || 'TEST123',
    players: roomData.players || [],
    maxPlayers: 2,
    gameState: {
      tiles: roomData.tiles || generateTiles(),
      gameStarted: roomData.gameStarted || false,
      currentPlayer: roomData.currentPlayer || null,
      deck: { emoji: "💌", cards: 16, type: 'hearts' },
      magicDeck: { emoji: "🔮", cards: 16, type: 'magic' },
      playerHands: roomData.playerHands || {},
      shields: roomData.shields || {},
      turnCount: roomData.turnCount || 0,
      playerActions: roomData.playerActions || {},
      ...roomData.gameState
    }
  }
}

export function createTestPlayer(playerData = {}) {
  return {
    userId: playerData.userId || 'player-' + Math.random().toString(36).substring(2, 11),
    name: playerData.name || 'TestPlayer',
    email: playerData.email || 'player@example.com',
    isReady: playerData.isReady || false,
    score: playerData.score || 0,
    joinedAt: new Date(),
    ...playerData
  }
}

// Performance monitoring utilities for tests
export function createPerformanceMonitor() {
  const metrics = new Map()

  return {
    startTimer(name) {
      metrics.set(name, process.hrtime.bigint())
    },

    endTimer(name) {
      const start = metrics.get(name)
      if (!start) return null

      const end = process.hrtime.bigint()
      const duration = Number(end - start) / 1000000 // Convert to milliseconds
      metrics.set(name + '_duration', duration)
      return duration
    },

    getMetric(name) {
      return metrics.get(name)
    },

    getAllMetrics() {
      return Object.fromEntries(metrics)
    },

    clear() {
      metrics.clear()
    }
  }
}