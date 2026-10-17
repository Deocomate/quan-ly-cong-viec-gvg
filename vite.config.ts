import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { chunkSizeWarningLimit: 1200 },
  // `npm run dev` + `npm run dev:api`: giao diện gọi API của máy chủ ứng dụng ở cổng 3000
  server: { proxy: { '/api': 'http://localhost:3000' } },
})
