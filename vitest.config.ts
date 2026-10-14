import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Most of the codebase is pure (theory, generation, validation) and needs no
    // DOM. The few suites that render into elements opt in with
    // `// @vitest-environment jsdom` at the top of the file.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
