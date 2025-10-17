import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
    eventHandlers[event] = handler
  }),
  off: vi.fn((event, handler) => {
    delete eventHandlers[event]
  }),
  emit: vi.fn(),
  disconnect: vi.fn(),
  id: 'test-socket-id',
  connected: true,
  // Helper to get event handlers for testing
  _getHandler: (event) => eventHandlers[event],
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
    vi.mocked(useParams).mockReturnValue({
      roomCode: mockRoomCode,
    })

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
    it('should use session user name when available', () => {
      vi.mocked(useSession).mockReturnValue({
        data: mockSession,
        status: 'authenticated',
      })

      renderRoomPage()

      // Simulate successful room join to show the player
      const roomJoinedHandler = mockSocket._getHandler('room-joined')

      const mockData = {
        players: [{ userId: 'user1', name: 'Test User', isReady: false }],
        playerId: 'user1',
      }

      roomJoinedHandler(mockData)

      expect(screen.getByText('T')).toBeInTheDocument() // First letter of 'Test User'
    })

    it('should generate random player name when no session name exists', () => {
      vi.mocked(useSession).mockReturnValue({
        data: { user: {} },
        status: 'authenticated',
      })

      renderRoomPage()

      // Should generate Player_ with socket ID suffix
      expect(sessionStorage.setItem).toHaveBeenCalledWith(
        'heart-tiles-player-name',
        expect.stringMatching(/Player_[a-f0-9]{6}/)
      )
    })

    it('should use existing player name from sessionStorage', () => {
      sessionStorage.getItem.mockReturnValue('ExistingPlayer')

      renderRoomPage()

      expect(sessionStorage.getItem).toHaveBeenCalledWith('heart-tiles-player-name')
    })
  })

  describe('Copy Room Code Functionality', () => {
    it('should copy room code to clipboard when button is clicked', async () => {
      renderRoomPage()

      const copyButton = screen.getByTitle('Copy room code')
      fireEvent.click(copyButton)

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockRoomCode)
      })
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

      // Wait for the timeout
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/')
      }, { timeout: 150 })
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

      // Get the room-joined event handler
      const roomJoinedHandler = mockSocket._getHandler('room-joined')

      // Verify handler exists
      expect(roomJoinedHandler).toBeDefined()
      expect(typeof roomJoinedHandler).toBe('function')

      const mockData = {
        players: [
          { userId: 'user1', name: 'Player 1', isReady: false },
          { userId: 'user2', name: 'Player 2', isReady: false },
        ],
        playerId: 'user1',
      }

      roomJoinedHandler(mockData)

      // Wait for React state to update
      await waitFor(() => {
        expect(screen.getByText('Player 1')).toBeInTheDocument()
        expect(screen.getByText('Player 2')).toBeInTheDocument()
        expect(screen.getByText('Players: 2/2')).toBeInTheDocument()
      })
    })

    it('should handle player-joined event', () => {
      renderRoomPage()

      const playerJoinedHandler = mockSocket._getHandler('player-joined')

      const mockData = {
        players: [
          { userId: 'user1', name: 'Player 1', isReady: false },
          { userId: 'user2', name: 'Player 2', isReady: false },
        ],
      }

      playerJoinedHandler(mockData)

      expect(screen.getByText('Player 1')).toBeInTheDocument()
      expect(screen.getByText('Player 2')).toBeInTheDocument()
    })

    it('should handle player-left event', () => {
      renderRoomPage()

      const playerLeftHandler = mockSocket._getHandler('player-left')

      const mockData = {
        players: [{ userId: 'user1', name: 'Player 1', isReady: false }],
      }

      playerLeftHandler(mockData)

      expect(screen.getByText('Player 1')).toBeInTheDocument()
      expect(screen.queryByText('Player 2')).not.toBeInTheDocument()
    })

    it('should handle player-ready event', () => {
      renderRoomPage()

      const playerReadyHandler = mockSocket._getHandler('player-ready')

      const mockData = {
        players: [
          { userId: 'user1', name: 'Player 1', isReady: true },
          { userId: 'user2', name: 'Player 2', isReady: false },
        ],
      }

      playerReadyHandler(mockData)

      expect(screen.getByText('✓ Ready')).toBeInTheDocument()
    })

    it('should handle game-start event', () => {
      renderRoomPage()

      const gameStartHandler = mockSocket._getHandler('game-start')

      gameStartHandler()

      expect(mockPush).toHaveBeenCalledWith(`/room/${mockRoomCode}/game`)
    })

    it('should handle room-error event', () => {
      renderRoomPage()

      const roomErrorHandler = mockSocket._getHandler('room-error')

      const errorMessage = 'Room is full'
      roomErrorHandler(errorMessage)

      expect(screen.getByText(errorMessage)).toBeInTheDocument()
    })
  })

  describe('Player Display', () => {
    it('should display "You" label for current player', () => {
      renderRoomPage()

      const roomJoinedHandler = mockSocket._getHandler('room-joined')

      const mockData = {
        players: [
          { userId: 'user1', name: 'Test User', isReady: false },
          { userId: 'user2', name: 'Other Player', isReady: false },
        ],
        playerId: 'user1',
      }

      roomJoinedHandler(mockData)

      expect(screen.getByText('You')).toBeInTheDocument()
    })

    it('should display player avatar with first letter of name', () => {
      renderRoomPage()

      const roomJoinedHandler = mockSocket._getHandler('room-joined')

      const mockData = {
        players: [{ userId: 'user1', name: 'Alice', isReady: false }],
        playerId: 'user1',
      }

      roomJoinedHandler(mockData)

      expect(screen.getByText('A')).toBeInTheDocument()
    })

    it('should show green ring around ready players', () => {
      renderRoomPage()

      const playerReadyHandler = mockSocket._getHandler('player-ready')

      const mockData = {
        players: [{ userId: 'user1', name: 'Alice', isReady: true }],
      }

      playerReadyHandler(mockData)

      const playerCard = screen.getByText('Alice').closest('.bg-white\\/10')
      expect(playerCard).toHaveClass('ring-2', 'ring-green-500')
    })
  })

  describe('Ready Button Functionality', () => {
    it('should show Ready button when current player is not ready', () => {
      renderRoomPage()

      const roomJoinedHandler = mockSocket._getHandler('room-joined')

      const mockData = {
        players: [
          { userId: 'user1', name: 'Player 1', isReady: false },
          { userId: 'user2', name: 'Player 2', isReady: false },
        ],
        playerId: 'user1',
      }

      roomJoinedHandler(mockData)

      const readyButton = screen.getByText('Ready')
      expect(readyButton).toBeInTheDocument()
      expect(readyButton).not.toBeDisabled()
    })

    it('should show Cancel Ready button when current player is ready', () => {
      renderRoomPage()

      const roomJoinedHandler = mockSocket._getHandler('room-joined')

      const mockData = {
        players: [
          { userId: 'user1', name: 'Player 1', isReady: true },
          { userId: 'user2', name: 'Player 2', isReady: false },
        ],
        playerId: 'user1',
      }

      roomJoinedHandler(mockData)

      const cancelButton = screen.getByText('Cancel Ready')
      expect(cancelButton).toBeInTheDocument()
    })

    it('should emit player-ready event when Ready button is clicked', () => {
      renderRoomPage()

      const roomJoinedHandler = mockSocket._getHandler('room-joined')

      const mockData = {
        players: [
          { userId: 'user1', name: 'Player 1', isReady: false },
          { userId: 'user2', name: 'Player 2', isReady: false },
        ],
        playerId: 'user1',
      }

      roomJoinedHandler(mockData)

      const readyButton = screen.getByText('Ready')
      fireEvent.click(readyButton)

      expect(mockSocket.emit).toHaveBeenCalledWith('player-ready', { roomCode: mockRoomCode })
    })

    it('should disable Ready button when there are not 2 players', () => {
      renderRoomPage()

      const roomJoinedHandler = mockSocket._getHandler('room-joined')

      const mockData = {
        players: [{ userId: 'user1', name: 'Player 1', isReady: false }],
        playerId: 'user1',
      }

      roomJoinedHandler(mockData)

      const readyButton = screen.getByText('Ready')
      expect(readyButton).toBeDisabled()
      expect(readyButton).toHaveClass('opacity-50', 'cursor-not-allowed')
    })
  })

  describe('Player Count Messages', () => {
    it('should show "Need 1 more player" when there is 1 player', () => {
      renderRoomPage()

      const playerJoinedHandler = mockSocket._getHandler('player-joined')

      const mockData = {
        players: [{ userId: 'user1', name: 'Player 1', isReady: false }],
      }

      playerJoinedHandler(mockData)

      expect(screen.getByText('Need 1 more player to start!')).toBeInTheDocument()
    })

    it('should show "Both players joined" when there are 2 players', () => {
      renderRoomPage()

      const playerJoinedHandler = mockSocket._getHandler('player-joined')

      const mockData = {
        players: [
          { userId: 'user1', name: 'Player 1', isReady: false },
          { userId: 'user2', name: 'Player 2', isReady: false },
        ],
      }

      playerJoinedHandler(mockData)

      expect(screen.getByText('Both players joined! Ready when everyone is ready...')).toBeInTheDocument()
    })

    it('should show "No players in room yet" when joined but no players', () => {
      renderRoomPage()

      const roomJoinedHandler = mockSocket._getHandler('room-joined')

      const mockData = {
        players: [],
        playerId: 'user1',
      }

      roomJoinedHandler(mockData)

      expect(screen.getByText('No players in room yet')).toBeInTheDocument()
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

    it('should hide joining room message when hasJoined is true', () => {
      renderRoomPage()

      const roomJoinedHandler = mockSocket._getHandler('room-joined')

      const mockData = {
        players: [{ userId: 'user1', name: 'Player 1', isReady: false }],
        playerId: 'user1',
      }

      roomJoinedHandler(mockData)

      expect(screen.queryByText('Joining room...')).not.toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('should display error message when room-error event is received', () => {
      renderRoomPage()

      const roomErrorHandler = mockSocket._getHandler('room-error')

      const errorMessage = 'Room not found'
      roomErrorHandler(errorMessage)

      const errorElement = screen.getByText(errorMessage)
      expect(errorElement).toBeInTheDocument()
      expect(errorElement).toHaveClass('bg-red-500/20', 'border', 'border-red-500', 'text-red-200')
    })

    it('should clear error message when successfully joining room', () => {
      renderRoomPage()

      // First set an error
      const roomErrorHandler = mockSocket._getHandler('room-error')

      roomErrorHandler('Some error')
      expect(screen.getByText('Some error')).toBeInTheDocument()

      // Then successfully join room
      const roomJoinedHandler = mockSocket._getHandler('room-joined')

      roomJoinedHandler({
        players: [{ userId: 'user1', name: 'Player 1', isReady: false }],
        playerId: 'user1',
      })

      expect(screen.queryByText('Some error')).not.toBeInTheDocument()
    })
  })

  describe('Component Structure and Layout', () => {
    it('should have proper CSS classes and styling', () => {
      const { container } = renderRoomPage()

      const mainContainer = container.querySelector('.font-sans.min-h-screen.flex.items-center.justify-center')
      expect(mainContainer).toBeInTheDocument()

      const cardElement = container.querySelector('.bg-white\\/10.backdrop-blur-sm.rounded-2xl.p-8')
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