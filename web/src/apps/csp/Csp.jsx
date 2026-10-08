import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post, money, money0, ST_CN, SRC_CN } from '../../shared/api.js';
import { Icon, useToast, useData, Modal,  AdmBurger } from '../../shared/ui.jsx';
import Detail from './Detail.jsx';
import Chat from './Chat.jsx';
import { OrderList, FiltPanel } from '../../shared/Orders.jsx';
import { usePage } from '../../shared/route.js';
import '../../shared/orders.css';

/* 咨询单状态色：与订单 / 产品列表同一套 tag 体系 */
const C_TAG = { pending: 'warn', taken: 'info', following: 'info', quoting: 'warn', won: 'ok', lost: 'plain' };
const OPEN_ST = ['pending', 'following', 'quoting'];
/* 咨询单列表列：客人提交的字段（人数结构、偏好、必访景点）全部落位 */
const CG = 'minmax(0,1.1fr) minmax(0,1.25fr) minmax(0,0.78fr) minmax(0,1.35fr) minmax(0,1.1fr) minmax(0,1.25fr) minmax(0,1fr)';
const CCOLS = ['客人信息', '行程需求', '出行人数', '出行偏好', '报价信息', '供应商报价', '跟进状态'];

const TABS = [['all', '全部'], ['pending', '待接单'], ['taken', '已接单'], ['following', '跟进中'],
  ['quoting', '报价中'], ['won', '已成交'], ['lost', '已流失']];
const ACT = { take: '接单', follow: '开始跟进', confirm: '方案确认', dispatch: '提交报价', pick: '比价选定', order: '成交建单' };
const CONFIRM = {
  take: '确认由本人认领该咨询单并负责后续跟进？',
  follow: '确认开始跟进该咨询单？状态将转为「跟进中」，客人端能看到顾问已开始处理。',
  confirm: '确认行程方案已与客人达成一致？确认后可提交供应商报价。',
  pick: '',
  
  lost: '确认将该咨询单标记为已流失？标记后不计入跟进中，后续可召回。',
  recall: '确认召回该咨询单？状态将重置为「待接单」。',
};

