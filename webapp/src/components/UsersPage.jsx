import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useCollection } from '../lib/useCollection';
import { useRolePermissions } from '../auth/useSystemAccess';
import { canEdit as computeCanEdit, SYSTEMS, permissionLevel } from '../lib/permissions';
import Tag from './Tag';
import { PERMISSION_LEVEL_TAG } from '../lib/tags';

const LEVEL_CYCLE = { edit: 'view', view: 'none', none: 'edit' };
const LEVEL_LABEL = { edit: '編輯', view: '檢視', none: '無' };

// Shared between both systems (registered as the 'users' page for tsaipei
// and foodfactory alike) — everything is parameterized off `system` from
// the Layout's Outlet context, so it reads/writes `${system}_users` and
// `${system}_rolePermissions`.
export default function UsersPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'users', role, overrides);
  const { rows, loading, update, remove } = useCollection(`${system}_users`);
  const rolePermissions = useRolePermissions(system);
  const sys = SYSTEMS[system];
  const [editing, setEditing] = useState(null);

  async function createUser(data) {
    await setDoc(doc(db, `${system}_users`, data.uid), {
      email: data.email, displayName: data.displayName, role: data.role,
    });
    setEditing(null);
  }

  async function cyclePermission(module, r) {
    const current = permissionLevel(system, module, r, rolePermissions);
    const next = LEVEL_CYCLE[current] || 'edit';
    await setDoc(doc(db, `${system}_rolePermissions`, `${module}__${r}`), { level: next });
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>使用人員</h2>
        {canEditPage && <button className="primary" onClick={() => setEditing({})}>新增使用者</button>}
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <p className="muted" style={{ marginTop: 0 }}>
          帳號本身（登入 email/密碼）要先在 Firebase Console → Authentication 建立，
          複製它的 UID 貼在這裡，才能指定這個人在本系統的角色。
        </p>
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Email</th><th>姓名</th><th>角色</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.email}</td>
                  <td>{r.displayName || '—'}</td>
                  <td>
                    {canEditPage ? (
                      <select value={r.role} onChange={(e) => update(r.id, { role: e.target.value })}>
                        {sys.roles.map((role_) => <option key={role_} value={role_}>{role_}</option>)}
                      </select>
                    ) : r.role}
                  </td>
                  {canEditPage && <td><button className="danger" onClick={() => remove(r.id)}>移除</button></td>}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={4} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>角色權限說明</h3>
        <p className="muted">點擊儲存格可循環切換「編輯 → 檢視 → 無 → 編輯」。系統管理員固定全模組編輯，不可調整。</p>
        <div className="table-wrap"><table>
          <thead>
            <tr>
              <th>模組</th>
              {sys.roles.filter((r) => r !== '系統管理員').map((r) => <th key={r}>{r}</th>)}
            </tr>
          </thead>
          <tbody>
            {Object.entries(sys.modules).map(([module, label]) => (
              <tr key={module}>
                <td>{label}</td>
                {sys.roles.filter((r) => r !== '系統管理員').map((r) => {
                  const level = permissionLevel(system, module, r, rolePermissions);
                  return (
                    <td key={r}>
                      {canEditPage ? (
                        <button className={`tag ${PERMISSION_LEVEL_TAG[level]}`} style={{ border: 'none' }} onClick={() => cyclePermission(module, r)}>{LEVEL_LABEL[level]}</button>
                      ) : <Tag value={LEVEL_LABEL[level]} map={{ 編輯: PERMISSION_LEVEL_TAG.edit, 檢視: PERMISSION_LEVEL_TAG.view, 無: PERMISSION_LEVEL_TAG.none }} />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      {editing && <UserFormModal roles={sys.roles} onCancel={() => setEditing(null)} onSave={createUser} />}
    </div>
  );
}

function UserFormModal({ roles, onCancel, onSave }) {
  const [form, setForm] = useState({ role: roles[0] });
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>新增使用者</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              Firebase Auth UID
              <input required value={form.uid || ''} onChange={(e) => setForm({ ...form, uid: e.target.value })} />
            </label>
            <label>
              Email
              <input type="email" required value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label>
              姓名
              <input value={form.displayName || ''} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
            </label>
            <label>
              角色
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {roles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          </div>
          <div className="row-actions">
            <button type="submit" className="primary">建立</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
