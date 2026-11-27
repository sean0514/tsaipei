// 每月訪視紀錄表產生器：把學生/實習單位資料＋這個月填的訪視內容組成一份
// 中越雙語 .docx（跟使用者上傳的官方範本同一套欄位），用 docx 套件在瀏覽器
// 端組出來，不是直接改官方範本檔案本身。

export const VISIT_METHODS = ['實地訪視', '視訊訪視', '電話訪談'];

// 工作面訪視項目跟範本一致，「遵守公司規範」在範本裡是另一個小表格，但
// 欄位結構完全相同，這裡併進同一份清單一起填，畫面上不用切兩個表格。
export const WORK_ITEMS = ['出勤狀況', '工作態度', '專業技能學習', '工作效率', '團隊合作', '與主管溝通情形', '遵守公司規範'];
export const WORK_RATING_OPTIONS = ['良好', '普通', '待改善'];

export const LIFE_ITEMS = ['住宿環境', '交通往返', '飲食適應', '身心狀況', '人際互動', '中文溝通能力'];
export const LIFE_RATING_OPTIONS = ['良好', '普通', '待協助'];

export const RESULT_OPTIONS = ['表現良好，持續追蹤', '需加強專業技能訓練', '需加強生活輔導', '需安排後續輔導會談', '其他'];

// 文件 ID 固定用「學生ID_月份」，不用亂數 ID——這樣學生/企業主管填寫連結
// (/apply/visitRecord/:studentId/:month/:role) 才能只靠這兩個資訊直接
// get 到對應那一筆，不需要先查詢（Firestore 規則可以放行「get 單一文件」
// 但不放行「list 整個集合」，避免公開連結被拿來枚舉其他學生的紀錄）。
export function visitRecordDocId(studentId, month) {
  return `${studentId}_${month}`;
}

// 線上填寫連結各自只能改自己負責的欄位，跟 firestore.rules 的
// tsIsPublicVisitFieldUpdate() 保持一致：學生填「生活適應情況」評核表、
// 自己的意見（含簽名），以及「本月學習成果」整組（本月完成之工作內容/
// 本月學習收穫/遇到之困難/下月學習目標，這些是學生自己這個月的狀況，
// 由學生自己填寫才準確），企業主管填「實習狀況」評核表跟主管意見（含
// 簽名），其餘欄位（訪視日期/方式/人員、訪視結果、訪視人員簽名）只有
// 內部人員能動。
export const STUDENT_PUBLIC_FIELDS = [
  'studentComment', 'lifeRatings', 'lifeNotes', 'studentSignature',
  'monthlyWorkDone', 'monthlyLearning', 'difficulties', 'nextMonthGoals',
];
export const MANAGER_PUBLIC_FIELDS = ['managerComment', 'workRatings', 'workNotes', 'managerSignature'];

export function blankRatings(items) {
  const obj = {};
  items.forEach((k) => { obj[k] = ''; });
  return obj;
}
export function blankNotes(items) {
  const obj = {};
  items.forEach((k) => { obj[k] = ''; });
  return obj;
}

function box(checked) {
  return checked ? '☑' : '□';
}

