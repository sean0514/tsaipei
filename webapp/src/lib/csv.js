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

// Returns { imported, skipped } or { error }.
export function parseImportRows(text, fields, requiredKeys = []) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { error: '檔案沒有可匯入的資料列。' };
  const header = rows[0].map((h) => h.trim());
  const labelToKey = {};
  fields.forEach((f) => { labelToKey[f.label] = f.key; });
  const imported = [];
  let skipped = 0;
  rows.slice(1).forEach((r) => {
    if (r.every((c) => c.trim() === '')) return;
    const obj = {};
    header.forEach((h, idx) => {
      const key = labelToKey[h];
      if (key) obj[key] = r[idx] !== undefined ? r[idx] : '';
    });
    const valid = requiredKeys.every((k) => (obj[k] || '').trim());
    if (!valid) { skipped++; return; }
    imported.push(obj);
  });
  return { imported, skipped };
}
