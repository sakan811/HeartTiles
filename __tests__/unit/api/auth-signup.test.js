import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// Mock Next.js server components
vi.mock('next/server', () => ({
  NextRequest: vi.fn(),
  NextResponse: {
    json: vi.fn().mockImplementation((data, options) => ({
      json: () => data,
      status: options?.status || 200
    }))
  }
}))

// Mock the User model
vi.mock('../../../models', () => ({
  User: {
    findOne: vi.fn(),
    constructor: vi.fn().mockImplementation(function() {
      this.save = vi.fn()
    })
  }
}))

// Mock mongoose
vi.mock('mongoose', () => ({
  default: {
    connection: {
      readyState: 1
    },
    connect: vi.fn().mockResolvedValue()
  }
}))

describe('Signup API Route Tests', () => {
  let mockRequest
  let mockJson

  beforeEach(async () => {
    vi.clearAllMocks()

    mockJson = vi.fn()
    mockRequest = {
      json: vi.fn().mockResolvedValue({})
    }

    // Reset User constructor mock
    const { User } = await import('../../../models')
    User.constructor.mockClear()
    User.constructor.mockImplementation(function(userData) {
      this.name = userData.name
      this.email = userData.email
      this.password = userData.password
      this.save = vi.fn().mockResolvedValue(this)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Request Validation', () => {
    it('should return 400 when name is missing', async () => {
      const { POST } = await import('../../../src/app/api/auth/signup/route')

      mockRequest.json.mockResolvedValue({
        email: 'test@example.com',
        password: 'password123'
      })

      const result = await POST(mockRequest)

      expect(result.status).toBe(400)
      expect(result.json()).toEqual({ error: "Missing required fields" })
    })

    it('should return 400 when email is missing', async () => {
      const { POST } = await import('../../../src/app/api/auth/signup/route')

      mockRequest.json.mockResolvedValue({
        name: 'Test User',
        password: 'password123'
      })

      const result = await POST(mockRequest)

      expect(result.status).toBe(400)
      expect(result.json()).toEqual({ error: "Missing required fields" })
    })

    it('should return 400 when password is missing', async () => {
      const { POST } = await import('../../../src/app/api/auth/signup/route')

      mockRequest.json.mockResolvedValue({
        name: 'Test User',
        email: 'test@example.com'
      })

      const result = await POST(mockRequest)

      expect(result.status).toBe(400)
      expect(result.json()).toEqual({ error: "Missing required fields" })
    })

    it('should return 400 when password is too short', async () => {
      const { POST } = await import('../../../src/app/api/auth/signup/route')

      mockRequest.json.mockResolvedValue({
        name: 'Test User',
        email: 'test@example.com',
        password: '123'
      })

      const result = await POST(mockRequest)

      expect(result.status).toBe(400)
      expect(result.json()).toEqual({ error: "Password must be at least 6 characters long" })
    })

    it('should return 400 when password is exactly 5 characters', async () => {
      const { POST } = await import('../../../src/app/api/auth/signup/route')

      mockRequest.json.mockResolvedValue({
        name: 'Test User',
        email: 'test@example.com',
        password: '12345'
      })

      const result = await POST(mockRequest)

      expect(result.status).toBe(400)
      expect(result.json()).toEqual({ error: "Password must be at least 6 characters long" })
    })

    it('should accept password of exactly 6 characters', async () => {
      const { User } = await import('../../../models')
      const { POST } = await import('../../../src/app/api/auth/signup/route')

      User.findOne.mockResolvedValue(null)
      const mockSave = vi.fn().mockResolvedValue({})
      User.constructor.mockImplementation(function(userData) {
        this.save = mockSave
        return this
      })

      mockRequest.json.mockResolvedValue({
        name: 'Test User',
        email: 'test@example.com',
        password: '123456'
      })

      const result = await POST(mockRequest)

      expect(result.status).toBe(201)
      expect(mockSave).toHaveBeenCalled()
    })
  })

  describe('Database Connection', () => {
    it('should connect to database when connection state is 0', async () => {
      const { POST } = await import('../../../src/app/api/auth/signup/route')
      const mockMongoose = {
        default: {
          connection: { readyState: 0 },
          connect: vi.fn().mockResolvedValue()
        }
      }

      // Mock dynamic import
      global.import = vi.fn().mockResolvedValue(mockMongoose)

      const { User } = await import('../../../models')
      User.findOne.mockResolvedValue(null)

      const mockSave = vi.fn().mockResolvedValue({})
      User.constructor.mockImplementation(function() {
        this.save = mockSave
        return this
      })

      mockRequest.json.mockResolvedValue({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      })

      await POST(mockRequest)

      expect(mockMongoose.default.connect).toHaveBeenCalled()
    })

    it('should not connect when already connected', async () => {
      const { POST } = await import('../../../src/app/api/auth/signup/route')
      const mockMongoose = {
        default: {
          connection: { readyState: 1 },
          connect: vi.fn()
        }
      }

      global.import = vi.fn().mockResolvedValue(mockMongoose)

      const { User } = await import('../../../models')
      User.findOne.mockResolvedValue(null)

      const mockSave = vi.fn().mockResolvedValue({})
      User.constructor.mockImplementation(function() {
        this.save = mockSave
        return this
      })

      mockRequest.json.mockResolvedValue({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      })

      await POST(mockRequest)

      expect(mockMongoose.default.connect).not.toHaveBeenCalled()
    })

    it('should use default MongoDB URI when environment variable not set', async () => {
      const originalEnv = process.env
      process.env = { ...originalEnv, MONGODB_URI: undefined }

      const { POST } = await import('../../../src/app/api/auth/signup/route')
      const mockMongoose = {
        default: {
          connection: { readyState: 0 },
          connect: vi.fn().mockResolvedValue()
        }
      }

      global.import = vi.fn().mockResolvedValue(mockMongoose)

      const { User } = await import('../../../models')
      User.findOne.mockResolvedValue(null)

      const mockSave = vi.fn().mockResolvedValue({})
      User.constructor.mockImplementation(function() {
        this.save = mockSave
        return this
      })

      mockRequest.json.mockResolvedValue({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      })

      await POST(mockRequest)

      expect(mockMongoose.default.connect).toHaveBeenCalledWith('mongodb://localhost:27017/no-kitty-cards')

      process.env = originalEnv
    })

    it('should use environment MongoDB URI when set', async () => {
      const originalEnv = process.env
      process.env = { ...originalEnv, MONGODB_URI: 'mongodb://custom:27017/test-db' }

      const { POST } = await import('../../../src/app/api/auth/signup/route')
      const mockMongoose = {
        default: {
          connection: { readyState: 0 },
          connect: vi.fn().mockResolvedValue()
        }
      }

      global.import = vi.fn().mockResolvedValue(mockMongoose)

      const { User } = await import('../../../models')
      User.findOne.mockResolvedValue(null)

      const mockSave = vi.fn().mockResolvedValue({})
      User.constructor.mockImplementation(function() {
        this.save = mockSave
        return this
      })

      mockRequest.json.mockResolvedValue({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      })

      await POST(mockRequest)

      expect(mockMongoose.default.connect).toHaveBeenCalledWith('mongodb://custom:27017/test-db')

      process.env = originalEnv
    })
  })

  describe('User Creation', () => {
    it('should return 400 when user already exists', async () => {
      const { User } = await import('../../../models')
      const { POST } = await import('../../../src/app/api/auth/signup/route')

      User.findOne.mockResolvedValue({
        _id: '123',
        email: 'test@example.com',
        name: 'Existing User'
      })

      mockRequest.json.mockResolvedValue({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      })

      const result = await POST(mockRequest)

      expect(User.findOne).toHaveBeenCalledWith({ email: 'test@example.com' })
      expect(result.status).toBe(400)
      expect(result.json()).toEqual({ error: "User with this email already exists" })
    })

    it('should create new user when email is unique', async () => {
      const { User } = await import('../../../models')
      const { POST } = await import('../../../src/app/api/auth/signup/route')

      User.findOne.mockResolvedValue(null)
      const mockSave = vi.fn().mockResolvedValue({
        _id: '123',
        name: 'Test User',
        email: 'test@example.com'
      })
      User.constructor.mockImplementation(function(userData) {
        this.name = userData.name
        this.email = userData.email
        this.password = userData.password
        this.save = mockSave
        return this
      })

      mockRequest.json.mockResolvedValue({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      })

      const result = await POST(mockRequest)

      expect(User.findOne).toHaveBeenCalledWith({ email: 'test@example.com' })
      expect(User.constructor).toHaveBeenCalledWith({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      })
      expect(mockSave).toHaveBeenCalled()
      expect(result.status).toBe(201)
      expect(result.json()).toEqual({ message: "User created successfully" })
    })

    it('should handle database errors gracefully', async () => {
      const { User } = await import('../../../models')
      const { POST } = await import('../../../src/app/api/auth/signup/route')

      User.findOne.mockRejectedValue(new Error('Database connection failed'))

      mockRequest.json.mockResolvedValue({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      })

      const result = await POST(mockRequest)

      expect(result.status).toBe(500)
      expect(result.json()).toEqual({ error: "An error occurred during signup" })
    })

    it('should handle user save errors gracefully', async () => {
      const { User } = await import('../../../models')
      const { POST } = await import('../../../src/app/api/auth/signup/route')

      User.findOne.mockResolvedValue(null)
      const mockSave = vi.fn().mockRejectedValue(new Error('Save failed'))
      User.constructor.mockImplementation(function(userData) {
        this.save = mockSave
        return this
      })

      mockRequest.json.mockResolvedValue({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      })

      const result = await POST(mockRequest)

      expect(mockSave).toHaveBeenCalled()
      expect(result.status).toBe(500)
      expect(result.json()).toEqual({ error: "An error occurred during signup" })
    })

    it('should handle duplicate key error (MongoDB error code 11000)', async () => {
      const { User } = await import('../../../models')
      const { POST } = await import('../../../src/app/api/auth/signup/route')

      User.findOne.mockResolvedValue(null)
      const duplicateError = { code: 11000, keyValue: { email: 'test@example.com' } }
      const mockSave = vi.fn().mockRejectedValue(duplicateError)
      User.constructor.mockImplementation(function(userData) {
        this.save = mockSave
        return this
      })

      mockRequest.json.mockResolvedValue({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      })

      const result = await POST(mockRequest)

      expect(mockSave).toHaveBeenCalled()
      expect(result.status).toBe(400)
      expect(result.json()).toEqual({ error: "User with this email already exists" })
    })

    it('should handle malformed error objects', async () => {
      const { User } = await import('../../../models')
      const { POST } = await import('../../../src/app/api/auth/signup/route')

      User.findOne.mockRejectedValue('String error')

      mockRequest.json.mockResolvedValue({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      })

      const result = await POST(mockRequest)

      expect(result.status).toBe(500)
      expect(result.json()).toEqual({ error: "An error occurred during signup" })
    })

    it('should handle null error objects', async () => {
      const { User } = await import('../../../models')
      const { POST } = await import('../../../src/app/api/auth/signup/route')

      User.findOne.mockRejectedValue(null)

      mockRequest.json.mockResolvedValue({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      })

      const result = await POST(mockRequest)

      expect(result.status).toBe(500)
      expect(result.json()).toEqual({ error: "An error occurred during signup" })
    })
  })

  describe('Input Sanitization and Validation', () => {
    it('should handle valid email formats', async () => {
      const { User } = await import('../../../models')
      const { POST } = await import('../../../src/app/api/auth/signup/route')

      User.findOne.mockResolvedValue(null)
      const mockSave = vi.fn().mockResolvedValue({})
      User.constructor.mockImplementation(function(userData) {
        this.save = mockSave
        return this
      })

      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org',
        'user123@test-domain.com'
      ]

      for (const email of validEmails) {
        mockRequest.json.mockResolvedValue({
          name: 'Test User',
          email: email,
          password: 'password123'
        })

        const result = await POST(mockRequest)
        expect(result.status).toBe(201)
      }
    })

    it('should create user with valid names', async () => {
      const { User } = await import('../../../models')
      const { POST } = await import('../../../src/app/api/auth/signup/route')

      User.findOne.mockResolvedValue(null)
      const mockSave = vi.fn().mockResolvedValue({})
      User.constructor.mockImplementation(function(userData) {
        this.save = mockSave
        return this
      })

      const validNames = [
        'Test User',
        'John Doe',
        'Alice',
        'Bob Smith',
        'User with spaces'
      ]

      for (const name of validNames) {
        mockRequest.json.mockResolvedValue({
          name: name,
          email: 'test@example.com',
          password: 'password123'
        })

        const result = await POST(mockRequest)
        expect(result.status).toBe(201)
        expect(User.constructor).toHaveBeenCalledWith(
          expect.objectContaining({ name: name })
        )
      }
    })

    it('should handle empty strings as missing fields', async () => {
      const { POST } = await import('../../../src/app/api/auth/signup/route')

      mockRequest.json.mockResolvedValue({
        name: '',
        email: 'test@example.com',
        password: 'password123'
      })

      const result = await POST(mockRequest)
      expect(result.status).toBe(400)
      expect(result.json()).toEqual({ error: "Missing required fields" })
    })

    it('should handle whitespace-only strings as missing fields', async () => {
      const { POST } = await import('../../../src/app/api/auth/signup/route')

      mockRequest.json.mockResolvedValue({
        name: '   ',
        email: 'test@example.com',
        password: 'password123'
      })

      const result = await POST(mockRequest)
      expect(result.status).toBe(400)
      expect(result.json()).toEqual({ error: "Missing required fields" })
    })

    it('should handle JSON parsing errors', async () => {
      const { POST } = await import('../../../src/app/api/auth/signup/route')

      mockRequest.json.mockRejectedValue(new Error('Invalid JSON'))

      const result = await POST(mockRequest)
      expect(result.status).toBe(500)
      expect(result.json()).toEqual({ error: "An error occurred during signup" })
    })
  })

  describe('Response Headers and Status Codes', () => {
    it('should return correct status code for successful signup', async () => {
      const { User } = await import('../../../models')
      const { POST } = await import('../../../src/app/api/auth/signup/route')

      User.findOne.mockResolvedValue(null)
      const mockSave = vi.fn().mockResolvedValue({})
      User.constructor.mockImplementation(function(userData) {
        this.save = mockSave
        return this
      })

      mockRequest.json.mockResolvedValue({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      })

      const result = await POST(mockRequest)

      expect(result.status).toBe(201)
    })

    it('should return correct status code for validation errors', async () => {
      const { POST } = await import('../../../src/app/api/auth/signup/route')

      mockRequest.json.mockResolvedValue({
        name: 'Test User',
        email: 'test@example.com',
        password: '123'
      })

      const result = await POST(mockRequest)

      expect(result.status).toBe(400)
    })

    it('should return correct status code for duplicate user', async () => {
      const { User } = await import('../../../models')
      const { POST } = await import('../../../src/app/api/auth/signup/route')

      User.findOne.mockResolvedValue({
        _id: '123',
        email: 'test@example.com',
        name: 'Existing User'
      })

      mockRequest.json.mockResolvedValue({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      })

      const result = await POST(mockRequest)

      expect(result.status).toBe(400)
    })

    it('should return correct status code for server errors', async () => {
      const { User } = await import('../../../models')
      const { POST } = await import('../../../src/app/api/auth/signup/route')

      User.findOne.mockRejectedValue(new Error('Database error'))

      mockRequest.json.mockResolvedValue({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      })

      const result = await POST(mockRequest)

      expect(result.status).toBe(500)
    })
  })
})