// 簽名存成 PNG data URL，這裡轉成 docx ImageRun 需要的位元組陣列；
// 瀏覽器端用 atob 解 base64，跟 lib/fileAttachment.js 的 dataUrlToBlobUrl
// 同一套解法。
function dataUrlToUint8Array(dataUrl) {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// data: { studentName, passportNumber, nationality, company, venue, department,
//         visitDate, visitMethod, visitPersonnel,
//         workRatings, workNotes, lifeRatings, lifeNotes,
//         managerComment, studentComment,
//         monthlyWorkDone, monthlyLearning, difficulties, nextMonthGoals,
//         result: string[], resultOther,
//         studentSignature, managerSignature, staffSignature (皆為 PNG data URL 或空字串) }
function buildChildren(data, lib) {
  const { Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, WidthType, AlignmentType } = lib;
  const zhFont = '標楷體';

  // 有簽名就放圖片，沒有就留一條底線給人事後手寫簽名，不會讓這一格整個
  // 空白看不出來是要簽名的地方。
  function signatureBlock(labelZh, labelVi, dataUrl) {
    return [
      new Paragraph({ spacing: { before: 160 }, children: [new TextRun({ text: labelZh, bold: true, size: 22, font: zhFont }), new TextRun({ text: labelVi ? `  ${labelVi}` : '', italics: true, size: 18 })] }),
      dataUrl
        ? new Paragraph({ children: [new ImageRun({ data: dataUrlToUint8Array(dataUrl), transformation: { width: 200, height: 70 } })] })
        : new Paragraph({ children: [new TextRun({ text: '＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿', size: 22 })] }),
    ];
  }

  function titleRun(zh, vi) {
    return [
      new Paragraph({ children: [new TextRun({ text: zh, bold: true, size: 26, font: zhFont })] }),
      ...(vi ? [new Paragraph({ children: [new TextRun({ text: vi, italics: true, size: 20 })] })] : []),
    ];
  }

  function cell(zh, vi, opts = {}) {
    return new TableCell({
      width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
      children: [
        new Paragraph({ children: [new TextRun({ text: zh, bold: !!opts.bold, size: 22, font: zhFont })] }),
        ...(vi ? [new Paragraph({ children: [new TextRun({ text: vi, italics: true, size: 18 })] })] : []),
      ],
    });
  }

  function infoRow(labelZh, labelVi, valueZh) {
    return new TableRow({
      children: [
        cell(labelZh, labelVi, { width: 35, bold: true }),
        cell(valueZh || '', '', { width: 65 }),
      ],
    });
  }

  const infoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      infoRow('學生姓名', 'Họ tên học sinh', data.studentName),
      infoRow('護照號碼', 'Số hộ chiếu', data.passportNumber),
      infoRow('國籍', 'Quốc tịch', data.nationality),
      infoRow('實習企業', 'Công ty thực tập', data.company),
      infoRow('實習分店', 'Bộ phận thực tập', data.venue),
      infoRow('實習部門', 'Phòng thực tập', data.department),
      infoRow('訪視日期', 'Thời gian thăm', data.visitDate),
      infoRow('訪視方式', 'Phương pháp thăm', data.visitMethod),
      infoRow('訪視人員', 'Người thăm', data.visitPersonnel),
    ],
  });

  function ratingTable(items, ratingOptions, ratings, notes) {
    const header = new TableRow({
      children: [
        cell('訪視項目', 'Các mục thăm', { width: 28, bold: true }),
        ...ratingOptions.map((o) => cell(o, '', { width: 16, bold: true })),
        cell('備註', 'Nhận xét', { width: 24, bold: true }),
      ],
    });
    const rows = items.map((item) => new TableRow({
      children: [
        cell(item, '', { width: 28 }),
        ...ratingOptions.map((o) => new TableCell({ width: { size: 16, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: box(ratings[item] === o), size: 24 })] })] })),
        new TableCell({ width: { size: 24, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: notes[item] || '', size: 20 })] })] }),
      ],
    }));
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...rows] });
  }

  function textSection(zh, vi, value) {
    return [
      new Paragraph({ spacing: { before: 160 }, children: [new TextRun({ text: zh, bold: true, size: 22, font: zhFont }), new TextRun({ text: vi ? `  ${vi}` : '', italics: true, size: 18 })] }),
      new Paragraph({ children: [new TextRun({ text: value || '＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿', size: 22 })] }),
    ];
  }

  const resultLines = RESULT_OPTIONS.map((o) => new Paragraph({
    children: [new TextRun({ text: `${box((data.result || []).includes(o))} ${o}${o === '其他' && data.resultOther ? '：' + data.resultOther : ''}`, size: 22 })],
  }));

  return [
    ...titleRun('外國籍實習生每月訪視紀錄表', 'Mẫu phiếu ghi chuyến thăm hàng tháng dành cho thực tập sinh nước ngoài'),
    new Paragraph({ text: '' }),
    infoTable,
    new Paragraph({ text: '' }),
    new Paragraph({ children: [new TextRun({ text: '實習狀況 Tình trạng thực tập', bold: true, size: 24, font: zhFont })] }),
    ratingTable(WORK_ITEMS, WORK_RATING_OPTIONS, data.workRatings || {}, data.workNotes || {}),
    ...textSection('企業主管意見', 'Ý kiến của giám đốc điều hành doanh nghiệp', data.managerComment),
    ...signatureBlock('企業主管簽名', 'Chữ ký giám đốc điều hành', data.managerSignature),
    new Paragraph({ spacing: { before: 160 }, children: [new TextRun({ text: '生活適應情況 Thích nghi với cuộc sống', bold: true, size: 24, font: zhFont })] }),
    ratingTable(LIFE_ITEMS, LIFE_RATING_OPTIONS, data.lifeRatings || {}, data.lifeNotes || {}),
    ...textSection('學生意見', 'Ý kiến học sinh', data.studentComment),
    ...signatureBlock('學生簽名', 'Chữ ký học sinh', data.studentSignature),
    new Paragraph({ spacing: { before: 160 }, children: [new TextRun({ text: '本月學習成果 kết quả học tập tháng', bold: true, size: 24, font: zhFont })] }),
    ...textSection('本月完成之工作內容', 'Công việc đã hoàn thành trong tháng', data.monthlyWorkDone),
    ...textSection('本月學習收穫', 'Học tập đạt được trong tháng', data.monthlyLearning),
    ...textSection('遇到之困難', 'những khó khăn gặp phải', data.difficulties),
    ...textSection('下月學習目標', 'Mục tiêu học tập cho tháng tới', data.nextMonthGoals),
    new Paragraph({ spacing: { before: 160 }, children: [new TextRun({ text: '訪視結果 kết quả chuyến thăm', bold: true, size: 24, font: zhFont })] }),
    ...resultLines,
    ...signatureBlock('訪視人員簽名', 'Chữ ký người thăm', data.staffSignature),
    new Paragraph({ spacing: { before: 160 }, children: [new TextRun({ text: '訪視照片：如附件。', size: 22, font: zhFont })] }),
  ];
}

