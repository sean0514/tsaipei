// 越南實習生系統專用的內部獎金計算邏輯，跟 lib/bonus.js（境外生實習系統
// 也在用，角色清單是舊的 12 個角色）分開，避免改了角色清單影響到境外生
// 實習系統。純計算工具（monthRange/dateOverlapDays/studentDaysInTaiwanForMonth/
// studentProjectClientPair/computeDormManagerBonusForMonth）跟角色清單無關，
// 直接沿用 lib/bonus.js 的版本。
import { monthRange, dateOverlapDays, studentDaysInTaiwanForMonth, studentProjectClientPair, computeDormManagerBonusForMonth } from './bonus';

export { monthRange, dateOverlapDays, studentDaysInTaiwanForMonth, studentProjectClientPair, computeDormManagerBonusForMonth };

// 依實習單位(專案+客戶)設定費率的角色（跟 InternalFeeSetupPage.jsx 的
// ROLE_FIELDS 保持一致，不含宿管人員1/2——那兩個走舊的
// computeDormManagerBonusForMonth，不受這裡的角色清單影響）。
export const VN_RATE_ROLE_KEYS = ['bizDev', 'adminSupervisor', 'adminRecruit', 'adminVisa', 'fieldStaff'];
export const VN_RATE_ROLE_LABELS = ['開發業務', '行政主管', '行政招募', '行政簽證', '外務人員'];

// 這 4 個角色的負責人指派在「學生資料」（StudentsPage.jsx 的
// assignedBizDev/assignedAdminRecruit/assignedAdminVisa/assignedFieldStaff），
// 「行政主管」指派在「實習單位」(PositionsPage.jsx 的 adminSupervisor)。
const VN_STUDENT_ASSIGNED_ROLE_KEYS = ['bizDev', 'adminRecruit', 'adminVisa', 'fieldStaff'];
const VN_STUDENT_FIELD_BY_ROLE_KEY = {
  bizDev: 'assignedBizDev',
  adminRecruit: 'assignedAdminRecruit',
  adminVisa: 'assignedAdminVisa',
  fieldStaff: 'assignedFieldStaff',
};
const VN_POSITION_ASSIGNED_ROLE_KEY = 'adminSupervisor';

function roleLabel(key) {
  return VN_RATE_ROLE_LABELS[VN_RATE_ROLE_KEYS.indexOf(key)];
}

function positionAdminSupervisor(projectCode, client, positions) {
  const matching = (positions || []).filter((p) => (p.projectCode || '') === projectCode && p.company === client);
  return [...new Set(matching.map((p) => p[VN_POSITION_ASSIGNED_ROLE_KEY]).filter(Boolean))].join('、');
}

// 依客戶(實習單位)分組的主表，跟 lib/bonus.js 的 computeInternalBonusForMonth
// 形狀一致，只是「行政主管」是整組共用同一個負責人（實習單位層級指派），
// 其餘 4 個角色組內每位學生可能各自指派不同負責人，roles[k] 用「、」接起來
// 列出組內出現過的所有負責人名字，實際分配金額請看「依人員加總」。
export function computeVietnamInternalBonusForMonth(monthStr, ctx) {
  const range = monthRange(monthStr);
  if (!range) return [];
  const { students, inTaiwanVisaRecords, internalFeeSetupRecords, positions } = ctx;
  const groups = {};
  (students || []).forEach((s) => {
    const days = studentDaysInTaiwanForMonth(s.id, monthStr, inTaiwanVisaRecords);
    if (days <= 0) return;
    const pair = studentProjectClientPair(s.id, ctx);
    if (!pair) return;
    const key = `${pair.projectCode}||${pair.client}`;
    const g = (groups[key] ||= { projectCode: pair.projectCode, client: pair.client, totalDays: 0, students: [] });
    g.totalDays += days;
    g.students.push({ student: s, days });
  });
  return Object.values(groups).map((g) => {
    const rate = (internalFeeSetupRecords || []).find((r) => (r.projectCode || '') === g.projectCode && r.client === g.client);
    const roles = {};
    const amounts = {};
    VN_RATE_ROLE_KEYS.forEach((k) => {
      const rateVal = rate ? (Number(rate[k]) || 0) : 0;
      if (k === VN_POSITION_ASSIGNED_ROLE_KEY) {
        roles[k] = positionAdminSupervisor(g.projectCode, g.client, positions);
        amounts[k] = rateVal ? Math.round((rateVal / range.daysInMonth) * g.totalDays) : 0;
        return;
      }
      const field = VN_STUDENT_FIELD_BY_ROLE_KEY[k];
      const names = [...new Set(g.students.map(({ student }) => student[field]).filter(Boolean))];
      roles[k] = names.join('、');
      amounts[k] = rateVal ? g.students.reduce((sum, { student, days: d }) => (student[field] ? sum + Math.round((rateVal / range.daysInMonth) * d) : sum), 0) : 0;
    });
    return { projectCode: g.projectCode, client: g.client, totalDays: g.totalDays, roles, amounts };
  }).sort((a, b) => (a.client || '').localeCompare(b.client || ''));
}

