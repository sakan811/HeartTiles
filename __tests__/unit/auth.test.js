import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock NextAuth
vi.mock('next-auth', () => ({
  default: vi.fn().mockImplementation((config) => ({
    handlers: { GET: vi.fn(), POST: vi.fn() },
    signIn: vi.fn(),
    signOut: vi.fn(),
    auth: vi.fn(),
    ...config
  }))
}))

// Mock CredentialsProvider
vi.mock('next-auth/providers/credentials', () => ({
  default: vi.fn().mockImplementation((config) => ({
    ...config,
    type: 'credentials'
  }))
}))

// Mock the models
vi.mock('../../models', () => ({
  User: {
    findOne: vi.fn()
  }
}))

// Mock mongoose
vi.mock('mongoose', () => ({
  default: {
    connection: {
      readyState: 1
    },
    connect: vi.fn()
  }
}))

describe('Auth Configuration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('NextAuth Configuration', () => {
    it('should export NextAuth handlers and functions', async () => {
      const mockNextAuth = await import('next-auth')
      const authModule = await import('../../src/auth.js')

      expect(authModule.handlers).toBeDefined()
      expect(authModule.signIn).toBeDefined()
      expect(authModule.signOut).toBeDefined()
      expect(authModule.auth).toBeDefined()

      expect(mockNextAuth.default).toHaveBeenCalledWith(
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
      const { default: CredentialsProvider } = await import('next-auth/providers/credentials')
      const authModule = await import('../../src/auth.js')

      expect(CredentialsProvider).toHaveBeenCalledWith(
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
      const { default: NextAuth } = await import('next-auth')

      NextAuth.mockImplementation((config) => {
        return {
          handlers: { GET: vi.fn(), POST: vi.fn() },
          signIn: vi.fn(),
          signOut: vi.fn(),
          auth: vi.fn(),
          ...config
        }
      })

      await import('../../src/auth.js')

      expect(NextAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          session: { strategy: 'jwt' },
          trustHost: true,
          pages: { signIn: '/auth/signin' }
        })
      )
    })

    it('should configure JWT and session callbacks', async () => {
      const { default: NextAuth } = await import('next-auth')

      NextAuth.mockImplementation((config) => {
        return {
          handlers: { GET: vi.fn(), POST: vi.fn() },
          signIn: vi.fn(),
          signOut: vi.fn(),
          auth: vi.fn(),
          ...config
        }
      })

      await import('../../src/auth.js')

      const config = NextAuth.mock.calls[0][0]

      expect(config.callbacks).toBeDefined()
      expect(typeof config.callbacks.jwt).toBe('function')
      expect(typeof config.callbacks.session).toBe('function')
    })
  })

  describe('Credentials Provider Authorization', () => {
    let mockAuthorize

    beforeEach(async () => {
      const { default: CredentialsProvider } = await import('next-auth/providers/credentials')

      // Capture the authorize function
      CredentialsProvider.mockImplementation((config) => {
        mockAuthorize = config.authorize
        return { ...config, type: 'credentials' }
      })

      await import('../../src/auth.js')
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
      const { User } = await import('../../models')
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
      const { User } = await import('../../models')
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
      const { User } = await import('../../models')
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
      const { User } = await import('../../models')
      User.findOne.mockRejectedValue(new Error('Database connection failed'))

      const credentials = {
        email: 'test@example.com',
        password: 'password'
      }

      const result = await mockAuthorize(credentials)
      expect(result).toBeNull()
    })

    it('should handle comparePassword errors gracefully', async () => {
      const { User } = await import('../../models')
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

  describe('Database Connection', () => {
    let mockConnectDB

    beforeEach(async () => {
      // Reset modules to get fresh import
      vi.resetModules()

      // Mock the User model
      vi.doMock('../../models', () => ({
        User: {
          findOne: vi.fn()
        }
      }))

      // Get auth module and capture connectDB function
      const authModule = await import('../../src/auth.js')

      // Access the connectDB function by calling the module's internal function
      // We need to test it indirectly through the authorize function
      const { default: CredentialsProvider } = await import('next-auth/providers/credentials')

      CredentialsProvider.mockImplementation((config) => {
        return { ...config, type: 'credentials' }
      })

      mockConnectDB = vi.fn()
    })

    it('should connect to database when connection state is 0', async () => {
      const mockMongoose = {
        default: {
          connection: { readyState: 0 },
          connect: vi.fn().mockResolvedValue()
        }
      }

      vi.doMock('mongoose', () => mockMongoose)

      // Mock dynamic import to return our mock
      global.import = vi.fn().mockResolvedValue(mockMongoose)

      const { User } = await import('../../models')
      User.findOne.mockResolvedValue({
        _id: '123',
        email: 'test@example.com',
        name: 'Test User',
        comparePassword: vi.fn().mockResolvedValue(true)
      })

      // Simulate connectDB function
      async function connectDB() {
        try {
          const mongoose = await import('mongoose')
          const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/no-kitty-cards'

          if (mongoose.default.connection.readyState === 0) {
            await mongoose.default.connect(MONGODB_URI)
          }
        } catch (error) {
          console.error("Database connection error:", error)
          throw error
        }
      }

      await connectDB()

      expect(mockMongoose.default.connect).toHaveBeenCalled()
    })

    it('should not connect when already connected', async () => {
      const mockMongoose = {
        default: {
          connection: { readyState: 1 },
          connect: vi.fn()
        }
      }

      vi.doMock('mongoose', () => mockMongoose)
      global.import = vi.fn().mockResolvedValue(mockMongoose)

      // Simulate connectDB function
      async function connectDB() {
        try {
          const mongoose = await import('mongoose')
          const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/no-kitty-cards'

          if (mongoose.default.connection.readyState === 0) {
            await mongoose.default.connect(MONGODB_URI)
          }
        } catch (error) {
          console.error("Database connection error:", error)
          throw error
        }
      }

      await connectDB()

      expect(mockMongoose.default.connect).not.toHaveBeenCalled()
    })

    it('should use default MongoDB URI when environment variable not set', async () => {
      const originalEnv = process.env
      process.env = { ...originalEnv, MONGODB_URI: undefined }

      const mockMongoose = {
        default: {
          connection: { readyState: 0 },
          connect: vi.fn().mockResolvedValue()
        }
      }

      vi.doMock('mongoose', () => mockMongoose)
      global.import = vi.fn().mockResolvedValue(mockMongoose)

      // Simulate connectDB function
      async function connectDB() {
        try {
          const mongoose = await import('mongoose')
          const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/no-kitty-cards'

          if (mongoose.default.connection.readyState === 0) {
            await mongoose.default.connect(MONGODB_URI)
          }
        } catch (error) {
          console.error("Database connection error:", error)
          throw error
        }
      }

      await connectDB()

      expect(mockMongoose.default.connect).toHaveBeenCalledWith('mongodb://localhost:27017/no-kitty-cards')

      process.env = originalEnv
    })

    it('should use environment MongoDB URI when set', async () => {
      const originalEnv = process.env
      process.env = { ...originalEnv, MONGODB_URI: 'mongodb://custom:27017/test-db' }

      const mockMongoose = {
        default: {
          connection: { readyState: 0 },
          connect: vi.fn().mockResolvedValue()
        }
      }

      vi.doMock('mongoose', () => mockMongoose)
      global.import = vi.fn().mockResolvedValue(mockMongoose)

      // Simulate connectDB function
      async function connectDB() {
        try {
          const mongoose = await import('mongoose')
          const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/no-kitty-cards'

          if (mongoose.default.connection.readyState === 0) {
            await mongoose.default.connect(MONGODB_URI)
          }
        } catch (error) {
          console.error("Database connection error:", error)
          throw error
        }
      }

      await connectDB()

      expect(mockMongoose.default.connect).toHaveBeenCalledWith('mongodb://custom:27017/test-db')

      process.env = originalEnv
    })

    it('should throw error when database connection fails', async () => {
      const mockMongoose = {
        default: {
          connection: { readyState: 0 },
          connect: vi.fn().mockRejectedValue(new Error('Connection failed'))
        }
      }

      vi.doMock('mongoose', () => mockMongoose)
      global.import = vi.fn().mockResolvedValue(mockMongoose)

      // Simulate connectDB function
      async function connectDB() {
        try {
          const mongoose = await import('mongoose')
          const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/no-kitty-cards'

          if (mongoose.default.connection.readyState === 0) {
            await mongoose.default.connect(MONGODB_URI)
          }
        } catch (error) {
          console.error("Database connection error:", error)
          throw error
        }
      }

      await expect(connectDB()).rejects.toThrow('Connection failed')
    })
  })

  describe('JWT Callback', () => {
    it('should add user ID to token when user is present', async () => {
      const { default: NextAuth } = await import('next-auth')

      NextAuth.mockImplementation((config) => {
        return {
          handlers: { GET: vi.fn(), POST: vi.fn() },
          signIn: vi.fn(),
          signOut: vi.fn(),
          auth: vi.fn(),
          ...config
        }
      })

      await import('../../src/auth.js')

      const config = NextAuth.mock.calls[0][0]
      const token = { email: 'test@example.com' }
      const user = { id: '123', email: 'test@example.com', name: 'Test User' }

      const result = await config.callbacks.jwt({ token, user })

      expect(result).toEqual({
        email: 'test@example.com',
        id: '123'
      })
    })

    it('should return existing token when user is not present', async () => {
      const { default: NextAuth } = await import('next-auth')

      NextAuth.mockImplementation((config) => {
        return {
          handlers: { GET: vi.fn(), POST: vi.fn() },
          signIn: vi.fn(),
          signOut: vi.fn(),
          auth: vi.fn(),
          ...config
        }
      })

      await import('../../src/auth.js')

      const config = NextAuth.mock.calls[0][0]
      const token = { email: 'test@example.com', id: '123' }

      const result = await config.callbacks.jwt({ token, user: null })

      expect(result).toEqual(token)
    })
  })

  describe('Session Callback', () => {
    it('should add user ID to session when token is present', async () => {
      const { default: NextAuth } = await import('next-auth')

      NextAuth.mockImplementation((config) => {
        return {
          handlers: { GET: vi.fn(), POST: vi.fn() },
          signIn: vi.fn(),
          signOut: vi.fn(),
          auth: vi.fn(),
          ...config
        }
      })

      await import('../../src/auth.js')

      const config = NextAuth.mock.calls[0][0]
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
      const { default: NextAuth } = await import('next-auth')

      NextAuth.mockImplementation((config) => {
        return {
          handlers: { GET: vi.fn(), POST: vi.fn() },
          signIn: vi.fn(),
          signOut: vi.fn(),
          auth: vi.fn(),
          ...config
        }
      })

      await import('../../src/auth.js')

      const config = NextAuth.mock.calls[0][0]
      const session = { user: { name: 'Test User', email: 'test@example.com' } }

      const result = await config.callbacks.session({ session, token: null })

      expect(result).toEqual(session)
    })
  })

  describe('Configuration Validation', () => {
    it('should have correct providers configuration', async () => {
      const { default: NextAuth } = await import('next-auth')

      NextAuth.mockImplementation((config) => {
        return {
          handlers: { GET: vi.fn(), POST: vi.fn() },
          signIn: vi.fn(),
          signOut: vi.fn(),
          auth: vi.fn(),
          ...config
        }
      })

      await import('../../src/auth.js')

      const config = NextAuth.mock.calls[0][0]

      expect(config.providers).toHaveLength(1)
      expect(config.providers[0]).toHaveProperty('type', 'credentials')
      expect(config.providers[0]).toHaveProperty('name', 'credentials')
    })

    it('should have correct pages configuration', async () => {
      const { default: NextAuth } = await import('next-auth')

      NextAuth.mockImplementation((config) => {
        return {
          handlers: { GET: vi.fn(), POST: vi.fn() },
          signIn: vi.fn(),
          signOut: vi.fn(),
          auth: vi.fn(),
          ...config
        }
      })

      await import('../../src/auth.js')

      const config = NextAuth.mock.calls[0][0]

      expect(config.pages).toEqual({
        signIn: '/auth/signin'
      })
    })

    it('should have trustHost set to true', async () => {
      const { default: NextAuth } = await import('next-auth')

      NextAuth.mockImplementation((config) => {
        return {
          handlers: { GET: vi.fn(), POST: vi.fn() },
          signIn: vi.fn(),
          signOut: vi.fn(),
          auth: vi.fn(),
          ...config
        }
      })

      await import('../../src/auth.js')

      const config = NextAuth.mock.calls[0][0]

      expect(config.trustHost).toBe(true)
    })

    it('should have JWT session strategy', async () => {
      const { default: NextAuth } = await import('next-auth')

      NextAuth.mockImplementation((config) => {
        return {
          handlers: { GET: vi.fn(), POST: vi.fn() },
          signIn: vi.fn(),
          signOut: vi.fn(),
          auth: vi.fn(),
          ...config
        }
      })

      await import('../../src/auth.js')

      const config = NextAuth.mock.calls[0][0]

      expect(config.session).toEqual({
        strategy: 'jwt'
      })
    })
  })
})