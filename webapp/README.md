# 系統網站（Firebase / Firestore）

把「境外實習生管理系統」與「食品工廠管理系統」搬進同一個 Firebase 專案的第一階段成果：
React + Vite 前端、Firestore 當資料庫、Firebase Auth 當登入機制，用 collection 前綴
（`tsaipei_*` / `foodfactory_*`）區分兩套系統的資料。

## 目前狀態

**地基已完成，模組陸續補齊中。** 已經可用的部分：

- 登入（Firebase Auth email/password）
- 系統選擇入口、側邊欄導覽（依角色權限顯示/隱藏模組）
- 角色權限模型（`src/lib/permissions.js`），完整移植自兩套系統原本 Apps Script
  裡的 `ROLES` / `DEFAULT_PERMISSIONS`
- **境外實習生管理系統**：學生資料、職缺媒合群組（實習單位／媒合紀錄／二面進度／
  錄取名單），欄位為常用子集，其餘欄位待補；自動連動鏈「新增學生→建媒合紀錄→
  已媒合→建二面進度→通過→建錄取名單」都已接上，但**錄取名單「確認錄取」之後
  原本會接著自動建實習文件追蹤／申辦進度追蹤，這兩個模組還沒搬過來，連動鏈到
  這裡先斷掉**，補這兩個模組時記得一起接上（見 `AdmittedListPage.jsx` 裡的註解）
- **食品工廠管理系統**：原料主檔（完整 CRUD，欄位齊全）

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
