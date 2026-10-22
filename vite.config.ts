import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['draco3dgltf'],
  },
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('monaco-editor') || id.includes('@monaco-editor')) return 'monaco'
            if (id.includes('three')) return 'three'
            if (id.includes('@gltf-transform')) return 'gltf-transform'
            if (id.includes('meshoptimizer')) return 'meshoptimizer'
          }
        },
      },
    },
  },
})
