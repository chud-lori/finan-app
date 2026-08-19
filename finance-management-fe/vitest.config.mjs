import { defineConfig } from 'vitest/config';
import path from 'node:path';

// The `@/` alias mirrors jsconfig so tests import app modules the same way the app does.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    include: ['{app,lib,components}/**/*.test.{js,jsx}', 'test/**/*.test.{js,jsx}'],
  },
});
