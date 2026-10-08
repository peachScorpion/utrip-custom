import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post, del, money, money0, ST_CN } from '../../shared/api.js';
import { Icon, useToast, useData, Modal, AdmBurger } from '../../shared/ui.jsx';
import { OrderList } from '../../shared/Orders.jsx';
import '../uom/uom.css';
import '../../shared/orders.css';
import { usePage } from '../../shared/route.js';

const VENDORS = [['V01', '欧睿地接 · 南欧中心'], ['V02', '北欧极光 DMC'], ['V03', '阿尔卑斯旅业'],
  ['V04', '不列颠深度游'], ['V05', '和风（东瀛）'], ['V06', '环球精选资源池']];
const CATS = ['地接车导', '酒店', '门票与体验', '餐食', '其他'];
const ST = { pending: ['待接单', 'p-pending'], taken: ['已接单·核资源', 'p-taken'], quoted: ['已报价', 'p-quoted'], won: ['已中选', 'p-won'], lost: ['未选中', 'p-lost'] };

/* ---------- 报价工作台 ----------
   供应商按客人需求单报价：左边看门店给的逐天行程，右边出分项价。
   v48 起分项价不再手填毛数——从平台地接资源库里挑具体资源（哪家酒店的哪个房型、
   哪个景点的哪种票、哪种车型），数量按需求单的人数与天数自动推算，
   分项金额＝所选资源小计之和；确实不在库里的，仍可手填兜底。 */

/* 资源类型 → 报价分项 */
const CATE_OF = { car: '地接车导', guide: '地接车导', hotel: '酒店', ticket: '门票与体验', exp: '门票与体验', dining: '餐食', other: '其他' };
const CATE_TYPES = { '地接车导': ['car', 'guide'], '酒店': ['hotel'], '门票与体验': ['ticket', 'exp'], '餐食': ['dining'], '其他': ['other'] };
const TYPE_CN = { hotel: '酒店', ticket: '门票', car: '用车', dining: '餐厅', guide: '导游', exp: '体验', other: '其他' };
const TYPE_IC = { hotel: 'bed', ticket: 'tag', car: 'car', dining: 'dish', guide: 'users', exp: 'sparkle', other: 'box' };

/* 数量按计价单位推算：间夜＝房间数×晚数，人次＝出行人数，按天＝行程天数，其余按次 */
function qtyOf(unit, pax, days) {
  const rooms = Math.max(1, Math.ceil(pax / 2)), nights = Math.max(1, days - 1);
  switch (unit) {
    case '间夜': return rooms * nights;
    case '间': return rooms;
    case '人': return pax;
    case '张': return pax;
    case '天': case '辆天': return Math.max(1, days);
    case '台': return rooms;
    case '桌': return Math.max(1, Math.ceil(pax / 10));
    default: return 1;                       // 次 / 团 / 场 / 艘次 / 半天 / 小时
  }
}
const QTY_TIP = { 间夜: '房间数 × 晚数', 间: '房间数', 人: '出行人数', 张: '出行人数', 天: '行程天数', 辆天: '行程天数', 台: '房间数', 桌: '按 10 人一桌' };

