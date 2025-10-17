import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, waitForElementToBeRemoved, act } from '@testing-library/react'
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import RoomPage from '../../src/app/room/[roomCode]/page.js'
import { SocketProvider } from '../../src/contexts/SocketContext.js'
import { SessionProvider } from '../../src/components/providers/SessionProvider.js'
import { useSocket } from '@/socket'

// Mock Next.js modules
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  useParams: vi.fn(),
}))

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
  SessionProvider: ({ children }) => <div data-testid="session-provider">{children}</div>,
}))

vi.mock('@/socket', () => ({
  useSocket: vi.fn(),
}))

// Mock Socket.IO client
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    id: 'mock-socket-id',
    connected: true,
  })),
}))

// Mock SocketContext
const eventHandlers = {}
const mockSocket = {
  on: vi.fn((event, handler) => {
    if (!eventHandlers[event]) {
      eventHandlers[event] = []
    }
    eventHandlers[event].push(handler)
    return vi.fn() // Return cleanup function
  }),
  off: vi.fn((event, handler) => {
    if (eventHandlers[event]) {
      const index = eventHandlers[event].indexOf(handler)
      if (index > -1) {
        eventHandlers[event].splice(index, 1)
      }
      if (eventHandlers[event].length === 0) {
        delete eventHandlers[event]
      }
    }
  }),
  emit: vi.fn(),
  disconnect: vi.fn(),
  id: 'test-socket-id',
  connected: true,
  // Helper to get event handlers for testing
  _getHandler: (event) => eventHandlers[event],
  // Helper to trigger events directly
  _triggerEvent: (event, data) => {
    if (eventHandlers[event]) {
      eventHandlers[event].forEach(handler => {
        handler(data)
      })
    }
  },
}

vi.mock('../../src/contexts/SocketContext.js', () => ({
  SocketProvider: ({ children }) => <div data-testid="socket-provider">{children}</div>,
  useSocket: () => ({
    socket: mockSocket,
    isConnected: true,
    socketId: 'test-socket-id',
    disconnect: vi.fn(),
  }),
}))

const mockPush = vi.fn()
const mockReplace = vi.fn()

