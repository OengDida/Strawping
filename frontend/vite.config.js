import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: 'frontend',
  plugins: [react()],
  publicDir: false,
  build: { outDir: '../src/client', emptyOutDir: false, assetsDir: 'assets' },
});