function QuoteDesk({ no, vendor, onClose, onDone }) {
  const toast = useToast();
  const { d: c, loading } = useData(() => get(`/api/ubk/consult/${no}?vendor=${vendor}`), [no, vendor]);
  const [items, setItems] = useState(CATS.map(n => ({ n, v: 0, manual: 0 })));
  const [picks, setPicks] = useState([]);
  const [notes, setNotes] = useState({});
  const [memo, setMemo] = useState('');
  const [day, setDay] = useState(0);
  const [picking, setPicking] = useState(null);     // 正在给哪个分项选资源
  const [busy, setBusy] = useState(false);
  /* 行程改成平铺滚动：上面的 D1…Dn 只是跳转锚点，滚到哪天就高亮哪天 */
  const tripRef = useRef(null);
  const dayRefs = useRef([]);
  const onTripScroll = () => {
    const box = tripRef.current; if (!box) return;
    const top = box.getBoundingClientRect().top;
    let cur = 0;
    dayRefs.current.forEach((el, i) => { if (el && el.getBoundingClientRect().top - top <= 12) cur = i; });
    // 滚到底时最后几天都在视口里，直接高亮最后一天，不然锚点会停在中间那天
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4) cur = dayRefs.current.filter(Boolean).length - 1;
    setDay(Math.max(0, cur));
  };

  useEffect(() => {
    if (!c) return;
    if ((c.picks || []).length) {                    // 二次报价：回填上次选的资源
      setPicks(c.picks.map(p => ({ ...p, key: p.res_id + '-' + p.unit_id })));
    }
    /* 预估值只是没选资源时的兜底：选了资源就按资源合计走，手动改过输入框才锁成手填 */
    const base = Math.round((c.quote || 60000) * 0.66);
    setItems(CATS.map(n => {
      const r = { '地接车导': .32, '酒店': .41, '门票与体验': .18, '餐食': .09, '其他': 0 }[n] || 0;
      return { n, v: Math.round(base * r), manual: 0 };
    }));
    setMemo(c.quotes?.find(q => q.supplier_id === vendor)?.memo || '');
  }, [c, vendor]);

  const pax = c ? Math.max(1, c.adults + c.children + c.elders) : 1;
  const days = c ? (c.days || 1) : 1;
  /* 分项金额：手填过的用手填值，其余按所选资源小计汇总 */
  const sumOf = n => picks.filter(p => p.cate === n).reduce((a, p) => a + Math.round((+p.cost || 0) * (+p.qty || 1)), 0);
  const rows = useMemo(() => items.map(it => {
    const s = sumOf(it.n);
    // 手填优先；没手填过的，有资源按资源合计，没资源保留预估值
    return { ...it, res: s, v: it.manual ? (+it.v || 0) : (s > 0 ? s : (+it.v || 0)) };
  }), [items, picks]);
  const total = rows.reduce((a, b) => a + (+b.v || 0), 0);

  if (loading || !c) return <Modal open onClose={onClose} title="载入中…"><div className="empty">正在打开…</div></Modal>;
  const plan = c.cur;

  const addPick = (r, u, isNewRate) => {
    const key = r.id + '-' + u.id;
    if (picks.some(p => p.key === key)) return toast('这条已经选过了');
    setPicks(a => [...a, {
      key, cate: CATE_OF[r.type], res_id: r.id, unit_id: u.id, res_type: r.type, res_name: r.name,
      unit_name: u.name, spec: u.spec || '', city: r.city || '', unit: u.unit,
      cost: u.cost, qty: qtyOf(u.unit, pax, days), memo: '',
      saveRate: isNewRate ? 1 : 0,        // 现填的价，提交报价时回存到资源库，下次自动带出
    }]);
    toast(isNewRate ? `已加入「${CATE_OF[r.type]}」，你填的价会存进资源库` : `已加入「${CATE_OF[r.type]}」`);
  };
  const setQty = (key, q) => setPicks(a => a.map(p => p.key === key ? { ...p, qty: Math.max(0, +q || 0) } : p));
  const delPick = key => setPicks(a => a.filter(p => p.key !== key));
  const setManual = (n, v) => setItems(a => a.map(x => x.n === n ? { ...x, v: +v || 0, manual: 1 } : x));
  const unManual = n => setItems(a => a.map(x => x.n === n ? { ...x, manual: 0 } : x));

  const submit = async () => {
    if (!total) return toast('先选资源或填上分项价');
    const noRes = rows.filter(r => r.v > 0 && !r.res).map(r => r.n);
    const tip = noRes.length ? `\n（${noRes.join('、')} 是手填的，没有对应资源明细）` : '';
    if (!window.confirm(`确认提交报价 ¥${total.toLocaleString()}（¥${Math.round(total / pax).toLocaleString()}/人）给门店吗？${tip}`)) return;
    setBusy(true);
    try {
      await post('/api/ubk/quote', {
        no, vendor, total, memo,
        items: rows.map(r => ({ n: r.n, v: r.v })),
        picks: picks.map(({ key, ...p }) => p),
        dayNotes: Object.entries(notes).map(([d, t]) => ({ d: +d, t })),
      });
      toast('报价已提交，门店那边马上能看到'); onDone();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };

  return (<Modal open onClose={onClose} width={1240}
    title={<span className="mono" style={{ fontSize: 16 }}>{c.no}</span>}
    sub={`${c.dest} · ${c.days}天 ${pax}人 · ${c.go_date || '日期待定'} · 来自 ${c.shop}`}>
    <div className="qd-wrap">
      <div className="qd-left">
        {picking
          ? <ResPicker cate={picking} country={c.country || ''} destText={c.dest} pax={pax} days={days}
              vendor={vendor} chosen={picks} onAdd={addPick} onBack={() => setPicking(null)} />
          : (<>
            <div className="qd-th">
              <span className="tk">门店给的行程 · 逐天标注你的资源</span>
              <span className="t2">共 {(plan?.days || []).length} 天，往下滚可以一直看完</span>
            </div>
            <div className="qd-jump">
              {(plan?.days || []).map((d, i) => (
                <button key={i} className={'chip' + (day === i ? ' on' : '')} style={{ fontSize: 12 }}
                  onClick={() => { setDay(i); dayRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                  D{d.d}{notes[d.d] ? ' ●' : ''}</button>
              ))}
            </div>
            <div className="qd-trip" ref={tripRef} onScroll={onTripScroll}>
              {!(plan?.days || []).length && <div className="empty">门店还没出行程方案</div>}
              {(plan?.days || []).map((d, i) => (
                <div className="card qd-day" key={i} ref={el => dayRefs.current[i] = el}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 9 }}>
                    <span className="serif" style={{ fontSize: 20, color: 'var(--gold)' }}>D{d.d}</span>
                    <b style={{ fontSize: 14.5 }}>{d.title}</b><span className="tag" style={{ marginLeft: 'auto' }}>{d.city}</span>
                  </div>
                  <ul style={{ margin: '0 0 10px', padding: 0 }}>
                    {d.items.map((x, j) => <li key={j} style={{ listStyle: 'none', paddingLeft: 14, position: 'relative', fontSize: 12.8, color: '#4a5551', marginBottom: 5 }}>
                      <i style={{ position: 'absolute', left: 0, top: 8, width: 4, height: 4, borderRadius: '50%', background: 'var(--gold-2)' }} />{x}</li>)}
                  </ul>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    {[['住', d.hotel], ['餐', d.meals]].filter(x => x[1]).map(([k, v]) =>
                      <span key={k} style={{ fontSize: 11.5, color: 'var(--muted)', background: 'var(--paper)', padding: '3px 9px', borderRadius: 5 }}>{k} · {v}</span>)}
                  </div>
                  <div className="fld" style={{ marginBottom: 0 }}>
                    <label>这一天你的资源说明（门店与客人都能看到）</label>
                    <textarea className="inp" rows={2} value={notes[d.d] || ''} onChange={e => setNotes({ ...notes, [d.d]: e.target.value })}
                      placeholder="例：酒店改为 XX 四星，含双早；用车 7 座奔驰威霆，司兼导" />
                  </div>
                </div>
              ))}
            </div>
          </>)}
      </div>

      <div className="qd-side">
        <div className="card" style={{ padding: '15px 17px', marginBottom: 12 }}>
          <div className="tk" style={{ marginBottom: 4 }}>分项报价（结算价）</div>
          <div className="t2" style={{ marginBottom: 10 }}>从资源库选，数量按 {pax} 人 / {days} 天自动算；也可以直接手填。</div>
          {rows.map(it => {
            const my = picks.filter(p => p.cate === it.n);
            return (<div key={it.n} className="qc">
              <div className="qc-h">
                <b>{it.n}</b>
                {!!my.length && <span className="qc-n">{my.length} 项资源</span>}
                <input className="inp qc-v" type="number" value={it.v}
                  onChange={e => setManual(it.n, e.target.value)} />
                <button className="qc-add" onClick={() => setPicking(it.n)}>+ 选资源</button>
              </div>
              {it.manual && !!it.res && it.v !== it.res && <div className="qc-warn">
                手填 {money(it.v)}，与所选资源合计 {money(it.res)} 不一致
                <a onClick={() => unManual(it.n)}>按资源重算</a></div>}
              {!it.manual && !it.res && it.v > 0 && <div className="qc-est">
                还没选资源，这里是按门店对客报价估的毛数，选了资源会自动换成资源合计</div>}
              {my.map(p => (
                <div className="qc-r" key={p.key}>
                  <Icon n={TYPE_IC[p.res_type]} s={13} c="var(--muted-2)" />
                  <div className="qc-t">
                    <div className="n">{p.res_name}</div>
                    <div className="s">{p.unit_name}{p.spec ? ' · ' + p.spec : ''}{p.city ? ' · ' + p.city : ''}</div>
                  </div>
                  <span className="qc-p">{money(p.cost)}<i>/{p.unit}</i>
                    {p.saveRate ? <em className="qc-new">新价</em> : null}</span>
                  <input className="inp qc-q" type="number" value={p.qty} title={QTY_TIP[p.unit] || '数量'}
                    onChange={e => setQty(p.key, e.target.value)} />
                  <span className="qc-s">{money(Math.round(p.cost * p.qty))}</span>
                  <span className="qc-x" onClick={() => delPick(p.key)}><Icon n="x" s={13} /></span>
                </div>
              ))}
            </div>);
          })}

          {!!(c.selfItems || []).length && (
            <div style={{ background: 'var(--paper)', borderRadius: 9, padding: '10px 12px', marginTop: 8 }}>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 5 }}>以下由平台自供，本次报价<b>不含</b>：</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {c.selfItems.map(s => <span key={s} className="tag" style={{ fontSize: 11 }}>{s}</span>)}</div>
            </div>
          )}
          <hr className="hair" style={{ margin: '13px 0' }} />
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <div><div style={{ fontSize: 11.5, color: 'var(--muted)' }}>结算总价</div>
              <div className="serif num" style={{ fontSize: 24, color: '#a8781f' }}>{money(total)}</div></div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>人均</div>
              <div className="num" style={{ fontSize: 15, fontWeight: 600 }}>{money(Math.round(total / pax))}</div></div>
          </div>
          {!!picks.length && <div className="t2" style={{ marginTop: 6 }}>
            共选用 {picks.length} 条地接资源，门店和平台都能看到明细。</div>}
          <div className="fld" style={{ margin: '12px 0 0' }}><label>备注给门店</label>
            <textarea className="inp" rows={2} value={memo} onChange={e => setMemo(e.target.value)}
              placeholder="例：可锁 4 星以上，出发前 45 天定金 30%" /></div>
          <button className="btn btn-p" style={{ width: '100%', marginTop: 12 }} disabled={busy} onClick={submit}>
            {busy ? '提交中…' : '提交报价给门店'}</button>
        </div>
        <div className="card" style={{ padding: '14px 16px' }}>
          <div className="tk" style={{ marginBottom: 8 }}>需求速览</div>
          {[['客人预算', c.budget ? money(c.budget) : '未填'], ['门店对客报价', c.quote ? money(c.quote) : '—'],
            ['出行人数', `${c.adults}成人 ${c.children}儿童 ${c.elders}老人`], ['出发日期', c.go_date || '待定'],
            ['主题偏好', (c.prefs || []).join('、') || '—'], ['客人备注', c.note || '—']].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', fontSize: 12.5, marginBottom: 6 }}>
              <span style={{ color: 'var(--muted)', flex: '0 0 92px' }}>{k}</span><span style={{ flex: 1 }}>{v}</span></div>
          ))}
        </div>
      </div>
    </div>
  </Modal>);
}

