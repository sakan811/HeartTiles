import { describe, it, expect } from 'vitest'

describe('Socket Legacy Export', () => {
  it('should export useSocket from SocketContext', async () => {
    const { useSocket } = await import('../../src/socket')

    // Verify that useSocket is exported
    expect(typeof useSocket).toBe('function')
  })

  it('should match SocketContext export', async () => {
    const { useSocket: socketUseSocket } = await import('../../src/socket')
    const { useSocket: contextUseSocket } = await import('../../src/contexts/SocketContext')

    // Both should be the same function
    expect(socketUseSocket).toBe(contextUseSocket)
  })

  it('should maintain backward compatibility', async () => {
    // Test that the legacy export works as expected
    const { useSocket } = await import('../../src/socket')

    // Should be a function (React hook)
    expect(typeof useSocket).toBe('function')

    // Should have the same signature as the original hook
    expect(useSocket.length).toBe(0) // No required parameters
  })
})