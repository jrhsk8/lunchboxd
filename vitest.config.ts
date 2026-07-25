import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The suite covers pure functions only (src/text.ts) — no DOM, no network,
    // no Supabase client. Adding component tests means adding jsdom here.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
