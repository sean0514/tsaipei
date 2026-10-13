import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// 元凱（越南系統）新增學生後，同步連動到境外生實習系統（tsaipei）的學生
// 資料裡——兩個入口都要用到這套同步邏輯：StudentsPage.jsx 自己的「+ 新增
// 學生」，以及 ResumeLinksPage.jsx 把履歷表連結送進來的履歷「轉入學生
// 資料」。欄位對應到 tsaipei_students 既有的欄位（systems/tsaipei/
// StudentsPage.jsx 的 FIELDS），兩邊欄位名稱不完全一樣的地方做轉換：
// department(單一科系) → department1；hasCert/certType/certLevel →
// langProofType/langProofLevel（只有「有」或「已考試未領取證照」才算有
// 語言能力證明）。firestore.rules 已放行 vnCanEdit('students') 寫入這裡
// 提到的所有 tsaipei_* 集合。
export function tsaipeiStudentFields(vn) {
  return {
    chineseName: vn.chineseName || '',
    originalName: vn.originalName || '',
    school: vn.school || '',
    department1: vn.department || '',
    nationality: vn.nationality || '',
    gender: vn.gender || '',
    passportNumber: vn.hasPassport === 'Yes' ? (vn.passportNumber || '') : '',
    langProofType: (vn.hasCert === '有' || vn.hasCert === '已考試未領取證照')
      ? (vn.certType === 'TOCFL' ? '華語' : vn.certType === 'TOEIC' ? '多益' : '') : '',
    langProofLevel: (vn.hasCert === '有' || vn.hasCert === '已考試未領取證照') ? (vn.certLevel || '') : '',
    status: vn.status || '',
    sourceSupplier: vn.sourceSupplier || '',
  };
}

// 同步建立一筆對應的境外生實習系統學生資料，並比照 tsaipei 自己新增學生
// 的行為連鎖建一筆空白媒合紀錄；回傳新建立的 tsaipei_students 文件 ID，
// 呼叫端要自己把這個 ID 存回越南學生紀錄的 syncedTsaipeiStudentId 欄位。
export async function createSyncedTsaipeiStudent(vietnamStudentId, vietnamData) {
  const tsaipeiRef = await addDoc(collection(db, 'tsaipei_students'), {
    ...tsaipeiStudentFields(vietnamData),
    syncedFromVietnamId: vietnamStudentId,
    createdAt: serverTimestamp(),
  });
  await addDoc(collection(db, 'tsaipei_matches'), {
    studentId: tsaipeiRef.id, positionId: '', status: '媒合中', matchDate: '', notes: '（系統依元凱系統學生建檔自動建立）', createdAt: serverTimestamp(),
  });
  return tsaipeiRef.id;
}
