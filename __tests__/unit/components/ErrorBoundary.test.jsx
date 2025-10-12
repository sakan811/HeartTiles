import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import ErrorBoundary from '../../../src/components/ErrorBoundary'

// Mock console.error to avoid noise in tests
const originalConsoleError = console.error

describe('ErrorBoundary Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    console.error = vi.fn()
  })

  afterEach(() => {
    console.error = originalConsoleError
  })

  describe('Normal Operation', () => {
    it('should render children when no error occurs', () => {
      const TestComponent = () => <div>Test Content</div>

      render(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      )

      expect(screen.getByText('Test Content')).toBeInTheDocument()
      expect(screen.queryByText(/Oops! Something went wrong/)).not.toBeInTheDocument()
    })

    it('should render nested children correctly', () => {
      const TestComponent = () => (
        <div>
          <h1>Title</h1>
          <p>Content</p>
        </div>
      )

      render(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      )

      expect(screen.getByText('Title')).toBeInTheDocument()
      expect(screen.getByText('Content')).toBeInTheDocument()
    })

    it('should work with multiple children', () => {
      render(
        <ErrorBoundary>
          <div>Child 1</div>
          <div>Child 2</div>
          <div>Child 3</div>
        </ErrorBoundary>
      )

      expect(screen.getByText('Child 1')).toBeInTheDocument()
      expect(screen.getByText('Child 2')).toBeInTheDocument()
      expect(screen.getByText('Child 3')).toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('should catch and render error UI when component throws an error', () => {
      const ThrowErrorComponent = () => {
        throw new Error('Test error message')
      }

      render(
        <ErrorBoundary>
          <ThrowErrorComponent />
        </ErrorBoundary>
      )

      expect(screen.getByText('Oops! Something went wrong')).toBeInTheDocument()
      expect(screen.getByText('Test error message')).toBeInTheDocument()
      expect(screen.getByText('😵')).toBeInTheDocument()
    })

    it('should render fallback UI when custom fallback is provided', () => {
      const ThrowErrorComponent = () => {
        throw new Error('Test error')
      }

      const CustomFallback = <div>Custom Error Fallback</div>

      render(
        <ErrorBoundary fallback={CustomFallback}>
          <ThrowErrorComponent />
        </ErrorBoundary>
      )

      expect(screen.getByText('Custom Error Fallback')).toBeInTheDocument()
      expect(screen.queryByText(/Oops! Something went wrong/)).not.toBeInTheDocument()
    })

    it('should render default error message when error has no message', () => {
      const ThrowErrorComponent = () => {
        const error = new Error()
        delete error.message
        throw error
      }

      render(
        <ErrorBoundary>
          <ThrowErrorComponent />
        </ErrorBoundary>
      )

      expect(screen.getByText('An unexpected error occurred in the game.')).toBeInTheDocument()
    })

    it('should log error to console when caught', () => {
      const ThrowErrorComponent = () => {
        throw new Error('Test error message')
      }

      render(
        <ErrorBoundary>
          <ThrowErrorComponent />
        </ErrorBoundary>
      )

      expect(console.error).toHaveBeenCalledWith(
        'Game Error Boundary caught an error:',
        expect.any(Error),
        expect.objectContaining({
          componentStack: expect.any(String)
        })
      )
    })
  })

  describe('Error Recovery', () => {
    beforeEach(() => {
      // Mock window.location.reload
      Object.defineProperty(window, 'location', {
        value: {
          reload: vi.fn()
        },
        writable: true
      })
    })

    it('should reload page when reload button is clicked', () => {
      const ThrowErrorComponent = () => {
        throw new Error('Test error message')
      }

      render(
        <ErrorBoundary>
          <ThrowErrorComponent />
        </ErrorBoundary>
      )

      const reloadButton = screen.getByText('Reload Game')
      fireEvent.click(reloadButton)

      expect(window.location.reload).toHaveBeenCalled()
    })

    it('should reset error state when reload button is clicked', () => {
      const ThrowErrorComponent = () => {
        throw new Error('Test error message')
      }

      const { rerender } = render(
        <ErrorBoundary>
          <ThrowErrorComponent />
        </ErrorBoundary>
      )

      // Verify error state is set
      expect(screen.getByText('Oops! Something went wrong')).toBeInTheDocument()

      // Click reload button
      const reloadButton = screen.getByText('Reload Game')
      fireEvent.click(reloadButton)

      // The component should reset its state, but since we're calling window.location.reload(),
      // we can't easily test the state reset without more complex mocking
      expect(window.location.reload).toHaveBeenCalled()
    })
  })

  describe('Static Methods', () => {
    it('should have getDerivedStateFromError static method', () => {
      expect(typeof ErrorBoundary.getDerivedStateFromError).toBe('function')
    })

    it('should return error state when getDerivedStateFromError is called', () => {
      const error = new Error('Test error')
      const result = ErrorBoundary.getDerivedStateFromError(error)

      expect(result).toEqual({
        hasError: true,
        error: error
      })
    })

    it('should have componentDidCatch method', () => {
      const errorBoundary = new ErrorBoundary({ children: null })
      expect(typeof errorBoundary.componentDidCatch).toBe('function')
    })

    it('should call componentDidCatch when error occurs', () => {
      const ThrowErrorComponent = () => {
        throw new Error('Test error message')
      }

      render(
        <ErrorBoundary>
          <ThrowErrorComponent />
        </ErrorBoundary>
      )

      expect(console.error).toHaveBeenCalledWith(
        'Game Error Boundary caught an error:',
        expect.any(Error),
        expect.any(Object)
      )
    })
  })

  describe('Component Structure', () => {
    it('should render error UI with correct CSS classes', () => {
      const ThrowErrorComponent = () => {
        throw new Error('Test error message')
      }

      render(
        <ErrorBoundary>
          <ThrowErrorComponent />
        </ErrorBoundary>
      )

      const errorContainer = screen.getByText('Oops! Something went wrong').closest('div')
      expect(errorContainer).toHaveClass('text-2xl', 'font-bold', 'text-white')

      const mainContainer = screen.getByText('😵').closest('div')
      expect(mainContainer).toHaveClass(
        'min-h-screen',
        'flex',
        'items-center',
        'justify-center',
        'bg-gradient-to-br',
        'from-red-900',
        'via-red-800',
        'to-red-700'
      )
    })

    it('should render reload button with correct styling', () => {
      const ThrowErrorComponent = () => {
        throw new Error('Test error message')
      }

      render(
        <ErrorBoundary>
          <ThrowErrorComponent />
        </ErrorBoundary>
      )

      const reloadButton = screen.getByText('Reload Game')
      expect(reloadButton).toHaveClass(
        'bg-red-600',
        'hover:bg-red-700',
        'text-white',
        'font-bold',
        'py-2',
        'px-4',
        'rounded-lg',
        'transition-colors'
      )
    })

    it('should display error emoji', () => {
      const ThrowErrorComponent = () => {
        throw new Error('Test error message')
      }

      render(
        <ErrorBoundary>
          <ThrowErrorComponent />
        </ErrorBoundary>
      )

      expect(screen.getByText('😵')).toBeInTheDocument()
      const emojiElement = screen.getByText('😵')
      expect(emojiElement).toHaveClass('text-6xl')
    })
  })

  describe('Edge Cases', () => {
    it('should handle null children gracefully', () => {
      expect(() => {
        render(
          <ErrorBoundary>
            {null}
          </ErrorBoundary>
        )
      }).not.toThrow()
    })

    it('should handle undefined children gracefully', () => {
      expect(() => {
        render(
          <ErrorBoundary>
            {undefined}
          </ErrorBoundary>
        )
      }).not.toThrow()
    })

    it('should handle empty string children', () => {
      render(
        <ErrorBoundary>
          {''}
        </ErrorBoundary>
      )

      expect(screen.queryByText(/Oops! Something went wrong/)).not.toBeInTheDocument()
    })

    it('should handle multiple errors in sequence', () => {
      const ThrowErrorComponent = ({ errorCount }) => {
        if (errorCount > 0) {
          throw new Error(`Error ${errorCount}`)
        }
        return <div>No Error</div>
      }

      const { rerender } = render(
        <ErrorBoundary>
          <ThrowErrorComponent errorCount={1} />
        </ErrorBoundary>
      )

      expect(screen.getByText('Error 1')).toBeInTheDocument()

      // Simulate reset and new error
      Object.defineProperty(window, 'location', {
        value: { reload: vi.fn() },
        writable: true
      })

      const reloadButton = screen.getByText('Reload Game')
      fireEvent.click(reloadButton)

      // After reset, try to render a new component that throws
      rerender(
        <ErrorBoundary>
          <ThrowErrorComponent errorCount={2} />
        </ErrorBoundary>
      )

      expect(window.location.reload).toHaveBeenCalled()
    })
  })

  describe('Component Lifecycle', () => {
    it('should initialize with correct default state', () => {
      const errorBoundary = new ErrorBoundary({ children: <div>Test</div> })
      expect(errorBoundary.state.hasError).toBe(false)
      expect(errorBoundary.state.error).toBeUndefined()
    })

    it('should accept fallback prop', () => {
      const customFallback = <div>Custom Fallback</div>
      const errorBoundary = new ErrorBoundary({
        children: <div>Test</div>,
        fallback: customFallback
      })
      expect(errorBoundary.props.fallback).toBe(customFallback)
    })

    it('should handle missing optional props', () => {
      const errorBoundary = new ErrorBoundary({ children: <div>Test</div> })
      expect(errorBoundary.props.fallback).toBeUndefined()
    })
  })
})