// 每天定時自動備份 Firestore 整個資料庫到 Cloud Storage，用官方的 Managed
// Export/Import 機制（跟 `gcloud firestore export` 做的事一樣，只是排程
// 自動觸發），不是自己讀資料再寫檔案那種土法——這樣不管哪個 collection
// 以後任何時候誰按了「匯入資料（覆蓋）」不小心覆蓋掉或表頭對不上造成
// 資料不完整，都可以從備份整個還原回去，不用像這次一樣只能靠使用者自己
// 手動下載的 CSV 救援。
//
// 部署前必須完成的設定（這些都要專案擁有者自己在 Firebase/GCP 主控台
// 操作，程式碼本身辦不到）：
//   1. 專案要是 Blaze（用量付費）方案——Cloud Functions 排程、Cloud
//      Scheduler、Cloud Storage 都需要，Spark 免費方案用不了。
//   2. 建立一個 Cloud Storage bucket 專門放備份（跟 Firestore 同一個
//      region），或沿用現有的 Storage bucket 但另開一個路徑。
//   3. 讓 Cloud Functions 預設服務帳戶（<project-id>@appspot.gserviceaccount.com）
//      有 Cloud Datastore Import Export Admin（roles/datastore.importExportAdmin）
//      權限，才能呼叫 Firestore 的匯出 API。
//   4. 部署時用 `firebase functions:config:env` 或 functions/.env 設定
//      BACKUP_BUCKET（見下面 defineString），值是 gs://你的bucket名稱/firestore-backups。
//   5. `cd functions && npm install`，然後在 webapp/ 執行
//      `firebase deploy --only functions`。
//
// 備份保留期：Cloud Storage 本身不會自動清舊備份，建議在 bucket 設定
// Lifecycle 規則（例如保留 30 天自動刪除），避免備份無限累積佔空間/
// 增加費用，這個要在 Cloud Storage 主控台另外設定，不是這支程式負責的。
//
// 還原方式：用 `gcloud firestore import gs://你的bucket/firestore-backups/<時間戳記>`，
// 一樣需要專案擁有者的 gcloud 權限才能執行，見 README 或跟 Claude 說要
// 還原到哪一天的備份。

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { google } from 'googleapis';

// 部署時設定，見上面的說明；沒有預設值，沒設就會部署失敗（故意不給預設
// 值，避免漏設定還是部署成功、結果備份靜靜地失敗或寫到錯的地方）。
const backupBucket = defineString('BACKUP_BUCKET');

export const scheduledFirestoreExport = onSchedule(
  {
    schedule: 'every day 03:00',
    timeZone: 'Asia/Taipei',
    timeoutSeconds: 540,
    memory: '256MiB',
  },
  async () => {
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
    const databaseName = `projects/${projectId}/databases/(default)`;

    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/datastore'],
    });
    const authClient = await auth.getClient();
    const firestoreAdmin = google.firestore({ version: 'v1', auth: authClient });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputUriPrefix = `${backupBucket.value()}/${timestamp}`;

    logger.info(`開始備份 Firestore 到 ${outputUriPrefix}`);
    const response = await firestoreAdmin.projects.databases.exportDocuments({
      name: databaseName,
      requestBody: {
        outputUriPrefix,
        // 空陣列 = 匯出所有 collection，不用每新增一個 tsaipei_*/vietnam_*
        // collection 就要回來改這支程式。
        collectionIds: [],
      },
    });
    logger.info('備份已送出，操作名稱：', response.data.name);
  }
);
