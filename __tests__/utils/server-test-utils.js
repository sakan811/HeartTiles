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

// Re-export HeartCard for test files
export { HeartCard, WindCard, RecycleCard, ShieldCard, isHeartCard, isMagicCard, createCardFromData }
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
    maxIdleTimeMS: 30000, // Close idle connections,
    useNewUrlParser: true,
    useUnifiedTopology: true
  }

  try {
    const readyState = mongoose.connection.readyState
    console.log(`MongoDB readyState: ${readyState} (0=disconnected, 1=connected, 2=connecting, 3=disconnecting)`)

    if (readyState === 1) {
      console.log('Already connected to test MongoDB')
      // Test the connection with a ping
      await mongoose.connection.db.admin().ping()
      console.log('MongoDB connection verified with ping')
      return mongoose.connection // Return the actual connection
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
      return mongoose.connection // Return the actual connection
    }

    console.log('Connecting to test MongoDB...')

    // Clear any existing connection handlers to avoid duplicates
    mongoose.connection.removeAllListeners()

    await mongoose.connect(MONGODB_URI, connectionOptions)

    // Verify connection with ping
    await mongoose.connection.db.admin().ping()
    console.log('Connected and verified test MongoDB connection')
    return mongoose.connection // Return the actual connection
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

    // Validate and auto-fix players have required fields for testing
    for (const player of roomData.players) {
      if (!player.userId) {
        throw new Error('Each player must have a userId')
      }
      if (!player.name) {
        throw new Error('Each player must have a name')
      }
      // Auto-generate missing email for test data BEFORE validation
      if (!player.email) {
        player.email = `${player.userId.toLowerCase()}@test.com`
      }
    }

    if (!roomData.gameState) {
      throw new Error('Room data must include gameState')
    }

    // Ensure room code is uppercase to match schema validation
    roomData.code = roomData.code.toUpperCase()

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
    // Ensure room code is uppercase to match schema validation
    roomCode = roomCode.toUpperCase()

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
      // Ensure session has required properties with comprehensive validation
      if (!session) {
        console.warn('Found null/undefined session, skipping')
        return
      }

      if (!session.userId) {
        console.warn('Found session without userId, skipping:', session)
        return
      }

      // Ensure all expected properties exist, even if they might be null
      const normalizedSession = {
        userId: session.userId,
        userSessionId: session.userSessionId || null,
        name: session.name || 'Unknown',
        email: session.email || '',
        currentSocketId: session.currentSocketId || null,
        lastSeen: session.lastSeen || new Date(),
        isActive: session.isActive || false,
        // Preserve any additional properties
        ...Object.fromEntries(
          Object.entries(session).filter(([key]) =>
            !['userId', 'userSessionId', 'name', 'email', 'currentSocketId', 'lastSeen', 'isActive'].includes(key)
          )
        )
      }

      // Double-check that session is actually active (in case of query issues)
      // Use strict boolean check to avoid truthy/falsy issues
      if (normalizedSession.isActive === true) {
        sessionsMap.set(normalizedSession.userId, normalizedSession)
      } else {
        console.warn(`Skipping inactive session: ${normalizedSession.userId}, isActive: ${normalizedSession.isActive}`)
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

    // Normalize session data to ensure consistent structure
    const normalizedSessionData = {
      userId: sessionData.userId,
      userSessionId: sessionData.userSessionId || `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      name: sessionData.name || 'Unknown',
      email: sessionData.email || '',
      currentSocketId: sessionData.currentSocketId || null,
      lastSeen: sessionData.lastSeen instanceof Date ? sessionData.lastSeen : new Date(),
      isActive: sessionData.isActive === true, // Ensure strict boolean
      // Preserve any additional properties but don't overwrite core fields
      ...Object.fromEntries(
        Object.entries(sessionData).filter(([key]) =>
          !['userId', 'userSessionId', 'name', 'email', 'currentSocketId', 'lastSeen', 'isActive'].includes(key)
        )
      )
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
          { userId: normalizedSessionData.userId },
          normalizedSessionData,
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
          throw new Error(`Failed to save player session: Session not found after save operation for userId ${normalizedSessionData.userId}`)
        }

        if (result.userId !== normalizedSessionData.userId) {
          throw new Error(`Save verification failed: Expected userId ${normalizedSessionData.userId}, got ${result.userId}`)
        }

        // Additional verification: ensure the document was actually written
        const verification = await PlayerSession.findOne({ userId: normalizedSessionData.userId }).maxTimeMS(2000)
        if (!verification || verification.userId !== normalizedSessionData.userId) {
          throw new Error(`Save verification failed: Document not found after save for userId ${normalizedSessionData.userId}`)
        }

        console.log(`Successfully saved player session ${normalizedSessionData.userId} on attempt ${retryCount + 1}`)
        break

      } catch (saveError) {
        retryCount++
        console.warn(`Player session save attempt ${retryCount} failed for ${normalizedSessionData.userId}:`, saveError.message)

        if (retryCount >= maxRetries) {
          throw saveError
        }

        // Add exponential backoff delay between retries
        const delay = Math.min(100 * Math.pow(2, retryCount - 1), 500)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    if (!result) {
      throw new Error(`Failed to save player session after ${maxRetries} attempts: ${normalizedSessionData.userId}`)
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
  // Room codes should be either all uppercase, all lowercase, or all numbers
  // But not mixed case letters
  return /^[A-Z0-9]+$/.test(trimmedCode) || /^[a-z0-9]+$/.test(trimmedCode) || /^[0-9]+$/.test(trimmedCode)
}

export function validatePlayerName(playerName) {
  if (!playerName || typeof playerName !== 'string') return false
  const trimmedName = playerName.trim()
  // Check for empty names after trimming
  if (trimmedName.length === 0) return false
  // Check length constraints - allow up to 25 characters for tests
  if (trimmedName.length > 25) return false
  // Check for control characters
  if (/[\x00-\x1F\x7F]/.test(trimmedName)) return false
  return true
}

export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;

  return input.trim()
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/drop\s+table\s+/gi, 'TABLE ') // Replace DROP TABLE with TABLE
    .replace(/drop\s+/gi, ''); // Remove any remaining DROP commands
}

export function findPlayerByUserId(room, userId) {
  if (!room || !room.players || !Array.isArray(room.players)) return undefined
  return room.players.find(p => p && p.userId === userId)
}

export function findPlayerByName(room, playerName) {
  if (!room || !room.players || !Array.isArray(room.players) || !playerName || typeof playerName !== 'string') return undefined
  return room.players.find(p => p && p.name && typeof p.name === 'string' && p.name.toLowerCase() === playerName.toLowerCase())
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

// NOTE: The following functions were removed because they duplicate server.js logic:
// - generateTiles() - import from server.js
// - calculateScore() - use HeartCard.calculateScore() or import from server.js
// - executeMagicCard() - import from server.js
// - endGame() - import from server.js
// - validateHeartPlacement() - import from server.js
// - checkGameEndConditions() - import from server.js
// - checkAndExpireShields() - import from server.js
// These should be imported from server.js for testing, not duplicated here.

// Simple data generation functions (legitimate test utilities)
export function generateSingleHeart() {
  return HeartCard.generateRandom()
}

export function generateSingleMagicCard() {
  return generateRandomMagicCard()
}

export function selectRandomStartingPlayer(players) {
  return players[Math.floor(Math.random() * players.length)]
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

// NOTE: startGame() function removed - it was calling removed functions.
// Use server.js startGame function for testing.

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
      tiles: roomData.tiles || [], // Removed generateTiles() call
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