import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the auth handlers
vi.mock('../../../../src/auth', () => ({
  handlers: {
    GET: vi.fn(),
    POST: vi.fn()
  }
}))

describe('NextAuth API Route Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should export GET and POST handlers from auth', async () => {
    const { handlers } = await import('../../../../src/auth.js')
    const routeModule = await import('../../../../src/app/api/auth/[...nextauth]/route.js')

    expect(routeModule.GET).toBeDefined()
    expect(routeModule.POST).toBeDefined()
    expect(routeModule.GET).toBe(handlers.GET)
    expect(routeModule.POST).toBe(handlers.POST)
  })

  it('should have correct handler exports', () => {
    const routeModule = require('../../../../src/app/api/auth/[...nextauth]/route.js')

    expect(typeof routeModule.GET).toBe('function')
    expect(typeof routeModule.POST).toBe('function')
  })
})