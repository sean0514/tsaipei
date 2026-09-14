import { useOutletContext } from 'react-router-dom';

// 派遣公司專用系統的起始骨架：先只有儀表板 + 使用人員，之後再依業務需求
// （派遣員工資料、客戶廠商、派遣合約、出勤/工時、薪資結算…）陸續加頁面。
export default function DashboardPage() {
  useOutletContext();
  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>儀表板</h2>
          <div className="page-desc">派遣公司專用系統目前僅有基本骨架，業務功能陸續建置中</div>
        </div>
      </div>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          這個系統目前還沒有實際的業務資料頁面。想要新增哪些功能（例如：派遣員工資料、客戶廠商、派遣合約、出勤/工時、薪資結算…），
          請直接告訴負責建置的人員，會依需求陸續加上去。
        </p>
      </div>
    </div>
  );
}
