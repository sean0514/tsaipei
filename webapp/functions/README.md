# Firestore 每日自動備份

`index.js` 的 `scheduledFirestoreExport` 是一個排程 Cloud Function，每天
台北時間 03:00 自動把整個 Firestore 資料庫匯出到 Cloud Storage（用
Firestore 官方的 Managed Export/Import 機制），不是只備份某幾個
collection——以後新增任何 `tsaipei_*`／`vietnam_*` collection 都會自動
包含在內，不用回來改程式。

## 部署前必須完成的設定（這些都要專案擁有者自己在 Firebase/GCP 主控台操作）

1. **確認專案是 Blaze（用量付費）方案**。Cloud Functions 排程、Cloud
   Scheduler、Cloud Storage 都需要，Spark 免費方案用不了。
   Firebase 主控台 → 齒輪圖示 → 用量與帳單 → 修改方案。

2. **建立一個 Cloud Storage bucket 放備份**（跟 Firestore 資料庫同一個
   region，否則匯出會失敗）。可以用現有專案的 Storage bucket，也可以另
   外建一個專門放備份的 bucket。

3. **給 Cloud Functions 的服務帳戶匯出權限**：到 GCP 主控台 → IAM，找
   `<project-id>@appspot.gserviceaccount.com` 這個服務帳戶，加上
   **Cloud Datastore Import Export Admin**
   （`roles/datastore.importExportAdmin`）角色。沒加這個權限，排程會
   一直失敗。

4. **設定備份要寫到哪個 bucket**：複製 `functions/.env.example` 為
   `functions/.env`，把 `BACKUP_BUCKET` 改成您剛建立的 bucket（格式
   `gs://你的bucket名稱/firestore-backups`）。這個檔案不會進 git（已列
   在 `.gitignore`），每個部署的人要自己設定一次。

5. **（建議）設定備份保留期限**：Cloud Storage 不會自動清舊備份，長期
   下來會一直累積佔空間。建議在那個 bucket 設定 Lifecycle 規則（例如
   保留 30 天自動刪除），在 Cloud Storage 主控台該 bucket 的「生命週期」
   分頁設定即可，不需要改程式。

## 部署

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

部署成功後，Firebase/GCP 主控台的 Cloud Scheduler 會看到一個每天執行
一次的排程工作，點進去可以手動立即觸發一次來測試（不用等到隔天凌晨
三點）。

## 還原

備份是用 Firestore 的 Managed Export 格式存的，還原要用 `gcloud`：

```bash
gcloud firestore import gs://你的bucket名稱/firestore-backups/<時間戳記資料夾>
```

時間戳記資料夾名稱在 Cloud Storage 裡那個 bucket 下面可以看到（例如
`2026-10-21T03-00-00-000Z`）。**還原會把匯入的內容「併入」現有資料
（同 ID 的文件會被備份內容覆蓋，不在備份裡的現有文件不會被刪除）**，
不是先清空再整個換掉；如果要完全回到備份當下的樣子（含「備份之後才
新增、備份當下還不存在」的文件也要清掉），要先手動清空相關
collection 再 import，請先確認清楚再動手，建議找 Claude 協助判斷還原
範圍。
