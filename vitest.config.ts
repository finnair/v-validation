import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      exclude: ['./*.ts', './*.cjs', 'test/**/*', 'ci/**/*'],
      provider: 'v8',
      reporter: [['lcov'], ['text'], ['text-summary']],
      reportsDirectory: './coverage',
    },
    setupFiles: [],
  },
})
