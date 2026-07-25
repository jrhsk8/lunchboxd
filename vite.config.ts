import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Served at the apex of lunchboxd.live (Cloudflare Pages). Root base: assets
  // and the BASE_URL-derived emailRedirectTo resolve against the domain root.
  base: '/',
  plugins: [react(), tailwindcss()],
});
