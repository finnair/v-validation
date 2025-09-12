import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      include: ['**/*.ts'],
      exclude: ['**/*.d.ts', '**/*.spec.ts', '**/*.test.ts', 'vitest.config.ts'],
      provider: 'v8',
      reporter: [['lcov'], ['text'], ['text-summary']],
      reportsDirectory: './coverage',
    },
    setupFiles: [],
  },
})
