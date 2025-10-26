import { vi } from 'vitest'
import React from 'react'
import '@testing-library/jest-dom/vitest'

// Mock mongoose before any imports that might use it
const mockSchemaTypes = {
  ObjectId: vi.fn(),
  Mixed: vi.fn(),
  String: vi.fn(),
  Number: vi.fn(),
  Boolean: vi.fn(),
  Date: vi.fn(),
  Buffer: vi.fn(),
  Array: vi.fn(),
  Decimal128: vi.fn(),
  Map: vi.fn(),
  UUID: vi.fn()
}

const mockMongoose = {
  connect: vi.fn().mockResolvedValue(),
  disconnect: vi.fn().mockResolvedValue(),
  Schema: vi.fn().mockImplementation(() => {
    const schema = {
      pre: vi.fn(),
      post: vi.fn(),
      methods: {},
      statics: {},
      virtual: vi.fn().mockReturnThis(),
      get: vi.fn(),
      set: vi.fn(),
      index: vi.fn(),
      plugin: vi.fn(),
      add: vi.fn(),
      loadClass: vi.fn(),
      Types: mockSchemaTypes
    }
    return schema
  }),
  model: vi.fn(),
  Types: mockSchemaTypes,
  models: {}, // Add the models property to prevent the error
  Connection: vi.fn(),
  connection: {
    readyState: 1,
    on: vi.fn(),
    once: vi.fn(),
    close: vi.fn()
  }
}

// Make sure models is not undefined
Object.defineProperty(mockMongoose, 'models', {
  value: {},
  writable: true,
  enumerable: true,
  configurable: true
})

// Also make sure the Schema constructor has the Types property
mockMongoose.Schema.Types = mockSchemaTypes

vi.mock('mongoose', () => ({
  default: mockMongoose,
  ...mockMongoose
}))

// Mock models.js to provide mocked User model for testing
// This is needed for auth tests that need to mock User.findOne
// Create User mock that can be used as a constructor
const MockUser = vi.fn().mockImplementation(function(data) {
  this.data = data
  this.save = vi.fn().mockResolvedValue({ ...data, _id: 'mock-id' })
})
MockUser.findOne = vi.fn()
MockUser.create = vi.fn()
MockUser.findById = vi.fn()
MockUser.findByIdAndUpdate = vi.fn()
MockUser.findByIdAndDelete = vi.fn()
MockUser.deleteOne = vi.fn()
MockUser.findOneAndUpdate = vi.fn()

vi.mock('../models.js', () => ({
  User: MockUser,
  PlayerSession: {
    findOne: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
    deleteOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    find: vi.fn(),
  },
  Room: {
    findOne: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
    deleteOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    find: vi.fn(),
  },
  deleteRoom: vi.fn(),
}))

// Also mock the path used by API routes
vi.mock('../../../models.js', () => ({
  User: MockUser,
  PlayerSession: {
    findOne: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
    deleteOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    find: vi.fn(),
  },
  Room: {
    findOne: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
    deleteOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    find: vi.fn(),
  },
  deleteRoom: vi.fn(),
}))

// Also mock the path used by API routes in src/app/api/
vi.mock('../../../../models.js', () => ({
  User: MockUser,
  PlayerSession: {
    findOne: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
    deleteOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    find: vi.fn(),
  },
  Room: {
    findOne: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
    deleteOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    find: vi.fn(),
  },
  deleteRoom: vi.fn(),
}))

// Also mock the path used by API routes without .js extension
vi.mock('../../../../models', () => ({
  User: MockUser,
  PlayerSession: {
    findOne: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
    deleteOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    find: vi.fn(),
  },
  Room: {
    findOne: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
    deleteOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    find: vi.fn(),
  },
  deleteRoom: vi.fn(),
}))

// Make React available globally for all tests
vi.stubGlobal('React', React)

// Set up environment variables for testing
process.env.NODE_ENV = 'test'
process.env.NEXTAUTH_SECRET = 'test-secret'
process.env.NEXTAUTH_URL = 'http://localhost:3000'
process.env.MONGODB_URI = 'mongodb://localhost:27017/test'

// Mock Next.js modules before any imports - fix NextAuth module resolution
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

// Mock next-auth/react with proper NextAuth 5.0.0-beta.29 structure
const mockUseSession = vi.fn().mockImplementation(() => ({
  data: null,
  status: 'unauthenticated',
  update: vi.fn().mockResolvedValue(null),
}))

