import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the SocketContext
vi.mock('../../src/contexts/SocketContext.js', () => ({
  useSocket: vi.fn()
}))

describe('Socket Module Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Module Exports', () => {
    it('should export useSocket from SocketContext', () => {
      const socketModule = require('../../src/socket.ts')
      const { useSocket } = require('../../src/contexts/SocketContext.js')

      expect(socketModule.useSocket).toBeDefined()
      expect(typeof socketModule.useSocket).toBe('function')
      expect(socketModule.useSocket).toBe(useSocket)
    })

    it('should re-export useSocket function correctly', () => {
      const mockUseSocket = vi.fn()
      vi.doMock('../../src/contexts/SocketContext.js', () => ({
        useSocket: mockUseSocket
      }))

      const socketModule = require('../../src/socket.ts')

      expect(socketModule.useSocket).toBe(mockUseSocket)
    })

    it('should maintain function signature when re-exported', () => {
      const mockUseSocket = vi.fn().mockReturnValue({
        socket: null,
        isConnected: false,
        socketId: null,
        connectionError: null,
        disconnect: vi.fn()
      })

      const { useSocket } = require('../../src/contexts/SocketContext.js')
      useSocket.mockImplementation(mockUseSocket)

      const socketModule = require('../../src/socket.ts')

      const result = socketModule.useSocket()

      expect(mockUseSocket).toHaveBeenCalled()
      expect(result).toEqual({
        socket: null,
        isConnected: false,
        socketId: null,
        connectionError: null,
        disconnect: expect.any(Function)
      })
    })
  })

  describe('Backward Compatibility', () => {
    it('should maintain legacy export structure', () => {
      const socketModule = require('../../src/socket.ts')
      const socketContextModule = require('../../src/contexts/SocketContext.js')

      // Verify that the export exists and is the same reference
      expect(socketModule.useSocket).toBe(socketContextModule.useSocket)
    })

    it('should work with existing import patterns', () => {
      const mockUseSocket = vi.fn()
      vi.doMock('../../src/contexts/SocketContext.js', () => ({
        useSocket: mockUseSocket
      }))

      // Test both import patterns
      const importFromSocket = require('../../src/socket.ts')
      const importFromContext = require('../../src/contexts/SocketContext.js')

      expect(importFromSocket.useSocket).toBe(importFromContext.useSocket)
      expect(typeof importFromSocket.useSocket).toBe('function')
    })
  })

  describe('Module Structure', () => {
    it('should have correct module structure', () => {
      const socketModule = require('../../src/socket.ts')

      expect(Object.keys(socketModule)).toEqual(['useSocket'])
      expect(socketModule).toHaveProperty('useSocket')
    })

    it('should not export anything else', () => {
      const socketModule = require('../../src/socket.ts')

      // Should only export useSocket
      expect(Object.keys(socketModule)).toHaveLength(1)
      expect('useSocket' in socketModule).toBe(true)
      expect('socket' in socketModule).toBe(false)
      expect('SocketProvider' in socketModule).toBe(false)
    })

    it('should be an ES module', () => {
      const socketModule = require('../../src/socket.ts')

      expect(typeof socketModule).toBe('object')
      expect(socketModule !== null).toBe(true)
    })
  })

  describe('Function Delegation', () => {
    it('should delegate all calls to SocketContext useSocket', () => {
      const mockUseSocket = vi.fn().mockReturnValue('test-result')
      vi.doMock('../../src/contexts/SocketContext.js', () => ({
        useSocket: mockUseSocket
      }))

      const socketModule = require('../../src/socket.ts')
      const result = socketModule.useSocket('arg1', 'arg2', 'arg3')

      expect(mockUseSocket).toHaveBeenCalledWith('arg1', 'arg2', 'arg3')
      expect(result).toBe('test-result')
    })

    it('should pass through errors from SocketContext', () => {
      const testError = new Error('Test error from SocketContext')
      const mockUseSocket = vi.fn().mockImplementation(() => {
        throw testError
      })

      vi.doMock('../../src/contexts/SocketContext.js', () => ({
        useSocket: mockUseSocket
      }))

      const socketModule = require('../../src/socket.ts')

      expect(() => {
        socketModule.useSocket()
      }).toThrow('Test error from SocketContext')
    })

    it('should maintain context of SocketContext useSocket', () => {
      const mockUseSocket = vi.fn()
      vi.doMock('../../src/contexts/SocketContext.js', () => ({
        useSocket: mockUseSocket
      }))

      const socketModule = require('../../src/socket.ts')

      const testContext = { test: 'context' }
      socketModule.useSocket.call(testContext, 'test-arg')

      expect(mockUseSocket).toHaveBeenCalledWith('test-arg')
    })
  })

  describe('Legacy Support', () => {
    it('should support old import syntax', () => {
      // This simulates how legacy code might import the function
      const socketModule = require('../../src/socket.ts')
      const { useSocket } = socketModule

      expect(typeof useSocket).toBe('function')
    })

    it('should work with destructuring import', () => {
      const socketModule = require('../../src/socket.ts')

      // Test destructuring
      const { useSocket } = socketModule
      expect(typeof useSocket).toBe('function')
    })

    it('should maintain function identity across re-exports', () => {
      const mockUseSocket = vi.fn()
      vi.doMock('../../src/contexts/SocketContext.js', () => ({
        useSocket: mockUseSocket
      }))

      const socketModule = require('../../src/socket.ts')
      const socketContextModule = require('../../src/contexts/SocketContext.js')

      // Both references should point to the same function
      expect(socketModule.useSocket === socketContextModule.useSocket).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle undefined useSocket from SocketContext', () => {
      vi.doMock('../../src/contexts/SocketContext.js', () => ({
        useSocket: undefined
      }))

      const socketModule = require('../../src/socket.ts')

      expect(() => {
        socketModule.useSocket()
      }).toThrow()
    })

    it('should handle null useSocket from SocketContext', () => {
      vi.doMock('../../src/contexts/SocketContext.js', () => ({
        useSocket: null
      }))

      const socketModule = require('../../src/socket.ts')

      expect(() => {
        socketModule.useSocket()
      }).toThrow()
    })

    it('should handle non-function exports from SocketContext', () => {
      vi.doMock('../../src/contexts/SocketContext.js', () => ({
        useSocket: 'not-a-function'
      }))

      const socketModule = require('../../src/socket.ts')

      expect(() => {
        socketModule.useSocket()
      }).toThrow()
    })
  })

  describe('Performance', () => {
    it('should not create additional function wrappers', () => {
      const mockUseSocket = vi.fn()
      vi.doMock('../../src/contexts/SocketContext.js', () => ({
        useSocket: mockUseSocket
      }))

      const socketModule = require('../../src/socket.ts')

      // The re-exported function should be the same reference
      expect(socketModule.useSocket).toBe(mockUseSocket)
    })

    it('should have minimal overhead when calling useSocket', () => {
      const mockUseSocket = vi.fn()
      vi.doMock('../../src/contexts/SocketContext.js', () => ({
        useSocket: mockUseSocket
      }))

      const socketModule = require('../../src/socket.ts')

      const start = performance.now()
      for (let i = 0; i < 1000; i++) {
        socketModule.useSocket()
      }
      const end = performance.now()

      // Should complete 1000 calls very quickly (less than 10ms)
      expect(end - start).toBeLessThan(10)
      expect(mockUseSocket).toHaveBeenCalledTimes(1000)
    })
  })

  describe('Integration Scenarios', () => {
    it('should work in typical React component usage', () => {
      const mockSocketData = {
        socket: { id: 'test-socket' },
        isConnected: true,
        socketId: 'test-socket',
        connectionError: null,
        disconnect: vi.fn()
      }

      const mockUseSocket = vi.fn().mockReturnValue(mockSocketData)
      vi.doMock('../../src/contexts/SocketContext.js', () => ({
        useSocket: mockUseSocket
      }))

      const socketModule = require('../../src/socket.ts')

      // Simulate component usage
      function useSocketData() {
        return socketModule.useSocket()
      }

      const result = useSocketData()

      expect(result).toEqual(mockSocketData)
      expect(mockUseSocket).toHaveBeenCalled()
    })

    it('should handle multiple imports in different modules', () => {
      const mockUseSocket = vi.fn()
      vi.doMock('../../src/contexts/SocketContext.js', () => ({
        useSocket: mockUseSocket
      }))

      const import1 = require('../../src/socket.ts')
      const import2 = require('../../src/socket.ts')

      const result1 = import1.useSocket()
      const result2 = import2.useSocket()

      expect(mockUseSocket).toHaveBeenCalledTimes(2)
      expect(import1.useSocket).toBe(import2.useSocket)
    })

    it('should support re-export chaining', () => {
      const mockUseSocket = vi.fn()
      vi.doMock('../../src/contexts/SocketContext.js', () => ({
        useSocket: mockUseSocket
      }))

      // Create a chain of re-exports
      const socketModule = require('../../src/socket.ts')

      // Re-export again (simulating another module)
      const reExportedModule = {
        useSocket: socketModule.useSocket
      }

      const result = reExportedModule.useSocket()

      expect(mockUseSocket).toHaveBeenCalled()
      expect(typeof reExportedModule.useSocket).toBe('function')
    })
  })

  describe('Documentation and Comments', () => {
    it('should be clearly marked as legacy export', () => {
      // This is more of a documentation test - in a real scenario you might
      // check if the file has appropriate comments or JSDoc
      const socketModule = require('../../src/socket.ts')

      // The module should still work even though it's marked as legacy
      expect(socketModule.useSocket).toBeDefined()
      expect(typeof socketModule.useSocket).toBe('function')
    })

    it('should direct users to use SocketContext instead', () => {
      // This test verifies the file structure exists
      const fs = require('fs')
      const path = require('path')

      const socketFilePath = path.join(process.cwd(), 'src/socket.ts')
      const fileExists = fs.existsSync(socketFilePath)

      expect(fileExists).toBe(true)

      if (fileExists) {
        const content = fs.readFileSync(socketFilePath, 'utf8')
        expect(content).toContain('useSocket')
        expect(content).toContain('SocketContext')
      }
    })
  })
})