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
        'next-env.d.ts',
        'src/socket.ts',
        'src/app/globals.css'
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
        test: {
          include: ['__tests__/integration/**/*.{test,spec}.{js,ts}'],
          exclude: ['**/unit/**', '**/e2e/**', '**/components/**/*.test.*', '**/contexts/**/*.test.*', '**/*.test.jsx', '**/*.test.tsx'],
          environment: 'node',
          globals: true,
          setupFiles: ['./__tests__/integration/setup.js'],
          testTimeout: 25000,
          hookTimeout: 20000,
          css: false,
          // Skip integration tests if MongoDB is not available
          bail: 0,
          // Run integration tests sequentially to avoid database conflicts
          pool: 'forks',
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
          exclude: ['node_modules', '**/integration/**', '**/unit/**'],
          environment: 'happy-dom',
          globals: true,
          setupFiles: ['./__tests__/setup.js'],
          testTimeout: 10000,
          hookTimeout: 10000
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