import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.{test,spec}.{js,ts}'],
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
    hookTimeout: 10000
  }
})