import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
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

async function deleteAllWhere(collectionName, field, value) {
  const snap = await getDocs(query(collection(db, collectionName), where(field, '==', value)));
  for (const d of snap.docs) await deleteDoc(d.ref);
  return snap.docs.map((d) => d.id);
}

async function deleteApplicationProgressCascade(progressId) {
  await deleteAllWhere('yujian_arrivedList', 'sourceCaseId', progressId);
  await deleteDoc(doc(db, 'yujian_applicationProgress', progressId));
}

async function deleteMatchCascade(matchId) {
  await deleteAllWhere('yujian_secondInterviews', 'matchId', matchId);
  await deleteAllWhere('yujian_admittedList', 'matchId', matchId);
  const progressSnap = await getDocs(query(collection(db, 'yujian_applicationProgress'), where('matchId', '==', matchId)));
  for (const d of progressSnap.docs) await deleteApplicationProgressCascade(d.id);
  await deleteDoc(doc(db, 'yujian_matches', matchId));
}

export async function deleteWorkerCascade(workerId) {
  const matchSnap = await getDocs(query(collection(db, 'yujian_matches'), where('workerId', '==', workerId)));
  for (const d of matchSnap.docs) await deleteMatchCascade(d.id);
  await deleteAllWhere('yujian_placementList', 'workerId', workerId);
  await deleteDoc(doc(db, 'yujian_workers', workerId));
}

export async function deleteEmployerCascade(employerId) {
  const matchSnap = await getDocs(query(collection(db, 'yujian_matches'), where('employerId', '==', employerId)));
  for (const d of matchSnap.docs) await deleteMatchCascade(d.id);
  await deleteDoc(doc(db, 'yujian_employers', employerId));
}
