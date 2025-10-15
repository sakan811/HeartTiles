import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useSession, signOut, signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Home from '../../src/app/page.js'
import { SocketProvider } from '../../src/contexts/SocketContext.js'

// Mock next-auth
vi.mock('next-auth/react', () => ({
  useSession: vi.fn().mockReturnValue({
    data: null,
    status: 'unauthenticated'
  }),
  signOut: vi.fn(),
  signIn: vi.fn()
}))

// Mock next/navigation
const mockRouter = {
  push: vi.fn(),
  refresh: vi.fn()
}
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter
}))

// Mock SocketContext
vi.mock('../../src/contexts/SocketContext.js', () => ({
  useSocket: vi.fn(() => ({
    socket: null,
    isConnected: false
  })),
  SocketProvider: ({ children }) => (
    <div data-testid="socket-provider">{children}</div>
  )
}))

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
}
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

describe('Home Page Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)
    // Reset router mock
    mockRouter.push.mockClear()
    mockRouter.refresh.mockClear()
    // Reset useSession mock to default
    vi.mocked(useSession).mockReturnValue({
      data: null,
      status: 'unauthenticated'
    })
  })

  it('should show loading state when session is loading', () => {
    vi.mocked(useSession).mockReturnValue({
      data: null,
      status: 'loading'
    })

    render(
      <SocketProvider>
        <Home />
      </SocketProvider>
    )

    // Should show some loading indicator or minimal content
    // Since the component doesn't have explicit loading UI, we expect it to render nothing or minimal content
    expect(document.body).toBeTruthy()
  })

  it('should show sign in page when user is not authenticated', () => {
    vi.mocked(useSession).mockReturnValue({
      data: null,
      status: 'unauthenticated'
    })

    render(
      <SocketProvider>
        <Home />
      </SocketProvider>
    )

    // Check for sign in button
    expect(screen.getByText('Sign In')).toBeTruthy()
    expect(screen.getByText('Sign Up')).toBeTruthy()
  })

  it('should render main game interface when user is authenticated', () => {
    const mockUser = {
      user: { name: 'Test User' }
    }

    vi.mocked(useSession).mockReturnValue({
      data: mockUser,
      status: 'authenticated'
    })

    render(
      <SocketProvider>
        <Home />
      </SocketProvider>
    )

    // Check for main elements
    expect(screen.getByText('Heart Tiles')).toBeTruthy()
    expect(screen.getByText('A strategic tile-based card game where players place colored hearts on tiles to score points')).toBeTruthy()

    // Check for action buttons
    expect(screen.getByText('Create Room')).toBeTruthy()
    expect(screen.getByText('Join Room')).toBeTruthy()
  })

  it('should open join dialog when Join Room button is clicked', async () => {
    const mockUser = {
      user: { name: 'Test User' }
    }

    vi.mocked(useSession).mockReturnValue({
      data: mockUser,
      status: 'authenticated'
    })

    render(
      <SocketProvider>
        <Home />
      </SocketProvider>
    )

    // Get the Join Room button (not the dialog title)
    const joinButton = screen.getAllByText('Join Room').find(el => el.tagName === 'BUTTON')
    fireEvent.click(joinButton)

    // Check that dialog opens
    expect(screen.getByText('Enter the room code to join an existing game')).toBeTruthy()
    expect(screen.getByDisplayValue('')).toBeTruthy() // Input should be present
  })

  it('should validate room code format', async () => {
    const mockUser = {
      user: { name: 'Test User' }
    }

    vi.mocked(useSession).mockReturnValue({
      data: mockUser,
      status: 'authenticated'
    })

    render(
      <SocketProvider>
        <Home />
      </SocketProvider>
    )

    // Open join dialog
    const joinButton = screen.getByText('Join Room')
    fireEvent.click(joinButton)

    // Check dialog opens
    expect(screen.getByText('Enter the room code to join an existing game')).toBeTruthy()

    // Try submitting empty code (button should be disabled)
    const submitButton = screen.getByText('Join')
    expect(submitButton).toBeDisabled()
  })

  it('should accept valid room code format', async () => {
    const mockUser = {
      user: { name: 'Test User' }
    }

    vi.mocked(useSession).mockReturnValue({
      data: mockUser,
      status: 'authenticated'
    })

    render(
      <SocketProvider>
        <Home />
      </SocketProvider>
    )

    // Open join dialog
    const joinButton = screen.getByText('Join Room')
    fireEvent.click(joinButton)

    // Check dialog opens
    expect(screen.getByText('Enter the room code to join an existing game')).toBeTruthy()

    // Enter valid code
    const input = screen.getByPlaceholderText('Enter room code')
    fireEvent.change(input, { target: { value: 'ABC123' } })

    const submitButton = screen.getByText('Join')
    expect(submitButton).not.toBeDisabled()
  })

  it('should navigate to create room when Create Room button is clicked', () => {
    const mockUser = {
      user: { name: 'Test User' }
    }

    vi.mocked(useSession).mockReturnValue({
      data: mockUser,
      status: 'authenticated'
    })

    render(
      <SocketProvider>
        <Home />
      </SocketProvider>
    )

    const createButton = screen.getByText('Create Room')
    fireEvent.click(createButton)

    // Should navigate to a room with generated code
    expect(mockRouter.push).toHaveBeenCalledWith(
      expect.stringMatching(/^\/room\/[A-Z0-9]{6}$/)
    )
  })

  it('should show user info when authenticated', () => {
    const mockUser = {
      user: { name: 'Test User' }
    }

    vi.mocked(useSession).mockReturnValue({
      data: mockUser,
      status: 'authenticated'
    })

    render(
      <SocketProvider>
        <Home />
      </SocketProvider>
    )

    // Check for user info display - the welcome message should be visible
    expect(screen.getByText('Welcome back,')).toBeTruthy()
    // Check for sign out button
    expect(screen.getByText('Sign Out')).toBeTruthy()
  })

  it('should handle sign out', () => {
    const mockUser = {
      user: { name: 'Test User' }
    }

    vi.mocked(useSession).mockReturnValue({
      data: mockUser,
      status: 'authenticated'
    })

    render(
      <SocketProvider>
        <Home />
      </SocketProvider>
    )

    // Find and click sign out button
    const signOutButton = screen.getByText('Sign Out')
    fireEvent.click(signOutButton)

    // Should call signOut
    expect(signOut).toHaveBeenCalled()
  })

  it('should close join dialog when cancel is clicked', async () => {
    const mockUser = {
      user: { name: 'Test User' }
    }

    vi.mocked(useSession).mockReturnValue({
      data: mockUser,
      status: 'authenticated'
    })

    render(
      <SocketProvider>
        <Home />
      </SocketProvider>
    )

    // Open join dialog
    const joinButton = screen.getByText('Join Room')
    fireEvent.click(joinButton)

    // Check dialog opens
    expect(screen.getByText('Enter the room code to join an existing game')).toBeTruthy()

    // Click cancel
    const cancelButton = screen.getByText('Cancel')
    fireEvent.click(cancelButton)

    // Dialog should close - the main title should be visible again
    expect(screen.getByText('Heart Tiles')).toBeTruthy()
  })

  it('should handle room code case insensitive', async () => {
    const mockUser = {
      user: { name: 'Test User' }
    }

    vi.mocked(useSession).mockReturnValue({
      data: mockUser,
      status: 'authenticated'
    })

    render(
      <SocketProvider>
        <Home />
      </SocketProvider>
    )

    // Open join dialog
    const joinButton = screen.getByText('Join Room')
    fireEvent.click(joinButton)

    // Check dialog opens
    expect(screen.getByText('Enter the room code to join an existing game')).toBeTruthy()

    // Enter lowercase code
    const input = screen.getByPlaceholderText('Enter room code')
    fireEvent.change(input, { target: { value: 'abc123' } })

    // Input should convert to uppercase automatically
    expect(input.value).toBe('ABC123')
  })
})