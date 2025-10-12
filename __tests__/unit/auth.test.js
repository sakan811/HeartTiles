import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock NextAuth with proper structure for v5
const createNextAuthMock = () => {
  const mockImplementation = vi.fn().mockImplementation((config) => ({
    handlers: { GET: vi.fn(), POST: vi.fn() },
    signIn: vi.fn(),
    signOut: vi.fn(),
    auth: vi.fn(),
    ...config
  }))
  return mockImplementation
}

const createCredentialsProviderMock = () => {
  const mockImplementation = vi.fn().mockImplementation((config) => ({
    ...config,
    type: 'credentials'
  }))
  return mockImplementation
}

// Mock modules
vi.mock('next-auth', () => {
  const mockNextAuth = createNextAuthMock()
  return { default: mockNextAuth }
})

vi.mock('next-auth/providers/credentials', () => {
  const mockCredentialsProvider = createCredentialsProviderMock()
  return { default: mockCredentialsProvider }
})

// Mock the models
vi.mock('../../../models', () => ({
  User: {
    findOne: vi.fn()
  }
}))

// Mock bcrypt
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn()
  },
  hash: vi.fn(),
  compare: vi.fn()
}))

// Mock mongoose
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

vi.mock('mongoose', () => ({
  default: {
    connection: {
      readyState: 1
    },
    connect: vi.fn(),
    Schema: mockSchema,
    models: {
      User: {},
      PlayerSession: {},
      Room: {}
    },
    model: vi.fn()
  },
  Schema: mockSchema
}))

