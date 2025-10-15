import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { signIn } from 'next-auth/react'
import SignInPage from '../../src/app/auth/signin/page.tsx'

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
  useSession: vi.fn()
}))

// Mock next/navigation
const mockUseRouter = vi.fn()
const mockUseSearchParams = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => mockUseRouter(),
  useSearchParams: () => mockUseSearchParams()
}))

describe('Sign In Page', () => {
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
  })

  it('should render sign in form', () => {
    render(<SignInPage />)

    expect(screen.getByText('Sign in')).toBeTruthy()
    expect(screen.getByLabelText(/Email/i)).toBeTruthy()
    expect(screen.getByLabelText(/Password/i)).toBeTruthy()
    expect(screen.getByText('Sign in')).toBeTruthy()
  })

  it('should have link to sign up page', () => {
    render(<SignInPage />)

    const signUpLink = screen.getByText(/create a new account/i)
    expect(signUpLink).toBeTruthy()
    expect(signUpLink.closest('a')).toHaveAttribute('href', '/auth/signup')
  })

  it('should display the correct page title', () => {
    render(<SignInPage />)

    expect(screen.getByText('Sign in to your account')).toBeTruthy()
  })

  it('should have required email and password inputs', () => {
    render(<SignInPage />)

    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Password/i)

    expect(emailInput).toBeRequired()
    expect(passwordInput).toBeRequired()
    expect(emailInput).toHaveAttribute('type', 'email')
    expect(passwordInput).toHaveAttribute('type', 'password')
  })

  it('should submit form with valid credentials', async () => {
    const mockSignIn = vi.mocked(signIn)
    mockSignIn.mockResolvedValue({ ok: true, error: null } as any)

    render(<SignInPage />)

    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Password/i)
    const submitButton = screen.getByText('Sign in')

    // Fill in valid credentials
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })

    await act(async () => {
      fireEvent.click(submitButton)
    })

    expect(mockSignIn).toHaveBeenCalledWith('credentials', {
      email: 'test@example.com',
      password: 'password123',
      redirect: false
    })
  })

  it('should show error message on sign in failure', async () => {
    const mockSignIn = vi.mocked(signIn)
    mockSignIn.mockResolvedValue({ ok: false, error: 'Invalid credentials' } as any)

    render(<SignInPage />)

    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Password/i)
    const submitButton = screen.getByText('Sign in')

    // Fill in credentials
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } })

    await act(async () => {
      fireEvent.click(submitButton)
    })

    expect(screen.getByText(/Invalid email or password/i)).toBeTruthy()
  })

  it('should handle form submission with enter key', async () => {
    const mockSignIn = vi.mocked(signIn)
    mockSignIn.mockResolvedValue({ ok: true, error: null } as any)

    render(<SignInPage />)

    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Password/i)
    const form = screen.getByText('Sign in').closest('form')!

    // Fill in credentials
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })

    // Submit with Enter key on password field
    await act(async () => {
      fireEvent.submit(form)
    })

    expect(mockSignIn).toHaveBeenCalledWith('credentials', {
      email: 'test@example.com',
      password: 'password123',
      redirect: false
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
    const submitButton = screen.getByText('Sign in')

    // Fill in credentials
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })

    // Start the submission process
    act(() => {
      fireEvent.click(submitButton)
    })

    // Should show loading state
    expect(screen.getByText('Signing in...')).toBeTruthy()
    expect(submitButton).toBeDisabled()

    // Resolve the sign in
    await act(async () => {
      resolveSignIn!({ ok: true, error: null })
    })

    expect(screen.queryByText('Signing in...')).toBeFalsy()
    expect(submitButton).not.toBeDisabled()
  })

  it('should redirect to home after successful sign in', async () => {
    const mockSignIn = vi.mocked(signIn)
    mockSignIn.mockResolvedValue({ ok: true, error: null } as any)

    render(<SignInPage />)

    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Password/i)
    const submitButton = screen.getByText('Sign in')

    // Fill in credentials
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })

    await act(async () => {
      fireEvent.click(submitButton)
    })

    expect(mockPush).toHaveBeenCalledWith('/')
  })

  it('should handle keyboard navigation', async () => {
    render(<SignInPage />)

    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Password/i)

    // Test that inputs can receive focus
    emailInput.focus()
    expect(emailInput).toHaveFocus()

    // Test that password input can receive focus
    passwordInput.focus()
    expect(passwordInput).toHaveFocus()
  })

  it('should show error for network issues', async () => {
    const mockSignIn = vi.mocked(signIn)
    mockSignIn.mockRejectedValue(new Error('Network error'))

    render(<SignInPage />)

    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Password/i)
    const submitButton = screen.getByText('Sign in')

    // Fill in credentials
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })

    await act(async () => {
      fireEvent.click(submitButton)
    })

    expect(screen.getByText(/An error occurred\. Please try again\./i)).toBeTruthy()
  })
})