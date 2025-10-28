// Integration test setup for server testing
import { vi } from 'vitest'
import dotenv from 'dotenv'

vi.mock('mongoose', async () => {
  const actual = await vi.importActual('mongoose')
  return actual
})

dotenv.config({ path: '.env.test' })

// Important: Unmock mongoose to use real database for integration tests
vi.unmock('mongoose');

// Mock Math.random() for consistent testing (same as main setup)
// Create a predictable sequence that still allows for unique IDs
let mathRandomCallCount = 0

// Store the original Math.random to ensure we can always fall back
const originalMathRandom = Math.random

// Create a robust Math.random mock that never returns undefined
const robustMathRandom = vi.fn(() => {
  try {
    // Return deterministic but varied values for different test scenarios
    // Using the golden ratio technique for better distribution and uniqueness
    const goldenRatio = 0.618033988749895
    const seed = 0.123456789
    const current = (seed + mathRandomCallCount * goldenRatio) % 1
    mathRandomCallCount++

    // Ensure we never return undefined or NaN
    if (typeof current === 'number' && !isNaN(current) && current >= 0 && current <= 1) {
      return current
    }

    // Fallback to original Math.random if something goes wrong
    const fallback = originalMathRandom()
    console.warn('Math.random() fallback used in integration tests, returned:', fallback)
    return fallback
  } catch (error) {
    console.error('Error in Math.random() mock in integration tests, using fallback:', error)
    return originalMathRandom()
  }
})

// Apply the mock to both global.Math and Math directly
global.Math.random = robustMathRandom
Math.random = robustMathRandom

// Mock Date.now for consistent testing
const mockDate = new Date('2024-01-01T00:00:00.000Z')
global.Date.now = vi.fn(() => mockDate.getTime())

// Import mongoose after unmocking
import mongoose from 'mongoose'
import {
  connectToDatabase,
  disconnectDatabase,
  clearDatabase,
  clearTurnLocks
} from '../utils/server-test-utils.js'

// Mock Next.js modules for integration tests - fix NextAuth module resolution
const mockNextServer = {
  NextRequest: vi.fn().mockImplementation((url, init) => ({
    url,
    method: init?.method || 'GET',
    headers: new Map(),
    json: vi.fn().mockResolvedValue({}),
    text: vi.fn().mockResolvedValue(''),
    body: init?.body,
  })),
  NextResponse: {
    json: vi.fn().mockImplementation((data, options = {}) => ({
      status: options.status || 200,
      json: vi.fn().mockResolvedValue(data),
      headers: new Map(),
    })),
    redirect: vi.fn().mockImplementation((url, options = {}) => ({
      status: options.status || 302,
      headers: new Map([['Location', url]]),
    })),
    next: vi.fn().mockImplementation(() => ({
      status: 200,
      headers: new Map(),
    })),
  },
}

vi.mock('next/server', () => mockNextServer)
vi.mock('next/dist/server', () => mockNextServer)

// Mock NextAuth core modules - fix module resolution issues
let storedAuthConfig = null

const createMockNextAuth = (config) => {
  // Store the actual configuration for testing purposes
  storedAuthConfig = config

  const mockAuth = {
    handlers: {
      GET: vi.fn().mockResolvedValue(new Response('OK')),
      POST: vi.fn().mockResolvedValue(new Response('OK'))
    },
    signIn: vi.fn().mockResolvedValue({ success: true }),
    signOut: vi.fn().mockResolvedValue({ success: true }),
    auth: vi.fn().mockResolvedValue(null),
  }

  // Store configuration for test access
  mockAuth.__innerConfig = config

  return mockAuth
}

vi.mock('next-auth', () => ({
  default: createMockNextAuth,
}))

// Export the stored config for test access
global.__storedAuthConfig = () => storedAuthConfig

vi.mock('next-auth/providers/credentials', () => ({
  default: vi.fn().mockImplementation((config) => ({
    type: 'credentials',
    name: 'credentials',
    ...config,
  })),
}))

// Mock NextAuth JWT
vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn(),
}))

// Note: bcryptjs is NOT mocked for integration tests to test real hashing behavior
// Only mock for unit tests, not integration tests

// NOTE: For integration tests, we need real models, not mocked ones
// The models will be imported directly for real database operations
// Only mock for unit tests, not integration tests





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
    code: roomCode.toUpperCase(),
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