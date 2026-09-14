import { useOutletContext } from 'react-router-dom';

// 宿舍管理系統的起始骨架：先只有儀表板 + 使用人員，之後再依業務需求
// （宿舍主檔、房間/床位、租約、租金與水電費結算…）陸續加頁面。跟境外實習生
// 管理系統裡既有的「住宿安排」「宿舍管理」是完全獨立的系統，不共用資料。
export default function DashboardPage() {
  useOutletContext();
  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>儀表板</h2>
          <div className="page-desc">宿舍管理系統目前僅有基本骨架，業務功能陸續建置中</div>
        </div>
      </div>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          這個系統目前還沒有實際的業務資料頁面。想要新增哪些功能（例如：宿舍主檔、房間/床位、租約、租金與水電費結算…），
          請直接告訴負責建置的人員，會依需求陸續加上去。
        </p>
      </div>
    </div>
  );
}
