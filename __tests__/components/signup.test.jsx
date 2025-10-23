import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SignUpPage from '../../src/app/auth/signup/page.js'

// Import test utilities
import {
  createMockRouter,
  expectElementToBeVisible,
  expectButtonToBeDisabled,
  expectButtonToBeEnabled,
  expectLinkToHaveHref,
  mockFetch,
  mockFetchError,
  createMockSignUpResponse
} from './../unit/utils/test-utils.jsx'

// Mock next/navigation
const mockRouter = createMockRouter()
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter
}))

describe('Sign Up Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRouter.push.mockClear()
    // Reset fetch mock
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Component Imports and Structure (lines 3-8)
  describe('Component Imports and Structure', () => {
    it('should import and use React hooks correctly', () => {
      render(<SignUpPage />)

      // Verify component renders correctly with hooks
      expect(screen.getByText('Create your account')).toBeTruthy()
    })

    it('should use useRouter hook correctly', () => {
      render(<SignUpPage />)

      // Component should render without errors, indicating useRouter is working
      expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument()
    })

    it('should render Link component correctly', () => {
      render(<SignUpPage />)

      const signInLink = screen.getByText(/sign in to your existing account/i)
      expect(signInLink).toBeTruthy()
      expect(signInLink.closest('a')).toHaveAttribute('href', '/auth/signin')
    })
  })

  // State Management (lines 9-15)
  describe('State Management', () => {
    it('should initialize all state variables correctly', () => {
      render(<SignUpPage />)

      // Check initial state values through form inputs
      const nameInput = screen.getByLabelText(/Full name/i)
      const emailInput = screen.getByLabelText(/Email address/i)
      const passwordInput = screen.getByPlaceholderText('Password (min 6 characters)')
      const confirmPasswordInput = screen.getByPlaceholderText('Confirm password')

      expect(nameInput).toHaveValue('')
      expect(emailInput).toHaveValue('')
      expect(passwordInput).toHaveValue('')
      expect(confirmPasswordInput).toHaveValue('')

      // Check no error message is initially displayed
      expect(screen.queryByText(/Passwords do not match/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Password must be at least 6 characters long/i)).not.toBeInTheDocument()

      // Check button is not in loading state
      expect(screen.getByRole('button', { name: 'Create account' })).not.toBeDisabled()
      expect(screen.getByText('Create account')).toBeInTheDocument()
    })

    it('should update name state when input changes', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      const nameInput = screen.getByLabelText(/Full name/i)
      await user.type(nameInput, 'John Doe')

      expect(nameInput).toHaveValue('John Doe')
    })

    it('should update email state when input changes', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      const emailInput = screen.getByLabelText(/Email address/i)
      await user.type(emailInput, 'john@example.com')

      expect(emailInput).toHaveValue('john@example.com')
    })

    it('should update password state when input changes', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      const passwordInput = screen.getByPlaceholderText('Password (min 6 characters)')
      await user.type(passwordInput, 'password123')

      expect(passwordInput).toHaveValue('password123')
    })

    it('should update confirmPassword state when input changes', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      const confirmPasswordInput = screen.getByPlaceholderText('Confirm password')
      await user.type(confirmPasswordInput, 'password123')

      expect(confirmPasswordInput).toHaveValue('password123')
    })
  })

  // Form Submit Handler (lines 17-59)
  describe('Form Submit Handler', () => {
    it('should prevent default form submission', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      const form = screen.getByRole('button', { name: 'Create account' }).closest('form')
      const preventDefault = vi.fn()

      // Create a mock submit event
      const submitEvent = new Event('submit', { cancelable: true })
      Object.defineProperty(submitEvent, 'preventDefault', { value: preventDefault })

      if (form) {
        form.dispatchEvent(submitEvent)
      }

      // Test that the handler is working (indirectly through successful submission)
      await user.type(screen.getByLabelText(/Full name/i), 'John Doe')
      await user.type(screen.getByLabelText(/Email address/i), 'john@example.com')
      await user.type(screen.getByPlaceholderText('Password (min 6 characters)'), 'password123')
      await user.type(screen.getByPlaceholderText('Confirm password'), 'password123')

      const mockResponse = createMockSignUpResponse()
      mockFetch(mockResponse)

      await user.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
      }, { container: document.body })
    })

    // Form validation - password match (lines 22-26)
    it('should show error when passwords do not match', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      await user.type(screen.getByLabelText(/Full name/i), 'John Doe')
      await user.type(screen.getByLabelText(/Email address/i), 'john@example.com')
      await user.type(screen.getByPlaceholderText('Password (min 6 characters)'), 'password123')
      await user.type(screen.getByPlaceholderText('Confirm password'), 'differentpassword')

      await user.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        const errorMessage = screen.getByText('Passwords do not match')
        expect(errorMessage).toBeInTheDocument()
        expect(errorMessage).toHaveClass('text-sm', 'text-red-700')

        const errorContainer = errorMessage.closest('div')?.parentElement
        expect(errorContainer).toHaveClass(
          'rounded-md',
          'bg-red-50',
          'p-4'
        )
      }, { container: document.body })

      // Should not call API
      expect(global.fetch).not.toHaveBeenCalled()
    })

    // Form validation - password length (lines 28-32)
    it('should show error when password is too short', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      await user.type(screen.getByLabelText(/Full name/i), 'John Doe')
      await user.type(screen.getByLabelText(/Email address/i), 'john@example.com')
      await user.type(screen.getByPlaceholderText('Password (min 6 characters)'), '123')
      await user.type(screen.getByPlaceholderText('Confirm password'), '123')

      await user.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        const errorMessage = screen.getByText('Password must be at least 6 characters long')
        expect(errorMessage).toBeInTheDocument()
        expect(errorMessage).toHaveClass('text-sm', 'text-red-700')

        const errorContainer = errorMessage.closest('div')?.parentElement
        expect(errorContainer).toHaveClass(
          'rounded-md',
          'bg-red-50',
          'p-4'
        )
      }, { container: document.body })

      // Should not call API
      expect(global.fetch).not.toHaveBeenCalled()
    })

    // API call success (lines 34-53)
    it('should call signup API with correct data and redirect on success', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      const mockResponse = createMockSignUpResponse()
      mockFetch(mockResponse)

      await user.type(screen.getByLabelText(/Full name/i), '  John Doe  ')
      await user.type(screen.getByLabelText(/Email address/i), '  john@example.com  ')
      await user.type(screen.getByPlaceholderText('Password (min 6 characters)'), 'password123')
      await user.type(screen.getByPlaceholderText('Confirm password'), 'password123')

      await user.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/auth/signup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'John Doe', // Should be trimmed
            email: 'john@example.com', // Should be trimmed
            password: 'password123'
          })
        })
      }, { container: document.body })

      expect(mockRouter.push).toHaveBeenCalledWith('/auth/signin?message=Account created successfully')
    })

    // API call error handling (lines 49-50)
    it('should show error message when API returns error', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      mockFetch({ error: 'Email already exists' }, false, 400)

      await user.type(screen.getByLabelText(/Full name/i), 'John Doe')
      await user.type(screen.getByLabelText(/Email address/i), 'existing@example.com')
      await user.type(screen.getByPlaceholderText('Password (min 6 characters)'), 'password123')
      await user.type(screen.getByPlaceholderText('Confirm password'), 'password123')

      await user.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(screen.getByText('Email already exists')).toBeInTheDocument()
      }, { container: document.body })

      expect(mockRouter.push).not.toHaveBeenCalled()
    })

    // API call with default error message (line 50)
    it('should show default error message when API returns no specific error', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      mockFetch({}, false, 400)

      await user.type(screen.getByLabelText(/Full name/i), 'John Doe')
      await user.type(screen.getByLabelText(/Email address/i), 'john@example.com')
      await user.type(screen.getByPlaceholderText('Password (min 6 characters)'), 'password123')
      await user.type(screen.getByPlaceholderText('Confirm password'), 'password123')

      await user.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(screen.getByText('An error occurred during signup')).toBeInTheDocument()
      }, { container: document.body })
    })

    // Network error handling (lines 54-56)
    it('should show network error message when fetch fails', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      mockFetchError('Network error')

      await user.type(screen.getByLabelText(/Full name/i), 'John Doe')
      await user.type(screen.getByLabelText(/Email address/i), 'john@example.com')
      await user.type(screen.getByPlaceholderText('Password (min 6 characters)'), 'password123')
      await user.type(screen.getByPlaceholderText('Confirm password'), 'password123')

      await user.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(screen.getByText('An error occurred. Please try again.')).toBeInTheDocument()
      }, { container: document.body })
    })

    // Loading state management (lines 19, 24, 30, 57)
    it('should manage loading state correctly during submission', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      // Create a promise that we can control
      let resolveFetch
      const fetchPromise = new Promise(resolve => {
        resolveFetch = resolve
      })

      global.fetch = vi.fn().mockReturnValue(fetchPromise)

      await user.type(screen.getByLabelText(/Full name/i), 'John Doe')
      await user.type(screen.getByLabelText(/Email address/i), 'john@example.com')
      await user.type(screen.getByPlaceholderText('Password (min 6 characters)'), 'password123')
      await user.type(screen.getByPlaceholderText('Confirm password'), 'password123')

      const submitButton = screen.getByRole('button', { name: 'Create account' })

      // Start submission
      await user.click(submitButton)

      // Should show loading state
      expect(screen.getByText('Creating account...')).toBeInTheDocument()
      expectButtonToBeDisabled(submitButton)

      // Resolve the fetch promise
      await act(async () => {
        resolveFetch({
          ok: true,
          json: () => Promise.resolve(createMockSignUpResponse())
        })
      })

      // Should clear loading state
      await waitFor(() => {
        expect(screen.queryByText('Creating account...')).not.toBeInTheDocument()
        expectButtonToBeEnabled(submitButton)
      }, { container: document.body })
    })

    // Clear error on new submission (line 20)
    it('should clear previous error on new submission attempt', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      // First, trigger a validation error
      await user.type(screen.getByLabelText(/Full name/i), 'John Doe')
      await user.type(screen.getByLabelText(/Email address/i), 'john@example.com')
      await user.type(screen.getByPlaceholderText('Password (min 6 characters)'), '123')
      await user.type(screen.getByPlaceholderText('Confirm password'), '123')

      await user.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(screen.getByText('Password must be at least 6 characters long')).toBeInTheDocument()
      }, { container: document.body })

      // Now submit with valid data
      mockFetch(createMockSignUpResponse())

      await user.clear(screen.getByPlaceholderText('Password (min 6 characters)'))
      await user.clear(screen.getByPlaceholderText('Confirm password'))
      await user.type(screen.getByPlaceholderText('Password (min 6 characters)'), 'password123')
      await user.type(screen.getByPlaceholderText('Confirm password'), 'password123')

      await user.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(screen.queryByText('Password must be at least 6 characters long')).not.toBeInTheDocument()
      }, { container: document.body })
    })
  })

  // Component Rendering (lines 61-161)
  describe('Component Rendering', () => {
    it('should render the page with correct structure', () => {
      render(<SignUpPage />)

      // Main container
      const mainContainer = screen.getByText('Create your account').closest('div')?.parentElement?.parentElement
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

      // Form container
      const formContainer = mainContainer?.querySelector('.max-w-md')
      expect(formContainer).toHaveClass('max-w-md', 'w-full', 'space-y-8')
    })

    it('should render page title and subtitle', () => {
      render(<SignUpPage />)

      expectElementToBeVisible(screen.getByRole('heading', { name: 'Create your account' }))
      expectElementToBeVisible(screen.getByText('Or'))
      expectElementToBeVisible(screen.getByText(/sign in to your existing account/i))
    })

    it('should render all form inputs with correct attributes', () => {
      render(<SignUpPage />)

      // Name input
      const nameInput = screen.getByLabelText(/Full name/i)
      expect(nameInput).toHaveAttribute('type', 'text')
      expect(nameInput).toHaveAttribute('name', 'name')
      expect(nameInput).toHaveAttribute('autoComplete', 'name')
      expect(nameInput).toHaveAttribute('required')
      expect(nameInput).toHaveAttribute('placeholder', 'Full name')
      expect(nameInput).toHaveAttribute('id', 'name')

      // Email input
      const emailInput = screen.getByLabelText(/Email address/i)
      expect(emailInput).toHaveAttribute('type', 'email')
      expect(emailInput).toHaveAttribute('name', 'email')
      expect(emailInput).toHaveAttribute('autoComplete', 'email')
      expect(emailInput).toHaveAttribute('required')
      expect(emailInput).toHaveAttribute('placeholder', 'Email address')
      expect(emailInput).toHaveAttribute('id', 'email-address')

      // Password input
      const passwordInput = screen.getByPlaceholderText('Password (min 6 characters)')
      expect(passwordInput).toHaveAttribute('type', 'password')
      expect(passwordInput).toHaveAttribute('name', 'password')
      expect(passwordInput).toHaveAttribute('autoComplete', 'new-password')
      expect(passwordInput).toHaveAttribute('required')
      expect(passwordInput).toHaveAttribute('placeholder', 'Password (min 6 characters)')
      expect(passwordInput).toHaveAttribute('id', 'password')

      // Confirm password input
      const confirmPasswordInput = screen.getByPlaceholderText('Confirm password')
      expect(confirmPasswordInput).toHaveAttribute('type', 'password')
      expect(confirmPasswordInput).toHaveAttribute('name', 'confirmPassword')
      expect(confirmPasswordInput).toHaveAttribute('autoComplete', 'new-password')
      expect(confirmPasswordInput).toHaveAttribute('required')
      expect(confirmPasswordInput).toHaveAttribute('placeholder', 'Confirm password')
      expect(confirmPasswordInput).toHaveAttribute('id', 'confirm-password')
    })

    it('should render inputs with correct styling classes', () => {
      render(<SignUpPage />)

      const inputs = [
        screen.getByLabelText(/Full name/i),
        screen.getByLabelText(/Email address/i),
        screen.getByPlaceholderText('Password (min 6 characters)'),
        screen.getByPlaceholderText('Confirm password')
      ]

      inputs.forEach(input => {
        expect(input).toHaveClass(
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
      })
    })

    it('should render screen reader only labels', () => {
      render(<SignUpPage />)

      const nameLabel = screen.getByLabelText(/Full name/i).previousElementSibling
      const emailLabel = screen.getByLabelText(/Email address/i).previousElementSibling
      const passwordLabel = screen.getByPlaceholderText('Password (min 6 characters)').previousElementSibling
      const confirmPasswordLabel = screen.getByPlaceholderText('Confirm password').previousElementSibling

      expect(nameLabel).toHaveClass('sr-only')
      expect(emailLabel).toHaveClass('sr-only')
      expect(passwordLabel).toHaveClass('sr-only')
      expect(confirmPasswordLabel).toHaveClass('sr-only')
    })

    it('should render submit button with correct attributes and styling', () => {
      render(<SignUpPage />)

      const submitButton = screen.getByRole('button', { name: 'Create account' })

      expect(submitButton).toHaveAttribute('type', 'submit')
      expect(submitButton).not.toHaveAttribute('disabled')
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

    it('should render signin link with correct attributes', () => {
      render(<SignUpPage />)

      const signInLink = screen.getByText(/sign in to your existing account/i)

      expect(signInLink).toHaveAttribute('href', '/auth/signin')
      expect(signInLink).toHaveClass('font-medium', 'text-indigo-600', 'hover:text-indigo-500')
    })

    it('should render responsive design classes correctly', () => {
      render(<SignUpPage />)

      const pageContainer = screen.getByRole('heading', { name: 'Create your account' }).closest('div')?.parentElement?.parentElement
      expect(pageContainer).toHaveClass('px-4', 'sm:px-6', 'lg:px-8')
    })

    it('should not show error message initially', () => {
      render(<SignUpPage />)

      expect(screen.queryByText(/Passwords do not match/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Password must be at least 6 characters long/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/An error occurred/i)).not.toBeInTheDocument()
    })

    it('should show error message container when error exists', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      // Trigger validation error
      await user.type(screen.getByLabelText(/Full name/i), 'John Doe')
      await user.type(screen.getByLabelText(/Email address/i), 'john@example.com')
      await user.type(screen.getByPlaceholderText('Password (min 6 characters)'), '123')
      await user.type(screen.getByPlaceholderText('Confirm password'), '456')

      await user.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        const errorContainer = screen.getByText('Passwords do not match').closest('div')?.parentElement
        expect(errorContainer).toHaveClass('rounded-md', 'bg-red-50', 'p-4')

        const errorText = screen.getByText('Passwords do not match')
        expect(errorText).toHaveClass('text-sm', 'text-red-700')
      }, { container: document.body })
    })
  })

  describe('Form Interactions', () => {
    it('should handle form submission with enter key', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      mockFetch(createMockSignUpResponse())

      await user.type(screen.getByLabelText(/Full name/i), 'John Doe')
      await user.type(screen.getByLabelText(/Email address/i), 'john@example.com')
      await user.type(screen.getByPlaceholderText('Password (min 6 characters)'), 'password123')
      await user.type(screen.getByPlaceholderText('Confirm password'), 'password123')

      const form = screen.getByRole('button', { name: 'Create account' }).closest('form')

      if (form) {
        fireEvent.submit(form)
      }

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
      }, { container: document.body })
    })

    it('should handle whitespace in name and email fields', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      mockFetch(createMockSignUpResponse())

      await user.type(screen.getByLabelText(/Full name/i), '  John Doe  ')
      await user.type(screen.getByLabelText(/Email address/i), '  john@example.com  ')
      await user.type(screen.getByPlaceholderText('Password (min 6 characters)'), 'password123')
      await user.type(screen.getByPlaceholderText('Confirm password'), 'password123')

      await user.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/auth/signup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'John Doe', // Trimmed
            email: 'john@example.com', // Trimmed
            password: 'password123'
          })
        })
      }, { container: document.body })
    })

    it('should not trim password fields', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      mockFetch(createMockSignUpResponse())

      // Manually set password values with spaces to test they aren't trimmed
      const passwordInput = screen.getByPlaceholderText('Password (min 6 characters)')
      const confirmPasswordInput = screen.getByPlaceholderText('Confirm password')

      await user.clear(passwordInput)
      await user.clear(confirmPasswordInput)
      await user.type(passwordInput, ' password123 ')
      await user.type(confirmPasswordInput, ' password123 ')

      await user.clear(screen.getByLabelText(/Full name/i))
      await user.clear(screen.getByLabelText(/Email address/i))
      await user.type(screen.getByLabelText(/Full name/i), 'John Doe')
      await user.type(screen.getByLabelText(/Email address/i), 'john@example.com')

      await user.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/auth/signup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'John Doe',
            email: 'john@example.com',
            password: ' password123 ' // Not trimmed
          })
        })
      }, { container: document.body })
    })
  })

  describe('Loading States', () => {
    it('should show loading state during form submission', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      let resolveFetch
      const fetchPromise = new Promise(resolve => {
        resolveFetch = resolve
      })

      global.fetch = vi.fn().mockReturnValue(fetchPromise)

      await user.type(screen.getByLabelText(/Full name/i), 'John Doe')
      await user.type(screen.getByLabelText(/Email address/i), 'john@example.com')
      await user.type(screen.getByPlaceholderText('Password (min 6 characters)'), 'password123')
      await user.type(screen.getByPlaceholderText('Confirm password'), 'password123')

      const submitButton = screen.getByRole('button', { name: 'Create account' })

      await user.click(submitButton)

      expectElementToBeVisible(screen.getByText('Creating account...'))
      expectButtonToBeDisabled(submitButton)

      // Resolve the promise
      await act(async () => {
        resolveFetch({
          ok: true,
          json: () => Promise.resolve(createMockSignUpResponse())
        })
      })
    })

    it('should clear loading state after successful submission', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      mockFetch(createMockSignUpResponse())

      await user.type(screen.getByLabelText(/Full name/i), 'John Doe')
      await user.type(screen.getByLabelText(/Email address/i), 'john@example.com')
      await user.type(screen.getByPlaceholderText('Password (min 6 characters)'), 'password123')
      await user.type(screen.getByPlaceholderText('Confirm password'), 'password123')

      await user.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(screen.queryByText('Creating account...')).not.toBeInTheDocument()
        expectButtonToBeEnabled(screen.getByRole('button', { name: 'Create account' }))
      }, { container: document.body })
    })

    it('should clear loading state after validation error', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      await user.type(screen.getByLabelText(/Full name/i), 'John Doe')
      await user.type(screen.getByLabelText(/Email address/i), 'john@example.com')
      await user.type(screen.getByPlaceholderText('Password (min 6 characters)'), '123')
      await user.type(screen.getByPlaceholderText('Confirm password'), '123')

      await user.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(screen.queryByText('Creating account...')).not.toBeInTheDocument()
        expectButtonToBeEnabled(screen.getByRole('button', { name: 'Create account' }))
      }, { container: document.body })
    })

    it('should clear loading state after API error', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      mockFetch({ error: 'API Error' }, false, 400)

      await user.type(screen.getByLabelText(/Full name/i), 'John Doe')
      await user.type(screen.getByLabelText(/Email address/i), 'john@example.com')
      await user.type(screen.getByPlaceholderText('Password (min 6 characters)'), 'password123')
      await user.type(screen.getByPlaceholderText('Confirm password'), 'password123')

      await user.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(screen.queryByText('Creating account...')).not.toBeInTheDocument()
        expectButtonToBeEnabled(screen.getByRole('button', { name: 'Create account' }))
      }, { container: document.body })
    })
  })

  describe('Error Scenarios', () => {
    it('should handle empty form submission with HTML5 validation', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      const submitButton = screen.getByRole('button', { name: 'Create account' })

      // HTML5 required validation should prevent submission
      await user.click(submitButton)

      // Should not call API due to HTML5 validation
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('should handle rapid form submissions correctly', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      let resolveFetch
      const fetchPromise = new Promise(resolve => {
        resolveFetch = resolve
      })

      global.fetch = vi.fn().mockReturnValue(fetchPromise)

      await user.type(screen.getByLabelText(/Full name/i), 'John Doe')
      await user.type(screen.getByLabelText(/Email address/i), 'john@example.com')
      await user.type(screen.getByPlaceholderText('Password (min 6 characters)'), 'password123')
      await user.type(screen.getByPlaceholderText('Confirm password'), 'password123')

      const submitButton = screen.getByRole('button', { name: 'Create account' })

      // Rapid clicks
      await user.click(submitButton)
      await user.click(submitButton)
      await user.click(submitButton)

      // Should only call API once due to loading state
      expect(global.fetch).toHaveBeenCalledTimes(1)

      // Resolve the promise
      await act(async () => {
        resolveFetch({
          ok: true,
          json: () => Promise.resolve(createMockSignUpResponse())
        })
      })
    })

    it('should handle network errors gracefully', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      global.fetch = vi.fn().mockRejectedValue(new Error('Network connection failed'))

      await user.type(screen.getByLabelText(/Full name/i), 'John Doe')
      await user.type(screen.getByLabelText(/Email address/i), 'john@example.com')
      await user.type(screen.getByPlaceholderText('Password (min 6 characters)'), 'password123')
      await user.type(screen.getByPlaceholderText('Confirm password'), 'password123')

      await user.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(screen.getByText('An error occurred. Please try again.')).toBeInTheDocument()
      }, { container: document.body })
    })
  })

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      render(<SignUpPage />)

      const mainHeading = screen.getByRole('heading', { name: 'Create your account' })
      expect(mainHeading).toBeInTheDocument()
      expect(mainHeading).toHaveClass('text-3xl', 'font-extrabold', 'text-gray-900')
    })

    it('should have proper form labels and associations', () => {
      render(<SignUpPage />)

      const nameInput = screen.getByLabelText(/Full name/i)
      const emailInput = screen.getByLabelText(/Email address/i)
      const passwordInput = screen.getByPlaceholderText('Password (min 6 characters)')
      const confirmPasswordInput = screen.getByPlaceholderText('Confirm password')

      expect(nameInput).toHaveAccessibleName()
      expect(emailInput).toHaveAccessibleName()
      expect(passwordInput).toHaveAccessibleName()
      expect(confirmPasswordInput).toHaveAccessibleName()

      expect(nameInput).toHaveAttribute('id', 'name')
      expect(emailInput).toHaveAttribute('id', 'email-address')
      expect(passwordInput).toHaveAttribute('id', 'password')
      expect(confirmPasswordInput).toHaveAttribute('id', 'confirm-password')
    })

    it('should support keyboard navigation', async () => {
      render(<SignUpPage />)

      const nameInput = screen.getByLabelText(/Full name/i)
      const emailInput = screen.getByLabelText(/Email address/i)
      const passwordInput = screen.getByPlaceholderText('Password (min 6 characters)')
      const confirmPasswordInput = screen.getByPlaceholderText('Confirm password')
      const submitButton = screen.getByRole('button', { name: 'Create account' })

      // Test that inputs can receive focus
      nameInput.focus()
      expect(nameInput).toHaveFocus()

      emailInput.focus()
      expect(emailInput).toHaveFocus()

      passwordInput.focus()
      expect(passwordInput).toHaveFocus()

      confirmPasswordInput.focus()
      expect(confirmPasswordInput).toHaveFocus()

      submitButton.focus()
      expect(submitButton).toHaveFocus()
    })

    it('should have proper button accessibility', () => {
      render(<SignUpPage />)

      const submitButton = screen.getByRole('button', { name: 'Create account' })
      expect(submitButton).toHaveAttribute('type', 'submit')
    })

    it('should have proper link accessibility', () => {
      render(<SignUpPage />)

      const signInLink = screen.getByText(/sign in to your existing account/i)
      expect(signInLink).toHaveAttribute('href', '/auth/signin')
      expect(signInLink).toHaveClass('font-medium', 'text-indigo-600', 'hover:text-indigo-500')
    })

    it('should have proper error message accessibility when displayed', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      // Trigger validation error
      await user.type(screen.getByLabelText(/Full name/i), 'John Doe')
      await user.type(screen.getByLabelText(/Email address/i), 'john@example.com')
      await user.type(screen.getByPlaceholderText('Password (min 6 characters)'), '123')
      await user.type(screen.getByPlaceholderText('Confirm password'), '456')

      await user.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        const errorMessage = screen.getByText('Passwords do not match')
        expect(errorMessage).toBeInTheDocument()
        expect(errorMessage).toHaveClass('text-sm', 'text-red-700')

        const errorContainer = errorMessage.closest('div')?.parentElement
        expect(errorContainer).toHaveClass('rounded-md', 'bg-red-50', 'p-4')
      }, { container: document.body })
    })
  })

  describe('Component Behavior', () => {
    it('should not submit form when button is disabled', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      let resolveFetch
      const fetchPromise = new Promise(resolve => {
        resolveFetch = resolve
      })

      global.fetch = vi.fn().mockReturnValue(fetchPromise)

      await user.type(screen.getByLabelText(/Full name/i), 'John Doe')
      await user.type(screen.getByLabelText(/Email address/i), 'john@example.com')
      await user.type(screen.getByPlaceholderText('Password (min 6 characters)'), 'password123')
      await user.type(screen.getByPlaceholderText('Confirm password'), 'password123')

      const submitButton = screen.getByRole('button', { name: 'Create account' })

      // Start submission to disable button
      await user.click(submitButton)

      // Try to click again while disabled
      await user.click(submitButton)

      // Should only have been called once
      expect(global.fetch).toHaveBeenCalledTimes(1)

      // Resolve the promise
      await act(async () => {
        resolveFetch({
          ok: true,
          json: () => Promise.resolve(createMockSignUpResponse())
        })
      })
    })

    it('should handle exact password length of 6 characters', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      mockFetch(createMockSignUpResponse())

      await user.type(screen.getByLabelText(/Full name/i), 'John Doe')
      await user.type(screen.getByLabelText(/Email address/i), 'john@example.com')
      await user.type(screen.getByPlaceholderText('Password (min 6 characters)'), '123456')
      await user.type(screen.getByPlaceholderText('Confirm password'), '123456')

      await user.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
        expect(screen.queryByText('Password must be at least 6 characters long')).not.toBeInTheDocument()
      }, { container: document.body })
    })

    it('should handle case where API response is not ok but no error message', async () => {
      const user = userEvent.setup()
      render(<SignUpPage />)

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({})
      })

      await user.type(screen.getByLabelText(/Full name/i), 'John Doe')
      await user.type(screen.getByLabelText(/Email address/i), 'john@example.com')
      await user.type(screen.getByPlaceholderText('Password (min 6 characters)'), 'password123')
      await user.type(screen.getByPlaceholderText('Confirm password'), 'password123')

      await user.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(screen.getByText('An error occurred during signup')).toBeInTheDocument()
      }, { container: document.body })
    })
  })
})