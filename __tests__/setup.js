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
    close: vi.fn(),
    db: {
      admin: vi.fn().mockResolvedValue({
        ping: vi.fn().mockResolvedValue(true)
      })
    }
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

// Mock cards library for all tests - use real implementations with minimal mocking
vi.mock('../src/lib/cards.js', async (importOriginal) => {
  const actual = await importOriginal();

  // Wrap methods with vi.fn for testability but use real implementations
  const mockCreateHeartCard = vi.fn((id, color, value, emoji) => {
    return actual.createHeartCard(id, color, value, emoji);
  });

  const mockCreateMagicCard = vi.fn((id, type) => {
    return actual.createMagicCard(id, type);
  });

  const mockCreateCardFromData = vi.fn((cardData) => {
    return actual.createCardFromData(cardData);
  });

  const mockGenerateMagicDeck = vi.fn(() => {
    return actual.generateMagicDeck();
  });

  const mockGenerateRandomMagicCard = vi.fn(() => {
    return actual.generateRandomMagicCard();
  });

  // Wrap card classes' methods for testability while preserving real implementation
  const MockWindCard = class extends actual.WindCard {
    constructor(id) {
      super(id);
      this.canTargetTile = vi.fn(super.canTargetTile.bind(this));
      this.executeEffect = vi.fn(super.executeEffect.bind(this));
    }
  };

  const MockRecycleCard = class extends actual.RecycleCard {
    constructor(id) {
      super(id);
      this.canTargetTile = vi.fn(super.canTargetTile.bind(this));
      this.executeEffect = vi.fn(super.executeEffect.bind(this));
    }
  };

  const MockShieldCard = class extends actual.ShieldCard {
    constructor(id) {
      super(id);
      this.executeEffect = vi.fn(super.executeEffect.bind(this));
    }
  };

  return {
    ...actual,
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