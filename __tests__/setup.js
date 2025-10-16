import { vi } from 'vitest'
import React from 'react'
import { ShieldCard } from '../src/lib/cards.js'
import '@testing-library/jest-dom'

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

// Mock models before any imports that might use them
vi.mock('../models', () => ({
  User: {
    findById: vi.fn()
  },
  PlayerSession: {
    find: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn()
  },
  Room: {
    find: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn()
  }
}))

// Make React available globally for all tests
vi.stubGlobal('React', React)

// Set up environment variables for testing
process.env.NODE_ENV = 'test'
process.env.NEXTAUTH_SECRET = 'test-secret'
process.env.NEXTAUTH_URL = 'http://localhost:3000'
process.env.MONGODB_URI = 'mongodb://localhost:27017/test'

// Mock Next.js modules before any imports
vi.mock('next/server', () => ({
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
}))

// Mock NextAuth core modules
vi.mock('next-auth', () => ({
  default: vi.fn().mockImplementation((config) => ({
    handlers: { GET: vi.fn(), POST: vi.fn() },
    signIn: vi.fn(),
    signOut: vi.fn(),
    auth: vi.fn(),
  })),
}))

vi.mock('next-auth/providers/credentials', () => ({
  default: vi.fn().mockImplementation((config) => ({
    type: 'credentials',
    name: 'credentials',
    ...config,
  })),
}))

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
  }
})

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