// 學校代表獎金：依學校資料建檔(vietnam_schoolSetup)設定的學校代表＋月費率，
// 乘以該校每位學生這個月在台天數比例，依學校分組顯示。
export function computeVietnamSchoolRepBonusForMonth(monthStr, ctx) {
  const range = monthRange(monthStr);
  if (!range) return [];
  const { students, inTaiwanVisaRecords, schools } = ctx;
  const rows = {};
  (schools || []).forEach((sc) => {
    if (!sc.schoolRep || !Number(sc.monthlyFee)) return;
    rows[sc.name] = { schoolName: sc.name, schoolRep: sc.schoolRep, amount: 0, totalDays: 0 };
  });
  (students || []).forEach((s) => {
    const row = rows[s.school];
    if (!row) return;
    const days = studentDaysInTaiwanForMonth(s.id, monthStr, inTaiwanVisaRecords);
    if (days <= 0) return;
    const sc = (schools || []).find((x) => x.name === s.school);
    const rateVal = Number(sc?.monthlyFee) || 0;
    if (!rateVal) return;
    row.totalDays += days;
    row.amount += Math.round((rateVal / range.daysInMonth) * days);
  });
  return Object.values(rows).filter((r) => r.totalDays > 0).sort((a, b) => a.schoolName.localeCompare(b.schoolName));
}

// 依人員加總所有獎金來源：實習單位(專案+客戶)角色費率(開發業務/行政主管/
// 行政招募/行政簽證/外務人員，依學生在台天數比例) + 學校代表獎金 + 宿管
// 人員獎金(沿用 lib/bonus.js 原有邏輯)。
export function computeVietnamInternalBonusByPersonForMonth(monthStr, ctx) {
  const range = monthRange(monthStr);
  if (!range) return [];
  const { students, inTaiwanVisaRecords, internalFeeSetupRecords, positions, schools } = ctx;
  const personTotals = {};

  function addAmount(name, amount, detail) {
    if (!name || !amount) return;
    const entry = (personTotals[name] ||= { name, total: 0, breakdown: [] });
    entry.total += amount;
    entry.breakdown.push(detail);
  }

  (students || []).forEach((s) => {
    const days = studentDaysInTaiwanForMonth(s.id, monthStr, inTaiwanVisaRecords);
    if (days <= 0) return;
    const pair = studentProjectClientPair(s.id, ctx);
    const rate = pair && (internalFeeSetupRecords || []).find((r) => (r.projectCode || '') === pair.projectCode && r.client === pair.client);

    VN_STUDENT_ASSIGNED_ROLE_KEYS.forEach((k) => {
      const name = s[VN_STUDENT_FIELD_BY_ROLE_KEY[k]];
      const rateVal = rate ? (Number(rate[k]) || 0) : 0;
      if (!name || !rateVal) return;
      const amt = Math.round((rateVal / range.daysInMonth) * days);
      addAmount(name, amt, { client: pair?.client || '', projectCode: pair?.projectCode || '', role: roleLabel(k), amount: amt });
    });

    if (pair) {
      const name = positionAdminSupervisor(pair.projectCode, pair.client, positions);
      const rateVal = rate ? (Number(rate[VN_POSITION_ASSIGNED_ROLE_KEY]) || 0) : 0;
      if (name && rateVal) {
        const amt = Math.round((rateVal / range.daysInMonth) * days);
        addAmount(name, amt, { client: pair.client, projectCode: pair.projectCode, role: roleLabel(VN_POSITION_ASSIGNED_ROLE_KEY), amount: amt });
      }
    }

    const school = (schools || []).find((sc) => sc.name === s.school);
    if (school?.schoolRep && Number(school.monthlyFee)) {
      const amt = Math.round((Number(school.monthlyFee) / range.daysInMonth) * days);
      addAmount(school.schoolRep, amt, { client: s.school || '', projectCode: '', role: '學校代表', amount: amt });
    }
  });

  computeDormManagerBonusForMonth(monthStr, ctx).forEach((d) => {
    if (d.manager1 && d.manager1Amount) addAmount(d.manager1, d.manager1Amount, { client: d.dormName, projectCode: '', role: '宿管人員1', amount: d.manager1Amount });
    if (d.manager2 && d.manager2Amount) addAmount(d.manager2, d.manager2Amount, { client: d.dormName, projectCode: '', role: '宿管人員2', amount: d.manager2Amount });
  });

  return Object.values(personTotals).sort((a, b) => b.total - a.total);
}
