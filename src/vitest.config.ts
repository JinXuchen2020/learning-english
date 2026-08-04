import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.spec.ts'],
    exclude: ['node_modules/**', 'src/e2e/**', '**/*.e2e.spec.ts'],
  },
});
