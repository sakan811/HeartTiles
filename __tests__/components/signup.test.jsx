import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import SignUpPage from '../../src/app/auth/signup/page.js'

// Import test utilities
import {
  createMockRouter,
  fillForm,
  submitForm,
  mockFetch,
  mockFetchError,
  expectElementToBeVisible,
  expectButtonToBeDisabled,
  expectButtonToBeEnabled,
  expectLinkToHaveHref
} from '../unit/utils/test-utils'

// Mock the providers
vi.mock('../../src/contexts/SocketContext.js', () => ({
  SocketProvider: ({ children }) => <>{children}</>
}))

vi.mock('../../src/components/providers/SessionProvider.js', () => ({
  SessionProvider: ({ children }) => <>{children}</>
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

// Mock global fetch
const mockGlobalFetch = vi.fn()
global.fetch = mockGlobalFetch

describe('Sign Up Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockRouter.push.mockClear()
    mockRouter.refresh.mockClear()
    mockSearchParams.get.mockClear()
    mockGlobalFetch.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
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
    mockGlobalFetch.mockResolvedValueOnce({
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
    mockGlobalFetch.mockResolvedValueOnce({
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

    expect(mockRouter.push).toHaveBeenCalledWith('/auth/signin?message=Account created successfully')
  })

  it('should show error message on registration failure', async () => {
    mockGlobalFetch.mockResolvedValueOnce({
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
    mockGlobalFetch.mockReturnValueOnce(new Promise(resolve => {
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
    mockGlobalFetch.mockRejectedValueOnce(new Error('Network error'))

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

  describe('Page Rendering', () => {
    it('should render sign up form with all required elements', () => {
      render(<SignUpPage />)

      expectElementToBeVisible(screen.getByText('Create your account'))
      expectElementToBeVisible(screen.getByRole('heading', { name: /Create your account/ }))
      expectElementToBeVisible(screen.getByPlaceholderText('Full name'))
      expectElementToBeVisible(screen.getByPlaceholderText('Email address'))
      expectElementToBeVisible(screen.getByPlaceholderText(/Password \(min 6 characters\)/i))
      expectElementToBeVisible(screen.getByPlaceholderText('Confirm password'))
      expectElementToBeVisible(screen.getByRole('button', { name: 'Create account' }))
    })

    it('should have link to sign in page', () => {
      render(<SignUpPage />)

      const signInLink = screen.getByText(/sign in to your existing account/i)
      expectLinkToHaveHref(signInLink, '/auth/signin')
    })

    it('should render with proper page layout and styling', () => {
      render(<SignUpPage />)

      // Find the main container by looking for the div with the specific classes
      const mainContainer = screen.getByText('Create your account').closest('.min-h-screen')
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
  })

  describe('Form Fields', () => {
    it('should have required fields with correct attributes', () => {
      render(<SignUpPage />)

      const nameInput = screen.getByPlaceholderText('Full name')
      const emailInput = screen.getByPlaceholderText('Email address')
      const passwordInput = screen.getByPlaceholderText(/Password \(min 6 characters\)/i)
      const confirmPasswordInput = screen.getByPlaceholderText('Confirm password')

      expect(nameInput).toBeRequired()
      expect(emailInput).toBeRequired()
      expect(passwordInput).toBeRequired()
      expect(confirmPasswordInput).toBeRequired()

      expect(nameInput).toHaveAttribute('type', 'text')
      expect(emailInput).toHaveAttribute('type', 'email')
      expect(passwordInput).toHaveAttribute('type', 'password')
      expect(confirmPasswordInput).toHaveAttribute('type', 'password')

      expect(nameInput).toHaveAttribute('autoComplete', 'name')
      expect(emailInput).toHaveAttribute('autoComplete', 'email')
      expect(passwordInput).toHaveAttribute('autoComplete', 'new-password')
      expect(confirmPasswordInput).toHaveAttribute('autoComplete', 'new-password')
    })

    it('should have proper input styling and placeholders', () => {
      render(<SignUpPage />)

      const nameInput = screen.getByPlaceholderText('Full name')
      const emailInput = screen.getByPlaceholderText('Email address')
      const passwordInput = screen.getByPlaceholderText(/Password \(min 6 characters\)/i)
      const confirmPasswordInput = screen.getByPlaceholderText('Confirm password')

      expect(nameInput).toHaveClass(
        'appearance-none',
        'relative',
        'block',
        'w-full',
        'px-3',
        'py-2',
        'border',
        'border-gray-300',
        'placeholder-gray-500',
        'text-gray-900',
        'rounded-md',
        'focus:outline-none',
        'focus:ring-indigo-500',
        'focus:border-indigo-500',
        'focus:z-10',
        'sm:text-sm'
      )

      expect(emailInput).toHaveClass(
        'appearance-none',
        'relative',
        'block',
        'w-full',
        'px-3',
        'py-2',
        'border',
        'border-gray-300',
        'placeholder-gray-500',
        'text-gray-900',
        'rounded-md',
        'focus:outline-none',
        'focus:ring-indigo-500',
        'focus:border-indigo-500',
        'focus:z-10',
        'sm:text-sm'
      )

      expect(passwordInput).toHaveAttribute('placeholder', 'Password (min 6 characters)')
      expect(confirmPasswordInput).toHaveAttribute('placeholder', 'Confirm password')
    })

    it('should have proper screen reader labels', () => {
      render(<SignUpPage />)

      const nameInput = screen.getByPlaceholderText('Full name')
      const emailInput = screen.getByPlaceholderText('Email address')
      const passwordInput = screen.getByPlaceholderText(/Password \(min 6 characters\)/i)
      const confirmPasswordInput = screen.getByPlaceholderText('Confirm password')

      expect(nameInput).toHaveAccessibleName()
      expect(emailInput).toHaveAccessibleName()
      expect(passwordInput).toHaveAccessibleName()
      expect(confirmPasswordInput).toHaveAccessibleName()
    })
  })

  describe('Form Validation', () => {
    it('should validate password minimum length on client side', async () => {
      render(<SignUpPage />)

      const nameInput = screen.getByPlaceholderText('Full name')
      const emailInput = screen.getByPlaceholderText('Email address')
      const passwordInput = screen.getByPlaceholderText(/Password \(min 6 characters\)/i)
      const confirmPasswordInput = screen.getByPlaceholderText('Confirm password')
      const submitButton = screen.getByRole('button', { name: 'Create account' })

      // Fill form with short password
      await fillForm({
        'Full name': 'Test User',
        'Email address': 'test@example.com',
        'Password (min 6 characters)': '123',
        'Confirm password': '123'
      }, screen)

      await act(async () => {
        fireEvent.click(submitButton)
      })

      await vi.runAllTimersAsync()

      // Should show password length error
      expectElementToBeVisible(screen.getByText('Password must be at least 6 characters long'))
    })

    it('should validate password confirmation on client side', async () => {
      render(<SignUpPage />)

      const nameInput = screen.getByPlaceholderText('Full name')
      const emailInput = screen.getByPlaceholderText('Email address')
      const passwordInput = screen.getByPlaceholderText(/Password \(min 6 characters\)/i)
      const confirmPasswordInput = screen.getByPlaceholderText('Confirm password')
      const submitButton = screen.getByRole('button', { name: 'Create account' })

      // Fill form with non-matching passwords
      await fillForm({
        'Full name': 'Test User',
        'Email address': 'test@example.com',
        'Password (min 6 characters)': 'password123',
        'Confirm password': 'different'
      }, screen)

      await act(async () => {
        fireEvent.click(submitButton)
      })

      await vi.runAllTimersAsync()

      // Should show password mismatch error
      expectElementToBeVisible(screen.getByText('Passwords do not match'))
    })

    it('should pass validation with matching passwords of valid length', async () => {
      mockFetch({ message: 'User created successfully' })

      render(<SignUpPage />)

      await fillForm({
        'Full name': 'Test User',
        'Email address': 'test@example.com',
        'Password (min 6 characters)': 'password123',
        'Confirm password': 'password123'
      }, screen)

      await submitForm(screen)
      await vi.runAllTimersAsync()

      // Should not show client-side validation errors
      expect(screen.queryByText('Passwords do not match')).not.toBeInTheDocument()
      expect(screen.queryByText('Password must be at least 6 characters long')).not.toBeInTheDocument()
    })

    it('should handle edge case - empty passwords', async () => {
      render(<SignUpPage />)

      const nameInput = screen.getByPlaceholderText('Full name')
      const emailInput = screen.getByPlaceholderText('Email address')
      const passwordInput = screen.getByPlaceholderText(/Password \(min 6 characters\)/i)
      const confirmPasswordInput = screen.getByPlaceholderText('Confirm password')
      const submitButton = screen.getByRole('button', { name: 'Create account' })

      await fillForm({
        'Full name': 'Test User',
        'Email address': 'test@example.com',
        'Password (min 6 characters)': '',
        'Confirm password': ''
      }, screen)

      await act(async () => {
        fireEvent.click(submitButton)
      })

      await vi.runAllTimersAsync()

      // Should show password length error
      expectElementToBeVisible(screen.getByText('Password must be at least 6 characters long'))
    })
  })

  describe('Form Submission', () => {
    it('should submit form with valid data', async () => {
      mockFetch({ message: 'User created successfully' })

      render(<SignUpPage />)

      await fillForm({
        'Full name': 'Test User',
        'Email address': 'test@example.com',
        'Password (min 6 characters)': 'password123',
        'Confirm password': 'password123'
      }, screen)

      await submitForm(screen)
      await vi.runAllTimersAsync()

      expect(global.fetch).toHaveBeenCalledWith('/api/auth/signup', {
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
      mockFetch({ message: 'User created successfully' })

      render(<SignUpPage />)

      await fillForm({
        'Full name': 'Test User',
        'Email address': 'test@example.com',
        'Password (min 6 characters)': 'password123',
        'Confirm password': 'password123'
      }, screen)

      await submitForm(screen)
      await vi.runAllTimersAsync()

      expect(mockRouter.push).toHaveBeenCalledWith('/auth/signin?message=Account created successfully')
    })

    it('should handle server validation errors', async () => {
      mockFetch({ error: 'Email already exists' }, false)

      render(<SignUpPage />)

      await fillForm({
        'Full name': 'Test User',
        'Email address': 'existing@example.com',
        'Password (min 6 characters)': 'password123',
        'Confirm password': 'password123'
      }, screen)

      await submitForm(screen)
      await vi.runAllTimersAsync()

      expectElementToBeVisible(screen.getByText('Email already exists'))
    })

    it('should handle generic server errors', async () => {
      mockFetch({ error: 'Internal server error' }, false)

      render(<SignUpPage />)

      await fillForm({
        'Full name': 'Test User',
        'Email address': 'test@example.com',
        'Password (min 6 characters)': 'password123',
        'Confirm password': 'password123'
      }, screen)

      await submitForm(screen)
      await vi.runAllTimersAsync()

      expectElementToBeVisible(screen.getByText('Internal server error'))
    })

    it('should handle network errors gracefully', async () => {
      mockFetchError('Network connection failed')

      render(<SignUpPage />)

      await fillForm({
        'Full name': 'Test User',
        'Email address': 'test@example.com',
        'Password (min 6 characters)': 'password123',
        'Confirm password': 'password123'
      }, screen)

      await submitForm(screen)
      await vi.runAllTimersAsync()

      expectElementToBeVisible(screen.getByText('An error occurred. Please try again.'))
    })

    it('should trim whitespace from name and email but not password', async () => {
      mockFetch({ message: 'User created successfully' })

      render(<SignUpPage />)

      const nameInput = screen.getByPlaceholderText('Full name')
      const emailInput = screen.getByPlaceholderText('Email address')
      const passwordInput = screen.getByPlaceholderText(/Password \(min 6 characters\)/i)
      const confirmPasswordInput = screen.getByPlaceholderText('Confirm password')

      fireEvent.change(nameInput, { target: { value: '  Test User  ' } })
      fireEvent.change(emailInput, { target: { value: '  test@example.com  ' } })
      fireEvent.change(passwordInput, { target: { value: '  password123  ' } })
      fireEvent.change(confirmPasswordInput, { target: { value: '  password123  ' } })

      const submitButton = screen.getByRole('button', { name: 'Create account' })
      await act(async () => {
        fireEvent.click(submitButton)
      })

      await vi.runAllTimersAsync()

      expect(global.fetch).toHaveBeenCalledWith('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Test User',
          email: 'test@example.com',
          password: '  password123  ' // Password should not be trimmed
        })
      })
    })
  })

  describe('Loading States', () => {
    it('should show loading state during submission', async () => {
      let resolveFetch
      global.fetch = vi.fn().mockReturnValueOnce(new Promise(resolve => {
        resolveFetch = resolve
      }))

      render(<SignUpPage />)

      await fillForm({
        'Full name': 'Test User',
        'Email address': 'test@example.com',
        'Password (min 6 characters)': 'password123',
        'Confirm password': 'password123'
      }, screen)

      const submitButton = screen.getByRole('button', { name: 'Create account' })

      await act(async () => {
        fireEvent.click(submitButton)
      })

      expectElementToBeVisible(screen.getByText('Creating account...'))
      expectButtonToBeDisabled(submitButton)
      expect(submitButton).toHaveClass('disabled:opacity-50', 'disabled:cursor-not-allowed')

      // Resolve the fetch
      await act(async () => {
        resolveFetch({
          ok: true,
          json: async () => ({ message: 'User created successfully' })
        })
      })

      await vi.runAllTimersAsync()

      expect(screen.queryByText('Creating account...')).not.toBeInTheDocument()
      expectButtonToBeEnabled(submitButton)
    })

    it('should clear loading state on failed submission', async () => {
      mockFetch({ error: 'Email already exists' }, false)

      render(<SignUpPage />)

      await fillForm({
        'Full name': 'Test User',
        'Email address': 'existing@example.com',
        'Password (min 6 characters)': 'password123',
        'Confirm password': 'password123'
      }, screen)

      const submitButton = screen.getByRole('button', { name: 'Create account' })
      await submitForm(screen)
      await vi.runAllTimersAsync()

      expect(screen.queryByText('Creating account...')).not.toBeInTheDocument()
      expectButtonToBeEnabled(submitButton)
    })
  })

  describe('Error Handling', () => {
    it('should display error message in proper container', async () => {
      mockFetch({ error: 'Email already exists' }, false)

      render(<SignUpPage />)

      await fillForm({
        'Full name': 'Test User',
        'Email address': 'existing@example.com',
        'Password (min 6 characters)': 'password123',
        'Confirm password': 'password123'
      }, screen)

      await submitForm(screen)
      await vi.runAllTimersAsync()

      const errorContainer = screen.getByText('Email already exists').closest('div')
      expect(errorContainer).toHaveClass(
        'rounded-md',
        'bg-red-50',
        'p-4'
      )

      const errorText = screen.getByText('Email already exists')
      expect(errorText).toHaveClass('text-sm', 'text-red-700')
    })

    it('should clear error message when user starts typing', async () => {
      mockFetch({ error: 'Email already exists' }, false)

      render(<SignUpPage />)

      // Trigger error first
      await fillForm({
        'Full name': 'Test User',
        'Email address': 'existing@example.com',
        'Password (min 6 characters)': 'password123',
        'Confirm password': 'password123'
      }, screen)

      await submitForm(screen)
      await vi.runAllTimersAsync()

      expectElementToBeVisible(screen.getByText('Email already exists'))

      // Start typing in name field
      const nameInput = screen.getByPlaceholderText('Full name')
      fireEvent.change(nameInput, { target: { value: 'New Name' } })

      // Error should persist until new submission attempt
      expectElementToBeVisible(screen.getByText('Email already exists'))
    })
  })

  describe('Button States and Styling', () => {
    it('should render submit button with proper styling', () => {
      render(<SignUpPage />)

      const submitButton = screen.getByRole('button', { name: 'Create account' })

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
      render(<SignUpPage />)

      const submitButton = screen.getByRole('button', { name: 'Create account' })
      expect(submitButton).toHaveAttribute('type', 'submit')
    })
  })

  describe('Input Behavior', () => {
    it('should handle different name formats', async () => {
      mockFetch({ message: 'User created successfully' })

      render(<SignUpPage />)

      const nameInput = screen.getByPlaceholderText('Full name')

      // Test single name
      fireEvent.change(nameInput, { target: { value: 'John' } })
      expect(nameInput).toHaveValue('John')

      // Test name with spaces
      fireEvent.change(nameInput, { target: { value: 'John Doe' } })
      expect(nameInput).toHaveValue('John Doe')

      // Test name with special characters
      fireEvent.change(nameInput, { target: { value: 'John-Doe Smith' } })
      expect(nameInput).toHaveValue('John-Doe Smith')
    })

    it('should handle email format validation at input level', () => {
      render(<SignUpPage />)

      const emailInput = screen.getByPlaceholderText('Email address')

      expect(emailInput).toHaveAttribute('type', 'email')

      // Enter various email formats
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
      expect(emailInput).toHaveValue('test@example.com')

      fireEvent.change(emailInput, { target: { value: 'user.name+tag@domain.co.uk' } })
      expect(emailInput).toHaveValue('user.name+tag@domain.co.uk')
    })
  })

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      render(<SignUpPage />)

      const mainHeading = screen.getByRole('heading', { level: 2 })
      expect(mainHeading).toHaveTextContent('Create your account')
    })

    it('should have proper form labels and associations', () => {
      render(<SignUpPage />)

      const nameInput = screen.getByPlaceholderText('Full name')
      const emailInput = screen.getByPlaceholderText('Email address')
      const passwordInput = screen.getByPlaceholderText(/Password \(min 6 characters\)/i)
      const confirmPasswordInput = screen.getByPlaceholderText('Confirm password')

      expect(nameInput).toHaveAttribute('id')
      expect(emailInput).toHaveAttribute('id')
      expect(passwordInput).toHaveAttribute('id')
      expect(confirmPasswordInput).toHaveAttribute('id')

      expect(nameInput.labels?.length).toBeGreaterThan(0)
      expect(emailInput.labels?.length).toBeGreaterThan(0)
      expect(passwordInput.labels?.length).toBeGreaterThan(0)
      expect(confirmPasswordInput.labels?.length).toBeGreaterThan(0)
    })

    it('should support keyboard navigation', async () => {
      render(<SignUpPage />)

      const nameInput = screen.getByPlaceholderText('Full name')
      const emailInput = screen.getByPlaceholderText('Email address')
      const passwordInput = screen.getByPlaceholderText(/Password \(min 6 characters\)/i)
      const confirmPasswordInput = screen.getByPlaceholderText('Confirm password')
      const submitButton = screen.getByRole('button', { name: 'Create account' })

      // Test tab navigation
      nameInput.focus()
      expect(nameInput).toHaveFocus()

      fireEvent.keyDown(nameInput, { key: 'Tab' })
      expect(emailInput).toHaveFocus()

      fireEvent.keyDown(emailInput, { key: 'Tab' })
      expect(passwordInput).toHaveFocus()

      fireEvent.keyDown(passwordInput, { key: 'Tab' })
      expect(confirmPasswordInput).toHaveFocus()

      fireEvent.keyDown(confirmPasswordInput, { key: 'Tab' })
      expect(submitButton).toHaveFocus()
    })

    it('should handle form submission with enter key', async () => {
      mockFetch({ message: 'User created successfully' })

      render(<SignUpPage />)

      await fillForm({
        'Full name': 'Test User',
        'Email address': 'test@example.com',
        'Password (min 6 characters)': 'password123',
        'Confirm password': 'password123'
      }, screen)

      const form = screen.getByRole('button', { name: 'Create account' }).closest('form')

      await act(async () => {
        fireEvent.submit(form)
      })

      await vi.runAllTimersAsync()

      expect(global.fetch).toHaveBeenCalledWith('/api/auth/signup', expect.objectContaining({
        method: 'POST'
      }))
    })

    it('should have proper link accessibility', () => {
      render(<SignUpPage />)

      const signInLink = screen.getByText(/sign in to your existing account/i)
      expect(signInLink).toHaveAttribute('href', '/auth/signin')
      expect(signInLink).toHaveClass('font-medium', 'text-indigo-600', 'hover:text-indigo-500')
    })
  })

  describe('Component Behavior', () => {
    it('should handle rapid form submissions', async () => {
      mockFetch({ message: 'User created successfully' })

      render(<SignUpPage />)

      await fillForm({
        'Full name': 'Test User',
        'Email address': 'test@example.com',
        'Password (min 6 characters)': 'password123',
        'Confirm password': 'password123'
      }, screen)

      const submitButton = screen.getByRole('button', { name: 'Create account' })

      // Rapid clicks
      fireEvent.click(submitButton)
      fireEvent.click(submitButton)
      fireEvent.click(submitButton)

      await vi.runAllTimersAsync()

      // Should only submit once due to loading state
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('should not submit when button is disabled', async () => {
      let resolveFetch
      global.fetch = vi.fn().mockReturnValueOnce(new Promise(resolve => {
        resolveFetch = resolve
      }))

      render(<SignUpPage />)

      await fillForm({
        'Full name': 'Test User',
        'Email address': 'test@example.com',
        'Password (min 6 characters)': 'password123',
        'Confirm password': 'password123'
      }, screen)

      const submitButton = screen.getByRole('button', { name: 'Create account' })

      // Start submission to disable button
      await act(async () => {
        fireEvent.click(submitButton)
      })

      // Try to click again while disabled
      fireEvent.click(submitButton)

      // Should only have been called once
      expect(global.fetch).toHaveBeenCalledTimes(1)

      // Resolve the promise
      await act(async () => {
        resolveFetch({
          ok: true,
          json: async () => ({ message: 'User created successfully' })
        })
      })

      await vi.runAllTimersAsync()
    })
  })
})