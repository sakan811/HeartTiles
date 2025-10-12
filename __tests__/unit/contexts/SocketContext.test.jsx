import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, act, waitFor } from '@testing-library/react'
import { SocketProvider, useSocket } from '../../../src/contexts/SocketContext'

// Mock socket.io-client
const mockIo = vi.fn()
vi.mock('socket.io-client', () => ({
  io: mockIo
}))

// Mock console methods to avoid noise in tests
const originalConsoleLog = console.log
const originalConsoleError = console.error

describe('SocketContext', () => {
  let mockSocket

  beforeEach(() => {
    vi.clearAllMocks()
    console.log = vi.fn()
    console.error = vi.fn()

    // Create mock socket
    mockSocket = {
      on: vi.fn(),
      disconnect: vi.fn(),
      id: 'test-socket-id',
      connected: true
    }

    mockIo.mockReturnValue(mockSocket)

    // Mock window object
    Object.defineProperty(window, 'location', {
      value: { reload: vi.fn() },
      writable: true
    })
  })

  afterEach(() => {
    console.log = originalConsoleLog
    console.error = originalConsoleError
  })

  describe('SocketProvider Component', () => {
    it('should render children correctly', () => {
      const TestComponent = () => <div>Test Content</div>

      render(
        <SocketProvider>
          <TestComponent />
        </SocketProvider>
      )

      expect(screen.getByText('Test Content')).toBeInTheDocument()
    })

    it('should create socket connection on mount', () => {
      mockIo

      render(
        <SocketProvider>
          <div>Test</div>
        </SocketProvider>
      )

      expect(io).toHaveBeenCalledWith(undefined, {
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 20000,
      })
    })

    it('should not create socket connection on server side', () => {
      // Mock server-side environment
      const originalWindow = global.window
      delete global.window

      mockIo

      render(
        <SocketProvider>
          <div>Test</div>
        </SocketProvider>
      )

      expect(io).not.toHaveBeenCalled()

      // Restore window
      global.window = originalWindow
    })

    it('should set up socket event listeners', () => {
      render(
        <SocketProvider>
          <div>Test</div>
        </SocketProvider>
      )

      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function))
    })

    it('should disconnect socket on unmount', () => {
      const { unmount } = render(
        <SocketProvider>
          <div>Test</div>
        </SocketProvider>
      )

      unmount()

      expect(mockSocket.disconnect).toHaveBeenCalled()
    })
  })

  describe('Socket Connection Events', () => {
    it('should update connection state on connect', async () => {
      let connectCallback

      mockSocket.on.mockImplementation((event, callback) => {
        if (event === 'connect') {
          connectCallback = callback
        }
      })

      const TestComponent = () => {
        const { isConnected, socketId } = useSocket()
        return (
          <div>
            <span data-testid="connected">{isConnected.toString()}</span>
            <span data-testid="socket-id">{socketId || 'null'}</span>
          </div>
        )
      }

      render(
        <SocketProvider>
          <TestComponent />
        </SocketProvider>
      )

      expect(screen.getByTestId('connected')).toHaveTextContent('false')
      expect(screen.getByTestId('socket-id')).toHaveTextContent('null')

      act(() => {
        connectCallback()
      })

      expect(screen.getByTestId('connected')).toHaveTextContent('true')
      expect(screen.getByTestId('socket-id')).toHaveTextContent('test-socket-id')
      expect(console.log).toHaveBeenCalledWith('Socket connected:', 'test-socket-id')
    })

    it('should update connection state on disconnect', async () => {
      let disconnectCallback

      mockSocket.on.mockImplementation((event, callback) => {
        if (event === 'disconnect') {
          disconnectCallback = callback
        }
      })

      const TestComponent = () => {
        const { isConnected, socketId } = useSocket()
        return (
          <div>
            <span data-testid="connected">{isConnected.toString()}</span>
            <span data-testid="socket-id">{socketId || 'null'}</span>
          </div>
        )
      }

      render(
        <SocketProvider>
          <TestComponent />
        </SocketProvider>
      )

      act(() => {
        disconnectCallback('test reason')
      })

      expect(screen.getByTestId('connected')).toHaveTextContent('false')
      expect(screen.getByTestId('socket-id')).toHaveTextContent('null')
      expect(console.log).toHaveBeenCalledWith('Socket disconnected, reason:', 'test reason')
    })

    it('should handle connection errors', async () => {
      let connectErrorCallback

      mockSocket.on.mockImplementation((event, callback) => {
        if (event === 'connect_error') {
          connectErrorCallback = callback
        }
      })

      const TestComponent = () => {
        const { isConnected, connectionError } = useSocket()
        return (
          <div>
            <span data-testid="connected">{isConnected.toString()}</span>
            <span data-testid="error">{connectionError || 'null'}</span>
          </div>
        )
      }

      render(
        <SocketProvider>
          <TestComponent />
        </SocketProvider>
      )

      const testError = new Error('Connection failed')
      act(() => {
        connectErrorCallback(testError)
      })

      expect(screen.getByTestId('connected')).toHaveTextContent('false')
      expect(screen.getByTestId('error')).toHaveTextContent('Connection failed')
      expect(console.error).toHaveBeenCalledWith('Socket connection error:', testError)
    })
  })

  describe('useSocket Hook', () => {
    it('should provide socket context values', () => {
      const TestComponent = () => {
        const { socket, isConnected, socketId, connectionError, disconnect } = useSocket()
        return (
          <div>
            <span data-testid="has-socket">{socket ? 'true' : 'false'}</span>
            <span data-testid="connected">{isConnected.toString()}</span>
            <span data-testid="socket-id">{socketId || 'null'}</span>
            <span data-testid="error">{connectionError || 'null'}</span>
            <button onClick={disconnect}>Disconnect</button>
          </div>
        )
      }

      render(
        <SocketProvider>
          <TestComponent />
        </SocketProvider>
      )

      expect(screen.getByTestId('has-socket')).toHaveTextContent('true')
      expect(screen.getByTestId('connected')).toHaveTextContent('false')
      expect(screen.getByTestId('socket-id')).toHaveTextContent('null')
      expect(screen.getByTestId('error')).toHaveTextContent('null')
      expect(screen.getByText('Disconnect')).toBeInTheDocument()
    })

    it('should call disconnect function when invoked', () => {
      const TestComponent = () => {
        const { disconnect } = useSocket()
        return <button onClick={disconnect}>Disconnect</button>
      }

      render(
        <SocketProvider>
          <TestComponent />
        </SocketProvider>
      )

      const disconnectButton = screen.getByText('Disconnect')
      act(() => {
        disconnectButton.click()
      })

      expect(mockSocket.disconnect).toHaveBeenCalled()
    })

    it('should throw error when used outside SocketProvider', () => {
      const TestComponent = () => {
        useSocket()
        return <div>Test</div>
      }

      expect(() => {
        render(<TestComponent />)
      }).toThrow('useSocket must be used within a SocketProvider')
    })
  })

  describe('Context Value Updates', () => {
    it('should update context value when socket connection changes', async () => {
      let connectCallback, disconnectCallback

      mockSocket.on.mockImplementation((event, callback) => {
        if (event === 'connect') connectCallback = callback
        if (event === 'disconnect') disconnectCallback = callback
      })

      const TestComponent = () => {
        const { isConnected, socketId } = useSocket()
        return (
          <div>
            <span data-testid="connection-state">
              {isConnected ? 'connected' : 'disconnected'}
            </span>
            <span data-testid="current-id">{socketId || 'no-id'}</span>
          </div>
        )
      }

      render(
        <SocketProvider>
          <TestComponent />
        </SocketProvider>
      )

      expect(screen.getByTestId('connection-state')).toHaveTextContent('disconnected')
      expect(screen.getByTestId('current-id')).toHaveTextContent('no-id')

      act(() => {
        connectCallback()
      })

      expect(screen.getByTestId('connection-state')).toHaveTextContent('connected')
      expect(screen.getByTestId('current-id')).toHaveTextContent('test-socket-id')

      act(() => {
        disconnectCallback('manual disconnect')
      })

      expect(screen.getByTestId('connection-state')).toHaveTextContent('disconnected')
      expect(screen.getByTestId('current-id')).toHaveTextContent('no-id')
    })

    it('should handle multiple connection state changes', async () => {
      let connectCallback, disconnectCallback, connectErrorCallback

      mockSocket.on.mockImplementation((event, callback) => {
        if (event === 'connect') connectCallback = callback
        if (event === 'disconnect') disconnectCallback = callback
        if (event === 'connect_error') connectErrorCallback = callback
      })

      const TestComponent = () => {
        const { isConnected, connectionError } = useSocket()
        return (
          <div>
            <span data-testid="state">
              {isConnected ? 'connected' : connectionError || 'disconnected'}
            </span>
          </div>
        )
      }

      render(
        <SocketProvider>
          <TestComponent />
        </SocketProvider>
      )

      expect(screen.getByTestId('state')).toHaveTextContent('disconnected')

      act(() => {
        connectErrorCallback(new Error('Network error'))
      })

      expect(screen.getByTestId('state')).toHaveTextContent('Network error')

      act(() => {
        connectCallback()
      })

      expect(screen.getByTestId('state')).toHaveTextContent('connected')

      act(() => {
        disconnectCallback('timeout')
      })

      expect(screen.getByTestId('state')).toHaveTextContent('disconnected')
    })
  })

  describe('Component Lifecycle', () => {
    it('should create socket only once on mount', () => {
      mockIo

      const { rerender } = render(
        <SocketProvider>
          <div>Test</div>
        </SocketProvider>
      )

      expect(io).toHaveBeenCalledTimes(1)

      rerender(
        <SocketProvider>
          <div>Updated Test</div>
        </SocketProvider>
      )

      expect(io).toHaveBeenCalledTimes(1)
    })

    it('should handle socket cleanup properly', () => {
      const { unmount } = render(
        <SocketProvider>
          <div>Test</div>
        </SocketProvider>
      )

      unmount()

      expect(mockSocket.disconnect).toHaveBeenCalled()
    })

    it('should handle rapid mount/unmount cycles', () => {
      for (let i = 0; i < 5; i++) {
        const { unmount } = render(
          <SocketProvider key={i}>
            <div>Test {i}</div>
          </SocketProvider>
        )
        unmount()
      }

      expect(mockSocket.disconnect).toHaveBeenCalledTimes(5)
    })
  })

  describe('Error Handling', () => {
    it('should handle socket creation errors', () => {
      mockIo
      io.mockImplementation(() => {
        throw new Error('Socket creation failed')
      })

      expect(() => {
        render(
          <SocketProvider>
            <div>Test</div>
          </SocketProvider>
        )
      }).toThrow('Socket creation failed')
    })

    it('should handle socket event listener errors', () => {
      mockSocket.on.mockImplementation(() => {
        throw new Error('Event listener error')
      })

      expect(() => {
        render(
          <SocketProvider>
            <div>Test</div>
          </SocketProvider>
        )
      }).toThrow('Event listener error')
    })
  })

  describe('Integration Tests', () => {
    it('should work with nested components using useSocket', () => {
      const NestedComponent = () => {
        const { isConnected } = useSocket()
        return <span data-testid="nested-state">{isConnected.toString()}</span>
      }

      const ParentComponent = () => {
        const { socketId } = useSocket()
        return (
          <div>
            <span data-testid="parent-id">{socketId || 'null'}</span>
            <NestedComponent />
          </div>
        )
      }

      render(
        <SocketProvider>
          <ParentComponent />
        </SocketProvider>
      )

      expect(screen.getByTestId('parent-id')).toHaveTextContent('null')
      expect(screen.getByTestId('nested-state')).toHaveTextContent('false')
    })

    it('should handle multiple components using socket context', () => {
      const ComponentA = () => {
        const { isConnected } = useSocket()
        return <div data-testid="component-a">{isConnected.toString()}</div>
      }

      const ComponentB = () => {
        const { socketId } = useSocket()
        return <div data-testid="component-b">{socketId || 'null'}</div>
      }

      let connectCallback

      mockSocket.on.mockImplementation((event, callback) => {
        if (event === 'connect') connectCallback = callback
      })

      render(
        <SocketProvider>
          <ComponentA />
          <ComponentB />
        </SocketProvider>
      )

      expect(screen.getByTestId('component-a')).toHaveTextContent('false')
      expect(screen.getByTestId('component-b')).toHaveTextContent('null')

      act(() => {
        connectCallback()
      })

      expect(screen.getByTestId('component-a')).toHaveTextContent('true')
      expect(screen.getByTestId('component-b')).toHaveTextContent('test-socket-id')
    })
  })

  describe('Memory Management', () => {
    it('should not create memory leaks on unmount', () => {
      const { unmount } = render(
        <SocketProvider>
          <div>Test</div>
        </SocketProvider>
      )

      const cleanupFunction = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect'
      )?.[1]

      expect(typeof cleanupFunction).toBe('function')

      unmount()

      expect(mockSocket.disconnect).toHaveBeenCalled()
    })

    it('should handle multiple socket instances correctly', () => {
      mockIo
      const mockSocket2 = { ...mockSocket, id: 'test-socket-id-2' }

      io.mockReturnValueOnce(mockSocket).mockReturnValueOnce(mockSocket2)

      const TestComponent = ({ id }) => {
        const { socketId } = useSocket()
        return <div data-testid={`socket-${id}`}>{socketId || 'null'}</div>
      }

      const { unmount } = render(
        <SocketProvider>
          <TestComponent id="1" />
        </SocketProvider>
      )

      expect(screen.getByTestId('socket-1')).toHaveTextContent('null')
      expect(mockSocket.on).toHaveBeenCalled()

      unmount()

      expect(mockSocket.disconnect).toHaveBeenCalled()
    })
  })
})