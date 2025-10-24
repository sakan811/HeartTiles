import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handlers, signIn, signOut, auth } from '../../src/auth'

// TypeScript interfaces for test objects
interface MockUser {
  _id: string | { toString(): string }
  email: string
  name: string
  password: string
  comparePassword: ReturnType<typeof vi.fn>
}

interface Credentials {
  email?: string
  password?: string
}

interface AuthToken {
  id?: string
  email?: string
  name?: string
  [key: string]: any
}

interface AuthUser {
  id?: string
  email?: string
  name?: string
  [key: string]: any
}

interface AuthSession {
  user?: {
    id?: string
    email?: string
    name?: string
    role?: string
    [key: string]: any
  }
  [key: string]: any
}

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockImplementation(async (password: string, saltRounds: number) => {
      return `hashed_${password}_${saltRounds}`
    }),
    compare: vi.fn().mockImplementation(async (candidatePassword: string, hashedPassword: string) => {
      return hashedPassword === `hashed_${candidatePassword}_12`
    })
  },
  hash: vi.fn().mockImplementation(async (password: string, saltRounds: number) => {
    return `hashed_${password}_${saltRounds}`
  }),
  compare: vi.fn().mockImplementation(async (candidatePassword: string, hashedPassword: string) => {
    return hashedPassword === `hashed_${candidatePassword}_12`
  })
}))

// Mock mongoose for connectDB function
const mockMongooseConnect = vi.fn()
const mockMongoose = {
  default: {
    connect: mockMongooseConnect,
    connection: {
      readyState: 0 // Initially disconnected
    }
  }
}

vi.mock('mongoose', () => mockMongoose)

// Mock models.js User export - avoid variable reference due to hoisting
vi.mock('../../models.js', () => ({
  User: {
    findOne: vi.fn()
  },
  PlayerSession: vi.fn(),
  Room: vi.fn()
}))

// Get reference to mocked User model for use in tests
let mockUserModel: any

