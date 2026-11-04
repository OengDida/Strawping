import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'frontend',
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: '../src/client',
    emptyOutDir: false,
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        // Parallel downloads + long-term caching: app code changes often, vendor code does not.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('framer-motion') || id.includes('motion-dom') || id.includes('motion-utils')) return 'vendor-motion';
          if (id.includes('@tanstack')) return 'vendor-query';
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
});
