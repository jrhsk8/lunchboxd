import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Served at the apex of lunchboxd.live (Cloudflare Pages). Root base: assets
  // and the BASE_URL-derived emailRedirectTo resolve against the domain root.
  base: '/',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // React and the Supabase client change when their versions change,
        // which is rarely; the app changes on every deploy. As one chunk they
        // shared a hash, so each deploy invalidated the whole bundle for every
        // returning visitor including the vendor half that hadn't moved (#117).
        // Split by what changes together, not by size.
        manualChunks: {
          react: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
