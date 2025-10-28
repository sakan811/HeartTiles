// Enhanced server test utilities with minimal mocking for realistic testing
import {
  HeartCard,
  WindCard,
  RecycleCard,
  ShieldCard,
  isHeartCard,
  isMagicCard,
  createCardFromData
} from '../../src/lib/cards.js'

// Import server functions instead of duplicating them
import {
  validateRoomCode,
  validatePlayerName,
  validateRoomState,
  validatePlayerInRoom,
  validateDeckState,
  validateTurn,
  validateCardDrawLimit,
  validateHeartPlacement,
  calculateScore,
  generateTiles,
  generateSingleHeart,
  generateSingleMagicCard,
  selectRandomStartingPlayer,
  recordHeartPlacement,
  recordMagicCardUsage,
  canPlaceMoreHearts,
  canUseMoreMagicCards,
  checkAndExpireShields,
  sanitizeInput,
  findPlayerByUserId,
  findPlayerByName,
  loadRooms,
  saveRoom,
  deleteRoom,
  loadPlayerSessions,
  savePlayerSession,
  recordCardDraw,
  resetPlayerActions,
  checkGameEndConditions,
  getClientIP,
  acquireTurnLock,
  releaseTurnLock,
  migratePlayerData
} from '../../server.js'

// Re-export HeartCard for test files
export { HeartCard, WindCard, RecycleCard, ShieldCard, isHeartCard, isMagicCard, createCardFromData }

// Re-export server functions for test files
export {
  validateRoomCode,
  validatePlayerName,
  validateRoomState,
  validatePlayerInRoom,
  validateDeckState,
  validateTurn,
  validateCardDrawLimit,
  validateHeartPlacement,
  calculateScore,
  generateTiles,
  generateSingleHeart,
  generateSingleMagicCard,
  selectRandomStartingPlayer,
  recordHeartPlacement,
  recordMagicCardUsage,
  canPlaceMoreHearts,
  canUseMoreMagicCards,
  checkAndExpireShields,
  sanitizeInput,
  findPlayerByUserId,
  findPlayerByName,
  recordCardDraw,
  resetPlayerActions,
  checkGameEndConditions,
  getClientIP,
  acquireTurnLock,
  releaseTurnLock,
  migratePlayerData,
  // Database functions
  loadRooms,
  saveRoom,
  deleteRoom,
  loadPlayerSessions,
  savePlayerSession
}

import { PlayerSession, Room, User } from '../../models.js'

// Test-friendly wrapper for authenticateSocket middleware
// This function replicates the authentication logic but returns a result object
// instead of calling a next() callback, making it easier to test
export async function authenticateSocket(socket, getTokenFunc, userModel) {
  try {
    const token = await getTokenFunc({
      req: socket.handshake,
      secret: process.env.AUTH_SECRET
    });

    if (!token?.id) {
      throw new Error('Authentication required');
    }

    const user = await userModel.findById(token.id);
    if (!user) {
      throw new Error('User not found');
    }

    // Set socket data like the original middleware
    socket.data.userId = token.id;
    socket.data.userEmail = user.email;
    socket.data.userName = user.name;
    socket.data.userSessionId = token.jti;

    // Return result object for testing instead of calling next()
    return {
      authenticated: true,
      user: user,
      token: token
    };
  } catch (error) {
    throw error; // Let the test handle the error
  }
}

// Test-friendly implementations for player session management
// These functions manage in-memory sessions using a Map for testing
export async function getPlayerSession(playerSessions, userId, userSessionId, userName, userEmail) {
  const existingSession = playerSessions.get(userId);

  if (existingSession) {
    // Update existing session
    existingSession.lastSeen = new Date();
    existingSession.isActive = true;
    return existingSession;
  } else {
    // Create new session
    const newSession = {
      userId,
      userSessionId,
      name: userName,
      email: userEmail,
      currentSocketId: null,
      lastSeen: new Date(),
      isActive: true
    };

    playerSessions.set(userId, newSession);
    return newSession;
  }
}

export async function updatePlayerSocket(playerSessions, userId, socketId, userSessionId, userName, userEmail) {
  let session = playerSessions.get(userId);

  if (!session) {
    // Create session if it doesn't exist
    session = await getPlayerSession(playerSessions, userId, userSessionId, userName, userEmail);
  }

  // Update socket information
  session.currentSocketId = socketId;
  session.lastSeen = new Date();
  session.isActive = true;

  return session;
}

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
  ensureTestEnvironment()

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
    maxIdleTimeMS: 30000 // Close idle connections
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

// NOTE: All validation and game state management functions now imported from server.js
// to avoid duplicating implementation and ensure tests use real logic.

// NOTE: The following functions were removed because they duplicate server.js logic:
// - generateTiles() - import from server.js
// - calculateScore() - use HeartCard.calculateScore() or import from server.js
// - executeMagicCard() - import from server.js
// - endGame() - import from server.js
// - validateHeartPlacement() - import from server.js
// - checkGameEndConditions() - import from server.js
// - checkAndExpireShields() - import from server.js
// These should be imported from server.js for testing, not duplicated here.

// Simple data generation functions now imported from server.js

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