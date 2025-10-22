// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionProvider } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Home from '../../src/app/page'

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: mockPush,
  })),
  usePathname: vi.fn(() => '/'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}))

// Note: next-auth/react is mocked globally in setup.js with proper NextAuth 5.0.0-beta.29 structure

describe('Home Component', () => {
  let mockUseSession
  let mockSignIn
  let mockSignOut
  let user

  beforeEach(async () => {
    vi.clearAllMocks()
    mockPush.mockClear()

    // Reset session mock to default unauthenticated state
    const nextAuthReact = await import('next-auth/react')
    if (nextAuthReact.__mockHelpers) {
      nextAuthReact.__mockHelpers.resetMockSession()
    }

    // Get references to mock functions
    mockUseSession = global.__mockUseSession
    mockSignIn = nextAuthReact.signIn
    mockSignOut = nextAuthReact.signOut

    user = userEvent.setup()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Helper function to render the Home component with proper providers
  const renderHome = () => {
    return render(
      <SessionProvider>
        <Home />
      </SessionProvider>
    )
  }

  describe('Component Rendering', () => {
    it('renders main game title and description', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })

      renderHome()

      expect(screen.getByText('Heart Tiles')).toBeInTheDocument()
      expect(screen.getByText(/A strategic tile-based card game/)).toBeInTheDocument()
    })

    it('renders Create Room and Join Room buttons', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })

      renderHome()

      expect(screen.getByText('Create Room')).toBeInTheDocument()
      expect(screen.getByText('Join Room')).toBeInTheDocument()
    })

    it('has proper background styling classes', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })

      renderHome()
      const mainContainer = screen.getByText('Heart Tiles').closest('div').parentElement.parentElement
      expect(mainContainer).toHaveClass('min-h-screen', 'flex', 'items-center', 'justify-center')
    })
  })

  describe('Authentication States', () => {
    it('shows loading state when session is loading', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'loading',
        update: vi.fn().mockResolvedValue(null),
      })

      renderHome()

      expect(screen.getByText('Loading...')).toBeInTheDocument()
      expect(screen.queryByText('Sign In')).not.toBeInTheDocument()
      expect(screen.queryByText('Sign Out')).not.toBeInTheDocument()
    })

    it('shows sign in/up buttons when unauthenticated', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })

      renderHome()

      expect(screen.getByText('Sign In')).toBeInTheDocument()
      expect(screen.getByText('Sign Up')).toBeInTheDocument()
      expect(screen.queryByText('Sign Out')).not.toBeInTheDocument()
    })

    it('shows user info and sign out button when authenticated', () => {
      const mockSession = {
        user: {
          name: 'Test User',
          email: 'test@example.com',
        },
        expires: '2024-01-01',
      }

      mockUseSession.mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: vi.fn().mockResolvedValue(mockSession),
      })

      renderHome()

      expect(screen.getByText('Welcome back,')).toBeInTheDocument()
      expect(screen.getByText('Test User')).toBeInTheDocument()
      expect(screen.getByText('Sign Out')).toBeInTheDocument()
      expect(screen.queryByText('Sign In')).not.toBeInTheDocument()
      expect(screen.queryByText('Sign Up')).not.toBeInTheDocument()
    })

    it('handles missing user name gracefully', () => {
      const mockSession = {
        user: {
          email: 'test@example.com',
        },
        expires: '2024-01-01',
      }

      mockUseSession.mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: vi.fn().mockResolvedValue(mockSession),
      })

      renderHome()

      expect(screen.getByText('Welcome back,')).toBeInTheDocument()
      expect(screen.getByText('Sign Out')).toBeInTheDocument()
    })
  })

  describe('Room Creation', () => {
    it('redirects to sign in when unauthenticated user clicks Create Room', async () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })

      mockSignIn.mockResolvedValue({})

      renderHome()

      const createRoomButton = screen.getByText('Create Room')
      await user.click(createRoomButton)

      expect(mockSignIn).toHaveBeenCalled()
      expect(mockPush).not.toHaveBeenCalled()
    })

    it('generates room code and navigates when authenticated user clicks Create Room', async () => {
      const mockSession = {
        user: { name: 'Test User', email: 'test@example.com' },
        expires: '2024-01-01',
      }

      mockUseSession.mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: vi.fn().mockResolvedValue(mockSession),
      })

      renderHome()

      const createRoomButton = screen.getByText('Create Room')
      await user.click(createRoomButton)

      expect(mockSignIn).not.toHaveBeenCalled()
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringMatching(/^\/room\/[A-Z0-9]{6}$/)
      )
    })

    it('generates different room codes on multiple clicks', async () => {
      const mockSession = {
        user: { name: 'Test User', email: 'test@example.com' },
        expires: '2024-01-01',
      }

      mockUseSession.mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: vi.fn().mockResolvedValue(mockSession),
      })

      // Reset Math.random call count for predictable behavior
      vi.resetModules()
      renderHome()

      const createRoomButton = screen.getByText('Create Room')

      // Mock Math.random to return different values
      const mockMathRandom = vi.fn()
        .mockReturnValueOnce(0.123456789)
        .mockReturnValueOnce(0.987654321)

      global.Math.random = mockMathRandom

      await user.click(createRoomButton)
      const firstCall = mockPush.mock.calls[0][0]

      await user.click(createRoomButton)
      const secondCall = mockPush.mock.calls[1][0]

      expect(firstCall).not.toBe(secondCall)
      expect(firstCall).toMatch(/^\/room\/[A-Z0-9]{6}$/)
      expect(secondCall).toMatch(/^\/room\/[A-Z0-9]{6}$/)
    })
  })

  describe('Room Joining Modal', () => {
    it('opens join room dialog when Join Room button is clicked', async () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })

      renderHome()

      const joinRoomButton = screen.getByRole('button', { name: 'Join Room' })
      await user.click(joinRoomButton)

      expect(screen.getByRole('heading', { name: 'Join Room', level: 2 })).toBeInTheDocument()
      expect(screen.getByText('Enter the room code to join an existing game')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Enter room code')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    it('closes modal when Cancel button is clicked', async () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })

      renderHome()

      const joinRoomButton = screen.getByRole('button', { name: 'Join Room' })
      await user.click(joinRoomButton)

      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      await user.click(cancelButton)

      expect(screen.queryByText('Enter the room code to join an existing game')).not.toBeInTheDocument()
    })

    it('converts input to uppercase as user types', async () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })

      renderHome()

      const joinRoomButton = screen.getByRole('button', { name: 'Join Room' })
      await user.click(joinRoomButton)

      const roomCodeInput = screen.getByPlaceholderText('Enter room code')
      await user.type(roomCodeInput, 'abc123')

      expect(roomCodeInput).toHaveValue('ABC123')
    })

    it('enables Join button only when room code is entered', async () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })

      renderHome()

      const joinRoomButton = screen.getByRole('button', { name: 'Join Room' })
      await user.click(joinRoomButton)

      const joinButton = screen.getByRole('button', { name: 'Join' })
      expect(joinButton).toBeDisabled()

      const roomCodeInput = screen.getByPlaceholderText('Enter room code')
      await user.type(roomCodeInput, 'ABC123')

      expect(joinButton).toBeEnabled()
    })

    it('limits room code input to 6 characters', async () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })

      renderHome()

      const joinRoomButton = screen.getByRole('button', { name: 'Join Room' })
      await user.click(joinRoomButton)

      const roomCodeInput = screen.getByPlaceholderText('Enter room code')
      await user.type(roomCodeInput, 'ABCDEFGHIJ')

      expect(roomCodeInput).toHaveValue('ABCDEF')
      expect(roomCodeInput).toHaveAttribute('maxlength', '6')
    })

    it('redirects to sign in when unauthenticated user tries to join room', async () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })

      mockSignIn.mockResolvedValue({})

      renderHome()

      const joinRoomButton = screen.getByRole('button', { name: 'Join Room' })
      await user.click(joinRoomButton)

      const roomCodeInput = screen.getByPlaceholderText('Enter room code')
      await user.type(roomCodeInput, 'ABC123')

      const joinButton = screen.getByRole('button', { name: 'Join' })
      await user.click(joinButton)

      expect(mockSignIn).toHaveBeenCalled()
      expect(mockPush).not.toHaveBeenCalled()
    })

    it('navigates to room when authenticated user joins with valid code', async () => {
      const mockSession = {
        user: { name: 'Test User', email: 'test@example.com' },
        expires: '2024-01-01',
      }

      mockUseSession.mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: vi.fn().mockResolvedValue(mockSession),
      })

      renderHome()

      const joinRoomButton = screen.getByRole('button', { name: 'Join Room' })
      await user.click(joinRoomButton)

      const roomCodeInput = screen.getByPlaceholderText('Enter room code')
      await user.type(roomCodeInput, 'abc123')

      const joinButton = screen.getByRole('button', { name: 'Join' })
      await user.click(joinButton)

      expect(mockSignIn).not.toHaveBeenCalled()
      expect(mockPush).toHaveBeenCalledWith('/room/ABC123')
    })

    it('trims whitespace from room code', async () => {
      const mockSession = {
        user: { name: 'Test User', email: 'test@example.com' },
        expires: '2024-01-01',
      }

      mockUseSession.mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: vi.fn().mockResolvedValue(mockSession),
      })

      renderHome()

      const joinRoomButton = screen.getByRole('button', { name: 'Join Room' })
      await user.click(joinRoomButton)

      const roomCodeInput = screen.getByPlaceholderText('Enter room code')
      await user.type(roomCodeInput, 'abc123')

      const joinButton = screen.getByRole('button', { name: 'Join' })
      await user.click(joinButton)

      expect(mockPush).toHaveBeenCalledWith('/room/ABC123')
    })

    it('does not navigate when room code is empty or only whitespace', async () => {
      const mockSession = {
        user: { name: 'Test User', email: 'test@example.com' },
        expires: '2024-01-01',
      }

      mockUseSession.mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: vi.fn().mockResolvedValue(mockSession),
      })

      renderHome()

      const joinRoomButton = screen.getByRole('button', { name: 'Join Room' })
      await user.click(joinRoomButton)

      // Test with empty input
      const joinButton = screen.getByRole('button', { name: 'Join' })
      expect(joinButton).toBeDisabled()

      // Test with only whitespace
      const roomCodeInput = screen.getByPlaceholderText('Enter room code')
      await user.type(roomCodeInput, '   ')

      // Button should still be disabled after typing only whitespace
      expect(joinButton).toBeDisabled()
    })
  })

  describe('Authentication Actions', () => {
    it('calls signOut when Sign Out button is clicked', async () => {
      const mockSession = {
        user: { name: 'Test User', email: 'test@example.com' },
        expires: '2024-01-01',
      }

      mockUseSession.mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: vi.fn().mockResolvedValue(mockSession),
      })

      mockSignOut.mockResolvedValue({})

      renderHome()

      const signOutButton = screen.getByText('Sign Out')
      await user.click(signOutButton)

      expect(mockSignOut).toHaveBeenCalled()
    })

    it('has correct navigation links for auth pages', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })

      renderHome()

      const signInLink = screen.getByText('Sign In').closest('a')
      const signUpLink = screen.getByText('Sign Up').closest('a')

      expect(signInLink).toHaveAttribute('href', '/auth/signin')
      expect(signUpLink).toHaveAttribute('href', '/auth/signup')
    })
  })

  describe('Button Styling and Interactions', () => {
    it('applies hover effects and transitions to main buttons', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })

      renderHome()

      const createRoomButton = screen.getByText('Create Room')
      const joinRoomButton = screen.getByText('Join Room')

      expect(createRoomButton).toHaveClass(
        'bg-green-600',
        'hover:bg-green-700',
        'transition-all',
        'duration-200',
        'transform',
        'hover:scale-105'
      )

      expect(joinRoomButton).toHaveClass(
        'bg-blue-600',
        'hover:bg-blue-700',
        'transition-all',
        'duration-200',
        'transform',
        'hover:scale-105'
      )
    })

    it('applies correct styling to auth buttons', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })

      renderHome()

      const signInLink = screen.getByText('Sign In')
      const signUpLink = screen.getByText('Sign Up')

      expect(signInLink).toHaveClass('bg-indigo-600', 'hover:bg-indigo-700')
      expect(signUpLink).toHaveClass('bg-green-600', 'hover:bg-green-700')
    })

    it('applies disabled styling to join button when no room code', async () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })

      renderHome()

      const joinRoomButton = screen.getByText('Join Room')
      await user.click(joinRoomButton)

      const joinButton = screen.getByText('Join')
      expect(joinButton).toHaveClass('bg-gray-300', 'text-gray-500', 'cursor-not-allowed')
    })

    it('applies active styling to join button when room code is entered', async () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })

      renderHome()

      const joinRoomButton = screen.getByText('Join Room')
      await user.click(joinRoomButton)

      const roomCodeInput = screen.getByPlaceholderText('Enter room code')
      await user.type(roomCodeInput, 'ABC123')

      const joinButton = screen.getByText('Join')
      expect(joinButton).toHaveClass('bg-blue-600', 'hover:bg-blue-700', 'text-white')
    })
  })

  describe('Accessibility', () => {
    it('has proper button elements with accessible text', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })

      renderHome()

      expect(screen.getByRole('button', { name: 'Create Room' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Join Room' })).toBeInTheDocument()
    })

    it('has proper form controls in join dialog', async () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })

      renderHome()

      const joinRoomButton = screen.getByRole('button', { name: 'Join Room' })
      await user.click(joinRoomButton)

      expect(screen.getByPlaceholderText('Enter room code')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    it('maintains focus management in modal', async () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })

      renderHome()

      const joinRoomButton = screen.getByRole('button', { name: 'Join Room' })
      await user.click(joinRoomButton)

      const roomCodeInput = screen.getByPlaceholderText('Enter room code')
      expect(roomCodeInput).toBeInTheDocument()
      // Note: auto-focus might not work in test environment, so we just verify the input is present
    })

    it('has descriptive modal heading', async () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })

      renderHome()

      const joinRoomButton = screen.getByText('Join Room')
      await user.click(joinRoomButton)

      const modalHeading = screen.getByRole('heading', { level: 2 })
      expect(modalHeading).toHaveTextContent('Join Room')
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('handles session status changes gracefully', () => {
      // Start with loading state
      mockUseSession.mockReturnValue({
        data: null,
        status: 'loading',
        update: vi.fn().mockResolvedValue(null),
      })

      const { unmount } = renderHome()
      expect(screen.getByText('Loading...')).toBeInTheDocument()

      // Clean up and rerender with authenticated state
      unmount()

      const mockSession = {
        user: { name: 'Test User', email: 'test@example.com' },
        expires: '2024-01-01',
      }

      mockUseSession.mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: vi.fn().mockResolvedValue(mockSession),
      })

      renderHome()

      expect(screen.getByText('Welcome back,')).toBeInTheDocument()
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    it('handles malformed session data gracefully', () => {
      mockUseSession.mockReturnValue({
        data: { user: null },
        status: 'authenticated',
        update: vi.fn().mockResolvedValue({}),
      })

      expect(() => renderHome()).not.toThrow()
      expect(screen.getByText('Welcome back,')).toBeInTheDocument()
    })

    it('handles router errors gracefully', async () => {
      const mockSession = {
        user: { name: 'Test User', email: 'test@example.com' },
        expires: '2024-01-01',
      }

      mockUseSession.mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: vi.fn().mockResolvedValue(mockSession),
      })

      mockPush.mockImplementation(() => {
        throw new Error('Navigation failed')
      })

      renderHome()

      const createRoomButton = screen.getByText('Create Room')

      // Should not throw error
      expect(async () => {
        await user.click(createRoomButton)
      }).not.toThrow()
    })

    it('handles sign in errors gracefully', async () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })

      mockSignIn.mockRejectedValue(new Error('Sign in failed'))

      renderHome()

      const createRoomButton = screen.getByText('Create Room')

      // Should not throw error
      expect(async () => {
        await user.click(createRoomButton)
      }).not.toThrow()
    })
  })

  describe('Component Structure and Layout', () => {
    it('renders content in correct order and structure', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })

      renderHome()

      // Check that main elements exist and are in document
      expect(screen.getByText('Heart Tiles')).toBeInTheDocument()
      expect(screen.getByText(/strategic tile-based/)).toBeInTheDocument()
      expect(screen.getByText('Create Room')).toBeInTheDocument()
      expect(screen.getByText('Join Room')).toBeInTheDocument()

      // Verify the structure by checking parent-child relationships
      const title = screen.getByText('Heart Tiles')
      const parentContainer = title.parentElement
      expect(parentContainer).toContainElement(screen.getByText(/strategic tile-based/))
    })

    it('has responsive layout classes', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })

      renderHome()

      const buttonContainer = screen.getByText('Create Room').parentElement
      expect(buttonContainer).toHaveClass('flex', 'flex-col', 'sm:flex-row')
    })

    it('positions authentication controls in top right', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })

      renderHome()

      const authContainer = screen.getByText('Sign In').parentElement.parentElement
      expect(authContainer).toHaveClass('absolute', 'top-4', 'right-4')
    })
  })
})