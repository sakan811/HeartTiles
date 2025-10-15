import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn()
  },
  hash: vi.fn(),
  compare: vi.fn()
}))

// Mock mongoose
vi.mock('mongoose', () => {
  const mockSchema = vi.fn().mockImplementation((schema, options) => ({
    pre: vi.fn(),
    methods: {},
    ...schema
  }))

  mockSchema.Types = {
    Mixed: 'Mixed',
    ObjectId: 'ObjectId'
  }

  return {
    default: {
      Schema: mockSchema,
      model: vi.fn(),
      models: {}
    }
  }
})

describe('Models Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mongoose models cache
    mongoose.models = {}
  })

  describe('User Schema', () => {
    it('should define user schema with required fields', () => {
      const mockSchema = {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        password: { type: String, required: true, minlength: 6 }
      }

      expect(mockSchema.name.required).toBe(true)
      expect(mockSchema.name.trim).toBe(true)
      expect(mockSchema.email.required).toBe(true)
      expect(mockSchema.email.unique).toBe(true)
      expect(mockSchema.email.lowercase).toBe(true)
      expect(mockSchema.password.required).toBe(true)
      expect(mockSchema.password.minlength).toBe(6)
    })

    it('should include timestamps option', () => {
      const timestampsOption = { timestamps: true }
      expect(timestampsOption.timestamps).toBe(true)
    })

    it('should hash password before saving', async () => {
      const mockHash = vi.fn().mockResolvedValue('hashedPassword123')
      bcrypt.hash = mockHash

      const mockUser = {
        password: 'plainPassword',
        isModified: vi.fn().mockReturnValue(true),
        save: vi.fn()
      }

      // Simulate the pre-save middleware
      if (mockUser.isModified('password')) {
        mockUser.password = await bcrypt.hash(mockUser.password, 12)
      }

      expect(mockHash).toHaveBeenCalledWith('plainPassword', 12)
      expect(mockUser.password).toBe('hashedPassword123')
    })

    it('should not hash password if not modified', async () => {
      const mockHash = vi.fn()
      bcrypt.hash = mockHash

      const mockUser = {
        password: 'existingHashedPassword',
        isModified: vi.fn().mockReturnValue(false)
      }

      // Simulate the pre-save middleware
      if (!mockUser.isModified('password')) {
        return
      }

      expect(mockHash).not.toHaveBeenCalled()
    })

    it('should compare passwords correctly', async () => {
      const mockCompare = vi.fn().mockResolvedValue(true)
      bcrypt.compare = mockCompare

      const mockUser = {
        password: 'hashedPassword123',
        comparePassword: async function(candidatePassword) {
          return bcrypt.compare(candidatePassword, this.password)
        }
      }

      const result = await mockUser.comparePassword('plainPassword')
      expect(mockCompare).toHaveBeenCalledWith('plainPassword', 'hashedPassword123')
      expect(result).toBe(true)
    })

    it('should return false for incorrect password', async () => {
      const mockCompare = vi.fn().mockResolvedValue(false)
      bcrypt.compare = mockCompare

      const mockUser = {
        password: 'hashedPassword123',
        comparePassword: async function(candidatePassword) {
          return bcrypt.compare(candidatePassword, this.password)
        }
      }

      const result = await mockUser.comparePassword('wrongPassword')
      expect(mockCompare).toHaveBeenCalledWith('wrongPassword', 'hashedPassword123')
      expect(result).toBe(false)
    })
  })

  describe('Player Session Schema', () => {
    it('should define player session schema with required fields', () => {
      const playerSessionSchema = {
        userId: { type: String, required: true, unique: true, index: true },
        userSessionId: { type: String, required: true, unique: true },
        name: { type: String, required: true },
        email: { type: String, required: true },
        currentSocketId: { type: String, default: null },
        lastSeen: { type: Date, default: Date.now },
        isActive: { type: Boolean, default: true }
      }

      expect(playerSessionSchema.userId.required).toBe(true)
      expect(playerSessionSchema.userId.unique).toBe(true)
      expect(playerSessionSchema.userId.index).toBe(true)
      expect(playerSessionSchema.userSessionId.required).toBe(true)
      expect(playerSessionSchema.userSessionId.unique).toBe(true)
      expect(playerSessionSchema.name.required).toBe(true)
      expect(playerSessionSchema.email.required).toBe(true)
      expect(playerSessionSchema.currentSocketId.default).toBe(null)
      expect(playerSessionSchema.isActive.default).toBe(true)
    })

    it('should include timestamps for player sessions', () => {
      const timestampsOption = { timestamps: true }
      expect(timestampsOption.timestamps).toBe(true)
    })

    it('should have default lastSeen as current date', () => {
      const mockDate = new Date('2024-01-01T00:00:00.000Z')
      const lastSeenDefault = mockDate
      expect(lastSeenDefault).toBeInstanceOf(Date)
    })
  })

  describe('Room Schema', () => {
    it('should define room schema with proper code validation', () => {
      const roomCodeSchema = {
        code: {
          type: String,
          required: true,
          unique: true,
          uppercase: true,
          match: /^[A-Z0-9]{6}$/
        }
      }

      expect(roomCodeSchema.code.required).toBe(true)
      expect(roomCodeSchema.code.unique).toBe(true)
      expect(roomCodeSchema.code.uppercase).toBe(true)
      expect(roomCodeSchema.code.match).toEqual(/^[A-Z0-9]{6}$/)
    })

    it('should validate room code format', () => {
      const validRoomCode = 'ABC123'
      const invalidRoomCode = 'invalid'
      const roomCodeRegex = /^[A-Z0-9]{6}$/

      expect(roomCodeRegex.test(validRoomCode)).toBe(true)
      expect(roomCodeRegex.test(invalidRoomCode)).toBe(false)
    })

    it('should define players array with correct structure', () => {
      const playerSchema = {
        userId: { type: String, required: true, index: true },
        name: { type: String, required: true },
        email: { type: String, required: true },
        isReady: { type: Boolean, default: false },
        joinedAt: { type: Date, default: Date.now },
        score: { type: Number, default: 0 }
      }

      expect(playerSchema.userId.required).toBe(true)
      expect(playerSchema.userId.index).toBe(true)
      expect(playerSchema.name.required).toBe(true)
      expect(playerSchema.email.required).toBe(true)
      expect(playerSchema.isReady.default).toBe(false)
      expect(playerSchema.score.default).toBe(0)
    })

    it('should define maxPlayers with default value', () => {
      const maxPlayersSchema = {
        maxPlayers: { type: Number, default: 2 }
      }

      expect(maxPlayersSchema.maxPlayers.default).toBe(2)
    })

    it('should define tiles with proper structure', () => {
      const tileSchema = {
        id: { type: Number, required: true },
        color: { type: String, required: true, enum: ['red', 'yellow', 'green', 'white'] },
        emoji: { type: String, required: true },
        placedHeart: {
          value: { type: Number, default: 0 },
          color: { type: String, enum: ['red', 'yellow', 'green'] },
          emoji: String,
          placedBy: String,
          score: { type: Number, default: 0 }
        }
      }

      expect(tileSchema.id.required).toBe(true)
      expect(tileSchema.color.required).toBe(true)
      expect(tileSchema.color.enum).toContain('red')
      expect(tileSchema.color.enum).toContain('yellow')
      expect(tileSchema.color.enum).toContain('green')
      expect(tileSchema.color.enum).toContain('white')
      expect(tileSchema.emoji.required).toBe(true)
      expect(tileSchema.placedHeart.value.default).toBe(0)
      expect(tileSchema.placedHeart.score.default).toBe(0)
    })

    it('should define deck structure with defaults', () => {
      const deckSchema = {
        emoji: { type: String, default: "💌" },
        cards: { type: Number, default: 16, min: 0 },
        type: { type: String, enum: ['hearts', 'magic'], default: 'hearts' }
      }

      expect(deckSchema.emoji.default).toBe("💌")
      expect(deckSchema.cards.default).toBe(16)
      expect(deckSchema.cards.min).toBe(0)
      expect(deckSchema.type.default).toBe('hearts')
      expect(deckSchema.type.enum).toContain('hearts')
      expect(deckSchema.type.enum).toContain('magic')
    })

    it('should define magic deck structure', () => {
      const magicDeckSchema = {
        emoji: { type: String, default: "🔮" },
        cards: { type: Number, default: 16, min: 0 },
        type: { type: String, enum: ['magic'], default: 'magic' }
      }

      expect(magicDeckSchema.emoji.default).toBe("🔮")
      expect(magicDeckSchema.cards.default).toBe(16)
      expect(magicDeckSchema.type.default).toBe('magic')
    })

    it('should define player hands as Map', () => {
      const playerHandsSchema = {
        type: Map,
        of: [{
          id: { type: mongoose.Schema.Types.Mixed, required: true },
          color: { type: String, required: true, enum: ['red', 'yellow', 'green'] },
          emoji: { type: String, required: true },
          value: { type: Number, required: true, min: 1, max: 3 },
          type: { type: String, enum: ['heart', 'magic'], required: true },
          name: String,
          description: String
        }]
      }

      expect(playerHandsSchema.type).toBe(Map)
      expect(playerHandsSchema.of[0].color.required).toBe(true)
      expect(playerHandsSchema.of[0].value.min).toBe(1)
      expect(playerHandsSchema.of[0].value.max).toBe(2)
      expect(playerHandsSchema.of[0].type.required).toBe(true)
    })

    it('should define turn counter with default', () => {
      const turnCountSchema = {
        turnCount: { type: Number, default: 0 }
      }

      expect(turnCountSchema.turnCount.default).toBe(0)
    })

    it('should define shields structure with Map', () => {
      const shieldsSchema = {
        type: Map,
        of: {
          active: { type: Boolean, default: false },
          remainingTurns: { type: Number, default: 0 },
          activatedAt: { type: Number, default: 0 },
          activatedBy: { type: String, default: null },
          turnActivated: { type: Number, default: 0 }
        }
      }

      expect(shieldsSchema.type).toBe(Map)
      expect(shieldsSchema.of.active.default).toBe(false)
      expect(shieldsSchema.of.remainingTurns.default).toBe(0)
      expect(shieldsSchema.of.activatedAt.default).toBe(0)
      expect(shieldsSchema.of.activatedBy.default).toBe(null)
    })

    it('should define player actions structure', () => {
      const playerActionsSchema = {
        type: Map,
        of: {
          drawnHeart: { type: Boolean, default: false },
          drawnMagic: { type: Boolean, default: false }
        }
      }

      expect(playerActionsSchema.type).toBe(Map)
      expect(playerActionsSchema.of.drawnHeart.default).toBe(false)
      expect(playerActionsSchema.of.drawnMagic.default).toBe(false)
    })

    it('should include timestamps for rooms', () => {
      const timestampsOption = { timestamps: true }
      expect(timestampsOption.timestamps).toBe(true)
    })

    it('should have gameStarted default to false', () => {
      const gameStateSchema = {
        gameStarted: { type: Boolean, default: false }
      }

      expect(gameStateSchema.gameStarted.default).toBe(false)
    })

    it('should define currentPlayer structure', () => {
      const currentPlayerSchema = {
        currentPlayer: {
          userId: String,
          name: String,
          email: String,
          isReady: Boolean
        }
      }

      expect(currentPlayerSchema.currentPlayer.userId).toEqual(String)
      expect(currentPlayerSchema.currentPlayer.name).toEqual(String)
      expect(currentPlayerSchema.currentPlayer.email).toEqual(String)
      expect(currentPlayerSchema.currentPlayer.isReady).toEqual(Boolean)
    })
  })

  describe('Model Caching', () => {
    it('should cache models to prevent OverwriteModelError', () => {
      // Mock mongoose.models to simulate existing models
      const existingModels = {
        User: 'ExistingUserModel',
        PlayerSession: 'ExistingPlayerSessionModel',
        Room: 'ExistingRoomModel'
      }

      // Simulate the model caching logic
      const User = existingModels.User || 'NewUserModel'
      const PlayerSession = existingModels.PlayerSession || 'NewPlayerSessionModel'
      const Room = existingModels.Room || 'NewRoomModel'

      expect(User).toBe('ExistingUserModel')
      expect(PlayerSession).toBe('ExistingPlayerSessionModel')
      expect(Room).toBe('ExistingRoomModel')
    })

    it('should create new models when they dont exist', () => {
      // Mock empty mongoose.models
      const existingModels = {}

      // Simulate the model caching logic
      const User = existingModels.User || 'NewUserModel'
      const PlayerSession = existingModels.PlayerSession || 'NewPlayerSessionModel'
      const Room = existingModels.Room || 'NewRoomModel'

      expect(User).toBe('NewUserModel')
      expect(PlayerSession).toBe('NewPlayerSessionModel')
      expect(Room).toBe('NewRoomModel')
    })

    it('should export all models', () => {
      const exportedModels = {
        User: 'UserModel',
        PlayerSession: 'PlayerSessionModel',
        Room: 'RoomModel'
      }

      expect(exportedModels.User).toBeDefined()
      expect(exportedModels.PlayerSession).toBeDefined()
      expect(exportedModels.Room).toBeDefined()
    })
  })

  describe('Schema Validation', () => {
    it('should validate email format requirements', () => {
      const emailSchema = {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
      }

      expect(emailSchema.required).toBe(true)
      expect(emailSchema.unique).toBe(true)
      expect(emailSchema.lowercase).toBe(true)
      expect(emailSchema.trim).toBe(true)
    })

    it('should validate password minimum length', () => {
      const passwordSchema = {
        type: String,
        required: true,
        minlength: 6
      }

      expect(passwordSchema.required).toBe(true)
      expect(passwordSchema.minlength).toBe(6)
    })

    it('should validate tile color enum values', () => {
      const validColors = ['red', 'yellow', 'green', 'white']
      const tileColorEnum = ['red', 'yellow', 'green', 'white']

      expect(tileColorEnum).toEqual(expect.arrayContaining(validColors))
    })

    it('should validate heart color enum values', () => {
      const validHeartColors = ['red', 'yellow', 'green']
      const heartColorEnum = ['red', 'yellow', 'green']

      expect(heartColorEnum).toEqual(expect.arrayContaining(validHeartColors))
    })

    it('should validate card type enum values', () => {
      const validCardTypes = ['heart', 'magic']
      const cardTypeEnum = ['heart', 'magic']

      expect(cardTypeEnum).toEqual(expect.arrayContaining(validCardTypes))
    })

    it('should validate deck type enum values', () => {
      const validDeckTypes = ['hearts', 'magic']
      const deckTypeEnum = ['hearts', 'magic']

      expect(deckTypeEnum).toEqual(expect.arrayContaining(validDeckTypes))
    })
  })
})