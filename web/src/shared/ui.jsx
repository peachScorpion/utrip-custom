import React, { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react';

/* ---------- Toast ---------- */
const TC = createContext(() => {});
export const useToast = () => useContext(TC);
export function ToastHost({ children }) {
  const [list, setList] = useState([]);
  const push = useCallback(t => {
    const id = Math.random();
    setList(l => [...l, { id, t }]);
    setTimeout(() => setList(l => l.filter(x => x.id !== id)), 2600);
  }, []);
  return (<TC.Provider value={push}>{children}
    <div className="toasts">{list.map(x => <div key={x.id} className="toast">{x.t}</div>)}</div>
  </TC.Provider>);
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, sub, children, width }) {
  useEffect(() => {
    if (!open) return;
    const h = e => e.key === 'Escape' && onClose && onClose();
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="mask" onClick={e => e.target === e.currentTarget && onClose && onClose()}>
      <div className="modal" style={width ? { maxWidth: width } : null}>
        <div className="modal-h">
          <div><h3>{title}</h3>{sub && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>{sub}</div>}</div>
          <button className="x" onClick={onClose}>✕</button>
        </div>
        <div className="modal-b">{children}</div>
      </div>
    </div>
  );
}
export function confirmBox(msg) { return window.confirm(msg); }

/* ---------- 数据 hook ---------- */
export function useData(fn, deps = [], initial = null) {
  const [d, setD] = useState(initial);
  const [loading, setL] = useState(true);
  const [err, setE] = useState(null);
  /* 返回 Promise：调用方需要拿刷新后的数据做判断时可以 await（现有的直接调用不受影响） */
  const reload = useCallback(() => {
    setL(true);
    return Promise.resolve(fn())
      .then(r => { setD(r); setE(null); return r; })
      .catch(e => { setE(e.message); return null; })
      .finally(() => setL(false));
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { d, loading, err, reload, setD };
}

/* ---------- 图标（内联 SVG，无外部依赖） ---------- */
const P = {
  home:'M3 10.5 12 3l9 7.5V21H3z', compass:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m3.5 6.5-2 5-5 2 2-5z',
  users:'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8m13 10v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8',
  chat:'M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 21l1.9-5A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5',
  sparkle:'M12 2.5 14 9l6.5 2-6.5 2-2 6.5-2-6.5L3.5 11 10 9z', user:'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  map:'M9 3 3 5.5v16L9 19l6 2.5 6-2.5v-16L15 5.5zM9 3v16M15 5.5v16',
  /* 地点：折叠地图（map）看不出「这是个地点」，目的地一律用定位针 */
  pin:'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6', box:'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  check:'M20 6 9 17l-5-5', x:'M18 6 6 18M6 6l12 12', plus:'M12 5v14M5 12h14', pen:'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  trash:'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6', search:'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3',
  arrow:'M5 12h14M13 6l6 6-6 6', back:'M19 12H5M11 18l-6-6 6-6', star:'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z',
  clock:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2', bell:'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  file:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6', tag:'M20.6 13.4 12 22l-9-9V3h10zM7.5 7.5h.01',
  grid:'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z', layers:'m12 2 9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5',
  cog:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 2.6 7.5a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H7a1.6 1.6 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  phone:'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.8 2.1',
  heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.7 1.1-1a5.5 5.5 0 0 0 0-7.8',
  ticket:'M3 9a3 3 0 0 1 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a3 3 0 0 1 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z',
  bag:'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
  eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7m10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  send:'M22 2 11 13M22 2l-7 20-4-9-9-4z', img:'M3 3h18v18H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M21 15l-5-5L5 21',
  calendar:'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  bed:'M3 20v-9h18v9M3 11V5M21 20v-4M3 16h18M7.5 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4M11 11h10',
  car:'M3 13l2.2-6h13.6L21 13v4H3zM7 17a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0M20 17a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0M3 13h18',
  dish:'M6 2v6a2 2 0 0 0 4 0V2M8 10v12M17.5 2c-1.5 1.1-2.3 3.1-2.3 5.6s.8 4.4 2.3 4.4v10',
  chevron:'m9 6 6 6-6 6', chevronL:'m15 6-6 6 6 6', up:'m6 15 6-6 6 6', down:'m6 9 6 6 6-6',
  refresh:'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5', download:'M12 3v12M7 11l5 5 5-5M3 21h18',
  shield:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10', sun:'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
};
export function Icon({ n, s = 17, c = 'currentColor', sw = 1.6, style }) {
  const d = P[n] || P.compass;
  return (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw}
    strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, ...style }}><path d={d} /></svg>);
}

/* ---------- 数字滚动 ---------- */
export function Counter({ to, dur = 1200, fmt = n => n.toLocaleString() }) {
  const [v, setV] = useState(0); const r = useRef();
  useEffect(() => {
    const t0 = performance.now(), from = 0;
    const tick = t => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      setV(Math.round(from + (to - from) * e));
      if (p < 1) r.current = requestAnimationFrame(tick);
    };
    r.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(r.current);
  }, [to, dur]);
  return <>{fmt(v)}</>;
}


/* 后台窄屏用的抽屉开关。三个后台共用：放进 .adm-top，配合 .adm 上的 side-on 类。 */
export function AdmBurger({ on, set }) {
  return (<>
    <button className="adm-burger" onClick={() => set(!on)} aria-label="菜单"><i /><i /><i /></button>
    {on && <div className="adm-mask" onClick={() => set(false)} />}
  </>);
}
