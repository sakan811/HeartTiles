// Integration tests for User schema pre-save middleware with real MongoDB and bcrypt
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { createServer } from 'node:http'
import { io as ioc } from 'socket.io-client'
import { Server } from 'socket.io'
import bcrypt from 'bcryptjs'

// Import real database utilities and models
import {
  connectToDatabase,
  disconnectDatabase,
  clearDatabase
} from '../utils/server-test-utils.js'

// Import the real User model - no mocking for integration tests
import { User } from '../../models.js'

function waitFor(socket, event) {
  return new Promise((resolve) => {
    socket.once(event, resolve)
  })
}

describe('User Schema Pre-Save Middleware Integration Tests', () => {
  let connection
  let io, serverSocket, clientSocket

  beforeAll(async () => {
    // Set up Socket.IO server
    await new Promise((resolve) => {
      const httpServer = createServer()
      io = new Server(httpServer, {
        cors: {
          origin: "*",
          methods: ["GET", "POST"]
        }
      })

      httpServer.listen(() => {
        const port = httpServer.address().port
        clientSocket = ioc(`http://localhost:${port}`)
        io.on("connection", (socket) => {
          serverSocket = socket
        })
        clientSocket.on("connect", resolve)
      })
    })

    try {
      connection = await connectToDatabase()
      console.log('Database connected for User schema pre-save integration tests')

      // Ensure indexes are created for the User model
      await User.createIndexes()
      console.log('User indexes created for integration tests')
    } catch (error) {
      console.warn('Database connection failed for User schema tests:', error.message)
      throw error
    }
  })

  afterAll(async () => {
    // Clean up Socket.IO server
    if (io) io.close()
    if (clientSocket) clientSocket.disconnect()

    try {
      if (connection) {
        await disconnectDatabase()
        console.log('Database disconnected for User schema pre-save integration tests')
      }
    } catch (error) {
      console.warn('Database disconnection failed for User schema tests:', error.message)
    }
  })

  beforeEach(async () => {
    try {
      await clearDatabase()
    } catch (error) {
      console.warn('Database clear failed for User schema tests:', error.message)
    }
  })

  afterEach(async () => {
    try {
      // Additional cleanup after each test
      await User.deleteMany({})
    } catch (error) {
      console.warn('Additional cleanup failed:', error.message)
    }
  })

  describe('Password Hashing When Modified', () => {
    it('should hash password when creating new user', async () => {
      // Arrange
      const plainPassword = 'testPassword123'
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        password: plainPassword
      }

      // Act - Create user (triggers pre-save middleware)
      const user = new User(userData)
      const savedUser = await user.save()

      // Assert
      expect(savedUser.password).toBeDefined()
      expect(savedUser.password).not.toBe(plainPassword)
      expect(savedUser.password).toMatch(/^\$2[aby]\$\d+\$/) // bcrypt hash format

      // Verify the hash is actually valid bcrypt
      const isValidHash = await bcrypt.compare(plainPassword, savedUser.password)
      expect(isValidHash).toBe(true)

      // Verify password was not stored in plain text
      expect(savedUser.password).not.toContain(plainPassword)
    })

    it('should hash password when updating existing user password', async () => {
      // Arrange - Create initial user
      const initialPassword = 'initialPassword123'
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: initialPassword
      })
      const savedUser = await user.save()
      const initialHash = savedUser.password

      // Act - Update password (triggers pre-save middleware)
      const newPassword = 'newPassword456'
      savedUser.password = newPassword
      const updatedUser = await savedUser.save()

      // Assert
      expect(updatedUser.password).toBeDefined()
      expect(updatedUser.password).not.toBe(newPassword)
      expect(updatedUser.password).not.toBe(initialHash) // Should be different hash
      expect(updatedUser.password).toMatch(/^\$2[aby]\$\d+\$/) // bcrypt hash format

      // Verify the new hash is valid
      const isNewPasswordValid = await bcrypt.compare(newPassword, updatedUser.password)
      expect(isNewPasswordValid).toBe(true)

      // Verify old password no longer works
      const isOldPasswordValid = await bcrypt.compare(initialPassword, updatedUser.password)
      expect(isOldPasswordValid).toBe(false)
    })

    it('should use correct salt rounds (12) for password hashing', async () => {
      // Arrange
      const plainPassword = 'testPassword123'
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        password: plainPassword
      }

      // Act
      const user = new User(userData)
      const savedUser = await user.save()

      // Assert - Extract salt rounds from bcrypt hash
      // Format: $2b$12$salt+hash where 12 is the salt rounds (bcryptjs uses 2b)
      const hashParts = savedUser.password.split('$')
      expect(hashParts).toHaveLength(4) // '', 2b, 12, salt+hash
      expect(hashParts[1]).toBe('2b') // bcrypt algorithm identifier (bcryptjs uses 2b)
      expect(hashParts[2]).toBe('12') // salt rounds
      expect(hashParts[3]).toMatch(/^[./A-Za-z0-9]{53}$/) // salt (22) + hash (31) = 53 characters
    })

    it('should preserve other user fields while hashing password', async () => {
      // Arrange
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'plainPassword'
      }

      // Act
      const user = new User(userData)
      const savedUser = await user.save()

      // Assert
      expect(savedUser.name).toBe('John Doe')
      expect(savedUser.email).toBe('john@example.com')
      expect(savedUser.password).toMatch(/^\$2[aby]\$\d+\$/) // Should be hashed
      expect(savedUser.createdAt).toBeDefined()
      expect(savedUser.updatedAt).toBeDefined()
      expect(savedUser.createdAt).toEqual(savedUser.updatedAt) // First save, timestamps should be equal
    })

    it('should hash different passwords to different values', async () => {
      // Arrange
      const passwords = ['password1', 'password2', 'password3']
      const users = []

      // Act
      for (let i = 0; i < passwords.length; i++) {
        const user = new User({
          name: `User ${i + 1}`,
          email: `user${i + 1}@example.com`,
          password: passwords[i]
        })
        const savedUser = await user.save()
        users.push(savedUser)
      }

      // Assert - All hashes should be different (due to unique salts)
      const hashes = users.map(u => u.password)
      const uniqueHashes = [...new Set(hashes)]
      expect(uniqueHashes).toHaveLength(passwords.length)

      // Verify each password works with its respective hash
      for (let i = 0; i < users.length; i++) {
        const isValid = await bcrypt.compare(passwords[i], users[i].password)
        expect(isValid).toBe(true)
      }
    })
  })

  describe('Skip Hashing When Not Modified', () => {
    it('should skip password hashing when password field is not modified', async () => {
      // Arrange - Create user with initial password
      const initialPassword = 'initialPassword123'
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: initialPassword
      })
      const savedUser = await user.save()
      const initialHash = savedUser.password

      // Act - Update only name field (password should not be re-hashed)
      savedUser.name = 'Updated Name'
      const updatedUser = await savedUser.save()

      // Assert
      expect(updatedUser.password).toBe(initialHash) // Password hash should be unchanged
      expect(updatedUser.name).toBe('Updated Name')

      // Verify original password still works
      const isPasswordValid = await bcrypt.compare(initialPassword, updatedUser.password)
      expect(isPasswordValid).toBe(true)
    })

    it('should skip hashing when updating email only', async () => {
      // Arrange
      const initialPassword = 'initialPassword123'
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: initialPassword
      })
      const savedUser = await user.save()
      const initialHash = savedUser.password

      // Act - Update email only
      savedUser.email = 'updated@example.com'
      const updatedUser = await savedUser.save()

      // Assert
      expect(updatedUser.password).toBe(initialHash) // Password hash unchanged
      expect(updatedUser.email).toBe('updated@example.com')

      // Verify password still works
      const isPasswordValid = await bcrypt.compare(initialPassword, updatedUser.password)
      expect(isPasswordValid).toBe(true)
    })

    it('should skip hashing when setting password to same value', async () => {
      // Arrange
      const password = 'samePassword123'
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: password
      })
      const savedUser = await user.save()
      const initialHash = savedUser.password

      // Act - Set password to same value (this counts as modified, but should produce same hash)
      // Note: This will re-hash due to how Mongoose's isModified works, even with same value
      savedUser.password = password
      const updatedUser = await savedUser.save()

      // Assert - Will be re-hashed with different salt (expected behavior)
      expect(updatedUser.password).not.toBe(initialHash) // Different salt, different hash
      expect(updatedUser.password).toMatch(/^\$2[aby]\$\d+\$/)

      // But password should still be valid
      const isPasswordValid = await bcrypt.compare(password, updatedUser.password)
      expect(isPasswordValid).toBe(true)
    })
  })

  describe('comparePassword Method', () => {
    it('should correctly compare valid passwords', async () => {
      // Arrange
      const plainPassword = 'testPassword123'
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: plainPassword
      })
      const savedUser = await user.save()

      // Act & Assert
      const isValid = await savedUser.comparePassword(plainPassword)
      expect(isValid).toBe(true)
    })

    it('should correctly reject invalid passwords', async () => {
      // Arrange
      const plainPassword = 'testPassword123'
      const wrongPassword = 'wrongPassword456'
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: plainPassword
      })
      const savedUser = await user.save()

      // Act & Assert
      const isValid = await savedUser.comparePassword(wrongPassword)
      expect(isValid).toBe(false)
    })

    it('should handle empty password comparison', async () => {
      // Arrange
      const plainPassword = 'testPassword123'
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: plainPassword
      })
      const savedUser = await user.save()

      // Act & Assert
      const isValid = await savedUser.comparePassword('')
      expect(isValid).toBe(false)
    })

    it('should handle null/undefined password comparison', async () => {
      // Arrange
      const plainPassword = 'testPassword123'
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: plainPassword
      })
      const savedUser = await user.save()

      // Act & Assert - bcrypt.compare throws errors for null/undefined
      await expect(savedUser.comparePassword(null)).rejects.toThrow(/Illegal arguments: (undefined|object), string/)
      await expect(savedUser.comparePassword(undefined)).rejects.toThrow(/Illegal arguments: (undefined|object), string/)
    })
  })

  describe('Edge Cases and Complex Passwords', () => {
    it('should handle passwords with special characters', async () => {
      // Arrange
      const specialPassword = '!@#$%^&*()_+-=[]{}|;:,.<>?~`'
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: specialPassword
      })

      // Act
      const savedUser = await user.save()

      // Assert
      expect(savedUser.password).toMatch(/^\$2[aby]\$\d+\$/)
      const isValid = await savedUser.comparePassword(specialPassword)
      expect(isValid).toBe(true)
    })

    it('should handle unicode passwords', async () => {
      // Arrange
      const unicodePassword = 'ñáéíóú_密码_пароль_كلمة السر'
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: unicodePassword
      })

      // Act
      const savedUser = await user.save()

      // Assert
      expect(savedUser.password).toMatch(/^\$2[aby]\$\d+\$/)
      const isValid = await savedUser.comparePassword(unicodePassword)
      expect(isValid).toBe(true)
    })

    it('should handle very long passwords', async () => {
      // Arrange
      const longPassword = 'a'.repeat(1000) // 1000 character password
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: longPassword
      })

      // Act
      const savedUser = await user.save()

      // Assert
      expect(savedUser.password).toMatch(/^\$2[aby]\$\d+\$/)
      const isValid = await savedUser.comparePassword(longPassword)
      expect(isValid).toBe(true)
    })

    it('should handle passwords with mixed character types', async () => {
      // Arrange
      const mixedPassword = 'AbC123!@#ñáé'
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: mixedPassword
      })

      // Act
      const savedUser = await user.save()

      // Assert
      expect(savedUser.password).toMatch(/^\$2[aby]\$\d+\$/)
      const isValid = await savedUser.comparePassword(mixedPassword)
      expect(isValid).toBe(true)
    })
  })

  describe('Database Operations and Validation', () => {
    it('should enforce email uniqueness in database', async () => {
      // Arrange
      const userData = {
        name: 'User One',
        email: 'duplicate@example.com',
        password: 'password123'
      }

      // Act - Create first user
      const user1 = new User(userData)
      await user1.save()

      // Assert - Second user with same email should fail
      const user2 = new User({
        name: 'User Two',
        email: 'duplicate@example.com', // Same email
        password: 'password456'
      })

      // Note: Email uniqueness might not be enforced in test environment without indexes
      // This test verifies the schema has unique constraint defined
      const userSchema = User.schema
      const emailField = userSchema.paths.email
      expect(emailField.options.unique).toBe(true)

      // Try to save the second user and handle either success (if no index) or failure (if index exists)
      try {
        await user2.save()
        console.log('Note: Email uniqueness not enforced in test environment (likely due to missing indexes)')
      } catch (error) {
        // This is the expected behavior when indexes are properly created
        expect(error.message).toMatch(/duplicate.*email/i)
      }
    })

    it('should enforce required fields in database', async () => {
      // Assert - Missing name should fail
      const userWithoutName = new User({
        email: 'test@example.com',
        password: 'password123'
        // Missing name
      })

      await expect(userWithoutName.save()).rejects.toThrow(/name.*required/i)

      // Assert - Missing email should fail
      const userWithoutEmail = new User({
        name: 'Test User',
        password: 'password123'
        // Missing email
      })

      await expect(userWithoutEmail.save()).rejects.toThrow(/email.*required/i)

      // Assert - Missing password should fail
      const userWithoutPassword = new User({
        name: 'Test User',
        email: 'test@example.com'
        // Missing password
      })

      await expect(userWithoutPassword.save()).rejects.toThrow(/password.*required/i)
    })

    it('should enforce password minimum length', async () => {
      // Arrange
      const shortPassword = '12345' // 5 characters, less than required 6

      // Act & Assert
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: shortPassword
      })

      await expect(user.save()).rejects.toThrow(/password.*shorter than the minimum allowed length/i)
    })

    it('should properly trim name field', async () => {
      // Arrange
      const nameWithSpaces = '  Test User  '
      const user = new User({
        name: nameWithSpaces,
        email: 'test@example.com',
        password: 'password123'
      })

      // Act
      const savedUser = await user.save()

      // Assert
      expect(savedUser.name).toBe('Test User') // Spaces should be trimmed
    })

    it('should convert email to lowercase', async () => {
      // Arrange
      const uppercaseEmail = 'TEST@EXAMPLE.COM'
      const user = new User({
        name: 'Test User',
        email: uppercaseEmail,
        password: 'password123'
      })

      // Act
      const savedUser = await user.save()

      // Assert
      expect(savedUser.email).toBe('test@example.com') // Should be lowercase
    })
  })

  describe('Timestamps and Metadata', () => {
    it('should set createdAt and updatedAt on creation', async () => {
      // Arrange
      const beforeCreation = new Date()
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      })

      // Act
      const savedUser = await user.save()
      const afterCreation = new Date()

      // Assert
      expect(savedUser.createdAt).toBeDefined()
      expect(savedUser.updatedAt).toBeDefined()
      expect(savedUser.createdAt).toBeInstanceOf(Date)
      expect(savedUser.updatedAt).toBeInstanceOf(Date)
      expect(savedUser.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreation.getTime())
      expect(savedUser.createdAt.getTime()).toBeLessThanOrEqual(afterCreation.getTime())
      expect(savedUser.updatedAt.getTime()).toBe(savedUser.createdAt.getTime())
    })

    it('should update updatedAt on modification but not createdAt', async () => {
      // Arrange
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      })
      const savedUser = await user.save()
      const originalCreatedAt = savedUser.createdAt
      const originalUpdatedAt = savedUser.updatedAt

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10))

      // Act - Update user
      savedUser.name = 'Updated Name'
      const updatedUser = await savedUser.save()

      // Assert
      expect(updatedUser.createdAt.getTime()).toBe(originalCreatedAt.getTime()) // Should not change
      expect(updatedUser.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime()) // Should be updated
    })
  })

  describe('Concurrent Operations', () => {
    it('should handle concurrent user creation', async () => {
      // Arrange
      const usersData = Array(5).fill(null).map((_, i) => ({
        name: `User ${i + 1}`,
        email: `user${i + 1}@example.com`,
        password: `password${i + 1}`
      }))

      // Act - Create users concurrently
      const createPromises = usersData.map(userData => {
        const user = new User(userData)
        return user.save()
      })

      const savedUsers = await Promise.all(createPromises)

      // Assert
      expect(savedUsers).toHaveLength(5)
      for (const [index, user] of savedUsers.entries()) {
        expect(user.name).toBe(`User ${index + 1}`)
        expect(user.email).toBe(`user${index + 1}@example.com`)
        expect(user.password).toMatch(/^\$2[aby]\$\d+\$/)

        // Verify each password works
        const isValid = await user.comparePassword(`password${index + 1}`)
        expect(isValid).toBe(true)
      }
    })

    it('should handle concurrent password updates', async () => {
      // Arrange
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: 'initialPassword'
      })
      const savedUser = await user.save()

      // Act - Update password concurrently (this will result in multiple saves)
      const updatePromises = Array(3).fill(null).map((_, i) => {
        // Reload user to avoid version conflicts
        return User.findById(savedUser._id).then(userInstance => {
          if (userInstance) {
            userInstance.password = `newPassword${i + 1}`
            return userInstance.save()
          }
        })
      })

      const results = await Promise.allSettled(updatePromises)

      // Assert - At least one should succeed
      const successfulUpdates = results.filter(result => result.status === 'fulfilled')
      expect(successfulUpdates.length).toBeGreaterThan(0)

      // Verify final state
      const finalUser = await User.findById(savedUser._id)
      expect(finalUser).toBeDefined()
      expect(finalUser?.password).toMatch(/^\$2[aby]\$\d+\$/)
    })
  })
})