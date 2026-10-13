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

  // 實習單位
  '管理合作企業釋出的實習職缺': 'Quản lý vị trí thực tập do doanh nghiệp hợp tác đưa ra',
  '新增職缺': 'Thêm vị trí',
  '編輯職缺': 'Chỉnh sửa vị trí',
  '產業類別需求': 'Nhu cầu theo ngành',
  '依產業別統計目前剩餘缺額（總缺額－已媒合）': 'Thống kê số lượng còn thiếu theo ngành (tổng chỉ tiêu - đã ghép đôi)',
  '剩餘': 'Còn lại',
  '搜尋專案編號/公司/職務': 'Tìm theo mã dự án/công ty/chức vụ',
  '專案編號': 'Mã dự án',
  '函文編號': 'Số công văn',
  '公司名稱': 'Tên công ty',
  '職務名稱': 'Chức vụ',
  '實習場域/地點/缺額/狀態': 'Khu vực/địa điểm/chỉ tiêu/trạng thái thực tập',
  '已媒合/總名額': 'Đã ghép đôi / Tổng chỉ tiêu',
  '實習場域': 'Khu vực thực tập',
  '實習地點': 'Địa điểm thực tập',
  '缺額': 'Chỉ tiêu',
  '名': 'người',
  '尚未設定地點': 'Chưa thiết lập địa điểm',
  '取消已結案': 'Hủy kết thúc hồ sơ',
  '複製': 'Sao chép',
  '移除': 'Xóa bỏ',
  '新增地點': 'Thêm địa điểm',
  '輸入福利項目': 'Nhập mục phúc lợi',
  '新增福利': 'Thêm phúc lợi',
  '其他福利': 'Phúc lợi khác',
  '角色指派（內部獎金計算對照用）': 'Phân công vai trò (dùng để tính thưởng nội bộ)',
  '自行輸入姓名': 'Tự nhập tên',
  '改選清單': 'Chọn lại từ danh sách',
  '（未設定）': '(Chưa thiết lập)',
  '自行輸入…': 'Tự nhập…',

  // 媒合紀錄
  '依國籍分類，將學生配對至職缺並追蹤媒合狀態': 'Phân loại theo quốc tịch, ghép học viên với vị trí và theo dõi trạng thái ghép đôi',
  '新增媒合': 'Thêm ghép đôi',
  '編輯媒合紀錄': 'Chỉnh sửa ghép đôi',
  '新增媒合紀錄': 'Thêm ghép đôi',
  '搜尋學生或職缺': 'Tìm học viên hoặc vị trí',
  '全部狀態': 'Tất cả trạng thái',
  '全部國籍': 'Tất cả quốc tịch',
  '全部來台方案': 'Tất cả chương trình sang Đài Loan',
  '全部客戶': 'Tất cả khách hàng',
  '清除篩選': 'Xóa bộ lọc',
  '共': 'Tổng',
  '筆': 'mục',
  '職缺': 'Vị trí',
  '媒合日期': 'Ngày ghép đôi',
  '來台方案': 'Chương trình sang Đài Loan',
  '請選擇實習場域': 'Vui lòng chọn khu vực thực tập',
  '（此職缺未設定場域）': '(Vị trí này chưa thiết lập khu vực)',
  '請先選擇職務': 'Vui lòng chọn chức vụ trước',
  '目前沒有符合條件的媒合紀錄。': 'Hiện không có bản ghi ghép đôi nào phù hợp.',

  // 二面進度
  '依進度狀態自動分類，追蹤已媒合學生的第二輪面試進度': 'Tự động phân loại theo trạng thái, theo dõi tiến độ phỏng vấn lần 2 của học viên đã ghép đôi',
  '搜尋學生姓名或公司/職務': 'Tìm theo tên học viên hoặc công ty/chức vụ',
  '媒合': 'Ghép đôi',
  '二面日期': 'Ngày phỏng vấn lần 2',
  '面試方式': 'Hình thức phỏng vấn',
  '編輯二面進度': 'Chỉnh sửa tiến độ phỏng vấn lần 2',
  '進度狀態': 'Trạng thái tiến độ',

  // 錄取名單
  '記錄最終確定錄取的學生（二面進度標記「通過」會自動加入此清單）': 'Ghi nhận học viên đã được xác nhận trúng tuyển (tự động thêm vào khi phỏng vấn lần 2 đánh dấu "Đạt")',
  '錄取日期': 'Ngày trúng tuyển',
  '編輯錄取名單': 'Chỉnh sửa danh sách trúng tuyển',

  // 實習文件追蹤
  '追蹤每位學生的實習相關文件收件狀況（學生確認錄取後會自動加入此清單）': 'Theo dõi tình trạng nộp hồ sơ thực tập của từng học viên (tự động thêm vào khi học viên được xác nhận trúng tuyển)',
  '管理': 'Quản lý',
  '搜尋學生或客戶/職務': 'Tìm theo học viên hoặc khách hàng/chức vụ',
  '處理中': 'Đang xử lý',
  '位學生': 'học viên',
  '目前沒有處理中的學生。': 'Hiện không có học viên đang xử lý.',
  '已繳交文件': 'Hồ sơ đã nộp',
  '已完成繳交': 'Đã nộp xong',
  '全部核准': 'Duyệt tất cả',
  '文件類型': 'Loại hồ sơ',
  '額外資訊': 'Thông tin bổ sung',
  '收件日期': 'Ngày nhận hồ sơ',
  '未設定': 'Chưa thiết lập',
  '未提供': 'Chưa cung cấp',
  '關閉': 'Đóng',
  '（尚未繳交）': '(Chưa nộp)',
  '尚未開始': 'Chưa bắt đầu',
  '收集中': 'Đang thu thập',
  '已收齊，待確認完成': 'Đã thu đủ, chờ xác nhận hoàn tất',
  '完成日期': 'Ngày hoàn tất',
  '目前沒有已完成的學生。': 'Hiện không có học viên đã hoàn tất.',

  // 申辦進度追蹤
  '依客戶分類，追蹤每位學生從錄取到入台的整體申辦流程': 'Phân loại theo khách hàng, theo dõi toàn bộ quy trình xin cấp phép của từng học viên từ trúng tuyển đến nhập cảnh',
  '新增進度紀錄': 'Thêm bản ghi tiến độ',
  '編輯進度紀錄': 'Chỉnh sửa bản ghi tiến độ',
  '檢查中…': 'Đang kiểm tra…',
  '核對辦理簽證學生的住宿安排/簽證追蹤': 'Kiểm tra sắp xếp chỗ ở/theo dõi visa của học viên đang làm visa',
  '尚無進度紀錄。學生「確認錄取」後會自動建立，也可以點選「新增進度紀錄」手動加入。': 'Chưa có bản ghi tiến độ. Sẽ tự động tạo khi học viên "xác nhận trúng tuyển", hoặc bấm "Thêm bản ghi tiến độ" để thêm thủ công.',
  '未入台': 'Chưa nhập cảnh',
  '已入台': 'Đã nhập cảnh',
  '目前沒有符合的學生。': 'Hiện không có học viên phù hợp.',
  '申辦流程': 'Quy trình xin cấp phép',
  '進度圖示': 'Biểu tượng tiến độ',
  '請選擇學生': 'Vui lòng chọn học viên',
  '學生錄取': 'Học viên trúng tuyển',
  'MOU簽署-學校端用印': 'Ký MOU - đóng dấu phía trường',
  'MOU簽署-企業端用印': 'Ký MOU - đóng dấu phía doanh nghiệp',
  '收集學生資料': 'Thu thập hồ sơ học viên',
  '收集企業資料': 'Thu thập hồ sơ doanh nghiệp',
  '撰寫計劃書': 'Soạn thảo kế hoạch',
  '企業用印': 'Doanh nghiệp đóng dấu',
  '經濟部/交通部審核': 'Bộ Kinh tế/Bộ Giao thông thẩm định',
  '發函後寄國外': 'Gửi công văn ra nước ngoài',
  '辦理簽證': 'Làm visa',
  '預約體檢公司': 'Đặt lịch khám sức khỏe',
  '入台': 'Nhập cảnh',

  // 辦理簽證提醒
  '依客戶分類，列出申辦進度追蹤裡目前進度顯示為「辦理簽證」的學生；進度離開辦理簽證即自動從清單移除（唯讀）':
    'Phân loại theo khách hàng, liệt kê học viên đang ở bước "Làm visa" trong tiến độ xin cấp phép; tự động rời khỏi danh sách khi tiến độ thay đổi (chỉ xem)',
  '目前沒有待辦理簽證的學生。': 'Hiện không có học viên đang chờ làm visa.',

  // 在台簽證追蹤
  '依在台中／已離台分類，在台中的學生再依客戶分組；「已離台」在第二次離台時間到期後自動列入；填寫第一次入台時間後會自動在日常支出申請待審核清單帶入寢具費用480/鑰匙費用300/體檢費用300（類型=收入）':
    'Phân loại theo đang ở Đài Loan/đã xuất cảnh, học viên đang ở Đài Loan được nhóm theo khách hàng; "Đã xuất cảnh" tự động thêm khi đến hạn ngày xuất cảnh lần 2; khi nhập ngày nhập cảnh lần 1 sẽ tự động thêm vào danh sách chờ duyệt đơn xin chi phí: tiền chăn ga 480/tiền chìa khóa 300/tiền khám sức khỏe 300 (loại=thu nhập)',
  '顯示已確認離台': 'Hiển thị đã xác nhận xuất cảnh',
  '補建立中…': 'Đang bổ sung…',
  '補建立入境費用': 'Bổ sung chi phí nhập cảnh',
  '在台中': 'Đang ở Đài Loan',
  '已離台': 'Đã xuất cảnh',
  '目前沒有在台中的學生。': 'Hiện không có học viên đang ở Đài Loan.',
  '編輯在台簽證追蹤': 'Chỉnh sửa theo dõi visa tại Đài Loan',
  '第一次入台時間': 'Thời gian nhập cảnh lần 1',
  '第一次離台時間': 'Thời gian xuất cảnh lần 1',
  '在台期間換發簽證時間': 'Thời gian đổi visa trong thời gian ở Đài Loan',
  '第二次入台時間': 'Thời gian nhập cảnh lần 2',
  '第二次離台時間': 'Thời gian xuất cảnh lần 2',
  '在台期間換發簽證時間2': 'Thời gian đổi visa trong thời gian ở Đài Loan 2',
  '確認離台': 'Xác nhận xuất cảnh',

  // 在台關懷紀錄
  '依專案編號＋客戶分類，記錄學生在台期間的關懷追蹤（在台簽證追蹤建立後自動加入；確認離台後自動移除）':
    'Phân loại theo mã dự án + khách hàng, ghi nhận theo dõi quan tâm học viên trong thời gian ở Đài Loan (tự động thêm khi tạo theo dõi visa; tự động xóa khi xác nhận xuất cảnh)',
  '尚無在台關懷紀錄。': 'Chưa có bản ghi quan tâm tại Đài Loan.',
  '筆紀錄': 'bản ghi',
  '關懷時間': 'Thời gian quan tâm',
  '內容': 'Nội dung',
  '編輯在台關懷紀錄': 'Chỉnh sửa ghi nhận quan tâm',

  // 開戶進度追蹤
  '在台簽證追蹤裡填了第一次入台時間的學生會自動列入此清單；基資表包含申請書、在職證明、護照正本、護照影本、簽證正本、簽證影本、核准函正本，全部收齊後自動標示為已收齊；已開戶的學生按「確認完成」後會從清單消失（下載完整資料仍會包含）':
    'Học viên đã nhập thời gian nhập cảnh lần 1 trong theo dõi visa sẽ tự động vào danh sách này; hồ sơ cơ bản gồm đơn xin, giấy xác nhận công tác, hộ chiếu gốc, bản sao hộ chiếu, visa gốc, bản sao visa, công văn phê duyệt gốc, tự động đánh dấu đã đủ khi thu đủ tất cả; học viên đã mở tài khoản sau khi bấm "Xác nhận hoàn tất" sẽ rời khỏi danh sách (tải dữ liệu đầy đủ vẫn bao gồm)',
  '下載完整資料': 'Tải toàn bộ dữ liệu',
  '目前沒有需要追蹤的學生。': 'Hiện không có học viên cần theo dõi.',
  '未開戶': 'Chưa mở tài khoản',
  '已開戶': 'Đã mở tài khoản',
  '入台日期': 'Ngày nhập cảnh',
  '預約開戶日期': 'Ngày hẹn mở tài khoản',
  '銀行+分行': 'Ngân hàng + chi nhánh',
  '基資表': 'Hồ sơ cơ bản',
  '銀行帳戶': 'Tài khoản ngân hàng',
  '已收齊': 'Đã thu đủ',
  '確認完成': 'Xác nhận hoàn tất',
  '申請書': 'Đơn xin',
  '在職證明': 'Giấy xác nhận công tác',
  '護照正本': 'Hộ chiếu gốc',
  '簽證正本': 'Visa gốc',
  '簽證影本': 'Bản sao visa',
  '核准函正本': 'Công văn phê duyệt gốc',

  // 預計入台/離台
  '在台簽證追蹤裡填有入境或離境時間（第一次／第二次皆可）且落在今天前後一個月內的學生，超過一個月自動從清單移除':
    'Học viên đã nhập thời gian nhập cảnh hoặc xuất cảnh (lần 1 hoặc lần 2) trong theo dõi visa và nằm trong khoảng 1 tháng trước/sau hôm nay, tự động xóa khỏi danh sách khi quá 1 tháng',
  '下載此月份報表': 'Tải báo cáo tháng này',
  '離台': 'Xuất cảnh',
  '已體檢': 'Đã khám sức khỏe',
  '已送工': 'Đã đến nơi làm việc',
  '體檢/送工資訊': 'Thông tin khám sức khỏe/đến nơi làm việc',
  '航班/付款資訊': 'Thông tin chuyến bay/thanh toán',
  '體檢日期': 'Ngày khám sức khỏe',
  '體檢公司': 'Công ty khám sức khỏe',
  '體檢公司送達地': 'Địa điểm công ty khám sức khỏe đưa đến',
  '送工日期': 'Ngày đến nơi làm việc',
  '送工地點': 'Địa điểm đến nơi làm việc',
  '航空公司': 'Hãng hàng không',
  '航班編號': 'Số hiệu chuyến bay',
  '航廈': 'Nhà ga',
  '機票費用': 'Chi phí vé máy bay',
  '付款人': 'Người thanh toán',

  // 接送車輛安排
  '「待安排」清單同步「預計入台/離台」：在台簽證追蹤裡落在今天前後一個月內的入境/離境紀錄':
    'Danh sách "Chờ sắp xếp" đồng bộ với "Dự kiến nhập/xuất cảnh": bản ghi nhập/xuất cảnh trong theo dõi visa nằm trong khoảng 1 tháng trước/sau hôm nay',
  '新增安排車輛': 'Thêm sắp xếp xe',
  '待安排': 'Chờ sắp xếp',
  '建議類型': 'Loại đề xuất',
  '新增安排': 'Thêm sắp xếp',
  '已安排': 'Đã sắp xếp',
  '類型': 'Loại',
  '編輯安排': 'Chỉnh sửa sắp xếp',
};
