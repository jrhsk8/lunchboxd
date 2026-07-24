import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Served at gambdle.net/lunchboxd (a folder in the Gambdle GitHub Pages repo).
  base: '/lunchboxd/',
  plugins: [react(), tailwindcss()],
});
