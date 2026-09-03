import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  build: { outDir: fileURLToPath(new URL('../public', import.meta.url)), emptyOutDir: true, sourcemap: false, assetsDir: 'assets' },
  server: { proxy: { '/api': 'http://127.0.0.1:9050' } },
})
