// Integration test setup for server testing
import { vi } from 'vitest'

// Important: Unmock mongoose to use real database for integration tests
vi.unmock('mongoose')

// Import mongoose after unmocking
import mongoose from 'mongoose'
import {
  connectToDatabase,
  disconnectDatabase,
  clearDatabase,
  clearTurnLocks
} from '../utils/server-test-utils.js'

// Mock Next.js modules for integration tests
vi.mock('next/server', () => ({
  NextRequest: vi.fn(),
  NextResponse: {
    json: vi.fn(),
    redirect: vi.fn(),
    next: vi.fn(),
  },
}))

// Mock NextAuth
vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn(),
}))

// Note: Socket.IO is not mocked here because we need real Socket.IO functionality for integration tests

// Set up environment variables for integration testing
process.env.NODE_ENV = 'test'
process.env.NEXTAUTH_SECRET = 'test-secret-nextauth'
process.env.NEXTAUTH_URL = 'http://localhost:3000'
process.env.AUTH_SECRET = 'test-secret-auth'
process.env.MONGODB_URI = `mongodb://root:example@localhost:27017/heart-tiles-integration-test-${Date.now()}?authSource=admin`

// Global test hooks
beforeAll(async () => {
  try {
    // Connect to test database
    await connectToDatabase()
    console.log('Integration test database connected')
  } catch (error) {
    console.warn('Failed to connect to test database, skipping integration tests:', error.message)
    // Don't fail the test suite if MongoDB is not available
  }
})

afterAll(async () => {
  try {
    // Disconnect from test database
    await disconnectDatabase()
    console.log('Integration test database disconnected')
  } catch (error) {
    console.warn('Failed to disconnect from test database:', error.message)
  }
})

beforeEach(async () => {
  try {
    // Clear database before each test
    await clearDatabase()

    // Clear turn locks
    clearTurnLocks()

    // Clear all mocks
    vi.clearAllMocks()
  } catch (error) {
    console.warn('Failed to clear database in beforeEach:', error.message)
    // Don't fail tests if database operations fail
  }
})

afterEach(async () => {
  try {
    // Clear database after each test
    await clearDatabase()

    // Clear turn locks
    clearTurnLocks()

    // Reset all mocks
    vi.restoreAllMocks()
  } catch (error) {
    console.warn('Failed to clear database in afterEach:', error.message)
  }
})

// Helper function to create mock socket for testing
export function createMockSocket(userId = 'test-user-1', userName = 'Test User', userEmail = 'test@example.com') {
  return {
    id: `socket-${userId}`,
    data: {
      userId,
      userName,
      userEmail,
      userSessionId: `session-${userId}`,
      roomCode: null
    },
    handshake: {
      address: '127.0.0.1'
    },
    conn: {
      remoteAddress: '127.0.0.1'
    },
    join: vi.fn(),
    leave: vi.fn(),
    emit: vi.fn(),
    on: vi.fn(),
    disconnect: vi.fn(),
    to: vi.fn(() => ({
      emit: vi.fn()
    }))
  }
}

// Helper function to create mock user
export function createMockUser(userId = 'test-user-1', userName = 'Test User', userEmail = 'test@example.com') {
  return {
    _id: userId,
    id: userId,
    name: userName,
    email: userEmail,
    createdAt: new Date(),
    updatedAt: new Date()
  }
}

// Helper function to create mock room
export function createMockRoom(roomCode = 'TEST01') {
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

// Helper function to create mock game state
export function createMockGameState() {
  return {
    tiles: [
      { id: 0, color: "red", emoji: "🟥" },
      { id: 1, color: "yellow", emoji: "🟨" },
      { id: 2, color: "green", emoji: "🟩" },
      { id: 3, color: "white", emoji: "⬜" }
    ],
    gameStarted: true,
    currentPlayer: { userId: 'player-1', name: 'Player 1' },
    deck: { emoji: "💌", cards: 10, type: 'hearts' },
    magicDeck: { emoji: "🔮", cards: 8, type: 'magic' },
    playerHands: {
      'player-1': [
        { id: 'heart-1', type: 'heart', color: 'red', value: 2, emoji: '❤️' },
        { id: 'magic-1', type: 'magic', magicType: 'wind', emoji: '💨' }
      ],
      'player-2': [
        { id: 'heart-2', type: 'heart', color: 'yellow', value: 1, emoji: '💛' },
        { id: 'magic-2', type: 'magic', magicType: 'shield', emoji: '🛡️' }
      ]
    },
    shields: {},
    turnCount: 1,
    playerActions: {
      'player-1': { drawnHeart: false, drawnMagic: false, heartsPlaced: 0, magicCardsUsed: 0 },
      'player-2': { drawnHeart: false, drawnMagic: false, heartsPlaced: 0, magicCardsUsed: 0 }
    }
  }
}

// Helper function to wait for async operations
export function waitForAsync(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Helper function to mock socket.io emit events
export function createMockEmit() {
  const events = []
  return {
    events,
    emit: vi.fn((event, data) => {
      events.push({ event, data })
      return Promise.resolve()
    }),
    getEvents: (eventType) => events.filter(e => e.event === eventType),
    getLastEvent: (eventType) => {
      const filtered = events.filter(e => e.event === eventType)
      return filtered[filtered.length - 1]
    },
    clear: () => events.length = 0
  }
}

// Test utilities
export const testUtils = {
  async expectNoError(promise) {
    let error = null
    try {
      await promise
    } catch (err) {
      error = err
    }
    expect(error).toBeNull()
  },

  async expectError(promise, expectedMessage) {
    let error = null
    try {
      await promise
    } catch (err) {
      error = err
    }
    expect(error).not.toBeNull()
    if (expectedMessage) {
      expect(error.message).toContain(expectedMessage)
    }
    return error
  },

  createRoomWithPlayers: (roomCode, players) => ({
    code: roomCode,
    players: players.map((p, i) => ({
      userId: `player-${i + 1}`,
      name: p,
      email: `${p.toLowerCase()}@test.com`,
      isReady: i === 0, // First player is ready
      score: 0,
      joinedAt: new Date()
    })),
    maxPlayers: 2,
    gameState: {
      tiles: [
        { id: 0, color: "red", emoji: "🟥" },
        { id: 1, color: "yellow", emoji: "🟨" }
      ],
      gameStarted: false,
      currentPlayer: null,
      deck: { emoji: "💌", cards: 16, type: 'hearts' },
      magicDeck: { emoji: "🔮", cards: 16, type: 'magic' },
      playerHands: {},
      shields: {},
      turnCount: 0,
      playerActions: {}
    }
  }),

  createStartedGame: (roomCode, players) => {
    const room = testUtils.createRoomWithPlayers(roomCode, players)
    room.players.forEach(p => p.isReady = true)
    room.gameState.gameStarted = true
    room.gameState.currentPlayer = room.players[0]
    room.gameState.turnCount = 1
    room.gameState.playerHands = {
      'player-1': [
        { id: 'heart-1', type: 'heart', color: 'red', value: 2, emoji: '❤️' },
        { id: 'magic-1', type: 'magic', magicType: 'wind', emoji: '💨' }
      ],
      'player-2': [
        { id: 'heart-2', type: 'heart', color: 'yellow', value: 1, emoji: '💛' },
        { id: 'magic-2', type: 'magic', magicType: 'shield', emoji: '🛡️' }
      ]
    }
    return room
  }
}

console.log('Integration test setup loaded')