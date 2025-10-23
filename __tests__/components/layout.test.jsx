import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'

// Mock next/font/google BEFORE importing the layout
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

// Import Layout after setting up mocks
import Layout from '../../src/app/layout.tsx'

// Mock SessionProvider
vi.mock('../../src/components/providers/SessionProvider.js', () => ({
  SessionProvider: vi.fn(({ children }) => (
    <div data-testid="session-provider">{children}</div>
  ))
}))

// Mock SocketProvider
vi.mock('../../src/contexts/SocketContext.js', () => ({
  SocketProvider: vi.fn(({ children }) => (
    <div data-testid="socket-provider">{children}</div>
  ))
}))

// Mock CSS import
vi.mock('../../src/app/globals.css', () => ({}))

// Get references to mocked modules
import { Geist, Geist_Mono } from 'next/font/google'
import { SessionProvider } from '../../src/components/providers/SessionProvider.js'
import { SocketProvider } from '../../src/contexts/SocketContext.js'
import { metadata } from '../../src/app/layout.tsx'

describe('Layout Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset document structure before each test
    document.documentElement.lang = ''
    document.body.className = ''
    document.body.innerHTML = ''
  })

  afterEach(() => {
    // Clean up document after each test
    document.documentElement.lang = ''
    document.body.className = ''
    document.body.innerHTML = ''
  })

  describe('Font Configuration', () => {
    it('should apply font variables to body element', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      render(<Layout>{mockChildren}</Layout>)

      // Check that font variables are applied to the body
      const bodyElement = document.body
      expect(bodyElement.className).toContain('--font-geist-sans')
      expect(bodyElement.className).toContain('--font-geist-mono')
    })
  })

  describe('Document Structure', () => {
    it('should render HTML with proper lang attribute', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      render(<Layout>{mockChildren}</Layout>)

      expect(document.documentElement.lang).toBe('en')
    })

    it('should render body with correct CSS classes', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      render(<Layout>{mockChildren}</Layout>)

      expect(document.body.className).toContain('--font-geist-sans')
      expect(document.body.className).toContain('--font-geist-mono')
      expect(document.body.className).toContain('antialiased')
    })

    it('should render children correctly', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      render(<Layout>{mockChildren}</Layout>)

      expect(screen.getByTestId('test-content')).toBeInTheDocument()
      expect(screen.getByText('Test Content')).toBeInTheDocument()
    })
  })

  describe('Provider Integration', () => {
    it('should wrap children in SessionProvider', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      render(<Layout>{mockChildren}</Layout>)

      expect(SessionProvider).toHaveBeenCalled()
      expect(screen.getByTestId('session-provider')).toBeInTheDocument()
    })

    it('should wrap children in SocketProvider', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      render(<Layout>{mockChildren}</Layout>)

      expect(SocketProvider).toHaveBeenCalled()
      expect(screen.getByTestId('socket-provider')).toBeInTheDocument()
    })

    it('should nest providers in correct order', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      render(<Layout>{mockChildren}</Layout>)

      const sessionProvider = screen.getByTestId('session-provider')
      const socketProvider = screen.getByTestId('socket-provider')
      const testContent = screen.getByTestId('test-content')

      expect(sessionProvider).toBeInTheDocument()
      expect(socketProvider).toBeInTheDocument()
      expect(testContent).toBeInTheDocument()

      // Check nesting: SessionProvider > SocketProvider > children
      expect(sessionProvider.contains(socketProvider)).toBe(true)
      expect(socketProvider.contains(testContent)).toBe(true)
    })

    it('should pass correct props to SessionProvider', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      render(<Layout>{mockChildren}</Layout>)

      expect(SessionProvider).toHaveBeenCalledWith(
        { children: expect.any(Object) },
        undefined
      )
    })

    it('should pass correct props to SocketProvider', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      render(<Layout>{mockChildren}</Layout>)

      expect(SocketProvider).toHaveBeenCalledWith(
        { children: expect.any(Object) },
        undefined
      )
    })
  })

  describe('Metadata', () => {
    it('should export correct metadata configuration', () => {
      // Test the imported metadata
      expect(metadata).toEqual({
        title: 'Heart Tiles',
        description: 'A multiplayer card game inspired by Love and Deepspace'
      })
    })
  })

  describe('Component Structure', () => {
    it('should be a default export function', () => {
      expect(typeof Layout).toBe('function')
    })

    it('should accept children prop', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      expect(() => {
        render(<Layout>{mockChildren}</Layout>)
      }).not.toThrow()
    })

    it('should handle complex children structures', () => {
      const ComplexChildren = () => (
        <div>
          <header>Header Content</header>
          <main>Main Content</main>
          <footer>Footer Content</footer>
        </div>
      )

      render(<Layout><ComplexChildren /></Layout>)

      expect(screen.getByText('Header Content')).toBeInTheDocument()
      expect(screen.getByText('Main Content')).toBeInTheDocument()
      expect(screen.getByText('Footer Content')).toBeInTheDocument()
    })

    it('should handle multiple children', () => {
      render(
        <Layout>
          <div data-testid="child-1">Child 1</div>
          <div data-testid="child-2">Child 2</div>
          <div data-testid="child-3">Child 3</div>
        </Layout>
      )

      expect(screen.getByTestId('child-1')).toBeInTheDocument()
      expect(screen.getByTestId('child-2')).toBeInTheDocument()
      expect(screen.getByTestId('child-3')).toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('should handle null children gracefully', () => {
      expect(() => {
        render(<Layout>{null}</Layout>)
      }).not.toThrow()
    })

    it('should handle undefined children gracefully', () => {
      expect(() => {
        render(<Layout>{undefined}</Layout>)
      }).not.toThrow()
    })

    it('should handle empty string children', () => {
      expect(() => {
        render(<Layout>{''}</Layout>)
      }).not.toThrow()
    })

    it('should handle children that throw errors', () => {
      const ErrorComponent = () => {
        throw new Error('Test error')
      }

      expect(() => {
        render(<Layout><ErrorComponent /></Layout>)
      }).toThrow('Test error')
    })
  })

  describe('CSS Import', () => {
    it('should import global CSS', () => {
      const mockChildren = <div>Test</div>

      render(<Layout>{mockChildren}</Layout>)

      // Since we mock the CSS import, we just verify it doesn't cause errors
      expect(screen.getByTestId('session-provider')).toBeInTheDocument()
    })
  })

  describe('Performance', () => {
    it('should not cause unnecessary re-renders', () => {
      // Clear all mocks before this test to ensure clean counts
      vi.clearAllMocks()

      const mockChildren = <div data-testid="test-content">Test Content</div>

      render(<Layout>{mockChildren}</Layout>)

      // Provider functions should only be called once
      expect(SessionProvider).toHaveBeenCalledTimes(1)
      expect(SocketProvider).toHaveBeenCalledTimes(1)
    })
  })

  describe('Accessibility', () => {
    it('should have proper HTML semantic structure', () => {
      const mockChildren = <div data-testid="test-content">Test Content</div>

      render(<Layout>{mockChildren}</Layout>)

      // Check that html element has lang attribute
      expect(document.documentElement.hasAttribute('lang')).toBe(true)
      expect(document.documentElement.getAttribute('lang')).toBe('en')

      // Check that body element exists and has proper classes
      expect(document.body).toBeTruthy()
      expect(document.body.className).toContain('antialiased')
    })
  })
})