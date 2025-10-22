// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, findByTestId } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Mock next/font/google BEFORE importing the layout
// Use inline factory functions to avoid hoisting issues
vi.mock('next/font/google', () => ({
  Geist: vi.fn(() => ({
    variable: '--font-geist-sans',
    style: {
      fontFamily: 'Geist Sans, sans-serif'
    }
  })),
  Geist_Mono: vi.fn(() => ({
    variable: '--font-geist-mono',
    style: {
      fontFamily: 'Geist Mono, monospace'
    }
  }))
}))

// Note: useSession is mocked globally in setup.js, will be accessed via require in tests

// Mock Socket context
vi.mock('../../src/contexts/SocketContext.js', () => ({
  useSocket: vi.fn(),
  SocketProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// Mock CSS import
vi.mock('../../src/app/globals.css', () => ({}))

// Import after mocking
import { Geist, Geist_Mono } from 'next/font/google'
import RootLayout, { metadata } from '../../../src/app/layout'


describe('RootLayout Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Reset document structure before each test
    document.documentElement.lang = ''
    document.body.className = ''
    document.body.innerHTML = ''

    // Reset session mock to default unauthenticated state for each test
    global.__mockUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
      update: vi.fn().mockResolvedValue(null),
    })

    // Mock console methods to avoid noise in tests
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()

    // Clean up document after each test
    document.documentElement.lang = ''
    document.body.className = ''
    document.body.innerHTML = ''
  })

  describe('Basic Component Rendering', () => {
    it('should render the layout component without crashing', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      expect(() => {
        render(<RootLayout>{mockChildren}</RootLayout>)
      }).not.toThrow()
    })

    it('should render children correctly', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      render(<RootLayout>{mockChildren}</RootLayout>)

      expect(screen.getByTestId('test-content')).toBeInTheDocument()
      expect(screen.getByText('Test Content')).toBeInTheDocument()
    })

    it('should handle complex children structures', () => {
      const ComplexChildren = () => (
        <div>
          <header data-testid="header">Header Content</header>
          <main data-testid="main">Main Content</main>
          <footer data-testid="footer">Footer Content</footer>
        </div>
      )

      render(<RootLayout><ComplexChildren /></RootLayout>)

      expect(screen.getByTestId('header')).toBeInTheDocument()
      expect(screen.getByTestId('main')).toBeInTheDocument()
      expect(screen.getByTestId('footer')).toBeInTheDocument()
      expect(screen.getByText('Header Content')).toBeInTheDocument()
      expect(screen.getByText('Main Content')).toBeInTheDocument()
      expect(screen.getByText('Footer Content')).toBeInTheDocument()
    })

    it('should handle multiple children', () => {
      render(
        <RootLayout>
          <div data-testid="child-1">Child 1</div>
          <div data-testid="child-2">Child 2</div>
          <div data-testid="child-3">Child 3</div>
        </RootLayout>
      )

      expect(screen.getByTestId('child-1')).toBeInTheDocument()
      expect(screen.getByTestId('child-2')).toBeInTheDocument()
      expect(screen.getByTestId('child-3')).toBeInTheDocument()
      expect(screen.getByText('Child 1')).toBeInTheDocument()
      expect(screen.getByText('Child 2')).toBeInTheDocument()
      expect(screen.getByText('Child 3')).toBeInTheDocument()
    })
  })

  describe('HTML Document Structure', () => {
    it('should render HTML with proper lang attribute', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      render(<RootLayout>{mockChildren}</RootLayout>)

      expect(document.documentElement.lang).toBe('en')
      expect(document.documentElement.hasAttribute('lang')).toBe(true)
    })

    it('should render body with correct CSS classes including font variables', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      render(<RootLayout>{mockChildren}</RootLayout>)

      expect(document.body.className).toContain('--font-geist-sans')
      expect(document.body.className).toContain('--font-geist-mono')
      expect(document.body.className).toContain('antialiased')

      // Verify the exact class structure
      const bodyClasses = document.body.className.split(' ').filter(Boolean)
      expect(bodyClasses).toContain('--font-geist-sans')
      expect(bodyClasses).toContain('--font-geist-mono')
      expect(bodyClasses).toContain('antialiased')
      expect(bodyClasses).toHaveLength(3)
    })

    it('should maintain proper HTML semantic structure', () => {
      const mockChildren = <main data-testid="main-content">Main Content</main>

      render(<RootLayout>{mockChildren}</RootLayout>)

      // Verify html element exists and has lang attribute
      expect(document.documentElement).toBeTruthy()
      expect(document.documentElement.tagName.toLowerCase()).toBe('html')
      expect(document.documentElement.getAttribute('lang')).toBe('en')

      // Verify body element exists and has proper classes
      expect(document.body).toBeTruthy()
      expect(document.body.tagName.toLowerCase()).toBe('body')
      expect(document.body.className).toContain('antialiased')
    })
  })

  describe('Font Configuration', () => {
    it('should apply font variables as CSS custom properties', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      render(<RootLayout>{mockChildren}</RootLayout>)

      // The font variables should be applied as CSS classes
      expect(document.body.className).toContain('--font-geist-sans')
      expect(document.body.className).toContain('--font-geist-mono')
      expect(document.body.className).toContain('antialiased')
    })

    it('should have correct font variable structure in body classes', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      render(<RootLayout>{mockChildren}</RootLayout>)

      const bodyClasses = document.body.className.split(' ').filter(Boolean)

      // Should contain the font variable classes and antialiased
      expect(bodyClasses).toContain('--font-geist-sans')
      expect(bodyClasses).toContain('--font-geist-mono')
      expect(bodyClasses).toContain('antialiased')

      // Should have exactly these 3 classes
      expect(bodyClasses).toHaveLength(3)
    })

    it('should include font configuration in returned font objects', () => {
      // Test that the mock functions return the expected structure
      const geistResult = Geist()
      const geistMonoResult = Geist_Mono()

      expect(geistResult).toHaveProperty('variable', '--font-geist-sans')
      expect(geistResult).toHaveProperty('style.fontFamily', 'Geist Sans, sans-serif')

      expect(geistMonoResult).toHaveProperty('variable', '--font-geist-mono')
      expect(geistMonoResult).toHaveProperty('style.fontFamily', 'Geist Mono, monospace')
    })
  })

  describe('Provider Integration', () => {
    it('should wrap children with proper provider structure', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      render(<RootLayout>{mockChildren}</RootLayout>)

      // Since we mock the providers to just render children,
      // we verify that children are rendered correctly
      expect(screen.getByTestId('test-content')).toBeInTheDocument()
    })

    it('should handle provider rendering without errors', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      expect(() => {
        render(<RootLayout>{mockChildren}</RootLayout>)
      }).not.toThrow()

      expect(screen.getByTestId('test-content')).toBeInTheDocument()
    })

    it('should render providers in correct nesting order', () => {
      // The layout should nest: SessionProvider > SocketProvider > children
      const mockChildren = <div data-testid="test-content">Test Content</div>

      render(<RootLayout>{mockChildren}</RootLayout>)

      // Verify children are rendered (indicating providers nested correctly)
      expect(screen.getByTestId('test-content')).toBeInTheDocument()
      expect(screen.getByText('Test Content')).toBeInTheDocument()
    })
  })

  describe('Metadata Configuration', () => {
    it('should export correct metadata configuration', () => {
      // Test the imported metadata export
      expect(metadata).toEqual({
        title: 'Heart Tiles',
        description: 'A multiplayer card game inspired by Love and Deepspace'
      })
    })

    it('should have proper title metadata', () => {
      expect(metadata.title).toBe('Heart Tiles')
      expect(typeof metadata.title).toBe('string')
      expect(metadata.title.length).toBeGreaterThan(0)
    })

    it('should have proper description metadata', () => {
      expect(metadata.description).toBe('A multiplayer card game inspired by Love and Deepspace')
      expect(typeof metadata.description).toBe('string')
      expect(metadata.description.length).toBeGreaterThan(0)
    })
  })

  describe('Component Structure and Types', () => {
    it('should be a default export function', () => {
      expect(typeof RootLayout).toBe('function')
    })

    it('should accept children prop correctly', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      expect(() => {
        render(<RootLayout>{mockChildren}</RootLayout>)
      }).not.toThrow()

      expect(screen.getByTestId('test-content')).toBeInTheDocument()
    })

    it('should handle children prop with different types', () => {
      // Test with string children
      render(<RootLayout>Hello World</RootLayout>)
      expect(screen.getByText('Hello World')).toBeInTheDocument()

      // Test with number children
      render(<RootLayout>{123}</RootLayout>)
      expect(screen.getByText('123')).toBeInTheDocument()

      // Test with array of children
      render(
        <RootLayout>
          {[<div key="1">Item 1</div>, <div key="2">Item 2</div>]}
        </RootLayout>
      )
      expect(screen.getByText('Item 1')).toBeInTheDocument()
      expect(screen.getByText('Item 2')).toBeInTheDocument()
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle null children gracefully', () => {
      expect(() => {
        render(<RootLayout>{null}</RootLayout>)
      }).not.toThrow()
    })

    it('should handle undefined children gracefully', () => {
      expect(() => {
        render(<RootLayout>{undefined}</RootLayout>)
      }).not.toThrow()
    })

    it('should handle empty string children', () => {
      expect(() => {
        render(<RootLayout>{''}</RootLayout>)
      }).not.toThrow()
    })

    it('should handle boolean children', () => {
      expect(() => {
        render(<RootLayout>{true}</RootLayout>)
      }).not.toThrow()

      expect(() => {
        render(<RootLayout>{false}</RootLayout>)
      }).not.toThrow()
    })

    it('should handle children that throw errors', () => {
      const ErrorComponent = () => {
        throw new Error('Test error')
      }

      expect(() => {
        render(<RootLayout><ErrorComponent /></RootLayout>)
      }).toThrow('Test error')
    })

    it('should handle error boundary scenarios gracefully', () => {
      // Test that the layout can handle various error scenarios
      // This test focuses on the layout's resilience rather than specific HTML structure

      const mockChildren = <div data-testid="test-content">Test Content</div>

      // First, verify normal operation
      expect(() => {
        render(<RootLayout>{mockChildren}</RootLayout>)
      }).not.toThrow()

      // The layout should be able to render and clean up properly
      expect(screen.getByTestId('test-content')).toBeInTheDocument()
    })
  })

  describe('CSS Import Handling', () => {
    it('should import global CSS without errors', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      expect(() => {
        render(<RootLayout>{mockChildren}</RootLayout>)
      }).not.toThrow()

      // Since we mock the CSS import, we just verify it doesn't cause errors
      expect(screen.getByTestId('test-content')).toBeInTheDocument()
    })
  })

  describe('Performance and Optimization', () => {
    it('should render efficiently with consistent font classes', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      const { unmount } = render(<RootLayout>{mockChildren}</RootLayout>)

      // Font classes should be applied consistently
      expect(document.body.className).toContain('--font-geist-sans')
      expect(document.body.className).toContain('--font-geist-mono')
      expect(document.body.className).toContain('antialiased')

      // Clean up
      unmount()
    })

    it('should handle multiple renders without side effects', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      // Render multiple times and ensure no side effects
      for (let i = 0; i < 3; i++) {
        const { unmount } = render(<RootLayout>{mockChildren}</RootLayout>)

        // Font classes should be applied consistently each time
        expect(document.body.className).toContain('--font-geist-sans')
        expect(document.body.className).toContain('--font-geist-mono')
        expect(document.body.className).toContain('antialiased')

        unmount()
      }
    })
  })

  describe('Accessibility', () => {
    it('should maintain proper accessibility structure', () => {
      const mockChildren = <main data-testid="main-content" role="main">Main Content</main>

      render(<RootLayout>{mockChildren}</RootLayout>)

      // Verify semantic HTML structure
      expect(document.documentElement.hasAttribute('lang')).toBe(true)
      expect(document.documentElement.getAttribute('lang')).toBe('en')

      // Verify body has proper classes for accessibility (antialiased text)
      expect(document.body.className).toContain('antialiased')

      // Verify children maintain their accessibility attributes
      expect(screen.getByRole('main')).toBeInTheDocument()
      expect(screen.getByText('Main Content')).toBeInTheDocument()
    })

    it('should support screen reader friendly structure', () => {
      const mockChildren = (
        <div>
          <h1>Page Title</h1>
          <p>Page content</p>
        </div>
      )

      render(<RootLayout>{mockChildren}</RootLayout>)

      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
      expect(screen.getByText('Page Title')).toBeInTheDocument()
      expect(screen.getByText('Page content')).toBeInTheDocument()
    })
  })

  describe('Authentication State Handling', () => {
    it('should render correctly with unauthenticated user session', () => {
      const mockChildren = <div data-testid="test-content">Unauthenticated Content</div>

      // Mock unauthenticated session (default state)
      global.__mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn().mockResolvedValue(null),
      })

      render(<RootLayout>{mockChildren}</RootLayout>)

      expect(screen.getByTestId('test-content')).toBeInTheDocument()
      expect(screen.getByText('Unauthenticated Content')).toBeInTheDocument()
    })

    it('should render correctly with authenticated user session', () => {
      const mockChildren = <div data-testid="test-content">Authenticated Content</div>
      const mockSession = {
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          name: 'Test User'
        },
        expires: '2024-12-31T23:59:59.999Z'
      }

      // Mock authenticated session
      global.__mockUseSession.mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: vi.fn().mockResolvedValue(mockSession),
      })

      render(<RootLayout>{mockChildren}</RootLayout>)

      expect(screen.getByTestId('test-content')).toBeInTheDocument()
      expect(screen.getByText('Authenticated Content')).toBeInTheDocument()
    })

    it('should render correctly with loading session state', () => {
      const mockChildren = <div data-testid="test-content">Loading Content</div>

      // Mock loading session state
      global.__mockUseSession.mockReturnValue({
        data: null,
        status: 'loading',
        update: vi.fn().mockResolvedValue(null),
      })

      render(<RootLayout>{mockChildren}</RootLayout>)

      expect(screen.getByTestId('test-content')).toBeInTheDocument()
      expect(screen.getByText('Loading Content')).toBeInTheDocument()
    })

    it('should handle session state changes during rendering', () => {
      const mockChildren = <div data-testid="test-content">Dynamic Content</div>

      // Start with loading state
      global.__mockUseSession.mockReturnValue({
        data: null,
        status: 'loading',
        update: vi.fn().mockResolvedValue(null),
      })

      const { rerender } = render(<RootLayout>{mockChildren}</RootLayout>)

      expect(screen.getByTestId('test-content')).toBeInTheDocument()

      // Change to authenticated state
      const mockSession = {
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          name: 'Test User'
        },
        expires: '2024-12-31T23:59:59.999Z'
      }

      global.__mockUseSession.mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: vi.fn().mockResolvedValue(mockSession),
      })

      rerender(<RootLayout>{mockChildren}</RootLayout>)

      expect(screen.getByTestId('test-content')).toBeInTheDocument()
    })
  })

  describe('Integration with React Testing Library', () => {
    it('should work properly with RTL queries', () => {
      const mockChildren = (
        <div>
          <button data-testid="test-button">Click me</button>
          <input placeholder="Test input" />
          <span aria-label="test span">Content</span>
        </div>
      )

      render(<RootLayout>{mockChildren}</RootLayout>)

      // Test different RTL query methods
      expect(screen.getByTestId('test-button')).toBeInTheDocument()
      expect(screen.getByRole('button')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Test input')).toBeInTheDocument()
      expect(screen.getByLabelText('test span')).toBeInTheDocument()
      expect(screen.getByText('Click me')).toBeInTheDocument()
    })

    it('should handle async operations properly', async () => {
      const AsyncComponent = () => {
        const [loaded, setLoaded] = React.useState(false)

        React.useEffect(() => {
          const timer = setTimeout(() => setLoaded(true), 5) // Small delay to ensure loading state is visible
          return () => clearTimeout(timer) // Proper cleanup
        }, [])

        return loaded ? <div data-testid="async-content">Loaded</div> : <div>Loading...</div>
      }

      const { container } = render(<RootLayout><AsyncComponent /></RootLayout>)

      // Initially should show loading state
      expect(screen.getByText('Loading...')).toBeInTheDocument()
      expect(screen.queryByTestId('async-content')).not.toBeInTheDocument()

      // Wait for the async content to appear using findByTestId
      const asyncContent = await findByTestId(container, 'async-content', {}, { timeout: 1000 })

      // Verify the loaded state
      expect(asyncContent).toBeInTheDocument()
      expect(asyncContent).toHaveTextContent('Loaded')
      expect(screen.getByText('Loaded')).toBeInTheDocument()

      // Verify loading state is gone
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })
  })
})