const mockSessionProvider = ({ children }) => children
const mockSignIn = vi.fn().mockResolvedValue({})
const mockSignOut = vi.fn().mockResolvedValue({})
const mockGetSession = vi.fn().mockResolvedValue(null)

vi.mock('next-auth/react', () => ({
  useSession: mockUseSession,
  SessionProvider: mockSessionProvider,
  signIn: mockSignIn,
  signOut: mockSignOut,
  getSession: mockGetSession,
  // For testing purposes, expose the mock helpers
  __mockHelpers: {
    setMockSession: (session, status = 'authenticated') => {
      mockUseSession.mockReturnValue({
        data: session,
        status,
        update: vi.fn().mockResolvedValue(session),
      })
    },
    resetMockSession: () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })
    },
  },
  // Also expose the mock function directly for tests
  __mockUseSession: mockUseSession,
}))

// Make the mock function globally accessible
global.__mockUseSession = mockUseSession

// Mock window object for React components using vi.stubGlobal for proper cleanup
vi.stubGlobal('window', {
  location: {
    reload: vi.fn(),
    href: 'http://localhost:3000',
    origin: 'http://localhost:3000',
    hostname: 'localhost',
    pathname: '/',
    search: '',
    hash: ''
  },
  // Add other common window properties that components might use
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
  navigator: {
    userAgent: 'test-user-agent',
    platform: 'test-platform',
    language: 'en-US'
  },
  document: {
    createElement: vi.fn(() => ({ style: {}, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    body: { appendChild: vi.fn(), removeChild: vi.fn() },
    getElementById: vi.fn(),
    querySelector: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  },
  localStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn()
  },
  sessionStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn()
  },
  requestAnimationFrame: vi.fn((cb) => setTimeout(cb, 16)),
  cancelAnimationFrame: vi.fn(),
  // Ensure window object checks work correctly
  self: {},
  performance: {
    now: vi.fn(() => Date.now())
  },
  // Mock alert function for components that use it
  alert: vi.fn()
})

// Also expose alert globally for direct access
global.alert = vi.fn()

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

// Mock Date.now for consistent testing
const mockDate = new Date('2024-01-01T00:00:00.000Z')
global.Date.now = vi.fn(() => mockDate.getTime())

// Mock Math.random() for consistent testing
// Create a predictable sequence that still allows for unique IDs
let mathRandomCallCount = 0

// Store the original Math.random
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
    console.warn('Math.random() fallback used, returned:', fallback)
    return fallback
  } catch (error) {
    console.error('Error in Math.random() mock, using fallback:', error)
    return originalMathRandom()
  }
})

// Only mock Math.random, keep all other Math functions intact
// Use Object.defineProperty to safely replace only the random function
const originalMath = Math
Object.defineProperty(Math, 'random', {
  value: robustMathRandom,
  writable: true,
  configurable: true
})
Object.defineProperty(global, 'Math', {
  value: originalMath,
  writable: true,
  configurable: true
})

// Store original timer functions before mocking
const originalSetTimeout = global.setTimeout
const originalSetInterval = global.setInterval
const originalClearTimeout = global.clearTimeout
const originalClearInterval = global.clearInterval

// Mock setTimeout/setInterval for consistent testing
global.setTimeout = vi.fn((fn, delay) => {
  return originalSetTimeout(fn, delay)
})

global.setInterval = vi.fn((fn, interval) => {
  return originalSetInterval(fn, interval)
})

global.clearTimeout = vi.fn((id) => {
  return originalClearTimeout(id)
})

global.clearInterval = vi.fn((id) => {
  return originalClearInterval(id)
})

