import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Login from './pages/Login';
import DispatchApplyPage from './pages/DispatchApplyPage';
import CompanyPicker from './pages/CompanyPicker';
import CompanyHomePage from './pages/CompanyHomePage';
import Layout, { IMPLEMENTED_MODULES, TodoModule } from './components/Layout';
import StudentsPage from './systems/tsaipei/StudentsPage';
import PositionsPage from './systems/tsaipei/PositionsPage';
import MatchesPage from './systems/tsaipei/MatchesPage';
import SecondInterviewsPage from './systems/tsaipei/SecondInterviewsPage';
import AdmittedListPage from './systems/tsaipei/AdmittedListPage';
import VisaReminderPage from './systems/tsaipei/VisaReminderPage';
import PostageFeeRecordPage from './systems/tsaipei/PostageFeeRecordPage';
import InternshipDocsPage from './systems/tsaipei/InternshipDocsPage';
import ApplicationProgressPage from './systems/tsaipei/ApplicationProgressPage';
import InTaiwanVisaPage from './systems/tsaipei/InTaiwanVisaPage';
import InTaiwanCarePage from './systems/tsaipei/InTaiwanCarePage';
import ExpectedArrivalPage from './systems/tsaipei/ExpectedArrivalPage';
import BankAccountProgressPage from './systems/tsaipei/BankAccountProgressPage';
import HousingPage from './systems/tsaipei/HousingPage';
import DormManagementPage from './systems/tsaipei/DormManagementPage';
import CustomerServicePendingPage from './systems/tsaipei/CustomerServicePendingPage';
import AdminPendingPage from './systems/tsaipei/AdminPendingPage';
import PositionBenefitsPage from './systems/tsaipei/PositionBenefitsPage';
import MeetingsPage from './systems/tsaipei/MeetingsPage';
import ClosedCasesPage from './systems/tsaipei/ClosedCasesPage';
import DashboardPage from './systems/tsaipei/DashboardPage';
import BonusPage from './systems/tsaipei/BonusPage';
import ClientFeeSetupPage from './systems/tsaipei/ClientFeeSetupPage';
import InternalFeeSetupPage from './systems/tsaipei/InternalFeeSetupPage';
import ManagerReportPage from './systems/tsaipei/ManagerReportPage';
import ClientBillingPage from './systems/tsaipei/ClientBillingPage';
import StudentBillingPage from './systems/tsaipei/StudentBillingPage';
import StudentSelfPayHousingPage from './systems/tsaipei/StudentSelfPayHousingPage';
import StudentMasterSheetPage from './systems/tsaipei/StudentMasterSheetPage';
import ForeignPaymentPage from './systems/tsaipei/ForeignPaymentPage';
import ForeignSubsidyApplicationPage from './systems/tsaipei/ForeignSubsidyApplicationPage';
import DailyExpenseApplicationPage from './systems/tsaipei/DailyExpenseApplicationPage';
import UsersPage from './components/UsersPage';
import DispatchDashboardPage from './systems/dispatch/DashboardPage';
import DispatchJobSeekersPage from './systems/dispatch/JobSeekersPage';
import DispatchInterviewsPage from './systems/dispatch/InterviewsPage';
import DispatchEmploymentStatusPage from './systems/dispatch/EmploymentStatusPage';
import DispatchManagerReportPage from './systems/dispatch/ManagerReportPage';
import DispatchMeetingsPage from './systems/dispatch/MeetingsPage';
import DispatchDailyExpenseApplicationPage from './systems/dispatch/DailyExpenseApplicationPage';
import DispatchCashPaymentListPage from './systems/dispatch/CashPaymentListPage';
import DispatchSalaryChangePage from './systems/dispatch/SalaryChangePage';
import DispatchClientBillingPage from './systems/dispatch/ClientBillingPage';
import DispatchEmployeeMasterSheetPage from './systems/dispatch/EmployeeMasterSheetPage';
import DispatchClientsPage from './systems/dispatch/ClientsPage';
import DispatchBlacklistPage from './systems/dispatch/BlacklistPage';
import DispatchClientFeeSetupPage from './systems/dispatch/ClientFeeSetupPage';
import DispatchInternalFeeSetupPage from './systems/dispatch/InternalFeeSetupPage';
import DispatchBonusPage from './systems/dispatch/BonusPage';
import DispatchReferralBonusRatePage from './systems/dispatch/ReferralBonusRatePage';
import DispatchReferralBonusPage from './systems/dispatch/ReferralBonusPage';
import DormMgmtDashboardPage from './systems/dormMgmt/DashboardPage';
import DormMgmtLeasesPage from './systems/dormMgmt/LeasesPage';
import DormMgmtRemittancePage from './systems/dormMgmt/RemittancePage';
import YujianDashboardPage from './systems/yujian/DashboardPage';
import YujianWorkersPage from './systems/yujian/WorkersPage';
import YujianEmployersPage from './systems/yujian/EmployersPage';
import YujianMatchesPage from './systems/yujian/MatchesPage';
import YujianPlacementListPage from './systems/yujian/PlacementListPage';
import YujianSecondInterviewsPage from './systems/yujian/SecondInterviewsPage';
import YujianAdmittedListPage from './systems/yujian/AdmittedListPage';
import YujianApplicationProgressPage from './systems/yujian/ApplicationProgressPage';
import YujianExpectedArrivalPage from './systems/yujian/ExpectedArrivalPage';
import YujianArrivedListPage from './systems/yujian/ArrivedListPage';
import YujianArrivedSummaryPage from './systems/yujian/ArrivedSummaryPage';
import YujianClosedCasesPage from './systems/yujian/ClosedCasesPage';
import YujianMeetingsPage from './systems/yujian/MeetingsPage';
import YujianDailyExpenseApplicationPage from './systems/yujian/DailyExpenseApplicationPage';
import YujianPostageFeeRecordPage from './systems/yujian/PostageFeeRecordPage';
import InventoryPage from './systems/foodfactory/InventoryPage';
import StockPage from './systems/foodfactory/StockPage';
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

