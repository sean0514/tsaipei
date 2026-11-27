// 下載履歷表(systems/laborAgency/WorkerRosterPage.jsx)——排版比照公司
// 提供的紙本「SƠ YẾU LÝ LỊCH CỦA CÔNG NHÂN CÔNG XƯỞNG」官方履歷表格式
// （公司 Logo 表頭＋緊湊網格表格，不是條列式的標題＋兩欄清單）。欄位
// 名稱/中越文對照跟選項翻譯沿用 lib/laborAgencyResumeLabels.js，跟公開
// 填寫頁、履歷表連結只維護同一份。docx (npm) 動態載入，只有真的點下載
// 才會載入，不進主要 bundle（跟 xlsxExport.js 動態載入 exceljs 同一套
// 做法）。
import logoUrl from '../assets/nguyenKhaiLogo.png';
import { RESUME_LABELS, RESUME_VALUE_LABEL_KEYS } from './laborAgencyResumeLabels';
import { tattooPhotoUrlsOf } from './resumePhotos';

const BLUE_FILL = 'BCD5ED';
const RED = 'FF0000';
const NAVY = '001F5F';

function parseExperience(json) {
  try {
    const arr = json ? JSON.parse(json) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// 欄位值要怎麼中越文並列顯示，分兩種情況：
// 1. 是/否、性別這幾個選項欄位，資料庫存的是中文原文，查表轉成對應越南文。
// 2. translatable 的自由文字欄位（省份/宗教/民族/最高學歷/職業/專長），原文
//    可能是工人自己填的越南文，查 `${key}Zh`（lib/useResumeTranslate.js
//    自動翻譯存的）當中文；沒有翻譯（例如內部人員直接填中文）就原文照顯示。
function fieldValueText(w, key, { translatable } = {}) {
  const raw = w[key];
  if (!raw) return '—';
  const labelKey = RESUME_VALUE_LABEL_KEYS[raw];
  if (labelKey) return `${raw} / ${RESUME_LABELS[labelKey].vi}`;
  if (translatable) {
    const zh = w[`${key}Zh`];
    return zh && zh !== raw ? `${zh} / ${raw}` : raw;
  }
  return raw;
}

// 出生日期存的是 YYYY-MM-DD，模板上另外列一欄「年齡」——不是存在資料
// 庫裡的欄位，下載當下用出生日期跟今天算，下個月再下載就會多一歲，
// 不會因為算出來的那一刻固定下來（紙本表格本來就是「現在幾歲」）。
function ageFromBirthDate(birthDate) {
  if (!birthDate) return '—';
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return '—';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday = today.getMonth() < birth.getMonth()
    || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return String(age);
}

// 舊資料相容：沒有 startDate 時用舊的 year 欄位(YYYY-MM-DD)切成 YYYY-MM
// 顯示，跟 pages/LaborAgencyResumeApplyPage.jsx 的 normalizeExperienceRow
// 同一套規則。
function experienceDate(r) {
  return r.startDate || (r.year ? r.year.slice(0, 7) : '') || '—';
}

// 工作內容/離職原因是自由文字，可能有 lib/useResumeTranslate.js 自動
// 翻譯存的 descriptionZh/reasonZh，有就中越並列，沒有（例如內部人員
// 直接填中文）就原文照顯示。
function withZh(raw, zh) {
  if (!raw) return '—';
  return zh && zh !== raw ? `${zh} / ${raw}` : raw;
}

// 照片存在 Firebase Storage，下載連結是公開的下載 URL；fetch 回來的
// blob.type 判斷圖片格式餵給 docx 的 ImageRun（它要求明確指定 jpg/png/
// gif/bmp 其中一種，不接受自動判斷)。抓不到就跳過，不讓整份履歷表下載
// 失敗，但把失敗原因回傳給呼叫端，讓使用者知道「沒帶到照片」是因為
// 根本沒上傳過(url 是空的)，還是上傳過但抓取失敗(網址失效/網路問題/
// Firebase Storage 沒設定允許跨來源讀取)——這兩種狀況處理方式不同，
// 不能都默默略過。
async function fetchImage(url) {
  if (!url) return { data: null, error: null };
  try {
    const res = await fetch(url);
    if (!res.ok) return { data: null, error: `HTTP ${res.status}` };
    const blob = await res.blob();
    const buffer = await blob.arrayBuffer();
    const type = blob.type.includes('png') ? 'png' : blob.type.includes('gif') ? 'gif' : blob.type.includes('bmp') ? 'bmp' : 'jpg';
    return { data: { buffer, type }, error: null };
  } catch (err) {
    return { data: null, error: err.message || String(err) };
  }
}

export async function downloadWorkerResumeDocx(w) {
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ImageRun,
    AlignmentType, ShadingType, VerticalAlign,
  } = await import('docx');

  // 區塊標題列（個人基本資料/家庭狀況/學歷語言…），淺藍底、置中、橫跨
  // 整列——比照模板的分區樣式，不是像一般標題那樣靠左。
  function sectionRow(labelKey, span) {
    const label = RESUME_LABELS[labelKey];
    return new TableRow({
      children: [new TableCell({
        columnSpan: span,
        shading: { type: ShadingType.CLEAR, fill: BLUE_FILL },
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: `${label.zh} ${label.vi}`, bold: true, color: NAVY })],
        })],
      })],
    });
  }

  // 一般欄位格：label 格固定灰階細明體不加粗，value 格置中——比照模板
  // 絕大多數欄位的呈現方式。
  function labelCell(text, { width, span, color } = {}) {
    return new TableCell({
      width: width != null ? { size: width, type: WidthType.PERCENTAGE } : undefined,
      columnSpan: span,
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ children: [new TextRun({ text, color })] })],
    });
  }
  function valueCell(text, { width, span, rowSpan, bold } = {}) {
    return new TableCell({
      width: width != null ? { size: width, type: WidthType.PERCENTAGE } : undefined,
      columnSpan: span,
      rowSpan,
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold })] })],
    });
  }
  function bilingualLabel(labelKey, { width, span } = {}) {
    const label = RESUME_LABELS[labelKey];
    return labelCell(`${label.zh}\n${label.vi}`, { width, span });
  }

  // ===== 表頭：公司 Logo + 英文/中文公司名 + 標題（置中，比照紙本格式）=====
  const logoResult = await fetchImage(logoUrl);
  const headerChildren = [];
  if (logoResult.data) {
    headerChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({ data: logoResult.data.buffer, type: logoResult.data.type, transformation: { width: 100, height: 112 } })],
    }));
  }
  headerChildren.push(
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'TRADING AND HUMAN RESOURCES NGUYEN KHAI LIMITED COMPANY', italics: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '元凱貿易與人力資源有限公司' })] }),
    new Paragraph({ text: '' }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: RESUME_LABELS.pageTitle.zh, bold: true, color: RED, size: 32 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: RESUME_LABELS.pageTitle.vi.toUpperCase(), bold: true, color: RED })],
    }),
    new Paragraph({ text: '' }),
  );

  // ===== 個人基本資料：照片用 rowSpan 固定在表格右側 6 列（跟模板一樣
  // 工人照片佔基本資料大部分列高），其餘欄位左側兩欄一組（label/value）
  // 並排兩組。=====
  const photoResult = await fetchImage(w.photoUrl);
  const photoCell = photoResult.data
    ? new TableCell({
      width: { size: 22, type: WidthType.PERCENTAGE },
      rowSpan: 6,
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: photoResult.data.buffer, type: photoResult.data.type, transformation: { width: 150, height: 190 } })] })],
    })
    : new TableCell({ width: { size: 22, type: WidthType.PERCENTAGE }, rowSpan: 6, children: [new Paragraph('')] });

  const basicRows = [
    sectionRow('sectionBasic', 7),
    new TableRow({
      children: [
        bilingualLabel('vietnameseName', { width: 13 }),
        valueCell(fieldValueText(w, 'vietnameseName'), { width: 23 }),
        bilingualLabel('gender', { width: 13 }),
        valueCell(fieldValueText(w, 'gender'), { width: 29 }),
        photoCell,
      ],
    }),
    new TableRow({
      children: [
        bilingualLabel('chineseName', { width: 13 }),
        valueCell(fieldValueText(w, 'chineseName'), { width: 23, bold: true }),
        bilingualLabel('hometown', { width: 13 }),
        valueCell(fieldValueText(w, 'hometown', { translatable: true }), { width: 29 }),
      ],
    }),
    new TableRow({
      children: [
        bilingualLabel('birthDate', { width: 13 }),
        valueCell(w.birthDate || '—', { width: 23 }),
        labelCell(`${RESUME_LABELS.age.zh} ${RESUME_LABELS.age.vi}`, { width: 13 }),
        valueCell(ageFromBirthDate(w.birthDate), { width: 29 }),
      ],
    }),
    new TableRow({
      children: [
        bilingualLabel('height', { width: 13 }),
        valueCell(w.height || '—', { width: 23 }),
        bilingualLabel('religion', { width: 13 }),
        valueCell(fieldValueText(w, 'religion', { translatable: true }), { width: 29 }),
      ],
    }),
    new TableRow({
      children: [
        bilingualLabel('weight', { width: 13 }),
        valueCell(w.weight || '—', { width: 23 }),
        bilingualLabel('ethnicity', { width: 13 }),
        valueCell(fieldValueText(w, 'ethnicity', { translatable: true }), { width: 29 }),
      ],
    }),
    new TableRow({
      children: [
        bilingualLabel('eyesight', { width: 13 }),
        valueCell(w.eyesight || '—', { width: 23 }),
        bilingualLabel('dominantHand', { width: 13 }),
        valueCell(fieldValueText(w, 'dominantHand'), { width: 29 }),
      ],
    }),
    new TableRow({
      children: [
        bilingualLabel('majorSurgery', { width: 32, span: 2 }),
        valueCell(fieldValueText(w, 'majorSurgery'), { width: 13 }),
        bilingualLabel('maritalStatus', { width: 26, span: 2 }),
        valueCell(fieldValueText(w, 'maritalStatus'), { width: 29 }),
      ],
    }),
  ];

  // ===== 家庭狀況 =====
  function parentRow(nameKey, aliveKey, ageKey, occupationKey, labelKey) {
    const label = RESUME_LABELS[labelKey];
    return new TableRow({
      children: [
        labelCell(`${label.zh} ${label.vi}\n${w[nameKey] || ''}`, { width: 20 }),
        valueCell(fieldValueText(w, aliveKey), { width: 8 }),
        bilingualLabel('age', { width: 13 }),
        valueCell(w[ageKey] || '—', { width: 10 }),
        bilingualLabel('occupation', { width: 13 }),
        valueCell(fieldValueText(w, occupationKey, { translatable: true }), { width: 36 }),
      ],
    });
  }
  const familyRows = [
    sectionRow('sectionFamily', 7),
    parentRow('fatherName', 'fatherAlive', 'fatherAge', 'fatherOccupation', 'father'),
    parentRow('motherName', 'motherAlive', 'motherAge', 'motherOccupation', 'mother'),
    new TableRow({
      children: [
        labelCell(`${RESUME_LABELS.spouse.zh} ${RESUME_LABELS.spouse.vi}\n${w.spouseName || ''}`, { width: 28, span: 2 }),
        bilingualLabel('age', { width: 13 }),
        valueCell(w.spouseAge || '—', { width: 10 }),
        bilingualLabel('occupation', { width: 13 }),
        valueCell(fieldValueText(w, 'spouseOccupation', { translatable: true }), { width: 36 }),
      ],
    }),
    new TableRow({
      children: [
        bilingualLabel('childrenCount', { width: 20 }),
        valueCell(w.childrenCount || '—', { width: 8 }),
        bilingualLabel('siblingsCount', { width: 13 }),
        valueCell(w.siblingsCount || '—', { width: 10 }),
        bilingualLabel('birthOrder', { width: 13 }),
        valueCell(w.birthOrder || '—', { width: 36 }),
      ],
    }),
    new TableRow({
      children: [
        bilingualLabel('relativesInTaiwan', { width: 28, span: 2 }),
        valueCell(fieldValueText(w, 'relativesInTaiwan'), { width: 13 }),
        bilingualLabel('relativesLocation', { width: 23, span: 2 }),
        valueCell(w.relativesLocation || '—', { width: 36 }),
      ],
    }),
  ];

  // ===== 學歷、語言 =====
  const educationRows = [
    sectionRow('sectionEducation', 7),
    new TableRow({
      children: [
        bilingualLabel('educationLevel', { width: 20 }),
        valueCell(fieldValueText(w, 'educationLevel', { translatable: true }), { width: 21 }),
        bilingualLabel('chineseLevel', { width: 15 }),
        valueCell(fieldValueText(w, 'chineseLevel'), { width: 15 }),
        bilingualLabel('englishLevel', { width: 15 }),
        valueCell(fieldValueText(w, 'englishLevel'), { width: 14 }),
      ],
    }),
  ];

  // ===== 國內外工作經驗：國內/國外各自一個區塊，列數跟著實際填寫的
  // 筆數走（至少一列），離職原因欄位用 rowSpan 貫穿整個區塊、紅字標示
  // （比照模板）。=====
  const domestic = parseExperience(w.domesticExperience);
  const overseas = parseExperience(w.overseasExperience);

  function experienceSection(labelKey, rows) {
    const list = rows.length ? rows : [{}];
    const label = RESUME_LABELS[labelKey];
    return list.map((r, i) => new TableRow({
      children: [
        ...(i === 0 ? [new TableCell({
          width: { size: 14, type: WidthType.PERCENTAGE },
          rowSpan: list.length,
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(`${label.zh}\n${label.vi}`)] })],
        })] : []),
        valueCell(`${experienceDate(r)} ~ ${r.endDate || '—'}`, { width: 18 }),
        valueCell(withZh(r.description, r.descriptionZh), { width: 44 }),
        ...(i === 0 ? [new TableCell({
          width: { size: 10, type: WidthType.PERCENTAGE },
          rowSpan: list.length,
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${RESUME_LABELS.leaveReason.zh}\n${RESUME_LABELS.leaveReason.vi}`, color: RED })] })],
        }), new TableCell({
          width: { size: 14, type: WidthType.PERCENTAGE },
          rowSpan: list.length,
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(withZh(list[0].reason, list[0].reasonZh))] })],
        })] : []),
      ],
    }));
  }

  const experienceRows = [
    sectionRow('sectionExperience', 4),
    ...experienceSection('domesticExperience', domestic),
    ...experienceSection('overseasExperience', overseas),
  ];

  // ===== 專長 =====
  const specialtiesRows = [
    sectionRow('specialties', 1),
    new TableRow({ children: [new TableCell({ children: [new Paragraph(fieldValueText(w, 'specialties', { translatable: true }))] })] }),
  ];

  const mainTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: basicRows });
  const familyTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: familyRows });
  const educationTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: educationRows });
  const experienceTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: experienceRows });
  const specialtiesTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: specialtiesRows });

  // 面試影片連結、刺青照片、LINE 圖片這幾項紙本模板沒有對應欄位，但
  // 是系統裡既有的額外資訊，拿掉會少功能——接在主要表格後面用一般
  // 標題＋內容呈現，跟模板的網格風格分開，不混在同一個表格裡。
  const extraChildren = [];
  if (w.interviewVideoLink) {
    extraChildren.push(
      new Paragraph({ spacing: { before: 240, after: 80 }, children: [new TextRun({ text: `${RESUME_LABELS.interviewVideoLink.zh} ${RESUME_LABELS.interviewVideoLink.vi}`, bold: true })] }),
      new Paragraph(w.interviewVideoLink),
    );
  }
  const tattooUrls = w.hasTattoo === '有' ? tattooPhotoUrlsOf(w) : [];
  const tattooResults = await Promise.all(tattooUrls.map((url) => fetchImage(url)));
  const tattooPhotos = tattooResults.map((r) => r.data).filter(Boolean);
  if (tattooPhotos.length) {
    extraChildren.push(new Paragraph({ spacing: { before: 240, after: 80 }, children: [new TextRun({ text: `${RESUME_LABELS.tattooPhoto.zh} ${RESUME_LABELS.tattooPhoto.vi}`, bold: true })] }));
    tattooPhotos.forEach((tattooPhoto) => {
      extraChildren.push(new Paragraph({ children: [new ImageRun({ data: tattooPhoto.buffer, type: tattooPhoto.type, transformation: { width: 160, height: 160 } })] }));
    });
  }
  const lineResult = await fetchImage(w.lineQrPhotoUrl);
  if (lineResult.data) {
    extraChildren.push(
      new Paragraph({ spacing: { before: 240, after: 80 }, children: [new TextRun({ text: 'LINE', bold: true })] }),
      new Paragraph({ children: [new ImageRun({ data: lineResult.data.buffer, type: lineResult.data.type, transformation: { width: 160, height: 160 } })] }),
    );
  }

  // 照片欄位有網址但抓不到（跟「根本沒上傳過」不同）才提醒，不然每個
  // 沒填照片的工人下載履歷表都會跳警告，太吵。
  const fetchWarnings = [
    w.photoUrl && photoResult.error && `${RESUME_LABELS.photo.zh}：${photoResult.error}`,
    ...tattooResults.filter((r) => r.error).map((r) => `${RESUME_LABELS.tattooPhoto.zh}：${r.error}`),
    w.lineQrPhotoUrl && lineResult.error && `LINE：${lineResult.error}`,
  ].filter(Boolean);
  if (fetchWarnings.length) {
    alert(`部分圖片下載失敗，履歷表內會略過：\n${fetchWarnings.join('\n')}\n\n若持續失敗，可能是 Firebase Storage 沒有設定允許瀏覽器跨來源讀取（CORS），需要有 Firebase 專案權限的人用 gsutil 設定儲存桶的 CORS 規則。`);
  }

  const doc = new Document({
    sections: [{
      // 官方範本用的是美規 Letter 紙張、邊界幾乎貼齊頁緣（量測範本的
      // sectPr 得出這組數字），不是 docx 預設的 A4＋一般邊界——邊界
      // 窄很多，表格可用寬度差很多，不跟著改的話每一欄都會被擠得比
      // 範本窄，欄位名稱容易換成兩三行、工人照片那一帶的比例也會跟著
      // 跑掉，不是只有照片本身的問題。
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 60, right: 280, bottom: 280, left: 220 },
        },
      },
      children: [
        ...headerChildren,
        mainTable, new Paragraph({ text: '' }),
        familyTable, new Paragraph({ text: '' }),
        educationTable, new Paragraph({ text: '' }),
        experienceTable, new Paragraph({ text: '' }),
        specialtiesTable,
        ...extraChildren,
      ],
    }],
  });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `履歷表_${w.name || w.vietnameseName || w.id}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
