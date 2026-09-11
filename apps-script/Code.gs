/* =========================================================
   境外實習生管理系統 - Apps Script 後端
   ---------------------------------------------------------
   部署方式：在 Google 試算表中「擴充功能 > Apps Script」貼上
   本檔案，另外建立 Index.html 貼上前端內容，再用
   「部署 > 新增部署作業 > 網頁應用程式」發布。
   詳見附上的部署指南。
========================================================= */

/* ---------------------------------------------------------
   1. 資料表結構定義
--------------------------------------------------------- */
var SHEET_FIELDS = {
  Students: [
    {key:'id',label:'ID'},
    {key:'originalName',label:'原始姓名'},
    {key:'chineseName',label:'中文姓名'},
    {key:'school',label:'就讀學校'},
    {key:'department1',label:'系所1'},
    {key:'department2',label:'系所2'},
    {key:'nationality',label:'國籍'},{key:'gender',label:'性別'},
    {key:'email',label:'Email'},
    {key:'phone',label:'電話'},
    {key:'startDate',label:'實習開始日'},
    {key:'endDate',label:'實習結束日'},
    {key:'langProofType',label:'語言能力證明類別'},
    {key:'langProofLevel',label:'語言能力證明等級'},
    {key:'langProofStatus',label:'語言能力證明狀態'},
    {key:'enrollStart',label:'在學證明_入學年月'},
    {key:'enrollEnd',label:'在學證明_畢業年月'},
    {key:'enrollProofStatus',label:'在學證明狀態'},
    {key:'passportCopy',label:'護照影本'},{key:'passportNumber',label:'護照號碼'},
    {key:'otherDocs',label:'其他文件'},
    {key:'extensionNeeded',label:'是否延畢'},
    {key:'extensionProof',label:'延畢證明'},
    {key:'nightInternshipDoc',label:'夜間實習同意書'},
    {key:'firstEntryDate',label:'第一次入境日期'},
    {key:'firstExitDate',label:'第一次離境日期'},
    {key:'secondEntryDate',label:'第二次入境日期'},
    {key:'secondExitDate',label:'第二次離境日期'},
    {key:'status',label:'狀態'},
    {key:'notes',label:'備註'},
    {key:'sourceSupplier',label:'學生來源(國外供應商)'}
  ],
  Positions: [
    {key:'id',label:'ID'},{key:'projectCode',label:'專案編號'},{key:'company',label:'公司名稱'},
    {key:'industry',label:'產業別'},{key:'title',label:'職務名稱'},{key:'description',label:'職務內容'},
    {key:'locationGroups',label:'實習場域/實習地點/缺額/狀態'},
    {key:'stipendAmount',label:'實習津貼金額'},{key:'boardDeduction',label:'膳宿費扣款金額'},{key:'otherBenefits',label:'其他福利'},
    {key:'specialNotes',label:'特殊備註'},
    {key:'bizDev',label:'開發業務'},{key:'serviceSupervisor',label:'服務主管'},{key:'serviceSpecialist',label:'服務專員'},
    {key:'translationSupervisor',label:'翻譯主管'},{key:'translationSpecialist',label:'翻譯專員'},
    {key:'adminSupervisor',label:'行政主管'},{key:'adminSpecialist',label:'行政專員'},
    {key:'accountant',label:'會計人員'},{key:'accountantAssistant',label:'會計助理'},
    {key:'dormManager1',label:'宿管人員1'},{key:'dormManager2',label:'宿管人員2'}
  ],
  Matches: [
    {key:'id',label:'ID'},{key:'studentId',label:'學生ID'},{key:'positionId',label:'職缺ID'},
    {key:'venue',label:'實習場域'},
    {key:'status',label:'狀態'},{key:'matchDate',label:'媒合日期'},{key:'notes',label:'備註'}
  ],
  HousingRecords: [
    {key:'id',label:'ID'},{key:'studentId',label:'學生ID'},{key:'type',label:'宿舍名稱'},
    {key:'address',label:'地址'},{key:'contactName',label:'宿舍管理員1'},{key:'contactName2',label:'宿舍管理員2'},{key:'contactPhone',label:'翻譯'},
    {key:'payer',label:'付款方式'},
    {key:'checkIn',label:'入住日'},{key:'checkOut',label:'退宿日'},{key:'completed',label:'已完成'},{key:'notes',label:'備註'}
  ],
  Dormitories: [
    {key:'id',label:'ID'},{key:'name',label:'宿舍名稱'},{key:'location',label:'地點'},
    {key:'leaseStart',label:'起租日'},{key:'leaseEnd',label:'退租日'},
    {key:'deposit',label:'押金金額'},{key:'agentFee',label:'房仲費金額'},{key:'rent',label:'租金金額'},
    {key:'capacity',label:'可住人數'},{key:'waterFee',label:'當月水費'},{key:'electricityFee',label:'當月電費'},
    {key:'notes',label:'備註'}
  ],
  Meetings: [
    {key:'id',label:'ID'},{key:'date',label:'會議日期'},{key:'title',label:'會議主題'},
    {key:'host',label:'主持人'},{key:'attendees',label:'出席人員'},
    {key:'content',label:'討論內容'},{key:'actionItems',label:'待辦事項'},{key:'notes',label:'備註'}
  ],
  Bonuses: [
    {key:'id',label:'ID'},{key:'client',label:'客戶名稱'},
    {key:'bizDevBonus',label:'開發業務獎金'},{key:'serviceSupervisorBonus',label:'服務主管獎金'},
    {key:'serviceSpecialistBonus',label:'服務專員獎金'},{key:'translationSupervisorBonus',label:'翻譯主管獎金'},
    {key:'translationSpecialistBonus',label:'翻譯專員獎金'},{key:'adminSupervisorBonus',label:'行政主管獎金'},
    {key:'adminSpecialistBonus',label:'行政專員獎金'},{key:'notes',label:'備註'}
  ],
  ClientBilling: [
    {key:'id',label:'ID'},{key:'client',label:'客戶'},{key:'billingItem',label:'請款項目'},
    {key:'amount',label:'金額'},{key:'billingMonth',label:'請款月份'},{key:'status',label:'請款狀態'}
  ],
  ClientFeeSetup: [
    {key:'id',label:'ID'},{key:'projectCode',label:'專案編號'},{key:'client',label:'客戶名稱'},{key:'taxId',label:'統一編號'},
    {key:'monthlyProcessingFee',label:'每月辦件費'},{key:'monthlyServiceFee',label:'每月服務費'},
    {key:'monthlyDormFee',label:'每月宿舍費'},{key:'monthlyDormManageFee',label:'每月宿管費'},
    {key:'billingStartDate',label:'計費起算日'},{key:'billingSettleDay',label:'請款結算日'},{key:'billDormFee',label:'是否請款住宿費'}
  ],
  InternalFeeSetup: [
    {key:'id',label:'ID'},{key:'projectCode',label:'專案編號'},{key:'client',label:'客戶名稱'},
    {key:'bizDev',label:'開發業務'},{key:'serviceSupervisor',label:'服務主管'},{key:'serviceSpecialist',label:'服務專員'},
    {key:'translationSupervisor',label:'翻譯主管'},{key:'translationSpecialist',label:'翻譯專員'},
    {key:'adminSupervisor',label:'行政主管'},{key:'adminSpecialist',label:'行政專員'},
    {key:'accountant',label:'會計人員'},{key:'accountantAssistant',label:'會計助理'},
    {key:'dormManager1',label:'宿管人員1'},{key:'dormManager2',label:'宿管人員2'}
  ],
  SecondInterviews: [
    {key:'id',label:'ID'},{key:'matchId',label:'媒合紀錄ID'},
    {key:'date',label:'二面日期'},{key:'method',label:'面試方式'},
    {key:'status',label:'進度狀態'},{key:'notes',label:'備註'}
  ],
  AdmittedList: [
    {key:'id',label:'ID'},{key:'matchId',label:'媒合紀錄ID'},
    {key:'admitDate',label:'錄取日期'},{key:'status',label:'狀態'},{key:'notes',label:'備註'}
  ],
  ApplicationProgress: [
    {key:'id',label:'ID'},{key:'studentId',label:'學生ID'},{key:'currentStage',label:'目前進度'},{key:'notes',label:'備註'}
  ],
  InTaiwanVisa: [
    {key:'id',label:'ID'},{key:'studentId',label:'學生ID'},
    {key:'firstEntryDate',label:'第一次入台時間'},{key:'firstExitDate',label:'第一次離台時間'},
    {key:'visaRenewalDate',label:'在台期間換發簽證時間'},
    {key:'secondEntryDate',label:'第二次入台時間'},{key:'secondExitDate',label:'第二次離台時間'},
    {key:'visaRenewalDate2',label:'在台期間換發簽證時間2'},
    {key:'confirmedDeparture',label:'確認離台'}
  ],
  InTaiwanCare: [
    {key:'id',label:'ID'},{key:'studentId',label:'學生ID'},
    {key:'careDate',label:'關懷時間'},{key:'content',label:'內容'},{key:'status',label:'狀態'},
    {key:'confirmedDeparture',label:'確認離台'}
  ],
  InternshipDocs: [
    {key:'id',label:'ID'},{key:'studentId',label:'學生ID'},{key:'docType',label:'文件類型'},
    {key:'status',label:'狀態'},{key:'extensionApplicable',label:'是否延畢'},
    {key:'langProofType',label:'語言能力證明類別'},{key:'langProofLevel',label:'語言能力證明等級'},
    {key:'receivedDate',label:'收件日期'},{key:'notes',label:'備註'}
  ],
  Users: [
    {key:'id',label:'ID'},{key:'name',label:'姓名'},
    {key:'username',label:'帳號'},{key:'passwordHash',label:'密碼雜湊'},{key:'passwordSalt',label:'密碼鹽值'},
    {key:'role',label:'角色'},{key:'status',label:'狀態'}
  ],
  RolePermissions: [
    {key:'id',label:'ID'},{key:'module',label:'模組'},{key:'role',label:'角色'},{key:'level',label:'權限等級'}
  ]
};

