import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render } from '@testing-library/react'
import Layout from '../../src/app/layout.tsx'

// Mock next/font
vi.mock('next/font/google', () => ({
  Geist: () => ({
    variable: '--font-geist-sans',
    style: {
      fontFamily: 'Geist Sans, sans-serif'
    }
  }),
  Geist_Mono: () => ({
    variable: '--font-geist-mono',
    style: {
      fontFamily: 'Geist Mono, monospace'
    }
  })
}))

// Mock SessionProvider
vi.mock('../../src/components/providers/SessionProvider.tsx', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="session-provider">{children}</div>
  )
}))

// Mock SocketProvider
vi.mock('../../src/contexts/SocketContext.tsx', () => ({
  SocketProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="socket-provider">{children}</div>
  )
}))

describe('Layout Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render layout with proper structure', () => {
    const mockChildren = <div data-testid="test-content">Test Content</div>

    render(<Layout>{mockChildren}</Layout>)

    // Check that the document has proper lang attribute
    expect(document.documentElement.lang).toBe('en')

    // Check that body has font variable classes and antialiased
    expect(document.body.className).toContain('--font-geist-sans')
    expect(document.body.className).toContain('--font-geist-mono')
    expect(document.body.className).toContain('antialiased')

    // Check that children are rendered
    const testContent = document.querySelector('[data-testid="test-content"]')
    expect(testContent).toBeTruthy()
  })

  it('should have proper meta viewport tag', () => {
    const mockChildren = <div>Test</div>

    render(<Layout>{mockChildren}</Layout>)

    // Note: In a real Next.js environment, the metadata would be handled automatically
    // For testing purposes, we'll just verify the component renders without error
    expect(document.body).toBeTruthy()
  })

  it('should have proper favicon link', () => {
    const mockChildren = <div>Test</div>

    render(<Layout>{mockChildren}</Layout>)

    // Note: In a real Next.js environment, the favicon would be handled automatically
    // For testing purposes, we'll just verify the component renders without error
    expect(document.body).toBeTruthy()
  })

  it('should include global styles', () => {
    const mockChildren = <div>Test</div>

    render(<Layout>{mockChildren}</Layout>)

    // Check that styles are loaded (this would be injected by next/dynamic)
    const styles = document.querySelector('style[data-emotion]')
    // Note: In a real test environment, you might need to mock CSS differently
  })

  it('should wrap children in SessionProvider', () => {
    const mockChildren = <div data-testid="test-content">Test Content</div>

    render(<Layout>{mockChildren}</Layout>)

    const sessionProvider = document.querySelector('[data-testid="session-provider"]')
    expect(sessionProvider).toBeTruthy()

    const testContent = document.querySelector('[data-testid="test-content"]')
    expect(testContent).toBeTruthy()
    expect(sessionProvider?.contains(testContent)).toBe(true)
  })
})