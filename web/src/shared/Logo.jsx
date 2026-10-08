import React from 'react';

/* 优定制 U-DESIGN 标识（按官方 logo 重绘为矢量：玫红对话气泡 + 白色微笑弧，弧即 U-DESIGN 的 U） */
export function UMark({ s = 28, c = 'var(--brand)', smile = '#fff' }) {
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" fill="none" style={{ display: 'block', flexShrink: 0 }}>
      <path d="M50 6a38 38 0 1 1-8.4 75.05l-2.6 12.4a2.6 2.6 0 0 1-4.46 1.24l-9.2-10.1A38 38 0 0 1 50 6Z" fill={c} />
      <path d="M32.5 47c1.6 10.2 9.1 17 17.5 17s15.9-6.8 17.5-17"
        stroke={smile} strokeWidth="7.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/* 横版：图标 + 中文 + 英文（深底/浅底自适应） */
export function ULogo({ s = 26, dark = false, sub = true }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <UMark s={s} />
      <span style={{ lineHeight: 1 }}>
        <b style={{ fontSize: s * 0.62, fontWeight: 700, letterSpacing: '.02em', color: dark ? '#fff' : 'var(--ink-3)', display: 'block' }}>优定制</b>
        {sub && <i style={{ fontSize: s * 0.3, letterSpacing: '.18em', color: 'var(--brand)', fontStyle: 'normal', display: 'block', marginTop: 2, fontWeight: 600 }}>U-DESIGN</i>}
      </span>
    </span>
  );
}

/* AI 行程师标识：把「Ai」与优定制的微笑弧合成一个图形
   —— 弧既是 logo 的 U，也是 Ai 的底座；右上一点星芒给出 AI 的语义 */
export function AiMark({ s = 26, c = 'var(--accent-3)', star = 'var(--brand-2)' }) {
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" fill="none" style={{ display: 'block', flexShrink: 0 }}>
      {/* Ai 字形 */}
      <path d="M17 58 L30.5 24 h9 L53 58 h-9.6 l-2.6-7.4H29.2L26.6 58z M31.6 43.6h6.6L35 33.6z"
        fill={c} />
      <rect x="60" y="33" width="8.4" height="25" rx="2.6" fill={c} />
      <circle cx="64.2" cy="25" r="4.8" fill={c} />
      {/* 微笑弧：logo 的 U */}
      <path d="M20 68c3.4 10.6 15.4 17.6 30 17.6S76.6 78.6 80 68"
        stroke={c} strokeWidth="8" strokeLinecap="round" fill="none" opacity=".92" />
      {/* 星芒 */}
      <path d="M84 16l2.2 6.2L92 24.4l-5.8 2.2L84 33l-2.2-6.4L76 24.4l5.8-2.2z" fill={star} />
    </svg>
  );
}

/* AI 定制 · 底部主按钮（欧美范：字体优先、克制、无卡通元素） */
export function AiBadge({ s = 54 }) {
  const id = 'aib2';
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" fill="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={id + 'bg'} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2b2620" /><stop offset=".5" stopColor="#1a181e" /><stop offset="1" stopColor="#0e0d12" />
        </linearGradient>
        <linearGradient id={id + 'g'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2e0b8" /><stop offset=".55" stopColor="#cfae74" /><stop offset="1" stopColor="#a8823f" />
        </linearGradient>
        <linearGradient id={id + 'hl'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".26" /><stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="94" height="94" rx="27" fill={`url(#${id}bg)`} />
      <rect x="3" y="3" width="94" height="94" rx="27" fill={`url(#${id}hl)`} />
      <rect x="4.6" y="4.6" width="90.8" height="90.8" rx="25.6" fill="none" stroke="#cfae74" strokeOpacity=".5" strokeWidth="1.4" />
      {/* AI：衬线大写，字距拉开，居中占主体 */}
      <text x="50" y="62" textAnchor="middle" fill={`url(#${id}g)`}
        style={{ fontFamily: 'Optima, Palatino, Georgia, serif', fontSize: 40, letterSpacing: 4, fontWeight: 400 }}>AI</text>
      <rect x="33" y="72" width="34" height="1.4" fill="#cfae74" opacity=".7" />
    </svg>
  );
}
