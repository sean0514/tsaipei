// 獎學金請款單：列印版做法比照 lib/monthlyVisitRecord.js 的
// printMonthlyVisitRecord——不用先下載檔案再打開才能印，直接在新分頁
// 組一份 HTML，呼叫瀏覽器內建列印（也可以選擇列印成 PDF）。這份 HTML
// 之後也打算直接拿來當入台提醒信的內容/附件，所以欄位盡量自己完整帶
// 清楚（學生姓名/護照號碼/學校/實習單位/獎學金金額幣別/匯款帳戶），
// 不依賴列印當下還開著哪個頁面。

function escapeHtml(text) {
  return String(text == null ? '' : text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildPrintHtml(data) {
  const infoRows = [
    ['學生姓名', 'Họ tên học sinh', data.studentName],
    ['護照號碼', 'Số hộ chiếu', data.passportNumber],
    ['國籍', 'Quốc tịch', data.nationality],
    ['就讀學校', 'Trường học', data.school],
    ['實習單位', 'Đơn vị thực tập', data.company],
  ].map(([zh, vi, value]) => `<tr><th>${escapeHtml(zh)}<div class="vi">${escapeHtml(vi)}</div></th><td>${escapeHtml(value)}</td></tr>`).join('');

  const amountRows = [
    ['獎學金金額', 'Số tiền học bổng', `${Number(data.amount || 0).toLocaleString()} ${data.currency || ''}`],
    ['匯款銀行', 'Ngân hàng chuyển khoản', data.bankName],
    ['匯款帳號', 'Số tài khoản', data.bankAccountNumber],
  ].map(([zh, vi, value]) => `<tr><th>${escapeHtml(zh)}<div class="vi">${escapeHtml(vi)}</div></th><td>${escapeHtml(value)}</td></tr>`).join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(data.studentName)}_獎學金請款單</title>
<style>
  body { font-family: "標楷體", "PMingLiU", sans-serif; padding: 24px; color: #111; }
  h1 { font-size: 20px; margin-bottom: 2px; }
  .vi { font-size: 12px; font-style: italic; color: #555; }
  .meta { color: #555; font-size: 13px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th, td { border: 1px solid #999; padding: 6px 10px; font-size: 14px; text-align: left; vertical-align: top; }
  th { width: 160px; background: #f5f5f5; }
  .section-label { font-weight: bold; margin-top: 10px; }
  .fill-line { margin-bottom: 6px; }
  .signature-row { display: flex; gap: 40px; margin-top: 40px; }
  .signature-row > div { flex: 1; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>獎學金請款單</h1>
  <div class="vi">Đơn yêu cầu chi trả học bổng</div>
  <div class="meta">${escapeHtml(data.issueDate || '')}</div>
  <table>${infoRows}</table>
  <table>${amountRows}</table>
  ${data.note ? `<div class="section-label">備註 <span class="vi">Ghi chú</span></div><div class="fill-line">${escapeHtml(data.note)}</div>` : ''}
  <div class="signature-row">
    <div>
      <div class="section-label">申請人簽名 <span class="vi">Chữ ký người đề nghị</span></div>
      <div class="fill-line">＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿</div>
    </div>
    <div>
      <div class="section-label">主管核准 <span class="vi">Người phê duyệt</span></div>
      <div class="fill-line">＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿</div>
    </div>
  </div>
</body>
</html>`;
}

// data 格式見 ScholarshipsPage.jsx 呼叫端組出來的物件：
// { studentName, passportNumber, nationality, school, company, amount,
//   currency, bankName, bankAccountNumber, note, issueDate }
export function printScholarshipBillingForm(data) {
  const win = window.open('', '_blank');
  if (!win) {
    alert('瀏覽器擋住了列印視窗，請允許這個網站的彈出視窗後再試一次。');
    return;
  }
  win.document.open();
  win.document.write(buildPrintHtml(data));
  win.document.close();
  win.addEventListener('load', () => win.print());
}