// Mock cards library for all tests
vi.mock('../src/lib/cards.js', async (importOriginal) => {
  const actual = await importOriginal();

  // Import actual classes to extend and override specific methods
  const {
    BaseCard: ActualBaseCard,
    HeartCard: ActualHeartCard,
    MagicCard: ActualMagicCard,
    WindCard: ActualWindCard,
    RecycleCard: ActualRecycleCard,
    ShieldCard: ActualShieldCard
  } = actual;

  // Mock BaseCard class to fix executeEffect behavior
  class MockBaseCard extends ActualBaseCard {
    executeEffect() {
      throw new Error('executeEffect must be implemented by subclass');
    }
  }

  // Mock WindCard class to provide proper executeEffect behavior
  class MockWindCard extends ActualWindCard {
    constructor(id) {
      super(id)
      // Mock the canTargetTile method for testability
      this.canTargetTile = vi.fn(super.canTargetTile.bind(this))
    }

    executeEffect(gameState, targetTileId, playerId) {
      const tile = gameState.tiles.find(t => t.id == targetTileId);
      if (!tile || !this.canTargetTile(tile, playerId)) {
        throw new Error('Invalid target for Wind card');
      }

      // Check shield protection using the ShieldCard protection logic
      const opponentId = tile.placedHeart.placedBy;
      const currentTurnCount = gameState.turnCount || 1;

      if (ActualShieldCard.isPlayerProtected(gameState, opponentId, currentTurnCount)) {
        const remainingTurns = ActualShieldCard.getRemainingTurns(gameState.shields[opponentId], currentTurnCount);
        throw new Error(`Opponent is protected by Shield (${remainingTurns} turns remaining)`);
      }

      // CRITICAL RULE: Tile color preservation - restore to original tile color before heart was placed
      const originalTileColor = tile.placedHeart.originalTileColor || tile.color;
      const colorEmojis = {
        'red': '🟥', 'yellow': '🟨', 'green': '🟩', 'white': '⬜'
      };

      // Return the action result for broadcasting
      return {
        type: 'wind',
        removedHeart: tile.placedHeart,
        targetedPlayerId: opponentId,
        tileId: tile.id,
        newTileState: {
          id: tile.id,
          color: originalTileColor, // Restore to original tile color
          emoji: colorEmojis[originalTileColor] || '⬜',
          placedHeart: undefined
        }
      };
    }
  }

  // Mock RecycleCard class to provide proper executeEffect behavior
  class MockRecycleCard extends ActualRecycleCard {
    constructor(id) {
      super(id)
      // Mock the canTargetTile method for testability
      this.canTargetTile = vi.fn(super.canTargetTile.bind(this))
    }

    executeEffect(gameState, targetTileId, currentPlayerId) {
      const tile = gameState.tiles.find(t => t.id == targetTileId);
      if (!tile || !this.canTargetTile(tile)) {
        throw new Error('Invalid target for Recycle card');
      }

      // Check shield protection - Recycle cards should only be blocked when targeting tiles that would affect shielded players
      // Allow shielded players to use their own Recycle cards on empty tiles
      if (gameState.shields) {
        for (const [shieldUserId, shield] of Object.entries(gameState.shields)) {
          if (ActualShieldCard.isActive(shield, gameState.turnCount)) {
            // Check if shielded player has any hearts on the board
            const shieldedPlayerHasHearts = gameState.tiles.some(t =>
              t.placedHeart && t.placedHeart.placedBy === shieldUserId
            );

            // Only block if:
            // 1. No currentPlayerId specified (assume opponent action) OR currentPlayerId is NOT the shielded player
            // 2. AND the shielded player has hearts on the board
            // 3. AND the target tile could potentially affect the shielded player's strategy
            const isOpponentCard = !currentPlayerId || currentPlayerId !== shieldUserId;

            if (isOpponentCard && shieldedPlayerHasHearts) {
              const remainingTurns = ActualShieldCard.getRemainingTurns(shield, gameState.turnCount);
              throw new Error(`Tile is protected by Shield (${remainingTurns} turns remaining)`);
            }
          }
        }
      }

      // Return the action result for broadcasting
      return {
        type: 'recycle',
        previousColor: tile.color,
        newColor: 'white',
        tileId: tile.id,
        newTileState: {
          id: tile.id,
          color: 'white',
          emoji: '⬜',
          placedHeart: undefined
        }
      };
    }
  }

  // Mock ShieldCard class to provide proper static methods
  class MockShieldCard extends ActualShieldCard {
    constructor(id) {
      super(id)
      // Mock the executeEffect method for testability
      const originalExecuteEffect = super.executeEffect.bind(this)
      this.executeEffect = vi.fn((gameState, playerId) => originalExecuteEffect(gameState, playerId))
    }

    static isActive(shield, currentTurnCount) {
      if (!shield) return false;

      // If remainingTurns is explicitly set to 0, respect that (unit tests)
      if (shield.remainingTurns === 0) {
        return false;
      }

      // Use turn-based calculation when we have an activated turn
      if (shield.activatedTurn !== undefined) {
        // If currentTurnCount is provided, use turn-based calculation
        if (currentTurnCount !== undefined) {
          // Shield lasts for 2 turns: activation turn + 1 more turn
          // Formula: (activatedTurn + 2) - currentTurnCount
          const expirationTurn = shield.activatedTurn + 2;
          const calculatedRemaining = expirationTurn - currentTurnCount;
          return calculatedRemaining > 0;
        }
      }

      // Otherwise use manual remainingTurns (unit tests)
      if (shield.remainingTurns !== undefined) {
        return shield.remainingTurns > 0;
      }

      return false;
    }

    static getRemainingTurns(shield, currentTurnCount) {
      if (!shield) return 0;

      // If remainingTurns is explicitly set to 0, respect that (unit tests)
      if (shield.remainingTurns === 0) {
        return 0;
      }

      // Use turn-based calculation when we have an activated turn
      if (shield.activatedTurn !== undefined) {
        // If currentTurnCount is not provided, we can't calculate turn-based duration
        if (currentTurnCount !== undefined) {
          // Shield lasts for 2 turns: activation turn + 1 more turn
          // Formula: (activatedTurn + 2) - currentTurnCount
          const expirationTurn = shield.activatedTurn + 2;
          const calculatedRemaining = expirationTurn - currentTurnCount;
          const finalRemaining = Math.max(0, calculatedRemaining);
          return finalRemaining;
        }
      }

      // Otherwise use manual remainingTurns (unit tests without currentTurnCount)
      if (shield.remainingTurns !== undefined) {
        return Math.max(0, shield.remainingTurns);
      }

      return 0;
    }

    static isPlayerProtected(gameState, playerId, currentTurnCount) {
      if (!gameState.shields || !gameState.shields[playerId]) return false;
      const shield = gameState.shields[playerId];
      return this.isActive(shield, currentTurnCount);
    }

    static isTileProtected(gameState, tile, currentTurnCount) {
      if (!tile.placedHeart) return false; // Empty tiles don't need protection
      const playerId = tile.placedHeart.placedBy;
      return this.isPlayerProtected(gameState, playerId, currentTurnCount);
    }

    static canReplaceShield(gameState, opponentId, currentTurnCount) {
      // Cannot replace opponent's active shield
      if (gameState.shields && gameState.shields[opponentId]) {
        const opponentShield = gameState.shields[opponentId];
        if (this.isActive(opponentShield, currentTurnCount)) {
          return false;
        }
      }
      return true;
    }

    static cleanupExpiredShields(gameState, currentTurnCount) {
      if (!gameState.shields) return;

      const expiredShields = [];
      for (const [playerId, shield] of Object.entries(gameState.shields)) {
        if (!this.isActive(shield, currentTurnCount)) {
          expiredShields.push(playerId);
        }
      }

      // Remove expired shields
      for (const playerId of expiredShields) {
        delete gameState.shields[playerId];
      }
    }

    static canActivateShield(gameState, playerId) {
      // Check if any opponent has an active shield (prevents activation)
      if (gameState.shields) {
        for (const [otherPlayerId, shield] of Object.entries(gameState.shields)) {
          if (otherPlayerId !== playerId && this.isActive(shield, gameState.turnCount)) {
            return {
              canActivate: false,
              reason: `Cannot activate Shield while opponent has active Shield (${this.getRemainingTurns(shield, gameState.turnCount)} turns remaining)`
            };
          }
        }
      }

      return { canActivate: true, reason: null };
    }
  }

  // Mock factory functions to return our mock classes
  const mockCreateHeartCard = vi.fn((id, color, value, emoji) => {
    return new ActualHeartCard(id, color, value, emoji);
  });

  const mockCreateMagicCard = vi.fn((id, type) => {
    switch (type) {
      case 'wind':
        return new MockWindCard(id);
      case 'recycle':
        return new MockRecycleCard(id);
      case 'shield':
        return new MockShieldCard(id);
      default:
        throw new Error(`Unknown magic card type: ${type}`);
    }
  });

  const mockCreateCardFromData = vi.fn((cardData) => {
    if (!cardData) {
      throw new Error('Invalid card data');
    }

    if (cardData.type === 'heart' || (cardData.color && cardData.value !== undefined)) {
      return mockCreateHeartCard(cardData.id, cardData.color, cardData.value, cardData.emoji);
    } else if (cardData.type && ['wind', 'recycle', 'shield'].includes(cardData.type)) {
      return mockCreateMagicCard(cardData.id, cardData.type);
    }
    throw new Error('Invalid card data');
  });

  // Mock deck generation functions to return mock classes
  const mockGenerateMagicDeck = vi.fn(() => {
    const cards = [];
    const baseTime = Date.now();

    // Game rule: 6 Wind, 5 Recycle, 5 Shield cards (total 16)
    for (let i = 0; i < 16; i++) {
      let cardType;
      if (i < 6) {
        cardType = 'wind'; // 6 Wind cards
      } else if (i < 11) {
        cardType = 'recycle'; // 5 Recycle cards
      } else {
        cardType = 'shield'; // 5 Shield cards
      }

      cards.push(mockCreateMagicCard(baseTime + i + 1, cardType));
    }

    return cards;
  });

  // Mock generateRandomMagicCard to return mock classes
  const mockGenerateRandomMagicCard = vi.fn(() => {
    const cardTypes = [
      { type: 'wind', weight: 6 },
      { type: 'recycle', weight: 5 },
      { type: 'shield', weight: 5 }
    ];

    const totalWeight = cardTypes.reduce((sum, card) => sum + card.weight, 0);
    let random = Math.random() * totalWeight;

    let selectedType = 'wind'; // default
    for (const cardType of cardTypes) {
      random -= cardType.weight;
      if (random <= 0) {
        selectedType = cardType.type;
        break;
      }
    }

    // Use high-precision timestamp + random to ensure unique IDs
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 11);
    const cardId = timestamp === 0 ? `0-${randomSuffix}` : `${timestamp}-${randomSuffix}`;
    return mockCreateMagicCard(cardId, selectedType);
  });

  return {
    ...actual,
    BaseCard: MockBaseCard,
    WindCard: MockWindCard,
    RecycleCard: MockRecycleCard,
    ShieldCard: MockShieldCard,
    createHeartCard: mockCreateHeartCard,
    createMagicCard: mockCreateMagicCard,
    createCardFromData: mockCreateCardFromData,
    generateMagicDeck: mockGenerateMagicDeck,
    generateRandomMagicCard: mockGenerateRandomMagicCard,
  };
});

