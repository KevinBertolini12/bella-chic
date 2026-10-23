import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const port = Number(env.PORT) || 3066;

  return {
    plugins: [react({ jsxRuntime: 'classic' }), tailwindcss()],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    // Em desenvolvimento, redireciona /api/* para o servidor Express
    server: {
      hmr: env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: `http://localhost:${port}`,
          changeOrigin: true,
        },
      },
    },

    build: {
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        onwarn(warning, warn) {
          // Suprime o warning de dynamic+static import (é intencional no nosso setup)
          if (warning.code === 'INVALID_ANNOTATION') return;
          if (warning.message?.includes('dynamic import') && warning.message?.includes('statically imported')) return;
          warn(warning);
        },
        output: {
          manualChunks: (id) => {
            // Firebase em chunk separado
            if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
              return 'firebase';
            }
            // React core
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router-dom/') ||
              id.includes('node_modules/scheduler/')
            ) {
              return 'react-core';
            }
            // Radix UI
            if (id.includes('node_modules/@radix-ui/')) {
              return 'radix-ui';
            }
            // Recharts + D3
            if (
              id.includes('node_modules/recharts') ||
              id.includes('node_modules/d3-') ||
              id.includes('node_modules/victory-')
            ) {
              return 'charts';
            }
            // date-fns
            if (id.includes('node_modules/date-fns') || id.includes('node_modules/@date-fns')) {
              return 'date-utils';
            }
            // Animações
            if (
              id.includes('node_modules/motion') ||
              id.includes('node_modules/framer-motion')
            ) {
              return 'animations';
            }
            // UI utilities
            if (
              id.includes('node_modules/lucide-react') ||
              id.includes('node_modules/sonner') ||
              id.includes('node_modules/class-variance-authority') ||
              id.includes('node_modules/clsx') ||
              id.includes('node_modules/tailwind-merge')
            ) {
              return 'ui-utils';
            }
            // react-day-picker
            if (id.includes('node_modules/react-day-picker')) {
              return 'date-picker';
            }
            // Páginas admin pesadas — chunk separado
            if (
              id.includes('/pages/AdminDashboard') ||
              id.includes('/pages/SuperAdminDashboard') ||
              id.includes('/pages/CRMProDashboard') ||
              id.includes('/components/admin/')
            ) {
              return 'admin';
            }
            // Páginas de loja/checkout
            if (
              id.includes('/pages/Shop') ||
              id.includes('/pages/Cart') ||
              id.includes('/pages/Checkout') ||
              id.includes('/services/storeService')
            ) {
              return 'store';
            }
          },
        },
      },
    },
  };
});