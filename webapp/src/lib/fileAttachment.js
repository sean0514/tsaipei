// 檔案（履歷表、申辦流程附件等）以 data URL（含 MIME type）直接存進
// Firestore 文件本身，跟客戶請款範本上傳同一套做法；呼叫端各自依欄位數量
// 自訂單一檔案大小上限，避免超過 Firestore 單一文件 1MB 的限制。
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Chrome 不允許直接把 data: URL 當成分頁導覽目標開新分頁（會被靜默擋下、
// 按了「顯示」沒有任何反應），要先轉成 Blob URL 才能正常在新分頁開啟或下載。
export function dataUrlToBlobUrl(dataUrl) {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/data:(.*?);base64/)?.[1] || 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

export function viewFile(dataUrl) {
  window.open(dataUrlToBlobUrl(dataUrl), '_blank');
}

export function downloadFile(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrlToBlobUrl(dataUrl);
  a.download = filename || '檔案';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
