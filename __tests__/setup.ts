import { vi } from 'vitest'
import { ShieldCard } from '../src/lib/cards'

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

// Mock setTimeout/setInterval for consistent testing
global.setTimeout = vi.fn((fn, delay) => {
  return setTimeout(fn, delay)
}) as any

global.setInterval = vi.fn((fn, interval) => {
  return setInterval(fn, interval)
}) as any

global.clearTimeout = vi.fn((id) => {
  clearTimeout(id)
}) as any

global.clearInterval = vi.fn((id) => {
  clearInterval(id)
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