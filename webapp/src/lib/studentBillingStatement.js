// 學生請款單產生器：依「學生請款計算」當月試算出來的金額(含上月欠費)，
// 一位學生一份 .docx，多位學生打包成一個 .zip 一次下載。docx/jszip 都是
// 既有相依套件（jszip 本來就是 docx 套件打包 .docx 檔用的依賴，這裡直接
// 拿來打包多份輸出檔，不用再加新的執行環境依賴）。
//
// 中文之外再加學生國籍對應的語言(越南/印尼/菲律賓)，讓學生自己也看得懂
// 請款單內容；其餘國籍(或沒填國籍)只顯示中文，不會因為缺翻譯而出錯。
const NATIONALITY_LANG = { 越南: 'vi', 印尼: 'id', 菲律賓: 'tl' };

const TRANSLATIONS = {
  vi: {
    title: 'PHIẾU THU PHÍ SINH VIÊN',
    studentName: 'Họ và tên sinh viên',
    dorm: 'Tên ký túc xá',
    payer: 'Phương thức thanh toán',
    month: 'Tháng',
    selfPayDormFee: 'Tiền ký túc xá tự trả',
    waterFee: 'Tiền nước',
    electricityFee: 'Tiền điện',
    gasFee: 'Tiền gas',
    otherFees: 'Chi phí khác',
    healthCheckFee: 'Phí khám sức khỏe',
    evFee: 'Tiền thuê xe điện hàng tháng',
    total: 'Tổng cộng tháng này',
    previousOwed: 'Nợ tháng trước',
    grandTotal: 'Tổng số tiền phải nộp',
    status: 'Trạng thái thanh toán',
    statusValues: { 未收款: 'Chưa thanh toán', 先繳部分: 'Đã thanh toán một phần', 全額付清: 'Đã thanh toán đầy đủ' },
    partialDetail: 'Chi tiết thanh toán một phần',
    remaining: 'Số dư chưa thanh toán',
    footer: 'Vui lòng thanh toán sớm sau khi nhận được phiếu này, nếu có thắc mắc xin liên hệ người phụ trách.',
  },
  id: {
    title: 'TAGIHAN BIAYA MAHASISWA',
    studentName: 'Nama Mahasiswa',
    dorm: 'Nama Asrama',
    payer: 'Metode Pembayaran',
    month: 'Bulan',
    selfPayDormFee: 'Biaya Asrama (Tanggungan Sendiri)',
    waterFee: 'Biaya Air',
    electricityFee: 'Biaya Listrik',
    gasFee: 'Biaya Gas',
    otherFees: 'Biaya Lain-lain',
    healthCheckFee: 'Biaya Pemeriksaan Kesehatan',
    evFee: 'Sewa Bulanan Sepeda Listrik',
    total: 'Total Bulan Ini',
    previousOwed: 'Tunggakan Bulan Lalu',
    grandTotal: 'Total yang Harus Dibayar',
    status: 'Status Pembayaran',
    statusValues: { 未收款: 'Belum Dibayar', 先繳部分: 'Dibayar Sebagian', 全額付清: 'Lunas' },
    partialDetail: 'Rincian Pembayaran Sebagian',
    remaining: 'Sisa Saldo Belum Dibayar',
    footer: 'Mohon segera melakukan pembayaran setelah menerima tagihan ini. Jika ada pertanyaan, silakan hubungi petugas terkait.',
  },
  tl: {
    title: 'KATIBAYAN NG SINGIL NG MAG-AARAL',
    studentName: 'Pangalan ng Mag-aaral',
    dorm: 'Pangalan ng Dormitoryo',
    payer: 'Paraan ng Pagbabayad',
    month: 'Buwan',
    selfPayDormFee: 'Bayad sa Dormitoryo (Sariling Bayad)',
    waterFee: 'Bayad sa Tubig',
    electricityFee: 'Bayad sa Kuryente',
    gasFee: 'Bayad sa Gas',
    otherFees: 'Iba pang Bayarin',
    healthCheckFee: 'Bayad sa Medical Check-up',
    evFee: 'Buwanang Upa ng E-bike',
    total: 'Kabuuan Ngayong Buwan',
    previousOwed: 'Utang Noong Nakaraang Buwan',
    grandTotal: 'Kabuuang Dapat Bayaran',
    status: 'Katayuan ng Pagbabayad',
    statusValues: { 未收款: 'Hindi pa Nabayaran', 先繳部分: 'Bahagyang Nabayaran', 全額付清: 'Buong Nabayaran' },
    partialDetail: 'Detalye ng Bahagyang Pagbabayad',
    remaining: 'Natitirang Balanse',
    footer: 'Mangyaring magbayad kaagad pagkatanggap ng katibayan na ito. Kung may tanong, mangyaring makipag-ugnayan sa kawani.',
  },
};

