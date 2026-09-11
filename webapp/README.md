# 系統網站（Firebase / Firestore）

把「境外實習生管理系統」與「食品工廠管理系統」搬進同一個 Firebase 專案的第一階段成果：
React + Vite 前端、Firestore 當資料庫、Firebase Auth 當登入機制，用 collection 前綴
（`tsaipei_*` / `foodfactory_*`）區分兩套系統的資料。

## 目前狀態

**境外實習生管理系統的所有模組都已搬完。** 食品工廠管理系統還只有原料主檔一個模組。

- 登入（Firebase Auth email/password）
- 系統選擇入口、側邊欄導覽（依角色權限顯示/隱藏模組）
- 角色權限模型（`src/lib/permissions.js`），完整移植自兩套系統原本 Apps Script
  裡的 `ROLES` / `DEFAULT_PERMISSIONS`
- **境外實習生管理系統**（14 個模組全部搬完）：儀表板、學生資料、職缺媒合群組
  （實習單位／媒合紀錄／二面進度／錄取名單）、實習文件追蹤、申辦進度追蹤、
  實習在台追蹤（在台簽證追蹤／在台關懷紀錄）、住宿安排、宿舍管理、會議記錄、
  使用人員、內部獎金計算群組（內部獎金計算／客戶費用建檔／內部費用建檔）、
  主管報表。自動連動鏈完整移植（見 `src/lib/bonus.js` 跟各頁面裡的中文註解）：
  新增學生→建媒合紀錄→已媒合→建二面進度→通過→建錄取名單→確認錄取→建實習
  文件追蹤＋申辦進度追蹤→進度到「入台」→建在台簽證追蹤＋在台關懷紀錄＋住宿安排。
  學生資料、職缺媒合等表單欄位是常用子集，未涵蓋 SHEET_FIELDS 全部欄位（語言
  證明細節、簽證換發次數等），要用到時照既有 `FIELDS` 陣列的模式加。
  **請款單 Excel 產生功能（`generateClientInvoice`）跟客戶請款計算報表本身還沒搬**
  （原本就是技術債最重的一塊，需要先決定 Excel 產生方式——client-side 用
  SheetJS 之類的套件，或另外寫一個 Cloud Function）。
- **食品工廠管理系統**：原料主檔（完整 CRUD，欄位齊全），其餘模組（供應商、
  進貨單、生產管理、成品出貨、品質食安、成本分析、零用金對帳、損益表、使用人員）
  待補，做法完全比照境外系統這邊已經搬好的模式。

### 已知限制：跨權限模組的自動連動

Firestore 規則是依「權限模組」擋寫入，但有些自動連動會跨模組寫資料（例如新增
學生同時建立媒合紀錄，前者屬於 `students` 模組、後者屬於 `matching` 模組）。
如果操作者對來源模組有編輯權但對目的模組沒有，寫入會被規則擋下來、整個連動
會靜默失敗一半。目前只針對「新增學生自動建媒合紀錄」這條路徑在規則裡放寬
（`tsaipei_matches` 的 `create` 同時接受 `matching` 或 `students` 的編輯權），
之後每接上一條新的跨模組連動，都要檢查 `firestore.rules` 是否也要跟著放寬。

其餘模組（媒合紀錄、住宿安排、生產管理、成本分析…)在側邊欄會顯示但連到「建置中」
頁面，尚未實作。之後照 `src/systems/tsaipei/StudentsPage.jsx` /
`src/systems/foodfactory/InventoryPage.jsx` 的模式一個一個補。

## 架構

```
src/
  firebase.js              Firebase App/Auth/Firestore 初始化
  lib/permissions.js       兩套系統的 ROLES + DEFAULT_PERMISSIONS + 權限判斷函式
  lib/useCollection.js     通用 Firestore CRUD hook（即時訂閱）
  auth/AuthContext.jsx     登入狀態
  auth/useSystemAccess.js  某系統下目前使用者的角色/權限（讀 `<system>_users`、
                            `<system>_rolePermissions`）
  components/Layout.jsx    側邊欄 + 導覽（依權限顯示模組）
  pages/                   登入頁、系統選擇頁
  systems/tsaipei/         境外實習生管理系統的各模組頁面
  systems/foodfactory/     食品工廠管理系統的各模組頁面
firestore.rules            資料庫安全規則（權限判斷邏輯的最終防線，不能只靠前端）
```

## Firestore 資料結構慣例

- 每個 collection 都加系統前綴：`tsaipei_students`、`foodfactory_materials` …
- `<system>_users/{uid}`：`{ email, displayName, role }`，doc id = Firebase Auth UID，
  決定這個人在這個系統裡的角色
- `<system>_rolePermissions/{module}__{role}`：`{ level: 'edit'|'view'|'none' }`，
  對應原本試算表版本的「動態權限矩陣」，沒有這筆資料時退回 `permissions.js` 裡的預設值
  （前端如此；**Firestore 規則本身的預設是「沒有 override 就只有系統管理員能寫」**，
  比前端預設更嚴格，之後要開放某角色編輯某模組，記得同時在 UI 上調權限矩陣、也要讓
  它真的寫進 `rolePermissions` 這個 collection）

新增一個 collection 時要做的事（跟原本 Apps Script 版 HANDOFF.md 提醒的很像）：
1. 在 `src/lib/permissions.js` 對應系統的 `modules` 加一筆
2. 在 `src/systems/<system>/` 新增頁面元件
3. 在 `src/App.jsx` 的 `PAGES` 加映射
4. 在 `firestore.rules` 加一個 `match` 區塊（module key 要跟第 1 步一致）

## 初次設定（一次性，需要人工操作）

1. **啟用 Firebase Authentication**：Firebase Console → Build → Authentication →
   Sign-in method → 啟用「電子郵件/密碼」
2. **啟用 Firestore**：Firebase Console → Build → Firestore Database → 建立資料庫
   （若還沒建立）
3. **建立第一個系統管理員帳號**：
   - Firebase Console → Authentication → Users → 新增使用者（輸入 email/密碼）
   - 複製這個使用者的 UID
   - Firestore Database → 開始新增集合 `tsaipei_users`（或 `foodfactory_users`），
     文件 ID 貼上剛剛的 UID，欄位填 `email`、`displayName`、`role: "系統管理員"`
   - 之後這個人登入系統就能在「使用人員」頁面（待建置）管理其他人的帳號與角色，
     不用再手動操作 Firestore
4. **部署 Firestore 規則**（第一次要手動跑一次，之後 CI 會自動跑）：
   ```
   cd webapp
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules
   ```
5. **設定 GitHub Actions 自動部署**：repo Settings → Secrets → Actions，新增
   `FIREBASE_SERVICE_ACCOUNT`（見 `.github/workflows/deploy-webapp.yml` 開頭註解）

## 本機開發

```
cd webapp
npm install
npm run dev
```
