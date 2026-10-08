import React, { useState, useEffect, useRef } from 'react';
import { img as oimg } from '../../shared/img.js';
import { get, post, del, money } from '../../shared/api.js';
import { Icon, useToast } from '../../shared/ui.jsx';

const SESS = 'csp-mianing-001';
const QUICK = ['意大利 罗马·佛罗伦萨·威尼斯', '10 天', '2027年3月15日', '2大2小', '20万', '亲子 美食', '陈太太 13098572345'];

export default function Chat({ onOpen }) {
  const toast = useToast();
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef();
  const load = async () => { const m = await get('/api/csp/chat/' + SESS); setMsgs(m); if (!m.length) send(''); };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [msgs]);

  const send = async t => {
    setBusy(true);
    try { const m = await post('/api/csp/chat/' + SESS, { text: t }); setMsgs(m); setText(''); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  };
  const reset = async () => { await del('/api/csp/chat/' + SESS); setMsgs([]); send(''); };
  const step = msgs.filter(m => m.role === 'user').length;

  return (<div style={{ display: 'flex', gap: 18, height: 'calc(100vh - 150px)' }}>
    <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(140deg,var(--gold),var(--gold-2))', display: 'grid', placeItems: 'center' }}>
          <Icon n="sparkle" s={17} c="#fff" /></div>
        <div><b style={{ fontSize: 14 }}>定制师 · 悠悠</b>
          <div className="t2">帮销售把需求问清楚，收齐 7 项自动建单出方案</div></div>
        <button className="btn btn-o btn-xs" style={{ marginLeft: 'auto' }} onClick={reset}><Icon n="refresh" s={13} />重新开始</button>
      </div>
      <div ref={box} style={{ flex: 1, overflowY: 'auto', padding: '18px 18px 8px', background: 'var(--paper)' }}>
        {msgs.map(m => m.role === 'user' ? (
          <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <div style={{ background: 'var(--ink)', color: '#fff', padding: '9px 14px', borderRadius: '14px 14px 3px 14px', maxWidth: '72%', fontSize: 13.5 }}>{m.text}</div>
          </div>
        ) : (
          <div key={m.id} style={{ display: 'flex', gap: 9, marginBottom: 12 }}>
            <div style={{ width: 28, height: 28, flex: '0 0 28px', borderRadius: 8, background: 'linear-gradient(140deg,var(--gold),var(--gold-2))', display: 'grid', placeItems: 'center' }}>
              <Icon n="sparkle" s={13} c="#fff" /></div>
            <div style={{ maxWidth: '76%' }}>
              <div style={{ background: '#fff', border: '1px solid var(--line)', padding: '9px 14px', borderRadius: '3px 14px 14px 14px', fontSize: 13.5, lineHeight: 1.65 }}>{m.text}</div>
              {m.kind === 'plan' && m.payload && (
                <div className="card fade-in" style={{ marginTop: 9, overflow: 'hidden', width: 330 }}>
                  <img src={oimg(m.payload.cover)} alt="" style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block' }} />
                  <div style={{ padding: '12px 14px' }}>
                    <div className="mono" style={{ fontSize: 11.5, color: 'var(--gold)' }}>{m.payload.no}</div>
                    <b style={{ fontSize: 14, display: 'block', margin: '3px 0 2px' }}>{m.payload.route}</b>
                    <div className="t2">{m.payload.days} 天行程已生成</div>
                    <div style={{ display: 'flex', alignItems: 'center', marginTop: 10, gap: 8 }}>
                      <b className="serif" style={{ fontSize: 18, color: 'var(--ink)' }}>{money(m.payload.total)}</b>
                      <button className="btn btn-p btn-xs" style={{ marginLeft: 'auto' }} onClick={() => onOpen(m.payload.no)}>去看板处理</button>
                      <a className="btn btn-o btn-xs" href={'#/trip/' + m.payload.token} target="_blank" rel="noreferrer">转发客人</a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div style={{ fontSize: 12, color: 'var(--muted)', paddingLeft: 38 }}>定制师正在整理…</div>}
      </div>
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line)', background: '#fff' }}>
        {step < QUICK.length && (
          <div style={{ marginBottom: 9 }}>
            <button className="chip" style={{ fontSize: 12 }} onClick={() => send(QUICK[step])}>
              <Icon n="sparkle" s={12} c="var(--gold)" style={{ verticalAlign: -1, marginRight: 4 }} />示例：{QUICK[step]}</button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 9 }}>
          <input className="inp" value={text} onChange={e => setText(e.target.value)} placeholder="把客人的回答写在这里…"
            onKeyDown={e => e.key === 'Enter' && text.trim() && send(text.trim())} />
          <button className="btn btn-p" disabled={busy || !text.trim()} onClick={() => send(text.trim())}>
            <Icon n="send" s={15} c="#fff" />发送</button>
        </div>
      </div>
    </div>
    <div style={{ flex: '0 0 250px' }}>
      <div className="card" style={{ padding: '15px 17px' }}>
        <div className="tk">HOW IT WORKS</div>
        <h4 style={{ fontSize: 14, margin: '8px 0 10px' }}>这条路怎么走</h4>
        <ol style={{ margin: 0, paddingLeft: 17, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.9 }}>
          <li>定制师按 7 个问题逐项问</li>
          <li>收齐后自动建单（状态：已接单）</li>
          <li>同时排出整条线路与报价</li>
          <li>卡片上可直接转发给客人</li>
          <li>客人标注意见 → 一键按反馈重出</li>
        </ol>
        <hr className="hair" style={{ margin: '14px 0' }} />
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.8 }}>
          这一版是<b style={{ color: 'var(--ink)' }}>纯代码编排</b>（不调大模型）：
          同样的输入永远得到同样的行程，演示与汇报可复现，不会临场胡说。
        </div>
      </div>
    </div>
  </div>);
}
