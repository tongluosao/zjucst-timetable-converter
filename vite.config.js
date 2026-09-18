import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './',
  server: {
    port: 5173,
    host: '127.0.0.1',
    open: false,
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // 拆分 vendor，让 antd / xlsx 这类不常变的依赖能被浏览器长期缓存
        manualChunks: {
          vue: ['vue'],
          antd: ['ant-design-vue'],
          xlsx: ['xlsx'],
        },
      },
    },
  },
})
