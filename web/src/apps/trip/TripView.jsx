import React, { useState, useEffect, useRef } from 'react';
import { get, post, money } from '../../shared/api.js';
import { Icon, useToast, useData, Modal } from '../../shared/ui.jsx';
import { img } from '../../shared/img.js';

export default function TripView({ token, onBack }) {
  const toast = useToast();
  /* ?preview=1：CSP 后台点「预览客人所见」开过来的，内容与客人端完全一致，
     只是不受推送状态限制、也不记「客人最近打开」 */
  const preview = /[?&]preview=1/.test(typeof location !== 'undefined' ? location.hash + location.search : '');
  const { d, loading, reload } = useData(
    () => get('/api/trip/' + token + (preview ? '?preview=1' : '')), [token]);
  const [i, setI] = useState(0);
  const [fb, setFb] = useState(null);
  const [text, setText] = useState('');
  useEffect(() => { setI(0); }, [token]);      // 换一份行程从封面开始看
  /* 顾问那边随时可能改行程，而客人这一页开着就不会变。
     每次页面重新可见时（切回小程序、锁屏解锁）悄悄拉一次最新的，
     停留超过 3 分钟也拉一次——不打断正在看的那一页，i 不动。 */
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(() => { if (document.visibilityState === 'visible') reload(); }, 180000);
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(t); };
  }, [token]);
  /* 上滑翻页。不能一滑就翻 —— 每一页自己还要能滚（行程详情和报价都超过一屏），
     所以规则是：内容滚到底再上滑才去下一页，滚到顶再下滑才回上一页。
     翻完 520ms 内不再响应，免得一次滑动连翻好几页。 */
  const wrapRef = useRef(null);
  const lockRef = useRef(0);
  const totalRef = useRef(1);
  const liveRef = useRef(false);   // 行程真的渲染出来了才接管手势（加载中/失效页不接管）
  useEffect(() => {
    /* 监听挂在 window 上：这个 effect 在首次 mount 就跑，而那时还在 loading，
       wrapRef 是空的，挂在容器上等于没挂。整页本来就是这一个视图，挂 window 最稳。 */
    const scroller = () => document.querySelector('[data-tv-scroll]');
    const busy = () => !!document.querySelector('.mask');   // 反馈弹窗开着时不翻页
    const edge = dir => {                       // dir: 1 想去下一页 / -1 想回上一页
      const sc = scroller();
      if (!sc) return true;                     // 封面没有滚动区，直接翻
      const atTop = sc.scrollTop <= 2;
      const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 3;
      return dir > 0 ? atBottom : atTop;
    };
    const turn = dir => {
      if (!liveRef.current || busy()) return;
      const now = Date.now();
      if (now < lockRef.current) return;
      if (!edge(dir)) return;
      lockRef.current = now + 520;
      setI(v => Math.max(0, Math.min(totalRef.current - 1, v + dir)));
    };
    let y0 = 0, t0 = 0, moved = 0, s0 = 0;
    const onStart = e => {
      y0 = e.touches[0].clientY; t0 = Date.now(); moved = 0;
      const sc = scroller(); s0 = sc ? sc.scrollTop : -1;
    };
    const onMove = e => { moved = y0 - e.touches[0].clientY; };
    const onEnd = () => {
      const dt = Date.now() - t0;
      // 滑够 64px，或者滑得快（甩一下）也算
      if (Math.abs(moved) < 64 && !(Math.abs(moved) > 30 && dt < 260)) return;
      /* 这一下手指是把当前页的内容滚动了，那就只当滚动用，不顺手翻页。
         松手后再滑一次（此时内容已经在底/顶，滚不动了）才翻。 */
      const sc = scroller();
      if (sc && s0 >= 0 && sc.scrollTop !== s0) { moved = 0; return; }
      turn(moved > 0 ? 1 : -1);
      moved = 0;
    };
    let wheelAcc = 0, wheelTimer = null;
    const onWheel = e => {                      // 桌面：攒够滚动量再翻，触控板不会一碰就跳
      wheelAcc += e.deltaY;
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => { wheelAcc = 0; }, 180);
      if (Math.abs(wheelAcc) < 90) return;
      const dir = wheelAcc > 0 ? 1 : -1;
      wheelAcc = 0;
      turn(dir);
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      liveRef.current = false;
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('wheel', onWheel);
      clearTimeout(wheelTimer);
    };
  }, []);
  /* 换页后把新页面的滚动位置归零，否则从长页翻过去会停在中间 */
  useEffect(() => {
    const sc = document.querySelector('[data-tv-scroll]');
    if (sc) sc.scrollTop = 0;
  }, [i]);
  if (loading) return <div className="empty" style={{ paddingTop: 200 }}>正在打开你的专属行程…</div>;
  if (!d || d.err) return <div className="empty" style={{ paddingTop: 200 }}><div className="ic">◎</div>链接已失效，请联系你的顾问</div>;
  const p = d.plan;
  if (!p) return <div className="empty" style={{ paddingTop: 200 }}>行程还在生成中，稍后再看</div>;
  /* 这份行程长什么样由 UOM 里套用的模板决定：哪些模块出现、小标题叫什么、配色与版式。
     拿不到模板时一律回落成原来的样子，客人端不会因为模板没配就白屏。 */
  const T = d.tpl || null;
  const mod = k => (T && T.modules ? T.modules.find(m => m.key === k) : null);
  const on = k => { const m = mod(k); return m ? !!m.on : true; };
  const mname = (k, def) => { const m = mod(k); return (m && m.name) || def; };
  const sk = { hl: '#1f6f74', warm: '#b4762a', cover: 'photo', density: 'normal', radius: 'round', ...(T && T.skin ? T.skin : {}) };
  const CP = sk.density === 'compact';
  const R = sk.radius === 'square' ? 3 : 10;
  const SKV = { '--t-hl': sk.hl, '--t-warm': sk.warm, '--t-hl-soft': tmix(sk.hl, .9),
    '--t-cov': `linear-gradient(135deg, ${tdark(sk.hl, .42)}, ${sk.hl})`, '--t-r': R + 'px' };
  const dayList = on('days') ? p.days : [];
  const showCover = on('cover');
  const pages = [...(showCover ? ['cover'] : []), ...dayList.map((x, j) => 'd' + j), 'quote'];
  const total = pages.length;
  totalRef.current = total;   // 手势翻页那个 effect 靠它拿到最新页数
  liveRef.current = true;
  const pax = d.adults + d.children + d.elders;
  const send = async () => {
    if (!text.trim()) return toast('写一句你的想法');
    try {
      await post(`/api/trip/${token}/feedback`, { d: fb.d, target: fb.target, text: text.trim() });
      toast('已发给你的顾问'); setFb(null); setText(''); reload();
    } catch (e) { toast(e.message); }
  };
  const go = n => setI(Math.max(0, Math.min(total - 1, n)));
  const PreviewTag = () => (preview
    ? <div style={{ position: 'absolute', left: 0, right: 0, top: 'calc(6px + env(safe-area-inset-top))',
        zIndex: 40, textAlign: 'center', pointerEvents: 'none' }}>
        <span style={{ fontSize: 10.5, letterSpacing: '.14em', padding: '3px 12px', borderRadius: 999,
          background: 'rgba(20,16,10,.62)', color: '#e8cf9a', backdropFilter: 'blur(6px)' }}>
          销售预览 · 客人看到的就是这一版</span>
      </div>
    : null);



  const Cover = () => (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--t-cov)' }}>
      {sk.cover !== 'gradient' && <img src={img(p.cover, 1200)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      <div style={{ position: 'absolute', inset: 0, background: sk.cover === 'gradient'
        ? 'linear-gradient(180deg,rgba(0,0,0,.12),rgba(0,0,0,.42))'
        : 'linear-gradient(180deg,rgba(8,12,11,.5),rgba(8,12,11,.18) 40%,rgba(8,12,11,.88))' }} />
      {sk.cover === 'video' && <div style={{ position: 'absolute', top: 'calc(50px + env(safe-area-inset-top))', right: 16,
        fontSize: 11, color: '#fff', background: 'rgba(0,0,0,.35)', padding: '3px 10px', borderRadius: 999 }}>视频封面</div>}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: CP ? '0 22px 66px' : '0 26px 76px', color: '#fff', textAlign: 'center' }}>
        <div className="tk" style={{ color: '#fff', opacity: .9 }}>{d.shop || 'U-DESIGN 优定制'}</div>
        <h1 className="serif" style={{ fontSize: 'clamp(27px,7vw,40px)', fontWeight: 400, margin: '12px 0 10px', lineHeight: 1.22 }}>{p.route}</h1>
        <p style={{ fontSize: 14, opacity: .88, margin: '0 0 18px' }}>{p.tagline}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 22 }}>
          {[`${d.days} 天`, `${pax} 人`, d.go_date || '日期待定'].map(t =>
            <span key={t} style={{ fontSize: 12, padding: '4px 13px', borderRadius: 999, border: '1px solid rgba(255,255,255,.3)' }}>{t}</span>)}
        </div>
        <div style={{ fontSize: 12.5, opacity: .7 }}>为 {d.customer} 专属定制 · 向下翻看每日安排</div>
        {/* 顾问改过行程之后这里的时间会往前走 —— 不然内容悄悄变了，
            客人不知道自己看的是不是最新那一版 */}
        {d.updated_at && (
          <div style={{ fontSize: 11.5, opacity: .55, marginTop: 7 }}>
            {d.updated_by || '顾问'} 最近更新于 {String(d.updated_at).slice(5, 16)}
          </div>)}
      </div>
    </div>
  );
  const Day = ({ day }) => (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--paper)' }}>
      <div style={{ flex: '0 0 44%', position: 'relative', overflow: 'hidden' }}>
        {day.pic && <img src={img(day.pic, 900)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,.34),transparent 45%,rgba(247,245,241,.96))' }} />
        <div style={{ position: 'absolute', left: 24, right: 24, bottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span className="serif" style={{ fontSize: CP ? 34 : 42, color: 'var(--t-hl)', lineHeight: 1 }}>{String(day.d).padStart(2, '0')}</span>
            <div><div className="tk">DAY {day.d} · {day.city}</div>
              <h2 className="serif" style={{ fontSize: 21, fontWeight: 400, margin: '2px 0 0' }}>{day.title}</h2></div>
          </div>
        </div>
      </div>
      <div data-tv-scroll style={{ flex: 1, overflowY: 'auto', padding: CP ? '12px 20px 76px' : '16px 24px 80px', fontSize: CP ? 13.4 : 14 }}>
        {day.items.map((x, j) => (
          <div key={j} style={{ display: 'flex', gap: 11, marginBottom: 11 }}>
            <span style={{ flex: '0 0 20px', color: 'var(--t-hl)', fontSize: 12, paddingTop: 2 }}>0{j + 1}</span>
            <span style={{ fontSize: CP ? 13.2 : 14, lineHeight: CP ? 1.62 : 1.72, flex: 1 }}>{x}</span>
          </div>
        ))}
        <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          {[[mname('stay', '住宿'), day.hotel, 'star', on('stay')], ['餐食', day.meals, 'heart', true],
            ['参考车程', day.drive, 'car', !!day.drive],
            [mname('feature', '特色体验'), day.exp, 'sparkle', on('feature')], [mname('food', '当地美食'), day.food, 'tag', on('food')]]
            .filter(x => x[1] && x[3]).map(([k, v, ic]) => (
              <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 9 }}>
                <Icon n={ic} s={14} c="var(--t-hl)" style={{ marginTop: 3 }} />
                <div style={{ flex: 1 }}><b style={{ fontSize: 12.5 }}>{k}</b>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 1 }}>{v}</div></div>
                <button className="btn btn-o btn-xs" onClick={() => setFb({ d: day.d, target: k })}>提意见</button>
              </div>
            ))}
          <button className="btn btn-o btn-s" style={{ width: '100%', marginTop: 6 }} onClick={() => setFb({ d: day.d, target: '行程' })}>
            <Icon n="pen" s={13} />对这一天的安排提意见</button>
        </div>
        {(d.feedback || []).filter(f => f.d === day.d).map(f => (
          <div key={f.id} style={{ marginTop: 10, background: 'var(--t-hl-soft)', border: '1px solid var(--t-hl-soft)', borderRadius: R, padding: '9px 12px', fontSize: 12.5 }}>
            <b style={{ color: 'var(--t-warm)' }}>你提过（{f.target}）：</b>{f.text}
          </div>
        ))}
      </div>
    </div>
  );
  const q = d.quote || {};
  const Quote = () => (
    <div data-tv-scroll style={{ position: 'absolute', inset: 0, background: `linear-gradient(165deg, ${tdark(sk.hl, .74)}, ${tdark(sk.hl, .52)})`, color: '#fff', overflowY: 'auto', padding: CP ? '46px 22px 84px' : '54px 26px 90px' }}>
      <div className="tk" style={{ color: 'var(--t-warm)' }}>YOUR QUOTATION</div>
      <h2 className="serif" style={{ fontSize: 28, fontWeight: 400, margin: '10px 0 6px' }}>行程报价</h2>
      <p style={{ fontSize: 13, color: '#9fada8', margin: '0 0 24px' }}>{p.quote_note}</p>
      <div style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: R + 6, padding: CP ? '18px 18px' : '22px 22px' }}>
        <div style={{ fontSize: 12, color: '#9fada8' }}>行程总价</div>
        <div className="serif num" style={{ fontSize: CP ? 34 : 40, color: 'var(--t-warm)', lineHeight: 1.15 }}>{money(p.total)}</div>
        <div style={{ fontSize: 12.5, color: '#9fada8', marginTop: 4 }}>人均约 {money(Math.round(p.total / Math.max(1, pax)))}</div>
        {on('overview') && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,.1)' }}>
          {(p.highlights || []).map(h => <span key={h} style={{ fontSize: 11.5, padding: '4px 11px', borderRadius: Math.max(3, R - 4), background: 'rgba(255,255,255,.12)', color: 'var(--t-warm)' }}>{h}</span>)}
        </div>}
      </div>
      {/* 以下四块对标定制同行的报价单。这不是好看不好看的问题 ——
          什么没锁定、钱花在哪、司陪管到哪，讲不清楚行中和退改都要扯皮。 */}
      {!!(d.flights || []).length && (
        <div className="tq-sec">
          <h4>推荐航班</h4>
          {d.flights.map(f => (
            <div className="tq-fl" key={f.id}>
              <div className="h"><span className="d">Day {f.d}</span>{f.airline} {f.fno}
                {f.stop ? <em>经停 {f.stop}</em> : <em className="ok">直飞</em>}</div>
              <div className="b">
                <div className="c"><b>{f.dep_time}</b><i>{f.from_city}</i><s>{f.from_air}</s></div>
                <div className="ln"><span /><Icon n="send" s={13} c="var(--t-warm)" /><span /></div>
                <div className="c r"><b>{f.arr_time}</b><i>{f.to_city}</i><s>{f.to_air}</s></div>
              </div>
            </div>
          ))}
          <p className="tq-note">航班时间为当地时间，仅供参考；舱位与票价以出票当日查询为准。</p>
        </div>
      )}

      {!!(d.stays || []).length && (
        <div className="tq-sec">
          <h4>住宿安排</h4>
          {d.stays.map((h, i) => (
            <div className="tq-st" key={i}>
              <span className="d">Day {h.from}{h.to > h.from ? '–' + h.to : ''}</span>
              <div className="t"><b>{h.hotel}</b><i>{h.city}</i></div>
            </div>
          ))}
        </div>
      )}

      {!!(q.notice || []).length && (
        <div className="tq-sec warn">
          <h4>报价说明</h4>
          <div className="tq-basis">本报价按 <b>{pax} 人</b> · <b>{d.days} 天</b>
            {d.go_date ? <> · <b>{d.go_date}</b> 出发</> : null} 核算</div>
          <ol className="tq-ol">{q.notice.map((x, i) => <li key={i}>{x}</li>)}</ol>
        </div>
      )}

      <div className="tq-sec">
        <h4>费用包含</h4>
        <div className="tq-kv">
          {(q.fee_inc || []).map((x, i) => (
            <div key={i}><b>{x.k}</b><p>{x.v}</p></div>
          ))}
        </div>
        <h4 style={{ marginTop: 18 }}>费用不含</h4>
        <ul className="tq-ul">{(q.fee_exc || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
      </div>

      {!!(q.standard || []).length && (
        <div className="tq-sec">
          <h4>接待标准</h4>
          <div className="tq-kv">
            {q.standard.map((x, i) => (<div key={i}><b>{x.k}</b><p>{x.v}</p></div>))}
          </div>
        </div>
      )}
      <div style={{ marginTop: 26, padding: '16px 18px', background: 'rgba(255,255,255,.05)', borderRadius: 13 }}>
        <div style={{ fontSize: 13, marginBottom: 10 }}>有想调整的地方？直接在每天的页面上点「提意见」，
          你的顾问{d.sales_name ? `（${d.sales_name}）` : ''}会按你的意见重新排一版。</div>
        <button className="btn btn-g" style={{ width: '100%' }} onClick={() => setFb({ d: 0, target: '整体' })}>
          <Icon n="chat" s={15} c="#fff" />对整体行程说点什么</button>
      </div>
      <div style={{ textAlign: 'center', marginTop: 30, fontSize: 11.5, color: '#66736f' }}>
        {d.shop} · 本报价为方案阶段参考价，最终以合同为准
      </div>
    </div>
  );

  const cur = pages[i] || 'quote';
  return (<div ref={wrapRef} style={{ position: 'absolute', inset: 0, background: 'var(--paper)', overflow: 'hidden', ...SKV }}>
    <PreviewTag />
    <div style={{ position: 'absolute', inset: 0 }}>
      {onBack && <div style={{ position: 'absolute', left: 14, top: 50, zIndex: 9 }}>
        <div className="mi-back" onClick={onBack}><Icon n="back" s={15} c="#fff" /></div></div>}
      {cur === 'cover' ? <Cover /> : cur === 'quote' ? <Quote /> : <Day day={dayList[+cur.slice(1)]} />}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px calc(14px + env(safe-area-inset-bottom))',
        display: 'flex', alignItems: 'center', gap: 12, background: 'linear-gradient(180deg,transparent,rgba(0,0,0,.35))', pointerEvents: 'none' }}>
        <button onClick={() => go(i - 1)} disabled={i === 0} style={{ pointerEvents: 'auto', width: 38, height: 38, borderRadius: '50%',
          background: 'rgba(255,255,255,.92)', display: 'grid', placeItems: 'center', boxShadow: '0 4px 14px rgba(0,0,0,.2)', opacity: i === 0 ? .35 : 1 }}>
          <Icon n="up" s={17} /></button>
        <div data-tv-page={i + 1} style={{ flex: 1, textAlign: 'center', fontSize: 12, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,.6)' }}>
          {i + 1} / {total}
          {i < total - 1 && <div style={{ fontSize: 10, opacity: .72, marginTop: 2 }}>上滑看下一页</div>}
        </div>
        <button onClick={() => go(i + 1)} disabled={i === total - 1} style={{ pointerEvents: 'auto', width: 38, height: 38, borderRadius: '50%',
          background: 'rgba(255,255,255,.92)', display: 'grid', placeItems: 'center', boxShadow: '0 4px 14px rgba(0,0,0,.2)', opacity: i === total - 1 ? .35 : 1 }}>
          <Icon n="down" s={17} /></button>
      </div>
    </div>
    <Modal open={!!fb} onClose={() => setFb(null)} title="说说你的想法" sub={fb ? (fb.d ? `第 ${fb.d} 天 · ${fb.target}` : '整体行程') : ''} width={420}>
      <textarea className="inp" rows={4} value={text} onChange={e => setText(e.target.value)}
        placeholder="例：这家酒店想换成带泳池的；这天节奏有点满，想留半天自由活动" />
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button className="btn btn-o" style={{ flex: 1 }} onClick={() => setFb(null)}>取消</button>
        <button className="btn btn-p" style={{ flex: 1 }} onClick={send}>发给我的顾问</button>
      </div>
    </Modal>
  </div>);
}

/* skin 派生色：和白色混出浅底、压暗出封面渐变，算法与 OPC 客人页一致 */
function trgb(hex) { const h = /^#([0-9a-f]{6})$/i.test(hex || '') ? hex.slice(1) : '1f6f74';
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
function tmix(hex, p) { const [r, g, b] = trgb(hex); const f = v => Math.round(v + (255 - v) * p); return `rgb(${f(r)},${f(g)},${f(b)})`; }
function tdark(hex, p) { const [r, g, b] = trgb(hex); const f = v => Math.round(v * (1 - p)); return `rgb(${f(r)},${f(g)},${f(b)})`; }
