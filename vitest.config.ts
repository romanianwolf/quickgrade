import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts', '**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '.next/'],
    },
  },
  resolve: {
    alias: {
      '@markov/core': path.resolve(__dirname, 'packages/core'),
      '@markov/types': path.resolve(__dirname, 'packages/types'),
      '@markov/db': path.resolve(__dirname, 'packages/db'),
      '@markov/cache': path.resolve(__dirname, 'packages/cache'),
      '@markov/observability': path.resolve(__dirname, 'packages/observability'),
      '@markov/ui': path.resolve(__dirname, 'packages/ui'),
      '@markov/config': path.resolve(__dirname, 'packages/config'),
    },
  },
})
