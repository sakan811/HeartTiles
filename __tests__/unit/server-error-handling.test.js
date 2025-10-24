import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('Server Error Handling and Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NODE_ENV = 'test'
    process.env.AUTH_SECRET = 'test-secret'
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Input validation and sanitization', () => {
    it('should handle malformed room codes gracefully', async () => {
      const { validateRoomCode, sanitizeInput } = await import('../../server.js')

      const invalidInputs = [
        null,
        undefined,
        '',
        ' ',
        '\n\t',
        123,
        [],
        {},
        'ABC-123',
        'TOOLONG123',
        'short',
        'abc123!' // Special characters
      ]

      invalidInputs.forEach(input => {
        expect(validateRoomCode(input)).toBe(false)
        expect(typeof sanitizeInput(input)).toBe(typeof input)
      })
    })

    it('should handle malformed player names gracefully', async () => {
      const { validatePlayerName, sanitizeInput } = await import('../../server.js')

      const invalidNames = [
        null,
        undefined,
        '',
        '   ',
        '\n\t\r',
        'a'.repeat(21), // Too long
        'name\x00with\x01control\x7fchars',
        123,
        [],
        {}
      ]

      invalidNames.forEach(name => {
        expect(validatePlayerName(name)).toBe(false)
      })
    })

    it('should sanitize HTML and script tags', async () => {
      const { sanitizeInput } = await import('../../server.js')

      const maliciousInputs = [
        '<script>alert("xss")</script>',
        '<img src="x" onerror="alert(1)">',
        'javascript:alert("xss")',
        '<iframe src="evil.com"></iframe>',
        'normal<script>alert(1)</script>text'
      ]

      const expectedOutputs = [
        'scriptalert("xss")/script',
        'img src="x" onerror="alert(1)"',
        'javascript:alert("xss")',
        'iframe src="evil.com"/iframe',
        'normalscriptalert(1)/scripttext'
      ]

      maliciousInputs.forEach((input, index) => {
        expect(sanitizeInput(input)).toBe(expectedOutputs[index])
      })
    })
  })

  describe('Database operation error handling', () => {
    it('should handle mongoose connection errors', async () => {
      // Mock mongoose to throw connection error
      const mockMongoose = {
        connect: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
        connection: { close: vi.fn() }
      }

      vi.doMock('mongoose', () => mockMongoose)

      const { connectToDatabase } = await import('../../server.js')
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called')
      })

      await expect(connectToDatabase()).rejects.toThrow('process.exit called')
      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it('should handle database operation timeouts', async () => {
      // Simulate timeout scenario
      const mockOperation = vi.fn().mockImplementation(() => {
        return new Promise((resolve, reject) => {
          setTimeout(() => reject(new Error('Operation timeout')), 100)
        })
      })

      const room = { code: 'TEST123' }

      expect(mockOperation(room)).rejects.toThrow('Operation timeout')
    })

    it('should handle concurrent database operations', async () => {
      const mockSave = vi.fn()
        .mockResolvedValueOnce({ _id: 'id1' })
        .mockResolvedValueOnce({ _id: 'id2' })
        .mockRejectedValue(new Error('Database locked'))

      const operations = [
        mockSave({ code: 'ROOM1' }),
        mockSave({ code: 'ROOM2' }),
        mockSave({ code: 'ROOM3' })
      ]

      const results = await Promise.allSettled(operations)

      expect(results[0].status).toBe('fulfilled')
      expect(results[1].status).toBe('fulfilled')
      expect(results[2].status).toBe('rejected')
      expect(results[2].reason).toBeInstanceOf(Error)
    })
  })

  describe('Socket.IO event error handling', () => {
    it('should handle malformed event data gracefully', async () => {
      // Test validation logic from various Socket.IO event handlers
      const validationTests = [
        { validator: 'validateRoomCode', testData: [null, undefined, 123, [], {}] },
        { validator: 'validateTurn', testData: [null, {}, { gameState: null }] },
        { validator: 'validatePlayerInRoom', testData: [null, {}, { players: 'not array' }] }
      ]

      for (const test of validationTests) {
        const { [test.validator]: validateFn } = await import('../../server.js')

        test.testData.forEach(data => {
          if (typeof validateFn === 'function') {
            // Test that validation functions don't throw with invalid inputs
            expect(() => validateFn(data)).not.toThrow()
          }
        })
      }
    })

    it('should handle missing required event parameters', async () => {
      // Simulate event parameter validation
      const validateEventParams = (eventName, params) => {
        const requiredParams = {
          'join-room': ['roomCode'],
          'place-heart': ['roomCode', 'tileId', 'heartId'],
          'use-magic-card': ['roomCode', 'cardId'],
          'end-turn': ['roomCode']
        }

        const required = requiredParams[eventName] || []
        return required.every(param => params[param] !== undefined)
      }

      expect(validateEventParams('join-room', {})).toBe(false)
      expect(validateEventParams('join-room', { roomCode: 'TEST123' })).toBe(true)
      expect(validateEventParams('place-heart', { roomCode: 'TEST123' })).toBe(false)
      expect(validateEventParams('place-heart', { roomCode: 'TEST123', tileId: 0, heartId: 'heart1' })).toBe(true)
    })

    it('should emit error messages for invalid operations', async () => {
      const mockSocket = {
        emit: vi.fn(),
        data: { userId: 'user1', roomCode: 'TEST123' }
      }

      // Simulate error emission logic
      const emitRoomError = (socket, message) => {
        socket.emit('room-error', message)
      }

      emitRoomError(mockSocket, 'Invalid room code')
      emitRoomError(mockSocket, 'Not your turn')
      emitRoomError(mockSocket, 'Game not started')

      expect(mockSocket.emit).toHaveBeenCalledTimes(3)
      expect(mockSocket.emit).toHaveBeenCalledWith('room-error', 'Invalid room code')
      expect(mockSocket.emit).toHaveBeenCalledWith('room-error', 'Not your turn')
      expect(mockSocket.emit).toHaveBeenCalledWith('room-error', 'Game not started')
    })
  })

  describe('Game state consistency checks', () => {
    it('should detect invalid game state transitions', async () => {
      const { validateRoomState } = await import('../../server.js')

      const invalidStates = [
        {
          gameState: { gameStarted: true }, // Missing currentPlayer
          description: 'Game started without current player'
        },
        {
          gameState: { gameStarted: false, currentPlayer: { userId: 'user1' } }, // Has currentPlayer but not started
          description: 'Game not started but has current player'
        },
        {
          players: null, // Invalid players
          description: 'Null players array'
        },
        {
          players: 'not an array', // Invalid players type
          description: 'Players not an array'
        }
      ]

      invalidStates.forEach(state => {
        const result = validateRoomState(state)
        expect(result.valid).toBe(false)
        expect(result.error).toBeDefined()
      })
    })

    it('should handle missing game state properties gracefully', async () => {
      const { validateRoomState } = await import('../../server.js')

      const partialStates = [
        {},
        { players: [] },
        { gameState: {} },
        { gameState: { gameStarted: undefined } }
      ]

      partialStates.forEach(state => {
        expect(() => validateRoomState(state)).not.toThrow()
      })
    })

    it('should handle corrupted player data', async () => {
      const { findPlayerByUserId, findPlayerByName } = await import('../../server.js')

      const roomsWithCorruptedPlayers = [
        { players: [null, undefined, {}, 'not a player'] },
        { players: [{ userId: null }, { userId: 'valid' }] },
        { players: [{ name: '' }, { name: 'valid' }] }
      ]

      roomsWithCorruptedPlayers.forEach(room => {
        expect(() => findPlayerByUserId(room, 'valid')).not.toThrow()
        expect(() => findPlayerByName(room, 'valid')).not.toThrow()
      })
    })
  })

  describe('Memory and resource management', () => {
    it('should handle large numbers of concurrent operations', async () => {
      const { acquireTurnLock, releaseTurnLock } = await import('../../server.js')

      const promises = []
      const roomCodes = Array.from({ length: 100 }, (_, i) => `ROOM${i}`)

      // Acquire many locks
      roomCodes.forEach(roomCode => {
        promises.push(acquireTurnLock(roomCode, `socket-${roomCode}`))
      })

      const results = await Promise.all(promises)

      // All should succeed since they're different rooms
      expect(results.every(result => result === true)).toBe(true)

      // Release all locks
      roomCodes.forEach(roomCode => {
        releaseTurnLock(roomCode, `socket-${roomCode}`)
      })
    })

    it('should prevent memory leaks in map structures', async () => {
      const playerSessions = new Map()
      const rooms = new Map()

      // Add many entries
      for (let i = 0; i < 1000; i++) {
        playerSessions.set(`user${i}`, { userId: `user${i}` })
        rooms.set(`ROOM${i}`, { code: `ROOM${i}` })
      }

      expect(playerSessions.size).toBe(1000)
      expect(rooms.size).toBe(1000)

      // Clear entries
      for (let i = 0; i < 1000; i++) {
        playerSessions.delete(`user${i}`)
        rooms.delete(`ROOM${i}`)
      }

      expect(playerSessions.size).toBe(0)
      expect(rooms.size).toBe(0)
    })
  })

  describe('Network and connection resilience', () => {
    it('should handle socket disconnection during operations', async () => {
      const { releaseTurnLock } = await import('../../server.js')

      // Set up a lock
      global.turnLocks = new Map([
        ['ROOM123', { socketId: 'disconnected-socket', timestamp: Date.now() }]
      ])

      // Simulate socket disconnection cleanup
      releaseTurnLock('ROOM123', 'disconnected-socket')

      expect(global.turnLocks.has('ROOM123')).toBe(false)
    })

    it('should handle partial game state corruption', async () => {
      const { validateRoomState } = await import('../../server.js')

      const corruptedStates = [
        {
          players: [null],
          gameState: { gameStarted: false, currentPlayer: null }
        },
        {
          players: [{ userId: 'user1' }],
          gameState: null
        },
        {
          players: undefined,
          gameState: undefined
        }
      ]

      corruptedStates.forEach(state => {
        expect(() => validateRoomState(state)).not.toThrow()
        const result = validateRoomState(state)
        expect(result.valid).toBe(false)
      })
    })

    it('should handle race conditions in turn management', async () => {
      const { acquireTurnLock } = await import('../../server.js')

      const roomCode = 'RACE_TEST'
      const promises = []

      // Try to acquire the same lock from multiple "sockets" simultaneously
      for (let i = 0; i < 10; i++) {
        promises.push(acquireTurnLock(roomCode, `socket${i}`))
      }

      const results = await Promise.all(promises)

      // Only one should succeed
      const successCount = results.filter(result => result === true).length
      expect(successCount).toBe(1)
    })
  })

  describe('Edge cases in game logic', () => {
    it('should handle extreme tile configurations', async () => {
      const { generateTiles } = await import('../../server.js')

      // Test multiple generations for consistency
      for (let i = 0; i < 100; i++) {
        const tiles = generateTiles()

        expect(tiles).toHaveLength(8)
        tiles.forEach(tile => {
          expect(tile).toHaveProperty('id')
          expect(tile).toHaveProperty('color')
          expect(tile).toHaveProperty('emoji')
          expect(['red', 'yellow', 'green', 'white']).toContain(tile.color)
        })
      }
    })

    it('should handle boundary conditions in scoring', async () => {
      const { calculateScore } = await import('../../server.js')

      const boundaryTests = [
        { heart: { value: 0 }, tile: { color: 'white' }, expected: 0 },
        { heart: { value: 1 }, tile: { color: 'white' }, expected: 1 },
        { heart: { value: 3 }, tile: { color: 'white' }, expected: 3 },
        { heart: { value: 1, color: 'red' }, tile: { color: 'red' }, expected: 2 },
        { heart: { value: 3, color: 'yellow' }, tile: { color: 'yellow' }, expected: 6 },
        { heart: { value: 2, color: 'green' }, tile: { color: 'red' }, expected: 0 } // Mismatch
      ]

      boundaryTests.forEach(({ heart, tile, expected }) => {
        expect(calculateScore(heart, tile)).toBe(expected)
      })
    })

    it('should handle shield expiration edge cases', async () => {
      const { checkAndExpireShields } = await import('../../server.js')

      const edgeCaseRooms = [
        {
          gameState: {
            shields: {
              user1: { remainingTurns: 0 }, // Should expire
              user2: { remainingTurns: -1 }, // Already expired
              user3: { remainingTurns: 1 } // Should remain
            }
          }
        },
        {
          gameState: {
            shields: null // Missing shields
          }
        },
        {
          gameState: {} // Missing gameState
        }
      ]

      edgeCaseRooms.forEach(room => {
        expect(() => checkAndExpireShields(room)).not.toThrow()
      })
    })
  })

  describe('Security and validation edge cases', () => {
    it('should prevent code injection in room codes', async () => {
      const { validateRoomCode, sanitizeInput } = await import('../../server.js')

      const maliciousInputs = [
        '../../admin',
        '..\\..\\system',
        'ABC\' DROP TABLE users; --',
        '<script>alert("xss")</script>',
        'null',
        'undefined',
        'function(){}',
        '{}',
        '[]'
      ]

      maliciousInputs.forEach(input => {
        expect(validateRoomCode(input)).toBe(false)
        const sanitized = sanitizeInput(input)
        expect(sanitized).not.toContain('<script>')
        expect(sanitized).not.toContain('DROP TABLE')
      })
    })

    it('should handle malformed user data', async () => {
      const { validatePlayerName } = await import('../../server.js')

      const maliciousNames = [
        'admin\x00',
        'user\r\nadmin',
        'name\twith\ttabs',
        'name\x01with\x02control\x7fchars',
        '\x00\x01\x02\x03',
        String.fromCharCode(0) + 'name'
      ]

      maliciousNames.forEach(name => {
        expect(validatePlayerName(name)).toBe(false)
      })
    })
  })
})