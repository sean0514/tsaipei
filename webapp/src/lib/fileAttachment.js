import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';

// 檔案（履歷表、申辦流程附件等）上傳到 Firebase Storage，Firestore 文件裡
// 只存下載連結＋檔名＋Storage 路徑（路徑留著供之後刪除用）。改用 Storage
// 之前是把檔案轉成 data URL 直接存進 Firestore 文件本身，受限於 Firestore
// 單一文件 1MB 的硬性上限，單檔只能抓到 800KB 左右；Storage 沒有這個限制，
// 上限改用呼叫端自訂的 MAX_ATTACHMENT_SIZE（目前是 4MB）。
export const MAX_ATTACHMENT_SIZE = 4 * 1024 * 1024;

// 舊做法（WorkersPage 的履歷表上傳目前還是用這個，維持現狀沒有改架構）：
// 檔案轉成 data URL 直接存進 Firestore 文件本身，受限於 1MB 文件上限，
// 呼叫端要自行控管檔案大小。
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function uploadAttachment(file, folder) {
  const path = `${folder}/${Date.now()}_${file.name}`;
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, file);
  const url = await getDownloadURL(fileRef);
  return { url, name: file.name, path };
}

// 刪除舊檔是盡力而為——找不到檔案、或規則擋下來，都不影響使用者當下的操作
// （換新檔/移除附件這個動作本身已經透過 Firestore 存檔成功了）。
export async function deleteAttachmentFile(path) {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch {
    // 忽略：檔案可能已經不存在，或是舊資料本來就沒有 path。
  }
}

function isDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:');
}

// Chrome 不允許直接把 data: URL 當成分頁導覽目標開新分頁（會被靜默擋下、
// 按了「顯示」沒有任何反應），要先轉成 Blob URL 才能正常在新分頁開啟或下載。
// 只有舊資料（搬到 Storage 之前上傳的附件）還是 data URL，新上傳的都是
// Storage 下載連結，可以直接開啟/下載。
function dataUrlToBlobUrl(dataUrl) {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/data:(.*?);base64/)?.[1] || 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

export function viewFile(urlOrDataUrl) {
  window.open(isDataUrl(urlOrDataUrl) ? dataUrlToBlobUrl(urlOrDataUrl) : urlOrDataUrl, '_blank');
}

export async function downloadFile(urlOrDataUrl, filename) {
  const blobUrl = isDataUrl(urlOrDataUrl) ? dataUrlToBlobUrl(urlOrDataUrl) : URL.createObjectURL(await (await fetch(urlOrDataUrl)).blob());
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename || '檔案';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