/* ---------- 报价时从资源库挑资源 ----------
   按客人需求单的目的地预筛，只出启用中的资源与启用中的单元。
   无国别的通用资源（保险、随身 WiFi、行前物料）任何单子都能选到。 */
function ResPicker({ cate, country, destText, pax, days, vendor, chosen, onAdd, onBack }) {
  const types = CATE_TYPES[cate] || [];
  const [type, setType] = useState(types[0]);
  const [q, setQ] = useState('');
  const [wide, setWide] = useState(0);          // 1＝不限目的地
  const [myPrice, setMyPrice] = useState({});   // 还没给平台报过价的，在这里现填
  const { d: list, loading } = useData(
    () => get(`/api/res/pick?types=${type}&q=${encodeURIComponent(q)}&vendor=${vendor}${wide ? '' : '&country=' + encodeURIComponent(country || '')}`),
    [type, q, wide, country, vendor], []);
  const rows = list || [];
  const got = id => chosen.some(p => p.res_id === id);
  return (<>
    <div className="rp-top">
      <button className="btn btn-o btn-s" onClick={onBack}><Icon n="back" s={14} />回到行程</button>
      <b>给「{cate}」选资源</b>
      <span className="t2">按 {pax} 人 / {days} 天自动算数量，选完可改</span>
    </div>
    <div className="rp-bar">
      {types.map(t => <button key={t} className={'chip' + (type === t ? ' on' : '')} style={{ fontSize: 12 }}
        onClick={() => setType(t)}>{TYPE_CN[t]}</button>)}
      <input className="inp" style={{ height: 31, flex: 1, minWidth: 120 }} value={q} placeholder="搜名称 / 城市 / 标签"
        onChange={e => setQ(e.target.value)} />
      <label className="rp-ck"><input type="checkbox" checked={!!wide} onChange={e => setWide(e.target.checked ? 1 : 0)} />
        不限目的地</label>
    </div>
    <div className="qd-trip rp-list">
    {loading ? <div className="empty">正在找…</div>
      : !rows.length ? <div className="empty">{country || destText || ''}暂时没有可选的{TYPE_CN[type]}资源<br />
        <span className="t2">可以勾「不限目的地」放宽，或让平台先把资源录进库</span></div>
      : rows.map(r => (
        <div className="rp-card" key={r.id}>
          <div className="rp-h">
            <Icon n={TYPE_IC[r.type]} s={15} c="var(--gold)" />
            <b>{r.name}</b>
            {r.level && <span className="tag">{r.level}</span>}
            {r.city && <span className="t2">{r.country} · {r.city}</span>}
            {got(r.id) && <span className="tag ok">已选用</span>}
            <span className="rp-sup">{r.supplier_name || '平台直采'}</span>
          </div>
          {r.intro && <div className="rp-in">{r.intro}</div>}
          {!r.units.some(u => u.myCost) && <div className="rp-hint">
            平台只维护资源信息，价格按你自己的协议价填；填过一次之后，下次报价会自动带出来。</div>}
          {r.units.map(u => {
            const qy = qtyOf(u.unit, pax, days);
            const k = r.id + '-' + u.id;
            const typed = +myPrice[k] || 0;
            const cost = u.myCost || typed;         // 只认这家供应商自己的价
            return (<div className="rp-u" key={u.id}>
              <div className="rp-un"><b>{u.name}</b>{u.spec && <span>{u.spec}</span>}</div>
              {u.myCost ? <span className="rp-uc">{money(u.myCost)}<i>/{u.unit}</i>
                  <em className="rp-mine">我的协议价</em></span>
                : <span className="rp-uc rp-ask">
                    <input className="inp" type="number" placeholder="填你的价" value={myPrice[k] || ''}
                      onChange={e => setMyPrice({ ...myPrice, [k]: e.target.value })} />
                    <i>/{u.unit}</i>
                  </span>}
              <span className="rp-uq">× {qy} <i>{QTY_TIP[u.unit] || ''}</i></span>
              <span className="rp-us">{cost ? money(cost * qy) : '—'}</span>
              <button className="ob p" disabled={!cost}
                onClick={() => onAdd(r, { ...u, cost }, !u.myCost)}>加入报价</button>
            </div>);
          })}
        </div>
      ))}
    </div>
  </>);
}

