// One-time backfill script: PR #324 changed the Vietnam-system→tsaipei
// student sync (lib/vietnamTsaipeiStudentSync.js) to prefer the Chinese
// translation fields (schoolZh/departmentZh) over the Vietnamese originals
// (school/department) when filling in a tsaipei_students record's school/
// department1. That fix only takes effect on a *new* sync write (creating a
// student, or re-saving an existing synced vietnam_students record) — it
// doesn't touch tsaipei_students records that were already synced before
// the fix and haven't been re-saved since, so those still hold the old
// Vietnamese text. This script backfills those existing records once.
//
// For every tsaipei_students doc with a syncedFromVietnamId, look up the
// matching vietnam_students doc and, if it has schoolZh/departmentZh filled
// in, overwrite the tsaipei doc's school/department1 with the Chinese
// translation (leaves it alone if the vietnam record has no translation yet
// — same fallback behavior as the live sync).
//
// Usage (from webapp/):
//   node scripts/backfill-vietnam-school-dept.mjs <path-to-service-account.json> [--dry-run]
// or, with the service account JSON in an env var instead of a file:
//   FIREBASE_SERVICE_ACCOUNT_JSON='{...}' node scripts/backfill-vietnam-school-dept.mjs [--dry-run]
//
// Not part of the deployed app — safe to delete this file once the backfill
// is done.

import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const [, , arg1, arg2] = process.argv;
const serviceAccountPath = arg1 === '--dry-run' ? null : arg1;
const dryRun = arg1 === '--dry-run' || arg2 === '--dry-run';

const serviceAccountRaw = serviceAccountPath
  ? readFileSync(serviceAccountPath, 'utf8')
  : process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountRaw) {
  console.error('Usage: node scripts/backfill-vietnam-school-dept.mjs <service-account.json> [--dry-run]');
  console.error('   or: FIREBASE_SERVICE_ACCOUNT_JSON=\'{...}\' node scripts/backfill-vietnam-school-dept.mjs [--dry-run]');
  process.exit(1);
}
const serviceAccount = JSON.parse(serviceAccountRaw);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const vietnamSnap = await db.collection('vietnam_students').get();
  const vietnamById = new Map(vietnamSnap.docs.map((d) => [d.id, d.data()]));

  const tsaipeiSnap = await db.collection('tsaipei_students')
    .where('syncedFromVietnamId', '!=', '')
    .get();

  const writes = [];
  let skippedNoTranslation = 0;
  let skippedNoVietnamDoc = 0;

  tsaipeiSnap.docs.forEach((doc) => {
    const data = doc.data();
    const vn = vietnamById.get(data.syncedFromVietnamId);
    if (!vn) { skippedNoVietnamDoc++; return; }

    const update = {};
    if (vn.schoolZh && data.school !== vn.schoolZh) update.school = vn.schoolZh;
    if (vn.departmentZh && data.department1 !== vn.departmentZh) update.department1 = vn.departmentZh;

    if (Object.keys(update).length === 0) { skippedNoTranslation++; return; }
    writes.push({ ref: doc.ref, before: { school: data.school, department1: data.department1 }, update });
  });

  console.log(`共 ${tsaipeiSnap.size} 筆已同步學生，需要補件 ${writes.length} 筆；沒有對應元凱紀錄 ${skippedNoVietnamDoc} 筆、元凱還沒填中文翻譯或內容已一致 ${skippedNoTranslation} 筆。`);
  writes.forEach(({ ref, before, update }) => {
    console.log(`- ${ref.id}: ${JSON.stringify(before)} -> ${JSON.stringify(update)}`);
  });

  if (dryRun) {
    console.log('\n--dry-run：沒有實際寫入，確認上面清單沒問題後，拿掉 --dry-run 再跑一次。');
    return;
  }

  const BATCH_LIMIT = 450;
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    writes.slice(i, i + BATCH_LIMIT).forEach(({ ref, update }) => batch.update(ref, update));
    await batch.commit();
  }
  console.log(`\n完成，已更新 ${writes.length} 筆。`);
}

main().catch((err) => {
  console.error('補件失敗：', err);
  process.exit(1);
});
