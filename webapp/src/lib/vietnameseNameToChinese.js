// 越南姓名→中文姓名：越南姓名的每個字（音節）大多源自漢字，有固定的
// 「漢越音」對照（例如 Nguyễn 對應「阮」、Văn 對應「文」），逐字查表
// 組合起來，比直接丟給一般文字翻譯 API（lib/translate.js，拿來翻省份/
// 宗教/民族等一般詞彙很準，但姓名不是「詞義翻譯」，常常翻出不相干的字）
// 準確得多。查不到的音節保留原文（越南文），讓行政人員看得出哪個字要
// 自己補，不瞎猜亂填一個字進去。
//
// 字典只收常見姓氏跟常見名字音節，覆蓋不到所有越南姓名——這是輔助建檔
// 用的「建議」，填入後行政人員仍要自行核對、必要時修正。

const SURNAMES = {
  'nguyễn': '阮', 'trần': '陳', 'lê': '黎', 'phạm': '范', 'hoàng': '黃', 'huỳnh': '黃',
  'phan': '潘', 'vũ': '武', 'võ': '武', 'đặng': '鄧', 'bùi': '裴', 'đỗ': '杜', 'hồ': '胡',
  'ngô': '吳', 'dương': '楊', 'lý': '李', 'đinh': '丁', 'đoàn': '段', 'vương': '王',
  'lương': '梁', 'trương': '張', 'mai': '梅', 'tô': '蘇', 'tạ': '謝', 'lâm': '林',
  'lưu': '劉', 'thái': '蔡', 'chu': '朱', 'châu': '周', 'trịnh': '鄭', 'đào': '陶',
  'diệp': '葉', 'tăng': '曾', 'quách': '郭', 'hà': '何', 'hứa': '許', 'la': '羅',
  'cao': '高', 'kiều': '喬', 'khổng': '孔', 'đường': '唐', 'thân': '申', 'thi': '施',
  'âu': '歐', 'cung': '龔', 'uông': '汪', 'tiêu': '蕭', 'bành': '彭', 'đàm': '譚',
  'kỳ': '祁', 'quyền': '權', 'lạc': '駱', 'hán': '韓', 'sử': '史', 'lỗ': '魯',
  'tần': '秦', 'tôn': '孫', 'ông': '翁', 'giang': '江', 'khương': '姜', 'thạch': '石',
  'phó': '傅', 'phùng': '馮', 'cố': '顧', 'ân': '殷', 'nhiêu': '饒', 'ôn': '溫',
};

const GIVEN_SYLLABLES = {
  'văn': '文', 'thị': '氏', 'hữu': '有', 'đức': '德', 'minh': '明', 'anh': '英',
  'hùng': '雄', 'dũng': '勇', 'tuấn': '俊', 'hải': '海', 'quang': '光', 'thành': '成',
  'công': '公', 'trung': '中', 'nam': '南', 'sơn': '山', 'long': '龍', 'phúc': '福',
  'phước': '福', 'phương': '芳', 'linh': '玲', 'hương': '香', 'lan': '蘭', 'hoa': '花',
  'thu': '秋', 'xuân': '春', 'hạ': '夏', 'đông': '冬', 'thảo': '草', 'hiền': '賢',
  'trang': '莊', 'nga': '娥', 'tâm': '心', 'thương': '商', 'hồng': '紅', 'vân': '雲',
  'yến': '燕', 'ngọc': '玉', 'bích': '碧', 'thủy': '水', 'trâm': '簪', 'nhi': '兒',
  'diễm': '艷', 'khánh': '慶', 'khoa': '科', 'toàn': '全', 'tài': '才', 'quốc': '國',
  'gia': '嘉', 'bảo': '寶', 'khang': '康', 'an': '安', 'bình': '平', 'thắng': '勝',
  'chiến': '戰', 'đạt': '達', 'hạnh': '幸', 'thiện': '善', 'nhân': '仁', 'nghĩa': '義',
  'lễ': '禮', 'trí': '智', 'tín': '信', 'lợi': '利', 'hiệp': '協', 'tấn': '晉',
  'kiệt': '傑', 'vinh': '榮', 'quý': '貴', 'thịnh': '盛', 'phát': '發', 'thọ': '壽',
  'hậu': '厚', 'hòa': '和', 'hoà': '和', 'cường': '強', 'mạnh': '孟', 'tiến': '進',
  'việt': '越', 'phong': '風', 'kiên': '堅', 'khải': '啟', 'huy': '輝', 'đạo': '道',
  'thiên': '天', 'phú': '富', 'lộc': '祿', 'tuệ': '慧', 'nhung': '絨', 'dung': '容',
  'diệu': '妙', 'oanh': '鶯', 'loan': '鸞', 'quyên': '娟', 'hằng': '姮', 'nguyệt': '月',
  'tuyết': '雪', 'thư': '書', 'uyên': '淵', 'trà': '茶', 'quỳnh': '瓊', 'như': '如',
  'ý': '意', 'đan': '丹', 'chi': '芝', 'kim': '金', 'ngân': '銀', 'xuyên': '川',
  'đình': '庭', 'duy': '維', 'hoài': '懷', 'nhật': '日', 'nguyên': '元',
  'quân': '軍', 'thanh': '清', 'thắm': '深', 'thuận': '順', 'tường': '祥', 'vĩnh': '永',
  'hiếu': '孝', 'liên': '蓮', 'mỹ': '美', 'nhàn': '閒', 'thuỳ': '垂', 'thùy': '垂',
  'trúc': '竹', 'phượng': '鳳', 'huệ': '惠', 'lệ': '麗', 'tố': '素',
  'yên': '安', 'khuê': '奎', 'bửu': '寶', 'kha': '柯', 'khôi': '魁',
};

function normalizeWord(w) {
  return (w || '').trim().toLowerCase();
}

// 越文姓名逐字查表轉換：姓氏字典優先比對第一個字，其餘各字查名字音節
// 字典；查不到的字維持原文（首字大寫），不用機率猜一個可能錯的漢字。
export function suggestChineseName(vietnameseName) {
  const words = (vietnameseName || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  return words
    .map((w, i) => {
      const key = normalizeWord(w);
      if (i === 0 && SURNAMES[key]) return SURNAMES[key];
      return GIVEN_SYLLABLES[key] || SURNAMES[key] || w;
    })
    .join('');
}
