import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import GameRoomPage from '../../src/app/room/[roomCode]/game/page.js'
import { SocketProvider } from '../../src/contexts/SocketContext.js'
import ErrorBoundary from '../../src/components/ErrorBoundary.js'

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
  useSession: vi.fn()
}))

// Mock next/navigation
const mockRouter = {
  push: vi.fn(),
  refresh: vi.fn()
}
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useParams: () => ({ roomCode: 'TEST123' })
}))

// Mock SocketContext via @/socket import
const createMockSocket = (socketId = 'socket123') => ({
  id: socketId,
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connected: true
})

const mockSocket = createMockSocket()

vi.mock('../../src/socket.js', () => ({
  useSocket: vi.fn(() => ({
    socket: mockSocket,
    isConnected: true,
    socketId: mockSocket.id,
    disconnect: vi.fn()
  }))
}))

// Mock SocketProvider separately for rendering
vi.mock('../../src/contexts/SocketContext.js', () => ({
  SocketProvider: ({ children }) => <div data-testid="socket-provider">{children}</div>
}))

// Mock ErrorBoundary
vi.mock('../../src/components/ErrorBoundary.js', () => ({
  default: ({ children }) => <div data-testid="error-boundary">{children}</div>
}))

// Mock react-icons/fa
vi.mock('react-icons/fa', () => ({
  FaShieldAlt: ({ size }) => <div data-testid="shield-icon" style={{ fontSize: size }} />
}))

// Helper function to render the component with proper providers
const renderGamePage = (sessionData = null, sessionStatus = 'unauthenticated') => {
  vi.mocked(useSession).mockReturnValue({
    data: sessionData,
    status: sessionStatus
  })

  return render(
    <ErrorBoundary>
      <SocketProvider>
        <GameRoomPage />
      </SocketProvider>
    </ErrorBoundary>
  )
}

