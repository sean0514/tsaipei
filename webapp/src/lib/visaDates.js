// 「是否已離台」的共用判斷：在台簽證追蹤(tsaipei_inTaiwanVisa)、在台關懷
// 紀錄(tsaipei_inTaiwanCare，透過已同步的學生資料)、首頁待關心清單都要
// 用同一套規則，才能真正連動——不是各自維護一個手動勾選的「確認離台」
// 欄位，而是直接從同一批日期欄位(firstEntryDate/firstExitDate/
// secondEntryDate/secondExitDate)算出來，兩邊看到的結果保證一致。
//
// 規則：
// 1. 有填第二次離台時間 → 是否離台看這個日期是否已到期(今天或之前)。
// 2. 沒有第二次離台時間、但已經填了第二次入台時間 → 代表這個人排定
//    還會再入境一次，現在只是兩次入境之間的空檔，不算「已離台」。
// 3. 都沒有第二次相關日期 → 退回看第一次離台時間是否已到期(只入境一次
//    就結束實習的人，離境後才算真正離台)。
export function isDeparted(record, today = new Date().toISOString().slice(0, 10)) {
  if (!record) return false;
  if (record.secondExitDate) return record.secondExitDate <= today;
  if (record.secondEntryDate) return false;
  return !!record.firstExitDate && record.firstExitDate <= today;
}
