import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // 移工填寫履歷表的連結(/apply/laborAgency)是公開連結，對方手機的
    // Safari 版本沒辦法保證跟我們自己測試的環境一樣新——預設不設定
    // target 的話，打包出來的程式碼會保留 ES2021 的邏輯賦值運算子
    // (||=) 等語法，太舊的 Safari（iOS 14 以前）解析這段語法會直接
    // 整支 script 失敗，畫面就是空白的什麼都沒有，不會有任何錯誤訊息
    // 給使用者看到。目標設低一點，讓 esbuild/rolldown 把這類語法轉譯
    // 回舊版瀏覽器看得懂的寫法。
    target: ['es2017', 'safari12'],
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