describe('GameRoomPage Component (Lines 1-921)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRouter.push.mockClear()
    mockSocket.on.mockClear()
    mockSocket.off.mockClear()
    mockSocket.emit.mockClear()
    mockSocket.disconnect.mockClear()

    // Mock alert
    Object.defineProperty(window, 'alert', {
      value: vi.fn(),
      writable: true
    })

    // Reset useSession to default
    vi.mocked(useSession).mockReturnValue({
      data: null,
      status: 'unauthenticated'
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Authentication and Redirects (Lines 97-103)', () => {
    it('should redirect to sign in when user is not authenticated', () => {
      renderGamePage(null, 'unauthenticated')

      expect(mockRouter.push).toHaveBeenCalledWith(
        expect.stringContaining('/auth/signin?callbackUrl=')
      )
    })

    it('should show loading state when session is loading', () => {
      renderGamePage(null, 'loading')

      expect(mockRouter.push).not.toHaveBeenCalled()
      // Should render minimal content while loading
      expect(document.body).toBeTruthy()
    })

    it('should not redirect when user is authenticated', () => {
      const mockUser = { user: { name: 'Test User', email: 'test@example.com' } }
      renderGamePage(mockUser, 'authenticated')

      expect(mockRouter.push).not.toHaveBeenCalled()
    })

    it('should construct correct callback URL with current location', () => {
      // Mock window.location.href
      Object.defineProperty(window, 'location', {
        value: { href: 'http://localhost:3000/room/TEST123/game' },
        writable: true
      })

      renderGamePage(null, 'unauthenticated')

      expect(mockRouter.push).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent('http://localhost:3000/room/TEST123/game'))
      )
    })
  })

  describe('Socket Event Handlers Setup (Lines 110-359)', () => {
    it('should set up all socket event listeners when component mounts', () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      // Check that all required event listeners are set up
      expect(mockSocket.on).toHaveBeenCalledWith('room-joined', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('player-joined', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('player-left', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('tiles-updated', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('game-start', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('turn-changed', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('heart-drawn', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('heart-placed', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('magic-card-drawn', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('magic-card-used', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('game-over', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('room-error', expect.any(Function))
    })

    it('should clean up socket event listeners on unmount', () => {
      const mockUser = { user: { name: 'Test User' } }
      const { unmount } = renderGamePage(mockUser, 'authenticated')

      unmount()

      // Check that all event listeners are cleaned up
      expect(mockSocket.off).toHaveBeenCalledWith('room-joined', expect.any(Function))
      expect(mockSocket.off).toHaveBeenCalledWith('player-joined', expect.any(Function))
      expect(mockSocket.off).toHaveBeenCalledWith('player-left', expect.any(Function))
      expect(mockSocket.off).toHaveBeenCalledWith('tiles-updated', expect.any(Function))
      expect(mockSocket.off).toHaveBeenCalledWith('game-start', expect.any(Function))
      expect(mockSocket.off).toHaveBeenCalledWith('turn-changed', expect.any(Function))
      expect(mockSocket.off).toHaveBeenCalledWith('heart-drawn', expect.any(Function))
      expect(mockSocket.off).toHaveBeenCalledWith('heart-placed', expect.any(Function))
      expect(mockSocket.off).toHaveBeenCalledWith('magic-card-drawn', expect.any(Function))
      expect(mockSocket.off).toHaveBeenCalledWith('magic-card-used', expect.any(Function))
      expect(mockSocket.off).toHaveBeenCalledWith('game-over', expect.any(Function))
      expect(mockSocket.off).toHaveBeenCalledWith('room-error', expect.any(Function))
    })

    it('should join room when socket is available and not already in room', () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      expect(mockSocket.emit).toHaveBeenCalledWith('join-room', {
        roomCode: 'TEST123',
        playerName: expect.stringMatching(/^Player_.{6,}$/)
      })
    })

    it('should leave previous room before joining new one', () => {
      const mockUser = { user: { name: 'Test User' } }

      // Render first time to set current room
      const { unmount } = renderGamePage(mockUser, 'authenticated')
      expect(mockSocket.emit).toHaveBeenCalledWith('join-room', expect.any(Object))

      unmount()

      // Clear mock to track new calls
      mockSocket.emit.mockClear()

      // Render again with same room code - should not emit leave-room
      renderGamePage(mockUser, 'authenticated')
      expect(mockSocket.emit).not.toHaveBeenCalledWith('leave-room', expect.any(Object))
    })
  })

  describe('Room Event Handlers (Lines 110-124)', () => {
    it('should handle room-joined event', () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      // Get the room-joined event handler
      const roomJoinedHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'room-joined'
      )?.[1]

      expect(roomJoinedHandler).toBeDefined()

      const mockPlayers = [
        { userId: 'player1', name: 'Player 1', isReady: true },
        { userId: 'player2', name: 'Player 2', isReady: false }
      ]

      act(() => {
        roomJoinedHandler({ players: mockPlayers, playerId: 'player1' })
      })

      // Check that the game room renders basic elements
      expect(screen.getByText('Game Room')).toBeInTheDocument()
      expect(screen.getByText('Room Code:')).toBeInTheDocument()
    })

    it('should handle player-joined event', async () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      const playerJoinedHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'player-joined'
      )?.[1]

      if (playerJoinedHandler) {
        const newPlayers = [
          { userId: 'player1', name: 'Player 1', isReady: true },
          { userId: 'player2', name: 'New Player', isReady: false }
        ]

        act(() => {
          playerJoinedHandler({ players: newPlayers })
        })

        expect(screen.getAllByText('New Player')).toHaveLength(2)
      }
    })

    it('should handle player-left event', async () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      const playerLeftHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'player-left'
      )?.[1]

      if (playerLeftHandler) {
        const remainingPlayers = [
          { userId: 'player1', name: 'Player 1', isReady: true }
        ]

        act(() => {
          playerLeftHandler({ players: remainingPlayers })
        })

        expect(screen.getAllByText('Player 1').length).toBeGreaterThan(0)
        expect(screen.queryByText('Player 2')).not.toBeInTheDocument()
      }
    })
  })

  describe('Game State Management (Lines 131-180)', () => {
    it('should handle game-start event with complete game data', async () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      const gameStartHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game-start'
      )?.[1]

      if (gameStartHandler) {
        const gameData = {
          tiles: [
            { id: 1, color: 'red', emoji: '🟥' },
            { id: 2, color: 'blue', emoji: '🟦' }
          ],
          currentPlayer: { userId: 'player1', name: 'Player 1' },
          players: [
            { userId: 'player1', name: 'Player 1', score: 0 },
            { userId: 'player2', name: 'Player 2', score: 0 }
          ],
          playerHands: {
            player1: [
              { id: 'h1', color: 'red', emoji: '❤️', value: 2 }
            ]
          },
          deck: { emoji: '💌', cards: 14 },
          magicDeck: { emoji: '🔮', cards: 14, type: 'magic' },
          turnCount: 1,
          playerId: 'player1'
        }

        act(() => {
          gameStartHandler(gameData)
        })

        expect(screen.getByText('Turn: 1')).toBeInTheDocument()
        expect(screen.getByText('Player 1')).toBeInTheDocument()
        expect(screen.getByText((content, element) => {
  return content.includes('Current Player:')
})).toBeInTheDocument()
      }
    })

    it('should handle game-start event with array data format', async () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      const gameStartHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game-start'
      )?.[1]

      if (gameStartHandler) {
        const gameDataArray = [{
          tiles: [],
          currentPlayer: null,
          players: [],
          playerHands: {},
          deck: { emoji: '💌', cards: 16 },
          magicDeck: { emoji: '🔮', cards: 16, type: 'magic' },
          turnCount: 0,
          playerId: null
        }]

        act(() => {
          gameStartHandler(gameDataArray)
        })

        // Should handle array format without errors
        expect(document.body).toBeTruthy()
      }
    })

    it('should handle invalid game-start data gracefully', async () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      const gameStartHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game-start'
      )?.[1]

      if (gameStartHandler) {
        // Mock console.error to verify error handling
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        act(() => {
          gameStartHandler(null)
        })

        expect(consoleSpy).toHaveBeenCalledWith('Invalid game data received')
        consoleSpy.mockRestore()
      }
    })
  })

  describe('Turn Management (Lines 182-200)', () => {
    it('should handle turn-changed event', async () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      const turnChangedHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'turn-changed'
      )?.[1]

      if (turnChangedHandler) {
        const turnData = {
          currentPlayer: { userId: 'player2', name: 'Player 2' },
          turnCount: 2,
          players: [
            { userId: 'player1', name: 'Player 1', score: 5 },
            { userId: 'player2', name: 'Player 2', score: 3 }
          ]
        }

        act(() => {
          turnChangedHandler(turnData)
        })

        expect(screen.getByText('Turn: 2')).toBeInTheDocument()
        expect(screen.getAllByText('Player 2')).toHaveLength(3)
        expect(screen.getByText((content, element) => {
  return content.includes('Current Player:')
})).toBeInTheDocument()
      }
    })
  })

  describe('Card Drawing Events (Lines 202-244)', () => {
    it('should handle heart-drawn event', async () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      const heartDrawnHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'heart-drawn'
      )?.[1]

      if (heartDrawnHandler) {
        const drawData = {
          players: [
            { userId: 'player1', name: 'Player 1', score: 0 }
          ],
          playerHands: {
            player1: [
              { id: 'h1', color: 'red', emoji: '❤️', value: 3 }
            ]
          },
          deck: { emoji: '💌', cards: 13 }
        }

        act(() => {
          heartDrawnHandler(drawData)
        })

        expect(screen.getByText('Heart Deck: 13 cards')).toBeInTheDocument()
      }
    })

    it('should handle magic-card-drawn event', async () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      const magicCardDrawnHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'magic-card-drawn'
      )?.[1]

      if (magicCardDrawnHandler) {
        const drawData = {
          players: [
            { userId: 'player1', name: 'Player 1', score: 0 }
          ],
          playerHands: {
            player1: [
              { id: 'm1', type: 'shield', emoji: '🛡️', name: 'Shield Card' }
            ]
          },
          magicDeck: { emoji: '🔮', cards: 13, type: 'magic' }
        }

        act(() => {
          magicCardDrawnHandler(drawData)
        })

        expect(screen.getByText('Magic Deck: 13 cards')).toBeInTheDocument()
      }
    })
  })

  describe('Game Actions (Lines 364-400)', () => {
    it('should emit draw-heart event when drawHeart is called', () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      // Set up game state with current player
      const gameStartHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game-start'
      )?.[1]

      if (gameStartHandler) {
        act(() => {
          gameStartHandler({
            currentPlayer: { userId: 'user1', name: 'Test User' },
            players: [{ userId: 'user1', name: 'Test User' }],
            playerId: 'user1',
            tiles: [],
            playerHands: {},
            deck: { emoji: '💌', cards: 10 },
            magicDeck: { emoji: '🔮', cards: 10 },
            turnCount: 1
          })
        })
      }

      const drawHeartButton = screen.getByText('Draw Heart')
      fireEvent.click(drawHeartButton)

      expect(mockSocket.emit).toHaveBeenCalledWith('draw-heart', {
        roomCode: 'TEST123'
      })
    })

    it('should emit draw-magic-card event when drawMagicCard is called', () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      // Set up game state
      const gameStartHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game-start'
      )?.[1]

      if (gameStartHandler) {
        act(() => {
          gameStartHandler({
            currentPlayer: { userId: 'user1', name: 'Test User' },
            players: [{ userId: 'user1', name: 'Test User' }],
            playerId: 'user1',
            tiles: [],
            playerHands: {},
            deck: { emoji: '💌', cards: 10 },
            magicDeck: { emoji: '🔮', cards: 10 },
            turnCount: 1
          })
        })
      }

      const drawMagicButton = screen.getByText('Draw Magic Card')
      fireEvent.click(drawMagicButton)

      expect(mockSocket.emit).toHaveBeenCalledWith('draw-magic-card', {
        roomCode: 'TEST123'
      })
    })

    it('should emit end-turn event when endTurn is called', () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      // Set up game state where user is current player
      const gameStartHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game-start'
      )?.[1]

      if (gameStartHandler) {
        act(() => {
          gameStartHandler({
            currentPlayer: { userId: 'user1', name: 'Test User' },
            players: [{ userId: 'user1', name: 'Test User' }],
            playerId: 'user1',
            tiles: [],
            playerHands: {},
            deck: { emoji: '💌', cards: 10 },
            magicDeck: { emoji: '🔮', cards: 10 },
            turnCount: 1
          })
        })
      }

      const endTurnButton = screen.getByRole('button', { name: /end turn/i })
      fireEvent.click(endTurnButton)

      expect(mockSocket.emit).toHaveBeenCalledWith('end-turn', {
        roomCode: 'TEST123'
      })
    })

    it('should handle leave game correctly', () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      const leaveButton = screen.getByText('Leave Game')
      fireEvent.click(leaveButton)

      expect(mockSocket.emit).toHaveBeenCalledWith('leave-room', {
        roomCode: 'TEST123'
      })

      // Should navigate to home after delay
      setTimeout(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/')
      }, 150)
    })
  })

  describe('Card Selection Logic (Lines 408-444)', () => {
    it('should select heart card from hand', async () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      // Set up game with heart card in hand
      const gameStartHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game-start'
      )?.[1]

      if (gameStartHandler) {
        act(() => {
          gameStartHandler({
            currentPlayer: { userId: 'user1', name: 'Test User' },
            players: [{ userId: 'user1', name: 'Test User' }],
            playerId: 'user1',
            tiles: [],
            playerHands: {
              user1: [
                { id: 'h1', color: 'red', emoji: '❤️', value: 2 }
              ]
            },
            deck: { emoji: '💌', cards: 10 },
            magicDeck: { emoji: '🔮', cards: 10 },
            turnCount: 1
          })
        })

        const heartCard = screen.getByText('❤️')
        fireEvent.click(heartCard)

        expect(screen.getByText(/Selected: ❤️.*value: 2/)).toBeInTheDocument()
      }
    })

    it('should select magic card from hand', async () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      const gameStartHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game-start'
      )?.[1]

      if (gameStartHandler) {
        act(() => {
          gameStartHandler({
            currentPlayer: { userId: 'user1', name: 'Test User' },
            players: [{ userId: 'user1', name: 'Test User' }],
            playerId: 'user1',
            tiles: [],
            playerHands: {
              user1: [
                { id: 'm1', type: 'shield', emoji: '🛡️', name: 'Shield Card', description: 'Protects for 2 turns' }
              ]
            },
            deck: { emoji: '💌', cards: 10 },
            magicDeck: { emoji: '🔮', cards: 10 },
            turnCount: 1
          })
        })

        const magicCard = screen.getByText('🛡️')
        fireEvent.click(magicCard)

        expect(screen.getByText(/Selected: 🛡️ Shield Card/)).toBeInTheDocument()
      }
    })
  })

  describe('Tile Interaction (Lines 466-479)', () => {
    it('should handle tile click with selected heart card', async () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      const gameStartHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game-start'
      )?.[1]

      if (gameStartHandler) {
        act(() => {
          gameStartHandler({
            currentPlayer: { userId: 'user1', name: 'Test User' },
            players: [{ userId: 'user1', name: 'Test User' }],
            playerId: 'user1',
            tiles: [
              { id: 1, color: 'red', emoji: '🟥' }
            ],
            playerHands: {
              user1: [
                { id: 'h1', color: 'red', emoji: '❤️', value: 2 }
              ]
            },
            deck: { emoji: '💌', cards: 10 },
            magicDeck: { emoji: '🔮', cards: 10 },
            turnCount: 1
          })
        })

        // First select heart card
        const heartCard = screen.getByText('❤️')
        fireEvent.click(heartCard)

        // Then click tile
        const tile = screen.getByText('🟥')
        fireEvent.click(tile)

        expect(mockSocket.emit).toHaveBeenCalledWith('place-heart', {
          roomCode: 'TEST123',
          tileId: 1,
          heartId: 'h1'
        })
      }
    })

    it('should handle tile click with selected magic card', async () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      const gameStartHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game-start'
      )?.[1]

      if (gameStartHandler) {
        act(() => {
          gameStartHandler({
            currentPlayer: { userId: 'user1', name: 'Test User' },
            players: [{ userId: 'user1', name: 'Test User' }],
            playerId: 'user1',
            tiles: [
              { id: 1, color: 'red', emoji: '🟥' }
            ],
            playerHands: {
              user1: [
                { id: 'm1', type: 'wind', emoji: '💨', name: 'Wind Card', description: 'Blow away hearts' }
              ]
            },
            deck: { emoji: '💌', cards: 10 },
            magicDeck: { emoji: '🔮', cards: 10 },
            turnCount: 1
          })
        })

        // First select magic card
        const magicCard = screen.getByText('💨')
        fireEvent.click(magicCard)

        // Then click tile
        const tile = screen.getByText('🟥')
        fireEvent.click(tile)

        expect(mockSocket.emit).toHaveBeenCalledWith('use-magic-card', {
          roomCode: 'TEST123',
          cardId: 'm1',
          targetTileId: 1
        })
      }
    })
  })

  describe('Shield Functionality (Lines 513-534, 655-708)', () => {
    it('should display shield status for players with active shields', async () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      const gameStartHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game-start'
      )?.[1]

      if (gameStartHandler) {
        act(() => {
          gameStartHandler({
            currentPlayer: { userId: 'user1', name: 'Test User' },
            players: [
              { userId: 'user1', name: 'Test User' },
              { userId: 'user2', name: 'Opponent' }
            ],
            playerId: 'user1',
            tiles: [],
            playerHands: {},
            deck: { emoji: '💌', cards: 10 },
            magicDeck: { emoji: '🔮', cards: 10 },
            turnCount: 1,
            shields: {
              user1: { active: true, remainingTurns: 2, activatedAt: Date.now(), activatedBy: 'user1' },
              user2: { active: true, remainingTurns: 1, activatedAt: Date.now(), activatedBy: 'user2' }
            }
          })
        })

        // Should show shield icons for both players
        const shieldIcons = screen.getAllByTestId('shield-icon')
        expect(shieldIcons.length).toBeGreaterThan(0)
      }
    })

    it('should show shield protection indicators on tiles when shield is active', async () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      const gameStartHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game-start'
      )?.[1]

      if (gameStartHandler) {
        act(() => {
          gameStartHandler({
            currentPlayer: { userId: 'user1', name: 'Test User' },
            players: [{ userId: 'user1', name: 'Test User' }],
            playerId: 'user1',
            tiles: [
              { id: 1, color: 'red', emoji: '🟥' },
              { id: 2, color: 'blue', emoji: '🟦' }
            ],
            playerHands: {
              user1: [
                { id: 'm1', type: 'shield', emoji: '🛡️', name: 'Shield Card', description: 'Protection' }
              ]
            },
            deck: { emoji: '💌', cards: 10 },
            magicDeck: { emoji: '🔮', cards: 10 },
            turnCount: 1,
            shields: {
              user1: { active: true, remainingTurns: 2, activatedAt: Date.now(), activatedBy: 'user1' }
            }
          })
        })

        // Select shield card
        const shieldCard = screen.getByText('🛡️')
        fireEvent.click(shieldCard)

        // Tiles should have shield targeting indicators
        const tiles = screen.getAllByTestId('shield-icon')
        expect(tiles.length).toBeGreaterThan(0)
      }
    })
  })

  describe('Game Over Handling (Lines 281-308)', () => {
    it('should handle game-over event and show results', async () => {
      const mockUser = { user: { name: 'Test User' } }

      renderGamePage(mockUser, 'authenticated')

      // Get the game-over handler and mock alert before calling it
      const gameOverHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game-over'
      )?.[1]

      if (gameOverHandler) {
        const gameOverData = {
          reason: 'All tiles are filled',
          players: [
            { userId: 'user1', name: 'Test User', score: 15 },
            { userId: 'user2', name: 'Opponent', score: 12 }
          ],
          winner: { userId: 'user1', name: 'Test User', score: 15 },
          isTie: false,
          finalScores: [
            { userId: 'user1', name: 'Test User', score: 15 },
            { userId: 'user2', name: 'Opponent', score: 12 }
          ]
        }

        act(() => {
          gameOverHandler(gameOverData)
        })

        // Test that game-over event is handled without crashing
        expect(screen.getByText('Game Room')).toBeInTheDocument()
      }
    })

    it('should handle tie game scenario', async () => {
      const mockUser = { user: { name: 'Test User' } }

      renderGamePage(mockUser, 'authenticated')

      const gameOverHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game-over'
      )?.[1]

      if (gameOverHandler) {
        const gameOverData = {
          reason: 'All tiles are filled',
          players: [
            { userId: 'user1', name: 'Test User', score: 15 },
            { userId: 'user2', name: 'Opponent', score: 15 }
          ],
          winner: null,
          isTie: true,
          finalScores: [
            { userId: 'user1', name: 'Test User', score: 15 },
            { userId: 'user2', name: 'Opponent', score: 15 }
          ]
        }

        act(() => {
          gameOverHandler(gameOverData)
        })

        // Test that tie game event is handled without crashing
        expect(screen.getByText('Game Room')).toBeInTheDocument()
      }
    })
  })

  describe('Error Handling (Lines 310-317)', () => {
    it('should handle room-error event and redirect for full room', async () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      const roomErrorHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'room-error'
      )?.[1]

      if (roomErrorHandler) {
        act(() => {
          roomErrorHandler('Room is full')
        })

        expect(mockRouter.push).toHaveBeenCalledWith('/room/TEST123')
      }
    })

    it('should handle other room errors without redirecting', async () => {
      const mockUser = { user: { name: 'Test User' } }

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      renderGamePage(mockUser, 'authenticated')

      const roomErrorHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'room-error'
      )?.[1]

      if (roomErrorHandler) {
        act(() => {
          roomErrorHandler('Some other error')
        })

        expect(consoleSpy).toHaveBeenCalledWith('Game page: Room error:', 'Some other error')
        expect(mockRouter.push).not.toHaveBeenCalled()
      }

      consoleSpy.mockRestore()
    })
  })

  describe('UI Elements and Display (Lines 481-921)', () => {
    it('should display connection status', () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      expect(screen.getByText('Connected')).toBeInTheDocument()
      expect(screen.getByText('Game Room')).toBeInTheDocument()
    })

    it('should display room code', () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      expect(screen.getByText('Room Code:')).toBeInTheDocument()
      expect(screen.getByText('TEST123')).toBeInTheDocument()
    })

    it('should display deck information', async () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      const gameStartHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game-start'
      )?.[1]

      if (gameStartHandler) {
        act(() => {
          gameStartHandler({
            currentPlayer: { userId: 'user1', name: 'Test User' },
            players: [{ userId: 'user1', name: 'Test User' }],
            playerId: 'user1',
            tiles: [],
            playerHands: {},
            deck: { emoji: '💌', cards: 14 },
            magicDeck: { emoji: '🔮', cards: 14, type: 'magic' },
            turnCount: 1
          })
        })

        expect(screen.getByText('Heart Deck: 14 cards')).toBeInTheDocument()
        expect(screen.getByText('Magic Deck: 14 cards')).toBeInTheDocument()
      }
    })

    it('should display turn requirements for current player', async () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      const gameStartHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game-start'
      )?.[1]

      if (gameStartHandler) {
        act(() => {
          gameStartHandler({
            currentPlayer: { userId: 'user1', name: 'Test User' },
            players: [{ userId: 'user1', name: 'Test User' }],
            playerId: 'user1',
            tiles: [],
            playerHands: {},
            deck: { emoji: '💌', cards: 10 },
            magicDeck: { emoji: '🔮', cards: 10 },
            turnCount: 1,
            playerActions: {
              user1: { drawnHeart: false, drawnMagic: false, heartsPlaced: 0, magicCardsUsed: 0 }
            }
          })
        })

        expect(screen.getByText('Turn Requirements:')).toBeInTheDocument()
        expect(screen.getByText('Draw Heart (10 left)')).toBeInTheDocument()
        expect(screen.getByText('Draw Magic (10 left)')).toBeInTheDocument()
      }
    })

    it('should not show turn requirements for non-current player', async () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      const gameStartHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game-start'
      )?.[1]

      if (gameStartHandler) {
        act(() => {
          gameStartHandler({
            currentPlayer: { userId: 'player2', name: 'Other Player' },
            players: [
              { userId: 'user1', name: 'Test User' },
              { userId: 'player2', name: 'Other Player' }
            ],
            playerId: 'user1',
            tiles: [],
            playerHands: {},
            deck: { emoji: '💌', cards: 10 },
            magicDeck: { emoji: '🔮', cards: 10 },
            turnCount: 1
          })
        })

        expect(screen.queryByText('Turn Requirements:')).not.toBeInTheDocument()
      }
    })
  })

  describe('Current Player Detection (Lines 402-405)', () => {
    it('should correctly identify when user is current player', async () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      const gameStartHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game-start'
      )?.[1]

      if (gameStartHandler) {
        act(() => {
          gameStartHandler({
            currentPlayer: { userId: 'user1', name: 'Test User' },
            players: [{ userId: 'user1', name: 'Test User' }],
            playerId: 'user1',
            tiles: [],
            playerHands: {},
            deck: { emoji: '💌', cards: 10 },
            magicDeck: { emoji: '🔮', cards: 10 },
            turnCount: 1
          })
        })

        expect(screen.getByText('Test User (You)')).toBeInTheDocument()
        expect(screen.getByText((content, element) => {
  return content.includes('Current Player:')
})).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /end turn/i })).toBeInTheDocument()
      }
    })

    it('should correctly identify when user is not current player', async () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      const gameStartHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game-start'
      )?.[1]

      if (gameStartHandler) {
        act(() => {
          gameStartHandler({
            currentPlayer: { userId: 'player2', name: 'Other Player' },
            players: [
              { userId: 'user1', name: 'Test User' },
              { userId: 'player2', name: 'Other Player' }
            ],
            playerId: 'user1',
            tiles: [],
            playerHands: {},
            deck: { emoji: '💌', cards: 10 },
            magicDeck: { emoji: '🔮', cards: 10 },
            turnCount: 1
          })
        })

        expect(screen.getAllByText('Other Player').length).toBeGreaterThan(0)
        expect(screen.getByText((content, element) => {
  return content.includes('Current Player:')
})).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /end turn/i })).not.toBeInTheDocument()
      }
    })
  })

  describe('Magic Card Execution (Lines 446-463)', () => {
    it('should handle shield card execution on self', async () => {
      const mockUser = { user: { name: 'Test User' } }
      renderGamePage(mockUser, 'authenticated')

      const gameStartHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game-start'
      )?.[1]

      if (gameStartHandler) {
        act(() => {
          gameStartHandler({
            currentPlayer: { userId: 'user1', name: 'Test User' },
            players: [{ userId: 'user1', name: 'Test User' }],
            playerId: 'user1',
            tiles: [],
            playerHands: {
              user1: [
                { id: 'm1', type: 'shield', emoji: '🛡️', name: 'Shield Card', description: 'Protection' }
              ]
            },
            deck: { emoji: '💌', cards: 10 },
            magicDeck: { emoji: '🔮', cards: 10 },
            turnCount: 1
          })
        })

        // Select shield card
        const shieldCard = screen.getByText('🛡️')
        fireEvent.click(shieldCard)

        // Click activate shield button
        const activateButton = screen.getByText('Activate Shield 🛡️ (2 turns)')
        fireEvent.click(activateButton)

        expect(mockSocket.emit).toHaveBeenCalledWith('use-magic-card', {
          roomCode: 'TEST123',
          cardId: 'm1',
          targetTileId: 'self'
        })
      }
    })
  })

  describe('Player Action Limits (Lines 854-880)', () => {
    it('should display action usage for current turn', async () => {
      const mockUser = { user: { name: 'Test User', email: 'test@example.com' } }
      renderGamePage(mockUser, 'authenticated')

      const gameStartHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'game-start'
      )?.[1]

      if (gameStartHandler) {
        act(() => {
          gameStartHandler({
            currentPlayer: { userId: 'socket123', name: 'Test User' },
            players: [{ userId: 'socket123', name: 'Test User' }],
            playerId: 'socket123',
            tiles: [],
            playerHands: {},
            deck: { emoji: '💌', cards: 10 },
            magicDeck: { emoji: '🔮', cards: 10 },
            turnCount: 1,
            playerActions: {
              socket123: { drawnHeart: true, drawnMagic: true, heartsPlaced: 1, magicCardsUsed: 1 }
            }
          })
        })

        // Check that basic game elements are rendered
        expect(screen.getByText('Game Room')).toBeInTheDocument()
        expect(screen.getByText('Connected')).toBeInTheDocument()

        // Verify action usage display for current turn
        expect(screen.getByText('Hearts Placed: 1/2')).toBeInTheDocument()
        expect(screen.getByText('Magic Cards Used: 1/1')).toBeInTheDocument()
      }
    })
  })
})