describe('Auth Configuration Tests', () => {
  let mockNextAuth, mockCredentialsProvider

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks()

    // Get fresh mock references
    const nextAuthModule = await import('next-auth')
    const credentialsModule = await import('next-auth/providers/credentials')

    mockNextAuth = nextAuthModule.default
    mockCredentialsProvider = credentialsModule.default

    // Reset implementations to defaults
    mockNextAuth.mockImplementation((config) => ({
      handlers: { GET: vi.fn(), POST: vi.fn() },
      signIn: vi.fn(),
      signOut: vi.fn(),
      auth: vi.fn(),
      ...config
    }))

    mockCredentialsProvider.mockImplementation((config) => ({
      ...config,
      type: 'credentials'
    }))
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

      const config = mockNextAuth.mock.calls[0][0]

      expect(config.callbacks).toBeDefined()
      expect(typeof config.callbacks.jwt).toBe('function')
      expect(typeof config.callbacks.session).toBe('function')
    })
  })

  describe('Credentials Provider Authorization', () => {
    let mockAuthorize

    beforeEach(async () => {
      // Reset and capture the authorize function
      mockCredentialsProvider.mockImplementation((config) => {
        mockAuthorize = config.authorize
        return { ...config, type: 'credentials' }
      })

      await import('../../src/auth')
    })

    it('should return null when credentials are missing', async () => {
      const result = await mockAuthorize({ email: null, password: null })
      expect(result).toBeNull()

      const result2 = await mockAuthorize({ email: 'test@example.com', password: null })
      expect(result2).toBeNull()

      const result3 = await mockAuthorize({ email: null, password: 'password' })
      expect(result3).toBeNull()
    })

    it('should return null when user not found', async () => {
      const { User } = await import('../../../models')
      User.findOne.mockResolvedValue(null)

      const credentials = {
        email: 'nonexistent@example.com',
        password: 'password'
      }

      const result = await mockAuthorize(credentials)
      expect(result).toBeNull()
      expect(User.findOne).toHaveBeenCalledWith({ email: 'nonexistent@example.com' })
    })

    it('should return null when password is invalid', async () => {
      const { User } = await import('../../../models')
      const mockUser = {
        _id: '123',
        email: 'test@example.com',
        name: 'Test User',
        comparePassword: vi.fn().mockResolvedValue(false)
      }

      User.findOne.mockResolvedValue(mockUser)

      const credentials = {
        email: 'test@example.com',
        password: 'wrongpassword'
      }

      const result = await mockAuthorize(credentials)
      expect(result).toBeNull()
      expect(mockUser.comparePassword).toHaveBeenCalledWith('wrongpassword')
    })

    it('should return user object when credentials are valid', async () => {
      const { User } = await import('../../../models')
      const mockUser = {
        _id: '123',
        email: 'test@example.com',
        name: 'Test User',
        comparePassword: vi.fn().mockResolvedValue(true)
      }

      User.findOne.mockResolvedValue(mockUser)

      const credentials = {
        email: 'test@example.com',
        password: 'correctpassword'
      }

      const result = await mockAuthorize(credentials)
      expect(result).toEqual({
        id: '123',
        email: 'test@example.com',
        name: 'Test User'
      })
      expect(User.findOne).toHaveBeenCalledWith({ email: 'test@example.com' })
      expect(mockUser.comparePassword).toHaveBeenCalledWith('correctpassword')
    })

    it('should handle database errors gracefully', async () => {
      const { User } = await import('../../../models')
      User.findOne.mockRejectedValue(new Error('Database connection failed'))

      const credentials = {
        email: 'test@example.com',
        password: 'password'
      }

      const result = await mockAuthorize(credentials)
      expect(result).toBeNull()
    })

    it('should handle comparePassword errors gracefully', async () => {
      const { User } = await import('../../../models')
      const mockUser = {
        _id: '123',
        email: 'test@example.com',
        name: 'Test User',
        comparePassword: vi.fn().mockRejectedValue(new Error('Password comparison failed'))
      }

      User.findOne.mockResolvedValue(mockUser)

      const credentials = {
        email: 'test@example.com',
        password: 'password'
      }

      const result = await mockAuthorize(credentials)
      expect(result).toBeNull()
    })
  })

  describe('JWT Callback', () => {
    beforeEach(async () => {
      await import('../../src/auth')
    })

    it('should add user ID to token when user is present', async () => {
      const config = mockNextAuth.mock.calls[0][0]
      const token = { email: 'test@example.com' }
      const user = { id: '123', email: 'test@example.com', name: 'Test User' }

      const result = await config.callbacks.jwt({ token, user })

      expect(result).toEqual({
        email: 'test@example.com',
        id: '123'
      })
    })

    it('should return existing token when user is not present', async () => {
      const config = mockNextAuth.mock.calls[0][0]
      const token = { email: 'test@example.com', id: '123' }

      const result = await config.callbacks.jwt({ token, user: null })

      expect(result).toEqual(token)
    })
  })

  describe('Session Callback', () => {
    beforeEach(async () => {
      await import('../../src/auth')
    })

    it('should add user ID to session when token is present', async () => {
      const config = mockNextAuth.mock.calls[0][0]
      const session = { user: { name: 'Test User', email: 'test@example.com' } }
      const token = { id: '123', email: 'test@example.com' }

      const result = await config.callbacks.session({ session, token })

      expect(result).toEqual({
        user: {
          name: 'Test User',
          email: 'test@example.com',
          id: '123'
        }
      })
    })

    it('should return existing session when token is not present', async () => {
      const config = mockNextAuth.mock.calls[0][0]
      const session = { user: { name: 'Test User', email: 'test@example.com' } }

      const result = await config.callbacks.session({ session, token: null })

      expect(result).toEqual(session)
    })
  })

  describe('Configuration Validation', () => {
    beforeEach(async () => {
      await import('../../src/auth')
    })

    it('should have correct providers configuration', async () => {
      const config = mockNextAuth.mock.calls[0][0]

      expect(config.providers).toHaveLength(1)
      expect(config.providers[0]).toHaveProperty('type', 'credentials')
      expect(config.providers[0]).toHaveProperty('name', 'credentials')
    })

    it('should have correct pages configuration', async () => {
      const config = mockNextAuth.mock.calls[0][0]

      expect(config.pages).toEqual({
        signIn: '/auth/signin'
      })
    })

    it('should have trustHost set to true', async () => {
      const config = mockNextAuth.mock.calls[0][0]

      expect(config.trustHost).toBe(true)
    })

    it('should have JWT session strategy', async () => {
      const config = mockNextAuth.mock.calls[0][0]

      expect(config.session).toEqual({
        strategy: 'jwt'
      })
    })
  })
})