describe('RoomPage Component', () => {
  const mockRoomCode = 'TEST123'
  const mockSession = {
    user: {
      name: 'Test User',
      email: 'test@example.com',
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Clear event handlers
    Object.keys(eventHandlers).forEach(key => delete eventHandlers[key])

    // Clear mock socket calls
    mockSocket.on.mockClear()
    mockSocket.off.mockClear()
    mockSocket.emit.mockClear()
    mockSocket.disconnect.mockClear()

    // Setup default router mock
    vi.mocked(useRouter).mockReturnValue({
      push: mockPush,
      replace: mockReplace,
    })

    // Setup default params mock
    vi.mocked(useParams).mockReturnValue({ roomCode: mockRoomCode })

    // Setup default session mock
    vi.mocked(useSession).mockReturnValue({
      data: mockSession,
      status: 'authenticated',
    })

    // Setup default socket mock
    vi.mocked(useSocket).mockReturnValue({
      socket: mockSocket,
      isConnected: true,
      socketId: 'test-socket-id',
      disconnect: vi.fn(),
    })

    // Mock sessionStorage
    const sessionStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    }
    vi.stubGlobal('sessionStorage', sessionStorageMock)

    // Mock navigator.clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })

    // Mock window.location for redirect tests
    Object.defineProperty(window, 'location', {
      value: {
        href: 'http://localhost:3000/room/TEST123',
      },
      writable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const renderRoomPage = () => {
    return render(
      <SessionProvider>
        <SocketProvider>
          <RoomPage />
        </SocketProvider>
      </SessionProvider>
    )
  }

  describe('Authentication and Routing', () => {
    it('should redirect to sign-in page when user is not authenticated', () => {
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated',
      })

      renderRoomPage()

      expect(mockPush).toHaveBeenCalledWith(
        '/auth/signin?callbackUrl=http%3A%2F%2Flocalhost%3A3000%2Froom%2FTEST123'
      )
    })

    it('should not redirect when user is authenticated', () => {
      renderRoomPage()

      expect(mockPush).not.toHaveBeenCalled()
    })

    it('should show loading state while session is loading', () => {
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'loading',
      })

      renderRoomPage()

      expect(mockPush).not.toHaveBeenCalled()
    })

    it('should extract room code from URL parameters', () => {
      renderRoomPage()

      expect(useParams).toHaveBeenCalled()
      expect(screen.getByText(mockRoomCode)).toBeInTheDocument()
    })
  })

  describe('Component Rendering', () => {
    it('should render waiting room title', () => {
      renderRoomPage()

      expect(screen.getByText('Waiting Room')).toBeInTheDocument()
    })

    it('should display room code', () => {
      renderRoomPage()

      expect(screen.getByText(mockRoomCode)).toBeInTheDocument()
    })

    it('should render copy button for room code', () => {
      renderRoomPage()

      const copyButton = screen.getByTitle('Copy room code')
      expect(copyButton).toBeInTheDocument()
      expect(copyButton).toHaveTextContent('📋')
    })

    it('should display connection status', () => {
      renderRoomPage()

      expect(screen.getByText('Connected')).toBeInTheDocument()
    })

    it('should render players section title', () => {
      renderRoomPage()

      expect(screen.getByText('Players in Room')).toBeInTheDocument()
    })

    it('should show share room code message', () => {
      renderRoomPage()

      expect(screen.getByText('Share the room code with a friend to join the game!')).toBeInTheDocument()
    })

    it('should display initial player count', () => {
      renderRoomPage()

      expect(screen.getByText('Players: 0/2')).toBeInTheDocument()
    })

    it('should show waiting for another player message', () => {
      renderRoomPage()

      expect(screen.getByText('Waiting for another player to join...')).toBeInTheDocument()
    })
  })

  describe('Player Name Generation', () => {
    it('should use session user name when available', async () => {
      vi.mocked(useSession).mockReturnValue({
        data: mockSession,
        status: 'authenticated',
      })

      renderRoomPage()

      await act(async () => {
        mockSocket._triggerEvent('room-joined', {
          players: [{ userId: 'user1', name: 'Test User', isReady: false }],
          playerId: 'user1',
        })
      })

      expect(await screen.findByText('T')).toBeInTheDocument()
    })

    it('should generate random player name when no session name exists', () => {
      vi.mocked(useSession).mockReturnValue({
        data: { user: {} },
        status: 'authenticated',
      })
      
      vi.mocked(useSocket).mockReturnValue({
        socket: mockSocket,
        isConnected: true,
        socketId: 'test-socket-id',
        disconnect: vi.fn(),
      })

      renderRoomPage()

      expect(sessionStorage.setItem).toHaveBeenCalledWith(
        'heart-tiles-player-name',
        'Player_ket-id'
      )
    })

    it('should use existing player name from sessionStorage', () => {
      sessionStorage.getItem.mockReturnValue('ExistingPlayer')

      renderRoomPage()

      expect(sessionStorage.getItem).toHaveBeenCalledWith('heart-tiles-player-name')
      expect(sessionStorage.setItem).not.toHaveBeenCalled()
    })
  })

  describe('Copy Room Code Functionality', () => {
    it('should copy room code to clipboard when button is clicked', async () => {
      renderRoomPage()

      const copyButton = screen.getByTitle('Copy room code')
      fireEvent.click(copyButton)

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockRoomCode)
    })
  })

  describe('Leave Room Functionality', () => {
    it('should call leave-room socket event when leave button is clicked', () => {
      renderRoomPage()

      const leaveButton = screen.getByText('Leave Room')
      fireEvent.click(leaveButton)

      expect(mockSocket.emit).toHaveBeenCalledWith('leave-room', { roomCode: mockRoomCode })
    })

    it('should redirect to home page after leaving room', async () => {
      renderRoomPage()

      const leaveButton = screen.getByText('Leave Room')
      fireEvent.click(leaveButton)

      await new Promise(resolve => setTimeout(resolve, 150))
      expect(mockPush).toHaveBeenCalledWith('/')
    })
  })

  describe('Socket Event Handling', () => {
    it('should register socket event listeners on component mount', () => {
      renderRoomPage()

      expect(mockSocket.on).toHaveBeenCalledWith('room-joined', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('player-joined', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('player-left', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('player-ready', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('game-start', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('room-error', expect.any(Function))
    })

    it('should clean up socket event listeners on unmount', () => {
      const { unmount } = renderRoomPage()

      unmount()

      expect(mockSocket.off).toHaveBeenCalledWith('room-joined', expect.any(Function))
      expect(mockSocket.off).toHaveBeenCalledWith('player-joined', expect.any(Function))
      expect(mockSocket.off).toHaveBeenCalledWith('player-left', expect.any(Function))
      expect(mockSocket.off).toHaveBeenCalledWith('player-ready', expect.any(Function))
      expect(mockSocket.off).toHaveBeenCalledWith('game-start', expect.any(Function))
      expect(mockSocket.off).toHaveBeenCalledWith('room-error', expect.any(Function))
    })

    it('should emit join-room event when connected', () => {
      renderRoomPage()

      expect(mockSocket.emit).toHaveBeenCalledWith('join-room', {
        roomCode: mockRoomCode,
        playerName: 'Test User',
      })
    })

    it('should handle room-joined event', async () => {
      renderRoomPage()

      const mockData = {
        players: [
          { userId: 'user1', name: 'Player 1', isReady: false },
          { userId: 'user2', name: 'Player 2', isReady: false },
        ],
        playerId: 'user1',
      }

      act(() => {
        mockSocket._triggerEvent('room-joined', mockData)
      })

      expect(await screen.findByText('Player 1')).toBeInTheDocument()
      expect(await screen.findByText('Player 2')).toBeInTheDocument()
      expect(await screen.findByText('Players: 2/2')).toBeInTheDocument()
    })

    it('should handle player-joined event', async () => {
      renderRoomPage()

      const mockData = {
        players: [
          { userId: 'user1', name: 'Player 1', isReady: false },
          { userId: 'user2', name: 'Player 2', isReady: false },
        ],
      }

      act(() => {
        mockSocket._triggerEvent('player-joined', mockData)
      })

      expect(await screen.findByText('Player 1')).toBeInTheDocument()
      expect(await screen.findByText('Player 2')).toBeInTheDocument()
    })

    it('should handle player-left event', async () => {
      renderRoomPage()
      
      act(() => {
        mockSocket._triggerEvent('room-joined', {
            players: [
                { userId: 'user1', name: 'Player 1', isReady: false },
                { userId: 'user2', name: 'Player 2', isReady: false },
            ],
            playerId: 'user1',
        })
      })

      expect(await screen.findByText('Player 2')).toBeInTheDocument()

      const mockData = {
        players: [{ userId: 'user1', name: 'Player 1', isReady: false }],
      }

      act(() => {
        mockSocket._triggerEvent('player-left', mockData)
      })

      expect(await screen.findByText('Player 1')).toBeInTheDocument()
      await waitFor(() => {
        expect(screen.queryByText('Player 2')).not.toBeInTheDocument()
      })
    })

    it('should handle player-ready event', async () => {
      renderRoomPage()

      const mockData = {
        players: [
          { userId: 'user1', name: 'Player 1', isReady: true },
          { userId: 'user2', name: 'Player 2', isReady: false },
        ],
      }

      act(() => {
        mockSocket._triggerEvent('player-ready', mockData)
      })

      expect(await screen.findByText('✓ Ready')).toBeInTheDocument()
    })

    it('should handle game-start event', () => {
      renderRoomPage()

      mockSocket._triggerEvent('game-start')

      expect(mockPush).toHaveBeenCalledWith(`/room/${mockRoomCode}/game`)
    })

    it('should handle room-error event', async () => {
      renderRoomPage()

      const errorMessage = 'Room is full'
      act(() => {
        mockSocket._triggerEvent('room-error', errorMessage)
      })

      const errorElement = await screen.findByText(errorMessage)
      expect(errorElement).toBeInTheDocument()
    })
  })

  describe('Player Display', () => {
    it('should display "You" label for current player', async () => {
      renderRoomPage()

      const mockData = {
        players: [
          { userId: 'user1', name: 'Test User', isReady: false },
          { userId: 'user2', name: 'Other Player', isReady: false },
        ],
        playerId: 'user1',
      }

      act(() => {
        mockSocket._triggerEvent('room-joined', mockData)
      })

      expect(await screen.findByText('You')).toBeInTheDocument()
    })

    it('should display player avatar with first letter of name', async () => {
      renderRoomPage()

      const mockData = {
        players: [{ userId: 'user1', name: 'Alice', isReady: false }],
        playerId: 'user1',
      }

      act(() => {
        mockSocket._triggerEvent('room-joined', mockData)
      })

      expect(await screen.findByText('A')).toBeInTheDocument()
    })

    it('should show green ring around ready players', async () => {
      renderRoomPage()

      const mockData = {
        players: [{ userId: 'user1', name: 'Alice', isReady: true }],
      }

      act(() => {
        mockSocket._triggerEvent('player-ready', mockData)
      })

      const playerCard = (await screen.findByText('Alice')).closest('.bg-white\/10')
      expect(playerCard).toHaveClass('ring-2', 'ring-green-500')
    })
  })

  describe('Ready Button Functionality', () => {
    it('should show Ready button when current player is not ready', async () => {
      renderRoomPage()

      const mockData = {
        players: [
          { userId: 'user1', name: 'Player 1', isReady: false },
          { userId: 'user2', name: 'Player 2', isReady: false },
        ],
        playerId: 'user1',
      }

      act(() => {
        mockSocket._triggerEvent('room-joined', mockData)
      })

      const readyButton = await screen.findByText('Ready')
      expect(readyButton).toBeInTheDocument()
      expect(readyButton).not.toBeDisabled()
    })

    it('should show Cancel Ready button when current player is ready', async () => {
      renderRoomPage()

      const mockData = {
        players: [
          { userId: 'user1', name: 'Player 1', isReady: true },
          { userId: 'user2', name: 'Player 2', isReady: false },
        ],
        playerId: 'user1',
      }

      act(() => {
        mockSocket._triggerEvent('room-joined', mockData)
      })

      const cancelButton = await screen.findByText('Cancel Ready')
      expect(cancelButton).toBeInTheDocument()
    })

    it('should emit player-ready event when Ready button is clicked', async () => {
      renderRoomPage()

      const mockData = {
        players: [
          { userId: 'user1', name: 'Player 1', isReady: false },
          { userId: 'user2', name: 'Player 2', isReady: false },
        ],
        playerId: 'user1',
      }

      act(() => {
        mockSocket._triggerEvent('room-joined', mockData)
      })

      const readyButton = await screen.findByText('Ready')
      fireEvent.click(readyButton)

      expect(mockSocket.emit).toHaveBeenCalledWith('player-ready', { roomCode: mockRoomCode })
    })

    it('should disable Ready button when there are not 2 players', async () => {
      renderRoomPage()

      const mockData = {
        players: [{ userId: 'user1', name: 'Player 1', isReady: false }],
        playerId: 'user1',
      }

      act(() => {
        mockSocket._triggerEvent('room-joined', mockData)
      })

      const readyButton = await screen.findByText('Ready')
      expect(readyButton).toBeDisabled()
      expect(readyButton).toHaveClass('opacity-50', 'cursor-not-allowed')
    })
  })

  describe('Player Count Messages', () => {
    it('should show "Need 1 more player" when there is 1 player', async () => {
      renderRoomPage()

      const mockData = {
        players: [{ userId: 'user1', name: 'Player 1', isReady: false }],
      }

      act(() => {
        mockSocket._triggerEvent('player-joined', mockData)
      })

      expect(await screen.findByText('Need 1 more player to start!')).toBeInTheDocument()
    })

    it('should show "Both players joined" when there are 2 players', async () => {
      renderRoomPage()

      const mockData = {
        players: [
          { userId: 'user1', name: 'Player 1', isReady: false },
          { userId: 'user2', name: 'Player 2', isReady: false },
        ],
      }

      act(() => {
        mockSocket._triggerEvent('player-joined', mockData)
      })

      expect(await screen.findByText('Both players joined! Ready when everyone is ready...')).toBeInTheDocument()
    })

    it('should show "No players in room yet" when joined but no players', async () => {
      renderRoomPage()

      const mockData = {
        players: [],
        playerId: 'user1',
      }

      act(() => {
        mockSocket._triggerEvent('room-joined', mockData)
      })

      expect(await screen.findByText('No players in room yet')).toBeInTheDocument()
    })
  })

  describe('Connection Status', () => {
    it('should show "Connected" status when socket is connected', () => {
      renderRoomPage()

      expect(screen.getByText('Connected')).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveClass('bg-green-500')
    })

    it('should show "Connecting..." status when socket is not connected', () => {
      // Mock disconnected socket
      vi.mocked(useSocket).mockReturnValue({
        socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
        isConnected: false,
        socketId: null,
        disconnect: vi.fn(),
      })

      renderRoomPage()

      expect(screen.getByText('Connecting...')).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveClass('bg-red-500')
    })
  })

  describe('Joining Room State', () => {
    it('should show joining room message when hasJoined is false', () => {
      renderRoomPage()

      expect(screen.getByText('Joining room...')).toBeInTheDocument()
    })

    it('should hide joining room message when hasJoined is true', async () => {
      renderRoomPage()

      const mockData = {
        players: [{ userId: 'user1', name: 'Player 1', isReady: false }],
        playerId: 'user1',
      }

      act(() => {
        mockSocket._triggerEvent('room-joined', mockData)
      })

      await waitForElementToBeRemoved(() => screen.queryByText('Joining room...'))
    })
  })

  describe('Error Handling', () => {
    it('should display error message when room-error event is received', async () => {
      renderRoomPage()

      const errorMessage = 'Room not found'
      act(() => {
        mockSocket._triggerEvent('room-error', errorMessage)
      })

      const errorElement = await screen.findByText(errorMessage)
      expect(errorElement).toBeInTheDocument()
      expect(errorElement).toHaveClass('bg-red-500/20', 'border', 'border-red-500', 'text-red-200')
    })

    it('should clear error message when successfully joining room', async () => {
      renderRoomPage()

      // First set an error
      act(() => {
        mockSocket._triggerEvent('room-error', 'Some error')
      })

      const errorElement = await screen.findByText('Some error')
      expect(errorElement).toBeInTheDocument()

      // Then successfully join room
      act(() => {
        mockSocket._triggerEvent('room-joined', {
          players: [{ userId: 'user1', name: 'Player 1', isReady: false }],
          playerId: 'user1',
        })
      })

      await waitForElementToBeRemoved(() => screen.queryByText('Some error'))
    })
  })

  describe('Component Structure and Layout', () => {
    it('should have proper CSS classes and styling', () => {
      const { container } = renderRoomPage()

      const mainContainer = container.querySelector('.font-sans.min-h-screen.flex.items-center.justify-center')
      expect(mainContainer).toBeInTheDocument()

      const cardElement = container.querySelector('.bg-white\/10.backdrop-blur-sm.rounded-2xl.p-8')
      expect(cardElement).toBeInTheDocument()
    })

    it('should have proper accessibility attributes', () => {
      renderRoomPage()

      const connectionIndicator = screen.getByRole('status')
      expect(connectionIndicator).toBeInTheDocument()

      const copyButton = screen.getByTitle('Copy room code')
      expect(copyButton).toBeInTheDocument()
    })

    it('should use proper HTML semantic structure', () => {
      renderRoomPage()

      const heading = screen.getByRole('heading', { level: 1, name: 'Waiting Room' })
      expect(heading).toBeInTheDocument()

      const playersHeading = screen.getByRole('heading', { level: 2, name: 'Players in Room' })
      expect(playersHeading).toBeInTheDocument()
    })
  })

  describe('Duplicate Join Prevention', () => {
    it('should prevent duplicate room joins', () => {
      renderRoomPage()

      // Should emit join-room only once initially
      expect(mockSocket.emit).toHaveBeenCalledTimes(1)
      expect(mockSocket.emit).toHaveBeenCalledWith('join-room', {
        roomCode: mockRoomCode,
        playerName: 'Test User',
      })
    })
  })
})