// docx 動態載入，只有真的下載時才載入，不放進主要 bundle。
export async function downloadMonthlyVisitRecord(filename, data) {
  const lib = await import('docx');
  const { Document, Packer } = lib;
  const doc = new Document({ sections: [{ children: buildChildren(data, lib) }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(text) {
  return String(text == null ? '' : text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 列印版：不用先下載 .docx 再打開才能印，直接在新分頁組一份排版接近的
// HTML，呼叫瀏覽器內建列印。跟 buildChildren 用同一份 data，欄位/順序
// 盡量對齊 Word 版本。
function buildPrintHtml(data) {
  const checkbox = (checked) => (checked ? '☑' : '☐');
  const infoRows = [
    ['學生姓名', 'Họ tên học sinh', data.studentName],
    ['護照號碼', 'Số hộ chiếu', data.passportNumber],
    ['國籍', 'Quốc tịch', data.nationality],
    ['實習企業', 'Công ty thực tập', data.company],
    ['實習分店', 'Bộ phận thực tập', data.venue],
    ['實習部門', 'Phòng thực tập', data.department],
    ['訪視日期', 'Thời gian thăm', data.visitDate],
    ['訪視方式', 'Phương pháp thăm', data.visitMethod],
    ['訪視人員', 'Người thăm', data.visitPersonnel],
  ].map(([zh, vi, value]) => `<tr><th>${escapeHtml(zh)}<div class="vi">${escapeHtml(vi)}</div></th><td>${escapeHtml(value)}</td></tr>`).join('');

  function ratingTableHtml(items, options, ratings, notes) {
    const header = `<tr><th>訪視項目</th>${options.map((o) => `<th>${escapeHtml(o)}</th>`).join('')}<th>備註</th></tr>`;
    const rows = items.map((item) => `<tr><td>${escapeHtml(item)}</td>${options.map((o) => `<td class="center">${checkbox(ratings[item] === o)}</td>`).join('')}<td>${escapeHtml(notes[item] || '')}</td></tr>`).join('');
    return `<table class="rating-table">${header}${rows}</table>`;
  }

  function textSectionHtml(zh, vi, value) {
    return `<div class="section-label">${escapeHtml(zh)} <span class="vi">${escapeHtml(vi)}</span></div><div class="fill-line">${value ? escapeHtml(value) : '＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿'}</div>`;
  }

  function signatureHtml(zh, vi, dataUrl) {
    return `<div class="section-label">${escapeHtml(zh)} <span class="vi">${escapeHtml(vi)}</span></div>${dataUrl ? `<img class="signature" src="${dataUrl}" alt="${escapeHtml(zh)}" />` : '<div class="fill-line">＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿</div>'}`;
  }

  const resultLines = RESULT_OPTIONS.map((o) => `<div>${checkbox((data.result || []).includes(o))} ${escapeHtml(o)}${o === '其他' && data.resultOther ? `：${escapeHtml(data.resultOther)}` : ''}</div>`).join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(data.studentName)}_${escapeHtml(data.month || '')}_每月訪視紀錄表</title>
<style>
  body { font-family: "標楷體", "PMingLiU", sans-serif; padding: 24px; color: #111; }
  h1 { font-size: 20px; margin-bottom: 2px; }
  .vi { font-size: 12px; font-style: italic; color: #555; }
  h2 { font-size: 16px; margin: 18px 0 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th, td { border: 1px solid #999; padding: 4px 8px; font-size: 13px; text-align: left; vertical-align: top; }
  .rating-table th, .rating-table td { text-align: center; }
  .rating-table td:first-child { text-align: left; }
  .center { text-align: center; }
  .section-label { font-weight: bold; margin-top: 10px; }
  .fill-line { margin-bottom: 6px; }
  .signature { display: block; width: 160px; height: 56px; object-fit: contain; border: 1px solid #999; margin-bottom: 6px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>外國籍實習生每月訪視紀錄表</h1>
  <div class="vi">Mẫu phiếu ghi chuyến thăm hàng tháng dành cho thực tập sinh nước ngoài</div>
  <table>${infoRows}</table>
  <h2>實習狀況 <span class="vi">Tình trạng thực tập</span></h2>
  ${ratingTableHtml(WORK_ITEMS, WORK_RATING_OPTIONS, data.workRatings || {}, data.workNotes || {})}
  ${textSectionHtml('企業主管意見', 'Ý kiến của giám đốc điều hành doanh nghiệp', data.managerComment)}
  ${signatureHtml('企業主管簽名', 'Chữ ký giám đốc điều hành', data.managerSignature)}
  <h2>生活適應情況 <span class="vi">Thích nghi với cuộc sống</span></h2>
  ${ratingTableHtml(LIFE_ITEMS, LIFE_RATING_OPTIONS, data.lifeRatings || {}, data.lifeNotes || {})}
  ${textSectionHtml('學生意見', 'Ý kiến học sinh', data.studentComment)}
  ${signatureHtml('學生簽名', 'Chữ ký học sinh', data.studentSignature)}
  <h2>本月學習成果 <span class="vi">kết quả học tập tháng</span></h2>
  ${textSectionHtml('本月完成之工作內容', 'Công việc đã hoàn thành trong tháng', data.monthlyWorkDone)}
  ${textSectionHtml('本月學習收穫', 'Học tập đạt được trong tháng', data.monthlyLearning)}
  ${textSectionHtml('遇到之困難', 'những khó khăn gặp phải', data.difficulties)}
  ${textSectionHtml('下月學習目標', 'Mục tiêu học tập cho tháng tới', data.nextMonthGoals)}
  <h2>訪視結果 <span class="vi">kết quả chuyến thăm</span></h2>
  ${resultLines}
  ${signatureHtml('訪視人員簽名', 'Chữ ký người thăm', data.staffSignature)}
  <div style="margin-top: 10px;">訪視照片：如附件。</div>
</body>
</html>`;
}

// 列印：開一個新分頁組出排版接近 Word 版的 HTML，載入完成後自動叫出
// 瀏覽器的列印對話框；使用者取消列印或印完，這個分頁留著方便再印一次，
// 自行關閉即可。彈出視窗被瀏覽器擋掉的話會提示使用者手動允許。
export function printMonthlyVisitRecord(data) {
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
