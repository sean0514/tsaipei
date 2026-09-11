import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Login from './pages/Login';
import SystemPicker from './pages/SystemPicker';
import Layout, { IMPLEMENTED_MODULES, TodoModule } from './components/Layout';
import StudentsPage from './systems/tsaipei/StudentsPage';
import PositionsPage from './systems/tsaipei/PositionsPage';
import MatchesPage from './systems/tsaipei/MatchesPage';
import SecondInterviewsPage from './systems/tsaipei/SecondInterviewsPage';
import AdmittedListPage from './systems/tsaipei/AdmittedListPage';
import InternshipDocsPage from './systems/tsaipei/InternshipDocsPage';
import ApplicationProgressPage from './systems/tsaipei/ApplicationProgressPage';
import InTaiwanVisaPage from './systems/tsaipei/InTaiwanVisaPage';
import InTaiwanCarePage from './systems/tsaipei/InTaiwanCarePage';
import HousingPage from './systems/tsaipei/HousingPage';
import InventoryPage from './systems/foodfactory/InventoryPage';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="content">載入中…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

const PAGES = {
  tsaipei: {
    students: StudentsPage,
    positions: PositionsPage,
    matches: MatchesPage,
    secondInterview: SecondInterviewsPage,
    admitted: AdmittedListPage,
    internshipDocs: InternshipDocsPage,
    applicationProgress: ApplicationProgressPage,
    inTaiwanVisa: InTaiwanVisaPage,
    inTaiwanCare: InTaiwanCarePage,
    housing: HousingPage,
  },
  foodfactory: { inventory: InventoryPage },
};

function ModuleRoute() {
  const { system, module } = useParams();
  const Page = PAGES[system]?.[module];
  return Page ? <Page /> : <TodoModule />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RequireAuth><SystemPicker /></RequireAuth>} />
        <Route path="/:system" element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<RedirectToFirstModule />} />
          <Route path="todo/:module" element={<TodoModule />} />
          <Route path=":module" element={<ModuleRoute />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

function RedirectToFirstModule() {
  const { system } = useParams();
  const first = IMPLEMENTED_MODULES[system]?.[0];
  return first ? <Navigate to={`/${system}/${first}`} replace /> : <div className="content muted">此系統尚無已建置的模組</div>;
}
