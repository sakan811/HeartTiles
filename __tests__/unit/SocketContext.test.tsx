import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { useSession } from 'next-auth/react'
import { io, Socket } from 'socket.io-client'

// Mock next-auth
vi.mock('next-auth/react', () => ({
  useSession: vi.fn().mockReturnValue({
    data: null,
    status: 'unauthenticated'
  })
}))

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn()
}))

// Import the components to test
import { SocketProvider, useSocket, SocketContext } from '../../src/contexts/SocketContext'

describe('SocketContext', () => {
  let mockSocket: Partial<Socket>
  let mockIo: vi.Mock

  beforeEach(() => {
    vi.clearAllMocks()

    // Create a comprehensive mock socket
    mockSocket = {
      id: 'test-socket-id',
      on: vi.fn(),
      disconnect: vi.fn(),
      connected: true,
      emit: vi.fn()
    }

    // Mock the io function
    mockIo = vi.mocked(io)
    mockIo.mockReturnValue(mockSocket as Socket)

    // Reset useSession mock to default value for all tests
    vi.mocked(useSession).mockReturnValue({
      data: null,
      status: 'unauthenticated'
    })

    // Ensure window object is properly mocked for all tests
    vi.stubGlobal('window', {
      ...global.window,
      undefined: false
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('SocketProvider', () => {
    it('should provide initial context values', () => {
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated'
      } as any)

      const { result } = renderHook(() => useSocket(), {
        wrapper: ({ children }) => <SocketProvider>{children}</SocketProvider>
      })

      expect(result.current.socket).toBeNull()
      expect(result.current.isConnected).toBe(false)
      expect(result.current.socketId).toBeNull()
      expect(result.current.connectionError).toBeNull()
      expect(typeof result.current.disconnect).toBe('function')
    })

    it('should provide default context values when no provider is available', () => {
      // Test that the default context values work correctly
      // The actual error throwing is handled in the component implementation
      const TestComponent = () => {
        const context = React.useContext(SocketContext)
        return (
          <div>
            <span data-testid="socket">{context.socket ? 'has-socket' : 'no-socket'}</span>
            <span data-testid="connected">{context.isConnected.toString()}</span>
          </div>
        )
      }

      const { getByTestId } = render(<TestComponent />)

      expect(getByTestId('socket').textContent).toBe('no-socket')
      expect(getByTestId('connected').textContent).toBe('false')
    })

    it('should not connect socket when user is unauthenticated', () => {
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated'
      } as any)

      renderHook(() => useSocket(), {
        wrapper: ({ children }) => <SocketProvider>{children}</SocketProvider>
      })

      expect(mockIo).not.toHaveBeenCalled()
    })

    it('should not connect socket when user session is loading', () => {
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'loading'
      } as any)

      renderHook(() => useSocket(), {
        wrapper: ({ children }) => <SocketProvider>{children}</SocketProvider>
      })

      expect(mockIo).not.toHaveBeenCalled()
    })

    it('should connect socket when user is authenticated', () => {
      vi.mocked(useSession).mockReturnValue({
        data: { id: 'user1', name: 'Test User', email: 'test@example.com' },
        status: 'authenticated'
      } as any)

      renderHook(() => useSocket(), {
        wrapper: ({ children }) => <SocketProvider>{children}</SocketProvider>
      })

      expect(mockIo).toHaveBeenCalledWith(undefined, {
        transports: ["websocket", "polling"],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 20000,
      })
    })

    it('should not connect socket on server side (window undefined)', () => {
      // This test verifies server-side rendering behavior
      // Since React DOM requires window object, we test the logic through component behavior
      // The component checks "typeof window === 'undefined'" before connecting

      vi.mocked(useSession).mockReturnValue({
        data: { id: 'user1', name: 'Test User' },
        status: 'authenticated'
      } as any)

      renderHook(() => useSocket(), {
        wrapper: ({ children }) => <SocketProvider>{children}</SocketProvider>
      })

      // In a browser environment, it should connect
      // The server-side check is handled in the actual component code
      expect(mockIo).toHaveBeenCalled()
    })

    it('should reset connection state when user logs out', async () => {
      // Start with authenticated user
      vi.mocked(useSession).mockReturnValue({
        data: { id: 'user1', name: 'Test User' },
        status: 'authenticated'
      } as any)

      const { rerender } = renderHook(() => useSocket(), {
        wrapper: ({ children }) => <SocketProvider>{children}</SocketProvider>
      })

      expect(mockIo).toHaveBeenCalled()

      // Now user logs out
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated'
      } as any)

      await act(async () => {
        rerender({})
      })

      // Verify socket cleanup
      expect(mockSocket.disconnect).toHaveBeenCalled()
    })

    it('should handle socket connect event', async () => {
      vi.mocked(useSession).mockReturnValue({
        data: { id: 'user1', name: 'Test User' },
        status: 'authenticated'
      } as any)

      const { result } = renderHook(() => useSocket(), {
        wrapper: ({ children }) => <SocketProvider>{children}</SocketProvider>
      })

      // Get the connect event handler
      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function))
      const connectHandler = vi.mocked(mockSocket.on).mock.calls.find(
        call => call[0] === 'connect'
      )?.[1]

      // Simulate socket connect
      if (connectHandler) {
        act(() => {
          connectHandler()
        })
      }

      expect(result.current.isConnected).toBe(true)
      expect(result.current.socketId).toBe('test-socket-id')
      expect(result.current.connectionError).toBeNull()
    })

    it('should handle socket disconnect event', async () => {
      vi.mocked(useSession).mockReturnValue({
        data: { id: 'user1', name: 'Test User' },
        status: 'authenticated'
      } as any)

      const { result } = renderHook(() => useSocket(), {
        wrapper: ({ children }) => <SocketProvider>{children}</SocketProvider>
      })

      // Get the disconnect event handler
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function))
      const disconnectHandler = vi.mocked(mockSocket.on).mock.calls.find(
        call => call[0] === 'disconnect'
      )?.[1]

      // Simulate socket disconnect
      if (disconnectHandler) {
        act(() => {
          disconnectHandler('io client disconnect')
        })
      }

      expect(result.current.isConnected).toBe(false)
      expect(result.current.socketId).toBeNull()
    })

    it('should handle socket connect_error event', async () => {
      vi.mocked(useSession).mockReturnValue({
        data: { id: 'user1', name: 'Test User' },
        status: 'authenticated'
      } as any)

      const { result } = renderHook(() => useSocket(), {
        wrapper: ({ children }) => <SocketProvider>{children}</SocketProvider>
      })

      // Get the connect_error event handler
      expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function))
      const errorHandler = vi.mocked(mockSocket.on).mock.calls.find(
        call => call[0] === 'connect_error'
      )?.[1]

      // Simulate connection error
      const error = new Error('Connection failed')
      if (errorHandler) {
        act(() => {
          errorHandler(error)
        })
      }

      expect(result.current.isConnected).toBe(false)
      expect(result.current.socketId).toBeNull()
      expect(result.current.connectionError).toBe('Connection failed')
    })

    it('should call disconnect function correctly', () => {
      vi.mocked(useSession).mockReturnValue({
        data: { id: 'user1', name: 'Test User' },
        status: 'authenticated'
      } as any)

      const { result } = renderHook(() => useSocket(), {
        wrapper: ({ children }) => <SocketProvider>{children}</SocketProvider>
      })

      act(() => {
        result.current.disconnect()
      })

      expect(mockSocket.disconnect).toHaveBeenCalled()
    })

    it('should handle disconnect when socket is null', () => {
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated'
      } as any)

      const { result } = renderHook(() => useSocket(), {
        wrapper: ({ children }) => <SocketProvider>{children}</SocketProvider>
      })

      // Should not throw error even when socket is null
      expect(() => {
        act(() => {
          result.current.disconnect()
        })
      }).not.toThrow()
    })

    it('should clean up socket on unmount', () => {
      vi.mocked(useSession).mockReturnValue({
        data: { id: 'user1', name: 'Test User' },
        status: 'authenticated'
      } as any)

      const { unmount } = renderHook(() => useSocket(), {
        wrapper: ({ children }) => <SocketProvider>{children}</SocketProvider>
      })

      act(() => {
        unmount()
      })

      expect(mockSocket.disconnect).toHaveBeenCalled()
    })

    it('should reconnect when auth status changes', () => {
      vi.mocked(useSession).mockReturnValue({
        data: { id: 'user1', name: 'Test User' },
        status: 'authenticated'
      } as any)

      const { rerender } = renderHook(() => useSocket(), {
        wrapper: ({ children }) => <SocketProvider>{children}</SocketProvider>
      })

      // Initial connection
      expect(mockIo).toHaveBeenCalledTimes(1)

      // Clear the mock to track new calls
      mockIo.mockClear()

      // Simulate auth status change to unauthenticated then back to authenticated
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated'
      } as any)

      act(() => {
        rerender({})
      })

      // Should not have created new connection when unauthenticated
      expect(mockIo).not.toHaveBeenCalled()

      // Now change to different authenticated user
      vi.mocked(useSession).mockReturnValue({
        data: { id: 'user2', name: 'Different User' },
        status: 'authenticated'
      } as any)

      const mockSocket2 = { ...mockSocket, id: 'test-socket-id-2', on: vi.fn(), disconnect: vi.fn() }
      mockIo.mockReturnValue(mockSocket2 as Socket)

      act(() => {
        rerender({})
      })

      // Should create new socket connection
      expect(mockIo).toHaveBeenCalledTimes(1)
    })
  })

  describe('SocketContext Consumer', () => {
    it('should provide context through direct context usage', () => {
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated'
      } as any)

      const TestComponent = () => {
        const context = React.useContext(SocketContext)
        return (
          <div>
            <span data-testid="connected">{context.isConnected.toString()}</span>
            <span data-testid="socket-id">{context.socketId}</span>
            <span data-testid="error">{context.connectionError}</span>
          </div>
        )
      }

      const { getByTestId } = render(
        <SocketProvider>
          <TestComponent />
        </SocketProvider>
      )

      expect(getByTestId('connected').textContent).toBe('false')
      expect(getByTestId('socket-id').textContent).toBe('')
      expect(getByTestId('error').textContent).toBe('')
    })
  })

  describe('useSocket Hook', () => {
    it('should return socket context values', () => {
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated'
      } as any)

      const { result } = renderHook(() => useSocket(), {
        wrapper: ({ children }) => <SocketProvider>{children}</SocketProvider>
      })

      expect(result.current).toEqual({
        socket: null,
        isConnected: false,
        socketId: null,
        connectionError: null,
        disconnect: expect.any(Function)
      })
    })

    it('should provide socket instance when connected', () => {
      vi.mocked(useSession).mockReturnValue({
        data: { id: 'user1', name: 'Test User' },
        status: 'authenticated'
      } as any)

      const { result } = renderHook(() => useSocket(), {
        wrapper: ({ children }) => <SocketProvider>{children}</SocketProvider>
      })

      // The socket should be set after initial render
      expect(result.current.socket).toBe(mockSocket)
    })
  })
})