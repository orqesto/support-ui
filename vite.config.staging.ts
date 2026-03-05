import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const isStaging = mode === 'staging';
  
  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: isStaging ? 5174 : 5173,
      host: true,
    },
    build: {
      outDir: isStaging ? 'dist-staging' : 'dist',
      sourcemap: isStaging,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            radix: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select'],
            charts: ['recharts'],
          },
        },
      },
    },
    define: {
      __APP_ENV__: JSON.stringify(isStaging ? 'staging' : process.env.NODE_ENV),
    },
  };
});
