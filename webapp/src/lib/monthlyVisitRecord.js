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

// data: { studentName, passportNumber, nationality, company, venue, department,
//         visitDate, visitMethod, visitPersonnel,
//         workRatings, workNotes, lifeRatings, lifeNotes,
//         managerComment, studentComment,
//         monthlyWorkDone, monthlyLearning, difficulties, nextMonthGoals,
//         result: string[], resultOther }
function buildChildren(data, lib) {
  const { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType } = lib;
  const zhFont = '標楷體';

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
    new Paragraph({ spacing: { before: 160 }, children: [new TextRun({ text: '生活適應情況 Thích nghi với cuộc sống', bold: true, size: 24, font: zhFont })] }),
    ratingTable(LIFE_ITEMS, LIFE_RATING_OPTIONS, data.lifeRatings || {}, data.lifeNotes || {}),
    ...textSection('學生意見', 'Ý kiến học sinh', data.studentComment),
    new Paragraph({ spacing: { before: 160 }, children: [new TextRun({ text: '本月學習成果 kết quả học tập tháng', bold: true, size: 24, font: zhFont })] }),
    ...textSection('本月完成之工作內容', 'Công việc đã hoàn thành trong tháng', data.monthlyWorkDone),
    ...textSection('本月學習收穫', 'Học tập đạt được trong tháng', data.monthlyLearning),
    ...textSection('遇到之困難', 'những khó khăn gặp phải', data.difficulties),
    ...textSection('下月學習目標', 'Mục tiêu học tập cho tháng tới', data.nextMonthGoals),
    new Paragraph({ spacing: { before: 160 }, children: [new TextRun({ text: '訪視結果 kết quả chuyến thăm', bold: true, size: 24, font: zhFont })] }),
    ...resultLines,
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
