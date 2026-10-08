import React, { useMemo } from 'react';

/* 航线图：不接任何地图厂商——出境目的地在客户现场常加载不出来，
   底图与地名随代码走。经度按走法连续展开，避免线绕地球反着画。 */
export default function RouteMap({ geo, active, height = 190 }) {
  const { pts, path, W, H } = useMemo(() => {
    const W = 860, H = height, pad = { l: 56, r: 56, t: 34, b: 30 };
    const raw = (geo?.points || []).filter(p => p.lon || p.lat);
    if (raw.length < 2) return { pts: [], path: '', W, H };
    // 经度连续展开
    let lons = [raw[0].lon];
    for (let i = 1; i < raw.length; i++) {
      let d = raw[i].lon - lons[i - 1];
      while (d > 180) d -= 360; while (d < -180) d += 360;
      lons.push(lons[i - 1] + d);
    }
    const lats = raw.map(p => p.lat);
    const midLat = (Math.max(...lats) + Math.min(...lats)) / 2;
    const kx = Math.max(.35, Math.cos(midLat * Math.PI / 180));
    const xs = lons.map(l => l * kx);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...lats), y1 = Math.max(...lats);
    const sx = (x1 - x0) || 1, sy = (y1 - y0) || 1;
    const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
    const s = Math.min(cw / sx, ch / sy) * 0.92;
    const ox = pad.l + (cw - sx * s) / 2, oy = pad.t + (ch - sy * s) / 2;
    const pts = raw.map((p, i) => ({ ...p, x: ox + (xs[i] - x0) * s, y: oy + (y1 - p.lat) * s }));
    let path = '';
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const cx = mx - dy / len * len * 0.14, cy = my + dx / len * len * 0.14 - 14;
      path += `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)} `;
    }
    return { pts, path, W, H };
  }, [geo, height]);
  if (!pts.length) return null;
  return (
    <div style={{ background: 'linear-gradient(150deg,#101a17,#1a2723)', borderRadius: 13, overflow: 'hidden', position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        <defs>
          <pattern id="g" width="44" height="44" patternUnits="userSpaceOnUse">
            <path d="M44 0H0v44" fill="none" stroke="rgba(255,255,255,.045)" strokeWidth="1" /></pattern>
          <linearGradient id="ln" x1="0" x2="1"><stop offset="0" stopColor="#b08d4f" /><stop offset="1" stopColor="#cfae74" /></linearGradient>
        </defs>
        <rect width={W} height={H} fill="url(#g)" />
        <path d={path} fill="none" stroke="url(#ln)" strokeWidth="1.8" strokeDasharray="6 5" strokeLinecap="round">
          <animate attributeName="stroke-dashoffset" from="22" to="0" dur="1.4s" repeatCount="indefinite" /></path>
        {pts.map((p, i) => {
          const on = active && p.name === active;
          return (<g key={i}>
            <circle cx={p.x} cy={p.y} r={on ? 13 : 9} fill={on ? 'rgba(207,174,116,.28)' : 'rgba(207,174,116,.13)'} />
            <circle cx={p.x} cy={p.y} r={on ? 4.6 : 3.4} fill={i === 0 ? '#fff' : '#cfae74'} />
            <text x={p.x} y={p.y - 15} textAnchor="middle" fill={on ? '#fff' : '#cfd6d3'}
              style={{ fontSize: on ? 13 : 12, fontWeight: on ? 700 : 500, paintOrder: 'stroke' }}
              stroke="rgba(10,16,14,.85)" strokeWidth="3">{p.name}</text>
            {i > 0 && <text x={p.x} y={p.y + 20} textAnchor="middle" fill="#7d8b86" style={{ fontSize: 10 }}>{i}</text>}
          </g>);
        })}
      </svg>
      <div style={{ position: 'absolute', left: 14, top: 12, color: '#9fada8', fontSize: 11, letterSpacing: '.16em' }}>
        ROUTE · {pts.map(p => p.name).join(' → ')}
      </div>
    </div>
  );
}
