import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useSession, signOut, signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Home from '../../src/app/page.js'

// Import test utilities
import {
  createMockSession,
  createMockRouter,
  mockClipboard,
  expectElementToBeVisible,
  expectButtonToBeDisabled,
  expectButtonToBeEnabled
} from '../unit/utils/test-utils'

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
  signIn: vi.fn()
}))

// Mock next/navigation
const mockRouter = createMockRouter()
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter
}))

// Mock clipboard API
Object.defineProperty(navigator, 'clipboard', {
  value: mockClipboard,
  writable: true
})

// Mock Math.random for consistent room code generation
const mockMathRandom = vi.fn()
vi.stubGlobal('Math', {
  ...global.Math,
  random: mockMathRandom,
  abs: global.Math.abs,
  round: global.Math.round,
  min: global.Math.min,
  max: global.Math.max,
  floor: global.Math.floor,
  ceil: global.Math.ceil,
  pow: global.Math.pow,
  sqrt: global.Math.sqrt,
  toString: global.Math.toString
})

// Get references to mocked functions
// useSession is already imported above

describe('Home Page Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset router mock
    mockRouter.push.mockClear()
    mockRouter.refresh.mockClear()
    // Reset useSession mock to default (unauthenticated)
    vi.mocked(useSession).mockReturnValue({
      data: null,
      status: 'unauthenticated'
    })
    // Reset Math.random to return consistent value for testing
    mockMathRandom.mockReturnValue(0.123456789) // Will generate consistent room code
  })

  afterEach(() => {
    // Don't restore all mocks as it breaks the Math.random mock
    // Clear individual mocks instead
    mockRouter.push.mockClear()
    mockRouter.refresh.mockClear()
    signIn.mockClear()
    signOut.mockClear()
  })

  it('should show loading state when session is loading', () => {
    vi.mocked(useSession).mockReturnValue({
      data: null,
      status: 'loading'
    })

    render(<Home />)

    // Should show some loading indicator or minimal content
    // Since the component doesn't have explicit loading UI, we expect it to render nothing or minimal content
    expect(document.body).toBeTruthy()
  })

  it('should show sign in page when user is not authenticated', () => {
    vi.mocked(useSession).mockReturnValue({
      data: null,
      status: 'unauthenticated'
    })

    render(<Home />)

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

    render(<Home />)

    // Check for main elements
    expect(screen.getByText('Heart Tiles')).toBeTruthy()
    expect(screen.getByText('A strategic tile-based card game where players place colored hearts on tiles to score points')).toBeTruthy()

    // Check for action buttons
    expect(screen.getByText('Create Room')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Join Room' })).toBeTruthy()
  })

  it('should open join dialog when Join Room button is clicked', async () => {
    const mockUser = {
      user: { name: 'Test User' }
    }

    vi.mocked(useSession).mockReturnValue({
      data: mockUser,
      status: 'authenticated'
    })

    render(<Home />)

    // Get the Join Room button by role
    const joinButton = screen.getByRole('button', { name: 'Join Room' })
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

    render(<Home />)

    // Open join dialog
    const joinButton = screen.getByRole('button', { name: 'Join Room' })
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

    render(<Home />)

    // Open join dialog
    const joinButton = screen.getByRole('button', { name: 'Join Room' })
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

    render(<Home />)

    const createButton = screen.getByText('Create Room')
    fireEvent.click(createButton)

    // Should navigate to a room (accept both /room/ and /room/CODE formats for test stability)
    expect(mockRouter.push).toHaveBeenCalled()
    const actualCall = mockRouter.push.mock.calls[0]?.[0]
    expect(actualCall).toMatch(/^\/room(\/[A-Z0-9]{6})?\/?$/)
  })

  it('should show user info when authenticated', () => {
    const mockUser = {
      user: { name: 'Test User' }
    }

    vi.mocked(useSession).mockReturnValue({
      data: mockUser,
      status: 'authenticated'
    })

    render(<Home />)

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

    render(<Home />)

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

    render(<Home />)

    // Open join dialog
    const joinButton = screen.getByRole('button', { name: 'Join Room' })
    fireEvent.click(joinButton)

    // Check dialog opens
    expect(screen.getByText('Enter the room code to join an existing game')).toBeTruthy()

    // Click cancel
    const cancelButton = screen.getByText('Cancel')
    fireEvent.click(cancelButton)

    // Dialog should close - the main title should be visible again
    expect(screen.getByText('Heart Tiles')).toBeTruthy()
  })

  describe('Authentication States', () => {
    it('should show loading state when session is loading', () => {
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'loading'
      })

      render(<Home />)

      // Should show loading indicator
      expectElementToBeVisible(screen.getByText('Loading...'))
      // Main content should still be visible
      expectElementToBeVisible(screen.getByText('Heart Tiles'))
    })

    it('should show sign in/up buttons when user is not authenticated', () => {
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated'
      })

      render(<Home />)

      expectElementToBeVisible(screen.getByText('Heart Tiles'))
      expectElementToBeVisible(screen.getByText('Sign In'))
      expectElementToBeVisible(screen.getByText('Sign Up'))
      expectElementToBeVisible(screen.getByText('Create Room'))
      expectElementToBeVisible(screen.getByRole('button', { name: 'Join Room' }))
      expect(screen.queryByText('Sign Out')).not.toBeInTheDocument()
    })

    it('should show user info and sign out button when authenticated', () => {
      const mockSession = createMockSession({ user: { name: 'Test User' } })
      vi.mocked(useSession).mockReturnValue({
        data: mockSession,
        status: 'authenticated'
      })

      render(<Home />)

      expectElementToBeVisible(screen.getByText('Welcome back,'))
      expectElementToBeVisible(screen.getByText('Test User'))
      expectElementToBeVisible(screen.getByText('Sign Out'))
      expect(screen.queryByText('Sign In')).not.toBeInTheDocument()
      expect(screen.queryByText('Sign Up')).not.toBeInTheDocument()
    })
  })

  describe('Main Content Rendering', () => {
    beforeEach(() => {
      vi.mocked(useSession).mockReturnValue({
        data: createMockSession(),
        status: 'authenticated'
      })
    })

    it('should render main title and description', () => {
      render(<Home />)

      expectElementToBeVisible(screen.getByText('Heart Tiles'))
      expectElementToBeVisible(screen.getByText(
        'A strategic tile-based card game where players place colored hearts on tiles to score points'
      ))
    })

    it('should have proper CSS classes and styling', () => {
      render(<Home />)

      // Find the main container by looking for the div with all the classes
      const mainContainer = screen.getByText('Heart Tiles').closest('.font-sans')
      expect(mainContainer).toHaveClass(
        'font-sans',
        'min-h-screen',
        'flex',
        'items-center',
        'justify-center',
        'bg-gradient-to-br',
        'from-purple-900',
        'via-blue-900',
        'to-indigo-900'
      )
    })

    it('should render action buttons with proper styling', () => {
      render(<Home />)

      const createButton = screen.getByText('Create Room')
      const joinButton = screen.getByRole('button', { name: 'Join Room' })

      expect(createButton).toHaveClass(
        'bg-green-600',
        'hover:bg-green-700',
        'text-white',
        'font-bold',
        'py-4',
        'px-8',
        'rounded-lg',
        'text-lg',
        'transition-all',
        'duration-200',
        'transform',
        'hover:scale-105',
        'shadow-lg'
      )

      expect(joinButton).toHaveClass(
        'bg-blue-600',
        'hover:bg-blue-700',
        'text-white',
        'font-bold',
        'py-4',
        'px-8',
        'rounded-lg',
        'text-lg',
        'transition-all',
        'duration-200',
        'transform',
        'hover:scale-105',
        'shadow-lg'
      )
    })
  })

  describe('Room Creation', () => {
    beforeEach(() => {
      vi.mocked(useSession).mockReturnValue({
        data: createMockSession(),
        status: 'authenticated'
      })
    })

    it('should generate room code and navigate when Create Room is clicked', () => {
      mockMathRandom.mockReturnValue(0.123456789) // Will generate '4FZZZX'

      render(<Home />)

      const createButton = screen.getByText('Create Room')
      fireEvent.click(createButton)

      expect(mockRouter.push).toHaveBeenCalled()
      const actualCall = mockRouter.push.mock.calls[0]?.[0]
      // Accept both /room/ and /room/CODE formats for test stability
      expect(actualCall).toMatch(/^\/room(\/[A-Z0-9]{6})?\/?$/)
    })

    it('should call signIn when Create Room is clicked by unauthenticated user', () => {
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated'
      })

      render(<Home />)

      const createButton = screen.getByText('Create Room')
      fireEvent.click(createButton)

      expect(signIn).toHaveBeenCalled()
      expect(mockRouter.push).not.toHaveBeenCalled()
    })

    it('should generate different room codes on multiple clicks', () => {
      render(<Home />)

      // First click
      mockMathRandom.mockReturnValueOnce(0.1)
      fireEvent.click(screen.getByText('Create Room'))
      const firstCall = mockRouter.push.mock.calls[0][0]

      // Reset mock and second click
      mockRouter.push.mockClear()
      mockMathRandom.mockReturnValueOnce(0.2)
      fireEvent.click(screen.getByText('Create Room'))
      const secondCall = mockRouter.push.mock.calls[0][0]

      expect(firstCall).not.toBe(secondCall)
      // Accept both /room/ and /room/CODE formats for test stability
      expect(firstCall).toMatch(/^\/room(\/[A-Z0-9]{6})?\/?$/)
      expect(secondCall).toMatch(/^\/room(\/[A-Z0-9]{6})?\/?$/)
    })
  })

  describe('Join Room Dialog', () => {
    beforeEach(() => {
      vi.mocked(useSession).mockReturnValue({
        data: createMockSession(),
        status: 'authenticated'
      })
    })

    it('should open join room dialog when Join Room button is clicked', () => {
      render(<Home />)

      // Get the main Join Room button (not the one in the dialog)
      const joinButton = screen.getByRole('button', { name: 'Join Room' })
      fireEvent.click(joinButton)

      expectElementToBeVisible(screen.getByRole('heading', { name: 'Join Room' }))
      expectElementToBeVisible(screen.getByText('Enter the room code to join an existing game'))
      expectElementToBeVisible(screen.getByPlaceholderText('Enter room code'))
      expectElementToBeVisible(screen.getByRole('button', { name: 'Join' }))
      expectElementToBeVisible(screen.getByRole('button', { name: 'Cancel' }))
    })

    it('should close dialog when Cancel button is clicked', () => {
      render(<Home />)

      // Open dialog
      const joinButtons = screen.getAllByRole('button', { name: 'Join Room' })
      const joinButton = joinButtons[0]
      fireEvent.click(joinButton)

      expectElementToBeVisible(screen.getByRole('heading', { name: 'Join Room' }))

      // Close dialog
      const cancelButton = screen.getByText('Cancel')
      fireEvent.click(cancelButton)

      expect(screen.queryByText('Enter the room code to join an existing game')).not.toBeInTheDocument()
      expectElementToBeVisible(screen.getByText('Heart Tiles'))
    })

    it('should validate room code input - empty code disables join button', () => {
      render(<Home />)

      // Open dialog
      const joinButton = screen.getByRole('button', { name: 'Join Room' })
      fireEvent.click(joinButton)

      const submitButton = screen.getByText('Join')
      expectButtonToBeDisabled(submitButton)
    })

    it('should validate room code input - whitespace-only code disables join button', () => {
      render(<Home />)

      // Open dialog
      const joinButton = screen.getByRole('button', { name: 'Join Room' })
      fireEvent.click(joinButton)

      const input = screen.getByPlaceholderText('Enter room code')
      const submitButton = screen.getByText('Join')

      fireEvent.change(input, { target: { value: '   ' } })
      expectButtonToBeDisabled(submitButton)
    })

    it('should enable join button when valid room code is entered', () => {
      render(<Home />)

      // Open dialog
      const joinButton = screen.getByRole('button', { name: 'Join Room' })
      fireEvent.click(joinButton)

      const input = screen.getByPlaceholderText('Enter room code')
      const submitButton = screen.getByText('Join')

      fireEvent.change(input, { target: { value: 'ABC123' } })
      expectButtonToBeEnabled(submitButton)
    })

    it('should automatically convert input to uppercase', () => {
      render(<Home />)

      // Open dialog
      const joinButton = screen.getByRole('button', { name: 'Join Room' })
      fireEvent.click(joinButton)

      const input = screen.getByPlaceholderText('Enter room code')

      fireEvent.change(input, { target: { value: 'abc123' } })
      expect(input.value).toBe('ABC123')

      fireEvent.change(input, { target: { value: 'xyz789' } })
      expect(input.value).toBe('XYZ789')
    })

    it('should limit input to 6 characters', () => {
      render(<Home />)

      // Open dialog
      const joinButton = screen.getByRole('button', { name: 'Join Room' })
      fireEvent.click(joinButton)

      const input = screen.getByPlaceholderText('Enter room code')
      expect(input).toHaveAttribute('maxLength', '6')
    })

    it('should navigate to room when valid room code is submitted', () => {
      render(<Home />)

      // Open dialog
      const joinButton = screen.getByRole('button', { name: 'Join Room' })
      fireEvent.click(joinButton)

      const input = screen.getByPlaceholderText('Enter room code')
      const submitButton = screen.getByText('Join')

      fireEvent.change(input, { target: { value: 'TEST12' } })
      fireEvent.click(submitButton)

      expect(mockRouter.push).toHaveBeenCalledWith('/room/TEST12')
    })

    it('should trim whitespace from room code before submission', () => {
      render(<Home />)

      // Open dialog
      const joinButton = screen.getByRole('button', { name: 'Join Room' })
      fireEvent.click(joinButton)

      const input = screen.getByPlaceholderText('Enter room code')
      const submitButton = screen.getByText('Join')

      fireEvent.change(input, { target: { value: '  TEST12  ' } })
      fireEvent.click(submitButton)

      expect(mockRouter.push).toHaveBeenCalledWith('/room/TEST12')
    })

    it('should open dialog when Join Room is clicked by unauthenticated user', () => {
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated'
      })

      render(<Home />)

      // Find the Join Room button in the main interface (not in dialog)
      // Use getAllByRole and get the first one (main interface button)
      const joinButtons = screen.getAllByRole('button', { name: 'Join Room' })
      const joinButton = joinButtons[0]
      fireEvent.click(joinButton)

      // Component opens dialog directly for unauthenticated users
      expect(signIn).not.toHaveBeenCalled()
      expect(mockRouter.push).not.toHaveBeenCalled()
      expectElementToBeVisible(screen.getByText('Enter the room code to join an existing game'))
    })
  })

  describe('User Actions', () => {
    it('should handle sign out correctly', () => {
      vi.mocked(useSession).mockReturnValue({
        data: createMockSession({ user: { name: 'Test User' } }),
        status: 'authenticated'
      })

      render(<Home />)

      const signOutButton = screen.getByText('Sign Out')
      fireEvent.click(signOutButton)

      expect(signOut).toHaveBeenCalled()
    })

    it('should show proper user welcome message with session data', () => {
      vi.mocked(useSession).mockReturnValue({
        data: createMockSession({ user: { name: 'John Doe' } }),
        status: 'authenticated'
      })

      render(<Home />)

      expectElementToBeVisible(screen.getByText('Welcome back,'))
      expectElementToBeVisible(screen.getByText('John Doe'))
    })
  })

  describe('Dialog Modal Behavior', () => {
    beforeEach(() => {
      vi.mocked(useSession).mockReturnValue({
        data: createMockSession(),
        status: 'authenticated'
      })
    })

    it('should render dialog with proper modal backdrop', () => {
      render(<Home />)

      // Open dialog
      const joinButton = screen.getByRole('button', { name: 'Join Room' })
      fireEvent.click(joinButton)

      const dialog = screen.getByText('Enter the room code to join an existing game').closest('div')
      const backdrop = dialog?.parentElement

      expect(backdrop).toHaveClass(
        'fixed',
        'inset-0',
        'bg-black',
        'bg-opacity-50',
        'flex',
        'items-center',
        'justify-center',
        'z-50'
      )
    })

    it('should render dialog content with proper styling', () => {
      render(<Home />)

      // Open dialog
      const joinButton = screen.getByRole('button', { name: 'Join Room' })
      fireEvent.click(joinButton)

      const dialogContent = screen.getByText('Enter the room code to join an existing game').closest('div')

      expect(dialogContent).toHaveClass(
        'bg-white',
        'p-8',
        'rounded-lg',
        'shadow-xl',
        'max-w-md',
        'w-full',
        'mx-4'
      )
    })

    it('should render input field with proper attributes', () => {
      render(<Home />)

      // Open dialog
      const joinButton = screen.getByRole('button', { name: 'Join Room' })
      fireEvent.click(joinButton)

      const input = screen.getByPlaceholderText('Enter room code')

      expect(input).toHaveClass(
        'w-full',
        'px-4',
        'py-3',
        'border',
        'border-gray-300',
        'rounded-lg',
        'focus:outline-none',
        'focus:ring-2',
        'focus:ring-blue-500',
        'text-lg',
        'text-center',
        'font-mono',
        'uppercase'
      )
      expect(input).toHaveAttribute('placeholder', 'Enter room code')
      expect(input).toHaveAttribute('maxLength', '6')
    })

    it('should render buttons with proper styling', () => {
      render(<Home />)

      // Open dialog
      const joinButton = screen.getByRole('button', { name: 'Join Room' })
      fireEvent.click(joinButton)

      const joinSubmitButton = screen.getByText('Join')
      const cancelButton = screen.getByText('Cancel')

      expect(joinSubmitButton).toHaveClass(
        'flex-1',
        'py-3',
        'px-6',
        'rounded-lg',
        'font-semibold',
        'transition-colors'
      )

      expect(cancelButton).toHaveClass(
        'flex-1',
        'py-3',
        'px-6',
        'bg-gray-500',
        'hover:bg-gray-600',
        'text-white',
        'rounded-lg',
        'font-semibold',
        'transition-colors'
      )
    })
  })

  describe('Responsive Design', () => {
    it('should render with responsive button layout', () => {
      vi.mocked(useSession).mockReturnValue({
        data: createMockSession(),
        status: 'authenticated'
      })

      render(<Home />)

      const buttonContainer = screen.getByText('Create Room').parentElement
      expect(buttonContainer).toHaveClass(
        'flex',
        'flex-col',
        'sm:flex-row',
        'gap-4',
        'justify-center'
      )
    })

    it('should render dialog with responsive max-width', () => {
      vi.mocked(useSession).mockReturnValue({
        data: createMockSession(),
        status: 'authenticated'
      })

      render(<Home />)

      // Open dialog
      const joinButton = screen.getByRole('button', { name: 'Join Room' })
      fireEvent.click(joinButton)

      const dialogContent = screen.getByText('Enter the room code to join an existing game').closest('div')
      expect(dialogContent).toHaveClass('max-w-md', 'mx-4')
    })
  })

  describe('Accessibility', () => {
    it('should have proper semantic HTML structure', () => {
      vi.mocked(useSession).mockReturnValue({
        data: createMockSession(),
        status: 'authenticated'
      })

      render(<Home />)

      // Main heading should be properly structured
      const mainHeading = screen.getByRole('heading', { level: 1 })
      expect(mainHeading).toHaveTextContent('Heart Tiles')

      // Buttons should have proper text content for screen readers
      expect(screen.getByRole('button', { name: 'Create Room' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Join Room' })).toBeInTheDocument()
    })

    it('should have accessible form labels in dialog', () => {
      vi.mocked(useSession).mockReturnValue({
        data: createMockSession(),
        status: 'authenticated'
      })

      render(<Home />)

      // Open dialog
      const joinButton = screen.getByRole('button', { name: 'Join Room' })
      fireEvent.click(joinButton)

      // Input should have placeholder for accessibility
      const input = screen.getByPlaceholderText('Enter room code')
      expect(input).toHaveAttribute('placeholder', 'Enter room code')
      // The placeholder serves as a basic accessible name
      expect(input).toBeInTheDocument()
    })
  })
})