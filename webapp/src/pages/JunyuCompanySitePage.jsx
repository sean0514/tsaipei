import { useState } from 'react';

// 鈞羽有限公司對外形象網站（公開頁面，/about，不需要登入），跟
// VietnamResumeApplyPage.jsx 一樣是獨立的公開路由，但這裡是純介紹頁面，
// 不是表單——介紹公司、服務內容、聯絡方式，給潛在合作學校/學生看。
// 中/英/越三語切換，文案都寫在同一個物件裡用 key 對照，之後要加語言或
// 改文案都只要改這個物件，不用動版面結構。
// 聯絡方式（地址/電話/Email）目前是「待補」佔位文字，等公司提供正式資料
// 後再替換成實際內容。
// 圖片部分：手上沒有公司實際的辦公室/團隊/學生照片，為了不誤導瀏覽者
// （不能拿不是真的的人像/場景照片裝成公司實景），這裡全部改用原創的
// 線條圖示（SVG）跟裝飾性波浪分隔線，走簡潔專業風格，不是真實照片。
const LANGS = [
  { key: 'zh', label: '中文' },
  { key: 'en', label: 'English' },
  { key: 'vi', label: 'Tiếng Việt' },
];

// 線條圖示統一走 stroke="currentColor"，顏色跟文字顏色走、不用額外指定，
// 外層套 color 樣式就能換色（服務卡片用主色、其他地方用灰階都可以）。
const ICON_PROPS = { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };

function HandshakeIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M2 12l4-3 3 2 3-2 3 2 3-2 4 3" />
      <path d="M8 11l3 6 2-1-2-5" />
      <path d="M16 11l-3 6-2-1 1-3" />
    </svg>
  );
}
function DocumentIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v4h4" />
      <path d="M9 13h6M9 17h6M9 9h2" />
    </svg>
  );
}
function HouseIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}
function VanIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 16V8a1 1 0 0 1 1-1h9v9" />
      <path d="M13 10h4l3 3v3h-7" />
      <circle cx="7" cy="17" r="1.6" />
      <circle cx="17" cy="17" r="1.6" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 5h16v11H9l-5 4V5z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  );
}
function InvoiceIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z" />
      <path d="M9 7h6M9 11h6M9 15h3" />
    </svg>
  );
}
function PlaneIcon(props) {
  return (
    <svg {...ICON_PROPS} {...props}>
      <path d="M2 16l20-7-20-7 3 7-3 7z" />
      <path d="M5 9h17" />
    </svg>
  );
}
function GlobeIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </svg>
  );
}

// 裝飾性波浪分隔線，區塊之間用來當視覺過場，不是照片，純 SVG 路徑。
function WaveDivider({ fill = '#FFF9FB' }) {
  return (
    <svg viewBox="0 0 1200 60" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 48 }}>
      <path d="M0,32 C200,60 400,0 600,24 C800,48 1000,8 1200,32 L1200,60 L0,60 Z" fill={fill} />
    </svg>
  );
}

