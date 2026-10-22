import { useState } from 'react';

// 鈞羽有限公司對外形象網站（公開頁面，/about，不需要登入），跟
// VietnamResumeApplyPage.jsx 一樣是獨立的公開路由，但這裡是純介紹頁面，
// 不是表單——介紹公司、服務內容、聯絡方式，給潛在合作學校/學生看。
// 中/英/越三語切換，文案都寫在同一個物件裡用 key 對照，之後要加語言或
// 改文案都只要改這個物件，不用動版面結構。
// 聯絡方式（地址/電話/Email）目前是「待補」佔位文字，等公司提供正式資料
// 後再替換成實際內容。
const LANGS = [
  { key: 'zh', label: '中文' },
  { key: 'en', label: 'English' },
  { key: 'vi', label: 'Tiếng Việt' },
];

const CONTENT = {
  tagline: {
    zh: '連結國際學生與台灣企業，打造安心的海外實習旅程',
    en: 'Connecting international students with Taiwan businesses for a worry-free internship journey',
    vi: 'Kết nối sinh viên quốc tế với doanh nghiệp Đài Loan, tạo hành trình thực tập an tâm',
  },
  heroSub: {
    zh: '境外實習生管理專家',
    en: 'International Internship Management Specialists',
    vi: 'Chuyên gia quản lý thực tập sinh nước ngoài',
  },
  aboutTitle: { zh: '關於鈞羽', en: 'About Junyu', vi: 'Về Junyu' },
  aboutBody: {
    zh: '鈞羽有限公司長期協助國際學生來台實習，從媒合企業職缺、辦理簽證文件、安排住宿接送，到學生在台期間的生活關懷，提供一站式的服務，讓學生安心實習、企業安心用人。',
    en: 'Junyu Co., Ltd. has long helped international students intern in Taiwan — from matching positions and handling visa paperwork, to arranging housing and transportation, and caring for students throughout their stay — offering one-stop service so students and partner companies can both have peace of mind.',
    vi: 'Công ty TNHH Junyu từ lâu đã hỗ trợ sinh viên quốc tế thực tập tại Đài Loan — từ ghép đôi vị trí thực tập, xử lý hồ sơ visa, sắp xếp chỗ ở và đưa đón, đến quan tâm đời sống sinh viên trong suốt thời gian ở Đài Loan — cung cấp dịch vụ trọn gói để sinh viên và doanh nghiệp đối tác đều an tâm.',
  },
  servicesTitle: { zh: '服務內容', en: 'Our Services', vi: 'Dịch vụ của chúng tôi' },
  services: [
    {
      icon: '🤝',
      title: { zh: '職缺媒合', en: 'Internship Matching', vi: 'Ghép đôi vị trí thực tập' },
      desc: {
        zh: '依學生專長與意願，媒合合適的實習企業與職缺。',
        en: 'Matching students with suitable internship positions based on their skills and preferences.',
        vi: 'Ghép đôi sinh viên với vị trí thực tập phù hợp theo chuyên môn và nguyện vọng.',
      },
    },
    {
      icon: '📄',
      title: { zh: '簽證與文件協助', en: 'Visa & Document Support', vi: 'Hỗ trợ visa và hồ sơ' },
      desc: {
        zh: '協助辦理在台簽證、在學證明、護照等各項文件追蹤。',
        en: 'Assisting with visa applications, enrollment proof, passports and other document tracking.',
        vi: 'Hỗ trợ xin visa tại Đài Loan, giấy xác nhận học tập, hộ chiếu và theo dõi các giấy tờ khác.',
      },
    },
    {
      icon: '🏠',
      title: { zh: '住宿安排', en: 'Housing Arrangement', vi: 'Sắp xếp chỗ ở' },
      desc: {
        zh: '安排符合需求的宿舍，提供入住期間的管理與協助。',
        en: 'Arranging suitable dormitories with ongoing management support during the stay.',
        vi: 'Sắp xếp ký túc xá phù hợp, hỗ trợ quản lý trong suốt thời gian ở.',
      },
    },
    {
      icon: '🚐',
      title: { zh: '接送服務', en: 'Transportation Service', vi: 'Dịch vụ đưa đón' },
      desc: {
        zh: '安排入境/離境及日常往返實習單位的接送車輛。',
        en: 'Arranging airport pickup/drop-off and daily transportation to internship sites.',
        vi: 'Sắp xếp đưa đón sân bay và đưa đón hàng ngày đến nơi thực tập.',
      },
    },
    {
      icon: '💬',
      title: { zh: '在台生活關懷', en: 'In-Taiwan Care', vi: 'Quan tâm đời sống tại Đài Loan' },
      desc: {
        zh: '定期關懷學生適應狀況，即時協助處理生活上的大小事。',
        en: 'Regularly checking in on students’ wellbeing and helping resolve day-to-day issues.',
        vi: 'Thường xuyên quan tâm tình hình thích nghi của sinh viên, hỗ trợ kịp thời các vấn đề trong cuộc sống.',
      },
    },
    {
      icon: '🧾',
      title: { zh: '企業請款對接', en: 'Client Billing Coordination', vi: 'Phối hợp thanh toán với doanh nghiệp' },
      desc: {
        zh: '提供清楚透明的費用試算與請款單據，簡化企業對帳流程。',
        en: 'Providing clear, transparent cost calculations and invoices to simplify reconciliation for companies.',
        vi: 'Cung cấp tính toán chi phí và hóa đơn rõ ràng, minh bạch để đơn giản hóa đối chiếu cho doanh nghiệp.',
      },
    },
  ],
  whyTitle: { zh: '為什麼選擇我們', en: 'Why Choose Us', vi: 'Tại sao chọn chúng tôi' },
  why: [
    {
      title: { zh: '一站式服務', en: 'One-Stop Service', vi: 'Dịch vụ trọn gói' },
      desc: {
        zh: '從媒合到在台生活，全程專人協助，不用自己到處奔波。',
        en: 'Dedicated support from matching to daily life in Taiwan — no need to navigate everything alone.',
        vi: 'Hỗ trợ chuyên trách từ ghép đôi đến đời sống tại Đài Loan — không cần tự mình lo liệu mọi thứ.',
      },
    },
    {
      title: { zh: '經驗豐富的團隊', en: 'Experienced Team', vi: 'Đội ngũ giàu kinh nghiệm' },
      desc: {
        zh: '長期深耕境外實習生領域，熟悉簽證與法規流程。',
        en: 'Deep experience in international internship placement, familiar with visa and regulatory processes.',
        vi: 'Kinh nghiệm sâu rộng trong lĩnh vực thực tập sinh nước ngoài, am hiểu quy trình visa và pháp lý.',
      },
    },
    {
      title: { zh: '透明的進度追蹤', en: 'Transparent Progress Tracking', vi: 'Theo dõi tiến độ minh bạch' },
      desc: {
        zh: '每個階段都有清楚紀錄，學生與企業都能隨時掌握狀態。',
        en: 'Every stage is clearly tracked, so both students and companies always know where things stand.',
        vi: 'Mỗi giai đoạn đều được ghi nhận rõ ràng, sinh viên và doanh nghiệp luôn nắm được tình trạng.',
      },
    },
  ],
  contactTitle: { zh: '聯絡我們', en: 'Contact Us', vi: 'Liên hệ chúng tôi' },
  contactIntro: {
    zh: '如有合作或合作學校洽詢需求，歡迎與我們聯繫。',
    en: 'For partnership or school cooperation inquiries, please feel free to reach out.',
    vi: 'Nếu có nhu cầu hợp tác hoặc liên hệ với trường đối tác, xin vui lòng liên hệ với chúng tôi.',
  },
  addressLabel: { zh: '地址', en: 'Address', vi: 'Địa chỉ' },
  phoneLabel: { zh: '電話', en: 'Phone', vi: 'Điện thoại' },
  emailLabel: { zh: 'Email', en: 'Email', vi: 'Email' },
  pending: { zh: '待補', en: 'Coming soon', vi: 'Sắp cập nhật' },
  footer: {
    zh: '鈞羽有限公司 版權所有',
    en: 'Junyu Co., Ltd. All rights reserved.',
    vi: 'Công ty TNHH Junyu. Bảo lưu mọi quyền.',
  },
};

