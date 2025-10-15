import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SignUpPage from '../../src/app/auth/signup/page.tsx'

// Mock next/navigation
const mockUseRouter = vi.fn()
const mockUseSearchParams = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => mockUseRouter(),
  useSearchParams: () => mockUseSearchParams()
}))

// Mock fetch for API calls
global.fetch = vi.fn() as any

describe('Sign Up Page', () => {
  const mockPush = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    mockUseRouter.mockReturnValue({
      push: mockPush,
      refresh: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn()
    })

    mockUseSearchParams.mockReturnValue({
      get: vi.fn(),
      entries: [],
      forEach: vi.fn(),
      keys: [],
      values: [],
      has: vi.fn(),
      toString: vi.fn()
    })

    vi.mocked(fetch).mockClear()
  })

  it('should render sign up form', () => {
    render(<SignUpPage />)

    expect(screen.getByText('Sign Up')).toBeTruthy()
    expect(screen.getByLabelText(/Name/i)).toBeTruthy()
    expect(screen.getByLabelText(/Email/i)).toBeTruthy()
    expect(screen.getByLabelText(/Password/i)).toBeTruthy()
    expect(screen.getByLabelText(/Confirm Password/i)).toBeTruthy()
    expect(screen.getByText('Sign Up')).toBeTruthy()
  })

  it('should have link to sign in page', () => {
    render(<SignUpPage />)

    const signInLink = screen.getByText(/Already have an account\? Sign in/i)
    expect(signInLink).toBeTruthy()
    expect(signInLink.closest('a')).toHaveAttribute('href', '/auth/signin')
  })

  it('should have link back to home', () => {
    render(<SignUpPage />)

    const homeLink = screen.getByText(/← Back to Home/i)
    expect(homeLink).toBeTruthy()
    expect(homeLink.closest('a')).toHaveAttribute('href', '/')
  })

  it('should validate required fields', async () => {
    render(<SignUpPage />)

    const submitButton = screen.getByText('Sign Up')
    fireEvent.click(submitButton)

    await waitFor(() => {
      const nameInput = screen.getByLabelText(/Name/i)
      const emailInput = screen.getByLabelText(/Email/i)
      const passwordInput = screen.getByLabelText(/Password/i)
      const confirmPasswordInput = screen.getByLabelText(/Confirm Password/i)

      expect(nameInput).toBeInvalid()
      expect(emailInput).toBeInvalid()
      expect(passwordInput).toBeInvalid()
      expect(confirmPasswordInput).toBeInvalid()
    })
  })

  it('should validate email format', async () => {
    render(<SignUpPage />)

    const emailInput = screen.getByLabelText(/Email/i)

    // Enter invalid email
    fireEvent.change(emailInput, { target: { value: 'invalid-email' } })
    expect(emailInput).toBeInvalid()

    // Enter valid email
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    expect(emailInput).toBeValid()
  })

  it('should validate password minimum length', async () => {
    render(<SignUpPage />)

    const passwordInput = screen.getByLabelText(/Password/i)

    // Enter short password
    fireEvent.change(passwordInput, { target: { value: '123' } })
    expect(passwordInput).toBeInvalid()

    // Enter valid password
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    expect(passwordInput).toBeValid()
  })

  it('should validate password confirmation', async () => {
    render(<SignUpPage />)

    const passwordInput = screen.getByLabelText(/Password/i)
    const confirmPasswordInput = screen.getByLabelText(/Confirm Password/i)

    // Enter matching passwords
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'password123' } })
    expect(confirmPasswordInput).toBeValid()

    // Enter non-matching passwords
    fireEvent.change(confirmPasswordInput, { target: { value: 'different' } })
    expect(confirmPasswordInput).toBeInvalid()
  })

  it('should submit form with valid data', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'User created successfully' })
    } as Response)

    render(<SignUpPage />)

    const nameInput = screen.getByLabelText(/Name/i)
    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Password/i)
    const confirmPasswordInput = screen.getByLabelText(/Confirm Password/i)
    const submitButton = screen.getByText('Sign Up')

    // Fill in valid data
    fireEvent.change(nameInput, { target: { value: 'Test User' } })
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'password123' } })

    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123'
        })
      })
    })
  })

  it('should redirect to sign in after successful registration', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'User created successfully' })
    } as Response)

    render(<SignUpPage />)

    const nameInput = screen.getByLabelText(/Name/i)
    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Password/i)
    const confirmPasswordInput = screen.getByLabelText(/Confirm Password/i)
    const submitButton = screen.getByText('Sign Up')

    // Fill in valid data
    fireEvent.change(nameInput, { target: { value: 'Test User' } })
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'password123' } })

    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/auth/signin')
    })
  })

  it('should show error message on registration failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Email already exists' })
    } as Response)

    render(<SignUpPage />)

    const nameInput = screen.getByLabelText(/Name/i)
    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Password/i)
    const confirmPasswordInput = screen.getByLabelText(/Confirm Password/i)
    const submitButton = screen.getByText('Sign Up')

    // Fill in data
    fireEvent.change(nameInput, { target: { value: 'Test User' } })
    fireEvent.change(emailInput, { target: { value: 'existing@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'password123' } })

    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/Email already exists/i)).toBeTruthy()
    })
  })

  it('should show loading state during submission', async () => {
    let resolveFetch: (value: any) => void
    vi.mocked(fetch).mockReturnValueOnce(new Promise(resolve => {
      resolveFetch = resolve
    }))

    render(<SignUpPage />)

    const nameInput = screen.getByLabelText(/Name/i)
    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Password/i)
    const confirmPasswordInput = screen.getByLabelText(/Confirm Password/i)
    const submitButton = screen.getByText('Sign Up')

    // Fill in valid data
    fireEvent.change(nameInput, { target: { value: 'Test User' } })
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'password123' } })

    fireEvent.click(submitButton)

    // Should show loading state
    expect(screen.getByText('Creating account...')).toBeTruthy()
    expect(submitButton).toBeDisabled()

    // Resolve the fetch
    resolveFetch!({
      ok: true,
      json: async () => ({ message: 'User created successfully' })
    })

    await waitFor(() => {
      expect(screen.queryByText('Creating account...')).toBeFalsy()
      expect(submitButton).not.toBeDisabled()
    })
  })

  it('should handle network errors gracefully', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

    render(<SignUpPage />)

    const nameInput = screen.getByLabelText(/Name/i)
    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Password/i)
    const confirmPasswordInput = screen.getByLabelText(/Confirm Password/i)
    const submitButton = screen.getByText('Sign Up')

    // Fill in valid data
    fireEvent.change(nameInput, { target: { value: 'Test User' } })
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'password123' } })

    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/An error occurred during sign up/i)).toBeTruthy()
    })
  })

  it('should validate name length', async () => {
    render(<SignUpPage />)

    const nameInput = screen.getByLabelText(/Name/i)

    // Enter name that's too long
    const longName = 'A'.repeat(51)
    fireEvent.change(nameInput, { target: { value: longName } })
    expect(nameInput).toBeInvalid()

    // Enter valid name
    fireEvent.change(nameInput, { target: { value: 'Test User' } })
    expect(nameInput).toBeValid()
  })

  it('should trim whitespace from form inputs', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'User created successfully' })
    } as Response)

    render(<SignUpPage />)

    const nameInput = screen.getByLabelText(/Name/i)
    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Password/i)
    const confirmPasswordInput = screen.getByLabelText(/Confirm Password/i)
    const submitButton = screen.getByText('Sign Up')

    // Fill in data with extra whitespace
    fireEvent.change(nameInput, { target: { value: '  Test User  ' } })
    fireEvent.change(emailInput, { target: { value: '  test@example.com  ' } })
    fireEvent.change(passwordInput, { target: { value: '  password123  ' } })
    fireEvent.change(confirmPasswordInput, { target: { value: '  password123  ' } })

    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Test User',
          email: 'test@example.com',
          password: '  password123  ' // Password shouldn't be trimmed
        })
      })
    })
  })
})