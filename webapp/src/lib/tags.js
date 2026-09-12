// Ported from the *_TAG maps in apps-script/Index.html — which status
// value gets which color class (see Tag.jsx / index.css .tag-* rules).

export const STUDENT_TAG = {
  媒合中: 'tag-blue', 待面試: 'tag-blue', 已面試: 'tag-blue',
  送審中: 'tag-amber', 補件中: 'tag-amber', 企業用印: 'tag-amber', 辦理簽證中: 'tag-amber',
  收到函文: 'tag-jade', 已入台實習: 'tag-green', 已完成: 'tag-grey', 取消: 'tag-red',
};

export const POSITION_TAG = { 開放中: 'tag-green', 已額滿: 'tag-amber', 已結束: 'tag-grey' };

export const MATCH_TAG = { 媒合中: 'tag-amber', 已媒合: 'tag-green', 取消: 'tag-red' };

export const SECOND_INTERVIEW_TAG = { 待安排: 'tag-grey', 已安排: 'tag-blue', 通過: 'tag-green', 未通過: 'tag-red' };

export const ADMITTED_TAG = { 通過二面: 'tag-amber', 確認錄取: 'tag-green' };

export const CARE_TAG = { 良好: 'tag-green', 待關心: 'tag-amber', 預計離台: 'tag-blue' };

export const INTERNSHIP_DOC_TAG = {
  未提供: 'tag-grey', 已收到: 'tag-blue', 審核中: 'tag-amber', 已核准: 'tag-green', 需補件: 'tag-red', 不適用: 'tag-grey',
};

export const PERMISSION_LEVEL_TAG = { edit: 'tag-green', view: 'tag-blue', none: 'tag-grey' };