// Hero 裝飾圖：兩個重疊圓圈代表「東南亞」與「台灣」＋虛線飛行路徑＋飛機
// 圖示，意象是「連結國際學生與台灣企業」，純幾何線條，不是真實場景或
// 人像。
function HeroIllustration() {
  return (
    <svg viewBox="0 0 320 180" style={{ width: '100%', maxWidth: 360, height: 'auto', margin: '0 auto', display: 'block' }}>
      <circle cx="90" cy="95" r="58" fill="var(--accent-soft, #FDE7EE)" />
      <circle cx="230" cy="95" r="58" fill="#FDF0F4" />
      <path d="M90 95 L230 95" stroke="var(--accent, #EA82A3)" strokeWidth="2" strokeDasharray="6 6" />
      <circle cx="90" cy="95" r="6" fill="var(--accent, #EA82A3)" />
      <circle cx="230" cy="95" r="6" fill="var(--accent, #EA82A3)" />
      <g transform="translate(148,80)" stroke="var(--accent, #EA82A3)" strokeWidth="1.6" fill="var(--accent, #EA82A3)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M0 15L24 7 0 -1l3 8-3 8z" />
      </g>
      <g transform="translate(78,58)" stroke="var(--accent, #EA82A3)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="5" />
        <path d="M4 26c0-6 4-10 8-10s8 4 8 10" />
      </g>
      <g transform="translate(216,56)" stroke="var(--accent, #EA82A3)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 24h20M6 24V12l8-6 8 6v12M11 24v-6h4v6" />
      </g>
    </svg>
  );
}

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
  countriesTitle: { zh: '學生來源地區', en: 'Student Source Countries', vi: 'Khu vực nguồn sinh viên' },
  countries: [
    { flag: '🇻🇳', name: { zh: '越南', en: 'Vietnam', vi: 'Việt Nam' } },
    { flag: '🇮🇩', name: { zh: '印尼', en: 'Indonesia', vi: 'Indonesia' } },
    { flag: '🇵🇭', name: { zh: '菲律賓', en: 'Philippines', vi: 'Philippines' } },
    { flag: '🇹🇭', name: { zh: '泰國', en: 'Thailand', vi: 'Thái Lan' } },
  ],
  servicesTitle: { zh: '服務內容', en: 'Our Services', vi: 'Dịch vụ của chúng tôi' },
  services: [
    {
      Icon: HandshakeIcon,
      title: { zh: '職缺媒合', en: 'Internship Matching', vi: 'Ghép đôi vị trí thực tập' },
      desc: {
        zh: '依學生專長與意願，媒合合適的實習企業與職缺。',
        en: 'Matching students with suitable internship positions based on their skills and preferences.',
        vi: 'Ghép đôi sinh viên với vị trí thực tập phù hợp theo chuyên môn và nguyện vọng.',
      },
    },
    {
      Icon: DocumentIcon,
      title: { zh: '簽證與文件協助', en: 'Visa & Document Support', vi: 'Hỗ trợ visa và hồ sơ' },
      desc: {
        zh: '協助辦理在台簽證、在學證明、護照等各項文件追蹤。',
        en: 'Assisting with visa applications, enrollment proof, passports and other document tracking.',
        vi: 'Hỗ trợ xin visa tại Đài Loan, giấy xác nhận học tập, hộ chiếu và theo dõi các giấy tờ khác.',
      },
    },
    {
      Icon: HouseIcon,
      title: { zh: '住宿安排', en: 'Housing Arrangement', vi: 'Sắp xếp chỗ ở' },
      desc: {
        zh: '安排符合需求的宿舍，提供入住期間的管理與協助。',
        en: 'Arranging suitable dormitories with ongoing management support during the stay.',
        vi: 'Sắp xếp ký túc xá phù hợp, hỗ trợ quản lý trong suốt thời gian ở.',
      },
    },
    {
      Icon: VanIcon,
      title: { zh: '接送服務', en: 'Transportation Service', vi: 'Dịch vụ đưa đón' },
      desc: {
        zh: '安排入境/離境及日常往返實習單位的接送車輛。',
        en: 'Arranging airport pickup/drop-off and daily transportation to internship sites.',
        vi: 'Sắp xếp đưa đón sân bay và đưa đón hàng ngày đến nơi thực tập.',
      },
    },
    {
      Icon: ChatIcon,
      title: { zh: '在台生活關懷', en: 'In-Taiwan Care', vi: 'Quan tâm đời sống tại Đài Loan' },
      desc: {
        zh: '定期關懷學生適應狀況，即時協助處理生活上的大小事。',
        en: 'Regularly checking in on students’ wellbeing and helping resolve day-to-day issues.',
        vi: 'Thường xuyên quan tâm tình hình thích nghi của sinh viên, hỗ trợ kịp thời các vấn đề trong cuộc sống.',
      },
    },
    {
      Icon: InvoiceIcon,
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
          padding: '56px 24px 0', textAlign: 'center',
          background: 'linear-gradient(180deg, var(--accent-soft, #FDE7EE) 0%, #FFF9FB 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--accent, #EA82A3)', marginBottom: 4 }}>
          <PlaneIcon width={22} height={22} />
        </div>
        <h1 style={{ fontSize: 32, margin: '0 0 8px', fontWeight: 800 }}>{c('heroSub')}</h1>
        <p style={{ fontSize: 17, color: '#6b5a60', maxWidth: 560, margin: '0 auto' }}>{c('tagline')}</p>
        <div style={{ marginTop: 24 }}><HeroIllustration /></div>
        <WaveDivider />
      </section>

      <section style={{ maxWidth: 820, margin: '0 auto', padding: '16px 24px 48px' }}>
        <h2 style={{ fontSize: 24, marginBottom: 12 }}>{c('aboutTitle')}</h2>
        <p style={{ fontSize: 16, lineHeight: 1.8, color: '#4a4044' }}>{c('aboutBody')}</p>
      </section>

      <section style={{ maxWidth: 820, margin: '0 auto', padding: '0 24px 48px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{ color: 'var(--accent, #EA82A3)' }}><GlobeIcon /></span>{c('countriesTitle')}
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16 }}>
          {CONTENT.countries.map((ct, i) => (
            <div key={i} className="card" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 140 }}>
              <span style={{ fontSize: 28 }}>{ct.flag}</span>
              <span style={{ fontWeight: 600 }}>{ct.name[lang]}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 24px 48px' }}>
        <h2 style={{ fontSize: 24, marginBottom: 20, textAlign: 'center' }}>{c('servicesTitle')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {CONTENT.services.map((s, i) => (
            <div key={i} className="card" style={{ padding: 20 }}>
              <div style={{ color: 'var(--accent, #EA82A3)', marginBottom: 10, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: 'var(--accent-soft, #FDE7EE)' }}>
                <s.Icon />
              </div>
              <h3 style={{ margin: '0 0 6px', fontSize: 17 }}>{s.title[lang]}</h3>
              <p style={{ margin: 0, fontSize: 14, color: '#6b5a60', lineHeight: 1.6 }}>{s.desc[lang]}</p>
            </div>
          ))}
        </div>
      </section>

      <div><WaveDivider fill="#FDE7EE" /></div>
      <section style={{ background: 'var(--accent-soft, #FDE7EE)', padding: '8px 24px 48px' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>
          <h2 style={{ fontSize: 24, marginBottom: 20, textAlign: 'center' }}>{c('whyTitle')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {CONTENT.why.map((w, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{
                  width: 36, height: 36, margin: '0 auto 10px', borderRadius: '50%',
                  background: '#fff', color: 'var(--accent, #EA82A3)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontWeight: 700, fontSize: 15,
                }}>{i + 1}</div>
                <h3 style={{ fontSize: 17, margin: '0 0 6px' }}>{w.title[lang]}</h3>
                <p style={{ margin: 0, fontSize: 14, color: '#6b5a60', lineHeight: 1.6 }}>{w.desc[lang]}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <WaveDivider fill="#FFF9FB" />

      <section style={{ maxWidth: 560, margin: '0 auto', padding: '16px 24px 48px', textAlign: 'center' }}>
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
