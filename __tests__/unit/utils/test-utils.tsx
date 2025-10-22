import { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionProvider } from 'next-auth/react'
import { SocketProvider } from '@/contexts/SocketContext'
import ErrorBoundary from '@/components/ErrorBoundary'

// Test session data factory
export const createMockSession = (overrides = {}) => ({
  user: {
    name: 'Test User',
    email: 'test@example.com',
    id: 'test-user-id',
    ...overrides.user
  },
  expires: '2024-12-31T23:59:59.999Z',
  ...overrides
})

// Test socket factory
export const createMockSocket = (overrides = {}) => ({
  id: 'test-socket-id',
  connected: true,
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  disconnect: vi.fn(),
  ...overrides
})

// Mock socket context value
export const createMockSocketContext = (overrides = {}) => ({
  socket: createMockSocket(),
  isConnected: true,
  socketId: 'test-socket-id',
  connectionError: null,
  disconnect: vi.fn(),
  ...overrides
})

// Custom render function with providers
interface AllTheProvidersProps {
  children: React.ReactNode
  session?: any
  socketContext?: any
  errorBoundary?: boolean
}

const AllTheProviders = ({
  children,
  session = null,
  socketContext = null,
  errorBoundary = true
}: AllTheProvidersProps) => {
  const content = (
    <SessionProvider session={session}>
      <SocketProvider>
        {children}
      </SocketProvider>
    </SessionProvider>
  )

  if (errorBoundary) {
    return <ErrorBoundary>{content}</ErrorBoundary>
  }

  return content
}

// Custom render function
const customRender = (
  ui: ReactElement,
  {
    session = null,
    socketContext = null,
    errorBoundary = true,
    ...renderOptions
  }: RenderOptions & {
    session?: any
    socketContext?: any
    errorBoundary?: boolean
  } = {}
) => {
  // Mock the socket context if provided
  if (socketContext) {
    vi.doMock('@/contexts/SocketContext', () => ({
      useSocket: () => socketContext,
      SocketProvider: ({ children }) => children
    }))
  }

  return render(
    <AllTheProviders
      session={session}
      socketContext={socketContext}
      errorBoundary={errorBoundary}
    >
      {ui}
    </AllTheProviders>,
    renderOptions
  )
}

// Mock navigation functions
export const createMockRouter = (overrides = {}) => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
  ...overrides
})

// Mock params for dynamic routes
export const createMockParams = (overrides = {}) => ({
  roomCode: 'TEST12',
  ...overrides
})

// Common test data factories
export const createMockPlayer = (overrides = {}) => ({
  userId: 'player-1',
  name: 'Player 1',
  isReady: false,
  score: 0,
  hand: [],
  ...overrides
})

export const createMockTile = (overrides = {}) => ({
  id: 1,
  color: 'red',
  emoji: '❤️',
  value: 1,
  ...overrides
})

export const createMockHeartCard = (overrides = {}) => ({
  id: 'heart-1',
  type: 'heart',
  color: 'red',
  emoji: '❤️',
  value: 2,
  ...overrides
})

export const createMockMagicCard = (overrides = {}) => ({
  id: 'magic-1',
  type: 'shield',
  emoji: '🛡️',
  name: 'Shield Card',
  description: 'Protects a tile for 2 turns',
  ...overrides
})

export const createMockDeck = (overrides = {}) => ({
  emoji: '💌',
  cards: 16,
  ...overrides
})

export const createMockMagicDeck = (overrides = {}) => ({
  emoji: '🔮',
  cards: 16,
  type: 'magic',
  ...overrides
})

export const createMockShield = (overrides = {}) => ({
  active: true,
  remainingTurns: 2,
  activatedAt: Date.now(),
  activatedBy: 'player-1',
  ...overrides
})

export const createMockPlayerActions = (overrides = {}) => ({
  drawnHeart: false,
  drawnMagic: false,
  heartsPlaced: 0,
  magicCardsUsed: 0,
  ...overrides
})

// Mock response data for API calls
export const createMockSignUpResponse = (overrides = {}) => ({
  user: {
    id: 'new-user-id',
    name: 'New User',
    email: 'new@example.com'
  },
  message: 'User created successfully',
  ...overrides
})

export const createMockSignInResponse = (overrides = {}) => ({
  user: {
    id: 'user-id',
    name: 'Test User',
    email: 'test@example.com'
  },
  session: {
    expires: '2024-12-31T23:59:59.999Z',
    user: {
      id: 'user-id',
      name: 'Test User',
      email: 'test@example.com'
    }
  },
  ...overrides
})

// Re-export everything from React Testing Library
export * from '@testing-library/react'
export { customRender as render }
export { userEvent }
export { vi } from 'vitest'

// Common test helpers
export const waitForLoadingToFinish = () => new Promise(resolve => setTimeout(resolve, 0))

export const mockFetch = (response: any, ok = true, status = 200) => {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response))
  })
}

export const mockFetchError = (error: string) => {
  global.fetch = vi.fn().mockRejectedValue(new Error(error))
}

// Form test helpers
export const fillForm = async (fields: Record<string, string>, screen: any, userInstance?: any) => {
  const user = userInstance || userEvent.setup()
  for (const [fieldName, value] of Object.entries(fields)) {
    const field = screen.getByLabelText(fieldName) || screen.getByPlaceholderText(fieldName) || screen.getByTestId(fieldName)
    await user.clear(field)
    await user.type(field, value)
  }
  return user
}

export const submitForm = async (screen: any, userInstance?: any) => {
  const user = userInstance || userEvent.setup()
  const submitButton = screen.getByRole('button', { type: 'submit' }) || screen.getByText('Submit') || screen.getByText('Sign in')
  await user.click(submitButton)
  return user
}

// Clipboard API mock
export const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
  readText: vi.fn().mockResolvedValue(''),
  read: vi.fn().mockResolvedValue([]),
  write: vi.fn().mockResolvedValue(undefined)
}

// Session storage mock helpers
export const mockSessionStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  get length() { return 0 },
  key: vi.fn()
}

// Common assertions
export const expectElementToBeVisible = (element: HTMLElement) => {
  expect(element).toBeInTheDocument()
  expect(element).toBeVisible()
}

export const expectElementToHaveText = (element: HTMLElement, text: string) => {
  expect(element).toBeInTheDocument()
  expect(element).toHaveTextContent(text)
}

export const expectButtonToBeDisabled = (button: HTMLElement) => {
  expect(button).toBeInTheDocument()
  expect(button).toBeDisabled()
}

export const expectButtonToBeEnabled = (button: HTMLElement) => {
  expect(button).toBeInTheDocument()
  expect(button).not.toBeDisabled()
}

export const expectLinkToHaveHref = (link: HTMLElement, href: string) => {
  expect(link).toBeInTheDocument()
  expect(link).toHaveAttribute('href', href)
}