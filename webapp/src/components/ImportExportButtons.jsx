import { useRef } from 'react';

// Ported from importExportButtonsHTML in apps-script/Index.html: a
// "下載完整資料" button always shown, plus (only when editable) a
// "匯入資料（覆蓋）" button behind a hidden file input.
export default function ImportExportButtons({ rows, onExport, onImport, canEdit }) {
  const fileInputRef = useRef(null);

  return (
    <div className="row-actions">
      <button onClick={() => onExport(rows)}>下載完整資料</button>
      {canEdit && (
        <>
          <button title="上傳後將完全覆蓋目前資料" onClick={() => fileInputRef.current?.click()}>匯入資料（覆蓋）</button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            hidden
            onChange={(e) => {
              const file = e.target.files[0];
              if (file) onImport(file, rows.length);
              e.target.value = '';
            }}
          />
        </>
      )}
    </div>
  );
}