// Bundles ~2.7MB of migrated legacy spreadsheet data — code-split so it's
// only fetched when someone actually opens 歷史資料, not on every page load.
const HistoryPage = lazy(() => import('./systems/foodfactory/HistoryPage'));

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
    visaReminder: VisaReminderPage,
    postageFee: PostageFeeRecordPage,
    internshipDocs: InternshipDocsPage,
    applicationProgress: ApplicationProgressPage,
    inTaiwanVisa: InTaiwanVisaPage,
    inTaiwanCare: InTaiwanCarePage,
    expectedArrival: ExpectedArrivalPage,
    bankAccountProgress: BankAccountProgressPage,
    housing: HousingPage,
    dormManagement: DormManagementPage,
    customerServicePending: CustomerServicePendingPage,
    adminPending: AdminPendingPage,
    benefits: PositionBenefitsPage,
    meetings: MeetingsPage,
    closedCases: ClosedCasesPage,
    foreignSubsidyApplication: ForeignSubsidyApplicationPage,
    dailyExpenseApplication: DailyExpenseApplicationPage,
    users: UsersPage,
    bonus: BonusPage,
    clientFeeSetup: ClientFeeSetupPage,
    internalFeeSetup: InternalFeeSetupPage,
    managerReport: ManagerReportPage,
    clientBilling: ClientBillingPage,
    studentBilling: StudentBillingPage,
    studentSelfPayHousing: StudentSelfPayHousingPage,
    studentMasterSheet: StudentMasterSheetPage,
    foreignPayment: ForeignPaymentPage,
  },
  dispatch: {
    dashboard: DispatchDashboardPage,
    jobSeekers: DispatchJobSeekersPage,
    interviews: DispatchInterviewsPage,
    employmentStatus: DispatchEmploymentStatusPage,
    managerReport: DispatchManagerReportPage,
    meetings: DispatchMeetingsPage,
    dailyExpenseApplication: DispatchDailyExpenseApplicationPage,
    cashPaymentList: DispatchCashPaymentListPage,
    salaryChange: DispatchSalaryChangePage,
    clientBilling: DispatchClientBillingPage,
    employeeMasterSheet: DispatchEmployeeMasterSheetPage,
    clients: DispatchClientsPage,
    blacklist: DispatchBlacklistPage,
    clientFeeSetup: DispatchClientFeeSetupPage,
    internalFeeSetup: DispatchInternalFeeSetupPage,
    bonus: DispatchBonusPage,
    referralBonusRate: DispatchReferralBonusRatePage,
    referralBonus: DispatchReferralBonusPage,
    users: UsersPage,
  },
  dormMgmt: {
    dashboard: DormMgmtDashboardPage,
    leases: DormMgmtLeasesPage,
    remittance: DormMgmtRemittancePage,
    users: UsersPage,
  },
  yujian: {
    dashboard: YujianDashboardPage,
    workers: YujianWorkersPage,
    employers: YujianEmployersPage,
    matches: YujianMatchesPage,
    placementList: YujianPlacementListPage,
    secondInterview: YujianSecondInterviewsPage,
    admitted: YujianAdmittedListPage,
    applicationProgress: YujianApplicationProgressPage,
    expectedArrival: YujianExpectedArrivalPage,
    arrivedList: YujianArrivedListPage,
    arrivedSummary: YujianArrivedSummaryPage,
    closedCases: YujianClosedCasesPage,
    meetings: YujianMeetingsPage,
    dailyExpenseApplication: YujianDailyExpenseApplicationPage,
    postageFee: YujianPostageFeeRecordPage,
    users: UsersPage,
  },
  foodfactory: {
    inventory: InventoryPage,
    stock: StockPage,
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
    history: HistoryPage,
    users: UsersPage,
  },
};

function ModuleRoute() {
  const { system, module } = useParams();
  const Page = PAGES[system]?.[module];
  if (!Page) return <TodoModule />;
  return (
    <Suspense fallback={<div className="content">載入中…</div>}>
      <Page />
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/apply/dispatch" element={<DispatchApplyPage />} />
        <Route path="/" element={<RequireAuth><CompanyPicker /></RequireAuth>} />
        <Route path="/company/:companyKey" element={<RequireAuth><CompanyHomePage /></RequireAuth>} />
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