/* ---------- 账号管理：供应商自己的员工账号与权限 ---------- */
const ROLES = [['admin', '管理员', '可管账号、可报价、可看全部订单'],
  ['quote', '报价员', '接单、出报价、改报价'],
  ['ops', '履约操作', '看已中选订单、维护资源与出行进度'],
  ['view', '只读', '只能查看，不能操作']];

function Accounts({ vendor }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [edit, setEdit] = useState(null);
  const { d: rows, reload } = useData(
    () => get(`/api/ubk/accounts?vendor=${vendor}&q=${encodeURIComponent(q)}&role=${role}&status=${status}`),
    [vendor, q, role, status], []);
  const list = rows || [];
  const toggle = async a => {
    await post(`/api/ubk/accounts/${a.id}/status`, { status: a.status ? 0 : 1 });
    toast(a.status ? '已停用' : '已启用'); reload();
  };
  const reset = async a => {
    if (!window.confirm(`确认重置「${a.name}」的登录密码吗？`)) return;
    const r = await post(`/api/ubk/accounts/${a.id}/reset`, {});
    window.alert(`初始密码：${r.pwd}\n请通知本人首次登录后修改。`);
  };
  const remove = async a => {
    if (!window.confirm(`确认删除账号「${a.name}」吗？删除后该账号无法登录。`)) return;
    await del('/api/ubk/accounts/' + a.id); toast('已删除'); reload();
  };
  if (edit !== null) return <AccountEditor a={edit} vendor={vendor} onBack={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />;
  return (<div className="op">
    <section className="mod">
      <div className="mod-h"><h3>账号管理</h3><span className="en">Accounts</span>
        <div className="mod-stat">
          <i>账号：<b>{list.length} 个</b></i>
          <i>启用中：<b className="g">{list.filter(a => a.status).length} 个</b></i>
          <i>已停用：<b>{list.filter(a => !a.status).length} 个</b></i>
        </div>
      </div>
      <div className="op-tool">
        <button className="tb" onClick={() => setEdit({})}>+ 新建账号</button>
        <button className="tb" onClick={reload}>刷新</button>
        <input className="srt" style={{ width: 210, height: 27, padding: '0 10px' }} value={q}
          onChange={e => setQ(e.target.value)} placeholder="搜姓名 / 手机号 / 邮箱" />
        <select className="srt" value={role} onChange={e => setRole(e.target.value)}>
          <option value="">全部角色</option>{ROLES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        <select className="srt" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">全部状态</option><option value="1">启用中</option><option value="0">已停用</option></select>
        <span className="cnt">账号以手机号登录，角色决定在供应商台能做哪些操作</span>
      </div>
      <table className="tbl">
        <thead><tr>
          <th style={{ width: 150 }}>姓名</th><th style={{ width: 130 }}>手机号</th><th>邮箱</th>
          <th style={{ width: 110 }}>角色</th><th style={{ width: 110 }}>部门</th>
          <th style={{ width: 150 }}>最近登录</th><th style={{ width: 90 }}>状态</th><th style={{ width: 190 }}>操作</th>
        </tr></thead>
        <tbody>{list.map(a => (
          <tr key={a.id}>
            <td><b style={{ fontSize: 13.2 }}>{a.name}</b><div className="t2 mono">{a.id}</div></td>
            <td className="mono">{a.phone}</td>
            <td>{a.email || <span className="t2">—</span>}</td>
            <td><span className="tag">{a.roleCn}</span></td>
            <td>{a.dept || <span className="t2">—</span>}</td>
            <td className="t2">{a.last_login || '从未登录'}</td>
            <td><span className={'sw ' + (a.status ? 'on' : '')} onClick={() => toggle(a)}><i /></span>
              <div className="t2">{a.status ? '启用中' : '已停用'}</div></td>
            <td><div className="lnks">
              <a onClick={() => setEdit(a)}>编辑</a>
              <a onClick={() => reset(a)}>重置密码</a>
              <a className="r" onClick={() => remove(a)}>删除</a>
            </div></td>
          </tr>))}</tbody>
      </table>
      {!list.length && <div className="empty"><div className="ic">◎</div>暂无账号，请点击上方「新建账号」创建</div>}
      <div className="op-ft">角色权限：{ROLES.map(([k, t, d]) => `${t}（${d}）`).join('　·　')}</div>
    </section>
  </div>);
}

function AccountEditor({ a, vendor, onBack, onSaved }) {
  const toast = useToast();
  const isNew = !a.id;
  const [f, setF] = useState({ role: 'quote', status: 1, ...a });
  const set = (k, v) => setF(o => ({ ...o, [k]: v }));
  const save = async () => {
    try { await post('/api/ubk/accounts', { ...f, vendor_id: vendor }); toast('已保存'); onSaved(); }
    catch (e) { toast(e.message); }
  };
  const L = ({ label, req, children }) => (
    <div className="pe-line"><span className="lb">{req && <b>*</b>}{label}</span><div className="in">{children}</div></div>
  );
  return (<>
    <div className="pe-top">
      <button className="btn btn-o btn-s" onClick={onBack}><Icon n="back" s={14} />返回列表</button>
      <h3>{isNew ? '新建账号' : '编辑账号'}</h3>
      {!isNew && <span className="tag">{f.id}</span>}
      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
        账号归属：{(VENDORS.find(v => v[0] === vendor) || [])[1]}</span>
    </div>
    <div className="pe-sec">
      <div className="hd"><i /><b>基本信息</b><span>账号以手机号登录，同一供应商下手机号不可重复</span></div>
      <L label="姓名" req><input className="inp" value={f.name || ''} onChange={e => set('name', e.target.value)} placeholder="真实姓名" /></L>
      <L label="手机号" req><input className="inp" value={f.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="11 位手机号，用于登录" /></L>
      <L label="邮箱"><input className="inp" value={f.email || ''} onChange={e => set('email', e.target.value)} placeholder="用于接收派单与报价提醒" /></L>
      <L label="部门 / 岗位"><input className="inp" value={f.dept || ''} onChange={e => set('dept', e.target.value)} placeholder="报价组 / 履约组 / 中国区" /></L>
    </div>
    <div className="pe-sec">
      <div className="hd"><i /><b>角色与权限</b><span>决定这个账号在供应商台能做哪些操作</span></div>
      <div className="ac-roles">
        {ROLES.map(([k, t, d]) => (
          <div key={k} className={'ac-role' + (f.role === k ? ' on' : '')} onClick={() => set('role', k)}>
            <b>{t}</b><span>{d}</span></div>))}
      </div>
      <L label="账号状态"><select className="inp" value={f.status === 0 ? 0 : 1} onChange={e => set('status', +e.target.value)}>
        <option value={1}>启用中（可登录）</option><option value={0}>已停用（不可登录）</option></select></L>
      <L label="备注"><textarea className="inp" rows={2} value={f.remark || ''} onChange={e => set('remark', e.target.value)}
        placeholder="如：仅负责阿尔卑斯线路报价" /></L>
    </div>
    <div className="pe-bar">
      <button className="btn btn-o" onClick={onBack}>取消</button>
      <button className="btn btn-p" onClick={save}>保存</button>
    </div>
  </>);
}

const M = [
  { g: '业务', items: [
    { k: 'quote', t: '定制单报价台', ic: 'box' },
    { k: 'order', t: '订单管理', ic: 'ticket' },
  ]},
  { g: '系统', items: [{ k: 'account', t: '账号管理', ic: 'users' }] },
];
const TITLE = {
  quote: ['定制单报价台', '门店提交报价请求后，单子进到这里。接单 → 看行程 → 逐天标注资源 → 出报价'],
  order: ['订单管理', '门店成交后我接的单在这里 · 结算价、收款与出行进度'],
  account: ['账号管理', '维护本供应商在优定制平台上的员工账号与操作权限'],
};

export default function Ubk() {
  const nav = useNavigate();
  const { page, go: setPage } = usePage('/ubk', 'quote');
  const toast = useToast();
  const [vendor, setVendor] = useState('V01');
  const [tab, setTab] = useState('all');
  const [desk, setDesk] = useState(null);
  const { d: rows, reload } = useData(() => get('/api/ubk/consults?vendor=' + vendor), [vendor], []);
  const list = useMemo(() => (rows || []).filter(r => tab === 'all' || r.state === tab), [rows, tab]);
  const take = async no => {
    if (!window.confirm('确认接下这一单、开始核资源吗？')) return;
    try { await post('/api/ubk/take', { no, vendor }); toast('已接单'); reload(); } catch (e) { toast(e.message); }
  };
  const cnt = k => (rows || []).filter(r => k === 'all' || r.state === k).length;
  /* 窄屏下侧边栏是抽屉，默认收起；点任意菜单自动关上 */
  const [side, setSide] = useState(false);
  return (<div className={'adm' + (side ? ' side-on' : '')}>
    <div className="adm-side">
      <div className="adm-brand" onClick={() => nav('/')} style={{ cursor: 'pointer' }}>
        <b>供应商台</b><span>优定制 U-DESIGN · Supplier</span></div>
      <div className="adm-nav" onClick={() => setSide(false)}>
        <div className="adm-grp">当前身份</div>
        <div style={{ padding: '0 10px 6px' }}>
          <select className="inp" value={vendor} onChange={e => setVendor(e.target.value)}
            style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)', color: '#fff', height: 34, fontSize: 12.5 }}>
            {VENDORS.map(([id, n]) => <option key={id} value={id} style={{ color: '#111' }}>{n}</option>)}
          </select>
        </div>
        {M.map(g => (<div key={g.g}>
          <div className="adm-grp">{g.g}</div>
          {g.items.map(it => (
            <div key={it.k} className={'adm-item' + (page === it.k ? ' on' : '')} onClick={() => setPage(it.k)}>
              <Icon n={it.ic} s={16} />{it.t}
              {it.k === 'quote' && cnt('pending') > 0 && <span className="bdg">{cnt('pending')}</span>}
            </div>))}
        </div>))}
        <div className="adm-item" style={{ marginTop: 14 }} onClick={() => nav('/')}>
          <Icon n="back" s={16} />返回平台首页</div>
      </div>
      <div className="adm-foot">供应商侧 · 只看到派给自己的单<br />{(VENDORS.find(v => v[0] === vendor) || [])[1]}</div>
    </div>
    <div className="adm-main">
      <div className="adm-top">
        <AdmBurger on={side} set={setSide} />
        <div><h2>{TITLE[page][0]}</h2><div className="sub">{TITLE[page][1]}</div></div>
        {page !== 'account' && <button className="btn btn-o btn-s" style={{ marginLeft: 'auto' }} onClick={reload}>
          <Icon n="refresh" s={14} />刷新</button>}
      </div>
      <div className="adm-body">
        {page === 'account' ? <Accounts vendor={vendor} /> :
         page === 'order' ? <OrderList scope="ubk" vendor={vendor} /> : (<div className="op">
        <section className="mod">
          <div className="mod-h"><h3>定制单报价台</h3><span className="en">Quotes</span>
            {/* 状态计数在下方页签上已经有一份，这里不再重复 */}
            <div className="mod-stat">
              <i>流转单：<b>{(rows || []).length} 单</b></i>
            </div>
          </div>
          <div className="op-tabs">
            {[['all', '全部'], ['pending', '待接单'], ['taken', '核资源中'], ['quoted', '已报价'], ['won', '已中选'], ['lost', '未选中']].map(([k, t]) => (
              <a key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}<b>{cnt(k)}</b></a>))}
          </div>
          <div className="op-tool">
            <button className="tb" onClick={reload}>刷新</button>
            <span className="cnt">门店提交报价请求后，单子进到这里 · 接单 → 看行程 → 逐天标注资源 → 出报价</span>
          </div>
          <table className="tbl">
            <thead><tr><th style={{ width: 170 }}>咨询单</th><th>目的地 · 团期</th>
              <th style={{ width: 80 }}>人数</th><th style={{ width: 150 }}>门店 · 销售</th>
              <th style={{ width: 160 }}>我的报价</th><th style={{ width: 110 }}>状态</th>
              <th style={{ width: 190 }}>操作</th></tr></thead>
            <tbody>{list.map(r => (
              <tr key={r.id}>
                <td><b className="mono" style={{ fontSize: 12.6 }}>{r.cno}</b>
                  <div className="t2">{r.customer}</div></td>
                <td><b style={{ fontSize: 13 }}>{r.dest}</b>
                  <div className="t2">{r.days} 天 · {r.go_date || '日期待定'}</div></td>
                <td className="num">{r.pax} 人</td>
                <td>{r.shop}<div className="t2">{r.sales_name}</div></td>
                <td>{r.total
                  ? <><b className="num" style={{ fontSize: 14, color: '#a8781f' }}>{money(r.total)}</b>
                      <div className="t2">{money(r.per_person)} / 人</div></>
                  : <span className="t2">未报价</span>}</td>
                <td><span className={'tag ' + (r.state === 'won' ? 'ok' : r.state === 'lost' ? 'plain'
                  : r.state === 'quoted' ? 'info' : 'warn')}>{(ST[r.state] || [])[0]}</span></td>
                <td><div className="lnks">
                  {r.state === 'pending' && <a onClick={() => take(r.cno)}>接单</a>}
                  {['taken', 'quoted'].includes(r.state) && <a onClick={() => setDesk({ no: r.cno })}>
                    {r.state === 'quoted' ? '改报价' : '出报价'}</a>}
                  <a onClick={() => setDesk({ no: r.cno })}>看行程</a>
                </div></td>
              </tr>))}</tbody>
          </table>
          {!list.length && <div className="empty"><div className="ic">◎</div>
            暂无流转的定制咨询单<br /><span style={{ fontSize: 12 }}>门店在工作台提交报价请求后，咨询单将流转至此</span></div>}
        </section>
        </div>)}
      </div>
    </div>
    {desk && <QuoteDesk no={desk.no} vendor={vendor} onClose={() => setDesk(null)} onDone={() => { setDesk(null); reload(); }} />}
  </div>);
}