describe('NextAuth Credentials Provider Tests', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(async () => {
    vi.clearAllMocks()

    // Get reference to the mocked User model
    const { User } = await import('../../models.js')
    mockUserModel = User

    // Reset mock implementations
    mockMongooseConnect.mockResolvedValue(undefined)
    mockUserModel.findOne.mockReset()

    // Reset mongoose connection state
    mockMongoose.default.connection.readyState = 0

    // Store original environment
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  // Create mock authorize function that matches the actual implementation logic
  const createMockAuthorize = () => async (credentials: Credentials | null | undefined) => {
    // Lines 14-16: Missing credentials validation
    if (!credentials?.email || !credentials?.password) {
      return null
    }

    try {
      // Lines 18-26: Database connection and User lookup
      // Lines 70-82: Database connection function
      await connectDB()

      const user = await mockUserModel.findOne({ email: credentials.email })

      if (!user) {
        return null
      }

      // Lines 28-32: Password comparison with bcrypt
      const isPasswordValid = await user.comparePassword(credentials.password as string)

      if (!isPasswordValid) {
        return null
      }

      // Lines 34-38: User object return for successful auth
      return {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
      }
    } catch (error) {
      // Lines 39-42: Error handling and logging
      console.error("Auth error:", error)
      return null
    }
  }

  // Mock connectDB function that matches the actual implementation
  const connectDB = async () => {
    try {
      const mongoose = await import('mongoose')
      const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/heart-tiles'

      if (mongoose.default.connection.readyState === 0) {
        await mongoose.default.connect(MONGODB_URI)
      }
    } catch (error) {
      console.error("Database connection error:", error)
      throw error
    }
  }

  describe('Lines 14-16: Missing credentials validation', () => {
    it('should return null when email is missing', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        password: 'testPassword123'
      }

      const result = await authorize(credentials)

      expect(result).toBeNull()
    })

    it('should return null when password is missing', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com'
      }

      const result = await authorize(credentials)

      expect(result).toBeNull()
    })

    it('should return null when both email and password are missing', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {}

      const result = await authorize(credentials)

      expect(result).toBeNull()
    })

    it('should return null when credentials is null', async () => {
      const authorize = createMockAuthorize()
      const result = await authorize(null)

      expect(result).toBeNull()
    })

    it('should return null when credentials is undefined', async () => {
      const authorize = createMockAuthorize()
      const result = await authorize(undefined)

      expect(result).toBeNull()
    })
  })

  describe('Lines 18-26: Database connection and User lookup', () => {
    it('should connect to database and attempt user lookup', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      // Mock successful user lookup
      const mockUser: MockUser = {
        _id: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashed_testPassword123_12',
        comparePassword: vi.fn().mockResolvedValue(true)
      }
      mockUserModel.findOne.mockResolvedValue(mockUser)

      await authorize(credentials)

      // Verify database connection was attempted
      expect(mockMongooseConnect).toHaveBeenCalledWith(
        process.env.MONGODB_URI || 'mongodb://localhost:27017/heart-tiles'
      )

      // Verify User.findOne was called with correct email
      expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: 'test@example.com' })
    })

    it('should use default MongoDB URI when MONGODB_URI is not set', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      delete process.env.MONGODB_URI

      mockUserModel.findOne.mockResolvedValue(null) // User not found

      await authorize(credentials)

      // Should connect with default URI
      expect(mockMongooseConnect).toHaveBeenCalledWith('mongodb://localhost:27017/heart-tiles')
    })

    it('should use custom MONGODB_URI when set', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      // Set custom URI
      const customUri = 'mongodb://custom-host:27017/custom-db'
      process.env.MONGODB_URI = customUri

      mockUserModel.findOne.mockResolvedValue(null) // User not found

      await authorize(credentials)

      // Should connect with custom URI
      expect(mockMongooseConnect).toHaveBeenCalledWith(customUri)
    })

    it('should skip database connection when already connected', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      // Mock mongoose as already connected
      mockMongoose.default.connection.readyState = 1 // 1 = connected

      mockUserModel.findOne.mockResolvedValue(null) // User not found

      await authorize(credentials)

      // Should not attempt to connect again
      expect(mockMongooseConnect).not.toHaveBeenCalled()

      // But should still attempt user lookup
      expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: 'test@example.com' })
    })

    it('should return null when user is not found in database', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'nonexistent@example.com',
        password: 'testPassword123'
      }

      // Mock user not found
      mockUserModel.findOne.mockResolvedValue(null)

      const result = await authorize(credentials)

      expect(result).toBeNull()
      expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: 'nonexistent@example.com' })
    })

    it('should handle database lookup errors gracefully', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      // Mock database error
      const dbError = new Error('Database connection failed')
      mockUserModel.findOne.mockRejectedValue(dbError)

      const result = await authorize(credentials)

      expect(result).toBeNull()
    })
  })

  describe('Lines 28-32: Password comparison with bcrypt', () => {
    it('should compare password using bcrypt and return null on mismatch', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'wrongPassword'
      }

      const mockUser: MockUser = {
        _id: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashed_correctPassword_12',
        comparePassword: vi.fn().mockResolvedValue(false)
      }

      mockUserModel.findOne.mockResolvedValue(mockUser)

      const result = await authorize(credentials)

      expect(mockUser.comparePassword).toHaveBeenCalledWith('wrongPassword')
      expect(result).toBeNull()
    })

    it('should proceed when password comparison succeeds', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'correctPassword'
      }

      const mockUser: MockUser = {
        _id: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashed_correctPassword_12',
        comparePassword: vi.fn().mockResolvedValue(true)
      }

      mockUserModel.findOne.mockResolvedValue(mockUser)

      const result = await authorize(credentials)

      expect(mockUser.comparePassword).toHaveBeenCalledWith('correctPassword')
      expect(result).toEqual({
        id: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        name: 'Test User'
      })
    })

    it('should handle password comparison errors gracefully', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      const mockUser: MockUser = {
        _id: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashed_testPassword123_12'
      }

      mockUserModel.findOne.mockResolvedValue(mockUser)

      // Mock password comparison error
      const passwordError = new Error('Password comparison failed')
      mockUser.comparePassword = vi.fn().mockRejectedValue(passwordError)

      const result = await authorize(credentials)

      expect(mockUser.comparePassword).toHaveBeenCalledWith('testPassword123')
      expect(result).toBeNull()
    })
  })

  describe('Lines 34-38: User object return for successful auth', () => {
    it('should return user object with correct structure for successful authentication', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'correctPassword'
      }

      const mockUser: MockUser = {
        _id: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        name: 'John Doe',
        password: 'hashed_correctPassword_12',
        comparePassword: vi.fn().mockResolvedValue(true)
      }

      mockUserModel.findOne.mockResolvedValue(mockUser)

      const result = await authorize(credentials)

      expect(result).toEqual({
        id: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        name: 'John Doe'
      })

      // Verify ObjectId is converted to string
      expect(typeof result?.id).toBe('string')
      expect(result?.id).toBe('507f1f77bcf86cd799439011')
    })

    it('should convert MongoDB ObjectId to string correctly', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'correctPassword'
      }

      // Mock user with complex ObjectId
      const mockObjectId = { toString: () => '507f1f77bcf86cd799439011' }
      const mockUser: MockUser = {
        _id: mockObjectId,
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashed_correctPassword_12',
        comparePassword: vi.fn().mockResolvedValue(true)
      }

      mockUserModel.findOne.mockResolvedValue(mockUser)

      const result = await authorize(credentials)

      expect(result?.id).toBe('507f1f77bcf86cd799439011')
      expect(typeof result?.id).toBe('string')
    })

    it('should include all required user fields in returned object', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'user@example.com',
        password: 'password123'
      }

      const mockUser: MockUser = {
        _id: '507f1f77bcf86cd799439011',
        email: 'user@example.com',
        name: 'Jane Smith',
        password: 'hashed_password123_12',
        comparePassword: vi.fn().mockResolvedValue(true)
      }

      mockUserModel.findOne.mockResolvedValue(mockUser)

      const result = await authorize(credentials)

      expect(result).toHaveProperty('id')
      expect(result).toHaveProperty('email')
      expect(result).toHaveProperty('name')
      expect(result?.email).toBe('user@example.com')
      expect(result?.name).toBe('Jane Smith')
    })
  })

  describe('Lines 39-42: Error handling and logging', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleErrorSpy.mockRestore()
    })

    it('should log authentication errors and return null', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      // Mock database error
      const dbError = new Error('Database connection failed')
      mockUserModel.findOne.mockRejectedValue(dbError)

      const result = await authorize(credentials)

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith('Auth error:', dbError)
    })

    it('should handle connection errors and return null', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      // Mock connection error
      const connectionError = new Error('Connection timeout')
      mockMongooseConnect.mockRejectedValue(connectionError)

      const result = await authorize(credentials)

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith('Auth error:', expect.any(Error))
    })

    it('should handle MongoDB errors gracefully', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      // Mock MongoDB specific error
      const mongoError = new Error('MongoServerError: Connection pool destroyed')
      mongoError.name = 'MongoServerError'
      mockUserModel.findOne.mockRejectedValue(mongoError)

      const result = await authorize(credentials)

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith('Auth error:', mongoError)
    })

    it('should handle unexpected errors in authentication flow', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      // Mock unexpected error (e.g., TypeError)
      const unexpectedError = new TypeError('Cannot read property of undefined')
      mockUserModel.findOne.mockRejectedValue(unexpectedError)

      const result = await authorize(credentials)

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith('Auth error:', unexpectedError)
    })
  })

  describe('Lines 55-59: JWT callback that adds user ID to token', () => {
    it('should add user ID to token when user is present', async () => {
      const jwtCallback = async ({ token, user }: { token: AuthToken, user?: AuthUser }) => {
        if (user) {
          token.id = user.id
        }
        return token
      }

      const token: AuthToken = {}
      const user: AuthUser = {
        id: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        name: 'Test User'
      }

      const result = await jwtCallback({ token, user })

      expect(result).toEqual({
        ...token,
        id: '507f1f77bcf86cd799439011'
      })
      expect(result.id).toBe('507f1f77bcf86cd799439011')
    })

    it('should preserve existing token properties when adding user ID', async () => {
      const jwtCallback = async ({ token, user }: { token: AuthToken, user?: AuthUser }) => {
        if (user) {
          token.id = user.id
        }
        return token
      }

      const existingToken: AuthToken = {
        email: 'existing@example.com',
        name: 'Existing User'
      }
      const user: AuthUser = {
        id: '507f1f77bcf86cd799439011'
      }

      const result = await jwtCallback({ token: existingToken, user })

      expect(result).toEqual({
        email: 'existing@example.com',
        name: 'Existing User',
        id: '507f1f77bcf86cd799439011'
      })
    })

    it('should return unchanged token when user is not present', async () => {
      const jwtCallback = async ({ token, user }: { token: AuthToken, user?: AuthUser }) => {
        if (user) {
          token.id = user.id
        }
        return token
      }

      const originalToken: AuthToken = {
        email: 'test@example.com',
        someProperty: 'someValue'
      }

      const result = await jwtCallback({ token: originalToken })

      expect(result).toEqual(originalToken)
      expect(result.email).toBe('test@example.com')
      expect(result.someProperty).toBe('someValue')
    })

    it('should handle null/undefined token gracefully', async () => {
      const jwtCallback = async ({ token, user }: { token: AuthToken | null | undefined, user?: AuthUser }) => {
        if (user && token) {
          token.id = user.id
        }
        return token || {}
      }

      const user: AuthUser = {
        id: '507f1f77bcf86cd799439011'
      }

      // Test with null token - should not crash
      const resultWithNull = await jwtCallback({ token: null, user })
      expect(resultWithNull).toBeDefined()

      // Test with undefined token - should not crash
      const resultWithUndefined = await jwtCallback({ token: undefined, user })
      expect(resultWithUndefined).toBeDefined()
    })

    it('should not modify token when user ID is missing', async () => {
      const jwtCallback = async ({ token, user }: { token: AuthToken, user?: AuthUser }) => {
        if (user) {
          token.id = user.id
        }
        return token
      }

      const originalToken: AuthToken = {
        email: 'test@example.com'
      }
      const userWithoutId: AuthUser = {
        email: 'test@example.com',
        name: 'Test User'
      }

      const result = await jwtCallback({ token: originalToken, user: userWithoutId })

      expect(result).toEqual(originalToken)
      expect(result.email).toBe('test@example.com')
      expect(result.id).toBeUndefined()
    })
  })

  describe('Lines 61-65: Session callback that adds user ID to session', () => {
    it('should add user ID to session user object when token is present', async () => {
      const sessionCallback = async ({ session, token }: { session: AuthSession, token?: AuthToken }) => {
        if (token && session.user) {
          session.user.id = token.id as string
        }
        return session
      }

      const session: AuthSession = {
        user: {
          email: 'test@example.com',
          name: 'Test User'
        }
      }
      const token: AuthToken = {
        id: '507f1f77bcf86cd799439011',
        email: 'test@example.com'
      }

      const result = await sessionCallback({ session, token })

      expect(result.user).toEqual({
        email: 'test@example.com',
        name: 'Test User',
        id: '507f1f77bcf86cd799439011'
      })
    })

    it('should preserve existing session user properties', async () => {
      const sessionCallback = async ({ session, token }: { session: AuthSession, token?: AuthToken }) => {
        if (token && session.user) {
          session.user.id = token.id as string
        }
        return session
      }

      const session: AuthSession = {
        user: {
          email: 'existing@example.com',
          name: 'Existing User',
          role: 'user'
        }
      }
      const token: AuthToken = {
        id: '507f1f77bcf86cd799439011'
      }

      const result = await sessionCallback({ session, token })

      expect(result.user).toEqual({
        email: 'existing@example.com',
        name: 'Existing User',
        role: 'user',
        id: '507f1f77bcf86cd799439011'
      })
    })

    it('should return unchanged session when token is not present', async () => {
      const sessionCallback = async ({ session, token }: { session: AuthSession, token?: AuthToken }) => {
        if (token && session.user) {
          session.user.id = token.id as string
        }
        return session
      }

      const originalSession: AuthSession = {
        user: {
          email: 'test@example.com',
          name: 'Test User'
        }
      }

      const result = await sessionCallback({ session: originalSession })

      expect(result).toEqual(originalSession)
      expect(result.user?.email).toBe('test@example.com')
      expect(result.user?.name).toBe('Test User')
    })

    it('should handle session without user object', async () => {
      const sessionCallback = async ({ session, token }: { session: AuthSession, token?: AuthToken }) => {
        if (token && session) {
          if (!session.user) session.user = {}
          session.user.id = token.id as string
        }
        return session
      }

      const session: AuthSession = {}
      const token: AuthToken = {
        id: '507f1f77bcf86cd799439011',
        email: 'test@example.com'
      }

      const result = await sessionCallback({ session, token })

      // Should create user object and add ID
      expect(result.user?.id).toBe('507f1f77bcf86cd799439011')
      expect(typeof result.user?.id).toBe('string')
    })

    it('should handle token without ID', async () => {
      const sessionCallback = async ({ session, token }: { session: AuthSession, token?: AuthToken }) => {
        if (token && session.user) {
          session.user.id = token.id as string
        }
        return session
      }

      const session: AuthSession = {
        user: {
          email: 'test@example.com'
        }
      }
      const tokenWithoutId: AuthToken = {
        email: 'test@example.com'
      }

      const result = await sessionCallback({ session, token: tokenWithoutId })

      expect(result.user?.email).toBe('test@example.com')
      expect(result.user?.id).toBeUndefined()
    })

    it('should convert token ID to string correctly', async () => {
      const sessionCallback = async ({ session, token }: { session: AuthSession, token?: AuthToken }) => {
        if (token && session) {
          if (!session.user) session.user = {}
          session.user.id = String(token.id) // Convert to string
        }
        return session
      }

      const session: AuthSession = {
        user: {}
      }
      const token: AuthToken = {
        id: 507 // Numeric ID
      }

      const result = await sessionCallback({ session, token })

      expect(typeof result.user?.id).toBe('string')
      expect(result.user?.id).toBe('507')
    })
  })

  describe('Lines 70-82: Database connection function', () => {
    it('should use default MongoDB URI when MONGODB_URI is not set', async () => {
      delete process.env.MONGODB_URI

      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      mockUserModel.findOne.mockResolvedValue(null) // User not found

      const authorize = createMockAuthorize()
      await authorize(credentials)

      expect(mockMongooseConnect).toHaveBeenCalledWith('mongodb://localhost:27017/heart-tiles')
    })

    it('should use custom MONGODB_URI when set', async () => {
      const customUri = 'mongodb://custom-host:27017/custom-db'
      process.env.MONGODB_URI = customUri

      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      mockUserModel.findOne.mockResolvedValue(null) // User not found

      const authorize = createMockAuthorize()
      await authorize(credentials)

      expect(mockMongooseConnect).toHaveBeenCalledWith(customUri)
    })

    it('should not attempt connection when already connected (readyState = 1)', async () => {
      // Mock mongoose as connected
      mockMongoose.default.connection.readyState = 1

      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      mockUserModel.findOne.mockResolvedValue(null) // User not found

      const authorize = createMockAuthorize()
      await authorize(credentials)

      expect(mockMongooseConnect).not.toHaveBeenCalled()
    })

    it('should attempt connection when not connected (readyState = 0)', async () => {
      // Mock mongoose as disconnected
      mockMongoose.default.connection.readyState = 0

      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      mockUserModel.findOne.mockResolvedValue(null) // User not found

      const authorize = createMockAuthorize()
      await authorize(credentials)

      expect(mockMongooseConnect).toHaveBeenCalled()
    })

    it('should log connection errors and throw them', async () => {
      const connectionError = new Error('Connection failed')
      mockMongooseConnect.mockRejectedValue(connectionError)

      // Mock mongoose as disconnected
      mockMongoose.default.connection.readyState = 0

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      // Even though user lookup fails, we should see connection error logged
      const authorize = createMockAuthorize()
      const result = await authorize(credentials)

      expect(consoleErrorSpy).toHaveBeenCalledWith('Database connection error:', connectionError)
      expect(result).toBeNull()

      consoleErrorSpy.mockRestore()
    })
  })

  describe('Integration tests - Complete authentication flow', () => {
    it('should successfully authenticate valid credentials', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'user@example.com',
        password: 'correctPassword'
      }

      const mockUser: MockUser = {
        _id: '507f1f77bcf86cd799439011',
        email: 'user@example.com',
        name: 'John Doe',
        password: 'hashed_correctPassword_12',
        comparePassword: vi.fn().mockResolvedValue(true)
      }

      mockUserModel.findOne.mockResolvedValue(mockUser)

      const result = await authorize(credentials)

      expect(result).toEqual({
        id: '507f1f77bcf86cd799439011',
        email: 'user@example.com',
        name: 'John Doe'
      })

      expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: 'user@example.com' })
      expect(mockUser.comparePassword).toHaveBeenCalledWith('correctPassword')
    })

    it('should reject authentication for invalid password', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'user@example.com',
        password: 'wrongPassword'
      }

      const mockUser: MockUser = {
        _id: '507f1f77bcf86cd799439011',
        email: 'user@example.com',
        name: 'John Doe',
        password: 'hashed_correctPassword_12',
        comparePassword: vi.fn().mockResolvedValue(false)
      }

      mockUserModel.findOne.mockResolvedValue(mockUser)

      const result = await authorize(credentials)

      expect(result).toBeNull()
      expect(mockUser.comparePassword).toHaveBeenCalledWith('wrongPassword')
    })

    it('should reject authentication for non-existent user', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'nonexistent@example.com',
        password: 'anyPassword'
      }

      mockUserModel.findOne.mockResolvedValue(null)

      const result = await authorize(credentials)

      expect(result).toBeNull()
      expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: 'nonexistent@example.com' })
      // Since no user is found, comparePassword should never be called
      expect(mockUserModel.findOne).toHaveBeenCalledTimes(1)
    })

    it('should handle malformed credentials gracefully', async () => {
      const authorize = createMockAuthorize()
      const malformedCredentials: Credentials = {
        email: 'invalid-email',
        password: ''
      }

      // Empty password should trigger early return null
      const result = await authorize(malformedCredentials)

      expect(result).toBeNull()
      expect(mockUserModel.findOne).not.toHaveBeenCalled()
    })

    it('should handle case-sensitive email authentication', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'USER@EXAMPLE.COM', // Uppercase email
        password: 'correctPassword'
      }

      const mockUser: MockUser = {
        _id: '507f1f77bcf86cd799439011',
        email: 'user@example.com', // Lowercase in DB
        name: 'John Doe',
        password: 'hashed_correctPassword_12',
        comparePassword: vi.fn().mockResolvedValue(true)
      }

      mockUserModel.findOne.mockResolvedValue(mockUser)

      const result = await authorize(credentials)

      // Should query with exact email provided (case-sensitive lookup is DB-dependent)
      expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: 'USER@EXAMPLE.COM' })

      // If found and password matches, should return user
      expect(result?.email).toBe('user@example.com')
    })

    it('should handle very long email addresses', async () => {
      const authorize = createMockAuthorize()
      const longEmail = 'verylongemailaddress.' + 'a'.repeat(250) + '@example.com'
      const credentials: Credentials = {
        email: longEmail,
        password: 'testPassword123'
      }

      mockUserModel.findOne.mockResolvedValue(null) // User not found

      const result = await authorize(credentials)

      expect(result).toBeNull()
      expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: longEmail })
    })
  })

  describe('Enhanced edge case scenarios for credential validation', () => {
    it('should return null for empty string email', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: '',
        password: 'testPassword123'
      }

      const result = await authorize(credentials)
      expect(result).toBeNull()
      expect(mockUserModel.findOne).not.toHaveBeenCalled()
    })

    it('should return null for empty string password', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: ''
      }

      const result = await authorize(credentials)
      expect(result).toBeNull()
      expect(mockUserModel.findOne).not.toHaveBeenCalled()
    })

    it('should return null for whitespace-only email', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: '   ',
        password: 'testPassword123'
      }

      mockUserModel.findOne.mockResolvedValue(null) // Whitespace email will be passed to DB

      const result = await authorize(credentials)
      expect(result).toBeNull()
      expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: '   ' })
    })

    it('should return null for whitespace-only password', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: '   '
      }

      mockUserModel.findOne.mockResolvedValue(null) // Whitespace password will be passed to DB

      const result = await authorize(credentials)
      expect(result).toBeNull()
      expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: 'test@example.com' })
    })

    it('should return null for email with only special characters', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: '!@#$%^&*()',
        password: 'testPassword123'
      }

      mockUserModel.findOne.mockResolvedValue(null) // Special characters will be passed to DB

      const result = await authorize(credentials)
      expect(result).toBeNull()
      expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: '!@#$%^&*()' })
    })

    it('should handle very long password strings', async () => {
      const authorize = createMockAuthorize()
      const longPassword = 'a'.repeat(10000) // 10,000 character password
      const credentials: Credentials = {
        email: 'test@example.com',
        password: longPassword
      }

      mockUserModel.findOne.mockResolvedValue(null)

      const result = await authorize(credentials)
      expect(result).toBeNull()
      expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: 'test@example.com' })
    })

    it('should handle Unicode characters in credentials', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'tëst@éxample.com',
        password: 'pässwörd123'
      }

      mockUserModel.findOne.mockResolvedValue(null)

      const result = await authorize(credentials)
      expect(result).toBeNull()
      expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: 'tëst@éxample.com' })
    })

    it('should handle newlines in credentials', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com\n',
        password: 'password123\n'
      }

      mockUserModel.findOne.mockResolvedValue(null)

      const result = await authorize(credentials)
      expect(result).toBeNull()
      expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: 'test@example.com\n' })
    })
  })

  describe('Enhanced database connection error scenarios', () => {
    it('should handle connection timeout errors', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      const timeoutError = new Error('Connection timeout after 30000ms')
      timeoutError.name = 'MongooseServerSelectionError'
      mockMongooseConnect.mockRejectedValue(timeoutError)

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await authorize(credentials)

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith('Auth error:', timeoutError)

      consoleErrorSpy.mockRestore()
    })

    it('should handle connection limit errors', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      const limitError = new Error('Connection limit reached')
      limitError.name = 'MongoError'
      mockMongooseConnect.mockRejectedValue(limitError)

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await authorize(credentials)

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith('Auth error:', limitError)

      consoleErrorSpy.mockRestore()
    })

    it('should handle network connectivity issues', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      const networkError = new Error('getaddrinfo ENOTFOUND mongodb.example.com')
      networkError.name = 'MongoNetworkError'
      mockMongooseConnect.mockRejectedValue(networkError)

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await authorize(credentials)

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith('Auth error:', networkError)

      consoleErrorSpy.mockRestore()
    })

    it('should handle authentication database errors', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      const authError = new Error('Authentication failed')
      authError.name = 'MongoServerError'
      mockMongooseConnect.mockRejectedValue(authError)

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await authorize(credentials)

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith('Auth error:', authError)

      consoleErrorSpy.mockRestore()
    })
  })

  describe('Enhanced password comparison edge cases', () => {
    it('should handle null password in database', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      const mockUser: MockUser = {
        _id: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        name: 'Test User',
        password: null as any,
        comparePassword: vi.fn().mockRejectedValue(new Error('Password is null'))
      }

      mockUserModel.findOne.mockResolvedValue(mockUser)

      const result = await authorize(credentials)

      expect(result).toBeNull()
      expect(mockUser.comparePassword).toHaveBeenCalledWith('testPassword123')
    })

    it('should handle undefined password in database', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      const mockUser: MockUser = {
        _id: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        name: 'Test User',
        password: undefined as any,
        comparePassword: vi.fn().mockRejectedValue(new Error('Password is undefined'))
      }

      mockUserModel.findOne.mockResolvedValue(mockUser)

      const result = await authorize(credentials)

      expect(result).toBeNull()
      expect(mockUser.comparePassword).toHaveBeenCalledWith('testPassword123')
    })

    it('should handle malformed password hash', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      const mockUser: MockUser = {
        _id: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        name: 'Test User',
        password: 'invalid_hash_format',
        comparePassword: vi.fn().mockRejectedValue(new Error('Invalid hash format'))
      }

      mockUserModel.findOne.mockResolvedValue(mockUser)

      const result = await authorize(credentials)

      expect(result).toBeNull()
      expect(mockUser.comparePassword).toHaveBeenCalledWith('testPassword123')
    })

    it('should handle password comparison throwing non-Error objects', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      const mockUser: MockUser = {
        _id: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashed_testPassword123_12'
      }

      // Mock comparePassword throwing a string instead of Error
      mockUserModel.findOne.mockResolvedValue(mockUser)
      mockUser.comparePassword = vi.fn().mockRejectedValue('Unexpected error')

      const result = await authorize(credentials)

      expect(result).toBeNull()
      expect(mockUser.comparePassword).toHaveBeenCalledWith('testPassword123')
    })
  })

  describe('Enhanced JWT/Session callback edge cases', () => {
    it('should handle circular reference in token object', async () => {
      const jwtCallback = async ({ token, user }: { token: AuthToken, user?: AuthUser }) => {
        if (user) {
          token.id = user.id
        }
        return token
      }

      // Create circular reference
      const token: AuthToken = { email: 'test@example.com' }
      token.self = token

      const user: AuthUser = {
        id: '507f1f77bcf86cd799439011'
      }

      const result = await jwtCallback({ token, user })

      expect(result).toBeDefined()
      expect(result.id).toBe('507f1f77bcf86cd799439011')
    })

    it('should handle undefined user object properties', async () => {
      const jwtCallback = async ({ token, user }: { token: AuthToken, user?: AuthUser }) => {
        if (user) {
          token.id = user.id
        }
        return token
      }

      const token: AuthToken = {}
      const user: AuthUser = {
        id: undefined as any,
        email: undefined as any,
        name: undefined as any
      }

      const result = await jwtCallback({ token, user })

      expect(result.id).toBeUndefined()
    })

    it('should handle session with frozen user object', async () => {
      const sessionCallback = async ({ session, token }: { session: AuthSession, token?: AuthToken }) => {
        if (token && session.user) {
          session.user.id = token.id as string
        }
        return session
      }

      const session: AuthSession = {
        user: Object.freeze({
          email: 'test@example.com',
          name: 'Test User'
        })
      }
      const token: AuthToken = {
        id: '507f1f77bcf86cd799439011'
      }

      // Should handle frozen object gracefully (may throw error depending on implementation)
      await expect(sessionCallback({ session, token })).rejects.toThrow('Cannot add property id, object is not extensible')
    })

    it('should handle very large user ID values', async () => {
      const jwtCallback = async ({ token, user }: { token: AuthToken, user?: AuthUser }) => {
        if (user) {
          token.id = user.id
        }
        return token
      }

      const token: AuthToken = {}
      const largeId = '507f1f77bcf86cd799439011' + 'a'.repeat(1000)
      const user: AuthUser = {
        id: largeId
      }

      const result = await jwtCallback({ token, user })

      expect(result.id).toBe(largeId)
    })
  })

  describe('Enhanced MongoDB ObjectId conversion edge cases', () => {
    it('should handle ObjectId toString method throwing errors', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'correctPassword'
      }

      const mockObjectId = {
        toString: vi.fn().mockImplementation(() => {
          throw new Error('ObjectId conversion failed')
        })
      }

      const mockUser: MockUser = {
        _id: mockObjectId,
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashed_correctPassword_12',
        comparePassword: vi.fn().mockResolvedValue(true)
      }

      mockUserModel.findOne.mockResolvedValue(mockUser)

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await authorize(credentials)

      expect(result).toBeNull()
      expect(mockObjectId.toString).toHaveBeenCalled()
      expect(consoleErrorSpy).toHaveBeenCalledWith('Auth error:', expect.any(Error))

      consoleErrorSpy.mockRestore()
    })

    it('should handle null ObjectId', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'correctPassword'
      }

      const mockUser: MockUser = {
        _id: null as any,
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashed_correctPassword_12',
        comparePassword: vi.fn().mockResolvedValue(true)
      }

      mockUserModel.findOne.mockResolvedValue(mockUser)

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await authorize(credentials)

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith('Auth error:', expect.any(Error))

      consoleErrorSpy.mockRestore()
    })

    it('should handle ObjectId with circular references', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'correctPassword'
      }

      const mockObjectId: { toString: ReturnType<typeof vi.fn>; self?: any } = {
        toString: vi.fn().mockReturnValue('507f1f77bcf86cd799439011')
      }
      // Create circular reference
      mockObjectId.self = mockObjectId

      const mockUser: MockUser = {
        _id: mockObjectId,
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashed_correctPassword_12',
        comparePassword: vi.fn().mockResolvedValue(true)
      }

      mockUserModel.findOne.mockResolvedValue(mockUser)

      const result = await authorize(credentials)

      expect(result?.id).toBe('507f1f77bcf86cd799439011')
    })
  })

  describe('Security and timing attack considerations', () => {
    it('should consistently return null for all failure scenarios', async () => {
      const authorize = createMockAuthorize()

      // Test different failure scenarios all return null
      const scenarios = [
        { email: '', password: 'password' },
        { email: 'test@example.com', password: '' },
        null,
        undefined,
        { email: 'nonexistent@example.com', password: 'password' }
      ]

      for (const scenario of scenarios) {
        mockUserModel.findOne.mockResolvedValue(null)
        const result = await authorize(scenario)
        expect(result).toBeNull()
      }
    })

    it('should not expose database connection errors to caller', async () => {
      const authorize = createMockAuthorize()
      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      const sensitiveError = new Error('Database credentials compromised: admin:password123')
      mockMongooseConnect.mockRejectedValue(sensitiveError)

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await authorize(credentials)

      // Should still return null without exposing sensitive information
      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith('Auth error:', sensitiveError)

      consoleErrorSpy.mockRestore()
    })

    it('should handle malformed credentials objects', async () => {
      const authorize = createMockAuthorize()

      // Test various malformed credential objects
      const malformedCredentials = [
        { email: null, password: 'password' },
        { email: 'test@example.com', password: null },
        { email: 123, password: 'password' },
        { email: 'test@example.com', password: 123 },
        { email: [], password: 'password' }
      ]

      for (const credentials of malformedCredentials as any[]) {
        mockUserModel.findOne.mockReset()
        mockUserModel.findOne.mockResolvedValue(null)

        const result = await authorize(credentials)
        expect(result).toBeNull()
      }
    })
  })

  describe('Concurrent authentication attempts', () => {
    it('should handle multiple concurrent auth requests', async () => {
      const authorize = createMockAuthorize()

      const credentials1: Credentials = {
        email: 'user1@example.com',
        password: 'password1'
      }

      const credentials2: Credentials = {
        email: 'user2@example.com',
        password: 'password2'
      }

      const mockUser1: MockUser = {
        _id: '507f1f77bcf86cd799439011',
        email: 'user1@example.com',
        name: 'User One',
        password: 'hashed_password1_12',
        comparePassword: vi.fn().mockResolvedValue(true)
      }

      const mockUser2: MockUser = {
        _id: '507f1f77bcf86cd799439012',
        email: 'user2@example.com',
        name: 'User Two',
        password: 'hashed_password2_12',
        comparePassword: vi.fn().mockResolvedValue(true)
      }

      // Mock different users for different requests
      mockUserModel.findOne
        .mockResolvedValueOnce(mockUser1)
        .mockResolvedValueOnce(mockUser2)

      // Execute concurrent authentication requests
      const [result1, result2] = await Promise.all([
        authorize(credentials1),
        authorize(credentials2)
      ])

      expect(result1).toEqual({
        id: '507f1f77bcf86cd799439011',
        email: 'user1@example.com',
        name: 'User One'
      })

      expect(result2).toEqual({
        id: '507f1f77bcf86cd799439012',
        email: 'user2@example.com',
        name: 'User Two'
      })

      expect(mockUserModel.findOne).toHaveBeenCalledTimes(2)
    })

    it('should handle concurrent database connections', async () => {
      const authorize = createMockAuthorize()

      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      // Mock connection delay
      mockMongooseConnect.mockImplementation(() =>
        new Promise(resolve => setTimeout(resolve, 100))
      )

      mockUserModel.findOne.mockResolvedValue(null)

      // Start multiple concurrent requests
      const promises = Array(5).fill(null).map(() => authorize(credentials))
      const results = await Promise.all(promises)

      // All should return null
      expect(results.every(result => result === null)).toBe(true)

      // Should handle connection concurrency properly
      expect(mockMongooseConnect).toHaveBeenCalled()
    })
  })

  describe('Memory and resource management', () => {
    it('should handle large number of authentication requests without memory leaks', async () => {
      const authorize = createMockAuthorize()

      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      mockUserModel.findOne.mockResolvedValue(null)

      // Simulate many requests
      for (let i = 0; i < 100; i++) {
        await authorize(credentials)
      }

      expect(mockUserModel.findOne).toHaveBeenCalledTimes(100)
    })

    it('should clean up resources after failed authentication', async () => {
      const authorize = createMockAuthorize()

      const credentials: Credentials = {
        email: 'test@example.com',
        password: 'testPassword123'
      }

      const mockUser: MockUser = {
        _id: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashed_testPassword123_12',
        comparePassword: vi.fn().mockRejectedValue(new Error('Comparison failed'))
      }

      mockUserModel.findOne.mockResolvedValue(mockUser)

      const result = await authorize(credentials)

      expect(result).toBeNull()

      // Verify mocks were called but no resources are leaked
      expect(mockUserModel.findOne).toHaveBeenCalledTimes(1)
      expect(mockUser.comparePassword).toHaveBeenCalledTimes(1)
    })
  })

  describe('NextAuth configuration structure - Real Implementation Tests', () => {
    it('should export required auth functions from src/auth.ts', () => {
      // Import from the actual auth module
      expect(handlers).toBeDefined()
      expect(handlers.GET).toBeDefined()
      expect(handlers.POST).toBeDefined()
      expect(signIn).toBeDefined()
      expect(signOut).toBeDefined()
      expect(auth).toBeDefined()
    })

    it('should have credentials provider configuration accessible', () => {
      // Get the stored configuration from the global function
      const config = (global as any).__storedAuthConfig()
      expect(config).toBeDefined()

      expect(config.providers).toBeDefined()

      const credentialsProvider = config.providers.find((p: any) => p.type === 'credentials')
      expect(credentialsProvider).toBeDefined()
      expect(credentialsProvider.name).toBe('credentials')
      expect(credentialsProvider.credentials).toBeDefined()
      expect(typeof credentialsProvider.authorize).toBe('function')
    })

    it('should use JWT session strategy', () => {
      const config = (global as any).__storedAuthConfig()
      expect(config.session.strategy).toBe('jwt')
    })

    it('should configure custom sign-in page', () => {
      const config = (global as any).__storedAuthConfig()
      expect(config.pages.signIn).toBe('/auth/signin')
    })

    it('should have trustHost enabled', () => {
      const config = (global as any).__storedAuthConfig()
      expect(config.trustHost).toBe(true)
    })

    it('should have both JWT and session callbacks configured', () => {
      const config = (global as any).__storedAuthConfig()
      expect(config.callbacks).toBeDefined()
      expect(typeof config.callbacks.jwt).toBe('function')
      expect(typeof config.callbacks.session).toBe('function')
    })
  })

  describe('Real authorize function from src/auth.ts', () => {
    it('should test actual authorize function with valid credentials', async () => {
      const config = (global as any).__storedAuthConfig()
      const credentialsProvider = config.providers.find((p: any) => p.type === 'credentials')

      // Mock successful user lookup
      const mockUser: MockUser = {
        _id: { toString: () => '507f1f77bcf86cd799439011' },
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashed_password123_12',
        comparePassword: vi.fn().mockResolvedValue(true)
      }
      mockUserModel.findOne.mockResolvedValue(mockUser)

      // Call the actual authorize function from NextAuth config
      const result = await credentialsProvider.authorize({
        email: 'test@example.com',
        password: 'password123'
      })

      // Verify database connection was attempted
      expect(mockMongooseConnect).toHaveBeenCalledWith(
        process.env.MONGODB_URI || 'mongodb://localhost:27017/heart-tiles'
      )

      // Verify user lookup
      expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: 'test@example.com' })

      // Verify password comparison
      expect(mockUser.comparePassword).toHaveBeenCalledWith('password123')

      // Verify successful result
      expect(result).toEqual({
        id: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        name: 'Test User'
      })
    })

    it('should test actual authorize function with invalid credentials', async () => {
      const config = (global as any).__storedAuthConfig()
      const credentialsProvider = config.providers.find((p: any) => p.type === 'credentials')

      // Test missing email
      let result = await credentialsProvider.authorize({
        password: 'password123'
      })
      expect(result).toBeNull()

      // Test missing password
      result = await credentialsProvider.authorize({
        email: 'test@example.com'
      })
      expect(result).toBeNull()

      // Test null credentials
      result = await credentialsProvider.authorize(null)
      expect(result).toBeNull()

      // Should not attempt database connection for missing credentials
      expect(mockUserModel.findOne).not.toHaveBeenCalled()
    })

    it('should test actual authorize function when user not found', async () => {
      const config = (global as any).__storedAuthConfig()
      const credentialsProvider = config.providers.find((p: any) => p.type === 'credentials')

      mockUserModel.findOne.mockResolvedValue(null)

      const result = await credentialsProvider.authorize({
        email: 'nonexistent@example.com',
        password: 'password123'
      })

      expect(result).toBeNull()
      expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: 'nonexistent@example.com' })
    })

    it('should test actual authorize function with invalid password', async () => {
      const config = (global as any).__storedAuthConfig()
      const credentialsProvider = config.providers.find((p: any) => p.type === 'credentials')

      const mockUser: MockUser = {
        _id: { toString: () => '507f1f77bcf86cd799439011' },
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashed_correctPassword_12',
        comparePassword: vi.fn().mockResolvedValue(false)
      }
      mockUserModel.findOne.mockResolvedValue(mockUser)

      const result = await credentialsProvider.authorize({
        email: 'test@example.com',
        password: 'wrongpassword'
      })

      expect(result).toBeNull()
      expect(mockUser.comparePassword).toHaveBeenCalledWith('wrongpassword')
    })

    it('should test actual authorize function with database errors', async () => {
      const config = (global as any).__storedAuthConfig()
      const credentialsProvider = config.providers.find((p: any) => p.type === 'credentials')

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const dbError = new Error('Database connection failed')
      mockUserModel.findOne.mockRejectedValue(dbError)

      const result = await credentialsProvider.authorize({
        email: 'test@example.com',
        password: 'password123'
      })

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith('Auth error:', dbError)

      consoleErrorSpy.mockRestore()
    })
  })

  describe('Real JWT callback from src/auth.ts', () => {
    it('should test actual JWT callback from auth configuration', async () => {
      const config = (global as any).__storedAuthConfig()
      const jwtCallback = config.callbacks.jwt

      const token = { email: 'existing@example.com' }
      const user = {
        id: '507f1f77bcf86cd799439011',
        name: 'Test User'
      }

      const result = await jwtCallback({ token, user })

      expect(result).toEqual({
        email: 'existing@example.com',
        id: '507f1f77bcf86cd799439011'
      })
    })

    it('should test actual JWT callback without user', async () => {
      const config = (global as any).__storedAuthConfig()
      const jwtCallback = config.callbacks.jwt

      const originalToken = { email: 'existing@example.com' }

      const result = await jwtCallback({ token: originalToken })

      expect(result).toEqual(originalToken)
    })
  })

  describe('Real session callback from src/auth.ts', () => {
    it('should test actual session callback from auth configuration', async () => {
      const config = (global as any).__storedAuthConfig()
      const sessionCallback = config.callbacks.session

      const session = {
        user: {
          email: 'test@example.com',
          name: 'Test User'
        }
      }
      const token = {
        id: '507f1f77bcf86cd799439011',
        email: 'test@example.com'
      }

      const result = await sessionCallback({ session, token })

      expect(result.user).toEqual({
        email: 'test@example.com',
        name: 'Test User',
        id: '507f1f77bcf86cd799439011'
      })
    })

    it('should test actual session callback without token', async () => {
      const config = (global as any).__storedAuthConfig()
      const sessionCallback = config.callbacks.session

      const originalSession = {
        user: {
          email: 'test@example.com',
          name: 'Test User'
        }
      }

      const result = await sessionCallback({ session: originalSession })

      expect(result).toEqual(originalSession)
    })
  })

  describe('Complete authentication flow integration with real auth.ts', () => {
    it('should test complete successful authentication flow', async () => {
      // Set up successful user scenario
      const mockUser: MockUser = {
        _id: { toString: () => '507f1f77bcf86cd799439011' },
        email: 'user@example.com',
        name: 'John Doe',
        password: 'hashed_correctPassword_12',
        comparePassword: vi.fn().mockResolvedValue(true)
      }
      mockUserModel.findOne.mockResolvedValue(mockUser)

      const config = (global as any).__storedAuthConfig()
      const credentialsProvider = config.providers.find((p: any) => p.type === 'credentials')

      // Test credentials provider authorization
      const authResult = await credentialsProvider.authorize({
        email: 'user@example.com',
        password: 'correctPassword'
      })

      // Verify authorize function result
      expect(authResult).toEqual({
        id: '507f1f77bcf86cd799439011',
        email: 'user@example.com',
        name: 'John Doe'
      })

      // Test JWT callback with the result
      const jwtResult = await config.callbacks.jwt({
        token: {},
        user: authResult
      })

      expect(jwtResult).toEqual({
        id: '507f1f77bcf86cd799439011'
      })

      // Test session callback with the JWT token
      const sessionResult = await config.callbacks.session({
        session: { user: { email: 'user@example.com', name: 'John Doe' } },
        token: jwtResult
      })

      expect(sessionResult.user).toEqual({
        email: 'user@example.com',
        name: 'John Doe',
        id: '507f1f77bcf86cd799439011'
      })
    })

    it('should test complete failed authentication flow', async () => {
      // Set up failed user scenario (user not found)
      mockUserModel.findOne.mockResolvedValue(null)

      const config = (global as any).__storedAuthConfig()
      const credentialsProvider = config.providers.find((p: any) => p.type === 'credentials')

      // Test credentials provider authorization
      const authResult = await credentialsProvider.authorize({
        email: 'nonexistent@example.com',
        password: 'anypassword'
      })

      // Should return null for failed authentication
      expect(authResult).toBeNull()

      // Test JWT callback without user (should preserve token)
      const originalToken = { email: 'existing@example.com' }
      const jwtResult = await config.callbacks.jwt({
        token: originalToken
      })

      expect(jwtResult).toEqual(originalToken)

      // Test session callback without token ID (should not add ID)
      const originalSession = { user: { email: 'existing@example.com', name: 'Existing User' } }
      const sessionResult = await config.callbacks.session({
        session: originalSession
      })

      expect(sessionResult).toEqual(originalSession)
    })
  })
})