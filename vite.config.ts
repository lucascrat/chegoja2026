import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      build: {
        chunkSizeWarningLimit: 800,
        rollupOptions: {
          output: {
            manualChunks: {
              react: ['react', 'react-dom'],
              supabase: ['@supabase/supabase-js'],
            }
          }
        }
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'import.meta.env.VITE_APP_ROLE': JSON.stringify(env.VITE_APP_ROLE || ''),
        'import.meta.env.VITE_DEV_AUTO_LOGIN': JSON.stringify(env.VITE_DEV_AUTO_LOGIN || ''),
        'import.meta.env.VITE_TEST_CLIENT_NAME': JSON.stringify(env.VITE_TEST_CLIENT_NAME || ''),
        'import.meta.env.VITE_TEST_CLIENT_PHONE': JSON.stringify(env.VITE_TEST_CLIENT_PHONE || ''),
        'import.meta.env.VITE_TEST_DRIVER_USER': JSON.stringify(env.VITE_TEST_DRIVER_USER || ''),
        'import.meta.env.VITE_TEST_DRIVER_PASS': JSON.stringify(env.VITE_TEST_DRIVER_PASS || ''),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
