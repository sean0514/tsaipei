# 系統入口網站

整合「境外實習生管理系統」與「食品工廠管理系統」的靜態入口頁面，純 HTML/CSS，無 build 工具。

## 部署方式（GitHub Pages）

1. 到這個 repo 的 Settings → Pages
2. Source 選「Deploy from a branch」
3. Branch 選 `main`，資料夾選 `/docs`
4. 儲存後幾分鐘內會拿到一個 `https://<帳號>.github.io/tsaipei/` 網址

## 更新系統網址

兩個系統各自部署（`clasp deploy`）後如果網址改變，直接修改 `index.html` 裡兩個
`<a class="card ...">` 的 `href` 即可，不需要改其他地方。
