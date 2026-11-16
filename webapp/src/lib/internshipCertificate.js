// 實習證明書產生器：依國籍挑選對應語言版本（越南→越南文、印尼→印尼文、
// 其他國籍→英文），把學生/實習單位/申辦進度的既有資料填入三份官方範本
// （public/certificate-templates/ 底下那三個原始 .docx，可以直接下載當作
// 空白範例）的文字內容，用 docx 套件在瀏覽器端組一份填好資料的 .docx。
// 這不是去改官方範本檔案本身（docx 套件沒辦法穩定定位範本裡被拆成好幾個
// run 的填空文字），而是重新組一份格式接近、內容對應的文件，資料沒填齊
// 的地方用底線標示，仍然可以直接列印用印或再手動微調。

const AGENCY_OPTIONS = ['經濟部', '交通部觀光署'];

const AGENCY_EN = { 經濟部: 'Ministry of Economic Affairs', 交通部觀光署: 'Tourism Administration, Ministry of Transportation and Communications' };
const AGENCY_VI = { 經濟部: 'Bộ Kinh tế', 交通部觀光署: 'Cục quản lý Du lịch, Bộ Giao thông vận tải' };
const AGENCY_ID = { 經濟部: 'Kementerian Urusan Ekonomi', 交通部觀光署: 'Administrasi Pariwisata, Kementerian Transportasi dan Komunikasi' };

const NATIONALITY_EN = { 越南: 'Vietnamese', 印尼: 'Indonesian', 泰國: 'Thai', 菲律賓: 'Filipino', 台灣: 'Taiwanese' };

// 旅遊/餐旅相關產業別送交通部觀光署核准，其餘預設送經濟部——只是猜測性的
// 預設值，表單上還是可以直接改成另一個主管機關。
const TOURISM_INDUSTRY_KEYWORDS = ['觀光', '旅遊', '旅館', '飯店', '餐飲', '住宿', '會展'];
export function guessApprovalAgency(industry) {
  return TOURISM_INDUSTRY_KEYWORDS.some((k) => (industry || '').includes(k)) ? '交通部觀光署' : '經濟部';
}

export { AGENCY_OPTIONS };

// 國籍→證明書語言版本；越南/印尼各自有專屬範本，其餘國籍統一用英文版
// （跟範本檔名 public/certificate-templates/internship-certificate-{lang}.docx
// 對應）。
export function certificateLangFor(nationality) {
  if (nationality === '越南') return 'vi';
  if (nationality === '印尼') return 'id';
  return 'en';
}

export const TEMPLATE_FILE_BY_LANG = {
  en: '/certificate-templates/internship-certificate-en.docx',
  vi: '/certificate-templates/internship-certificate-vi.docx',
  id: '/certificate-templates/internship-certificate-id.docx',
};

export const LANG_LABEL = { en: '英文版', vi: '越南文版', id: '印尼文版' };

function rocYmd(iso) {
  if (!iso) return { y: '', m: '', d: '' };
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return { y: '', m: '', d: '' };
  return { y: String(Number(y) - 1911), m: String(Number(m)), d: String(Number(d)) };
}

// 沒有資料的欄位用底線標示，印出來還是看得出哪裡要補，不會讓官方審查人員
// 誤以為是系統算出來的數字 0 或空白看不出來少填了什麼。
function blank(v, len = 8) {
  return v || '＿'.repeat(len);
}

export function totalInternshipDays(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const days = Math.round((new Date(endIso) - new Date(startIso)) / 86400000) + 1;
  return days > 0 ? days : null;
}

