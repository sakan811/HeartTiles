import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock modules before any imports
const mockNextAuth = vi.fn()
const mockCredentialsProvider = vi.fn()
const mockUser = {
  findOne: vi.fn(),
  comparePassword: vi.fn()
}

// Mock NextAuth
vi.mock('next-auth', () => ({
  default: mockNextAuth
}))

// Mock credentials provider
vi.mock('next-auth/providers/credentials', () => ({
  default: mockCredentialsProvider
}))

// Mock the models
vi.mock('../../../models', () => ({
  User: mockUser
}))

// Mock mongoose
vi.mock('mongoose', () => {
  const mockSchema = vi.fn().mockImplementation((schemaDefinition, options) => {
    const schema = {
      schemaDefinition,
      options,
      pre: vi.fn(),
      methods: {},
      statics: {}
    }
    return schema
  })

  mockSchema.Types = {
    Mixed: 'Mixed',
    ObjectId: 'ObjectId'
  }

  return {
    default: {
      connection: { readyState: 1 },
      connect: vi.fn(),
      Schema: mockSchema,
      models: {},
      model: vi.fn()
    },
    Schema: mockSchema
  }
})

describe('Auth Configuration Tests', () => {
  let capturedConfig = null
  let capturedAuthorize = null

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup NextAuth mock to capture configuration
    mockNextAuth.mockImplementation((config) => {
      capturedConfig = config
      return {
        handlers: { GET: vi.fn(), POST: vi.fn() },
        signIn: vi.fn(),
        signOut: vi.fn(),
        auth: vi.fn()
      }
    })

    // Setup credentials provider mock to capture authorize function
    mockCredentialsProvider.mockImplementation((config) => {
      capturedAuthorize = config.authorize
      return {
        ...config,
        type: 'credentials'
      }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('NextAuth Configuration', () => {
    it('should export NextAuth handlers and functions', async () => {
      const authModule = await import('../../src/auth')

      expect(authModule.handlers).toBeDefined()
      expect(authModule.signIn).toBeDefined()
      expect(authModule.signOut).toBeDefined()
      expect(authModule.auth).toBeDefined()

      expect(mockNextAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          providers: expect.any(Array),
          trustHost: true,
          session: { strategy: 'jwt' },
          pages: { signIn: '/auth/signin' },
          callbacks: expect.any(Object)
        })
      )
    })

    it('should configure credentials provider correctly', async () => {
      await import('../../src/auth')

      expect(mockCredentialsProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'credentials',
          credentials: {
            email: { label: 'Email', type: 'email' },
            password: { label: 'Password', type: 'password' }
          },
          authorize: expect.any(Function)
        })
      )
    })

    it('should have correct session configuration', async () => {
      await import('../../src/auth')

      expect(mockNextAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          session: { strategy: 'jwt' },
          trustHost: true,
          pages: { signIn: '/auth/signin' }
        })
      )
    })

    it('should configure JWT and session callbacks', async () => {
      await import('../../src/auth')

      expect(capturedConfig).toBeDefined()
      expect(capturedConfig.callbacks).toBeDefined()
      expect(typeof capturedConfig.callbacks.jwt).toBe('function')
      expect(typeof capturedConfig.callbacks.session).toBe('function')
    })
  })

  describe('Credentials Provider Authorization', () => {
    beforeEach(async () => {
      await import('../../src/auth')
    })

    it('should return null when credentials are missing', async () => {
      expect(capturedAuthorize).toBeDefined()

      const result1 = await capturedAuthorize({ email: null, password: null })
      expect(result1).toBeNull()

      const result2 = await capturedAuthorize({ email: 'test@example.com', password: null })
      expect(result2).toBeNull()

      const result3 = await capturedAuthorize({ email: null, password: 'password' })
      expect(result3).toBeNull()
    })

    it('should return null when user not found', async () => {
      mockUser.findOne.mockResolvedValue(null)

      const credentials = {
        email: 'nonexistent@example.com',
        password: 'password'
      }

      const result = await capturedAuthorize(credentials)
      expect(result).toBeNull()
      expect(mockUser.findOne).toHaveBeenCalledWith({ email: 'nonexistent@example.com' })
    })

    it('should return null when password is invalid', async () => {
      const mockUserInstance = {
        _id: '123',
        email: 'test@example.com',
        name: 'Test User',
        comparePassword: vi.fn().mockResolvedValue(false)
      }

      mockUser.findOne.mockResolvedValue(mockUserInstance)

      const credentials = {
        email: 'test@example.com',
        password: 'wrongpassword'
      }

      const result = await capturedAuthorize(credentials)
      expect(result).toBeNull()
      expect(mockUserInstance.comparePassword).toHaveBeenCalledWith('wrongpassword')
    })

    it('should return user object when credentials are valid', async () => {
      const mockUserInstance = {
        _id: '123',
        email: 'test@example.com',
        name: 'Test User',
        comparePassword: vi.fn().mockResolvedValue(true)
      }

      mockUser.findOne.mockResolvedValue(mockUserInstance)

      const credentials = {
        email: 'test@example.com',
        password: 'correctpassword'
      }

      const result = await capturedAuthorize(credentials)
      expect(result).toEqual({
        id: '123',
        email: 'test@example.com',
        name: 'Test User'
      })
      expect(mockUser.findOne).toHaveBeenCalledWith({ email: 'test@example.com' })
      expect(mockUserInstance.comparePassword).toHaveBeenCalledWith('correctpassword')
    })

    it('should handle database errors gracefully', async () => {
      mockUser.findOne.mockRejectedValue(new Error('Database connection failed'))

      const credentials = {
        email: 'test@example.com',
        password: 'password'
      }

      const result = await capturedAuthorize(credentials)
      expect(result).toBeNull()
    })

    it('should handle comparePassword errors gracefully', async () => {
      const mockUserInstance = {
        _id: '123',
        email: 'test@example.com',
        name: 'Test User',
        comparePassword: vi.fn().mockRejectedValue(new Error('Password comparison failed'))
      }

      mockUser.findOne.mockResolvedValue(mockUserInstance)

      const credentials = {
        email: 'test@example.com',
        password: 'password'
      }

      const result = await capturedAuthorize(credentials)
      expect(result).toBeNull()
    })
  })

  describe('JWT Callback', () => {
    beforeEach(async () => {
      await import('../../src/auth')
    })

    it('should add user ID to token when user is present', async () => {
      const token = { email: 'test@example.com' }
      const user = { id: '123', email: 'test@example.com', name: 'Test User' }

      const result = await capturedConfig.callbacks.jwt({ token, user })

      expect(result).toEqual({
        email: 'test@example.com',
        id: '123'
      })
    })

    it('should return existing token when user is not present', async () => {
      const token = { email: 'test@example.com', id: '123' }

      const result = await capturedConfig.callbacks.jwt({ token, user: null })

      expect(result).toEqual(token)
    })
  })

  describe('Session Callback', () => {
    beforeEach(async () => {
      await import('../../src/auth')
    })

    it('should add user ID to session when token is present', async () => {
      const session = { user: { name: 'Test User', email: 'test@example.com' } }
      const token = { id: '123', email: 'test@example.com' }

      const result = await capturedConfig.callbacks.session({ session, token })

      expect(result).toEqual({
        user: {
          name: 'Test User',
          email: 'test@example.com',
          id: '123'
        }
      })
    })

    it('should return existing session when token is not present', async () => {
      const session = { user: { name: 'Test User', email: 'test@example.com' } }

      const result = await capturedConfig.callbacks.session({ session, token: null })

      expect(result).toEqual(session)
    })
  })

  describe('Configuration Validation', () => {
    beforeEach(async () => {
      await import('../../src/auth')
    })

    it('should have correct providers configuration', () => {
      expect(capturedConfig.providers).toHaveLength(1)
      expect(capturedConfig.providers[0]).toHaveProperty('type', 'credentials')
      expect(capturedConfig.providers[0]).toHaveProperty('name', 'credentials')
    })

    it('should have correct pages configuration', () => {
      expect(capturedConfig.pages).toEqual({
        signIn: '/auth/signin'
      })
    })

    it('should have trustHost set to true', () => {
      expect(capturedConfig.trustHost).toBe(true)
    })

    it('should have JWT session strategy', () => {
      expect(capturedConfig.session).toEqual({
        strategy: 'jwt'
      })
    })
  })
})