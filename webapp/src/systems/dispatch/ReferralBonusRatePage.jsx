import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';

// 全公司統一一筆設定，固定存在 dispatch_referralBonusRate/default，供「招募
// 獎金統計」計算：獎金總額 = 履歷筆數 × 這裡設定的每筆金額。
export default function ReferralBonusRatePage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'bonus', role, overrides);
  const { rows, loading } = useCollection('dispatch_referralBonusRate');
  const current = rows.find((r) => r.id === 'default');
  const [amount, setAmount] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (current) setAmount(current.amount ?? '');
  }, [current?.amount]);

  async function handleSave(e) {
    e.preventDefault();
    await setDoc(doc(db, 'dispatch_referralBonusRate', 'default'), { amount: Number(amount) || 0 });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>推薦獎金設定</h2>
          <div className="page-desc">設定線上履歷每筆的招募獎金金額，供「招募獎金統計」計算{!canEditPage && '（唯讀）'}</div>
        </div>
      </div>
      <div className="card" style={{ maxWidth: 360 }}>
        {loading ? <p className="muted">載入中…</p> : (
          <form onSubmit={handleSave}>
            <label>
              每筆履歷獎金金額
              <input type="number" min="0" disabled={!canEditPage} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            {canEditPage && (
              <div className="row-actions" style={{ marginTop: 12 }}>
                <button type="submit" className="primary">儲存</button>
                {saved && <span className="muted">已儲存</span>}
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