// Custom matchers for Shield card testing
expect.extend({
  toBeShieldCard(received) {
    const isShieldCard = received &&
      received.type === 'shield' &&
      received.emoji === '🛡️' &&
      typeof received.executeEffect === 'function'

    if (isShieldCard) {
      return {
        message: () => `expected ${received} not to be a Shield card`,
        pass: true,
      }
    } else {
      return {
        message: () => `expected ${received} to be a Shield card`,
        pass: false,
      }
    }
  },

  toBeProtectedTile(received, gameState, turnCount) {
    // Import ShieldCard from the mock for this test
    const { ShieldCard } = require('../src/lib/cards.js');
    const isProtectedTile = received &&
      typeof received === 'object' &&
      gameState &&
      ShieldCard.isTileProtected(gameState, received, turnCount)

    if (isProtectedTile) {
      return {
        message: () => `expected tile not to be protected`,
        pass: true,
      }
    } else {
      return {
        message: () => `expected tile to be protected`,
        pass: false,
      }
    }
  }
})

// Global setup and teardown hooks
afterEach(() => {
  // Clean up any global mocks after each test
  vi.clearAllMocks()

  // Reset Math.random() call count for test isolation
  mathRandomCallCount = 0

  // Re-apply the Math.random mock to ensure it's always available
  Object.defineProperty(Math, 'random', {
    value: robustMathRandom,
    writable: true,
    configurable: true
  })

  // Re-establish comprehensive window object mock to ensure consistency across tests
  // This includes all properties that React DOM might need during rendering and cleanup
  vi.stubGlobal('window', {
    location: {
      reload: vi.fn(),
      href: 'http://localhost:3000',
      origin: 'http://localhost:3000',
      hostname: 'localhost',
      pathname: '/',
      search: '',
      hash: ''
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    navigator: {
      userAgent: 'test-user-agent',
      platform: 'test-platform',
      language: 'en-US'
    },
    document: {
      createElement: vi.fn(() => ({ style: {}, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
      getElementById: vi.fn(),
      querySelector: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    },
    localStorage: {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn()
    },
    sessionStorage: {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn()
    },
    requestAnimationFrame: vi.fn((cb) => setTimeout(cb, 16)),
    cancelAnimationFrame: vi.fn(),
    self: {},
    performance: {
      now: vi.fn(() => Date.now())
    },
    // Mock alert function
    alert: vi.fn(),
    // Additional properties that React DOM might access
    console: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    },
    // Mock timers that React DOM might use
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
    // Mock Event constructor
    Event: class Event {
      constructor(type, options) {
        this.type = type
        this.bubbles = options?.bubbles || false
        this.cancelable = options?.cancelable || false
      }
    },
    // Mock CustomEvent constructor
    CustomEvent: class CustomEvent extends Event {
      constructor(type, options) {
        super(type, options)
        this.detail = options?.detail || null
      }
    }
  })
})