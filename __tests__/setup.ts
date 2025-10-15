import { vi } from 'vitest'
import React from 'react'
import { ShieldCard } from '../src/lib/cards'
import '@testing-library/jest-dom'

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
}) as any

global.setInterval = vi.fn((fn, interval) => {
  return originalSetInterval(fn, interval)
}) as any

global.clearTimeout = vi.fn((id) => {
  return originalClearTimeout(id)
}) as any

global.clearInterval = vi.fn((id) => {
  return originalClearInterval(id)
}) as any

// Setup test utilities
declare global {
  namespace Vi {
    interface JestAssertion<T = any> {
      toBeShieldCard(): T
      toBeProtectedTile(): T
    }
  }
}

// Custom matchers for Shield card testing
expect.extend({
  toBeShieldCard(received: any) {
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

  toBeProtectedTile(received: any, gameState: any, turnCount: any) {
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
      constructor(type: string, options?: any) {
        this.type = type
        this.bubbles = options?.bubbles || false
        this.cancelable = options?.cancelable || false
      }
      type: string
      bubbles: boolean
      cancelable: boolean
    } as any,
    // Mock CustomEvent constructor
    CustomEvent: class CustomEvent extends Event {
      constructor(type: string, options?: any) {
        super(type, options)
        this.detail = options?.detail || null
      }
      detail: any
    } as any
  })
})