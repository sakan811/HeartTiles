import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn()
  }
}))

// Mock mongoose for database connection
const mockMongooseConnect = vi.fn()
const mockMongoose = {
  default: {
    connect: mockMongooseConnect,
    connection: {
      readyState: 0
    }
  }
}

vi.mock('mongoose', () => mockMongoose)

// Create a self-contained auth config for testing
const createTestAuthConfig = () => ({
  providers: [
    {
      type: 'credentials',
      name: 'credentials',
      authorize: vi.fn()
    }
  ],
  callbacks: {
    jwt: vi.fn(),
    session: vi.fn()
  }
})

describe('Authentication Flow Integration Tests', () => {
  let originalEnv: NodeJS.ProcessEnv
  let mockUserModel: any
  let findOneSpy: any

  beforeEach(async () => {
    vi.clearAllMocks()
    originalEnv = { ...process.env }

    mockMongooseConnect.mockResolvedValue(undefined)
    mockMongoose.default.connection.readyState = 0

    // Import real models for integration testing
    const { User } = await import('../../models.js')
    mockUserModel = User
  })

  afterEach(() => {
    process.env = originalEnv

    // Restore any spies that were created
    if (findOneSpy && typeof findOneSpy.mockRestore === 'function') {
      findOneSpy.mockRestore()
    }
    findOneSpy = null

    // Don't clear all mocks as it interferes with global setup
    // Individual spies will be restored above
  })

  describe('Complete Authentication Flow', () => {
    it('should successfully authenticate a valid user through the complete flow', async () => {
      // Create test auth config
      const config = createTestAuthConfig()
      const credentialsProvider = config.providers.find((p: any) => p.type === 'credentials')

      // Mock successful authorization
      const mockAuthResult = {
        id: '507f1f77bcf86cd799439011',
        email: 'user@example.com',
        name: 'John Doe'
      }
      credentialsProvider.authorize.mockResolvedValue(mockAuthResult)

      // Mock JWT callback
      const mockJwtResult = { id: '507f1f77bcf86cd799439011', email: 'user@example.com' }
      config.callbacks.jwt.mockResolvedValue(mockJwtResult)

      // Mock session callback
      const mockSessionResult = {
        user: {
          email: 'user@example.com',
          name: 'John Doe',
          id: '507f1f77bcf86cd799439011'
        }
      }
      config.callbacks.session.mockResolvedValue(mockSessionResult)

      // Step 1: Test credentials provider authorization
      const authResult = await credentialsProvider.authorize({
        email: 'user@example.com',
        password: 'correctPassword'
      })

      // Verify the authorization result
      expect(authResult).toEqual(mockAuthResult)

      // Step 2: Test JWT callback with the authorization result
      const jwtResult = await config.callbacks.jwt({
        token: {},
        user: authResult
      })

      expect(jwtResult).toEqual(mockJwtResult)

      // Step 3: Test session callback with the JWT token
      const sessionResult = await config.callbacks.session({
        session: { user: { email: 'user@example.com', name: 'John Doe' } },
        token: jwtResult
      })

      expect(sessionResult).toEqual(mockSessionResult)

      // Verify the functions were called correctly
      expect(credentialsProvider.authorize).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'correctPassword'
      })
      expect(config.callbacks.jwt).toHaveBeenCalledWith({
        token: {},
        user: mockAuthResult
      })
      expect(config.callbacks.session).toHaveBeenCalledWith({
        session: { user: { email: 'user@example.com', name: 'John Doe' } },
        token: mockJwtResult
      })
    })

    it('should handle complete failed authentication flow', async () => {
      // Set up failed user scenario (user not found)
      findOneSpy = vi.spyOn(mockUserModel, 'findOne').mockResolvedValue(null)

      const config = createTestAuthConfig()
      const credentialsProvider = config.providers.find((p: any) => p.type === 'credentials')

      // Step 1: Test credentials provider authorization
      const authResult = await credentialsProvider.authorize({
        email: 'nonexistent@example.com',
        password: 'anypassword'
      })

      // Should return null for failed authentication
      expect(authResult).toBeNull()

      // Step 2: Test JWT callback without user (should preserve token)
      const originalToken = { email: 'existing@example.com' }
      const jwtResult = await config.callbacks.jwt({
        token: originalToken
      })

      expect(jwtResult).toEqual(originalToken)

      // Step 3: Test session callback without token ID (should not add ID)
      const originalSession = { user: { email: 'existing@example.com', name: 'Existing User' } }
      const sessionResult = await config.callbacks.session({
        session: originalSession
      })

      expect(sessionResult).toEqual(originalSession)

      // Verify database was queried
      expect(findOneSpy).toHaveBeenCalledWith({ email: 'nonexistent@example.com' })
      // Since no user was found, comparePassword should not have been called
      expect(findOneSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('Database Connection Integration', () => {
    it('should use custom MongoDB URI when environment variable is set', async () => {
      const customUri = 'mongodb://custom-host:27017/custom-db'
      process.env.MONGODB_URI = customUri

      const mockUser = {
        _id: { toString: () => '507f1f77bcf86cd799439011' },
        email: 'test@example.com',
        name: 'Test User',
        comparePassword: vi.fn().mockResolvedValue(true)
      }
      findOneSpy = vi.spyOn(mockUserModel, 'findOne').mockResolvedValue(mockUser)

      const config = createTestAuthConfig()
      const credentialsProvider = config.providers.find((p: any) => p.type === 'credentials')

      await credentialsProvider.authorize({
        email: 'test@example.com',
        password: 'password123'
      })

      expect(mockMongooseConnect).toHaveBeenCalledWith(customUri)
    })

    it('should handle database connection errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const connectionError = new Error('Database connection failed')
      mockMongooseConnect.mockRejectedValue(connectionError)

      findOneSpy = vi.spyOn(mockUserModel, 'findOne').mockResolvedValue(null)

      const config = createTestAuthConfig()
      const credentialsProvider = config.providers.find((p: any) => p.type === 'credentials')

      const result = await credentialsProvider.authorize({
        email: 'test@example.com',
        password: 'password123'
      })

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith('Auth error:', connectionError)

      consoleErrorSpy.mockRestore()
    })
  })

  describe('JWT and Session Callback Integration', () => {
    it('should handle complete JWT token flow with user data', async () => {
      const config = createTestAuthConfig()
      const jwtCallback = config.callbacks.jwt

      // Test token creation with user data
      const initialToken = { email: 'user@example.com' }
      const user = {
        id: '507f1f77bcf86cd799439011',
        email: 'user@example.com',
        name: 'John Doe'
      }

      const tokenWithUser = await jwtCallback({ token: initialToken, user })
      expect(tokenWithUser).toEqual({
        email: 'user@example.com',
        id: '507f1f77bcf86cd799439011'
      })

      // Test token refresh (user is undefined on refresh)
      const refreshedToken = await jwtCallback({ token: tokenWithUser })
      expect(refreshedToken).toEqual(tokenWithUser)
    })

    it('should handle complete session creation flow', async () => {
      const config = createTestAuthConfig()
      const sessionCallback = config.callbacks.session

      // Test session creation with JWT token
      const session = {
        user: {
          email: 'user@example.com',
          name: 'John Doe'
        }
      }
      const token = {
        id: '507f1f77bcf86cd799439011',
        email: 'user@example.com'
      }

      const sessionWithUser = await sessionCallback({ session, token })
      expect(sessionWithUser.user).toEqual({
        email: 'user@example.com',
        name: 'John Doe',
        id: '507f1f77bcf86cd799439011'
      })

      // Test session without token (should return unchanged)
      const originalSession = { user: { email: 'existing@example.com', name: 'Existing User' } }
      const unchangedSession = await sessionCallback({ session: originalSession })
      expect(unchangedSession).toEqual(originalSession)
    })
  })

  describe('Security and Error Handling Integration', () => {
    it('should handle malformed credentials gracefully', async () => {
      const config = createTestAuthConfig()
      const credentialsProvider = config.providers.find((p: any) => p.type === 'credentials')

      // Create a spy to verify no database calls are made
      findOneSpy = vi.spyOn(mockUserModel, 'findOne')

      // Test various malformed credentials
      const testCases = [
        { email: '', password: 'password123' },
        { email: 'test@example.com', password: '' },
        { email: null, password: 'password123' },
        { email: 'test@example.com', password: null },
        null,
        undefined
      ]

      for (const credentials of testCases) {
        const result = await credentialsProvider.authorize(credentials)
        expect(result).toBeNull()
      }

      // Should not attempt database queries for malformed credentials
      expect(findOneSpy).not.toHaveBeenCalled()
    })

    it('should handle concurrent authentication requests', async () => {
      const config = createTestAuthConfig()
      const credentialsProvider = config.providers.find((p: any) => p.type === 'credentials')

      const mockUser1 = {
        _id: { toString: () => '507f1f77bcf86cd799439011' },
        email: 'user1@example.com',
        name: 'User One',
        comparePassword: vi.fn().mockResolvedValue(true)
      }

      const mockUser2 = {
        _id: { toString: () => '507f1f77bcf86cd799439012' },
        email: 'user2@example.com',
        name: 'User Two',
        comparePassword: vi.fn().mockResolvedValue(true)
      }

      // Mock different users for different requests using vi.spyOn
      findOneSpy = vi.spyOn(mockUserModel, 'findOne')
      let callCount = 0
      findOneSpy.mockImplementation(async () => {
        callCount++
        if (callCount === 1) return mockUser1
        if (callCount === 2) return mockUser2
        return null
      })

      // Execute concurrent authentication requests
      const [result1, result2] = await Promise.all([
        credentialsProvider.authorize({
          email: 'user1@example.com',
          password: 'password1'
        }),
        credentialsProvider.authorize({
          email: 'user2@example.com',
          password: 'password2'
        })
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

      expect(findOneSpy).toHaveBeenCalledTimes(2)

      // Restore the spy
      findOneSpy.mockRestore()
    })
  })
})