/* ---------- 走马灯 ---------- */
function Ticker({ onGo }) {
  const { d: list } = useData(() => get('/api/csp/ticks'), [], []);
  const [seen, setSeen] = useState(() => { try { return JSON.parse(localStorage.csTickSeen || '[]'); } catch { return []; } });
  const [all, setAll] = useState(false);
  const items = list || [];
  const unread = items.filter(x => !seen.includes(x.k));
  const mark = k => { const n = [...new Set([...seen, k])]; setSeen(n); localStorage.csTickSeen = JSON.stringify(n); };
  const ICO = { box: 'box', check: 'check', x: 'x', chat: 'chat' };
  const row = (x, i) => (
    <span key={x.k + i} onClick={() => { mark(x.k); onGo(x.tail.split(' · ')[0]); }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0 20px 0 0', cursor: 'pointer', whiteSpace: 'nowrap' }}>
      <Icon n={ICO[x.ico] || 'bell'} s={13} c="var(--gold)" />
      <span dangerouslySetInnerHTML={{ __html: x.t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') }} />
      <span style={{ color: 'var(--muted-2)', fontSize: 11.5 }}>{x.tail}</span>
      {!seen.includes(x.k) && <i style={{ fontSize: 9, background: 'var(--bad)', color: '#fff', borderRadius: 3, padding: '0 4px', fontStyle: 'normal' }}>新</i>}
    </span>
  );
  if (!items.length) return null;
  return (<>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid var(--line)', borderRadius: 11, padding: '9px 14px', marginBottom: 16, overflow: 'hidden' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto', fontSize: 12, color: 'var(--muted)' }}>
        <Icon n="bell" s={14} c="var(--gold)" />动态
        {unread.length > 0 && <i style={{ fontStyle: 'normal', background: 'var(--bad)', color: '#fff', fontSize: 10, borderRadius: 999, padding: '0 6px' }}>{unread.length}</i>}
      </span>
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', maskImage: 'linear-gradient(90deg,transparent,#000 4%,#000 92%,transparent)' }}>
        <div style={{ display: 'inline-flex', animation: `roll ${Math.max(22, items.length * 6)}s linear infinite`, fontSize: 12.5 }}
          onMouseEnter={e => e.currentTarget.style.animationPlayState = 'paused'}
          onMouseLeave={e => e.currentTarget.style.animationPlayState = 'running'}>
          {items.map(row)}{items.map(row)}
        </div>
      </div>
      <button className="btn btn-o btn-xs" style={{ flex: '0 0 auto' }} onClick={() => setAll(true)}>查看全部</button>
      <style>{`@keyframes roll{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
    </div>
    <Modal open={all} onClose={() => setAll(false)} title="全部通知" sub={`${unread.length} 条未读`} width={560}>
      {items.map((x, i) => (
        <div key={i} onClick={() => { mark(x.k); setAll(false); onGo(x.tail.split(' · ')[0]); }}
          style={{ display: 'flex', gap: 10, padding: '12px 13px', borderRadius: 9, cursor: 'pointer', marginBottom: 6, background: seen.includes(x.k) ? '#fafbfa' : '#fff', border: '1px solid var(--line)' }}>
          <Icon n={ICO[x.ico] || 'bell'} s={15} c="var(--gold)" style={{ marginTop: 3 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13 }} dangerouslySetInnerHTML={{ __html: x.t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') }} />
            <div style={{ fontSize: 11.5, color: 'var(--muted-2)', marginTop: 3 }}>{x.tail} · {x.at}</div>
          </div>
          <span className="tag" style={{ height: 20, alignSelf: 'center' }}>{seen.includes(x.k) ? '已读' : '未读'}</span>
        </div>
      ))}
    </Modal>
  </>);
}

/* ---------- 看板 ---------- */
/* 定制咨询看板。三端共用一份：
   scope='csp' —— 门店销售视角，可接单、派单、比价、成交；
   scope='uom' —— 总部运营视角，覆盖门店（销售侧）与供应商（承接侧）全量信息，只读监控，不执行销售动作。 */
export function Board({ openNo, onOpenNo, scope = 'csp' }) {
  const toast = useToast();
  const nav = useNavigate();
  const isHQ = scope === 'uom';
  const [tab, setTab] = useState('all');
  const [fv, setFv] = useState({});
  const [fpOpen, setFpOpen] = useState(false);
  const detail = openNo;
  const setDetail = no => onOpenNo(no);
  const [vendorPick, setVendorPick] = useState(null);
  const [deal, setDeal] = useState(null);
  const { d: stats, reload: rs } = useData(() => get('/api/csp/stats'), [], null);
  const { d: rows, reload } = useData(() => get('/api/csp/consults'), [], []);
  const refresh = () => { reload(); rs(); };
  /* 工作台开着不动时列表不会变，客人刚提交的单要等销售手动刷新才看得见
     （2026-09-28 业务方就以为单没进来）。列表页每 30 秒、以及每次窗口重新获得焦点时
     自己拉一次；详情打开着的时候不刷，免得把正在编辑的需求冲掉。 */
  useEffect(() => {
    if (openNo) return;
    const t = setInterval(refresh, 30000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [openNo]);

  const byFilt = useMemo(() => (rows || []).filter(r => {
    const dr = (k, v) => {
      const a = fv[k + '_a'], b = fv[k + '_b'];
      if (!a && !b) return true;
      const x = String(v || '').slice(0, 10);
      if (!x) return false;
      return (!a || x >= a) && (!b || x <= b);
    };
    if (fv.q && ![r.no, r.customer, r.phone, r.dest, r.sales_name, r.go_date].join('|')
      .toLowerCase().includes(fv.q.toLowerCase())) return false;
    if (fv.dest && !(r.dest || '').includes(fv.dest)) return false;
    if (fv.sales && r.sales_name !== fv.sales) return false;
    if (fv.shop && r.shop !== fv.shop) return false;
    if (fv.sup && !(r.quotes || []).some(q => q.supplier_name === fv.sup)) return false;
    if (fv.src && (SRC_CN[r.source] || r.source) !== fv.src) return false;
    if (fv.status && ST_CN[r.status] !== fv.status) return false;
    if (!dr('go', r.go_date) || !dr('made', r.created_at)) return false;
    if (fv.ono && !(r.order_no || '').toLowerCase().includes(fv.ono.toLowerCase())) return false;
    if (fv.hasorder && !r.order_no) return false;
    if (fv.noquote && (r.quotes || []).length) return false;
    if (fv.hasquote && !(r.quotes || []).some(x => x.total)) return false;
    return true;
  }), [rows, fv]);
  const list = useMemo(() => {
    if (tab === '__quote') return [];
    return tab === 'all' ? byFilt : byFilt.filter(r => r.status === tab);
  }, [byFilt, tab]);
  const dests = [...new Set((rows || []).map(r => (r.dest || '').split(' ')[0]).filter(Boolean))];
  const salesL = [...new Set((rows || []).map(r => r.sales_name).filter(Boolean))];

  const act = async (no, key) => {
    if (key === 'pick') { setDetail(no); return; }
    if (key === 'dispatch') { const v = await get(`/api/csp/consult/${no}/vendors`); setVendorPick({ no, ...v }); return; }
    if (key === 'order') { const c = await get('/api/csp/consult/' + no); setDeal(c); return; }
    if (CONFIRM[key] && !window.confirm(CONFIRM[key])) return;
    try {
      const r = await post(`/api/csp/consult/${no}/action`, { key });
      toast(key === 'order' ? '订单已生成 ' + r.orderNo : (ACT[key] || '已处理') + '成功');
      refresh();
    } catch (e) { toast(e.message); }
  };
  const doDispatch = async (mode, vendor) => {
    try {
      await post(`/api/csp/consult/${vendorPick.no}/dispatch`, { mode, vendor });
      toast('已提交供应商报价'); setVendorPick(null); refresh();
    } catch (e) { toast(e.message); }
  };
  const exportCsv = () => {
    if (!list.length) return toast('没有可导出的咨询单');
    const head = ['咨询单号', '来源', '客户', '目的地', '天数', '出发日期', '出行人数', '预算', '报价', '销售', '门店', '状态', '创建时间'];
    const body = list.map(r => [r.no, SRC_CN[r.source] || r.source, r.customer, r.dest, r.days, r.go_date,
      r.adults + r.children + r.elders, r.budget || '', r.quote || '', r.sales_name || '', r.shop, ST_CN[r.status], r.created_at]);
    const csv = '﻿' + [head, ...body].map(l => l.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = '定制咨询单.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('已导出 ' + list.length + ' 单');
  };

  const FIELDS = [
    { k: 'q', t: '关键词', ph: '单号 / 客户 / 电话 / 目的地' },
    { k: 'dest', t: '目的地', type: 'sel', opts: dests },
    ...(isHQ ? [{ k: 'shop', t: '归属门店', type: 'sel', opts: [...new Set((rows || []).map(r => r.shop).filter(Boolean))] }] : []),
    { k: 'sales', t: '销售人员', type: 'sel', opts: salesL },
    ...(isHQ ? [{ k: 'sup', t: '承接供应商', type: 'sel',
      opts: [...new Set((rows || []).flatMap(r => (r.quotes || []).map(q => q.supplier_name)).filter(Boolean))] }] : []),
    { k: 'src', t: '来源', type: 'sel', opts: [...new Set((rows || []).map(r => SRC_CN[r.source] || r.source).filter(Boolean))] },
    { k: 'status', t: '状态', type: 'sel', opts: TABS.filter(t => t[0] !== 'all').map(t => t[1]) },
    { k: 'ono', t: '关联订单号', ph: '支持模糊查询' },
    { k: 'go', t: '出发日期', type: 'dr' },
    { k: 'made', t: '提交日期', type: 'dr' },
    { k: 'hasorder', t: '仅看已生成订单', type: 'ck' },
    { k: 'noquote', t: '仅看未派单', type: 'ck' },
    { k: 'hasquote', t: '仅看已回价', type: 'ck' },
  ];

  if (detail) return <Detail no={detail} scope={scope} ro={isHQ}
    onClose={() => { setDetail(null); refresh(); }}
    onAct={isHQ ? null : async (no, key) => { await act(no, key); }} />;

  return (<div className="op">
    {!isHQ && <Ticker onGo={no => setDetail(no)} />}

    {/* 数据概览已下线：这几个数字与下方列表的状态页签完全重复，
        同一组数在一屏里出现两次，反而让人怀疑哪个准。统计口径保留在列表页签上。 */}

    {/* 筛选条件 */}
    <section className="mod">
      <div className="mod-h"><h3>筛选条件</h3><span className="en">Filter</span>
        <a className="mod-x" onClick={exportCsv}>导出当前结果</a></div>
      <div className="mod-b">
        <FiltPanel fields={FIELDS} val={fv} onChange={setFv} open={fpOpen} setOpen={setFpOpen} />
      </div>
    </section>

    <section className="mod">
      <div className="mod-h"><h3>定制咨询列表</h3><span className="en">Consults</span>
        {/* 状态计数一律交给下方页签，这里只放页签给不出的口径，避免同一组数出现两次 */}
        <div className="mod-stat">
          <i>本页：<b>{list.length} 单</b></i>
          <i>已派单：<b>{list.filter(r => (r.quotes || []).length).length} 单</b></i>
          <i>预算合计：<b>{money(list.reduce((n, r) => n + (r.budget || 0), 0))}</b></i>
          {isHQ && <i>覆盖门店：<b>{new Set(list.map(r => r.shop).filter(Boolean)).size} 家</b></i>}
        </div>
      </div>
      <div className="op-tabs">
        {TABS.map(([k, t]) => {
          const n = k === 'all' ? byFilt.length : byFilt.filter(r => r.status === k).length;
          return (<a key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}<b>{n}</b></a>);
        })}
        {/* 「供应商比价」页签先隐藏：主列表已有供应商报价列与毛利，功能重复。
            后续改造成真正的横向比价视图（分项对比 / 超时未回价预警 / 供应商维度统计）再开放。 */}
      </div>
      <div className="op-tool">
        <button className="tb" onClick={exportCsv}>导出当前结果</button>
        <button className="tb" onClick={refresh}>刷新列表</button>
        <span className="cnt">{isHQ
          ? '总部视角 · 汇总全部门店的定制咨询单与供应商承接情况，仅作监控查看'
          : '来源：小程序提交 · 定制师对话 · 门店手工建单'}</span>
      </div>
    {tab === '__quote' && <QuoteTrack rows={byFilt} onOpen={no => setDetail(no)} />}

    {tab !== '__quote' && (<>
    <div className="ol-head" style={{ gridTemplateColumns: CG }}>
      {CCOLS.map(c => <span key={c}>{c}</span>)}
    </div>

    {list.map(r => {
      const pax = (r.adults || 0) + (r.children || 0) + (r.elders || 0);
      const qs = (r.quotes || []).filter(q => q.total);
      const low = qs.length ? Math.min(...qs.map(q => q.total)) : null;
      const gross = (r.quote && (r.sup_quote || low)) ? r.quote - (r.sup_quote || low) : null;
      return (<div className="ol-row" key={r.no}>
        <div className="ol-sub">
          <span className="f">咨询单号 <b className="mono">{r.no}</b></span>
          <span className="f">来源 <b>{r.src_cn || SRC_CN[r.source] || r.source}</b></span>
          <span className="f">创建 <b>{r.created_by || '—'}</b><s className="tm">{(r.created_at || '').slice(0, 16)}</s></span>
          <span className="f">最近操作 <b>{r.updated_by || '—'}</b><s className="tm">{(r.updated_at || '').slice(0, 16)}</s></span>
          {isHQ && <span className="f">归属门店 <b>{r.shop || '—'}</b></span>}
          {isHQ && <span className="f">跟进销售 <b>{r.sales_name || '未认领'}</b></span>}
          {isHQ && <span className="f">承接供应商 <b>{
            (r.quotes || []).find(q => q.supplier_id === r.sup_pick)?.supplier_name
            || ((r.quotes || []).length ? `${(r.quotes || []).length} 家在报价` : '未派单')}</b></span>}
          {r.order_no && <span className="f">关联订单 <a className="lnk mono"
            onClick={e => { e.stopPropagation(); nav(`/${scope}/order/` + r.order_no); }}>{r.order_no}</a></span>}
          <a className="more" onClick={() => setDetail(r.no)}>查看详情 ›</a>
        </div>
        <div className="ol-cells" style={{ gridTemplateColumns: CG }}>
          <div className="c">
            <div className="nm2">{r.customer || '待补充'}</div>
            <div className="oc-s mono">{r.phone || '—'}</div>
            <div className="oc-s">{r.shop || '—'}</div>
          </div>
          <div className="c">
            <div className="oc-r"><i>目的地</i><b>{r.dest || '—'}</b></div>
            <div className="oc-r"><i>天数</i><b>{r.days} 天</b></div>
            <div className="oc-r"><i>出发</i><b>{r.go_date || '待定'}</b></div>
            <div className="oc-r"><i>出发地</i><b className="mu">{r.from_city || '—'}</b></div>
          </div>
          <div className="c">
            <div className="oc-r"><i>合计</i><b>{pax} 人</b></div>
            <div className="oc-r"><i>成人</i><b>{r.adults || 0}</b></div>
            <div className="oc-r"><i>儿童</i><b className={r.children ? '' : 'mu'}>{r.children || 0}</b></div>
            <div className="oc-r"><i>长者</i><b className={r.elders ? '' : 'mu'}>{r.elders || 0}</b></div>
          </div>
          <div className="c">
            {r.theme && <div className="oc-s"><b>主题</b> {r.theme}</div>}
            <div className="oc-tags">
              {(r.prefs_cn || []).length ? (r.prefs_cn || []).map(x => <em key={x}>{x}</em>)
                : <span className="oc-s">未选偏好</span>}
            </div>
            <div className="oc-s cut2">{r.must_see ? '必访：' + r.must_see : (r.note ? '备注：' + r.note : '无特殊要求')}</div>
          </div>
          <div className="c">
            <div className="oc-r"><i>预算</i><b className={r.budget ? '' : 'mu'}>{r.budget ? money(r.budget) : '未填'}</b></div>
            <div className="oc-r"><i>AI 报价</i><b>{r.quote ? money(r.quote) : '待出'}</b></div>
            <div className="oc-r"><i>结算</i><b className="w">{(r.sup_quote || low) ? money(r.sup_quote || low) : '待报'}</b></div>
            <div className="oc-r"><i>毛利</i><b className={gross == null ? 'mu' : gross < 0 ? 'r' : 'g'}>
              {gross == null ? '—' : money(gross)}</b></div>
          </div>
          <div className="c">
            {!r.quotes?.length ? <span className="oc-s">未派单</span> : (<>
              <div className="oc-s">{r.sup_pick
                ? '已选定 ' + ((r.quotes.find(q => q.supplier_id === r.sup_pick) || {}).supplier_name || '')
                : `${qs.length}/${r.quotes.length} 家已回价`}</div>
              {r.quotes.slice(0, 3).map(q => (
                <div className="oc-r" key={q.supplier_id}>
                  <i className="ell">{q.supplier_name}</i>
                  <b className={q.supplier_id === r.sup_pick ? 'g' : q.total === low && qs.length > 1 ? 'w' : 'mu'}>
                    {q.total ? money(q.total) : (q.state === 'taken' ? '核价中' : q.state === 'lost' ? '已取消' : '待报')}</b>
                </div>))}
            </>)}
          </div>
          <div className="c">
            <div className="oc-r2"><i>状态</i><span className={'tag ' + (C_TAG[r.status] || 'plain')}>{ST_CN[r.status]}</span>
              {r.kind_cn && <span className="tag" style={{ marginLeft: 4, borderColor: 'var(--gold)', color: 'var(--gold)' }}>{r.kind_cn}{r.org ? ' · ' + r.org : ''}</span>}</div>
            {r.step_cn && <div className="oc-r2"><i>进度</i><span className="syn">{r.step_cn}</span></div>}
            <div className="oc-r2"><i>销售</i><span className="syn">{r.sales_name || '未认领'}</span></div>
          </div>
        </div>
        <div className="ol-ops">
          {isHQ && r.order_no && <button className="ob" onClick={() => nav('/uom/order/' + r.order_no)}>查看关联订单</button>}
          <button className={'ob' + (isHQ ? ' p' : '')} onClick={() => setDetail(r.no)}>查看详情</button>
          {!isHQ && r.next && <button className="ob p" onClick={() => act(r.no, r.next)}>{ACT[r.next]}</button>}
          {!isHQ && OPEN_ST.includes(r.status) && <button className="ob r" onClick={() => act(r.no, 'lost')}>标记流失</button>}
          {!isHQ && ['won', 'lost'].includes(r.status) && <button className="ob" onClick={() => act(r.no, 'recall')}>召回</button>}
        </div>
      </div>);
    })}
    {!list.length && <div className="op-empty">
      {(rows || []).length ? '没有符合条件的咨询单，请调整筛选条件'
        : (isHQ ? '暂无定制咨询单' : '暂无咨询单，可由客人在小程序提交需求，或在「定制师 · 建单对话」中建单')}</div>}
    <div className="op-ft">共 {list.length} 单</div>
    </>)}
    </section>


    {deal && <DealBox c={deal} onClose={() => setDeal(null)} onDone={() => { setDeal(null); refresh(); }} />}

    <Modal open={!!vendorPick} onClose={() => setVendorPick(null)}
      title={vendorPick?.mode === 'assign' ? '指定一家供应商' : '派单给供应商'}
      sub={vendorPick?.mode === 'assign' ? '本门店的派单方式为「指定供应商」，选定后该咨询单将直接进入该供应商的报价台。'
        : `门店：${vendorPick?.shop}｜接单规则：自动分配，最多 ${vendorPick?.max} 家。谁先报价谁先出价。`} width={520}>
      {!vendorPick?.vendors?.length ? <div className="empty" style={{ textAlign: 'left', padding: '26px 4px' }}>
        <div style={{ textAlign: 'center', marginBottom: 14 }}>没有能接这一单的地接社。</div>
        {!!(vendorPick?.why || []).length && <div className="card" style={{ padding: '12px 14px', marginBottom: 12 }}>
          <div className="tk" style={{ marginBottom: 7 }}>为什么每家都接不了</div>
          {vendorPick.why.slice(0, 8).map(w => (
            <div key={w.id} style={{ display: 'flex', gap: 8, fontSize: 12.3, marginBottom: 5 }}>
              <b style={{ flex: '0 0 130px' }}>{w.name}</b>
              <span style={{ color: 'var(--muted)' }}>{w.reason}</span></div>))}
        </div>}
        <div style={{ fontSize: 12, textAlign: 'center', color: 'var(--muted)' }}>
          去总部端「供应 · 地接社」里放开对应的目的地或接单范围。</div></div> : <>
        {vendorPick.vendors.map((v, i) => (
          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 11, marginBottom: 8,
            opacity: vendorPick.mode === 'auto' && i >= vendorPick.max ? .42 : 1 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--gold-soft)', display: 'grid', placeItems: 'center' }}>
              <Icon n="box" s={16} c="var(--gold)" /></div>
            <div style={{ flex: 1 }}>
              <b style={{ fontSize: 13.5 }}>{v.name}</b>
              <div className="t2">{v.type} · 可接 {(v.dests || []).join('、')}</div>
              <div className="t2">评分 {v.rating} · 报价 {v.quoteN} 次中选 {v.wonN} 次 · 资质{v.cert}</div>
            </div>
            {vendorPick.mode === 'assign'
              ? <button className="btn btn-p btn-s" onClick={() => window.confirm(`把这一单指定给「${v.name}」报价吗？`) && doDispatch('assign', v.id)}>指定</button>
              : <span className="tag">{i < vendorPick.max ? '本次派单' : '本次不派'}</span>}
          </div>
        ))}
        {vendorPick.mode !== 'assign' && <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn btn-o" style={{ flex: 1 }} onClick={() => setVendorPick(null)}>取消</button>
          <button className="btn btn-p" style={{ flex: 1 }} onClick={() => doDispatch('auto')}>
            同时派给 {Math.min(vendorPick.max, vendorPick.vendors.length)} 家</button>
        </div>}
      </>}
    </Modal>
  </div>);
}

/* ---------- 成交确认：把对客成交价定下来再生成订单 ----------
   走查里发现的坑：门店如果选了一家比 AI 报价还贵的供应商，原来会直接按 AI 报价成交，
   订单毛利为负且全程没有提示。成交这一步必须把价格摆出来让销售确认。 */
function DealBox({ c, onClose, onDone }) {
  const toast = useToast();
  const cost = c.sup_quote || 0;
  const MARGIN = 25;
  const suggest = Math.max(c.quote || 0, Math.round(cost * (1 + MARGIN / 100) / 100) * 100);
  const [amt, setAmt] = useState(suggest);
  const [busy, setBusy] = useState(false);
  const pax = (c.adults || 0) + (c.children || 0) + (c.elders || 0) || 1;
  const profit = (+amt || 0) - cost;
  const rate = +amt ? Math.round((profit / +amt) * 1000) / 10 : 0;
  const go = async () => {
    if (busy) return; setBusy(true);
    try {
      const r = await post(`/api/csp/consult/${c.no}/action`, { key: 'order', amount: +amt });
      toast('订单已生成 ' + r.orderNo); onDone();
    } catch (e) { toast(e.message); }
    setBusy(false);
  };
  const R = ({ k, v, cl }) => (<div className="dealr"><span>{k}</span><b className={cl || ''}>{v}</b></div>);
  return (<Modal open onClose={onClose} width={480} title="确认成交并生成订单"
    sub={`${c.customer} · ${c.dest} · ${c.days} 天 ${pax} 人`}>
    <div className="dealbox">
      <R k="供应商结算价" v={money(cost) + '（' + (c.sup_pick || '未选定') + '）'} cl="gold" />
      <R k="AI 建议对客价" v={money(c.quote)} />
      <R k="客人预算" v={c.budget ? money(c.budget) : '未填写'} />
      <div className="dealr big">
        <span>对客成交价</span>
        <input className="inp" type="number" value={amt} onChange={e => setAmt(e.target.value)} />
      </div>
      <div className={'dealsum' + (profit < 0 ? ' bad' : '')}>
        毛利 <b>{money(profit)}</b>　·　毛利率 <b>{rate}%</b>　·　人均 <b>{money(Math.round((+amt || 0) / pax))}</b>
        {profit < 0 && <div className="warn">成交价低于供应商结算价，这一单会亏 {money(-profit)}，系统不会放行。</div>}
        {profit >= 0 && rate < 15 && <div className="warn">毛利率低于 15%，建议与供应商再谈一轮或调高成交价。</div>}
      </div>
      <div className="dealtip">成交后自动生成订单，并把出行人、联系人、订单日志一并建好；成交价会同步写回咨询单。</div>
    </div>
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
      <button className="btn btn-o" onClick={onClose}>再想想</button>
      <button className="btn btn-p" disabled={busy || profit < 0} onClick={go}>确认成交</button>
    </div>
  </Modal>);
}

/* ---------- 供应商报价跟踪 ---------- */
function QuoteTrack({ rows, onOpen }) {
  const list = (rows || []).filter(r => (r.quotes || []).length);
  return (<>
    <div className="op-tool"><span className="cnt">已派单的咨询单 · 共 {list.length} 单</span></div>
      <table className="tbl">
        <thead><tr><th>咨询单</th><th>客户 · 目的地</th><th>对客报价</th><th>供应商报价</th><th>毛利</th><th>状态</th><th></th></tr></thead>
        <tbody>{list.map(r => {
          const qs = (r.quotes || []).filter(q => q.total);
          const low = qs.length ? Math.min(...qs.map(q => q.total)) : null;
          const gross = low && r.quote ? Math.round((r.quote - low) / r.quote * 1000) / 10 : null;
          return (<tr key={r.no}>
            <td className="mono" style={{ fontSize: 12.5 }}>{r.no}</td>
            <td>{r.customer}<div className="t2">{r.dest}</div></td>
            <td className="num">{money(r.quote)}</td>
            <td>{qs.length ? <>
              <div className="num" style={{ color: '#a8781f', fontWeight: 600 }}>{money(low)} <span style={{ fontSize: 11, color: 'var(--muted)' }}>最低</span></div>
              <div className="t2">{qs.length}/{r.quotes.length} 家已报</div></> : <span style={{ color: 'var(--muted-2)' }}>等待报价</span>}</td>
            <td>{gross != null ? <span style={{ color: gross > 25 ? '#2c6b47' : '#a8781f', fontWeight: 600 }}>{gross}%</span> : '—'}</td>
            <td><span className={'tag ' + (C_TAG[r.status] || 'plain')}>{ST_CN[r.status]}</span>
              {r.kind_cn && <span className="tag" style={{ marginLeft: 4, borderColor: 'var(--gold)', color: 'var(--gold)' }}>{r.kind_cn}</span>}</td>
            <td><div className="lnks"><a onClick={() => onOpen(r.no)}>比价</a></div></td>
          </tr>);
        })}</tbody>
      </table>
      {!list.length && <div className="empty"><div className="ic">◎</div>暂无已派单的咨询单</div>}
  </>);
}

/* ---------- 外壳 ---------- */
const MENU = [
  { g: '咨询', items: [
    { k: 'board', t: '定制咨询看板', ic: 'grid' },
    { k: 'chat', t: '定制师 · 建单对话', ic: 'chat' },
  ]},
  { g: '交易', items: [{ k: 'order', t: '订单管理', ic: 'ticket' }] },
];
export default function Csp() {
  const nav = useNavigate();
  const { page, arg, go: setPage, setArg } = usePage('/csp', 'board');
  const openNo = page === 'board' ? arg : null;
  const setOpenNo = no => setArg(no);
  const { d: stats } = useData(() => get('/api/csp/stats'), [], null);
  const TITLE = { board: ['定制咨询', '门店定制游咨询单 · 从意向到成单全流程跟进'],
    chat: ['定制师 · 建单对话', '像跟客人聊天一样把需求问清楚，收齐即自动建单出方案'],
    order: ['订单管理', '咨询单成交后自动生成订单 · 收款、签约、出行、完成全流程'] };
  /* 窄屏下侧边栏是抽屉，默认收起；点任意菜单自动关上 */
  const [side, setSide] = useState(false);
  return (<div className={'adm' + (side ? ' side-on' : '')}>
    <div className="adm-side">
      <div className="adm-brand" onClick={() => nav('/')} style={{ cursor: 'pointer' }}>
        <b>门店工作台</b><span>优定制 U-DESIGN · Store</span>
      </div>
      <div className="adm-nav" onClick={() => setSide(false)}>
        {MENU.map(g => (<div key={g.g}>
          <div className="adm-grp">{g.g}</div>
          {g.items.map(it => (
            <div key={it.k} className={'adm-item' + (page === it.k ? ' on' : '')} onClick={() => setPage(it.k)}>
              <Icon n={it.ic} s={16} />{it.t}
              {it.k === 'board' && stats?.pending > 0 && <span className="bdg">{stats.pending}</span>}
            </div>
          ))}
        </div>))}
        <div className="adm-item" style={{ marginTop: 14 }} onClick={() => nav('/')}>
          <Icon n="back" s={16} />返回平台首页</div>
      </div>
      <div className="adm-foot">优定制 · 望京旗舰店<br />当前登录：李晴（店长）</div>
    </div>
    <div className="adm-main">
      <div className="adm-top">
        <AdmBurger on={side} set={setSide} />
        <div><h2>{TITLE[page][0]}</h2><div className="sub">{TITLE[page][1]}</div></div>
      </div>
      <div className="adm-body">
        {page === 'board' && <Board openNo={openNo} onOpenNo={setOpenNo} />}
        {page === 'chat' && <Chat onOpen={no => setPage('board', no)} />}
        {page === 'order' && <OrderList scope="csp" />}
      </div>
    </div>
  </div>);
}
