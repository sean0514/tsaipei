// 學生請款單產生器：依「學生請款計算」當月試算出來的金額(含上月欠費)，
// 一位學生一份 .docx，多位學生打包成一個 .zip 一次下載。docx/jszip 都是
// 既有相依套件（jszip 本來就是 docx 套件打包 .docx 檔用的依賴，這裡直接
// 拿來打包多份輸出檔，不用再加新的執行環境依賴）。

function cell(lib, text, opts = {}) {
  const { Paragraph, TextRun, TableCell, WidthType, AlignmentType } = lib;
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      children: [new TextRun({ text: text == null ? '' : String(text), bold: !!opts.bold, size: opts.size || 22 })],
    })],
  });
}

// data: { studentName, dorm, payer, month, items: [{label, amount}],
//         total, previousOwed, grandTotal, status, partialDetail, remaining }
function buildChildren(data, lib) {
  const { Paragraph, TextRun, Table, TableRow, WidthType, AlignmentType } = lib;

  function infoRow(label, value) {
    return new TableRow({ children: [cell(lib, label, { width: 30, bold: true }), cell(lib, value, { width: 70 })] });
  }
  const infoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      infoRow('學生姓名', data.studentName),
      infoRow('宿舍名稱', data.dorm || '—'),
      infoRow('付款方式', data.payer || '—'),
      infoRow('月份', data.month),
    ],
  });

  function feeRow(label, amount, opts = {}) {
    return new TableRow({ children: [cell(lib, label, { width: 60, bold: opts.bold }), cell(lib, (amount || 0).toLocaleString(), { width: 40, bold: opts.bold, align: AlignmentType.RIGHT })] });
  }
  const feeTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      ...data.items.map((it) => feeRow(it.label, it.amount)),
      feeRow('本月合計', data.total, { bold: true }),
      feeRow('上月欠費', data.previousOwed),
      feeRow('應繳總額', data.grandTotal, { bold: true }),
    ],
  });

  return [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '學生請款單', bold: true, size: 32 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: data.month, size: 24 })] }),
    infoTable,
    new Paragraph({ text: '' }),
    feeTable,
    new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: `收款狀態：${data.status || '未收款'}`, size: 22 })] }),
    ...(data.partialDetail ? [new Paragraph({ children: [new TextRun({ text: `先繳部分明細：${data.partialDetail}`, size: 20 })] })] : []),
    ...(data.remaining ? [new Paragraph({ children: [new TextRun({ text: `剩餘未繳餘額：${data.remaining.toLocaleString()}`, size: 20 })] })] : []),
    new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: '請於收到本單後盡速繳款，如有疑問請聯繫承辦人員。', size: 20 })] }),
  ];
}

// Windows 檔名不能有 < > : " / \ | ? * 這幾個字元，開頭/結尾也不能留空白
// 或句點——學生姓名有時候含有舊資料編碼錯誤殘留的符號(例如越南文變音
// 符號被不相容的編碼轉成問號)，如果直接拿姓名當檔名，裡面若剛好有這些
// 符號，在 Windows 解壓縮時那個檔案會被跳過或解壓失敗，看起來就像那位
// 學生的請款單整個不見了——其實是放進 zip 裡了，只是解壓縮失敗。這裡
// 統一濾掉這些字元，避免整批依賴檔名裡的姓名格式而默默漏掉人。
function sanitizeFilenamePart(text) {
  // eslint-disable-next-line no-control-regex -- 刻意連控制字元一起濾掉，避免舊資料殘留的不可見字元也混進檔名。
  const cleaned = (text || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim().replace(/[.\s]+$/, '');
  return cleaned || '未命名';
}

// 一位學生一份請款單，多位學生打包成一個 .zip；學生姓名重複(同一個月
// 不只一筆住宿紀錄的少見情況)在檔名後面加序號避免互相覆蓋。每位學生
// 獨立 try/catch，單一學生文件產生失敗不會讓整批下載連帶失敗、其他人
// 的請款單還是要能正常下載；失敗的學生名單會回傳給呼叫端，顯示出來
// 讓承辦人員知道哪些人要另外處理，而不是默默少了幾份看不出來。
export async function downloadStudentBillingStatements(zipFilename, students) {
  const lib = await import('docx');
  const { Document, Packer } = lib;
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const usedNames = new Set();
  const failed = [];
  for (const data of students) {
    try {
      const doc = new Document({ sections: [{ children: buildChildren(data, lib) }] });
      const blob = await Packer.toBlob(doc);
      const buffer = await blob.arrayBuffer();
      const safeName = sanitizeFilenamePart(data.studentName);
      let name = `${safeName}_${data.month}請款單.docx`;
      let n = 2;
      while (usedNames.has(name)) { name = `${safeName}_${data.month}請款單(${n}).docx`; n += 1; }
      usedNames.add(name);
      zip.file(name, buffer);
    } catch (err) {
      failed.push({ studentName: data.studentName, error: err?.message || String(err) });
    }
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { succeeded: students.length - failed.length, failed };
}
