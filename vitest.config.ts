import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      include: ['**/*.ts'],
      // Library code all lives under packages/*/src, so root-level *.ts is tooling or a local
      // scratch file (e.g. a benchmark validator) and must not count against coverage.
      exclude: ['**/*.d.ts', '**/*.spec.ts', '**/*.test.ts', '*.ts'],
      provider: 'v8',
      reporter: [['lcov'], ['text'], ['text-summary']],
      reportsDirectory: './coverage',
    },
    setupFiles: [],
  },
})