var ROLES = ['系統管理員','主管','業務人員','服務人員','翻譯人員','國外供應','行政人員','會計人員','宿管人員'];

var INTERNSHIP_DOC_TYPES = ['語言能力證明','在學證明','延畢證明','夜間實習同意書','護照影本','保險證明','其他'];

var DEFAULT_PERMISSIONS = {
  dashboard: {'系統管理員':'edit','主管':'edit','業務人員':'view','服務人員':'view','翻譯人員':'view','國外供應':'view','行政人員':'view','會計人員':'view','宿管人員':'view'},
  students:  {'系統管理員':'edit','主管':'edit','業務人員':'view','服務人員':'edit','翻譯人員':'view','國外供應':'view','行政人員':'edit','會計人員':'view','宿管人員':'view'},
  matching:  {'系統管理員':'edit','主管':'edit','業務人員':'edit','服務人員':'view','翻譯人員':'none','國外供應':'none','行政人員':'view','會計人員':'none','宿管人員':'none'},
  applicationProgress: {'系統管理員':'edit','主管':'edit','業務人員':'none','服務人員':'edit','翻譯人員':'view','國外供應':'none','行政人員':'edit','會計人員':'none','宿管人員':'none'},
  inTaiwanTracking: {'系統管理員':'edit','主管':'edit','業務人員':'none','服務人員':'edit','翻譯人員':'view','國外供應':'none','行政人員':'edit','會計人員':'none','宿管人員':'edit'},
  internshipDocs: {'系統管理員':'edit','主管':'edit','業務人員':'none','服務人員':'edit','翻譯人員':'view','國外供應':'none','行政人員':'edit','會計人員':'none','宿管人員':'none'},
  housing:   {'系統管理員':'edit','主管':'edit','業務人員':'none','服務人員':'edit','翻譯人員':'view','國外供應':'none','行政人員':'edit','會計人員':'none','宿管人員':'edit'},
  dormManagement: {'系統管理員':'edit','主管':'edit','業務人員':'none','服務人員':'view','翻譯人員':'none','國外供應':'none','行政人員':'edit','會計人員':'view','宿管人員':'edit'},
  meetings:  {'系統管理員':'edit','主管':'edit','業務人員':'edit','服務人員':'edit','翻譯人員':'view','國外供應':'none','行政人員':'view','會計人員':'view','宿管人員':'view'},
  bonus:     {'系統管理員':'edit','主管':'edit','業務人員':'none','服務人員':'none','翻譯人員':'none','國外供應':'none','行政人員':'none','會計人員':'edit','宿管人員':'none'},
  users:     {'系統管理員':'edit','主管':'view','業務人員':'none','服務人員':'none','翻譯人員':'none','國外供應':'none','行政人員':'none','會計人員':'none','宿管人員':'none'},
  managerReport: {'系統管理員':'edit','主管':'edit','業務人員':'none','服務人員':'none','翻譯人員':'none','國外供應':'none','行政人員':'none','會計人員':'none','宿管人員':'none'}
};
var PERMISSION_MODULES = Object.keys(DEFAULT_PERMISSIONS);
var PERMISSION_LEVELS = ['edit','view','none'];

var _rolePermissionsCache = null;
function getRolePermissionsMap_(){
  if(_rolePermissionsCache) return _rolePermissionsCache;
  var rows = readAll_('RolePermissions');
  var map = {};
  rows.forEach(function(r){
    if(!map[r.module]) map[r.module] = {};
    map[r.module][r.role] = r.level;
  });
  var missing = [];
  PERMISSION_MODULES.forEach(function(mod){
    ROLES.forEach(function(role){
      if(!(map[mod] && map[mod][role])){
        var level = (DEFAULT_PERMISSIONS[mod] && DEFAULT_PERMISSIONS[mod][role]) || 'none';
        missing.push({module: mod, role: role, level: level});
        if(!map[mod]) map[mod] = {};
        map[mod][role] = level;
      }
    });
  });
  if(missing.length){
    missing.forEach(function(r){ insertRow_('RolePermissions', r); });
  }
  _rolePermissionsCache = map;
  return map;
}
function permFor_(role, moduleKey){
  if(role === '系統管理員') return 'edit';
  var map = getRolePermissionsMap_();
  if(map[moduleKey] && map[moduleKey][role]) return map[moduleKey][role];
  return (DEFAULT_PERMISSIONS[moduleKey] && DEFAULT_PERMISSIONS[moduleKey][role]) || 'none';
}
function updateRolePermission(token, moduleKey, role, level){
  requireEdit_(token,'users');
  if(role === '系統管理員') throw new Error('系統管理員永遠保有全部模組的編輯權限，無法變更。');
  if(PERMISSION_MODULES.indexOf(moduleKey) === -1) throw new Error('未知的模組：' + moduleKey);
  if(ROLES.indexOf(role) === -1) throw new Error('未知的角色：' + role);
  if(PERMISSION_LEVELS.indexOf(level) === -1) throw new Error('無效的權限等級：' + level);
  var rows = readAll_('RolePermissions');
  var existing = rows.filter(function(r){ return r.module === moduleKey && r.role === role; })[0];
  if(existing){
    updateRow_('RolePermissions', existing.id, {level: level});
  } else {
    insertRow_('RolePermissions', {module: moduleKey, role: role, level: level});
  }
  _rolePermissionsCache = null;
  return {module: moduleKey, role: role, level: level};
}