function langFor(nationality) {
  return TRANSLATIONS[NATIONALITY_LANG[(nationality || '').trim()]] ? NATIONALITY_LANG[(nationality || '').trim()] : null;
}

// 中文一行，下面再疊一行翻譯(沒有對應語言就只顯示中文)——跟
// lib/monthlyVisitRecord.js 的雙語排版同一套做法。
function cell(lib, zh, translated, opts = {}) {
  const { Paragraph, TextRun, TableCell, WidthType, AlignmentType } = lib;
  const children = [new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    children: [new TextRun({ text: zh == null ? '' : String(zh), bold: !!opts.bold, size: opts.size || 22 })],
  })];
  if (translated) {
    children.push(new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      children: [new TextRun({ text: String(translated), italics: true, size: (opts.size || 22) - 4 })],
    }));
  }
  return new TableCell({ width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined, children });
}

// data: { studentName, dorm, payer, month, nationality, items: [{key, label, amount}],
//         total, previousOwed, grandTotal, status, partialDetail, remaining }
function buildChildren(data, lib) {
  const { Paragraph, TextRun, Table, TableRow, WidthType, AlignmentType } = lib;
  const lang = langFor(data.nationality);
  const t = lang ? TRANSLATIONS[lang] : null;

  function infoRow(zhLabel, tKey, value) {
    return new TableRow({ children: [cell(lib, zhLabel, t?.[tKey], { width: 30, bold: true }), cell(lib, value, null, { width: 70 })] });
  }
  const infoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      infoRow('學生姓名', 'studentName', data.studentName),
      infoRow('宿舍名稱', 'dorm', data.dorm || '—'),
      infoRow('付款方式', 'payer', data.payer || '—'),
      infoRow('月份', 'month', data.month),
    ],
  });

  function feeRow(zhLabel, tKey, amount, opts = {}) {
    return new TableRow({ children: [
      cell(lib, zhLabel, t?.[tKey], { width: 60, bold: opts.bold }),
      cell(lib, (amount || 0).toLocaleString(), null, { width: 40, bold: opts.bold, align: AlignmentType.RIGHT }),
    ] });
  }
  const feeTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      ...data.items.map((it) => feeRow(it.label, it.key, it.amount)),
      feeRow('本月合計', 'total', data.total, { bold: true }),
      feeRow('上月欠費', 'previousOwed', data.previousOwed),
      feeRow('應繳總額', 'grandTotal', data.grandTotal, { bold: true }),
    ],
  });

  const statusZh = data.status || '未收款';
  const statusLine = `收款狀態：${statusZh}`;
  const statusLineT = t ? `${t.status}: ${t.statusValues[statusZh] || ''}` : null;
  const partialLine = `先繳部分明細：${data.partialDetail}`;
  const partialLineT = t ? `${t.partialDetail}: ${data.partialDetail}` : null;
  const remainingLine = `剩餘未繳餘額：${data.remaining.toLocaleString()}`;
  const remainingLineT = t ? `${t.remaining}: ${data.remaining.toLocaleString()}` : null;

  function bilingualParagraph(zh, translated, size = 20) {
    const paras = [new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: zh, size })] })];
    if (translated) paras.push(new Paragraph({ children: [new TextRun({ text: translated, italics: true, size: size - 2 })] }));
    return paras;
  }

  return [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '學生請款單', bold: true, size: 32 })] }),
    ...(t ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t.title, bold: true, italics: true, size: 24 })] })] : []),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: data.month, size: 24 })] }),
    infoTable,
    new Paragraph({ text: '' }),
    feeTable,
    ...bilingualParagraph(statusLine, statusLineT, 22),
    ...(data.partialDetail ? bilingualParagraph(partialLine, partialLineT) : []),
    ...(data.remaining ? bilingualParagraph(remainingLine, remainingLineT) : []),
    ...bilingualParagraph('請於收到本單後盡速繳款，如有疑問請聯繫承辦人員。', t?.footer),
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
