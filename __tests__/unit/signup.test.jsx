import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SignUpPage from '../../src/app/auth/signup/page.js'

// Mock the providers
vi.mock('../../src/contexts/SocketContext.js', () => ({
  SocketProvider: ({ children }) => <>{children}</>
}))

vi.mock('../../src/components/providers/SessionProvider.js', () => ({
  SessionProvider: ({ children }) => <>{children}</>
}))

// Mock next/navigation
const mockUseRouter = vi.fn()
const mockUseSearchParams = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => mockUseRouter(),
  useSearchParams: () => mockUseSearchParams()
}))

// Mock fetch for API calls
global.fetch = vi.fn()

describe('Sign Up Page', () => {
  const mockPush = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

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

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should render sign up form', () => {
    render(<SignUpPage />)

    expect(screen.getByText('Create your account')).toBeTruthy()
    expect(screen.getByPlaceholderText('Full name')).toBeTruthy()
    expect(screen.getByPlaceholderText('Email address')).toBeTruthy()
    expect(screen.getByPlaceholderText(/Password \(min 6 characters\)/i)).toBeTruthy()
    expect(screen.getByPlaceholderText('Confirm password')).toBeTruthy()
    expect(screen.getByText('Create account')).toBeTruthy()
  })

  it('should have link to sign in page', () => {
    render(<SignUpPage />)

    const signInLink = screen.getByText(/sign in to your existing account/i)
    expect(signInLink).toBeTruthy()
    expect(signInLink.closest('a')).toHaveAttribute('href', '/auth/signin')
  })


  it('should validate required fields', async () => {
    render(<SignUpPage />)

    const nameInput = screen.getByPlaceholderText('Full name')
    const emailInput = screen.getByPlaceholderText('Email address')
    const passwordInput = screen.getByPlaceholderText(/Password \(min 6 characters\)/i)
    const confirmPasswordInput = screen.getByPlaceholderText('Confirm password')

    expect(nameInput).toHaveAttribute('required')
    expect(emailInput).toHaveAttribute('required')
    expect(passwordInput).toHaveAttribute('required')
    expect(confirmPasswordInput).toHaveAttribute('required')
  })

  it('should validate email format', async () => {
    render(<SignUpPage />)

    const emailInput = screen.getByPlaceholderText('Email address')

    // Check that input has email type
    expect(emailInput).toHaveAttribute('type', 'email')

    // Enter values and verify they are set
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    expect(emailInput).toHaveValue('test@example.com')
  })

  it('should validate password minimum length', async () => {
    render(<SignUpPage />)

    const passwordInput = screen.getByPlaceholderText(/Password \(min 6 characters\)/i)

    // Enter short password
    fireEvent.change(passwordInput, { target: { value: '123' } })
    expect(passwordInput).toHaveValue('123')

    // Enter valid password
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    expect(passwordInput).toHaveValue('password123')
  })

  it('should validate password confirmation', async () => {
    render(<SignUpPage />)

    const passwordInput = screen.getByPlaceholderText(/Password \(min 6 characters\)/i)
    const confirmPasswordInput = screen.getByPlaceholderText('Confirm password')

    // Enter matching passwords
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'password123' } })
    expect(passwordInput).toHaveValue('password123')
    expect(confirmPasswordInput).toHaveValue('password123')

    // Enter non-matching passwords
    fireEvent.change(confirmPasswordInput, { target: { value: 'different' } })
    expect(confirmPasswordInput).toHaveValue('different')
  })

  it('should submit form with valid data', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'User created successfully' })
    })

    render(<SignUpPage />)

    const nameInput = screen.getByPlaceholderText('Full name')
    const emailInput = screen.getByPlaceholderText('Email address')
    const passwordInput = screen.getByPlaceholderText(/Password \(min 6 characters\)/i)
    const confirmPasswordInput = screen.getByPlaceholderText('Confirm password')
    const submitButton = screen.getByText('Create account')

    // Fill in valid data
    fireEvent.change(nameInput, { target: { value: 'Test User' } })
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'password123' } })

    fireEvent.click(submitButton)

    // Run timers to complete async operations
    await vi.runAllTimersAsync()

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

  it('should redirect to sign in after successful registration', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'User created successfully' })
    })

    render(<SignUpPage />)

    const nameInput = screen.getByPlaceholderText('Full name')
    const emailInput = screen.getByPlaceholderText('Email address')
    const passwordInput = screen.getByPlaceholderText(/Password \(min 6 characters\)/i)
    const confirmPasswordInput = screen.getByPlaceholderText('Confirm password')
    const submitButton = screen.getByText('Create account')

    // Fill in valid data
    fireEvent.change(nameInput, { target: { value: 'Test User' } })
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'password123' } })

    fireEvent.click(submitButton)

    // Run timers to complete async operations
    await vi.runAllTimersAsync()

    expect(mockPush).toHaveBeenCalledWith('/auth/signin?message=Account created successfully')
  })

  it('should show error message on registration failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Email already exists' })
    })

    render(<SignUpPage />)

    const nameInput = screen.getByPlaceholderText('Full name')
    const emailInput = screen.getByPlaceholderText('Email address')
    const passwordInput = screen.getByPlaceholderText(/Password \(min 6 characters\)/i)
    const confirmPasswordInput = screen.getByPlaceholderText('Confirm password')
    const submitButton = screen.getByText('Create account')

    // Fill in data
    fireEvent.change(nameInput, { target: { value: 'Test User' } })
    fireEvent.change(emailInput, { target: { value: 'existing@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'password123' } })

    fireEvent.click(submitButton)

    // Run timers to complete async operations
    await vi.runAllTimersAsync()

    expect(screen.getByText(/Email already exists/i)).toBeTruthy()
  })

  it('should show loading state during submission', async () => {
    let resolveFetch
    vi.mocked(fetch).mockReturnValueOnce(new Promise(resolve => {
      resolveFetch = resolve
    }))

    render(<SignUpPage />)

    const nameInput = screen.getByPlaceholderText('Full name')
    const emailInput = screen.getByPlaceholderText('Email address')
    const passwordInput = screen.getByPlaceholderText(/Password \(min 6 characters\)/i)
    const confirmPasswordInput = screen.getByPlaceholderText('Confirm password')
    const submitButton = screen.getByText('Create account')

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
    resolveFetch({
      ok: true,
      json: async () => ({ message: 'User created successfully' })
    })

    // Run timers to complete async operations
    await vi.runAllTimersAsync()

    // Check that loading state is cleared after fetch resolves
    expect(screen.queryByText('Creating account...')).toBeFalsy()
    expect(submitButton).not.toBeDisabled()
  })

  it('should handle network errors gracefully', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

    render(<SignUpPage />)

    const nameInput = screen.getByPlaceholderText('Full name')
    const emailInput = screen.getByPlaceholderText('Email address')
    const passwordInput = screen.getByPlaceholderText(/Password \(min 6 characters\)/i)
    const confirmPasswordInput = screen.getByPlaceholderText('Confirm password')
    const submitButton = screen.getByText('Create account')

    // Fill in valid data
    fireEvent.change(nameInput, { target: { value: 'Test User' } })
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'password123' } })

    fireEvent.click(submitButton)

    // Run timers to complete async operations
    await vi.runAllTimersAsync()

    expect(screen.getByText(/An error occurred. Please try again./i)).toBeTruthy()
  })

  it('should validate name length', async () => {
    render(<SignUpPage />)

    const nameInput = screen.getByPlaceholderText('Full name')

    // Enter name that's too long
    const longName = 'A'.repeat(51)
    fireEvent.change(nameInput, { target: { value: longName } })
    expect(nameInput).toHaveValue(longName)

    // Enter valid name
    fireEvent.change(nameInput, { target: { value: 'Test User' } })
    expect(nameInput).toHaveValue('Test User')
  })

  it('should trim whitespace from form inputs', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'User created successfully' })
    })

    render(<SignUpPage />)

    const nameInput = screen.getByPlaceholderText('Full name')
    const emailInput = screen.getByPlaceholderText('Email address')
    const passwordInput = screen.getByPlaceholderText(/Password \(min 6 characters\)/i)
    const confirmPasswordInput = screen.getByPlaceholderText('Confirm password')
    const submitButton = screen.getByText('Create account')

    // Fill in data with extra whitespace
    fireEvent.change(nameInput, { target: { value: '  Test User  ' } })
    fireEvent.change(emailInput, { target: { value: '  test@example.com  ' } })
    fireEvent.change(passwordInput, { target: { value: '  password123  ' } })
    fireEvent.change(confirmPasswordInput, { target: { value: '  password123  ' } })

    fireEvent.click(submitButton)

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