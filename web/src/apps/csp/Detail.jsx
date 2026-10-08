import { useNavigate } from 'react-router-dom';
import { img as oimg } from '../../shared/img.js';
import React, { useState, useMemo } from 'react';
import { get, post, put, money, money0, ST_CN, SRC_CN } from '../../shared/api.js';
import { Icon, useToast, useData, Modal } from '../../shared/ui.jsx';

/* 与服务端 PREF_CN 一一对应；销售编辑需求时要能勾选 */
const PREFS = [['family', '亲子旅行'], ['nature', '自然风光'], ['hidden', '小众秘境'],
  ['leisure', '休闲度假'], ['food', '美食探店'], ['culture', '人文古迹'],
  ['honeymoon', '蜜月浪漫'], ['photo', '摄影出片'], ['luxury', '高端奢享']];

/* 咨询单详情。ro=true 为总部运营的只读监控视角：保留全部信息与进度流转，
   隐藏重出行程、选定供应商等属于门店销售的写操作。 */
export default function Detail({ no, onClose, onAct, ro = false }) {
  const toast = useToast();
  const nav = useNavigate();
  const { d: c, loading, reload } = useData(() => get('/api/csp/consult/' + no), [no]);
  const [tab, setTab] = useState('trip');
  const [day, setDay] = useState(0);
  const [verId, setVerId] = useState(null);
  const [cmp, setCmp] = useState(null);
  const [busy, setBusy] = useState(false);
  /* 新流程：客人提交的需求先落到这里，销售核对/编辑后再确认推送，客人端才看得到 */
  const [edit, setEdit] = useState(null);
  const [pe, setPe] = useState(null);      // 行程方案的编辑草稿

  const plan = useMemo(() => {
    if (!c) return null;
    return (verId ? c.plans.find(p => p.id === verId) : null) || c.cur;
  }, [c, verId]);

  const replan = async kind => {
    if (kind === 'orig' && !window.confirm('重新生成将整份替换当前版本，原版本保留在修改记录中可查阅。确认继续？')) return;
    setBusy(true);
    try { await post(`/api/csp/consult/${no}/replan`, { kind }); toast(kind === 'fb' ? '已按客户反馈重新生成' : '已重新生成完整行程'); setVerId(null); reload(); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  };
  const openCmp = async () => {
    try { const d = await get(`/api/csp/consult/${no}/compare`); d.ready ? setCmp(d) : toast('还没有供应商报价回来'); }
    catch (e) { toast(e.message); }
  };
  const pick = async vid => {
    if (!window.confirm('选定这家供应商吗？其余各家会标记为未选中。')) return;
    try { await post(`/api/csp/consult/${no}/pick`, { vendor: vid }); toast('已选定供应商'); setCmp(null); reload(); }
    catch (e) { toast(e.message); }
  };

  const openEdit = () => setEdit({
    customer: c.customer || '', fromCity: c.from_city || '', dest: c.dest || '',
    goDate: c.go_date || '', days: c.days || 8,
    adults: c.adults || 0, children: c.children || 0, elders: c.elders || 0,
    budget: c.budget == null ? '' : c.budget, theme: c.theme || '',
    mustSee: c.must_see || '', note: c.note || '', prefs: c.prefs || [],
  });
  const setE = (k, v) => setEdit(o => ({ ...o, [k]: v }));
  const saveEdit = async () => {
    if (!edit.dest.trim()) return toast('目的地不能为空');
    setBusy(true);
    try {
      const r = await put(`/api/csp/consult/${no}`, edit);
      toast(r.changed ? `已保存，共修改 ${r.changed} 处` : '内容无变化');
      setEdit(null); reload();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };
  /* 行程方案编辑：AI 排出来的东西必须能改——写错的酒店、客人电话里补的要求、
     要砍掉的某个景点，销售当场就得能动，不然只能整份重出，把谈好的部分也冲掉。
     存下即同步：客人端读的是同一份当前版本。 */
  const openPlanEdit = () => setPe({
    plan: { route: plan.route || '', tagline: plan.tagline || '', total: plan.total || 0,
      quoteNote: plan.quote_note || '', highlights: [...(plan.highlights || [])] },
    days: Object.fromEntries((plan.days || []).map(d => [d.d, {
      d: d.d, title: d.title || '', city: d.city || '', items: [...(d.items || [])],
      hotel: d.hotel || '', meals: d.meals || '', exp: d.exp || '', food: d.food || '', drive: d.drive || '',
    }])),
  });
  const setPP = (k, v) => setPe(o => ({ ...o, plan: { ...o.plan, [k]: v } }));
  const setPD = (dn, k, v) => setPe(o => ({ ...o, days: { ...o.days, [dn]: { ...o.days[dn], [k]: v } } }));
  const savePlanEdit = async () => {
    setBusy(true);
    try {
      const r = await put(`/api/csp/consult/${no}/plan`, { plan: pe.plan, days: Object.values(pe.days) });
      toast(r.changed ? `已保存 ${r.changed} 处修改${r.synced ? '，客户端已同步' : ''}` : '内容无变化');
      setPe(null); reload();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };

  const pushToGuest = async () => {
    const again = !!c.guest_visible;
    if (!window.confirm(again
      ? '确认将当前版本的需求与行程重新发布给客户？客户端将立即更新为最新内容。'
      : '确认将本咨询单发布给客户？发布后客户可在小程序端查看需求详情与完整行程。')) return;
    setBusy(true);
    try { await post(`/api/csp/consult/${no}/push`, {}); toast(again ? '已重新发布给客户' : '已发布给客户'); reload(); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  };

  if (loading || !c) return <div className="empty">正在打开咨询单…</div>;
  const pax = c.adults + c.children + c.elders;
  const TABS = [['trip', '行程方案'], ['quote', `供应商报价 ${c.quotes.length ? '(' + c.quotes.length + ')' : ''}`],
    ['fb', `客户反馈 ${c.feedback.length ? '(' + c.feedback.length + ')' : ''}`], ['log', '修改记录']];

  const C_TAG = { pending: 'warn', taken: 'info', following: 'info', quoting: 'warn', won: 'ok', lost: 'plain' };
  const step = c.status === 'following' ? (c.plan_ok ? '方案已确认' : '方案待确认')
    : c.status === 'quoting' ? (c.quote_n ? `${c.quote_back || 0}/${c.quote_n} 家已回价` : '待派单')
    : c.status === 'won' ? '已生成订单' : '';
  const kv = (k, v) => (<div className="cd-kv" key={k}><i>{k}</i><b>{v === 0 || v ? v : <span className="od-na">—</span>}</b></div>);
  const lowQ = c.quotes.filter(q => q.total).length ? Math.min(...c.quotes.filter(q => q.total).map(q => q.total)) : null;
  const cost = c.sup_quote || lowQ;
  const gross = (c.quote && cost) ? c.quote - cost : null;
  const rate = (gross != null && c.quote) ? Math.round(gross / c.quote * 1000) / 10 : null;
  /* 进度流转：和咨询单五态一一对应，节点时间取自修改记录 */
  const logAt = kw => { const x = (c.logs || []).slice().reverse().find(l => (l.act || '').includes(kw)); return x ? x.created_at : null; };
  const rank = { pending: 0, following: 1, quoting: 2, won: 3, lost: 0 }[c.status] || 0;
  const closed = c.status === 'lost';
  const STEPS = [
    { t: '提交需求', d: '客户提交或门店建单', at: c.created_at, ic: 'file' },
    { t: '销售接单', d: '认领并开始跟进', at: logAt('接单'), ic: 'user' },
    { t: '方案确认', d: '行程经客户确认', at: logAt('方案确认'), ic: 'check', sub: c.plan_ok ? '已确认' : '待确认' },
    { t: '供应商报价', d: '派单并回收报价', at: logAt('提交报价'), ic: 'box',
      sub: c.quote_n ? `${c.quote_back || 0}/${c.quote_n} 家已回价` : '待派单' },
    { t: '成交建单', d: '确认成交价并生成订单', at: logAt('生成订单'), ic: 'ticket' },
  ];
  const stRank = { pending: 1, taken: 2, following: c.plan_ok ? 3 : 2, quoting: c.sup_pick ? 4 : 3, won: 5, lost: 0 }[c.status];
  const nextAct = c.status === 'pending' ? ['接单', 'take']
    : c.status === 'taken' ? ['开始跟进', 'follow']
    : c.status === 'following' ? (c.plan_ok ? ['提交供应商报价', 'dispatch'] : ['方案确认', 'confirm'])
    : c.status === 'quoting' ? (c.sup_pick ? ['成交建单', 'order'] : ['比价选定', 'pick']) : null;

  return (<div className="od cd">
    <div className="od-hd">
      <button className="back" onClick={onClose}><Icon n="back" s={14} />返回咨询单列表</button>
      <h2>咨询单详情</h2><span className="sub mono">{c.no}</span>
      <span className={'tag ' + (C_TAG[c.status] || 'plain')} style={{ marginLeft: 4 }}>{ST_CN[c.status]}</span>
      {step && <span className="tag plain">{step}</span>}
      {c.guest_visible
        ? <span className="tag ok">已发布</span>
        : <span className="tag warn">待发布给客户</span>}
      {c.order_no && <a className="lnk mono" style={{ marginLeft: 'auto', fontSize: 12.5 }}
        onClick={() => nav('/csp/order/' + c.order_no)}>关联订单 {c.order_no} ›</a>}
    </div>

    {/* 进度流转 */}
    <div className="cd-flow">
      {STEPS.map((x, i) => {
        const st = closed ? (i < stRank ? 'done' : 'skip')
          : i + 1 < stRank ? 'done' : i + 1 === stRank ? 'doing' : 'todo';
        return (<div className={'st ' + st} key={x.t}>
          <span className="dt"><Icon n={x.ic} s={15} /></span>
          <b>{x.t}</b>
          <span className="sub">{x.sub || x.d}</span>
          <span className="tm">{x.at ? x.at.slice(5, 16) : st === 'doing' ? '进行中' : '—'}</span>
        </div>);
      })}
      {closed && <div className="cd-closed">该咨询单已标记为「已流失」，流程终止，可在下方操作中召回。</div>}
    </div>

    {/* 销售视角三栏：客人要什么 / 这单赚多少 / 谁在跟 */}
    {/* 推送状态条：整行贯通。原来塞在「客人与需求」卡片里，被三栏布局挤成三分之一宽 */}
    {!ro && !c.guest_visible && (
      <div className="cd-push">
        <div className="tx"><b>尚未向客户发布</b>
          <i>需求核对无误后发布，客户端方可查看本咨询单、完整行程与办理进度</i></div>
        <button className="b p" disabled={busy} onClick={pushToGuest}>核对无误，发布给客户</button>
      </div>
    )}
    {!!c.guest_visible && (
      <div className="cd-pushed">
        <span className="dot" />
        <span>{c.pushed_at
          ? `已于 ${String(c.pushed_at).slice(5, 16)} 由 ${c.pushed_by || '定制顾问'} 发布，客户端当前展示为本版本`
          : '已对客户发布'}</span>
        {!ro && <a onClick={pushToGuest}>更新后重新发布 ›</a>}
        {!ro && c.share_token && <a onClick={() => window.open(`${location.pathname}#/trip/${c.share_token}?preview=1`, '_blank', 'noopener')}>
          查看客户端展示效果 ›</a>}
      </div>
    )}

    <div className="cd-grid">
      <section className="cd-card">
        <div className="hd"><h3>客户与需求信息</h3><span className="en">Customer</span>
          {/* 客户自助填写的信息常有缺漏（目的地只写国家、预算留空），需顾问核对后再发布 */}
          {!ro && !c.order_no && !edit && <a className="hd-op" onClick={openEdit}>修改需求信息</a>}
        </div>
        {!edit ? (
          <div className="bd">
            {kv('客户姓名', <b style={{ fontSize: 14 }}>{c.customer}</b>)}
            {kv('联系电话', <span className="mono">{c.phone}</span>)}
            {kv('出发城市', c.from_city)}
            {kv('目的地', c.dest)}
            {kv('行程天数', c.days + ' 天')}
            {kv('出发日期', c.go_date)}
            {kv('出行人数', `${pax} 人 · 成人 ${c.adults || 0} / 儿童 ${c.children || 0} / 长者 ${c.elders || 0}`)}
            {kv('预算', c.budget ? money(c.budget) : null)}
            {kv('行程主题', c.theme)}
            {kv('旅行偏好', (c.prefs_cn || []).length
              ? <span className="cd-tags">{(c.prefs_cn || []).map(x => <em key={x}>{x}</em>)}</span> : null)}
            {kv('必访景点', c.must_see)}
            {kv('其他需求', c.note)}
          </div>
        ) : (
          <div className="bd cd-edit">
            <label><s>客户称呼</s><input value={edit.customer} onChange={e => setE('customer', e.target.value)} /></label>
            <label><s>联系电话</s><input value={c.phone} disabled /></label>
            <label><s>出发城市</s><input value={edit.fromCity} onChange={e => setE('fromCity', e.target.value)} /></label>
            <label><s>目的地</s><input value={edit.dest} onChange={e => setE('dest', e.target.value)} /></label>
            <label><s>出发日期</s><input type="date" value={edit.goDate} onChange={e => setE('goDate', e.target.value)} /></label>
            <label><s>行程天数</s><input type="number" min="1" max="60" value={edit.days}
              onChange={e => setE('days', e.target.value)} /></label>
            <label><s>成人 / 儿童 / 长者</s>
              <div className="trio">
                <input type="number" min="0" value={edit.adults} onChange={e => setE('adults', e.target.value)} />
                <input type="number" min="0" value={edit.children} onChange={e => setE('children', e.target.value)} />
                <input type="number" min="0" value={edit.elders} onChange={e => setE('elders', e.target.value)} />
              </div></label>
            <label><s>预算（元）</s><input type="number" min="0" value={edit.budget}
              placeholder="客户未填写" onChange={e => setE('budget', e.target.value)} /></label>
            <label><s>行程主题</s><input value={edit.theme} onChange={e => setE('theme', e.target.value)} /></label>
            <label className="w"><s>旅行偏好</s>
              <div className="chips">
                {PREFS.map(([k, t]) => (
                  <span key={k} className={edit.prefs.includes(k) ? 'on' : ''}
                    onClick={() => setE('prefs', edit.prefs.includes(k)
                      ? edit.prefs.filter(x => x !== k) : edit.prefs.concat(k))}>{t}</span>))}
              </div></label>
            <label className="w"><s>必访景点</s><input value={edit.mustSee}
              onChange={e => setE('mustSee', e.target.value)} /></label>
            <label className="w"><s>其他需求</s><textarea rows={3} value={edit.note}
              onChange={e => setE('note', e.target.value)} /></label>
            <div className="ops">
              <button className="b" onClick={() => setEdit(null)}>取消</button>
              <button className="b p" disabled={busy} onClick={saveEdit}>{busy ? '保存中…' : '保存需求'}</button>
            </div>
          </div>
        )}
      </section>

      <section className="cd-card">
        <div className="hd"><h3>商务测算</h3><span className="en">Margin</span></div>
        <div className="bd">
          <div className="cd-money">
            {[['客户预算', c.budget, ''], ['AI 行程报价', c.quote, ''],
              ['供应商结算', cost, 'gold'], ['预计毛利', gross, gross != null && gross < 0 ? 'bad' : 'ok'],
            ].map(([lb, v, cl]) => (
              <div key={lb}><i>{lb}</i><b className={cl}>{v ? money(v) : '—'}</b></div>))}
          </div>
          {kv('毛利率', rate != null ? <b className={rate < 15 ? 'r' : ''}>{rate}%</b> : null)}
          {kv('人均对客价', c.quote ? money(Math.round(c.quote / (pax || 1))) : null)}
          {kv('已派供应商', c.quote_n ? `${c.quote_n} 家` : '未派单')}
          {kv('已回价', c.quote_n ? `${c.quote_back || 0} 家` : null)}
          {kv('选定供应商', c.sup_pick
            ? (c.quotes.find(q => q.supplier_id === c.sup_pick) || {}).supplier_name : null)}
          {kv('关联产品', c.product ? `${c.product.title}` : null)}
        </div>
      </section>

      <section className="cd-card">
        <div className="hd"><h3>单据信息与责任人</h3><span className="en">Record</span></div>
        <div className="bd">
          {kv('咨询单号', <span className="mono">{c.no}</span>)}
          {kv('来源', c.src_cn || SRC_CN[c.source] || c.source)}
          {kv('创建人', c.created_by)}
          {kv('创建时间', c.created_at)}
          {kv('最近操作人', c.updated_by)}
          {kv('最近操作时间', c.updated_at)}
          {kv('负责销售', c.sales_name || <span className="od-na">未认领</span>)}
          {kv('所属门店', c.shop)}
          {kv('行程版本', c.plans.length ? `共 ${c.plans.length} 版` : null)}
          {kv('客户反馈', c.feedback.length ? `${c.feedback.length} 条` : '暂无')}
          {kv('关联订单', c.order_no
            ? <a className="lnk mono" onClick={() => nav('/csp/order/' + c.order_no)}>{c.order_no} ›</a> : null)}
        </div>
      </section>
    </div>

    <div className="od-tabs">
      {TABS.map(([k, t]) => (
        <a key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</a>))}
      <div className="od-tabs-ops">
        {c.plans.length > 1 && (
          <select value={plan?.id || ''} onChange={e => setVerId(Number(e.target.value))}>
            {c.plans.map(p => <option key={p.id} value={p.id}>第 {p.ver} 版{p.is_cur ? '（当前）' : ''}</option>)}
          </select>
        )}
        {!ro && <button disabled={busy} onClick={() => replan('orig')}>重新生成行程</button>}
        {!ro && !!c.feedback.length && <button disabled={busy} onClick={() => replan('fb')}>按客户反馈重新生成</button>}
        {c.share_token && <button className="p"
          onClick={() => window.open(`${location.pathname}#/trip/${c.share_token}?preview=1`, '_blank', 'noopener')}>
          客户端展示效果</button>}
      </div>
    </div>

    {tab === 'trip' && plan && (<div>
      {!ro && (
        <div className="pe-bar-top">
          {!pe
            ? <><span>AI 生成的行程可直接修改，保存后客户端同步更新</span>
                <button className="b" onClick={openPlanEdit}>修改行程方案</button></>
            : <><span className="on">修改中 · 保存后客户端展示为本版本</span>
                <button className="b" onClick={() => setPe(null)}>取消</button>
                <button className="b p" disabled={busy} onClick={savePlanEdit}>{busy ? '保存中…' : '保存并同步'}</button></>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <img src={oimg(plan.cover)} alt="" style={{ width: 200, height: 128, objectFit: 'cover', borderRadius: 12, flex: '0 0 200px' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tk">{plan.name} · 第 {plan.ver} 版</div>
          {!pe ? (<>
            <h3 className="serif" style={{ fontSize: 21, fontWeight: 400, margin: '5px 0 4px' }}>{plan.route}</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 9px' }}>{plan.tagline}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(plan.highlights || []).map(h => <span key={h} className="tag" style={{ color: 'var(--gold)', borderColor: '#e6d9bd', background: 'var(--gold-soft)' }}>{h}</span>)}
            </div>
          </>) : (
            <div className="pe-form">
              <label><s>路线</s><input value={pe.plan.route} onChange={e => setPP('route', e.target.value)} /></label>
              <label><s>副标题</s><input value={pe.plan.tagline} onChange={e => setPP('tagline', e.target.value)} /></label>
              <label><s>总报价（元）</s><input type="number" min="0" value={pe.plan.total}
                onChange={e => setPP('total', e.target.value)} /></label>
              <label><s>报价说明</s><input value={pe.plan.quoteNote} onChange={e => setPP('quoteNote', e.target.value)} /></label>
              <label className="w"><s>行程亮点（一行一条）</s>
                <textarea rows={3} value={pe.plan.highlights.join('\n')}
                  onChange={e => setPP('highlights', e.target.value.split('\n'))} /></label>
            </div>
          )}
          {c.tpl && <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.8, color: 'var(--muted)', marginTop: 9 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: c.tpl.skin.hl, display: 'inline-block' }} />
            套用模板 <b style={{ color: 'var(--ink-3)' }}>{c.tpl.name}</b>
            <span className="t2" style={{ marginTop: 0 }}>
              {c.tpl.type || '通用'} · {c.tpl.modules.filter(m => m.on).length} 个模块 · 客户端按此配色展示</span>
          </div>}
          {c.last_seen_at && <div style={{ fontSize: 11.5, color: 'var(--ok)', marginTop: 9 }}>
            <Icon n="eye" s={12} c="var(--ok)" style={{ verticalAlign: -2, marginRight: 4 }} />客户最近查看时间：{c.last_seen_at}</div>}
        </div>
      </div>
      {/* 路线示意图撤掉：坐标库里没有「北极光营地」这类非城市地名，
          落不到点的站会挤在原点、标签互相压住，画出来反而让人以为数据错了。
          改成一条顺序清晰的文字路线，信息量其实更大。 */}
      <div className="cd-route">
        <span className="lb">行程路线</span>
        <div className="ls">
          {[c.from_city || '北京', ...plan.days.reduce((a2, x) =>
            (x.city && x.city !== a2[a2.length - 1] ? [...a2, x.city] : a2), [])].map((cty, i, arr) => (
            <React.Fragment key={cty + i}>
              <span className={'st' + (plan.days[day] && plan.days[day].city === cty ? ' on' : '')}>
                <i>{i + 1}</i>{cty}</span>
              {i < arr.length - 1 && <em>→</em>}
            </React.Fragment>))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '14px 0 12px' }}>
        {plan.days.map((d, i) => (
          <button key={i} className={'chip' + (day === i ? ' on' : '')} style={{ fontSize: 12 }} onClick={() => setDay(i)}>D{d.d} {d.city}</button>
        ))}
      </div>
      {plan.days[day] && (() => { const d = plan.days[day]; return (
        <div className="card fade-in" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex' }}>
            {d.pic && <img src={oimg(d.pic)} alt="" style={{ width: 216, flex: '0 0 216px', objectFit: 'cover' }} />}
            <div style={{ padding: '16px 18px', flex: 1 }}>
              {!pe ? (<>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 8 }}>
                  <span className="serif" style={{ fontSize: 22, color: 'var(--gold)' }}>D{d.d}</span>
                  <b style={{ fontSize: 15 }}>{d.title}</b>
                  <span className="tag" style={{ marginLeft: 'auto' }}>{d.city}</span>
                </div>
                <ul style={{ margin: '0 0 10px', padding: 0 }}>
                  {d.items.map((x, j) => (
                    <li key={j} style={{ listStyle: 'none', position: 'relative', paddingLeft: 15, fontSize: 13, color: '#4a5551', marginBottom: 5, lineHeight: 1.65 }}>
                      <i style={{ position: 'absolute', left: 0, top: 8, width: 4, height: 4, borderRadius: '50%', background: 'var(--gold-2)' }} />{x}
                    </li>
                  ))}
                </ul>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px dashed var(--line)' }}>
                  {[['住', d.hotel], ['餐', d.meals], ['体验', d.exp], ['美食', d.food], ['车程', d.drive]].filter(x => x[1]).map(([k, v]) =>
                    <span key={k} style={{ fontSize: 11.5, color: 'var(--muted)', background: 'var(--paper)', padding: '3px 9px', borderRadius: 5 }}>{k} · {v}</span>)}
                </div>
              </>) : (() => { const e2 = pe.days[d.d]; if (!e2) return null; return (
                <div className="pe-form day">
                  <div className="dn">D{d.d}</div>
                  <label><s>当天标题</s><input value={e2.title} onChange={ev => setPD(d.d, 'title', ev.target.value)} /></label>
                  <label><s>城市</s><input value={e2.city} onChange={ev => setPD(d.d, 'city', ev.target.value)} /></label>
                  <label className="w"><s>行程内容（每行一条，客户端逐条展示）</s>
                    <textarea rows={Math.max(3, e2.items.length + 1)} value={e2.items.join('\n')}
                      onChange={ev => setPD(d.d, 'items', ev.target.value.split('\n'))} /></label>
                  <label><s>住宿</s><input value={e2.hotel} onChange={ev => setPD(d.d, 'hotel', ev.target.value)} /></label>
                  <label><s>餐食</s><input value={e2.meals} onChange={ev => setPD(d.d, 'meals', ev.target.value)} /></label>
                  <label><s>体验</s><input value={e2.exp} onChange={ev => setPD(d.d, 'exp', ev.target.value)} /></label>
                  <label><s>美食</s><input value={e2.food} onChange={ev => setPD(d.d, 'food', ev.target.value)} /></label>
                  <label className="w"><s>参考车程</s><input value={e2.drive} placeholder="如 罗马 → 佛罗伦萨，约 280 公里 / 3 小时"
                    onChange={ev => setPD(d.d, 'drive', ev.target.value)} /></label>
                  <div className="tip">可切换上方日期继续修改其他天，全部完成后统一保存。</div>
                </div>); })()}
              {c.feedback.filter(f => f.d === d.d).map(f => (
                <div key={f.id} style={{ marginTop: 9, background: '#fdf6e8', border: '1px solid #f0e2c4', borderRadius: 8, padding: '8px 11px', fontSize: 12.3 }}>
                  <b style={{ color: '#9a7325' }}>客人第 {f.round} 轮 · {f.target}：</b>{f.text}
                </div>
              ))}
            </div>
          </div>
        </div>); })()}
    </div>)}

    {tab === 'quote' && (<div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
          {c.sup_mode === 'assign' ? '指定供应商' : '自动分配'} · 共 {c.quotes.length} 家
          {c.sup_pick && <span style={{ color: 'var(--ok)', marginLeft: 8 }}>已选定</span>}
        </div>
        <button className="btn btn-g btn-s" style={{ marginLeft: 'auto' }} onClick={openCmp}><Icon n="sparkle" s={14} />AI 比价</button>
      </div>
      {!c.quotes.length ? <div className="empty"><div className="ic">◎</div>还没派单。到看板点「提交报价」派给供应商。</div>
        : c.quotes.map(q => (
          <div key={q.id} className="card" style={{ padding: '14px 16px', marginBottom: 10, borderColor: q.state === 'won' ? 'var(--ok)' : 'var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--gold-soft)', display: 'grid', placeItems: 'center' }}><Icon n="box" s={16} c="var(--gold)" /></div>
              <div><b style={{ fontSize: 13.8 }}>{q.supplier_name}</b>
                <div className="t2">{q.state === 'quoted' ? '已报价 · ' + (q.quoted_at || '') : q.state === 'won' ? '已选定' : q.state === 'taken' ? '已接单，正在核资源' : q.state === 'lost' ? '未选中' : '待报价'}</div></div>
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                {q.total ? <>
                  <div className="serif num" style={{ fontSize: 20, color: '#a8781f' }}>{money(q.total)}</div>
                  <div className="t2">{money(q.per_person)} / 人</div>
                </> : <span className="tag">等待回价</span>}
              </div>
              {!ro && q.total && !c.sup_pick && <button className="btn btn-p btn-s" onClick={() => pick(q.supplier_id)}>选定</button>}
            </div>
            {!!(q.items || []).length && <div style={{ display: 'flex', gap: 8, marginTop: 11, paddingTop: 11, borderTop: '1px dashed var(--line)' }}>
              {q.items.map(i => <span key={i.n} style={{ fontSize: 11.5, color: 'var(--muted)', background: 'var(--paper)', padding: '4px 10px', borderRadius: 6 }}>
                {i.n} <b className="num" style={{ color: 'var(--ink-3)' }}>{money(i.v)}</b></span>)}
            </div>}
            <QuoteResLines res={q.res} />
            {q.memo && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>备注：{q.memo}</div>}
          </div>
        ))}
    </div>)}

    {tab === 'fb' && (<div>
      {!c.feedback.length ? <div className="empty"><div className="ic">◎</div>客人还没提意见。把行程转发给客人，他在页面上标注后这里就会有。</div>
        : Object.entries(c.feedback.reduce((a, f) => { (a[f.round] = a[f.round] || []).push(f); return a; }, {})).map(([r, fs]) => (
          <div key={r} style={{ marginBottom: 16 }}>
            <div className="tk" style={{ marginBottom: 8 }}>第 {r} 轮反馈 · {fs.length} 条</div>
            {fs.map(f => (
              <div key={f.id} className="card" style={{ padding: '11px 14px', marginBottom: 7 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <span className="tag">D{f.d}</span><span className="tag">{f.target}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--muted-2)' }}>{f.created_at}</span>
                </div>
                <div style={{ fontSize: 13.2 }}>{f.text}</div>
              </div>
            ))}
          </div>
        ))}
      {!ro && !!c.feedback.length && <button className="btn btn-g" onClick={() => replan('fb')} disabled={busy}>
        <Icon n="sparkle" s={15} c="#fff" />按这些反馈重出一版</button>}
    </div>)}

    {tab === 'log' && (<div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>
        共 {c.plans.length} 版行程 · {c.logs.length} 条操作记录
      </div>
      {c.logs.map((l, i) => (
        <div key={l.id} style={{ display: 'flex', gap: 12, paddingBottom: 14 }}>
          <div style={{ flex: '0 0 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 5 }}>
            <i style={{ width: 7, height: 7, borderRadius: '50%', background: i === 0 ? 'var(--gold)' : 'var(--line)' }} />
            {i < c.logs.length - 1 && <i style={{ flex: 1, width: 1, background: 'var(--line)', marginTop: 3 }} />}
          </div>
          <div style={{ flex: 1, paddingBottom: 2 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <b style={{ fontSize: 13 }}>{l.act}</b>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{l.who}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--muted-2)' }}>{l.created_at}</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>{l.detail}</div>
          </div>
        </div>
      ))}
    </div>)}

    {/* AI 比价 */}
    <Modal open={!!cmp} onClose={() => setCmp(null)} title="AI 比价" sub="纯算法比对，不调模型；结论可逐条溯源" width={720}>
      {cmp && <>
        <div style={{ background: 'var(--paper)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
          {cmp.reasons.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 6, lineHeight: 1.6 }}>
              <span style={{ color: 'var(--gold)' }}>·</span>{r}</div>
          ))}
        </div>
        <table className="tbl">
          <thead><tr><th>项目</th>{cmp.vendors.map(v => <th key={v.id}>{v.name}</th>)}</tr></thead>
          <tbody>
            {cmp.table.map(r => {
              const mn = Math.min(...r.cells.filter(Boolean));
              return (<tr key={r.n}><td>{r.n}</td>
                {r.cells.map((v, i) => <td key={i} className="num" style={{ color: v === mn ? 'var(--ok)' : 'inherit', fontWeight: v === mn ? 600 : 400 }}>{money(v)}</td>)}
              </tr>);
            })}
            <tr style={{ background: 'var(--paper)' }}><td><b>合计</b></td>
              {cmp.vendors.map(v => <td key={v.id} className="num"><b style={{ color: v.id === cmp.low ? 'var(--ok)' : 'inherit' }}>{money(v.total)}</b>
                <div className="t2">{money(v.per)} / 人</div></td>)}
            </tr>
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn btn-o" style={{ flex: 1 }} onClick={() => setCmp(null)}>再等等其他家</button>
          {!ro && !c.sup_pick && <button className="btn btn-p" style={{ flex: 1 }} onClick={() => pick(cmp.low)}>
            选定推荐的 {(cmp.vendors.find(v => v.id === cmp.low) || {}).name}</button>}
        </div>
      </>}
    </Modal>

    {onAct && (
      <div className="od-bar">
        <div className="bar-ctx">咨询单 <span className="mono">{c.no}</span>
          <s>{ST_CN[c.status]}{step ? ' · ' + step : ''} · {c.customer} · {c.dest}</s></div>
        <div className="bar-act">
          {nextAct && <button className="ba p" onClick={() => onAct(c.no, nextAct[1])}>{nextAct[0]}</button>}
          {['pending', 'following', 'quoting'].includes(c.status) &&
            <button className="ba r" onClick={() => onAct(c.no, 'lost')}>标记流失</button>}
          {['won', 'lost'].includes(c.status) &&
            <button className="ba" onClick={() => onAct(c.no, 'recall')}>召回</button>}
        </div>
      </div>)}
  </div>);
}

/* ---------- 供应商这一单选用的地接资源 ----------
   供应商在报价台从平台资源库里挑的每一条（哪家酒店的哪个房型、几间几晚、多少钱），
   门店在这里看得到，比价时能对着明细谈，而不是只看一个总数。 */
const RES_IC = { hotel: 'bed', ticket: 'tag', car: 'car', dining: 'dish', guide: 'users', exp: 'sparkle', other: 'box' };
function QuoteResLines({ res }) {
  const [open, setOpen] = useState(false);
  if (!res || !res.length) return null;
  const sum = res.reduce((a, r) => a + (r.amount || 0), 0);
  const cates = [...new Set(res.map(r => r.cate))];
  return (<div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px dashed var(--line)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.2, color: 'var(--muted)', cursor: 'pointer' }}
      onClick={() => setOpen(!open)}>
      <Icon n={open ? 'up' : 'down'} s={13} />
      选用地接资源 <b style={{ color: 'var(--ink-3)' }}>{res.length} 条</b>
      <span style={{ color: 'var(--muted-2)' }}>合计 {money(sum)}</span>
      <a style={{ marginLeft: 'auto', color: 'var(--accent)' }}>{open ? '收起明细' : '看明细'}</a>
    </div>
    {open && cates.map(ct => (
      <div key={ct} style={{ marginTop: 9 }}>
        <div className="tk" style={{ marginBottom: 5 }}>{ct}</div>
        {res.filter(r => r.cate === ct).map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 12.3 }}>
            <Icon n={RES_IC[r.res_type] || 'box'} s={13} c="var(--muted-2)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{r.res_name}</div>
              <div className="t2">{r.unit_name}{r.spec ? ' · ' + r.spec : ''}{r.city ? ' · ' + r.city : ''}</div>
            </div>
            <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{money(r.cost)}/{r.unit} × {r.qty}</span>
            <b className="num" style={{ minWidth: 78, textAlign: 'right' }}>{money(r.amount)}</b>
          </div>
        ))}
      </div>
    ))}
  </div>);
}