// data: { nationality, studentNameEn, passportNumber, agency, approvalDate(iso),
//         letterNo, startDate(iso), endDate(iso), totalDays, hotelName,
//         department, issuingAuthority }
function buildParagraphs(lang, data, { Paragraph, TextRun, AlignmentType }) {
  const approval = rocYmd(data.approvalDate);
  const start = rocYmd(data.startDate);
  const end = rocYmd(data.endDate);
  const totalDays = data.totalDays ?? totalInternshipDays(data.startDate, data.endDate);
  const nameEn = blank(data.studentNameEn, 10);
  const passportNumber = blank(data.passportNumber, 9);
  const letterNo = blank(data.letterNo, 6);
  const hotelName = blank(data.hotelName, 8);
  const department = blank(data.department, 6);
  const issuingAuthority = blank(data.issuingAuthority || data.hotelName, 10);
  const agency = data.agency || '經濟部';

  const zhBody = `　${blank(data.nationality, 2)}　籍學生　${nameEn}　${passportNumber}，前經(${agency})中華民國　${blank(approval.y, 3)}　年　${blank(approval.m, 2)}　月　${blank(approval.d, 2)}　日　字第　${letterNo}　號函核准，自中華民國　${blank(start.y, 3)}　年　${blank(start.m, 2)}　月　${blank(start.d, 2)}　日起至中華民國　${blank(end.y, 3)}　年　${blank(end.m, 2)}　月　${blank(end.d, 2)}　日止，共計　${blank(totalDays != null ? String(totalDays) : '', 3)}　天，在　${hotelName}　的　${department}　實習。`;

  let langTitle;
  let langBody;
  let langBody2;
  let langBody3;
  let issuingLabel;

  if (lang === 'vi') {
    langTitle = 'Giấy chứng nhận dành cho thực tập sinh nước ngoài tại nước ta';
    const agencyVi = AGENCY_VI[agency] || agency;
    langBody = `(${blank(data.nationality, 2)}) Sinh viên (${nameEn}) (Số hộ chiếu: ${passportNumber}). Đã được phê duyệt bởi (${agencyVi}) Cộng hòa Trung Hoa ngày ${blank(approval.d, 2)} tháng ${blank(approval.m, 2)} năm ${blank(approval.y, 3)} số thư chấp thuận ${letterNo}, từ Cộng hòa Trung Hoa ngày ${blank(start.d, 2)} tháng ${blank(start.m, 2)} năm ${blank(start.y, 3)} đến Cộng Hòa Trung Hoa ngày ${blank(end.d, 2)} tháng ${blank(end.m, 2)} năm ${blank(end.y, 3)}, tổng cộng ${blank(totalDays != null ? String(totalDays) : '', 3)} ngày, tại ${hotelName} bộ phận ${department} thực tập.`;
    langBody2 = 'Chúng tôi đã triển khai thành công chương trình thực tập được Bộ Kinh tế, Cục Quản lý Du lịch thuộc Bộ Giao thông vận tải và Truyền thông phê duyệt.';
    langBody3 = 'Sinh viên này đã siêng năng và tận tâm trong công việc, đồng thời thể hiện thái độ tích cực. Giấy chứng nhận này được cấp sau khi hoàn thành kỳ thực tập.';
    issuingLabel = 'Đơn vị phát hành';
  } else if (lang === 'id') {
    langTitle = 'Surat Keterangan Magang bagi Mahasiswa Asing di Taiwan';
    const agencyId = AGENCY_ID[agency] || agency;
    langBody = `Mahasiswa berkewarganegaraan Indonesia, (${nameEn}), dengan nomor paspor (${passportNumber}). Telah memperoleh persetujuan berdasarkan surat resmi dari (${agencyId}) Republik Tiongkok (Taiwan), tertanggal ${blank(approval.d, 2)} bulan ${blank(approval.m, 2)}, tahun ${blank(approval.y, 3)}, dengan nomor surat ${letterNo}. Terhitung sejak tanggal ${blank(start.d, 2)} bulan ${blank(start.m, 2)} tahun ${blank(start.y, 3)} sampai dengan tanggal ${blank(end.d, 2)} bulan ${blank(end.m, 2)} tahun ${blank(end.y, 3)}. Dengan total masa magang selama ${blank(totalDays != null ? String(totalDays) : '', 3)} hari, di bagian (${department}), (${hotelName}).`;
    langBody2 = 'Perusahaan kami telah melaksanakan program magang sesuai dengan rencana magang yang telah disetujui oleh Kementerian Urusan Ekonomi atau Administrasi Pariwisata, Kementerian Transportasi dan Komunikasi Republik Tiongkok (Taiwan).';
    langBody3 = 'Mahasiswa yang bersangkutan telah menjalankan tugas dan tanggung jawabnya dengan baik serta menunjukkan sikap yang positif dan penuh semangat. Setelah menyelesaikan masa magang, surat keterangan ini diterbitkan sebagai bukti.';
    issuingLabel = 'Instansi Penerbit';
  } else {
    langTitle = 'Internship Certificate for Foreign Students in Taiwan';
    const agencyEn = AGENCY_EN[agency] || agency;
    const nationalityEn = NATIONALITY_EN[data.nationality] || data.nationality || blank('', 6);
    langBody = `(${nationalityEn}) International Student (${nameEn}) (Passport No. ${passportNumber}), pursuant to the approval letter issued by the ${agencyEn}, dated ROC Year ${blank(approval.y, 3)}, Month ${blank(approval.m, 2)}, Day ${blank(approval.d, 2)}, Reference No. ${letterNo}, the student is hereby approved to undertake an internship at the ${department} of ${hotelName} from ROC Year ${blank(start.y, 3)}, Month ${blank(start.m, 2)} to ROC Year ${blank(end.y, 3)}, Month ${blank(end.m, 2)}, for a total of ${blank(totalDays != null ? String(totalDays) : '', 3)} days.`;
    langBody2 = 'Our company has duly implemented the internship program approved by the Ministry of Economic Affairs or the Tourism Administration, Ministry of Transportation and Communications.';
    langBody3 = 'The student has fulfilled their duties responsibly and demonstrated a positive and proactive attitude throughout the internship. This certificate is hereby issued upon successful completion of the internship.';
    issuingLabel = 'Issuing Authority';
  }

  const zhFont = '標楷體';
  const latinFont = 'Times New Roman';

  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: '外國籍學生來我國實習證明書', bold: true, size: 36, font: zhFont })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: langTitle, bold: true, size: 28, font: latinFont })],
    }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 160 },
      children: [new TextRun({ text: zhBody, size: 28, font: zhFont })],
    }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 160 },
      children: [new TextRun({ text: '本公司已確實執行經濟部或交通部觀光署核准之實習計畫。', size: 28, font: zhFont })],
    }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 240 },
      children: [new TextRun({ text: '該名學生克盡職守、態度積極。實習期滿，特此證明。', size: 28, font: zhFont })],
    }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 160 },
      children: [new TextRun({ text: langBody, size: 28, font: latinFont })],
    }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 160 },
      children: [new TextRun({ text: langBody2, size: 28, font: latinFont })],
    }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 480 },
      children: [new TextRun({ text: langBody3, size: 28, font: latinFont })],
    }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      children: [
        new TextRun({ text: '發證單位', size: 28, font: zhFont }),
        new TextRun({ text: issuingLabel, size: 28, font: latinFont }),
        new TextRun({ text: `：　${issuingAuthority}　`, size: 28, font: zhFont }),
      ],
    }),
  ];
}

// docx (~430KB) 動態載入，只有真的要下載證明書時才載入，不放進主要 bundle。
export async function downloadInternshipCertificate(filename, lang, data) {
  const { Document, Packer, Paragraph, TextRun, AlignmentType } = await import('docx');
  const doc = new Document({
    sections: [{ children: buildParagraphs(lang, data, { Paragraph, TextRun, AlignmentType }) }],
  });
  const blobPart = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blobPart);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
