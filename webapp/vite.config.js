import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // /about 另外給一份有獨立 <title>/meta 的 HTML（見 about.html），這樣
    // LINE/FB 等不執行 JS 的連結預覽機器人抓到的標題才會是公司名稱，而不是
    // 整站預設的「系統入口」；兩份 HTML 都載入同一支 main.jsx，實際畫面還是
    // 同一個 React App，只是進站時的靜態標題不同。
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        about: resolve(import.meta.dirname, 'about.html'),
      },
    },
  },
})
