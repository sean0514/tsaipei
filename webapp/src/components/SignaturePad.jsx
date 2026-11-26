import { useEffect, useRef, useState } from 'react';

// 簡單的手寫簽名板：滑鼠/觸控都能畫，畫完按「確認簽名」轉成 PNG data URL
// 存起來；已經有簽名的話直接顯示圖片＋「清除重簽」按鈕，不用再畫一次。
// data URL 直接存進 Firestore 文件欄位（簽名本身很小，簽名板畫布刻意
// 控制在不大的尺寸，PNG base64 通常只有幾KB到幾十KB，遠低於 Firestore
// 單一文件 1MB 的限制，不需要另外走 Storage 上傳流程）。
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
    const point = e.touches ? e.touches[0] : e;
    return {
      x: (point.clientX - rect.left) * (canvasRef.current.width / rect.width),
      y: (point.clientY - rect.top) * (canvasRef.current.height / rect.height),
    };
  }

  function start(e) {
    if (disabled) return;
    e.preventDefault();
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
  function end() {
    drawingRef.current = false;
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
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
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