export default function JunyuCompanySitePage() {
  const [lang, setLang] = useState('zh');
  const c = (field) => CONTENT[field][lang];

  return (
    <div className="theme-tsaipei" style={{ minHeight: '100vh', background: '#FFF9FB', color: '#2b2b2b' }}>
      <header
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 24px', borderBottom: '1px solid var(--border, #f0dde4)',
          position: 'sticky', top: 0, background: '#FFF9FBee', backdropFilter: 'blur(4px)', zIndex: 10,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 24 }}>🌸</span> 鈞羽有限公司
        </div>
        <div className="row-actions">
          {LANGS.map((l) => (
            <button
              key={l.key}
              onClick={() => setLang(l.key)}
              className={lang === l.key ? 'primary' : ''}
              style={{ fontSize: 13, padding: '6px 12px' }}
            >
              {l.label}
            </button>
          ))}
        </div>
      </header>

      <section
        style={{
          padding: '64px 24px', textAlign: 'center',
          background: 'linear-gradient(180deg, var(--accent-soft, #FDE7EE) 0%, #FFF9FB 100%)',
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>🌸</div>
        <h1 style={{ fontSize: 32, margin: '0 0 8px', fontWeight: 800 }}>{c('heroSub')}</h1>
        <p style={{ fontSize: 17, color: '#6b5a60', maxWidth: 560, margin: '0 auto' }}>{c('tagline')}</p>
      </section>

      <section style={{ maxWidth: 820, margin: '0 auto', padding: '48px 24px' }}>
        <h2 style={{ fontSize: 24, marginBottom: 12 }}>{c('aboutTitle')}</h2>
        <p style={{ fontSize: 16, lineHeight: 1.8, color: '#4a4044' }}>{c('aboutBody')}</p>
      </section>

      <section style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 24px 48px' }}>
        <h2 style={{ fontSize: 24, marginBottom: 20, textAlign: 'center' }}>{c('servicesTitle')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {CONTENT.services.map((s, i) => (
            <div key={i} className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
              <h3 style={{ margin: '0 0 6px', fontSize: 17 }}>{s.title[lang]}</h3>
              <p style={{ margin: 0, fontSize: 14, color: '#6b5a60', lineHeight: 1.6 }}>{s.desc[lang]}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: 'var(--accent-soft, #FDE7EE)', padding: '48px 24px' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>
          <h2 style={{ fontSize: 24, marginBottom: 20, textAlign: 'center' }}>{c('whyTitle')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {CONTENT.why.map((w, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <h3 style={{ fontSize: 17, margin: '0 0 6px' }}>{w.title[lang]}</h3>
                <p style={{ margin: 0, fontSize: 14, color: '#6b5a60', lineHeight: 1.6 }}>{w.desc[lang]}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 560, margin: '0 auto', padding: '48px 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 24, marginBottom: 8 }}>{c('contactTitle')}</h2>
        <p style={{ fontSize: 15, color: '#6b5a60', marginBottom: 24 }}>{c('contactIntro')}</p>
        <div className="card" style={{ textAlign: 'left', padding: 20 }}>
          <div style={{ marginBottom: 10 }}><strong>{c('addressLabel')}：</strong>{c('pending')}</div>
          <div style={{ marginBottom: 10 }}><strong>{c('phoneLabel')}：</strong>{c('pending')}</div>
          <div><strong>{c('emailLabel')}：</strong>{c('pending')}</div>
        </div>
      </section>

      <footer style={{ textAlign: 'center', padding: '24px', fontSize: 13, color: '#9a8a90', borderTop: '1px solid var(--border, #f0dde4)' }}>
        {c('footer')}
      </footer>
    </div>
  );
}
