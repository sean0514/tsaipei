import { collection, deleteDoc, doc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

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
