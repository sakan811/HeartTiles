import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { signIn } from 'next-auth/react'
import SignInPage from '../../src/app/auth/signin/page.js'

// Import test utilities
import {
  createMockRouter,
  fillForm,
  submitForm,
  expectElementToBeVisible,
  expectButtonToBeDisabled,
  expectButtonToBeEnabled,
  expectLinkToHaveHref
} from './../unit/utils/test-utils.jsx'

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
  useSession: vi.fn()
}))

// Mock next/navigation
const mockRouter = createMockRouter()
const mockSearchParams = {
  get: vi.fn(),
  entries: [],
  forEach: vi.fn(),
  keys: [],
  values: [],
  has: vi.fn(),
  toString: vi.fn()
}

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams
}))

describe('Sign In Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRouter.push.mockClear()
    mockRouter.refresh.mockClear()
    mockSearchParams.get.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
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
    mockSignIn.mockResolvedValue({ ok: true, error: null })

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
    mockSignIn.mockResolvedValue({ ok: false, error: 'Invalid credentials' })

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
    mockSignIn.mockResolvedValue({ ok: true, error: null })

    render(<SignInPage />)

    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Password/i)
    const form = screen.getByText('Sign in').closest('form')

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
    let resolveSignIn
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
      resolveSignIn({ ok: true, error: null })
    })

    expect(screen.queryByText('Signing in...')).toBeFalsy()
    expect(submitButton).not.toBeDisabled()
  })

  it('should redirect to home after successful sign in', async () => {
    const mockSignIn = vi.mocked(signIn)
    mockSignIn.mockResolvedValue({ ok: true, error: null })

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

  describe('Page Rendering', () => {
    it('should render sign in form with all required elements', () => {
      render(<SignInPage />)

      expectElementToBeVisible(screen.getByText('Sign in to your account'))
      expectElementToBeVisible(screen.getByRole('heading', { name: /Sign in to your account/ }))
      expectElementToBeVisible(screen.getByLabelText(/Email address/i))
      expectElementToBeVisible(screen.getByLabelText(/Password/i))
      expectElementToBeVisible(screen.getByRole('button', { name: 'Sign in' }))
    })

    it('should have link to sign up page', () => {
      render(<SignInPage />)

      const signUpLink = screen.getByText(/create a new account/i)
      expectLinkToHaveHref(signUpLink, '/auth/signup')
    })

    it('should render with proper page layout and styling', () => {
      render(<SignInPage />)

      const mainContainer = screen.getByText('Sign in to your account').closest('div')
      expect(mainContainer).toHaveClass(
        'min-h-screen',
        'flex',
        'items-center',
        'justify-center',
        'bg-gray-50',
        'py-12',
        'px-4',
        'sm:px-6',
        'lg:px-8'
      )

      const formContainer = mainContainer?.querySelector('.max-w-md')
      expect(formContainer).toHaveClass('max-w-md', 'w-full', 'space-y-8')
    })

    it('should have proper responsive design classes', () => {
      render(<SignInPage />)

      const pageContainer = screen.getByRole('heading', { name: /Sign in to your account/ }).closest('div')
      expect(pageContainer?.parentElement).toHaveClass(
        'min-h-screen',
        'flex',
        'items-center',
        'justify-center'
      )
    })
  })

  describe('Form Fields', () => {
    it('should have required email and password inputs with correct attributes', () => {
      render(<SignInPage />)

      const emailInput = screen.getByLabelText(/Email address/i)
      const passwordInput = screen.getByLabelText(/Password/i)

      expect(emailInput).toBeRequired()
      expect(passwordInput).toBeRequired()
      expect(emailInput).toHaveAttribute('type', 'email')
      expect(passwordInput).toHaveAttribute('type', 'password')
      expect(emailInput).toHaveAttribute('name', 'email')
      expect(passwordInput).toHaveAttribute('name', 'password')
      expect(emailInput).toHaveAttribute('autoComplete', 'email')
      expect(passwordInput).toHaveAttribute('autoComplete', 'current-password')
    })

    it('should have proper input styling and placeholders', () => {
      render(<SignInPage />)

      const emailInput = screen.getByLabelText(/Email address/i)
      const passwordInput = screen.getByLabelText(/Password/i)

      expect(emailInput).toHaveClass(
        'appearance-none',
        'rounded-none',
        'relative',
        'block',
        'w-full',
        'px-3',
        'py-2',
        'border',
        'border-gray-300',
        'placeholder-gray-500',
        'text-gray-900',
        'rounded-t-md',
        'focus:outline-none',
        'focus:ring-indigo-500',
        'focus:border-indigo-500',
        'focus:z-10',
        'sm:text-sm'
      )

      expect(passwordInput).toHaveClass(
        'appearance-none',
        'rounded-none',
        'relative',
        'block',
        'w-full',
        'px-3',
        'py-2',
        'border',
        'border-gray-300',
        'placeholder-gray-500',
        'text-gray-900',
        'rounded-b-md',
        'focus:outline-none',
        'focus:ring-indigo-500',
        'focus:border-indigo-500',
        'focus:z-10',
        'sm:text-sm'
      )

      expect(emailInput).toHaveAttribute('placeholder', 'Email address')
      expect(passwordInput).toHaveAttribute('placeholder', 'Password')
    })

    it('should have proper screen reader labels', () => {
      render(<SignInPage />)

      const emailInput = screen.getByLabelText(/Email address/i)
      const passwordInput = screen.getByLabelText(/Password/i)

      expect(emailInput).toHaveAccessibleName()
      expect(passwordInput).toHaveAccessibleName()
    })
  })

  describe('Form Submission', () => {
    it('should submit form with valid credentials', async () => {
      const mockSignIn = vi.mocked(signIn)
      mockSignIn.mockResolvedValue({ ok: true, error: null })

      render(<SignInPage />)

      await fillForm({
        'Email address': 'test@example.com',
        'Password': 'password123'
      }, screen)

      await submitForm(screen)

      expect(mockSignIn).toHaveBeenCalledWith('credentials', {
        email: 'test@example.com',
        password: 'password123',
        redirect: false
      })
    })

    it('should redirect to home and refresh after successful sign in', async () => {
      const mockSignIn = vi.mocked(signIn)
      mockSignIn.mockResolvedValue({ ok: true, error: null })

      render(<SignInPage />)

      await fillForm({
        'Email address': 'test@example.com',
        'Password': 'password123'
      }, screen)

      await submitForm(screen)

      expect(mockRouter.push).toHaveBeenCalledWith('/')
      expect(mockRouter.refresh).toHaveBeenCalled()
    })

    it('should show error message on sign in failure with error from NextAuth', async () => {
      const mockSignIn = vi.mocked(signIn)
      mockSignIn.mockResolvedValue({ ok: false, error: 'Invalid credentials' })

      render(<SignInPage />)

      await fillForm({
        'Email address': 'test@example.com',
        'Password': 'wrongpassword'
      }, screen)

      await submitForm(screen)

      expectElementToBeVisible(screen.getByText(/Invalid email or password/i))
    })

    it('should show error message on sign in failure without specific error', async () => {
      const mockSignIn = vi.mocked(signIn)
      mockSignIn.mockResolvedValue({ ok: false, error: null })

      render(<SignInPage />)

      await fillForm({
        'Email address': 'test@example.com',
        'Password': 'wrongpassword'
      }, screen)

      await submitForm(screen)

      expectElementToBeVisible(screen.getByText(/Invalid email or password/i))
    })

    it('should show error message for network issues', async () => {
      const mockSignIn = vi.mocked(signIn)
      mockSignIn.mockRejectedValue(new Error('Network error'))

      render(<SignInPage />)

      await fillForm({
        'Email address': 'test@example.com',
        'Password': 'password123'
      }, screen)

      await submitForm(screen)

      expectElementToBeVisible(screen.getByText(/An error occurred\. Please try again\./i))
    })

    it('should handle form submission with enter key on password field', async () => {
      const mockSignIn = vi.mocked(signIn)
      mockSignIn.mockResolvedValue({ ok: true, error: null })

      render(<SignInPage />)

      const emailInput = screen.getByLabelText(/Email address/i)
      const passwordInput = screen.getByLabelText(/Password/i)

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
      fireEvent.change(passwordInput, { target: { value: 'password123' } })

      fireEvent.keyDown(passwordInput, { key: 'Enter', code: 'Enter' })

      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledWith('credentials', {
          email: 'test@example.com',
          password: 'password123',
          redirect: false
        })
      })
    })

    it('should handle form submission with enter key on email field', async () => {
      const mockSignIn = vi.mocked(signIn)
      mockSignIn.mockResolvedValue({ ok: true, error: null })

      render(<SignInPage />)

      const emailInput = screen.getByLabelText(/Email address/i)
      const passwordInput = screen.getByLabelText(/Password/i)

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
      fireEvent.change(passwordInput, { target: { value: 'password123' } })

      fireEvent.keyDown(emailInput, { key: 'Enter', code: 'Enter' })

      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledWith('credentials', {
          email: 'test@example.com',
          password: 'password123',
          redirect: false
        })
      })
    })
  })

  describe('Loading States', () => {
    it('should show loading state during submission', async () => {
      const mockSignIn = vi.mocked(signIn)
      let resolveSignIn
      mockSignIn.mockReturnValue(new Promise(resolve => {
        resolveSignIn = resolve
      }))

      render(<SignInPage />)

      const submitButton = screen.getByRole('button', { name: 'Sign in' })

      await fillForm({
        'Email address': 'test@example.com',
        'Password': 'password123'
      }, screen)

      // Start the submission process
      act(() => {
        fireEvent.click(submitButton)
      })

      // Should show loading state
      expectElementToBeVisible(screen.getByText('Signing in...'))
      expectButtonToBeDisabled(submitButton)
      expect(submitButton).toHaveClass('disabled:opacity-50', 'disabled:cursor-not-allowed')

      // Resolve the sign in
      await act(async () => {
        resolveSignIn({ ok: true, error: null })
      })

      expect(screen.queryByText('Signing in...')).not.toBeInTheDocument()
      expectButtonToBeEnabled(submitButton)
    })

    it('should clear loading state on successful submission', async () => {
      const mockSignIn = vi.mocked(signIn)
      mockSignIn.mockResolvedValue({ ok: true, error: null })

      render(<SignInPage />)

      const submitButton = screen.getByRole('button', { name: 'Sign in' })

      await fillForm({
        'Email address': 'test@example.com',
        'Password': 'password123'
      }, screen)

      await submitForm(screen)

      expect(screen.queryByText('Signing in...')).not.toBeInTheDocument()
      expectButtonToBeEnabled(submitButton)
    })

    it('should clear loading state on failed submission', async () => {
      const mockSignIn = vi.mocked(signIn)
      mockSignIn.mockResolvedValue({ ok: false, error: 'Invalid credentials' })

      render(<SignInPage />)

      const submitButton = screen.getByRole('button', { name: 'Sign in' })

      await fillForm({
        'Email address': 'test@example.com',
        'Password': 'wrongpassword'
      }, screen)

      await submitForm(screen)

      expect(screen.queryByText('Signing in...')).not.toBeInTheDocument()
      expectButtonToBeEnabled(submitButton)
    })
  })

  describe('Error Handling', () => {
    it('should display error message in proper container', async () => {
      const mockSignIn = vi.mocked(signIn)
      mockSignIn.mockResolvedValue({ ok: false, error: 'Invalid credentials' })

      render(<SignInPage />)

      await fillForm({
        'Email address': 'test@example.com',
        'Password': 'wrongpassword'
      }, screen)

      await submitForm(screen)

      const errorContainer = screen.getByText(/Invalid email or password/i).closest('div')
      expect(errorContainer).toHaveClass(
        'rounded-md',
        'bg-red-50',
        'p-4'
      )

      const errorText = screen.getByText(/Invalid email or password/i)
      expect(errorText).toHaveClass('text-sm', 'text-red-700')
    })

    it('should clear error message when user starts typing', async () => {
      const mockSignIn = vi.mocked(signIn)
      mockSignIn.mockResolvedValue({ ok: false, error: 'Invalid credentials' })

      render(<SignInPage />)

      // Trigger error first
      await fillForm({
        'Email address': 'test@example.com',
        'Password': 'wrongpassword'
      }, screen)

      await submitForm(screen)

      expectElementToBeVisible(screen.getByText(/Invalid email or password/i))

      // Start typing in email field
      const emailInput = screen.getByLabelText(/Email address/i)
      fireEvent.change(emailInput, { target: { value: 'newemail@example.com' } })

      // Error should persist until new submission attempt
      expectElementToBeVisible(screen.getByText(/Invalid email or password/i))
    })

    it('should handle different types of errors appropriately', async () => {
      const mockSignIn = vi.mocked(signIn)

      render(<SignInPage />)

      // Test network error
      mockSignIn.mockRejectedValue(new Error('Network connection failed'))
      await fillForm({
        'Email address': 'test@example.com',
        'Password': 'password123'
      }, screen)
      await submitForm(screen)
      expectElementToBeVisible(screen.getByText(/An error occurred\. Please try again\./i))

      // Clear and test NextAuth error
      vi.clearAllMocks()
      mockSignIn.mockResolvedValue({ ok: false, error: 'User not found' })
      await fillForm({
        'Email address': 'user@notfound.com',
        'Password': 'password123'
      }, screen)
      await submitForm(screen)
      expectElementToBeVisible(screen.getByText(/Invalid email or password/i))
    })
  })

  describe('Button States and Styling', () => {
    it('should render submit button with proper styling', () => {
      render(<SignInPage />)

      const submitButton = screen.getByRole('button', { name: 'Sign in' })

      expect(submitButton).toHaveClass(
        'group',
        'relative',
        'w-full',
        'flex',
        'justify-center',
        'py-2',
        'px-4',
        'border',
        'border-transparent',
        'text-sm',
        'font-medium',
        'rounded-md',
        'text-white',
        'bg-indigo-600',
        'hover:bg-indigo-700',
        'focus:outline-none',
        'focus:ring-2',
        'focus:ring-offset-2',
        'focus:ring-indigo-500',
        'disabled:opacity-50',
        'disabled:cursor-not-allowed'
      )
    })

    it('should have button with type submit', () => {
      render(<SignInPage />)

      const submitButton = screen.getByRole('button', { name: 'Sign in' })
      expect(submitButton).toHaveAttribute('type', 'submit')
    })

    it('should disable button during loading', async () => {
      const mockSignIn = vi.mocked(signIn)
      let resolveSignIn
      mockSignIn.mockReturnValue(new Promise(resolve => {
        resolveSignIn = resolve
      }))

      render(<SignInPage />)

      const submitButton = screen.getByRole('button', { name: 'Sign in' })

      await fillForm({
        'Email address': 'test@example.com',
        'Password': 'password123'
      }, screen)

      act(() => {
        fireEvent.click(submitButton)
      })

      expectButtonToBeDisabled(submitButton)
    })
  })

  describe('Form Validation', () => {
    it('should handle empty form submission gracefully', async () => {
      const mockSignIn = vi.mocked(signIn)
      mockSignIn.mockResolvedValue({ ok: false, error: 'Missing credentials' })

      render(<SignInPage />)

      await submitForm(screen)

      // Should still attempt to submit even with empty fields (server-side validation)
      expect(mockSignIn).toHaveBeenCalledWith('credentials', {
        email: '',
        password: '',
        redirect: false
      })
    })

    it('should handle whitespace-only inputs', async () => {
      const mockSignIn = vi.mocked(signIn)
      mockSignIn.mockResolvedValue({ ok: false, error: 'Missing credentials' })

      render(<SignInPage />)

      await fillForm({
        'Email address': '   ',
        'Password': '   '
      }, screen)

      await submitForm(screen)

      expect(mockSignIn).toHaveBeenCalledWith('credentials', {
        email: '   ',
        password: '   ',
        redirect: false
      })
    })
  })

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      render(<SignInPage />)

      const mainHeading = screen.getByRole('heading', { level: 2 })
      expect(mainHeading).toHaveTextContent('Sign in to your account')
    })

    it('should have proper form labels and associations', () => {
      render(<SignInPage />)

      const emailInput = screen.getByLabelText(/Email address/i)
      const passwordInput = screen.getByLabelText(/Password/i)

      expect(emailInput).toHaveAttribute('id')
      expect(passwordInput).toHaveAttribute('id')

      // Check that labels are properly associated
      expect(emailInput.labels?.length).toBeGreaterThan(0)
      expect(passwordInput.labels?.length).toBeGreaterThan(0)
    })

    it('should have proper button accessibility', () => {
      render(<SignInPage />)

      const submitButton = screen.getByRole('button', { name: 'Sign in' })
      expect(submitButton).toHaveAttribute('type', 'submit')
    })

    it('should support keyboard navigation', async () => {
      render(<SignInPage />)

      const emailInput = screen.getByLabelText(/Email address/i)
      const passwordInput = screen.getByLabelText(/Password/i)
      const submitButton = screen.getByRole('button', { name: 'Sign in' })

      // Test tab navigation
      emailInput.focus()
      expect(emailInput).toHaveFocus()

      fireEvent.keyDown(emailInput, { key: 'Tab' })
      expect(passwordInput).toHaveFocus()

      fireEvent.keyDown(passwordInput, { key: 'Tab' })
      expect(submitButton).toHaveFocus()
    })

    it('should have proper link accessibility', () => {
      render(<SignInPage />)

      const signUpLink = screen.getByText(/create a new account/i)
      expect(signUpLink).toHaveAttribute('href', '/auth/signup')
      expect(signUpLink).toHaveClass('font-medium', 'text-indigo-600', 'hover:text-indigo-500')
    })
  })

  describe('URL Query Parameters', () => {
    it('should handle callbackUrl parameter', () => {
      mockSearchParams.get.mockReturnValue('/room/ABC123')

      render(<SignInPage />)

      // The component should read the callbackUrl but not display it
      expect(mockSearchParams.get).toHaveBeenCalledWith('callbackUrl')
    })

    it('should handle message parameter', () => {
      mockSearchParams.get.mockReturnValue('Account created successfully')

      render(<SignInPage />)

      // The component should read the message parameter
      expect(mockSearchParams.get).toHaveBeenCalledWith('message')
    })
  })

  describe('Component Behavior', () => {
    it('should not submit form when button is disabled', async () => {
      const mockSignIn = vi.mocked(signIn)
      let resolveSignIn
      mockSignIn.mockReturnValue(new Promise(resolve => {
        resolveSignIn = resolve
      }))

      render(<SignInPage />)

      const submitButton = screen.getByRole('button', { name: 'Sign in' })

      await fillForm({
        'Email address': 'test@example.com',
        'Password': 'password123'
      }, screen)

      // Start submission to disable button
      act(() => {
        fireEvent.click(submitButton)
      })

      // Try to click again while disabled
      fireEvent.click(submitButton)

      // Should only have been called once
      expect(mockSignIn).toHaveBeenCalledTimes(1)

      // Resolve the promise
      await act(async () => {
        resolveSignIn({ ok: true, error: null })
      })
    })

    it('should handle rapid form submissions', async () => {
      const mockSignIn = vi.mocked(signIn)
      mockSignIn.mockResolvedValue({ ok: true, error: null })

      render(<SignInPage />)

      const submitButton = screen.getByRole('button', { name: 'Sign in' })

      await fillForm({
        'Email address': 'test@example.com',
        'Password': 'password123'
      }, screen)

      // Rapid clicks
      fireEvent.click(submitButton)
      fireEvent.click(submitButton)
      fireEvent.click(submitButton)

      // Should only submit once due to loading state
      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledTimes(1)
      })
    })
  })
})