import ApplicationFormPage from './ApplicationFormPage';

export default function ForeignSubsidyApplicationPage() {
  return (
    <ApplicationFormPage
      collectionName="tsaipei_foreignSubsidyApplications"
      title="國外補助申請"
      desc="依待審核／已核准／駁回分類"
      searchPlaceholder="搜尋學生或用途說明"
    />
  );
}
