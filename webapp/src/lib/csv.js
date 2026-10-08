// Ported from csvEscape/exportEntityCSV/parseCSV/parseImportRows in
// apps-script/Index.html — same CSV dialect (comma-separated, quote fields
// containing a comma/quote/newline, BOM-prefixed UTF-8) so a file downloaded
// from here or the old Sheets version round-trips the same way.

export function csvEscape(val) {
  const str = val === undefined || val === null ? '' : String(val);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function exportEntityCSV(rows, fields, filenamePrefix) {
  const header = fields.map((f) => f.label);
  const body = rows.map((row) => fields.map((f) => csvEscape(row[f.key])));
  const csv = [header, ...body].map((r) => r.join(',')).join('\r\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${filenamePrefix}_${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

// Only labels containing a non-ASCII (Chinese) character are useful for
// telling UTF-8 and Big5 decodes apart — a plain-ASCII label like "ID"
// matches identically either way, so counting it would make a garbled
// decode look "matched" and short-circuit the fallback below.
function countHeaderMatches(text, fields) {
  const rows = parseCSV(text);
  if (!rows.length) return 0;
  const header = rows[0].map((h) => h.trim());
  const labels = new Set(fields.map((f) => f.label).filter((l) => /[^\x00-\x7f]/.test(l)));
  return header.filter((h) => labels.has(h)).length;
}

// file.text() always decodes as UTF-8, but a downloaded CSV that gets
// edited and re-saved through Excel on Traditional-Chinese Windows is often
// silently written back out as Big5 (Excel's "CSV" file type doesn't ask).
// Decoded as UTF-8 that comes out as garbled header cells that match none
// of our field labels, so every data row gets skipped with no clue why.
// Try UTF-8 first (what we export), and only fall back to Big5 if literally
// no header cell matched.
export async function decodeCsvFile(file, fields) {
  const buffer = await file.arrayBuffer();
  const utf8Text = new TextDecoder('utf-8').decode(buffer);
  if (countHeaderMatches(utf8Text, fields) > 0) return utf8Text;
  try {
    const big5Text = new TextDecoder('big5').decode(buffer);
    if (countHeaderMatches(big5Text, fields) > 0) return big5Text;
  } catch { /* Big5 decoder unavailable in this browser */ }
  return utf8Text;
}

// 「下載完整資料」匯出的日期欄位是 YYYY-MM-DD 純文字，但使用者常常是拿去
// Excel/試算表編輯過再存回 CSV——Excel 看到像日期的字串會自動重新格式化
// 成 2026/6/15、6/15/2026 甚至儲存格格式=通用時的序列數字（從 1899-12-30
// 起算的天數），這些值塞進 <input type="date"> 都會被當成無效值變成空白，
// 在編輯視窗裡看起來就是「日期跑掉了」。這裡在匯入時把常見格式都正規化
// 回 YYYY-MM-DD，認不出來的格式才原樣保留（維持匯入前的行為）。
function normalizeDateCell(raw) {
  const v = (raw || '').trim();
  if (!v || /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (/^\d+$/.test(v)) {
    const serial = Number(v);
    if (serial > 20000 && serial < 60000) {
      const epoch = Date.UTC(1899, 11, 30);
      return new Date(epoch + serial * 86400000).toISOString().slice(0, 10);
    }
    return v;
  }
  let m = v.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return v;
}

// Returns { imported, skipped } or { error }.
export function parseImportRows(text, fields, requiredKeys = []) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { error: '檔案沒有可匯入的資料列。' };
  const header = rows[0].map((h) => h.trim());
  const labelToKey = {};
  const dateKeys = new Set();
  fields.forEach((f) => { labelToKey[f.label] = f.key; if (f.type === 'date') dateKeys.add(f.key); });
  const imported = [];
  let skipped = 0;
  rows.slice(1).forEach((r) => {
    if (r.every((c) => c.trim() === '')) return;
    const obj = {};
    header.forEach((h, idx) => {
      const key = labelToKey[h];
      if (!key) return;
      const cell = r[idx] !== undefined ? r[idx] : '';
      obj[key] = dateKeys.has(key) ? normalizeDateCell(cell) : cell;
    });
    const valid = requiredKeys.every((k) => (obj[k] || '').trim());
    if (!valid) { skipped++; return; }
    imported.push(obj);
  });
  return { imported, skipped };
}
