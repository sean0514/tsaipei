import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

// A student can go through housing more than once (e.g. a returning student
// on a new internship cycle). Their earlier housingRecords doc may already
// be marked completed (退宿完成，畫面上會被 HousingPage 的 classify() 隱藏），
// so checking "any doc exists" would wrongly skip creating a fresh record
// for the new cycle. Only an active (not completed) record counts as
// "already has one".
export async function hasActiveHousingRecord(studentId) {
  const snap = await getDocs(query(collection(db, 'tsaipei_housingRecords'), where('studentId', '==', studentId)));
  return snap.docs.some((d) => !d.data().completed);
}
