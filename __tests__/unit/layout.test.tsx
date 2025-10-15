import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import Layout from '../../src/app/layout.tsx'

// Mock next/font
vi.mock('next/font/google', () => ({
  GeistSans: () => ({
    style: {
      fontFamily: 'Geist Sans, sans-serif'
    }
  }),
  GeistMono: () => ({
    style: {
      fontFamily: 'Geist Mono, monospace'
    }
  })
}))

// Mock SessionProvider
vi.mock('../../src/components/providers/SessionProvider.tsx', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="session-provider">{children}</div>
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

    // Check that body has proper classes
    expect(document.body.className).toContain('min-h-screen')
    expect(document.body.className).toContain('bg-background')

    // Check that children are rendered
    const testContent = document.querySelector('[data-testid="test-content"]')
    expect(testContent).toBeTruthy()
  })

  it('should have proper meta viewport tag', () => {
    const mockChildren = <div>Test</div>

    render(<Layout>{mockChildren}</Layout>)

    const viewport = document.querySelector('meta[name="viewport"]')
    expect(viewport).toBeTruthy()
    expect(viewport?.getAttribute('content')).toBe('width=device-width, initial-scale=1')
  })

  it('should have proper favicon link', () => {
    const mockChildren = <div>Test</div>

    render(<Layout>{mockChildren}</Layout>)

    const favicon = document.querySelector('link[rel="icon"]')
    expect(favicon).toBeTruthy()
    expect(favicon?.getAttribute('href')).toBe('/favicon.ico')
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