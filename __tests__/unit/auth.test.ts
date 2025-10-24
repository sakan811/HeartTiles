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

describe('NextAuth Configuration Tests', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(async () => {
    vi.clearAllMocks()

    // Store original environment
    originalEnv = { ...process.env }

    // Mock the database connection function to avoid actual MongoDB calls
    vi.doMock('../../src/auth.ts', async (importOriginal) => {
      const actual = await importOriginal()
      return {
        ...actual,
        // Override any database connection logic if needed
      }
    })
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  describe('NextAuth configuration structure', () => {
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

  describe('JWT callback from src/auth.ts', () => {
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

    it('should preserve existing token properties when adding user ID', async () => {
      const config = (global as any).__storedAuthConfig()
      const jwtCallback = config.callbacks.jwt

      const existingToken = {
        email: 'existing@example.com',
        name: 'Existing User'
      }
      const user = {
        id: '507f1f77bcf86cd799439011'
      }

      const result = await jwtCallback({ token: existingToken, user })

      expect(result).toEqual({
        email: 'existing@example.com',
        name: 'Existing User',
        id: '507f1f77bcf86cd799439011'
      })
    })

    it('should handle null/undefined token gracefully', async () => {
      const config = (global as any).__storedAuthConfig()
      const jwtCallback = config.callbacks.jwt

      const user = {
        id: '507f1f77bcf86cd799439011'
      }

      // Test with null token - should create new token with user ID
      const resultWithNull = await jwtCallback({ token: null, user })
      expect(resultWithNull).toBeDefined()
      expect(resultWithNull.id).toBe('507f1f77bcf86cd799439011')

      // Test with undefined token - should create new token with user ID
      const resultWithUndefined = await jwtCallback({ token: undefined, user })
      expect(resultWithUndefined).toBeDefined()
      expect(resultWithUndefined.id).toBe('507f1f77bcf86cd799439011')

      // Test with empty object token - should add user ID
      const resultWithEmpty = await jwtCallback({ token: {}, user })
      expect(resultWithEmpty).toBeDefined()
      expect(resultWithEmpty.id).toBe('507f1f77bcf86cd799439011')
    })
  })

  describe('Session callback from src/auth.ts', () => {
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

    it('should preserve existing session user properties', async () => {
      const config = (global as any).__storedAuthConfig()
      const sessionCallback = config.callbacks.session

      const session = {
        user: {
          email: 'existing@example.com',
          name: 'Existing User',
          role: 'user'
        }
      }
      const token = {
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

    it('should handle token without ID', async () => {
      const config = (global as any).__storedAuthConfig()
      const sessionCallback = config.callbacks.session

      const session = {
        user: {
          email: 'test@example.com'
        }
      }
      const tokenWithoutId = {
        email: 'test@example.com'
      }

      const result = await sessionCallback({ session, token: tokenWithoutId })

      expect(result.user?.email).toBe('test@example.com')
      expect(result.user?.id).toBeUndefined()
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

      // Get the mocked User model from setup.js
      const { User } = await import('../../models.js')
      const mockedUser = vi.mocked(User)
      mockedUser.findOne.mockResolvedValue(mockUser)

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

      // Clean up mock
      mockedUser.findOne.mockReset()
    })

    it('should test complete failed authentication flow', async () => {
      // Set up failed user scenario (user not found)
      const { User } = await import('../../models.js')
      const mockedUser = vi.mocked(User)
      mockedUser.findOne.mockResolvedValue(null)

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

      // Clean up mock
      mockedUser.findOne.mockReset()
    })
  })

  describe('Real authorize function edge cases', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleErrorSpy.mockRestore()
    })

    it('should handle missing credentials validation', async () => {
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

      // Test undefined credentials
      result = await credentialsProvider.authorize(undefined)
      expect(result).toBeNull()
    })

    it('should handle user not found', async () => {
      const config = (global as any).__storedAuthConfig()
      const credentialsProvider = config.providers.find((p: any) => p.type === 'credentials')

      const { User } = await import('../../models.js')
      const mockedUser = vi.mocked(User)
      mockedUser.findOne.mockResolvedValue(null)

      const result = await credentialsProvider.authorize({
        email: 'nonexistent@example.com',
        password: 'password123'
      })

      expect(result).toBeNull()

      // Clean up mock
      mockedUser.findOne.mockReset()
    })

    it('should handle invalid password', async () => {
      const config = (global as any).__storedAuthConfig()
      const credentialsProvider = config.providers.find((p: any) => p.type === 'credentials')

      const mockUser: MockUser = {
        _id: { toString: () => '507f1f77bcf86cd799439011' },
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashed_correctPassword_12',
        comparePassword: vi.fn().mockResolvedValue(false)
      }

      const { User } = await import('../../models.js')
      const mockedUser = vi.mocked(User)
      mockedUser.findOne.mockResolvedValue(mockUser)

      const result = await credentialsProvider.authorize({
        email: 'test@example.com',
        password: 'wrongpassword'
      })

      expect(result).toBeNull()

      // Clean up mock
      mockedUser.findOne.mockReset()
    })

    it('should handle database errors gracefully', async () => {
      const config = (global as any).__storedAuthConfig()
      const credentialsProvider = config.providers.find((p: any) => p.type === 'credentials')

      const { User } = await import('../../models.js')
      const mockedUser = vi.mocked(User)
      const dbError = new Error('Database connection failed')
      mockedUser.findOne.mockRejectedValue(dbError)

      const result = await credentialsProvider.authorize({
        email: 'test@example.com',
        password: 'password123'
      })

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith('Auth error:', dbError)

      // Clean up mock
      mockedUser.findOne.mockReset()
    })

    it('should handle password comparison errors', async () => {
      const config = (global as any).__storedAuthConfig()
      const credentialsProvider = config.providers.find((p: any) => p.type === 'credentials')

      const mockUser: MockUser = {
        _id: { toString: () => '507f1f77bcf86cd799439011' },
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashed_testPassword123_12',
        comparePassword: vi.fn().mockRejectedValue(new Error('Password comparison failed'))
      }

      const { User } = await import('../../models.js')
      const mockedUser = vi.mocked(User)
      mockedUser.findOne.mockResolvedValue(mockUser)

      const result = await credentialsProvider.authorize({
        email: 'test@example.com',
        password: 'testPassword123'
      })

      expect(result).toBeNull()

      // Clean up mocks
      mockedUser.findOne.mockReset()
    })

    it('should convert MongoDB ObjectId to string correctly', async () => {
      const config = (global as any).__storedAuthConfig()
      const credentialsProvider = config.providers.find((p: any) => p.type === 'credentials')

      // Mock user with complex ObjectId
      const mockObjectId = { toString: () => '507f1f77bcf86cd799439011' }
      const mockUser: MockUser = {
        _id: mockObjectId,
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashed_correctPassword_12',
        comparePassword: vi.fn().mockResolvedValue(true)
      }

      const { User } = await import('../../models.js')
      const mockedUser = vi.mocked(User)
      mockedUser.findOne.mockResolvedValue(mockUser)

      const result = await credentialsProvider.authorize({
        email: 'test@example.com',
        password: 'correctPassword'
      })

      expect(result?.id).toBe('507f1f77bcf86cd799439011')
      expect(typeof result?.id).toBe('string')

      // Clean up mocks
      mockedUser.findOne.mockReset()
    })
  })
})