var SESSION_TTL_SECONDS = 6 * 60 * 60; // 6 小時

/* ---------------------------------------------------------
   2. 網頁進入點
--------------------------------------------------------- */
function doGet(e){
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('境外實習生管理系統')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------------------------------------------------------
   3. 試算表存取工具
--------------------------------------------------------- */
function getSheet_(name){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if(!sheet){
    sheet = ss.insertSheet(name);
    var fields = SHEET_FIELDS[name];
    sheet.getRange(1,1,1,fields.length).setValues([fields.map(function(f){ return f.label; })]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readAll_(name){
  var sheet = getSheet_(name);
  var fields = SHEET_FIELDS[name];
  var lastRow = sheet.getLastRow();
  if(lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, fields.length).getValues();
  var out = [];
  for(var i=0;i<values.length;i++){
    var row = values[i];
    if(!row[0]) continue; // 略過完全空白列
    var obj = {};
    for(var j=0;j<fields.length;j++){
      var v = row[j];
      obj[fields[j].key] = (v instanceof Date) ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') : v;
    }
    out.push(obj);
  }
  return out;
}

function findRowIndexById_(sheet, fields, id){
  var lastRow = sheet.getLastRow();
  if(lastRow < 2) return -1;
  var idCol = 1; // id 固定放第一欄
  var ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
  for(var i=0;i<ids.length;i++){
    if(String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function insertRow_(name, obj){
  var sheet = getSheet_(name);
  var fields = SHEET_FIELDS[name];
  if(!obj.id) obj.id = Utilities.getUuid();
  var row = fields.map(function(f){
    var v = obj[f.key];
    return (v===undefined || v===null) ? '' : v;
  });
  sheet.appendRow(row);
  return obj;
}

function updateRow_(name, id, patch){
  var sheet = getSheet_(name);
  var fields = SHEET_FIELDS[name];
  var rowIdx = findRowIndexById_(sheet, fields, id);
  if(rowIdx === -1) throw new Error('找不到資料（ID: ' + id + '）。');
  var currentValues = sheet.getRange(rowIdx, 1, 1, fields.length).getValues()[0];
  var current = {};
  fields.forEach(function(f, idx){ current[f.key] = currentValues[idx]; });
  var merged = {};
  fields.forEach(function(f){
    if(f.key === 'id'){ merged.id = id; return; }
    merged[f.key] = (patch[f.key] !== undefined) ? patch[f.key] : current[f.key];
  });
  var row = fields.map(function(f){
    var v = merged[f.key];
    return (v===undefined || v===null) ? '' : v;
  });
  sheet.getRange(rowIdx, 1, 1, fields.length).setValues([row]);
  return merged;
}

function deleteRow_(name, id){
  var sheet = getSheet_(name);
  var fields = SHEET_FIELDS[name];
  var rowIdx = findRowIndexById_(sheet, fields, id);
  if(rowIdx === -1) return false;
  sheet.deleteRow(rowIdx);
  return true;
}

/* ---------------------------------------------------------
   4. 密碼雜湊 / 使用者名稱檢查
--------------------------------------------------------- */
function generateSalt_(){
  return Utilities.getUuid();
}

function hashPassword_(password, salt){
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + password);
  return raw.map(function(b){
    var v = (b < 0) ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function usernameExists_(username, excludeId){
  var users = readAll_('Users');
  return users.some(function(u){
    return String(u.username).toLowerCase() === String(username).toLowerCase() && u.id !== excludeId;
  });
}

/* ---------------------------------------------------------
   5. 登入 / Session
--------------------------------------------------------- */
function isSystemInitialized(){
  return readAll_('Users').length > 0;
}

function setupFirstAdmin(name, username, password){
  if(readAll_('Users').length > 0){
    throw new Error('系統已經有使用者了，無法重複建立第一位管理員，請改由現有管理員新增帳號。');
  }
  if(!name || !username || !password) throw new Error('姓名、帳號、密碼皆為必填。');
  if(password.length < 6) throw new Error('密碼至少需要 6 個字元。');
  var salt = generateSalt_();
  var hash = hashPassword_(password, salt);
  insertRow_('Users', {
    name: name, username: username,
    passwordHash: hash, passwordSalt: salt,
    role: '系統管理員', status: '正常'
  });
  return login(username, password);
}

function login(username, password){
  if(!username || !password) throw new Error('請輸入帳號與密碼。');
  var users = readAll_('Users');
  var user = users.filter(function(u){
    return String(u.username).toLowerCase() === String(username).toLowerCase();
  })[0];
  if(!user) throw new Error('帳號或密碼錯誤。');
  if(user.status === '停用') throw new Error('此帳號已被停用，請聯絡系統管理員。');
  var hash = hashPassword_(password, user.passwordSalt);
  if(hash !== user.passwordHash) throw new Error('帳號或密碼錯誤。');

  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('session_' + token, JSON.stringify({
    id: user.id, name: user.name, role: user.role
  }), SESSION_TTL_SECONDS);

  return {token: token, id: user.id, name: user.name, role: user.role};
}

function logout(token){
  if(token) CacheService.getScriptCache().remove('session_' + token);
  return true;
}

function getSession_(token){
  if(!token) return null;
  var raw = CacheService.getScriptCache().get('session_' + token);
  return raw ? JSON.parse(raw) : null;
}

function requireSession_(token){
  var session = getSession_(token);
  if(!session) throw new Error('登入已逾時或尚未登入，請重新登入。');
  return session;
}

function requireView_(token, moduleKey){
  var session = requireSession_(token);
  var level = permFor_(session.role, moduleKey);
  if(level === 'none') throw new Error('您的角色（' + session.role + '）沒有檢視此模組的權限。');
  return session;
}

function requireEdit_(token, moduleKey){
  var session = requireSession_(token);
  var level = permFor_(session.role, moduleKey);
  if(level !== 'edit') throw new Error('您的角色（' + session.role + '）沒有編輯此模組的權限。');
  return session;
}

function whoAmI(token){
  return requireSession_(token);
}

/* ---------------------------------------------------------
   6. 批次載入(依角色權限決定回傳哪些模組)
--------------------------------------------------------- */
function getAllData(token){
  var session = requireSession_(token);
  var perms = {};
  PERMISSION_MODULES.forEach(function(mod){
    perms[mod] = permFor_(session.role, mod);
  });

  var data = {
    currentUser: {id: session.id, name: session.name, role: session.role},
    permissions: perms,
    roleMatrix: perms.users !== 'none' ? getRolePermissionsMap_() : null,
    students: perms.students !== 'none' ? readAll_('Students') : [],
    positions: perms.matching !== 'none' ? readAll_('Positions') : [],
    matches: perms.matching !== 'none' ? readAll_('Matches') : [],
    secondInterviews: perms.matching !== 'none' ? readAll_('SecondInterviews') : [],
    admittedList: perms.matching !== 'none' ? readAll_('AdmittedList') : [],
    applicationProgress: perms.applicationProgress !== 'none' ? readAll_('ApplicationProgress') : [],
    inTaiwanVisaRecords: perms.inTaiwanTracking !== 'none' ? readAll_('InTaiwanVisa') : [],
    inTaiwanCareRecords: perms.inTaiwanTracking !== 'none' ? readAll_('InTaiwanCare') : [],
    internshipDocs: perms.internshipDocs !== 'none' ? readAll_('InternshipDocs') : [],
    housingRecords: perms.housing !== 'none' ? readAll_('HousingRecords') : [],
    dormitories: perms.dormManagement !== 'none' ? readAll_('Dormitories') : [],
    meetings: perms.meetings !== 'none' ? readAll_('Meetings') : [],
    bonuses: perms.bonus !== 'none' ? readAll_('Bonuses') : [],
    clientBillingRecords: perms.bonus !== 'none' ? readAll_('ClientBilling') : [],
    clientFeeSetupRecords: perms.bonus !== 'none' ? readAll_('ClientFeeSetup') : [],
    internalFeeSetupRecords: perms.bonus !== 'none' ? readAll_('InternalFeeSetup') : [],
    users: perms.users !== 'none' ? readAll_('Users').map(function(u){
      return {id:u.id, name:u.name, username:u.username, role:u.role, status:u.status};
    }) : []
  };
  return data;
}

/* ---------------------------------------------------------
   7. 學生資料 CRUD
--------------------------------------------------------- */
function syncInternshipDocFromStudent_(studentId, patch){
  if(patch.langProofType === undefined && patch.langProofLevel === undefined && patch.langProofStatus === undefined) return;
  try{
    var docs = readAll_('InternshipDocs').filter(function(d){ return d.studentId === studentId && d.docType === '語言能力證明'; });
    if(!docs.length) return;
    var docPatch = {};
    if(patch.langProofType !== undefined) docPatch.langProofType = patch.langProofType;
    if(patch.langProofLevel !== undefined) docPatch.langProofLevel = patch.langProofLevel;
    if(patch.langProofStatus !== undefined) docPatch.status = (patch.langProofStatus === '已收到') ? '已收到' : '未提供';
    updateRow_('InternshipDocs', docs[0].id, docPatch);
  }catch(e){}
}
function syncInTaiwanVisaFromStudent_(studentId, patch){
  if(patch.firstEntryDate === undefined && patch.firstExitDate === undefined && patch.secondEntryDate === undefined && patch.secondExitDate === undefined) return;
  try{
    var visas = readAll_('InTaiwanVisa').filter(function(v){ return v.studentId === studentId; });
    if(!visas.length) return;
    var vPatch = {};
    if(patch.firstEntryDate !== undefined) vPatch.firstEntryDate = patch.firstEntryDate;
    if(patch.firstExitDate !== undefined) vPatch.firstExitDate = patch.firstExitDate;
    if(patch.secondEntryDate !== undefined) vPatch.secondEntryDate = patch.secondEntryDate;
    if(patch.secondExitDate !== undefined) vPatch.secondExitDate = patch.secondExitDate;
    updateRow_('InTaiwanVisa', visas[0].id, vPatch);
  }catch(e){}
}
function addStudent(token, data){ requireEdit_(token,'students'); return insertRow_('Students', data); }
function updateStudent(token, id, data){
  requireEdit_(token,'students');
  var row = updateRow_('Students', id, data);
  syncInternshipDocFromStudent_(id, data);
  syncInTaiwanVisaFromStudent_(id, data);
  return row;
}
function deleteStudent(token, id){
  requireEdit_(token,'students');

  // 找出這位學生所有的媒合紀錄，先處理依附在媒合紀錄底下的二面進度、錄取名單
  var matches = readAll_('Matches').filter(function(m){ return m.studentId === id; });
  var matchIds = matches.map(function(m){ return m.id; });

  readAll_('SecondInterviews').filter(function(si){ return matchIds.indexOf(si.matchId) !== -1; })
    .forEach(function(si){ deleteRow_('SecondInterviews', si.id); });
  readAll_('AdmittedList').filter(function(a){ return matchIds.indexOf(a.matchId) !== -1; })
    .forEach(function(a){ deleteRow_('AdmittedList', a.id); });
  matches.forEach(function(m){ deleteRow_('Matches', m.id); });

  // 刪除直接以學生ID關聯的各項紀錄
  readAll_('InternshipDocs').filter(function(d){ return d.studentId === id; })
    .forEach(function(d){ deleteRow_('InternshipDocs', d.id); });
  readAll_('ApplicationProgress').filter(function(p){ return p.studentId === id; })
    .forEach(function(p){ deleteRow_('ApplicationProgress', p.id); });
  readAll_('HousingRecords').filter(function(h){ return h.studentId === id; })
    .forEach(function(h){ deleteRow_('HousingRecords', h.id); });
  readAll_('InTaiwanVisa').filter(function(v){ return v.studentId === id; })
    .forEach(function(v){ deleteRow_('InTaiwanVisa', v.id); });
  readAll_('InTaiwanCare').filter(function(c){ return c.studentId === id; })
    .forEach(function(c){ deleteRow_('InTaiwanCare', c.id); });

  return deleteRow_('Students', id);
}

function importStudentsOverwrite(token, rows){
  requireEdit_(token,'students');
  var sheet = getSheet_('Students');
  var fields = SHEET_FIELDS['Students'];
  var lastRow = sheet.getLastRow();
  if(lastRow > 1) sheet.getRange(2, 1, lastRow - 1, fields.length).clearContent();
  rows.forEach(function(r){
    if(!r.id) r.id = Utilities.getUuid();
    var row = fields.map(function(f){
      var v = r[f.key];
      return (v===undefined || v===null) ? '' : v;
    });
    sheet.appendRow(row);
  });
  return rows.length;
}

/* ---------------------------------------------------------
   8. 職缺與媒合 CRUD
--------------------------------------------------------- */
function addPosition(token, data){
  requireEdit_(token,'matching');
  return insertRow_('Positions', data);
}
function updatePosition(token, id, data){ requireEdit_(token,'matching'); return updateRow_('Positions', id, data); }
function deletePosition(token, id){ requireEdit_(token,'matching'); return deleteRow_('Positions', id); }

function addMatch(token, data){ requireEdit_(token,'matching'); return insertRow_('Matches', data); }

function ensureMatchForStudent(token, studentId){
  // 由「新增學生」流程觸發，比照 students 的編輯權限即可觸發，
  // 之後對媒合紀錄的實際修改仍會照 matching 權限把關。
  requireEdit_(token,'students');
  if(!studentId) return 0;
  var existing = readAll_('Matches').filter(function(m){ return m.studentId === studentId; });
  if(existing.length) return 0;
  insertRow_('Matches', {studentId: studentId, positionId: '', status: '媒合中', matchDate: '', notes: '（系統依學生建檔自動建立）'});
  return 1;
}
function updateMatch(token, id, data){ requireEdit_(token,'matching'); return updateRow_('Matches', id, data); }
function deleteMatch(token, id){ requireEdit_(token,'matching'); return deleteRow_('Matches', id); }

function importMatchesOverwrite(token, rows){
  requireEdit_(token,'matching');
  var sheet = getSheet_('Matches');
  var fields = SHEET_FIELDS['Matches'];
  var lastRow = sheet.getLastRow();
  if(lastRow > 1) sheet.getRange(2, 1, lastRow - 1, fields.length).clearContent();
  rows.forEach(function(r){
    if(!r.id) r.id = Utilities.getUuid();
    var row = fields.map(function(f){
      var v = r[f.key];
      return (v===undefined || v===null) ? '' : v;
    });
    sheet.appendRow(row);
  });
  return rows.length;
}

function importSheetOverwrite_(sheetName, rows){
  var sheet = getSheet_(sheetName);
  var fields = SHEET_FIELDS[sheetName];
  var lastRow = sheet.getLastRow();
  if(lastRow > 1) sheet.getRange(2, 1, lastRow - 1, fields.length).clearContent();
  rows.forEach(function(r){
    if(!r.id) r.id = Utilities.getUuid();
    var row = fields.map(function(f){
      var v = r[f.key];
      return (v===undefined || v===null) ? '' : v;
    });
    sheet.appendRow(row);
  });
  return rows.length;
}
function importPositionsOverwrite(token, rows){ requireEdit_(token,'matching'); return importSheetOverwrite_('Positions', rows); }
function importHousingRecordsOverwrite(token, rows){ requireEdit_(token,'housing'); return importSheetOverwrite_('HousingRecords', rows); }
function importDormitoriesOverwrite(token, rows){ requireEdit_(token,'dormManagement'); return importSheetOverwrite_('Dormitories', rows); }
function importMeetingsOverwrite(token, rows){ requireEdit_(token,'meetings'); return importSheetOverwrite_('Meetings', rows); }
function importBonusesOverwrite(token, rows){ requireEdit_(token,'bonus'); return importSheetOverwrite_('Bonuses', rows); }
function importClientBillingOverwrite(token, rows){ requireEdit_(token,'bonus'); return importSheetOverwrite_('ClientBilling', rows); }
function importClientFeeSetupOverwrite(token, rows){ requireEdit_(token,'bonus'); return importSheetOverwrite_('ClientFeeSetup', rows); }
function importInternalFeeSetupOverwrite(token, rows){ requireEdit_(token,'bonus'); return importSheetOverwrite_('InternalFeeSetup', rows); }
function importInternshipDocsOverwrite(token, rows){ requireEdit_(token,'internshipDocs'); return importSheetOverwrite_('InternshipDocs', rows); }
function importApplicationProgressOverwrite(token, rows){ requireEdit_(token,'applicationProgress'); return importSheetOverwrite_('ApplicationProgress', rows); }

function ensureInTaiwanCareForStudent_(studentId){
  if(!studentId) return;
  var existing = readAll_('InTaiwanCare').filter(function(c){ return c.studentId === studentId; });
  if(existing.length) return;
  insertRow_('InTaiwanCare', {studentId: studentId, careDate: '', content: '', status: '良好', confirmedDeparture: ''});
}

function ensureHousingRecordForStudent_(studentId){
  if(!studentId) return;
  var existing = readAll_('HousingRecords').filter(function(h){ return h.studentId === studentId; });
  if(existing.length) return;
  insertRow_('HousingRecords', {studentId: studentId, type: '', address: '', contactName: '', contactPhone: '', checkIn: '', checkOut: '', notes: ''});
}

function syncStudentDatesFromVisa_(studentId, visaRow){
  try{
    var patch = {
      firstEntryDate: visaRow.firstEntryDate || '',
      firstExitDate: visaRow.firstExitDate || '',
      secondEntryDate: visaRow.secondEntryDate || '',
      secondExitDate: visaRow.secondExitDate || ''
    };
    updateRow_('Students', studentId, patch);
  }catch(e){}
}
function addInTaiwanVisa(token, data){
  requireEdit_(token,'inTaiwanTracking');
  var row = insertRow_('InTaiwanVisa', data);
  ensureInTaiwanCareForStudent_(data.studentId);
  ensureHousingRecordForStudent_(data.studentId);
  syncStudentDatesFromVisa_(data.studentId, row);
  return row;
}
function updateInTaiwanVisa(token, id, data){
  requireEdit_(token,'inTaiwanTracking');
  var row = updateRow_('InTaiwanVisa', id, data);
  ensureInTaiwanCareForStudent_(row.studentId);
  ensureHousingRecordForStudent_(row.studentId);
  syncStudentDatesFromVisa_(row.studentId, row);
  return row;
}
function deleteInTaiwanVisa(token, id){ requireEdit_(token,'inTaiwanTracking'); return deleteRow_('InTaiwanVisa', id); }
function importInTaiwanVisaOverwrite(token, rows){ requireEdit_(token,'inTaiwanTracking'); return importSheetOverwrite_('InTaiwanVisa', rows); }

function addInTaiwanCare(token, data){ requireEdit_(token,'inTaiwanTracking'); return insertRow_('InTaiwanCare', data); }
function updateInTaiwanCare(token, id, data){ requireEdit_(token,'inTaiwanTracking'); return updateRow_('InTaiwanCare', id, data); }
function deleteInTaiwanCare(token, id){ requireEdit_(token,'inTaiwanTracking'); return deleteRow_('InTaiwanCare', id); }
function importInTaiwanCareOverwrite(token, rows){ requireEdit_(token,'inTaiwanTracking'); return importSheetOverwrite_('InTaiwanCare', rows); }

function addSecondInterview(token, data){ requireEdit_(token,'matching'); return insertRow_('SecondInterviews', data); }

function ensureSecondInterviewForMatch(token, matchId){
  requireEdit_(token,'matching');
  if(!matchId) return 0;
  var existing = readAll_('SecondInterviews').filter(function(si){ return si.matchId === matchId; });
  if(existing.length) return 0;
  insertRow_('SecondInterviews', {matchId: matchId, date: '', method: '', status: '待安排', notes: '（系統依新增媒合紀錄自動建立）'});
  return 1;
}
function updateSecondInterview(token, id, data){ requireEdit_(token,'matching'); return updateRow_('SecondInterviews', id, data); }
function deleteSecondInterview(token, id){ requireEdit_(token,'matching'); return deleteRow_('SecondInterviews', id); }

function importSecondInterviewsOverwrite(token, rows){
  requireEdit_(token,'matching');
  var sheet = getSheet_('SecondInterviews');
  var fields = SHEET_FIELDS['SecondInterviews'];
  var lastRow = sheet.getLastRow();
  if(lastRow > 1) sheet.getRange(2, 1, lastRow - 1, fields.length).clearContent();
  rows.forEach(function(r){
    if(!r.id) r.id = Utilities.getUuid();
    var row = fields.map(function(f){
      var v = r[f.key];
      return (v===undefined || v===null) ? '' : v;
    });
    sheet.appendRow(row);
  });
  return rows.length;
}

function addAdmitted(token, data){ requireEdit_(token,'matching'); return insertRow_('AdmittedList', data); }
function updateAdmitted(token, id, data){ requireEdit_(token,'matching'); return updateRow_('AdmittedList', id, data); }
function deleteAdmitted(token, id){ requireEdit_(token,'matching'); return deleteRow_('AdmittedList', id); }

function importAdmittedOverwrite(token, rows){
  requireEdit_(token,'matching');
  var sheet = getSheet_('AdmittedList');
  var fields = SHEET_FIELDS['AdmittedList'];
  var lastRow = sheet.getLastRow();
  if(lastRow > 1) sheet.getRange(2, 1, lastRow - 1, fields.length).clearContent();
  rows.forEach(function(r){
    if(!r.id) r.id = Utilities.getUuid();
    var row = fields.map(function(f){
      var v = r[f.key];
      return (v===undefined || v===null) ? '' : v;
    });
    sheet.appendRow(row);
  });
  return rows.length;
}

/* ---------------------------------------------------------
   9. 簽證/居留 CRUD
--------------------------------------------------------- */

var DOC_TYPE_TO_STUDENT_FIELD = {
  '在學證明': 'enrollProofStatus',
  '護照影本': 'passportCopy',
  '夜間實習同意書': 'nightInternshipDoc'
};
var STUDENT_FIELDS_WITH_NA = {'nightInternshipDoc': true};

function syncStudentDocField_(studentId, docType, status, extensionApplicable, langProofType, langProofLevel){
  if(!studentId) return;
  try{
    if(docType === '延畢證明'){
      var patch = {};
      if(extensionApplicable === '無延畢'){
        patch.extensionNeeded = '無';
        patch.extensionProof = '未收到';
      } else if(extensionApplicable === '有延畢'){
        patch.extensionNeeded = '有';
        if(status && status !== '未提供' && status !== '不適用'){
          patch.extensionProof = '已收到';
        }
      } else if(status === '不適用'){
        patch.extensionNeeded = '無';
        patch.extensionProof = '未收到';
      } else if(status && status !== '未提供'){
        patch.extensionNeeded = '有';
        patch.extensionProof = '已收到';
      } else {
        patch.extensionProof = '未收到';
      }
      updateRow_('Students', studentId, patch);
      return;
    }
    if(docType === '語言能力證明'){
      var langPatch = {};
      if(langProofType) langPatch.langProofType = langProofType;
      if(langProofLevel) langPatch.langProofLevel = langProofLevel;
      langPatch.langProofStatus = (status && status !== '未提供' && status !== '不適用') ? '已收到' : '未收到';
      updateRow_('Students', studentId, langPatch);
      return;
    }
    var field = DOC_TYPE_TO_STUDENT_FIELD[docType];
    if(!field) return;
    var value;
    if(status === '不適用' && STUDENT_FIELDS_WITH_NA[field]){
      value = '不適用';
    } else if(status && status !== '未提供' && status !== '不適用'){
      value = '已收到';
    } else {
      value = '未收到';
    }
    var patch2 = {};
    patch2[field] = value;
    updateRow_('Students', studentId, patch2);
  }catch(e){
    // 找不到對應學生（可能已被刪除），略過同步
  }
}

var PROGRESS_STAGES = [
  '學生錄取','MOU簽署-學校端用印','MOU簽署-企業端用印','收集學生資料','收集企業資料',
  '撰寫計劃書','企業用印','經濟部/交通部審核','發函後寄國外','辦理簽證','住宿安排','預約體檢公司','入台'
];

function addApplicationProgress(token, data){ requireEdit_(token,'applicationProgress'); return insertRow_('ApplicationProgress', data); }
function updateApplicationProgress(token, id, data){ requireEdit_(token,'applicationProgress'); return updateRow_('ApplicationProgress', id, data); }
function deleteApplicationProgress(token, id){ requireEdit_(token,'applicationProgress'); return deleteRow_('ApplicationProgress', id); }

function ensureApplicationProgressForStudent(token, studentId){
  // 由「確認錄取」流程觸發，比照 matching 的編輯權限即可觸發，
  // 之後對進度的實際修改仍會照 applicationProgress 權限把關。
  requireEdit_(token,'matching');
  if(!studentId) return 0;
  var existing = readAll_('ApplicationProgress').filter(function(p){ return p.studentId === studentId; });
  if(existing.length) return 0;
  insertRow_('ApplicationProgress', {studentId: studentId, currentStage: PROGRESS_STAGES[0], notes: ''});
  return 1;
}

function ensureInTaiwanVisaForStudent(token, studentId){
  // 由申辦進度到達「入台」觸發，比照 applicationProgress 的編輯權限即可觸發，
  // 之後對在台簽證追蹤的實際修改仍會照 inTaiwanTracking 權限把關。
  requireEdit_(token,'applicationProgress');
  if(!studentId) return 0;
  var existing = readAll_('InTaiwanVisa').filter(function(v){ return v.studentId === studentId; });
  if(existing.length) return 0;
  insertRow_('InTaiwanVisa', {studentId: studentId, firstEntryDate: '', firstExitDate: '', visaRenewalDate: '', secondEntryDate: '', secondExitDate: '', visaRenewalDate2: '', confirmedDeparture: ''});
  ensureInTaiwanCareForStudent_(studentId);
  return 1;
}

function addInternshipDoc(token, data){
  requireEdit_(token,'internshipDocs');
  var row = insertRow_('InternshipDocs', data);
  syncStudentDocField_(row.studentId, row.docType, row.status, row.extensionApplicable, row.langProofType, row.langProofLevel);
  return row;
}
function updateInternshipDoc(token, id, data){
  requireEdit_(token,'internshipDocs');
  var row = updateRow_('InternshipDocs', id, data);
  syncStudentDocField_(row.studentId, row.docType, row.status, row.extensionApplicable, row.langProofType, row.langProofLevel);
  return row;
}
function deleteInternshipDoc(token, id){ requireEdit_(token,'internshipDocs'); return deleteRow_('InternshipDocs', id); }

function deleteInternshipDocsForStudent(token, studentId){
  requireEdit_(token,'internshipDocs');
  if(!studentId) return 0;
  var docs = readAll_('InternshipDocs').filter(function(d){ return d.studentId === studentId; });
  docs.forEach(function(d){ deleteRow_('InternshipDocs', d.id); });
  return docs.length;
}

function ensureInternshipDocsForStudent(token, studentId){
  // 由「確認錄取」流程觸發，因此比照 matching 的編輯權限即可觸發，
  // 之後對每筆文件的實際狀態修改仍會照 internshipDocs 權限把關。
  requireEdit_(token,'matching');
  if(!studentId) return 0;
  var existing = readAll_('InternshipDocs').filter(function(d){ return d.studentId === studentId; });
  var existingTypes = {};
  existing.forEach(function(d){ existingTypes[d.docType] = true; });
  var created = 0;
  INTERNSHIP_DOC_TYPES.forEach(function(dt){
    if(!existingTypes[dt]){
      insertRow_('InternshipDocs', {studentId: studentId, docType: dt, status: '未提供', receivedDate: '', notes: ''});
      created++;
    }
  });
  return created;
}

function confirmAllDocsForStudent(token, studentId){
  requireEdit_(token,'internshipDocs');
  if(!studentId) return 0;
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var docs = readAll_('InternshipDocs').filter(function(d){ return d.studentId === studentId; });
  docs.forEach(function(d){
    var patch = {status: '已核准'};
    if(!d.receivedDate) patch.receivedDate = today;
    updateRow_('InternshipDocs', d.id, patch);
    syncStudentDocField_(studentId, d.docType, '已核准', d.extensionApplicable, d.langProofType, d.langProofLevel);
  });
  return docs.length;
}

/* ---------------------------------------------------------
   10. 住宿與生活資訊 CRUD
--------------------------------------------------------- */
function addHousingRecord(token, data){ requireEdit_(token,'housing'); return insertRow_('HousingRecords', data); }
function updateHousingRecord(token, id, data){ requireEdit_(token,'housing'); return updateRow_('HousingRecords', id, data); }
function deleteHousingRecord(token, id){ requireEdit_(token,'housing'); return deleteRow_('HousingRecords', id); }

/* ---------------------------------------------------------
   10a. 宿舍管理 CRUD
--------------------------------------------------------- */
function addDormitory(token, data){ requireEdit_(token,'dormManagement'); return insertRow_('Dormitories', data); }
function updateDormitory(token, id, data){ requireEdit_(token,'dormManagement'); return updateRow_('Dormitories', id, data); }
function deleteDormitory(token, id){ requireEdit_(token,'dormManagement'); return deleteRow_('Dormitories', id); }

/* ---------------------------------------------------------
   10b. 會議記錄 CRUD
--------------------------------------------------------- */
function addMeeting(token, data){ requireEdit_(token,'meetings'); return insertRow_('Meetings', data); }
function updateMeeting(token, id, data){ requireEdit_(token,'meetings'); return updateRow_('Meetings', id, data); }
function deleteMeeting(token, id){ requireEdit_(token,'meetings'); return deleteRow_('Meetings', id); }

/* ---------------------------------------------------------
   10c. 獎金計算 CRUD
--------------------------------------------------------- */
function addBonus(token, data){ requireEdit_(token,'bonus'); return insertRow_('Bonuses', data); }
function updateBonus(token, id, data){ requireEdit_(token,'bonus'); return updateRow_('Bonuses', id, data); }
function deleteBonus(token, id){ requireEdit_(token,'bonus'); return deleteRow_('Bonuses', id); }

function addClientBilling(token, data){ requireEdit_(token,'bonus'); return insertRow_('ClientBilling', data); }
function updateClientBilling(token, id, data){ requireEdit_(token,'bonus'); return updateRow_('ClientBilling', id, data); }
function deleteClientBilling(token, id){ requireEdit_(token,'bonus'); return deleteRow_('ClientBilling', id); }

function addClientFeeSetup(token, data){ requireEdit_(token,'bonus'); return insertRow_('ClientFeeSetup', data); }
function updateClientFeeSetup(token, id, data){ requireEdit_(token,'bonus'); return updateRow_('ClientFeeSetup', id, data); }
function deleteClientFeeSetup(token, id){ requireEdit_(token,'bonus'); return deleteRow_('ClientFeeSetup', id); }

function addInternalFeeSetup(token, data){ requireEdit_(token,'bonus'); return insertRow_('InternalFeeSetup', data); }

/* =========================================================
   CLIENT INVOICE GENERATION (客戶請款單下載)
   公司抬頭/銀行資訊為固定值，取自使用者提供的範例，如需改為可編輯請告知。
========================================================= */
var COMPANY_INFO = {
  name: '鈞羽有限公司',
  addressZh: '新北市板橋區文化路2段90號5樓',
  addressEn: '5F., No.90, Sec. 2, Wenhua Rd., Banqiao Dist., New Taipei City 220, Taiwan (R.O.C.)',
  bank: '玉山銀行 板橋分行 808-1171',
  account: '鈞羽有限公司',
  accountNumber: '1171-940-046586',
  contactName: '陳韋廷',
  tel: '0937460893 ; 02-6637-3899 # 79',
  email: 'wtaman1001@gmail.com、manatee@tsaipei.com'
};

function monthRangeServer_(monthStr){
  var parts = String(monthStr).split('-').map(Number);
  var y = parts[0], m = parts[1];
  var start = new Date(y, m - 1, 1);
  var end = new Date(y, m, 0);
  return {start: start, end: end, daysInMonth: end.getDate(), year: y, month: m};
}
function dateOverlapDaysServer_(rangeStart, rangeEnd, entryStr, exitStr){
  if(!entryStr) return 0;
  var entry = new Date(entryStr + 'T00:00:00');
  if(isNaN(entry.getTime())) return 0;
  var exit = exitStr ? new Date(exitStr + 'T00:00:00') : rangeEnd;
  var s = entry < rangeStart ? rangeStart : entry;
  var e = exit > rangeEnd ? rangeEnd : exit;
  if(e < s) return 0;
  return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
}
function studentDaysInTaiwanForMonthServer_(visaRecords, studentId, range){
  var v = visaRecords.filter(function(x){ return x.studentId === studentId; })[0];
  if(!v) return 0;
  var days = 0;
  days += dateOverlapDaysServer_(range.start, range.end, v.firstEntryDate, v.firstExitDate);
  days += dateOverlapDaysServer_(range.start, range.end, v.secondEntryDate, v.secondExitDate);
  return days;
}
function studentStintDatesForMonthServer_(visaRecords, studentId, range){
  var v = visaRecords.filter(function(x){ return x.studentId === studentId; })[0];
  if(!v) return {start:'', end:''};
  var d1 = dateOverlapDaysServer_(range.start, range.end, v.firstEntryDate, v.firstExitDate);
  if(d1 > 0) return {start: v.firstEntryDate || '', end: v.firstExitDate || ''};
  var d2 = dateOverlapDaysServer_(range.start, range.end, v.secondEntryDate, v.secondExitDate);
  if(d2 > 0) return {start: v.secondEntryDate || '', end: v.secondExitDate || ''};
  return {start: v.firstEntryDate || '', end: v.firstExitDate || ''};
}

function generateClientInvoice(token, projectCode, client, monthStr){
  requireEdit_(token,'bonus');
  var range = monthRangeServer_(monthStr);
  var students = readAll_('Students');
  var matches = readAll_('Matches');
  var positions = readAll_('Positions');
  var admitted = readAll_('AdmittedList');
  var visaRecords = readAll_('InTaiwanVisa');
  var feeSetup = readAll_('ClientFeeSetup').filter(function(r){
    return (r.projectCode || '') === (projectCode || '') && r.client === client;
  })[0];

  var rows = [];
  var no = 1;
  students.forEach(function(s){
    var a = admitted.filter(function(x){
      var m = matches.filter(function(mm){ return mm.id === x.matchId; })[0];
      return m && m.studentId === s.id;
    })[0];
    var m = a ? matches.filter(function(mm){ return mm.id === a.matchId; })[0] : null;
    if(!m) m = matches.filter(function(mm){ return mm.studentId === s.id; })[0];
    if(!m) return;
    var p = positions.filter(function(pp){ return pp.id === m.positionId; })[0];
    if(!p) return;
    if((p.projectCode || '') !== (projectCode || '') || p.company !== client) return;

    var days = studentDaysInTaiwanForMonthServer_(visaRecords, s.id, range);
    if(days <= 0) return;
    var stint = studentStintDatesForMonthServer_(visaRecords, s.id, range);

    var serviceFee = feeSetup && feeSetup.monthlyServiceFee ? Math.round(Number(feeSetup.monthlyServiceFee) / range.daysInMonth * days) : 0;
    var dormManageFee = feeSetup && feeSetup.monthlyDormManageFee ? Math.round(Number(feeSetup.monthlyDormManageFee) / range.daysInMonth * days) : 0;
    var dormFee = feeSetup && feeSetup.monthlyDormFee ? Math.round(Number(feeSetup.monthlyDormFee) / range.daysInMonth * days) : 0;
    var processingFee = feeSetup && feeSetup.monthlyProcessingFee ? Math.round(Number(feeSetup.monthlyProcessingFee) / range.daysInMonth * days) : 0;

    rows.push({
      no: no++,
      name: s.originalName || s.chineseName || '',
      passport: s.passportNumber || '',
      startDate: stint.start,
      endDate: stint.end,
      days: days,
      serviceFee: serviceFee,
      dormManageFee: dormManageFee,
      dormFee: dormFee,
      processingFee: processingFee,
      total: serviceFee + dormManageFee + dormFee + processingFee
    });
  });

  if(!rows.length){
    throw new Error('此專案／客戶在該月份沒有可計算的學生資料，請確認在台簽證追蹤與客戶費用建檔是否都已設定。');
  }

  // 計算期別：從這個專案/客戶最早一位學生的入台月份，算到目前請款月份是第幾個月
  var earliestDate = null;
  students.forEach(function(s){
    var a = admitted.filter(function(x){
      var m = matches.filter(function(mm){ return mm.id === x.matchId; })[0];
      return m && m.studentId === s.id;
    })[0];
    var m = a ? matches.filter(function(mm){ return mm.id === a.matchId; })[0] : null;
    if(!m) m = matches.filter(function(mm){ return mm.studentId === s.id; })[0];
    if(!m) return;
    var p = positions.filter(function(pp){ return pp.id === m.positionId; })[0];
    if(!p) return;
    if((p.projectCode || '') !== (projectCode || '') || p.company !== client) return;
    var v = visaRecords.filter(function(x){ return x.studentId === s.id; })[0];
    if(v && v.firstEntryDate){
      var d = new Date(v.firstEntryDate + 'T00:00:00');
      if(!isNaN(d.getTime()) && (!earliestDate || d < earliestDate)) earliestDate = d;
    }
  });
  var periodNumber = 1;
  if(earliestDate){
    periodNumber = (range.year - earliestDate.getFullYear()) * 12 + (range.month - (earliestDate.getMonth() + 1)) + 1;
    if(periodNumber < 1) periodNumber = 1;
  }
  var periodLabel = '第' + periodNumber + '期';

  var subtotal = rows.reduce(function(sum, r){ return sum + r.total; }, 0);
  var tax = Math.round(subtotal * 0.05);
  var grandTotal = subtotal + tax;

  var ss = SpreadsheetApp.create('temp_invoice_' + Utilities.getUuid());
  try{
    var sheet1 = ss.getSheets()[0];
    sheet1.setName('請款單');
    buildInvoiceSummarySheet_(sheet1, client, feeSetup ? feeSetup.taxId : '', range, subtotal, tax, grandTotal);

    var sheet2 = ss.insertSheet('學生明細');
    buildInvoiceDetailSheet_(sheet2, range.daysInMonth, rows, subtotal, tax, grandTotal, periodLabel);

    SpreadsheetApp.flush();
    var id = ss.getId();
    var exportUrl = 'https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx';
    var oauthToken = ScriptApp.getOAuthToken();
    var response = UrlFetchApp.fetch(exportUrl, {
      headers: {Authorization: 'Bearer ' + oauthToken},
      muteHttpExceptions: true
    });
    if(response.getResponseCode() !== 200){
      throw new Error('匯出 Excel 檔案失敗，請稍後再試一次。');
    }
    var blob = response.getBlob();
    var base64 = Utilities.base64Encode(blob.getBytes());
    var yearRoc = range.year - 1911;
    var filename = yearRoc + '.' + String(range.month) + '月_' + client + '_請款單.xlsx';
    return {filename: filename, base64: base64};
  } finally {
    DriveApp.getFileById(ss.getId()).setTrashed(true);
  }
}

function buildInvoiceSummarySheet_(sheet, client, taxId, range, subtotal, tax, grandTotal){
  var c = COMPANY_INFO;
  var yearRoc = range.year - 1911;
  var mm = String(range.month);
  var mm2 = mm.length < 2 ? '0' + mm : mm;
  var periodLabel = yearRoc + '.' + mm2 + '月 請款單';
  var rangeLabel = '計算區間：' + yearRoc + '.' + mm2 + '.01~' + yearRoc + '.' + mm2 + '.' + range.daysInMonth;

  sheet.getRange('B2').setValue(c.name).setFontWeight('bold').setFontSize(14);
  sheet.getRange('B3').setValue(c.addressZh);
  sheet.getRange('B4').setValue(c.addressEn);
  sheet.getRange('D6').setValue(periodLabel).setFontWeight('bold').setFontSize(12);
  sheet.getRange('C7').setValue(rangeLabel);

  var headerRow = 9;
  var headers = ['客戶名稱','統一編號','品名','銷售額','營業稅','總　計'];
  var headerRange = sheet.getRange(headerRow, 2, 1, 6);
  headerRange.setValues([headers]).setFontWeight('bold').setBorder(true,true,true,true,true,true);
  var dataRange = sheet.getRange(headerRow + 1, 2, 1, 6);
  dataRange.setValues([[client, taxId || '', '服務費', subtotal, tax, grandTotal]]).setBorder(true,true,true,true,true,true);
  sheet.getRange(headerRow + 1, 5, 1, 3).setNumberFormat('#,##0');

  sheet.getRange(headerRow + 3, 2).setValue('金額合計').setFontWeight('bold');
  sheet.getRange(headerRow + 3, 5, 1, 3).setValues([[subtotal, tax, grandTotal]]).setNumberFormat('#,##0');

  sheet.getRange(headerRow + 6, 2).setValue(grandTotal + '  taxes included');
  sheet.getRange(headerRow + 7, 2).setValue('Type of payment: payment in lump sum');
  sheet.getRange(headerRow + 9, 2).setValue('★請於10號前或合約約定日期前匯入下列帳號 ★').setFontWeight('bold');
  sheet.getRange(headerRow + 10, 2).setValue('◇ 匯款銀行：' + c.bank);
  sheet.getRange(headerRow + 11, 2).setValue('◇ 匯款帳戶：' + c.account);
  sheet.getRange(headerRow + 12, 2).setValue('◇ 匯款帳號：' + c.accountNumber);
  sheet.getRange(headerRow + 14, 2).setValue('TEL：' + c.tel);
  sheet.getRange(headerRow + 15, 2).setValue(c.contactName);
  sheet.getRange(headerRow + 16, 2).setValue('E-mail：' + c.email);

  sheet.setColumnWidth(2, 220);
  sheet.setColumnWidths(3, 4, 110);
}

function buildInvoiceDetailSheet_(sheet, daysInMonth, rows, subtotal, tax, grandTotal, periodLabel){
  var headers = ['編號','姓名','護照號碼','到職日','離職日','任職天數','服務費用','宿管費用','宿舍費用','辦件費','請款金額','備註'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBorder(true,true,true,true,true,true);
  var data = rows.map(function(r){
    return [r.no, r.name, r.passport, r.startDate, r.endDate, r.days, r.serviceFee, r.dormManageFee, r.dormFee, r.processingFee, r.total, periodLabel || ''];
  });
  sheet.getRange(2, 1, data.length, headers.length).setValues(data).setBorder(true,true,true,true,true,true);

  var totalRow = 2 + data.length;
  sheet.getRange(totalRow, 1).setValue('小計').setFontWeight('bold');
  ['F','G','H','I','J','K'].forEach(function(col, i){
    sheet.getRange(col + totalRow).setFormula('=SUM(' + col + '2:' + col + (totalRow - 1) + ')');
  });

  sheet.getRange(totalRow + 2, 7).setValue('當月天數');
  sheet.getRange(totalRow + 2, 8).setValue(daysInMonth);
  sheet.getRange(totalRow + 2, 10).setValue('合計');
  sheet.getRange(totalRow + 2, 11).setValue(subtotal);
  sheet.getRange(totalRow + 3, 10).setValue('營業稅');
  sheet.getRange(totalRow + 3, 11).setValue(tax);
  sheet.getRange(totalRow + 4, 10).setValue('發票金額');
  sheet.getRange(totalRow + 4, 11).setValue(grandTotal);

  sheet.getRange(2, 7, data.length + 1, 5).setNumberFormat('#,##0');
  sheet.getRange(totalRow + 2, 8).setNumberFormat('0');
  sheet.getRange(totalRow + 2, 11, 3, 1).setNumberFormat('#,##0');
  sheet.autoResizeColumns(1, headers.length);
}
function updateInternalFeeSetup(token, id, data){ requireEdit_(token,'bonus'); return updateRow_('InternalFeeSetup', id, data); }
function deleteInternalFeeSetup(token, id){ requireEdit_(token,'bonus'); return deleteRow_('InternalFeeSetup', id); }

/* ---------------------------------------------------------
   11. 使用人員 CRUD(僅系統管理員可寫入)
--------------------------------------------------------- */
function addUser(token, data){
  requireEdit_(token,'users');
  if(!data.username || !data.password) throw new Error('帳號與密碼為必填。');
  if(data.password.length < 6) throw new Error('密碼至少需要 6 個字元。');
  if(usernameExists_(data.username, null)) throw new Error('此帳號已被使用，請換一個。');
  var salt = generateSalt_();
  var hash = hashPassword_(data.password, salt);
  return insertRow_('Users', {
    name: data.name, username: data.username,
    passwordHash: hash, passwordSalt: salt,
    role: data.role, status: data.status || '正常'
  });
}

function updateUser(token, id, data){
  var session = requireEdit_(token,'users');
  if(data.username && usernameExists_(data.username, id)) throw new Error('此帳號已被使用，請換一個。');
  var patch = {name: data.name, role: data.role, status: data.status};
  if(data.username) patch.username = data.username;
  if(data.newPassword){
    if(data.newPassword.length < 6) throw new Error('新密碼至少需要 6 個字元。');
    var salt = generateSalt_();
    patch.passwordSalt = salt;
    patch.passwordHash = hashPassword_(data.newPassword, salt);
  }
  return updateRow_('Users', id, patch);
}

function deleteUser(token, id){
  var session = requireEdit_(token,'users');
  if(session.id === id) throw new Error('無法刪除目前登入中的帳號，請先切換其他管理員帳號再刪除。');
  return deleteRow_('Users', id);
}
