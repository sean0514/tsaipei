import { useEffect, useState } from 'react';

// 中文/越南文介面文字切換，只給 SYSTEMS[system].bilingual === true 的系統用
// （目前是 vietnam）。只翻譯介面文字本身（選單標籤、按鈕、表格欄位標題），
// 使用者輸入的實際資料（學生姓名、公司名稱、備註等）完全不經過這裡，維持
// 原文顯示。用 localStorage 記住選擇（key 依系統分開），重新整理後還在。
//
// t(text, lang) 用中文原文當查表的 key：lang !== 'vi' 時直接回傳原文；
// lang === 'vi' 時查 VI 字典，查不到就照樣回傳中文原文（不會讓畫面因為
// 漏翻而空白），所以頁面可以漸進式地把文字包上 t(...)，字典不用一次翻完。
export function useLanguage(system) {
  const storageKey = `uiLang_${system}`;
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem(storageKey) || 'zh'; } catch { return 'zh'; }
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, lang); } catch { /* 無痕視窗等情境拿不到 localStorage，忽略即可 */ }
  }, [storageKey, lang]);
  return [lang, setLang];
}

export function t(text, lang) {
  if (lang !== 'vi' || !text) return text;
  return VI[text] || text;
}

// 越南文翻譯字典：目前涵蓋側邊欄選單名稱 + 跨頁共用的按鈕/欄位標籤。
// 頁面專屬的欄位標籤隨每個分頁複製進度陸續補上。
const VI = {
  // 側邊欄模組名稱（SYSTEMS.vietnam.modules）
  '儀表板': 'Bảng điều khiển',
  '學生尚未安排': 'Học viên chưa sắp xếp',
  '學生資料': 'Hồ sơ học viên',
  '實習單位': 'Đơn vị thực tập',
  '媒合紀錄': 'Lịch sử ghép đôi',
  '二面進度': 'Tiến độ phỏng vấn lần 2',
  '錄取名單': 'Danh sách trúng tuyển',
  '辦理簽證提醒': 'Nhắc nhở làm visa',
  '實習文件追蹤': 'Theo dõi hồ sơ thực tập',
  '申辦進度追蹤': 'Theo dõi tiến độ xin cấp',
  '在台簽證追蹤': 'Theo dõi visa tại Đài Loan',
  '在台關懷紀錄': 'Ghi nhận quan tâm tại Đài Loan',
  '預計入台/離台': 'Dự kiến nhập/xuất cảnh',
  '開戶進度追蹤': 'Theo dõi tiến độ mở tài khoản',
  '接送車輛安排': 'Sắp xếp xe đưa đón',
  '主管報表': 'Báo cáo quản lý',
  '住宿安排': 'Sắp xếp chỗ ở',
  '宿舍管理': 'Quản lý ký túc xá',
  '客服未完成事項': 'Việc CSKH chưa hoàn thành',
  '行政未完成事項': 'Việc hành chính chưa hoàn thành',
  '實習單位福利': 'Phúc lợi đơn vị thực tập',
  '會議記錄': 'Biên bản họp',
  '已結案名單': 'Danh sách đã kết thúc',
  '國外補助申請': 'Đơn xin trợ cấp nước ngoài',
  '日常支出申請': 'Đơn xin chi phí hàng ngày',
  '郵資費用紀錄': 'Ghi nhận chi phí bưu phí',
  '客戶請款計算': 'Tính toán thu tiền khách hàng',
  '學生請款計算': 'Tính toán thu tiền học viên',
  '學生自付宿舍': 'Học viên tự trả tiền ký túc xá',
  '學生資料總檔': 'Tổng hợp hồ sơ học viên',
  '國外付款紀錄': 'Ghi nhận thanh toán nước ngoài',
  '宿舍損益': 'Lãi lỗ ký túc xá',
  '公司損益': 'Lãi lỗ công ty',
  '客戶費用建檔': 'Thiết lập phí khách hàng',
  '內部費用建檔': 'Thiết lập phí nội bộ',
  '內部獎金計算': 'Tính toán thưởng nội bộ',
  '使用人員': 'Người dùng hệ thống',

  // 常用按鈕/狀態文字
  '儲存': 'Lưu',
  '取消': 'Hủy',
  '編輯': 'Chỉnh sửa',
  '刪除': 'Xóa',
  '新增': 'Thêm mới',
  '下載': 'Tải xuống',
  '匯出': 'Xuất file',
  '匯入': 'Nhập file',
  '搜尋': 'Tìm kiếm',
  '查詢': 'Tra cứu',
  '確定': 'Xác nhận',
  '登出': 'Đăng xuất',
  '載入中…': 'Đang tải…',
  '請選擇': 'Vui lòng chọn',
  '目前沒有資料。': 'Hiện chưa có dữ liệu.',

  // 常用欄位標籤
  '學生': 'Học viên',
  '客戶': 'Khách hàng',
  '日期': 'Ngày',
  '項目': 'Hạng mục',
  '狀態': 'Trạng thái',
  '備註': 'Ghi chú',
  '金額': 'Số tiền',

  // 儀表板
  '國際實習生整體狀況總覽': 'Tổng quan tình hình thực tập sinh quốc tế',
  '學生總數': 'Tổng số học viên',
  '已入台實習': 'Đã nhập cảnh thực tập',
  '已媒合': 'Đã ghép đôi',
  '開放中職缺': 'Vị trí đang tuyển',
  '宿舍待安排學生': 'Học viên chờ sắp xếp ký túc xá',
  '近期入境學生': 'Học viên nhập cảnh gần đây',
  '近一個月內': 'Trong vòng 1 tháng gần đây',
  '入境日': 'Ngày nhập cảnh',
  '近一個月內沒有入境的學生。': 'Không có học viên nhập cảnh trong vòng 1 tháng gần đây.',
  '近期實習到期學生': 'Học viên sắp hết hạn thực tập',
  '一個月內到期': 'Hết hạn trong vòng 1 tháng',
  '離境日': 'Ngày xuất cảnh',
  '一個月內沒有即將到期的學生。': 'Không có học viên sắp hết hạn trong vòng 1 tháng.',
  '待關心學生': 'Học viên cần quan tâm',
  '上次關懷': 'Lần quan tâm gần nhất',
  '尚未有關懷紀錄日期': 'Chưa có ngày ghi nhận quan tâm',
  '目前沒有標記為「待關心」的學生。': 'Hiện không có học viên nào được đánh dấu "cần quan tâm".',
  '待補件學生': 'Học viên cần bổ sung hồ sơ',
  '尚缺': 'Còn thiếu',
  '項': 'mục',
  '目前沒有待補件的學生。': 'Hiện không có học viên cần bổ sung hồ sơ.',

  // 學生資料
  '姓名': 'Họ tên',
  '原文姓名': 'Tên gốc',
  '性別': 'Giới tính',
  '國籍': 'Quốc tịch',
  '學校': 'Trường học',
  '科系': 'Ngành học',
  '電話': 'Điện thoại',
  '護照號碼': 'Số hộ chiếu',
  '管理來台實習之國際學生基本資料與狀態': 'Quản lý thông tin cơ bản và trạng thái của học viên thực tập quốc tế tại Đài Loan',
  '唯讀': 'Chỉ xem',
  '新增學生': 'Thêm học viên',
  '編輯學生': 'Chỉnh sửa học viên',
  '「匯入資料」欄位需與「下載完整資料」的 CSV 欄位一致；上傳後會完全取代目前所有學生資料，請先下載備份再匯入。':
    'Các cột trong "Nhập dữ liệu" phải khớp với CSV của "Tải toàn bộ dữ liệu"; sau khi tải lên sẽ thay thế toàn bộ dữ liệu học viên hiện tại, vui lòng tải bản sao lưu trước khi nhập.',
  '搜尋姓名/學校/國籍': 'Tìm theo tên/trường/quốc tịch',
  '系所': 'Khoa/Ngành',
  '入境': 'Nhập cảnh',
  '離境': 'Xuất cảnh',
  '文件': 'Hồ sơ',
  '結案': 'Kết thúc hồ sơ',
  '沒有資料': 'Không có dữ liệu',
};
