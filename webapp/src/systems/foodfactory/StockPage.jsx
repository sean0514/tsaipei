import { useState } from 'react';
import { useCollection } from '../../lib/useCollection';
import { materialStock } from '../../lib/foodInventory';
import { exportEntityCSV } from '../../lib/csv';

const MATERIAL_CSV_FIELDS = [
  { key: 'name', label: '原料名稱' }, { key: 'category', label: '分類' }, { key: 'unit', label: '單位' },
  { key: 'safetyStock', label: '安全庫存量' }, { key: 'stock', label: '目前庫存' },
];
const PRODUCT_CSV_FIELDS = [
  { key: 'productName', label: '成品名稱' }, { key: 'batchNo', label: '批號' }, { key: 'quantity', label: '數量' },
  { key: 'expiryDate', label: '效期' }, { key: 'location', label: '儲放位置' },
];

export default function StockPage() {
  const { rows: materials, loading: materialsLoading } = useCollection('foodfactory_materials', { order: ['name', 'asc'] });
  const { rows: inventoryLogs } = useCollection('foodfactory_inventoryLogs');
  const { rows: productInventory, loading: productInventoryLoading } = useCollection('foodfactory_productInventory');
  const { rows: products } = useCollection('foodfactory_products');
  const [materialQ, setMaterialQ] = useState('');
  const [productQ, setProductQ] = useState('');

  const productName = (id) => products.find((p) => p.id === id)?.name || '(未知)';

  const materialSearchQuery = materialQ.trim().toLowerCase();
  const filteredMaterials = materials.filter((m) => !materialSearchQuery || [m.name, m.category].some((v) => v?.toLowerCase().includes(materialSearchQuery)));

  const productSearchQuery = productQ.trim().toLowerCase();
  const filteredProductInventory = productInventory.filter((i) => !productSearchQuery || `${productName(i.productId)} ${i.batchNo || ''}`.toLowerCase().includes(productSearchQuery));

  function handleDownloadMaterials() {
    exportEntityCSV(materials.map((m) => ({ ...m, stock: materialStock(m.id, inventoryLogs) })), MATERIAL_CSV_FIELDS, '原料庫存');
  }

  function handleDownloadProducts() {
    exportEntityCSV(productInventory.map((i) => ({ ...i, productName: productName(i.productId) })), PRODUCT_CSV_FIELDS, '成品庫存');
  }

  return (
    <div className="content">
      <div className="page-header"><h2>庫存</h2></div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="page-header" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>原料庫存</h3>
          <button onClick={handleDownloadMaterials}>下載完整資料</button>
        </div>
        <input placeholder="搜尋名稱/分類" value={materialQ} onChange={(e) => setMaterialQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {materialsLoading ? <p className="muted">載入中…</p> : (
          <table>
            <thead><tr><th>原料名稱</th><th>分類</th><th>單位</th><th>安全庫存量</th><th>目前庫存</th></tr></thead>
            <tbody>
              {filteredMaterials.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.category || '—'}</td>
                  <td>{m.unit || '—'}</td>
                  <td>{m.safetyStock || '—'}</td>
                  <td>{materialStock(m.id, inventoryLogs)} {m.unit}</td>
                </tr>
              ))}
              {filteredMaterials.length === 0 && <tr><td colSpan={5} className="muted">沒有資料</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="page-header" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>成品庫存</h3>
          <button onClick={handleDownloadProducts}>下載完整資料</button>
        </div>
        <input placeholder="搜尋成品/批號" value={productQ} onChange={(e) => setProductQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {productInventoryLoading ? <p className="muted">載入中…</p> : (
          <table>
            <thead><tr><th>成品名稱</th><th>批號</th><th>數量</th><th>效期</th><th>儲放位置</th></tr></thead>
            <tbody>
              {filteredProductInventory.map((i) => (
                <tr key={i.id}>
                  <td>{productName(i.productId)}</td>
                  <td>{i.batchNo || '—'}</td>
                  <td>{i.quantity}</td>
                  <td>{i.expiryDate || '—'}</td>
                  <td>{i.location || '—'}</td>
                </tr>
              ))}
              {filteredProductInventory.length === 0 && <tr><td colSpan={5} className="muted">沒有資料</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
