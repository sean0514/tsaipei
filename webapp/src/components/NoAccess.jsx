// 這個模組的權限等級是 'none' 時顯示，取代整個頁面內容——只隱藏編輯按鈕
// (canEdit) 不夠，view 權限被拿掉時連資料本身都不該顯示，否則直接打網址
// 還是看得到。
export default function NoAccess() {
  return (
    <div className="content">
      <p className="muted">你沒有檢視這個頁面的權限，請聯絡系統管理員調整你的角色權限。</p>
    </div>
  );
}
