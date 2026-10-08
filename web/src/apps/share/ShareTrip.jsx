/* ============ 销售分享给客人的行程详情页 ============
   和小程序里的产品详情（TOC 视角）不是一个东西。客人从销售手里拿到这个链接时，
   要回答的是四个问题：多少钱、哪天走、每天吃住行怎么安排、这单现在走到哪一步。
   所以这一页比 TOC 版多了：顶部三步进度、按人数算好的总价、
   每天的三餐 / 交通 / 酒店。参照 6 人游销售分享页的信息结构。 */
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { get, post, money0 } from '../../shared/api.js';
import { Icon, useData, useToast } from '../../shared/ui.jsx';
import { img } from '../../shared/img.js';
import './share.css';

const STEPS = ['行程报价', '签约合同', '支付订单'];

export default function ShareTrip() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const qs = ['pax', 'child', 'date', 'step', 'sales'].map(k => (sp.get(k) ? `${k}=${encodeURIComponent(sp.get(k))}` : ''))
    .filter(Boolean).join('&');
  const { d, loading } = useData(() => get(`/api/share/product/${id}${qs ? '?' + qs : ''}`), [id, qs]);
  /* 12 天的行程一条条铺开要翻十几屏，客人很难一眼看出「每天去哪」。
     默认全部收起，只露出每天的大标题与三餐摘要；点哪天展开哪天。 */
  const [open, setOpen] = useState({});
  const [cur, setCur] = useState(0);        // 吸顶日期条上高亮哪一天
  const [toc, setToc] = useState(false);
  /* 客人看完得能往下走：底部常驻「联系顾问 + 就要这个行程」，
     点后填手机号就落成咨询单，顾问在 CSP 里直接看到来源与产品。 */
  const [ord, setOrd] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const scRef = useRef(null);
  const dayRefs = useRef({});

  /* 回到顶部按钮：滚过一屏才出现 */
  const [up, setUp] = useState(false);
  useEffect(() => {
    const el = scRef.current;
    if (!el) return;
    const on = () => setUp(el.scrollTop > 600);
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, [d]);

  /* 吸顶日期条跟着滚动高亮：取第一个还没滚过判定线的那天 */
  useEffect(() => {
    const el = scRef.current;
    if (!el || !d) return;
    const on = () => {
      const base = el.getBoundingClientRect().top + 92;
      let k = 0;
      Object.keys(dayRefs.current).forEach(i => {
        const n = dayRefs.current[i];
        if (n && n.getBoundingClientRect().top <= base) k = Number(i);
      });
      setCur(k);
    };
    el.addEventListener('scroll', on, { passive: true });
    on();
    return () => el.removeEventListener('scroll', on);
  }, [d]);

  if (loading) return <div className="sh-wrap"><div className="sh-empty">正在打开行程…</div></div>;
  if (!d || d.err) return <div className="sh-wrap"><div className="sh-empty">
    <div className="ic">◎</div>{(d && d.err) || '链接已失效，请联系您的顾问'}</div></div>;

  const days = d.days_detail || [];
  const allOpen = days.length > 0 && days.every((_, i) => open[i]);
  const toggle = i => setOpen(o => ({ ...o, [i]: !o[i] }));
  const toggleAll = () => setOpen(allOpen ? {} : Object.fromEntries(days.map((_, i) => [i, true])));
  /* 跳到某一天：顺手展开它，省得客人点完还要再点一次 */
  const goDay = i => {
    setToc(false);
    setOpen(o => ({ ...o, [i]: true }));
    setTimeout(() => {
      const el = dayRefs.current[i], sc = scRef.current;
      if (!el || !sc) return;
      sc.scrollTo({ top: sc.scrollTop + el.getBoundingClientRect().top - sc.getBoundingClientRect().top - 86, behavior: 'smooth' });
    }, 40);
  };

  return (<div className="sh-wrap">
    {/* 顶部进度：客人一眼知道这单走到哪一步了 */}
    <div className="sh-steps">
      {STEPS.map((t, i) => (
        <div key={t} className={'s' + (i === d.step ? ' on' : '') + (i < d.step ? ' done' : '')}>{t}</div>
      ))}
    </div>

    <div className="sh-sc" ref={scRef}>
      <div className="sh-hero">
        {d.cover && <img src={img(d.cover, 1200)} alt="" />}
        <div className="mask" />
      </div>

      <div className="sh-card sh-head">
        <h1>{d.title}</h1>
        {d.subtitle && <p className="sub">{d.subtitle}</p>}
        <div className="price">
          <em>¥</em><b>{money0(d.quote.total)}</b>
          <s>（{d.quote.pax} 人{d.quote.child ? ` + ${d.quote.child} 儿童` : ''}总价）</s>
        </div>
        <div className="kv">
          <div><i>出行人数</i><b>{d.quote.pax + d.quote.child} 人</b></div>
          <div><i>出行天数</i><b>{d.days} 天</b></div>
          <div><i>出行日期</i><b>{d.go_date ? d.go_date.replace(/-/g, '.') : '待定'}</b></div>
          <div><i>出发城市</i><b>{d.from_city}</b></div>
        </div>
        <div className="ptip">单价 {money0(d.quote.adult)} / 成人
          {d.quote.child ? ` · ${money0(d.quote.childPrice)} / 儿童` : ''} · 最终报价以签约为准</div>
      </div>

      {!!(d.highlights || []).length && (
        <div className="sh-card">
          <div className="sh-h">行程亮点</div>
          <ul className="sh-hl">{d.highlights.map((h, i) => <li key={i}>{typeof h === 'string' ? h : h.t}</li>)}</ul>
        </div>
      )}

      {!!(d.spots || []).length && (
        <div className="sh-card">
          <div className="sh-h">特色景点</div>
          <div className="sh-spots">
            {d.spots.map((x, i) => (
              <div className="it" key={i}>
                <div className="im">{(d.gallery || [])[i % Math.max(1, (d.gallery || []).length)]
                  ? <img src={img((d.gallery || [])[i % d.gallery.length], 600)} alt="" /> : null}</div>
                <b>{x.n || x.name}</b>
                <i>{x.c || x.city || d.dest}</i>
              </div>))}
          </div>
        </div>
      )}

      {/* 吸顶日期条：翻到第几天一眼可见，点哪天跳哪天。
          12 天的行程不给这条，客人只能一路往下滑。 */}
      <div className="sh-rail">
        <div className="ls">
          {days.map((x, i) => (
            <button key={i} className={cur === i ? 'on' : ''} onClick={() => goDay(i)}>
              D{x.d}<i>{x.city || ''}</i></button>))}
        </div>
      </div>

      <div className="sh-card sh-days">
        <div className="sh-h">行程详情<s>共 {days.length} 天</s>
          <a className="xp" onClick={toggleAll}>{allOpen ? '全部收起' : '全部展开'}</a></div>
        {days.map((x, i) => {
          const op = !!open[i];
          return (
          <div className={'dy' + (op ? ' sh-on' : '')} key={i} ref={el => { dayRefs.current[i] = el; }}>
            {/* 收起时这一行就是「当天概览」：第几天、去哪、几项安排、三餐、住哪 */}
            <div className="dh" onClick={() => toggle(i)}>
              <div className="no"><b>{x.d}</b><i>Day</i></div>
              <div className="tx">
                {x.date && <div className="dt">{x.date}</div>}
                <div className="rt">{x.leg ? `${x.leg.from} → ${x.leg.to}` : x.city}</div>
                {x.title && <div className="ti">{x.title}</div>}
              </div>
              <span className="ar">{op ? '收起' : '展开'}</span>
            </div>

            {/* 三餐：客人最先找的就是这一行，收起时也留着 */}
            <div className="meals" onClick={() => !op && toggle(i)}>
              {x.meals.map(m => (
                <span key={m.k} className={m.v === '敬请自理' ? 'off' : ''}>{m.k} · {m.v}</span>))}
              {!op && x.hotel && <span className="hb">住 · {x.hotel}</span>}
              {!op && !!x.spotN && <span className="hb">{x.spotN} 项安排</span>}
            </div>

            {op && (<>
              {x.leg && (
                <div className={'leg ' + x.leg.kind}>
                  <span className="ic"><Icon n={x.leg.kind === 'flight' ? 'send' : 'car'} s={13} /></span>
                  <div><b>{x.leg.from} → {x.leg.to}</b><i>{x.leg.note}</i></div>
                </div>
              )}

              {!!x.items.length && (
                <ul className="items">{x.items.map((t, j) => <li key={j}>{t}</li>)}</ul>
              )}

              {x.pic && <div className="dpic"><img src={img(x.pic, 900)} alt="" loading="lazy" /></div>}

              <div className="stay">
                <div className="l"><i>住宿</i><b>{x.hotel || '待定'}</b></div>
                {x.sameHotel && <span className="same">同上一天酒店</span>}
              </div>
              {(x.exp || x.food) && (
                <div className="extra">
                  {x.exp && <span>体验 · {x.exp}</span>}
                  {x.food && <span>美食 · {x.food}</span>}
                </div>
              )}
            </>)}
          </div>);
        })}
      </div>

      {d.extra && (
        <div className="sh-card">
          <div className="sh-h">费用与须知</div>
          <div className="sh-rich rich-view" dangerouslySetInnerHTML={{ __html: d.extra }} />
        </div>
      )}

      <div className="sh-foot sh-foot-pad">
        {d.sales ? `您的定制顾问 ${d.sales} · ` : ''}{d.shop}<br />
        本页为专属行程方案，报价与安排以签约合同为准
      </div>
    </div>

    {/* 底部常驻行动条：这一页是销售发出去的，客人看完要有地方说「就它了」。
        按顶部进度给不同主行动——还在报价阶段就是确认意向，已经在签约/支付阶段
        就引导联系顾问，不自造一个系统里不存在的支付入口。 */}
    <div className="sh-bar">
      <a className="l" href={'tel:' + (d.tel || '4001005588')}>
        <Icon n="chat" s={16} /><span>联系顾问</span></a>
      <button className="p" onClick={() => setOrd({
        customer: '', phone: '', pax: d.quote.pax, child: d.quote.child,
        date: d.go_date || '', note: '',
      })}>{d.step === 0 ? '就要这个行程' : d.step === 1 ? '确认方案，准备签约' : '确认订单信息'}</button>
    </div>

    {ord && (
      <div className="sh-dlg" onClick={e => e.target === e.currentTarget && setOrd(null)}>
        <div className="bd">
          <div className="hd"><b>确认出行信息</b><span onClick={() => setOrd(null)}>关闭</span></div>
          <div className="fm">
            <label><s>称呼<em>*</em></s>
              <input value={ord.customer} placeholder="怎么称呼您"
                onChange={e => setOrd(o => ({ ...o, customer: e.target.value }))} /></label>
            <label><s>手机号<em>*</em></s>
              <input value={ord.phone} inputMode="tel" maxLength={11} placeholder="顾问将与您电话确认"
                onChange={e => setOrd(o => ({ ...o, phone: e.target.value.replace(/\D/g, '') }))} /></label>
            <label><s>出行日期</s>
              <input type="date" value={ord.date}
                onChange={e => setOrd(o => ({ ...o, date: e.target.value }))} /></label>
            <div className="two">
              <label><s>成人</s>
                <input type="number" min="1" value={ord.pax}
                  onChange={e => setOrd(o => ({ ...o, pax: Math.max(1, +e.target.value || 1) }))} /></label>
              <label><s>儿童</s>
                <input type="number" min="0" value={ord.child}
                  onChange={e => setOrd(o => ({ ...o, child: Math.max(0, +e.target.value || 0) }))} /></label>
            </div>
            <label><s>补充需求</s>
              <textarea rows={3} value={ord.note} placeholder="如房型偏好、饮食忌口、想加的景点"
                onChange={e => setOrd(o => ({ ...o, note: e.target.value }))} /></label>
          </div>
          <div className="sum">
            <i>参考总价</i>
            <b>{money0(d.quote.adult * ord.pax + d.quote.childPrice * ord.child)}</b>
            <s>以顾问最终确认为准</s>
          </div>
          <button className="go" disabled={busy} onClick={async () => {
            if (!ord.customer.trim()) return toast('请填写称呼');
            if (!/^1\d{10}$/.test(ord.phone)) return toast('请填写正确的手机号');
            setBusy(true);
            try {
              const r = await post('/api/share/order', { ...ord, productId: d.id });
              setOrd(null); setDone(r.no);
            } catch (e) { toast(e.message); } finally { setBusy(false); }
          }}>{busy ? '提交中…' : '提交，等顾问联系我'}</button>
          <div className="tip">提交后顾问将在 1 个工作日内与您电话确认行程与报价</div>
        </div>
      </div>
    )}

    {done && (
      <div className="sh-dlg" onClick={e => e.target === e.currentTarget && setDone(null)}>
        <div className="bd ok">
          <div className="tick"><Icon n="check" s={26} c="#1c140c" sw={2.4} /></div>
          <b>已收到您的出行意向</b>
          <p>单号 {done}<br />定制顾问将在 1 个工作日内与您电话确认行程细节与最终报价。</p>
          <button className="go" onClick={() => setDone(null)}>知道了</button>
        </div>
      </div>
    )}

    {/* 右侧悬浮：目录 + 回顶部，长行程翻起来才不费劲 */}
    <div className="sh-fab">
      <button onClick={() => setToc(true)} aria-label="行程目录"><Icon n="map" s={17} /></button>
      {up && <button onClick={() => scRef.current && scRef.current.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="回到顶部">↑</button>}
    </div>

    {toc && (
      <div className="sh-toc" onClick={e => e.target === e.currentTarget && setToc(false)}>
        <div className="bd">
          <div className="hd"><b>行程目录</b><span onClick={() => setToc(false)}>关闭</span></div>
          <div className="ls">
            {days.map((x, i) => (
              <div className="it" key={i} onClick={() => goDay(i)}>
                <i>D{x.d}</i>
                <div><b>{x.leg ? `${x.leg.from} → ${x.leg.to}` : x.city}</b><s>{x.title}</s></div>
                {x.date && <em>{x.date.slice(5)}</em>}
              </div>))}
          </div>
        </div>
      </div>
    )}
  </div>);
}
