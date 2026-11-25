import { addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';

// 印尼系統學生對應的境外生系統(tsaipei_students) id，依建檔方向分別存在
// 兩個不同欄位：這個學生本來就是印尼系統建檔、同步建立對應 tsaipei 紀錄
// 的（StudentsPage.jsx 的「+ 新增學生」、ResumeLinksPage.jsx 的「轉入學生
// 資料」）存在 syncedTsaipeiStudentId；反過來，學生本來是 tsaipei 系統
// 建檔、印尼系統只是連動補建鏡像紀錄的（見下面
// ensureIndonesiaStudentForTsaipeiStudent/backfillIndonesiaStudentsForTsaipeiStudents）
// 存在 syncedFromTsaipeiStudentId。只查其中一個欄位會漏掉另一個方向建檔
// 的學生，要同時查兩個欄位才能涵蓋全部。
export function tsaipeiIdOf(student) {
  return student?.syncedTsaipeiStudentId || student?.syncedFromTsaipeiStudentId || null;
}

// 印尼系統很多頁面原本讀 indonesia_inTaiwanVisa 當作「這個學生的在台簽證
// 追蹤紀錄」，但整個系統沒有任何地方會真的寫入這個 collection（學生
// 建檔/同步時不會像送機行程那樣順便建一筆對應的空白紀錄），一直是空的——
// 實際入境/離境日期、已體檢/已送工都記在境外生系統的 tsaipei_inTaiwanVisa，
// 用學生對應的境外生 id 查。這裡把 tsaipei_inTaiwanVisa 的紀錄依印尼學生
// 清單重新掛上印尼學生 id（原本的 studentId 會被換掉，其餘欄位不變），
// 讓呼叫端可以直接拿來當成「indonesia_inTaiwanVisa」原本預期的資料格式用，
// 不用每個頁面各自重新寫一次換算邏輯。找不到對應境外生 id、或境外生那邊
// 沒有對應紀錄的學生，就不會出現在回傳陣列裡（等同於「沒有這筆紀錄」，
// 跟原本讀空 collection 時的行為一致，呼叫端不用另外處理）。
export function indonesiaInTaiwanVisaShim(indonesiaStudents, tsaipeiInTaiwanVisaRecords) {
  const byTsaipeiId = {};
  (tsaipeiInTaiwanVisaRecords || []).forEach((v) => { byTsaipeiId[v.studentId] = v; });
  return (indonesiaStudents || [])
    .map((s) => {
      const tsaipeiId = tsaipeiIdOf(s);
      const v = tsaipeiId ? byTsaipeiId[tsaipeiId] : null;
      return v ? { ...v, studentId: s.id } : null;
    })
    .filter(Boolean);
}

// 元凱（印尼系統）新增學生後，同步連動到境外生實習系統（tsaipei）的學生
// 資料裡——兩個入口都要用到這套同步邏輯：StudentsPage.jsx 自己的「+ 新增
// 學生」，以及 ResumeLinksPage.jsx 把履歷表連結送進來的履歷「轉入學生
// 資料」。欄位對應到 tsaipei_students 既有的欄位（systems/tsaipei/
// StudentsPage.jsx 的 FIELDS），兩邊欄位名稱不完全一樣的地方做轉換：
// department(單一科系) → department1；hasCert/certType/certLevel →
// langProofType/langProofLevel（只有「有」或「已考試未領取證照」才算有
// 語言能力證明）。school/department 在印尼系統是學生自己填的印尼文，同步
// 過來時改帶中文翻譯欄位 schoolZh/departmentZh（StudentsPage.jsx 離開欄位
// 時自動翻譯填入、人員可手動微調），沒有翻譯才退回用印尼文原文，不然
// tsaipei 這邊的中文人員會看不懂學校/科系名稱。hasCert/certType/certLevel/
// desiredIndustries/birthDate 這幾個
// 履歷表特有的欄位也原樣同步過去（tsaipei_students 的 FIELDS 新增了這幾
// 個欄位來顯示），方便 tsaipei 這邊的使用者直接看到元凱同步過來的學生是否
// 有華語證照、期望產業別、出生日期（進而算出年齡），不用另外切到印尼系統查。
// firestore.rules 已放行
// vnCanEdit('students') 寫入這裡提到的所有 tsaipei_* 集合。
export function tsaipeiStudentFields(vn) {
  return {
    chineseName: vn.chineseName || '',
    originalName: vn.originalName || '',
    school: vn.schoolZh || vn.school || '',
    department1: vn.departmentZh || vn.department || '',
    nationality: vn.nationality || '',
    gender: vn.gender || '',
    birthDate: vn.birthDate || '',
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
// 呼叫端要自己把這個 ID 存回印尼學生紀錄的 syncedTsaipeiStudentId 欄位。
export async function createSyncedTsaipeiStudent(indonesiaStudentId, indonesiaData) {
  const tsaipeiRef = await addDoc(collection(db, 'tsaipei_students'), {
    ...tsaipeiStudentFields(indonesiaData),
    syncedFromIndonesiaId: indonesiaStudentId,
    createdAt: serverTimestamp(),
  });
  await addDoc(collection(db, 'tsaipei_matches'), {
    studentId: tsaipeiRef.id, positionId: '', status: '媒合中', matchDate: '', notes: '（系統依元凱系統學生建檔自動建立）', createdAt: serverTimestamp(),
  });
  return tsaipeiRef.id;
}

// 反過來的方向：境外生實習系統（tsaipei_students）裡學生來源是元凱/印尼的
// 那幾個 ALLOWED_SOURCE_SUPPLIERS，一開始就是直接在 tsaipei 建檔，不是從
// 元凱系統同步過去的，印尼系統自己的 indonesia_students 裡沒有對應紀錄——
// 「印尼辦理簽證」(VisaProcessingPage.jsx) 建立紀錄時，呼叫這個函式確保
// 印尼系統也有一筆對應的學生資料，這樣「印尼送機行程」(DepartureTransportPage.jsx，
// 讀 indonesia_students) 才能選到這位學生、建立送機紀錄。先用護照號碼配對，
// 配不到再用中文姓名+原始姓名配對，兩者都配不到才新建一筆（新建的紀錄
// 存 syncedFromTsaipeiStudentId 方便追溯來源，跟反方向 createSyncedTsaipeiStudent
// 建立的 tsaipei_students 紀錄存 syncedFromIndonesiaId 對稱）。
function findIndonesiaStudentMatch(indonesiaStudentDocs, ts) {
  const passportNumber = ts.passportNumber || '';
  return indonesiaStudentDocs.find((v) => {
    if (passportNumber && v.passportNumber === passportNumber) return true;
    return !!(ts.chineseName && ts.originalName && v.chineseName === ts.chineseName && v.originalName === ts.originalName);
  });
}

async function createIndonesiaStudentMirror(tsaipeiStudentId, ts) {
  const passportNumber = ts.passportNumber || '';
  const ref = await addDoc(collection(db, 'indonesia_students'), {
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

// 「印尼送機行程」(DepartureTransportPage.jsx) 的表格要能直接看到這位學生
// 並填日期/航班資訊，不用工作人員自己按「+新增」——這裡確保有一筆空白
// 紀錄（只有 studentId，日期/航班等欄位都還沒填），找不到才新建，不會
// 建出重複的空白列。
async function ensureDepartureTransportStub(indonesiaStudentId) {
  if (!indonesiaStudentId) return;
  const snap = await getDocs(query(collection(db, 'indonesia_departureTransport'), where('studentId', '==', indonesiaStudentId)));
  if (!snap.empty) return;
  await addDoc(collection(db, 'indonesia_departureTransport'), { studentId: indonesiaStudentId });
}

export async function ensureIndonesiaStudentForTsaipeiStudent(tsaipeiStudentId, ts) {
  if (!ts) return null;
  const snap = await getDocs(collection(db, 'indonesia_students'));
  const matched = findIndonesiaStudentMatch(snap.docs.map((d) => ({ id: d.id, ...d.data() })), ts);
  const indonesiaStudentId = matched ? matched.id : await createIndonesiaStudentMirror(tsaipeiStudentId, ts);
  await ensureDepartureTransportStub(indonesiaStudentId);
  return indonesiaStudentId;
}

// 補跑用：「印尼辦理簽證」頁面載入時，對目前名單裡所有學生都檢查一次有沒有
// 對應的印尼系統學生資料／送機行程空白紀錄，缺的就補建——這個同步機制上線
// 之前就已經存在的「印尼辦理簽證」紀錄（例如境外生實習系統那邊的連動曾經
// 因為權限規則寫錯而建立失敗，後來才修好，或是手動建檔時機更早）都不會有
// 對應紀錄，只靠新建時才同步是補不到這些舊資料的，要在這裡主動補一次。
// 印尼系統學生資料只打一次 getDocs(indonesia_students)，不是每位學生各自
// 打一次，避免名單一多就很慢；送機行程空白紀錄仍是每位學生各自查一次
// （where 查詢有索引，成本遠低於整個 collection 掃描）。
export async function backfillIndonesiaStudentsForTsaipeiStudents(tsStudentsWithIds) {
  if (!tsStudentsWithIds.length) return;
  const snap = await getDocs(collection(db, 'indonesia_students'));
  const indonesiaStudentDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  for (const { id, ...ts } of tsStudentsWithIds) {
    let matched = findIndonesiaStudentMatch(indonesiaStudentDocs, ts);
    if (!matched) {
      const newId = await createIndonesiaStudentMirror(id, ts);
      matched = { id: newId, ...ts };
      indonesiaStudentDocs.push(matched);
    }
    await ensureDepartureTransportStub(matched.id);
  }
}

// 補跑用：tsaipeiStudentFields() 一開始沒有同步 birthDate（後來才補上），
// 所以在那之前就已經同步過去的學生，境外生系統這邊 birthDate 一直是空的，
// 不會因為補上欄位對應就自動更新——要在這裡主動把舊資料補一次。只處理
// 「本來是從印尼系統同步過來的」（有 syncedFromIndonesiaId）且目前 birthDate
// 還空著的學生，不去動使用者自己在境外生系統填過的資料。
export async function backfillBirthDatesFromIndonesia(tsaipeiStudentsMissingBirthDate) {
  if (!tsaipeiStudentsMissingBirthDate.length) return;
  const snap = await getDocs(collection(db, 'indonesia_students'));
  const indonesiaStudentDocs = new Map(snap.docs.map((d) => [d.id, d.data()]));
  for (const { id, syncedFromIndonesiaId } of tsaipeiStudentsMissingBirthDate) {
    const vn = indonesiaStudentDocs.get(syncedFromIndonesiaId);
    if (vn?.birthDate) {
      await updateDoc(doc(db, 'tsaipei_students', id), { birthDate: vn.birthDate });
    }
  }
}
