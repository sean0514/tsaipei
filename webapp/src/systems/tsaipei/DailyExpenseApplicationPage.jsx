import ApplicationFormPage from './ApplicationFormPage';

export default function DailyExpenseApplicationPage() {
  return (
    <ApplicationFormPage
      collectionName="tsaipei_dailyExpenseApplications"
      title="日常支出申請"
      desc="依待審核／已核准／駁回分類"
      searchPlaceholder="搜尋學生或用途說明"
    />
  );
}
