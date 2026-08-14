import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Frontend unit tests. Node environment — these cover pure logic (no DOM).
// The `@/` alias mirrors jsconfig so tests can import app modules the same way
// the app does.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    include: ['{app,lib,components}/**/*.test.{js,jsx}', 'test/**/*.test.{js,jsx}'],
  },
});
