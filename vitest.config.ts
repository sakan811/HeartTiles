import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      exclude: [
        'node_modules/',
        '__tests__/',
        'coverage/',
        '*.config.{js,ts,mjs}',
        '.next/',
        'dist/',
        'next-env.d.ts'
      ]
    },
    setupFiles: ['./__tests__/setup.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
    alias: {
      '@': resolve(__dirname, './src'),
    },
    projects: [
      {
        test: {
          include: ['__tests__/**/*.{test,spec}.{js,ts}'],
          exclude: ['**/components/**/*.test.*', '**/contexts/**/*.test.*', '**/*.test.jsx', '**/*.test.tsx'],
          environment: 'node',
          globals: true,
          setupFiles: ['./__tests__/setup.ts'],
          testTimeout: 10000,
          hookTimeout: 10000
        },
        resolve: {
          alias: {
            '@': resolve(__dirname, './src'),
          }
        }
      },
      {
        test: {
          include: ['**/*.test.jsx', '**/*.test.tsx', '**/components/**/*.test.*', '**/contexts/**/*.test.*'],
          exclude: ['node_modules'],
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./__tests__/setup.ts'],
          testTimeout: 10000,
          hookTimeout: 10000,
          environmentOptions: {
            jsdom: {
              url: 'http://localhost:3000'
            }
          }
        },
        resolve: {
          alias: {
            '@': resolve(__dirname, './src'),
          }
        }
      }
    ]
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    }
  }
})