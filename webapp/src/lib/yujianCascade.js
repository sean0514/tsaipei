import { addDoc, collection, doc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

// 案件（申辦進度追蹤／已入台名單）的進度狀態，或轉出/離境紀錄清單裡任一筆
// 的狀態，只要出現「已接離/轉出中/已轉出/已離台」其中之一，就要連動安置中
// 名單——兩個分頁共用同一套判斷與建立邏輯，才不會其中一邊漏掉。
export function hasTransferStatus(data, transferStepStatuses) {
  if (transferStepStatuses.includes(data?.status)) return true;
  return (data?.transferSteps || []).some((s) => transferStepStatuses.includes(s.status));
}

export async function ensurePlacementRecord(workerId) {
  const existing = await getDocs(query(collection(db, 'yujian_placementList'), where('workerId', '==', workerId)));
  if (!existing.empty) return;
  await addDoc(collection(db, 'yujian_placementList'), { workerId, status: '安置中' });
}

// 錄取名單狀態變成「確認錄取」時自動建立申辦進度追蹤案件（以媒合紀錄為
// 單位），比照境外實習生系統。媒合紀錄/錄取名單兩個分頁都會呼叫這個函式，
// 確保不管從哪邊觸發，最後都會建立同一筆進度追蹤案件（依 matchId 去重）。
export async function ensureApplicationProgressFromMatch(match, { admitDate, workers, employers }) {
  if (!match?.id) return;
  const existing = await getDocs(query(collection(db, 'yujian_applicationProgress'), where('matchId', '==', match.id)));
  if (!existing.empty) return;
  const worker = workers.find((w) => w.id === match.workerId);
  const employer = employers.find((e) => e.id === match.employerId);
  await addDoc(collection(db, 'yujian_applicationProgress'), {
    matchId: match.id, workerId: match.workerId || '', employerName: employer?.employerName || '',
    nationality: worker?.nationality || '', foreignAgency: worker?.foreignAgency || '',
    taiwanAgency: match.taiwanAgency || employer?.taiwanAgency || '',
    admissionConfirmedDate: admitDate || '', status: '進行中', notes: [],
  });
}

// 媒合紀錄狀態變成「已錄取」時，自動在錄取名單建立或更新一筆「確認錄取」
// 紀錄（依 matchId 去重），並接著自動連動建立申辦進度追蹤案件。
export async function ensureAdmittedRecord(match, { admitDate, status, workers, employers }) {
  if (!match?.id) return;
  const existing = await getDocs(query(collection(db, 'yujian_admittedList'), where('matchId', '==', match.id)));
  if (existing.empty) {
    await addDoc(collection(db, 'yujian_admittedList'), {
      matchId: match.id, status, admitDate: admitDate || '', notes: '（系統依媒合紀錄已錄取自動建立）',
    });
  } else if (existing.docs[0].data().status !== status) {
    await updateDoc(existing.docs[0].ref, { status });
  }
  if (status === '確認錄取') {
    await ensureApplicationProgressFromMatch(match, { admitDate, workers, employers });
  }
}

// 刪除看護/家事人員資料或雇主家庭/需求單時，把相關聯的媒合紀錄（以及媒合
// 紀錄再往下自動連動出去的二面進度/錄取名單/申辦進度追蹤/已入台名單）一併
// 清掉，避免留下指向已刪除人員/雇主的孤兒紀錄。
//
// 做法是先把所有要刪的文件參考收集起來，最後才一次用 writeBatch 送出，
// 不要邊收集邊逐筆 await deleteDoc：逐筆刪除如果中途失敗（例如斷線），
// 會留下刪了一半的狀態（例如二面進度刪掉了，但同一筆媒合紀錄底下的錄取
// 名單、申辦進度追蹤還留著，變成無法從畫面上發現、也沒有清楚方法修復的
// 孤兒資料）。改成收集完才一起送出，一次刪除動作要刪的所有相關紀錄會
// 一起成功或一起失敗。

async function collectRefsWhere(collectionName, field, value) {
  const snap = await getDocs(query(collection(db, collectionName), where(field, '==', value)));
  return snap.docs.map((d) => d.ref);
}

async function collectApplicationProgressCascadeRefs(progressId) {
  const refs = await collectRefsWhere('yujian_arrivedList', 'sourceCaseId', progressId);
  refs.push(doc(db, 'yujian_applicationProgress', progressId));
  return refs;
}

async function collectMatchCascadeRefs(matchId) {
  const refs = [
    ...(await collectRefsWhere('yujian_secondInterviews', 'matchId', matchId)),
    ...(await collectRefsWhere('yujian_admittedList', 'matchId', matchId)),
  ];
  const progressSnap = await getDocs(query(collection(db, 'yujian_applicationProgress'), where('matchId', '==', matchId)));
  for (const d of progressSnap.docs) refs.push(...(await collectApplicationProgressCascadeRefs(d.id)));
  refs.push(doc(db, 'yujian_matches', matchId));
  return refs;
}

// Firestore 單個 batch 上限 500 個操作，一般使用情境下一位工人/雇主關聯到
// 的紀錄數遠低於這個量；真的超過才分批送出（分批之間就不是同一個原子
// 操作了，但仍遠優於逐筆個別 await deleteDoc）。
async function commitDeletes(refs) {
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db);
    refs.slice(i, i + 450).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

export async function deleteWorkerCascade(workerId) {
  const matchSnap = await getDocs(query(collection(db, 'yujian_matches'), where('workerId', '==', workerId)));
  const refs = [];
  for (const d of matchSnap.docs) refs.push(...(await collectMatchCascadeRefs(d.id)));
  refs.push(...(await collectRefsWhere('yujian_placementList', 'workerId', workerId)));
  refs.push(doc(db, 'yujian_workers', workerId));
  await commitDeletes(refs);
}

export async function deleteEmployerCascade(employerId) {
  const matchSnap = await getDocs(query(collection(db, 'yujian_matches'), where('employerId', '==', employerId)));
  const refs = [];
  for (const d of matchSnap.docs) refs.push(...(await collectMatchCascadeRefs(d.id)));
  refs.push(doc(db, 'yujian_employers', employerId));
  await commitDeletes(refs);
}
