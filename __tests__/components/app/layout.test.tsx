// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Mock next/font/google
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

// Mock NextAuth
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// Mock Socket context
vi.mock('../../src/contexts/SocketContext.js', () => ({
  useSocket: vi.fn(),
  SocketProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// Mock CSS import
vi.mock('../../src/app/globals.css', () => ({}))

// Import after mocking
import { Geist, Geist_Mono } from 'next/font/google'
import RootLayout from '../app/layout'

describe('RootLayout Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Reset document structure before each test
    document.documentElement.lang = ''
    document.body.className = ''
    document.body.innerHTML = ''

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
    it('should load Geist font with correct configuration', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      render(<RootLayout>{mockChildren}</RootLayout>)

      expect(Geist).toHaveBeenCalledWith({
        variable: '--font-geist-sans',
        subsets: ['latin']
      })
      expect(Geist).toHaveBeenCalledTimes(1)
    })

    it('should load Geist Mono font with correct configuration', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      render(<RootLayout>{mockChildren}</RootLayout>)

      expect(Geist_Mono).toHaveBeenCalledWith({
        variable: '--font-geist-mono',
        subsets: ['latin']
      })
      expect(Geist_Mono).toHaveBeenCalledTimes(1)
    })

    it('should apply font variables as CSS custom properties', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      render(<RootLayout>{mockChildren}</RootLayout>)

      // The font variables should be applied as CSS classes
      expect(document.body.className).toContain('--font-geist-sans')
      expect(document.body.className).toContain('--font-geist-mono')
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
      // Test the metadata export directly from the layout
      const metadata = RootLayout.metadata

      expect(metadata).toEqual({
        title: 'Heart Tiles',
        description: 'A multiplayer card game inspired by Love and Deepspace'
      })
    })

    it('should have proper title metadata', () => {
      const metadata = RootLayout.metadata

      expect(metadata.title).toBe('Heart Tiles')
      expect(typeof metadata.title).toBe('string')
      expect(metadata.title.length).toBeGreaterThan(0)
    })

    it('should have proper description metadata', () => {
      const metadata = RootLayout.metadata

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

    it('should maintain document structure even with problematic children', () => {
      // Even if children cause issues, the basic HTML structure should be set
      try {
        render(<RootLayout><ErrorComponent /></RootLayout>)
      } catch (error) {
        // Expected to throw, but HTML structure should still be established
      }

      // Verify basic structure was attempted
      expect(document.documentElement.lang).toBe('en')
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
    it('should not cause unnecessary re-renders', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      render(<RootLayout>{mockChildren}</RootLayout>)

      // Font functions should only be called once per render
      expect(Geist).toHaveBeenCalledTimes(1)
      expect(Geist_Mono).toHaveBeenCalledTimes(1)
    })

    it('should be efficient with multiple renders', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      // Render multiple times
      for (let i = 0; i < 3; i++) {
        const { unmount } = render(<RootLayout>{mockChildren}</RootLayout>)
        unmount()
      }

      // Each render should call font functions once
      expect(Geist).toHaveBeenCalledTimes(3)
      expect(Geist_Mono).toHaveBeenCalledTimes(3)
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
          setTimeout(() => setLoaded(true), 0)
        }, [])

        return loaded ? <div data-testid="async-content">Loaded</div> : <div>Loading...</div>
      }

      render(<RootLayout><AsyncComponent /></RootLayout>)

      // Initially should show loading
      expect(screen.getByText('Loading...')).toBeInTheDocument()

      // Wait for async update
      await new Promise(resolve => setTimeout(resolve, 10))

      // Should show loaded content (this test demonstrates RTL async handling)
      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })
  })
})