import { addDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// 元凱（越南系統）新增學生後，同步連動到境外生實習系統（tsaipei）的學生
// 資料裡——兩個入口都要用到這套同步邏輯：StudentsPage.jsx 自己的「+ 新增
// 學生」，以及 ResumeLinksPage.jsx 把履歷表連結送進來的履歷「轉入學生
// 資料」。欄位對應到 tsaipei_students 既有的欄位（systems/tsaipei/
// StudentsPage.jsx 的 FIELDS），兩邊欄位名稱不完全一樣的地方做轉換：
// department(單一科系) → department1；hasCert/certType/certLevel →
// langProofType/langProofLevel（只有「有」或「已考試未領取證照」才算有
// 語言能力證明）。school/department 在越南系統是學生自己填的越南文，同步
// 過來時改帶中文翻譯欄位 schoolZh/departmentZh（StudentsPage.jsx 離開欄位
// 時自動翻譯填入、人員可手動微調），沒有翻譯才退回用越南文原文，不然
// tsaipei 這邊的中文人員會看不懂學校/科系名稱。hasCert/certType/certLevel/
// desiredIndustries 這幾個
// 履歷表特有的欄位也原樣同步過去（tsaipei_students 的 FIELDS 新增了這幾
// 個欄位來顯示），方便 tsaipei 這邊的使用者直接看到元凱同步過來的學生是否
// 有華語證照、期望產業別，不用另外切到越南系統查。firestore.rules 已放行
// vnCanEdit('students') 寫入這裡提到的所有 tsaipei_* 集合。
export function tsaipeiStudentFields(vn) {
  return {
    chineseName: vn.chineseName || '',
    originalName: vn.originalName || '',
    school: vn.schoolZh || vn.school || '',
    department1: vn.departmentZh || vn.department || '',
    nationality: vn.nationality || '',
    gender: vn.gender || '',
    passportNumber: vn.hasPassport === 'Yes' ? (vn.passportNumber || '') : '',
    langProofType: (vn.hasCert === '有' || vn.hasCert === '已考試未領取證照')
      ? (vn.certType === 'TOCFL' ? '華語' : vn.certType === 'TOEIC' ? '多益' : '') : '',
    langProofLevel: (vn.hasCert === '有' || vn.hasCert === '已考試未領取證照') ? (vn.certLevel || '') : '',
    hasCert: vn.hasCert || '',
    certType: vn.certType || '',
    certLevel: vn.certLevel || '',
    desiredIndustries: vn.desiredIndustries || '',
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

// 反過來的方向：境外生實習系統（tsaipei_students）裡學生來源是元凱/越南的
// 那幾個 ALLOWED_SOURCE_SUPPLIERS，一開始就是直接在 tsaipei 建檔，不是從
// 元凱系統同步過去的，越南系統自己的 vietnam_students 裡沒有對應紀錄——
// 「越南辦理簽證」(VisaProcessingPage.jsx) 建立紀錄時，呼叫這個函式確保
// 越南系統也有一筆對應的學生資料，這樣「越南送機行程」(DepartureTransportPage.jsx，
// 讀 vietnam_students) 才能選到這位學生、建立送機紀錄。先用護照號碼配對，
// 配不到再用中文姓名+原始姓名配對，兩者都配不到才新建一筆（新建的紀錄
// 存 syncedFromTsaipeiStudentId 方便追溯來源，跟反方向 createSyncedTsaipeiStudent
// 建立的 tsaipei_students 紀錄存 syncedFromVietnamId 對稱）。
export async function ensureVietnamStudentForTsaipeiStudent(tsaipeiStudentId, ts) {
  if (!ts) return null;
  const passportNumber = ts.passportNumber || '';
  const snap = await getDocs(collection(db, 'vietnam_students'));
  const matched = snap.docs.find((d) => {
    const v = d.data();
    if (passportNumber && v.passportNumber === passportNumber) return true;
    return !!(ts.chineseName && ts.originalName && v.chineseName === ts.chineseName && v.originalName === ts.originalName);
  });
  if (matched) return matched.id;
  const ref = await addDoc(collection(db, 'vietnam_students'), {
    chineseName: ts.chineseName || '',
    originalName: ts.originalName || '',
    school: ts.school || '',
    nationality: ts.nationality || '',
    gender: ts.gender || '',
    hasPassport: passportNumber ? 'Yes' : '',
    passportNumber,
    syncedFromTsaipeiStudentId: tsaipeiStudentId,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}
