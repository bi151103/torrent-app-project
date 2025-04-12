import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 7000, // Chỉnh cổng thành 4000 hoặc cổng bạn mong muốn
  },
  plugins: [react()],
})
