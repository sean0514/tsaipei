import { useEffect, useRef, useState } from 'react';

// 簡單的手寫簽名板：滑鼠/觸控/觸控筆都能畫，畫完按「確認簽名」轉成 PNG
// data URL 存起來；已經有簽名的話直接顯示圖片＋「清除重簽」按鈕，不用
// 再畫一次。data URL 直接存進 Firestore 文件欄位（簽名本身很小，簽名板
// 畫布刻意控制在不大的尺寸，PNG base64 通常只有幾KB到幾十KB，遠低於
// Firestore 單一文件1MB的限制，不需要另外走 Storage 上傳流程）。
//
// 改用 Pointer Events(取代分開寫的滑鼠/觸控事件)：手機瀏覽器在手指移動
// 太快、中途移出畫布範圍時，分開的 touchmove 常常追不上或被瀏覽器當成
// 頁面捲動中斷掉，使用者會覺得畫了線但後面按鈕按不下去(其實是線沒畫完、
// hasInk 沒被設成 true)；Pointer Events 搭配 setPointerCapture 之後，
// 手指/滑鼠移出畫布範圍還是會持續收到同一支筆畫的事件，不會中途斷掉。
export default function SignaturePad({ value, onChange, disabled, width = 400, height = 140 }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    hasInkRef.current = false;
    setIsEmpty(true);
  }, []);

  function pointerPos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvasRef.current.width / rect.width),
      y: (e.clientY - rect.top) * (canvasRef.current.height / rect.height),
    };
  }

  function start(e) {
    if (disabled) return;
    e.preventDefault();
    // 把這支筆畫的後續事件都釘在這個畫布上，手指/滑鼠移出畫布範圍(甚至
    // 移到畫布外的其他元素上)還是會持續收到 move/up，不會中途斷掉或被
    // 瀏覽器搶去當成頁面捲動手勢處理。
    canvasRef.current.setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    const { x, y } = pointerPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e) {
    if (!drawingRef.current || disabled) return;
    e.preventDefault();
    const { x, y } = pointerPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(x, y);
    ctx.stroke();
    hasInkRef.current = true;
    setIsEmpty(false);
  }
  function end(e) {
    drawingRef.current = false;
    canvasRef.current?.releasePointerCapture?.(e.pointerId);
  }

  function handleClear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    hasInkRef.current = false;
    setIsEmpty(true);
    onChange('');
  }

  function handleConfirm() {
    if (!hasInkRef.current) return;
    onChange(canvasRef.current.toDataURL('image/png'));
  }

  if (value) {
    return (
      <div>
        <img src={value} alt="簽名" style={{ width, height, objectFit: 'contain', border: '1px solid var(--border)', background: '#fff' }} />
        {!disabled && <div className="row-actions" style={{ marginTop: 6 }}><button type="button" onClick={() => onChange('')}>清除重簽</button></div>}
      </div>
    );
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ border: '1px solid var(--border)', touchAction: 'none', cursor: disabled ? 'default' : 'crosshair' }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      {!disabled && (
        <div className="row-actions" style={{ marginTop: 6 }}>
          <button type="button" onClick={handleClear}>清空</button>
          <button type="button" className="primary" onClick={handleConfirm} disabled={isEmpty}>確認簽名</button>
        </div>
      )}
    </div>
  );
}
