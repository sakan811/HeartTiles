import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import SignInPage from '../../src/app/auth/signin/page.tsx'

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
  useSession: vi.fn()
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn()
}))

describe('Sign In Page', () => {
  const mockPush = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useRouter).mockReturnValue({
      push: mockPush,
      refresh: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn()
    } as any)

    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn(),
      entries: [],
      forEach: vi.fn(),
      keys: [],
      values: [],
      has: vi.fn(),
      toString: vi.fn()
    } as any)
  })

  it('should render sign in form', () => {
    render(<SignInPage />)

    expect(screen.getByText('Sign In')).toBeTruthy()
    expect(screen.getByLabelText(/Email/i)).toBeTruthy()
    expect(screen.getByLabelText(/Password/i)).toBeTruthy()
    expect(screen.getByText('Sign In')).toBeTruthy()
  })

  it('should have link to sign up page', () => {
    render(<SignInPage />)

    const signUpLink = screen.getByText(/Don't have an account\? Sign up/i)
    expect(signUpLink).toBeTruthy()
    expect(signUpLink.closest('a')).toHaveAttribute('href', '/auth/signup')
  })

  it('should have link back to home', () => {
    render(<SignInPage />)

    const homeLink = screen.getByText(/← Back to Home/i)
    expect(homeLink).toBeTruthy()
    expect(homeLink.closest('a')).toHaveAttribute('href', '/')
  })

  it('should validate required fields', async () => {
    render(<SignInPage />)

    const submitButton = screen.getByText('Sign In')
    fireEvent.click(submitButton)

    // Check for validation messages (HTML5 validation or custom validation)
    await waitFor(() => {
      const emailInput = screen.getByLabelText(/Email/i)
      expect(emailInput).toBeInvalid()
    })
  })

  it('should validate email format', async () => {
    render(<SignInPage />)

    const emailInput = screen.getByLabelText(/Email/i)
    const submitButton = screen.getByText('Sign In')

    // Enter invalid email
    fireEvent.change(emailInput, { target: { value: 'invalid-email' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(emailInput).toBeInvalid()
    })

    // Enter valid email
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    expect(emailInput).toBeValid()
  })

  it('should submit form with valid credentials', async () => {
    const mockSignIn = vi.mocked(signIn)
    mockSignIn.mockResolvedValue({ ok: true, error: null } as any)

    render(<SignInPage />)

    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Password/i)
    const submitButton = screen.getByText('Sign In')

    // Fill in valid credentials
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })

    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('credentials', {
        email: 'test@example.com',
        password: 'password123',
        redirect: false
      })
    })
  })

  it('should show error message on sign in failure', async () => {
    const mockSignIn = vi.mocked(signIn)
    mockSignIn.mockResolvedValue({ ok: false, error: 'Invalid credentials' } as any)

    render(<SignInPage />)

    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Password/i)
    const submitButton = screen.getByText('Sign In')

    // Fill in credentials
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } })

    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/Invalid credentials/i)).toBeTruthy()
    })
  })

  it('should handle form submission with enter key', async () => {
    const mockSignIn = vi.mocked(signIn)
    mockSignIn.mockResolvedValue({ ok: true, error: null } as any)

    render(<SignInPage />)

    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Password/i)

    // Fill in credentials
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })

    // Submit with Enter key on password field
    fireEvent.keyDown(passwordInput, { key: 'Enter' })

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('credentials', {
        email: 'test@example.com',
        password: 'password123',
        redirect: false
      })
    })
  })

  it('should show loading state during submission', async () => {
    const mockSignIn = vi.mocked(signIn)
    let resolveSignIn: (value: any) => void
    mockSignIn.mockReturnValue(new Promise(resolve => {
      resolveSignIn = resolve
    }))

    render(<SignInPage />)

    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Password/i)
    const submitButton = screen.getByText('Sign In')

    // Fill in credentials
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })

    fireEvent.click(submitButton)

    // Should show loading state
    expect(screen.getByText('Signing in...')).toBeTruthy()
    expect(submitButton).toBeDisabled()

    // Resolve the sign in
    resolveSignIn!({ ok: true, error: null })

    await waitFor(() => {
      expect(screen.queryByText('Signing in...')).toBeFalsy()
      expect(submitButton).not.toBeDisabled()
    })
  })

  it('should redirect to home after successful sign in', async () => {
    const mockSignIn = vi.mocked(signIn)
    mockSignIn.mockResolvedValue({ ok: true, error: null } as any)

    render(<SignInPage />)

    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Password/i)
    const submitButton = screen.getByText('Sign In')

    // Fill in credentials
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })

    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/')
    })
  })

  it('should handle redirect parameter from URL', async () => {
    vi.mocked(useSearchParams).mockReturnValue({
      get: (key: string) => key === 'redirect' ? '/room/ABC123' : null,
      entries: [],
      forEach: vi.fn(),
      keys: [],
      values: [],
      has: vi.fn(),
      toString: vi.fn()
    } as any)

    const mockSignIn = vi.mocked(signIn)
    mockSignIn.mockResolvedValue({ ok: true, error: null } as any)

    render(<SignInPage />)

    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Password/i)
    const submitButton = screen.getByText('Sign In')

    // Fill in credentials
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })

    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/room/ABC123')
    })
  })

  it('should show error for network issues', async () => {
    const mockSignIn = vi.mocked(signIn)
    mockSignIn.mockRejectedValue(new Error('Network error'))

    render(<SignInPage />)

    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Password/i)
    const submitButton = screen.getByText('Sign In')

    // Fill in credentials
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })

    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/An error occurred during sign in/i)).toBeTruthy()
    })
  })
})