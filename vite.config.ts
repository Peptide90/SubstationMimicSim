import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@map-core': path.resolve(__dirname, 'packages/map-core/src'),
      '@sim-core': path.resolve(__dirname, 'packages/sim-core/src'),
      '@scenarios': path.resolve(__dirname, 'packages/scenarios/src')
    }
  }
});
