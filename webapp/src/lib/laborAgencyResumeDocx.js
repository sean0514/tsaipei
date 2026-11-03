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

// 中文原文 → 中文／越南文並列：履歷表的是/否、性別等選項欄位資料庫存的
// 是中文原文，查不到對照（例如工人自己手寫的自由文字欄位）就原文照顯示。
function bilingualText(raw) {
  if (!raw) return '—';
  const labelKey = RESUME_VALUE_LABEL_KEYS[raw];
  return labelKey ? `${raw} / ${RESUME_LABELS[labelKey].vi}` : raw;
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
// gif/bmp 其中一種，不接受自動判斷)。抓不到(網路錯誤/已被刪除)就跳過，
// 不讓整份履歷表下載失敗。
async function fetchImage(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const buffer = await blob.arrayBuffer();
    const type = blob.type.includes('png') ? 'png' : blob.type.includes('gif') ? 'gif' : blob.type.includes('bmp') ? 'bmp' : 'jpg';
    return { buffer, type };
  } catch {
    return null;
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
          children: [new Paragraph(bilingualText(w[field.key]))],
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

  function experienceTable(rows) {
    const header = new TableRow({
      children: [experienceHeaderCell('year', 20), experienceHeaderCell('description', 50), experienceHeaderCell('leaveReason', 30)],
    });
    const body = (rows.length ? rows : [{}]).map((r) => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph(r.year || '—')] }),
        new TableCell({ children: [new Paragraph(r.description || '—')] }),
        new TableCell({ children: [new Paragraph(r.reason || '—')] }),
      ],
    }));
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...body] });
  }

  function interviewTable(rows) {
    const header = new TableRow({
      children: [experienceHeaderCell('interviewDate', 20), experienceHeaderCell('interviewLinks', 50), experienceHeaderCell('note', 30)],
    });
    const body = (rows.length ? rows : [{}]).map((r) => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph(r.date || '—')] }),
        new TableCell({ children: [new Paragraph(r.link || '—')] }),
        new TableCell({ children: [new Paragraph(r.note || '—')] }),
      ],
    }));
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...body] });
  }

  const domestic = parseExperience(w.domesticExperience);
  const overseas = parseExperience(w.overseasExperience);
  const interviewLinks = parseExperience(w.interviewLinks);
  const photo = await fetchImage(w.photoUrl);
  const tattooPhoto = w.hasTattoo === '有' ? await fetchImage(w.tattooPhotoUrl) : null;
  const linePhoto = await fetchImage(w.lineQrPhotoUrl);

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
  children.push(heading('interviewLinks'), interviewTable(interviewLinks));
  children.push(heading('specialties'), new Paragraph(w.specialties || '—'));
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
