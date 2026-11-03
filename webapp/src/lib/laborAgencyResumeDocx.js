// 下載履歷表(systems/laborAgency/WorkerRosterPage.jsx)——組成一份排版
// 像紙本「工廠移工人員履歷表」的 Word 文件(.docx)，不是 Excel 條列式的
// 表格；欄位名稱/中越文對照跟選項翻譯沿用 lib/laborAgencyResumeLabels.js，
// 跟公開填寫頁、履歷表連結只維護同一份。docx (npm) 動態載入，只有真的
// 點下載才會載入，不進主要 bundle（跟 xlsxExport.js 動態載入 exceljs
// 同一套做法）。
import { RESUME_LABELS, RESUME_VALUE_LABEL_KEYS, RESUME_DOWNLOAD_FIELDS } from './laborAgencyResumeLabels';

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
function fieldValueText(w, field) {
  const raw = w[field.key];
  if (!raw) return '—';
  const labelKey = RESUME_VALUE_LABEL_KEYS[raw];
  if (labelKey) return `${raw} / ${RESUME_LABELS[labelKey].vi}`;
  if (field.translatable) {
    const zh = w[`${field.key}Zh`];
    return zh && zh !== raw ? `${zh} / ${raw}` : raw;
  }
  return raw;
}

function fieldLabel({ labelKey, prefixKey }) {
  const label = RESUME_LABELS[labelKey];
  const prefix = prefixKey ? RESUME_LABELS[prefixKey] : null;
  const zh = prefix ? `${prefix.zh}${label.zh}` : label.zh;
  const vi = prefix ? `${prefix.vi} ${label.vi}` : label.vi;
  return `${zh} / ${vi}`;
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
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, ImageRun, AlignmentType,
  } = await import('docx');

  function heading(labelKey) {
    const label = RESUME_LABELS[labelKey];
    return new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text: `${label.zh} / ${label.vi}`, bold: true })],
    });
  }

  function fieldRow(field) {
    return new TableRow({
      children: [
        new TableCell({
          width: { size: 35, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: fieldLabel(field), bold: true })] })],
        }),
        new TableCell({
          width: { size: 65, type: WidthType.PERCENTAGE },
          children: [new Paragraph(fieldValueText(w, field))],
        }),
      ],
    });
  }

  function sectionTable(section) {
    const fields = RESUME_DOWNLOAD_FIELDS.filter((f) => f.section === section);
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: fields.map(fieldRow) });
  }

  function experienceHeaderCell(labelKey, size) {
    return new TableCell({
      width: { size, type: WidthType.PERCENTAGE },
      children: [new Paragraph({ children: [new TextRun({ text: `${RESUME_LABELS[labelKey].zh} / ${RESUME_LABELS[labelKey].vi}`, bold: true })] })],
    });
  }

  // 工作內容/離職原因是自由文字，可能有 lib/useResumeTranslate.js 自動
  // 翻譯存的 descriptionZh/reasonZh，有就中越並列，沒有（例如內部人員
  // 直接填中文）就原文照顯示。
  function withZh(raw, zh) {
    if (!raw) return '—';
    return zh && zh !== raw ? `${zh} / ${raw}` : raw;
  }

  // 舊資料相容：沒有 startDate 時用舊的 year 欄位(YYYY-MM-DD)切成
  // YYYY-MM 顯示，跟 pages/LaborAgencyResumeApplyPage.jsx 的
  // normalizeExperienceRow 同一套規則。
  function experienceDate(r) {
    return r.startDate || (r.year ? r.year.slice(0, 7) : '') || '—';
  }

  function experienceTable(rows) {
    const header = new TableRow({
      children: [
        experienceHeaderCell('startDate', 15), experienceHeaderCell('endDate', 15),
        experienceHeaderCell('description', 40), experienceHeaderCell('leaveReason', 30),
      ],
    });
    const body = (rows.length ? rows : [{}]).map((r) => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph(experienceDate(r))] }),
        new TableCell({ children: [new Paragraph(r.endDate || '—')] }),
        new TableCell({ children: [new Paragraph(withZh(r.description, r.descriptionZh))] }),
        new TableCell({ children: [new Paragraph(withZh(r.reason, r.reasonZh))] }),
      ],
    }));
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...body] });
  }

  const domestic = parseExperience(w.domesticExperience);
  const overseas = parseExperience(w.overseasExperience);
  const photoResult = await fetchImage(w.photoUrl);
  const tattooResult = w.hasTattoo === '有' ? await fetchImage(w.tattooPhotoUrl) : { data: null, error: null };
  const lineResult = await fetchImage(w.lineQrPhotoUrl);
  const photo = photoResult.data;
  const tattooPhoto = tattooResult.data;
  const linePhoto = lineResult.data;

  // 照片欄位有網址但抓不到（跟「根本沒上傳過」不同）才提醒，不然每個
  // 沒填照片的工人下載履歷表都會跳警告，太吵。
  const fetchWarnings = [
    w.photoUrl && photoResult.error && `${RESUME_LABELS.photo.zh}：${photoResult.error}`,
    w.tattooPhotoUrl && tattooResult.error && `${RESUME_LABELS.tattooPhoto.zh}：${tattooResult.error}`,
    w.lineQrPhotoUrl && lineResult.error && `LINE：${lineResult.error}`,
  ].filter(Boolean);
  if (fetchWarnings.length) {
    alert(`部分圖片下載失敗，履歷表內會略過：\n${fetchWarnings.join('\n')}\n\n若持續失敗，可能是 Firebase Storage 沒有設定允許瀏覽器跨來源讀取（CORS），需要有 Firebase 專案權限的人用 gsutil 設定儲存桶的 CORS 規則。`);
  }

  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `${RESUME_LABELS.pageTitle.zh} / ${RESUME_LABELS.pageTitle.vi}`, bold: true, size: 32 })],
    }),
  ];
  if (photo) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 120 },
      children: [new ImageRun({ data: photo.buffer, type: photo.type, transformation: { width: 120, height: 150 } })],
    }));
  }
  children.push(heading('sectionBasic'), sectionTable('basic'));
  children.push(heading('sectionFamily'), sectionTable('family'));
  children.push(heading('sectionEducation'), sectionTable('education'));
  children.push(heading('domesticExperience'), experienceTable(domestic));
  children.push(heading('overseasExperience'), experienceTable(overseas));
  if (w.interviewVideoLink) {
    children.push(heading('interviewVideoLink'), new Paragraph(w.interviewVideoLink));
  }
  children.push(heading('specialties'), new Paragraph(fieldValueText(w, { key: 'specialties', translatable: true })));
  if (tattooPhoto) {
    children.push(heading('tattooPhoto'));
    children.push(new Paragraph({ children: [new ImageRun({ data: tattooPhoto.buffer, type: tattooPhoto.type, transformation: { width: 160, height: 160 } })] }));
  }
  if (linePhoto) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 }, children: [new TextRun({ text: 'LINE', bold: true })] }));
    children.push(new Paragraph({ children: [new ImageRun({ data: linePhoto.buffer, type: linePhoto.type, transformation: { width: 160, height: 160 } })] }));
  }

  const doc = new Document({ sections: [{ children }] });
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
