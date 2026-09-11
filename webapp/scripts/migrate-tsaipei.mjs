// One-time migration script: reads the JSON exported from the old Google
// Sheets (see apps-script exportAllForMigration()) and writes it into
// Firestore under the tsaipei_* collections, preserving each record's
// original spreadsheet `id` as the Firestore document ID so that every
// cross-reference (studentId, positionId, matchId, dormitoryId, ...)
// keeps working without any remapping.
//
// Usage (from webapp/):
//   npm install firebase-admin
//   node scripts/migrate-tsaipei.mjs <path-to-service-account.json> <path-to-migration_export.json>
//
// Not part of the deployed app — safe to delete this file (and undo the
// firebase-admin install) once the migration is done.

import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const [, , serviceAccountPath, exportPath] = process.argv;
if (!serviceAccountPath || !exportPath) {
  console.error('Usage: node scripts/migrate-tsaipei.mjs <service-account.json> <migration_export.json>');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
const data = JSON.parse(readFileSync(exportPath, 'utf8'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// sheet name -> Firestore collection. Users/Bonuses/ClientBilling are
// intentionally skipped: Users because the webapp uses Firebase Auth (not
// username/password rows) — see webapp/README.md for how to add accounts;
// Bonuses/ClientBilling because the original app stopped reading/writing
// them (see apps-script/HANDOFF.md 已知限制).
const SHEET_TO_COLLECTION = {
  Students: 'tsaipei_students',
  Positions: 'tsaipei_positions',
  Matches: 'tsaipei_matches',
  SecondInterviews: 'tsaipei_secondInterviews',
  AdmittedList: 'tsaipei_admittedList',
  ApplicationProgress: 'tsaipei_applicationProgress',
  InTaiwanVisa: 'tsaipei_inTaiwanVisa',
  InTaiwanCare: 'tsaipei_inTaiwanCare',
  InternshipDocs: 'tsaipei_internshipDocs',
  HousingRecords: 'tsaipei_housingRecords',
  Dormitories: 'tsaipei_dormitories',
  DormitoryUtilities: 'tsaipei_dormitoryUtilities',
  Meetings: 'tsaipei_meetings',
  ClientFeeSetup: 'tsaipei_clientFeeSetup',
  InternalFeeSetup: 'tsaipei_internalFeeSetup',
};

async function commitInBatches(writes) {
  const BATCH_LIMIT = 450; // Firestore hard cap is 500 writes/batch
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    writes.slice(i, i + BATCH_LIMIT).forEach(({ ref, data: docData }) => batch.set(ref, docData));
    await batch.commit();
  }
}

async function migrateSheet(sheetName, collectionName) {
  const rows = data[sheetName] || [];
  if (!rows.length) {
    console.log(`- ${sheetName}: 沒有資料，略過`);
    return;
  }
  const writes = rows
    .filter((row) => row.id !== '' && row.id != null)
    .map((row) => {
      const { id, ...rest } = row;
      return { ref: db.collection(collectionName).doc(String(id)), data: rest };
    });
  await commitInBatches(writes);
  console.log(`+ ${sheetName} -> ${collectionName}: ${writes.length} 筆`);
}

async function migrateRolePermissions() {
  const rows = data.RolePermissions || [];
  if (!rows.length) {
    console.log('- RolePermissions: 沒有資料，略過（沒關係，webapp 有內建預設權限）');
    return;
  }
  const writes = rows
    .filter((row) => row.module && row.role)
    .map((row) => ({
      ref: db.collection('tsaipei_rolePermissions').doc(`${row.module}__${row.role}`),
      data: { level: row.level },
    }));
  await commitInBatches(writes);
  console.log(`+ RolePermissions -> tsaipei_rolePermissions: ${writes.length} 筆`);
}

async function main() {
  console.log(`讀到的分頁：${Object.keys(data).join(', ')}`);
  for (const [sheetName, collectionName] of Object.entries(SHEET_TO_COLLECTION)) {
    await migrateSheet(sheetName, collectionName);
  }
  await migrateRolePermissions();
  console.log('\n完成！Users 分頁沒有匯入（webapp 改用 Firebase Auth，見 README 的帳號設定說明）。');
}

main().catch((err) => {
  console.error('匯入失敗：', err);
  process.exit(1);
});
