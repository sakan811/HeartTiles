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
    setupFiles: ['./__tests__/setup.js'],
    testTimeout: 10000,
    hookTimeout: 10000,
    alias: {
      '@': resolve(__dirname, './src'),
    },
    css: {
      modules: {
        classNameStrategy: 'stable'
      }
    },
    projects: [
      {
        name: 'unit',
        test: {
          include: ['__tests__/unit/**/*.{test,spec}.{js,ts}'],
          exclude: ['**/integration/**', '**/e2e/**', '**/components/**/*.test.*', '**/contexts/**/*.test.*', '**/*.test.jsx', '**/*.test.tsx'],
          environment: 'node',
          globals: true,
          setupFiles: ['./__tests__/setup.js'],
          testTimeout: 10000,
          hookTimeout: 10000,
          css: false
        },
        resolve: {
          alias: {
            '@': resolve(__dirname, './src'),
          }
        }
      },
      {
        name: 'integration',
        test: {
          include: ['__tests__/integration/**/*.{test,spec}.{js,ts}'],
          exclude: ['**/unit/**', '**/e2e/**', '**/components/**/*.test.*', '**/contexts/**/*.test.*', '**/*.test.jsx', '**/*.test.tsx'],
          environment: 'node',
          globals: true,
          setupFiles: ['./__tests__/integration/setup.js'],
          testTimeout: 15000,
          hookTimeout: 15000,
          css: false,
          // Skip integration tests if MongoDB is not available
          bail: 0
        },
        resolve: {
          alias: {
            '@': resolve(__dirname, './src'),
          }
        }
      },
      {
        name: 'components',
        test: {
          include: ['**/*.test.jsx', '**/*.test.tsx', '**/components/**/*.test.*', '**/contexts/**/*.test.*'],
          exclude: ['node_modules', '**/integration/**', '**/unit/**'],
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./__tests__/setup.js'],
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