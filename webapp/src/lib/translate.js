// MyMemory 翻譯 API：免費、不需金鑰、瀏覽器端可直接呼叫（有回 CORS 標頭），
// 適合這種低流量的內部建檔輔助功能。單次請求上限約 500 字元，超過的文字
// 會依句尾符號/換行自動切成多段分別翻譯再接回來。翻譯品質僅供參考，存檔
// 前請建檔人員自行檢查微調，不保證跟專有名詞（學校/科系全名）完全準確。
const CHUNK_LIMIT = 480;

function splitIntoChunks(text) {
  const sentences = text.split(/(?<=[。！？.!?\n])/);
  const chunks = [];
  let current = '';
  for (const s of sentences) {
    if (current && (current + s).length > CHUNK_LIMIT) {
      chunks.push(current);
      current = s;
    } else {
      current += s;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [text.slice(0, CHUNK_LIMIT)];
}

// MyMemory 遇到匿名額度用完時不會回傳 HTTP 錯誤狀態碼，而是照樣回
// responseStatus 403、translatedText 塞一句英文警告字串（例如
// "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR
// TODAY..."）——如果不特別檢查，這段警告文字會被當成「翻譯結果」直接
// 存進中文欄位，看起來比「完全沒翻譯」更令人困惑，所以這裡明確檢查
// responseStatus 跟警告字樣，額度用完就丟出錯誤，讓呼叫端知道翻譯真的
// 失敗了（而不是悄悄把英文警告當中文存進去）。
async function translateChunk(text, langpair) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langpair}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`翻譯服務錯誤 (${res.status})`);
  const data = await res.json();
  const translated = data?.responseData?.translatedText;
  if (!translated) throw new Error('翻譯服務沒有回傳結果');
  if (data?.responseStatus && data.responseStatus !== 200) {
    throw new Error('翻譯服務額度已用完或暫時無法使用，請稍後再試');
  }
  if (/MYMEMORY WARNING/i.test(translated)) {
    throw new Error('翻譯服務額度已用完，請稍後再試');
  }
  return translated;
}

export async function translateViToZh(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return '';
  const chunks = splitIntoChunks(trimmed);
  const results = [];
  for (const chunk of chunks) {
    results.push(await translateChunk(chunk, 'vi|zh-TW'));
  }
  return results.join('');
}
