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
import DormManagementPage from './systems/tsaipei/DormManagementPage';
import MeetingsPage from './systems/tsaipei/MeetingsPage';
import DashboardPage from './systems/tsaipei/DashboardPage';
import BonusPage from './systems/tsaipei/BonusPage';
import ClientFeeSetupPage from './systems/tsaipei/ClientFeeSetupPage';
import InternalFeeSetupPage from './systems/tsaipei/InternalFeeSetupPage';
import ManagerReportPage from './systems/tsaipei/ManagerReportPage';
import ClientBillingPage from './systems/tsaipei/ClientBillingPage';
import UsersPage from './components/UsersPage';
import InventoryPage from './systems/foodfactory/InventoryPage';
import SuppliersPage from './systems/foodfactory/SuppliersPage';
import PurchasesPage from './systems/foodfactory/PurchasesPage';
import ProductsPage from './systems/foodfactory/ProductsPage';
import CustomersPage from './systems/foodfactory/CustomersPage';
import ProductionBatchesPage from './systems/foodfactory/ProductionBatchesPage';
import ShipmentsPage from './systems/foodfactory/ShipmentsPage';
import QcTemplatesPage from './systems/foodfactory/QcTemplatesPage';
import QcRecordsPage from './systems/foodfactory/QcRecordsPage';
import CostAnalysisPage from './systems/foodfactory/CostAnalysisPage';
import PettyCashPage from './systems/foodfactory/PettyCashPage';
import IncomeStatementPage from './systems/foodfactory/IncomeStatementPage';
import PartnersPage from './systems/foodfactory/PartnersPage';
import CustomerInvoicesPage from './systems/foodfactory/CustomerInvoicesPage';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="content">載入中…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

const PAGES = {
  tsaipei: {
    dashboard: DashboardPage,
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
    dormManagement: DormManagementPage,
    meetings: MeetingsPage,
    users: UsersPage,
    bonus: BonusPage,
    clientFeeSetup: ClientFeeSetupPage,
    internalFeeSetup: InternalFeeSetupPage,
    managerReport: ManagerReportPage,
    clientBilling: ClientBillingPage,
  },
  foodfactory: {
    inventory: InventoryPage,
    suppliers: SuppliersPage,
    purchases: PurchasesPage,
    products: ProductsPage,
    customers: CustomersPage,
    production: ProductionBatchesPage,
    shipments: ShipmentsPage,
    qcTemplates: QcTemplatesPage,
    qcRecords: QcRecordsPage,
    cost: CostAnalysisPage,
    pettyCash: PettyCashPage,
    incomeStatement: IncomeStatementPage,
    partners: PartnersPage,
    billing: CustomerInvoicesPage,
    users: UsersPage,
  },
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
