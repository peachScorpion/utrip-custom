import React, { useState, useEffect, useMemo } from 'react';
import { img as oimg } from '../../shared/img.js';
import { useNavigate } from 'react-router-dom';
import { get, post, put, del, money, money0 } from '../../shared/api.js';
import { Icon, useToast, useData, Modal, AdmBurger } from '../../shared/ui.jsx';
import './uom.css';
import { OrderList } from '../../shared/Orders.jsx';
import { Board as ConsultBoard } from '../csp/Csp.jsx';
import { ImgUpload, ImgPick, VideoUpload } from '../../shared/Upload.jsx';
import { MemberListPage, MemberLevelPage, MemberBenefitPage, MemberMapPage } from './member/MemberPage.jsx';
import { usePage } from '../../shared/route.js';
import { FiltPanel } from '../../shared/Orders.jsx';
import { Rich, RichView } from '../../shared/Rich.jsx';
import ResPage from './res/ResPage.jsx';
import TplPage from './tpl/TplPage.jsx';
import VendorPage from './vendor/VendorPage.jsx';
import { RESCFG } from './res/cfg.js';
import '../../shared/orders.css';

/* ---------- 定制产品管理 ----------
   版式与订单列表一致：筛选模块 + 列表模块（统计条压在模块头）+ 去线条的卡片行。
   字段结构参考签证业务线的产品管理（产品编号 / 产品属性 / 供应商 / 价格信息 / 毛利 /
   销售状态），再与小程序详情页要用的内容字段对齐。
   定制产品即臻品团：管理侧只有一类产品。 */
/* 列宽按内容量分配：产品信息最宽，其余按各自内容均分，不再忽宽忽窄 */
/* 列宽：下限别写 0——列被压窄时里面 nowrap 的值会直接溢出压到右边。
   v56 实测：目的地列「行程天数 11 天 10 晚」要 134px 却只有 125px，
   团期库存列「最近出发 2026-11-13」要 136.7px 却只有 134.9px，都在越界。 */
const PG = 'minmax(240px,1.6fr) minmax(140px,0.92fr) minmax(162px,0.98fr) minmax(164px,1fr) minmax(146px,0.95fr) minmax(136px,0.9fr) minmax(136px,0.9fr) minmax(96px,0.8fr)';
const PCOLS = ['产品信息', '产品属性', '目的地', '团期库存', '价格信息', '创建信息', '最近操作', '产品状态'];
/* 展示位（product.type）仍是数据库字段，小程序端靠它分区展示；
   管理侧只有臻品团一类产品，展示位对运营是冗余信息，2026-09-23 起不在后台界面出现。 */
/* 产品状态：新建保存后默认「待上架」，上架后小程序端才对客展示 */
const PSTAT = { draft: ['待上架', 'warn'], published: ['已上架', 'ok'], off: ['已下架', 'plain'] };

function Products() {
  const { arg, setArg } = usePage('/uom', 'prod');
  if (arg === 'settings') return <ProductSettings onBack={() => setArg(null)} />;
  if (arg === 'new') return <ProductEditor id={{ type: 'smallgroup' }} onBack={() => setArg(null)}
    onCommon={() => setArg('settings')} />;
  if (arg && arg.startsWith('edit-')) return <ProductEditor id={arg.slice(5)} onBack={() => setArg(null)}
    onCommon={() => setArg('settings')} />;
  if (arg) return <ProductDetail id={arg} onBack={() => setArg(null)} onEdit={() => setArg('edit-' + arg)}
    onCommon={() => setArg('settings')} />;
  return <ProductList go={setArg} />;
}

function ProductList({ go }) {
  const toast = useToast();
  const { d: list, reload } = useData(() => get('/api/uom/products'), [], []);
  const [fv, setFv] = useState({});
  const [fpOpen, setFpOpen] = useState(false);
  const [tab, setTab] = useState('all');
  const [sort, setSort] = useState('created');
  const [busy, setBusy] = useState(false);
  const all = list || [];
  const uniq = f => [...new Set(all.map(f).filter(Boolean))];

  const nextCal = p => {
    const t = new Date().toISOString().slice(0, 10);
    return (p.cals || []).filter(c => c.date >= t).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  };
  const gross = p => (p.price_from || 0) - (p.settle_price || 0);
  const rate = p => p.price_from ? Math.round(gross(p) / p.price_from * 1000) / 10 : 0;

  const FIELDS = [
    { k: 'q', t: '产品名称 / 编码', ph: '支持模糊匹配' },
    { k: 'dest', t: '目的地', type: 'sel', opts: uniq(p => p.dest) },
    { k: 'region', t: '区域', type: 'sel', opts: uniq(p => p.region) },
    { k: 'tt', t: '旅游类型', type: 'sel', opts: ['境外游', '境内游'] },
    { k: 'pt', t: '产品类型', type: 'sel', opts: ['跟团游', '半自助', '私家团', '定制游'] },
    { k: 'sup', t: '供应商', type: 'sel', opts: uniq(p => p.supplier_name) },
    { k: 'cby', t: '创建人', type: 'sel', opts: uniq(p => p.created_by) },
    { k: 'uby', t: '最近操作人', type: 'sel', opts: uniq(p => p.updated_by) },
    { k: 'from', t: '出发城市', type: 'sel', opts: uniq(p => p.from_city) },
    { k: 'st', t: '上架状态', type: 'sel', opts: Object.values(PSTAT).map(x => x[0]) },
    { k: 'zst', t: '众信销售状态', type: 'sel', opts: ['在售', '停售', '未绑定'] },
    { k: 'go', t: '出发日期', type: 'dr' },
    { k: 'hascal', t: '仅看有可售团期', type: 'ck' },
  ];

  const byFilt = useMemo(() => all.filter(p => {
    const has = (k, v) => !fv[k] || String(v || '') === fv[k];
    if (fv.q && !`${p.title}${p.subtitle}${p.zx_code || ''}${p.code || ''}`.toLowerCase().includes(fv.q.toLowerCase())) return false;
    if (!has('dest', p.dest) || !has('region', p.region)) return false;
    if (!has('tt', p.travel_type) || !has('pt', p.product_type)) return false;
    if (!has('sup', p.supplier_name) || !has('from', p.from_city)) return false;
    if (!has('cby', p.created_by) || !has('uby', p.updated_by)) return false;
    if (fv.st && (PSTAT[p.status] || PSTAT.draft)[0] !== fv.st) return false;
    if (fv.zst && (p.zx_code ? (p.zx_sale_status || '在售') : '未绑定') !== fv.zst) return false;
    if (fv.go_a || fv.go_b) {
      const cs = (p.cals || []).map(c => c.date);
      if (!cs.some(d => (!fv.go_a || d >= fv.go_a) && (!fv.go_b || d <= fv.go_b))) return false;
    }
    if (fv.hascal && !(p.cals || []).length) return false;
    return true;
  }), [all, fv]);

  /* 页签只按上架状态分，其余条件走筛选面板，避免页签变成第二套筛选 */
  const QUICK = [
    ['all', '全部', () => true],
    ['draft', '待上架', p => p.status === 'draft'],
    ['published', '已上架', p => p.status === 'published'],
    ['off', '已下架', p => p.status === 'off'],
  ];
  const TABS = QUICK;
  const rows = useMemo(() => {
    const q = QUICK.find(x => x[0] === tab);
    const l = byFilt.filter(p => !q || q[0] === 'all' || q[2](p));
    const cmp = {
      new: (a, b) => (b.created_at || '').localeCompare(a.created_at || ''),
      price: (a, b) => (b.price_from || 0) - (a.price_from || 0),
      rate: (a, b) => rate(b) - rate(a),
      go: (a, b) => ((nextCal(a) || {}).date || '9999').localeCompare((nextCal(b) || {}).date || '9999'),
      created: (a, b) => (b.created_at || '').localeCompare(a.created_at || ''),
      updated: (a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''),
    };
    return [...l].sort(cmp[sort] || cmp.created);
  }, [byFilt, tab, sort]);

  const STAT = [
    ['产品总数', rows.length + ' 条'],
    ['已上架', byFilt.filter(p => p.status === 'published').length + ' 条', 'g'],
    ['待上架', byFilt.filter(p => p.status === 'draft').length + ' 条', 'r'],
    ['已下架', byFilt.filter(p => p.status === 'off').length + ' 条'],
    ['众信已停售', byFilt.filter(p => p.zx_sale_status === '停售').length + ' 条',
      byFilt.some(p => p.zx_sale_status === '停售') ? 'r' : ''],
    ['覆盖目的地', uniq(p => p.dest).length + ' 个'],
    ['平均毛利率', (byFilt.length ? Math.round(byFilt.reduce((a, p) => a + rate(p), 0) / byFilt.length * 10) / 10 : 0) + '%', 'g'],
  ];

  const remove = async p => {
    if (!window.confirm(`确认删除产品「${p.title}」？删除后小程序端立即不可见，且不可恢复。`)) return;
    await del('/api/uom/products/' + p.id); toast('产品已删除'); reload();
  };
  const setStatus = async (p, st) => {
    await post('/api/uom/products', { ...p, status: st });
    toast('产品已' + (PSTAT[st] || [])[0].replace('待', '置为待')); reload();
  };
  const miniUrl = p => `${location.origin}${location.pathname}#/mini/product/${p.id}`;
  const copyLink = p => {
    navigator.clipboard ? navigator.clipboard.writeText(miniUrl(p)).then(() => toast('小程序产品详情链接已复制')) : toast(miniUrl(p));
  };
  /* 预览：新开一个窗口打开小程序产品详情页，所见即客人所见 */
  const preview = p => window.open(miniUrl(p), '_blank', 'noopener');

  /* 分享给客人：和小程序里的 TOC 详情页不是一个东西 ——
     客人从销售手里拿到链接时关心的是「多少钱、哪天走、每天吃住行怎么安排、走到哪一步」，
     所以要先把人数、日期、进度填上，链接里带着这几个参数。 */
  const [share, setShare] = useState(null);
  const shareUrl = s2 => {
    const q = [`pax=${s2.pax}`, s2.child ? `child=${s2.child}` : '', s2.date ? `date=${s2.date}` : '',
      s2.step ? `step=${s2.step}` : '', s2.sales ? `sales=${encodeURIComponent(s2.sales)}` : '']
      .filter(Boolean).join('&');
    return `${location.origin}${location.pathname}#/share/${s2.id}?${q}`;
  };
  const openShare = p => setShare({
    id: p.id, title: p.title, pax: p.group_size && p.group_size < 10 ? p.group_size : 2, child: 0,
    date: ((p.cals || []).find(c => c.date >= new Date().toISOString().slice(0, 10)) || {}).date || '',
    step: 0, sales: '', price: p.price_from || 0, childPrice: p.child_price || Math.round((p.price_from || 0) * 0.75),
    cals: p.cals || [], days: p.days,
  });
  const syncOne = async p => {
    try { const r = await post(`/api/uom/products/${p.id}/sync-cal`, {}); toast(`已同步 ${r.cals} 个团期`); reload(); }
    catch (e) { toast(e.message); }
  };
  const syncAll = async () => {
    if (busy) return; setBusy(true);
    try { const r = await post('/api/uom/products/sync-all', {}); toast(`已同步 ${r.n} / ${r.total} 条产品的团期与价格`); reload(); }
    catch (e) { toast(e.message); }
    setBusy(false);
  };

  return (<div className="op">
    <section className="mod">
      <div className="mod-h"><h3>筛选条件</h3><span className="en">Filter</span></div>
      <div className="mod-b">
        <FiltPanel fields={FIELDS} val={fv} onChange={setFv} open={fpOpen} setOpen={setFpOpen} />
      </div>
    </section>

    <section className="mod">
      <div className="mod-h"><h3>定制产品列表</h3><span className="en">Products</span>
        <div className="mod-stat">{STAT.map(([k, v, c]) => <i key={k}>{k}：<b className={c || ''}>{v}</b></i>)}</div>
      </div>
      <div className="op-tabs">
        {TABS.map(([k, t, fn]) => (
          <a key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {t}<b>{k === 'all' ? byFilt.length : byFilt.filter(fn).length}</b></a>))}
      </div>
      <div className="op-tool">
        <button className="tb" onClick={() => go('new')}>新建产品</button>
        <button className="tb" disabled={busy} onClick={syncAll}>{busy ? '同步中…' : '同步众信产品数据'}</button>
        <button className="tb" onClick={() => go('settings')}>公共配置</button>
        <button className="tb" onClick={reload}>刷新列表</button>
        <span className="cnt">共 {rows.length} 条</span>
        <select className="srt" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="created">按创建时间倒序</option>
          <option value="updated">按最近操作时间倒序</option>
          <option value="go">按最近出发日期</option>
          <option value="price">按零售价由高到低</option>
          <option value="rate">按毛利率由高到低</option>
        </select>
      </div>

      <div className="ol-head" style={{ gridTemplateColumns: PG }}>
        {PCOLS.map(c => <span key={c}>{c}</span>)}
      </div>

      {!rows.length ? <div className="op-empty">没有符合条件的产品</div> : rows.map(p => {
        const c = nextCal(p), st = PSTAT[p.status] || PSTAT.draft;
        return (<div className="ol-row" key={p.id}>
          <div className="ol-sub">
            <span className="f">产品编号 <b className="mono">{p.code || '—'}</b></span>
            {p.zx_code && <span className="f">众信编码 <b className="mono">{p.zx_code}</b></span>}
            <span className="f">供应商 <b>{p.supplier_name || '暂未指定'}</b></span>
            {p.zx_sale_status === '停售' && <span className="tag bad">众信已停售 · 小程序端已自动下架</span>}
            <a className="more" onClick={() => go(p.id)}>查看详情 ›</a>
          </div>
          <div className="ol-cells" style={{ gridTemplateColumns: PG }}>
            <div className="c">
              <div className="oc-p">
                {p.cover ? <img src={oimg(p.cover, 300)} alt="" /> : <span className="ph"><Icon n="img" s={15} c="var(--muted-2)" /></span>}
                <div className="tx">
                  <div className="nm" onClick={() => go(p.id)}>{p.title}</div>
                  <div className="oc-s">{p.subtitle || '—'}</div>
                  <div className="oc-tags">{(p.tags || []).slice(0, 3).map(t => <em key={t}>{t}</em>)}</div>
                </div>
              </div>
            </div>
            <div className="c">
              <div className="oc-r"><i>旅游类型</i><b>{p.travel_type || '—'}</b></div>
              <div className="oc-r"><i>产品类型</i><b>{p.product_type || '—'}</b></div>
              <div className="oc-r"><i>所属品牌</i><b className="mu">{p.brand || '—'}</b></div>
            </div>
            <div className="c">
              <div className="oc-r"><i>目的地</i><b>{p.dest}</b></div>
              <div className="oc-r"><i>所属区域</i><b className="mu">{p.region}</b></div>
              <div className="oc-r"><i>行程天数</i><b>{p.days} 天{p.nights ? ` ${p.nights} 晚` : ''}</b></div>
              <div className="oc-r"><i>出发城市</i><b className="mu">{p.from_city || '—'}</b></div>
            </div>
            <div className="c">
              <div className="oc-r"><i>最近出发</i><b>{c ? c.date : '—'}</b></div>
              <div className="oc-r"><i>可售余位</i><b className={c && c.stock <= 4 ? 'r' : ''}>{c ? c.stock + ' 位' : '—'}</b></div>
              <div className="oc-r"><i>团期总数</i><b className="mu">{(p.cals || []).length} 个</b></div>
              <div className="oc-r"><i>成团人数</i><b className="mu">{p.group_size || 8} 人</b></div>
            </div>
            <div className="c">
              <div className="oc-r"><i>零售价</i><b>{money(p.price_from)}</b></div>
              <div className="oc-r"><i>结算价</i><b className="w">{money(p.settle_price)}</b></div>
              <div className="oc-r"><i>单房差</i><b className="mu">{p.single_room ? money(p.single_room) : '—'}</b></div>
              <div className="oc-r"><i>毛利率</i><b className={gross(p) < 0 ? 'r' : 'g'}>{rate(p)}%</b></div>
            </div>
            <div className="c">
              <div className="oc-v"><i>创建人</i><b>{p.created_by || '—'}</b></div>
              <div className="oc-v"><i>创建时间</i><b className="mu">{(p.created_at || '—').slice(0, 16)}</b></div>
            </div>
            <div className="c">
              <div className="oc-v"><i>最近操作人</i><b>{p.updated_by || '—'}</b></div>
              <div className="oc-v"><i>最近操作时间</i><b className="mu">{(p.updated_at || '—').slice(0, 16)}</b></div>
            </div>
            <div className="c">
              <div className="oc-v"><i>上架状态</i><span className={'tag ' + st[1]}>{st[0]}</span></div>
              <div className="oc-v"><i>众信销售状态</i>
                <span className={'tag ' + (p.zx_sale_status === '停售' ? 'bad' : p.zx_code ? 'ok' : 'plain')}>
                  {p.zx_code ? (p.zx_sale_status || '在售') : '未绑定'}</span></div>
            </div>
          </div>
          <div className="ol-ops">
            <button className="ob" onClick={() => preview(p)}>预览</button>
            <button className="ob g" onClick={() => openShare(p)}>分享给客人</button>
            <button className="ob" onClick={() => copyLink(p)}>复制小程序链接</button>
            {p.zx_code && <button className="ob" onClick={() => syncOne(p)}>同步团期</button>}
            <button className="ob r" onClick={() => remove(p)}>删除</button>
            {p.status !== 'published' && <button className="ob" onClick={() => setStatus(p, 'published')}>上架</button>}
            {p.status === 'published' && <button className="ob" onClick={() => setStatus(p, 'off')}>下架</button>}
            <button className="ob p" onClick={() => go('edit-' + p.id)}>编辑产品</button>
          </div>
        </div>);
      })}
      <div className="op-ft">
        共 {rows.length} 条 · 定制流程与服务背书为全平台共用内容，在「公共配置」中统一维护；
        费用说明、出行人要求等逐产品不同的内容，请在各产品的「补充说明」中维护
      </div>
    </section>

    {/* 分享给客人：先定人数、日期与当前进度，再生成链接。
        客人打开看到的是销售视角那一版——有进度、有按人数算好的总价、
        每天的三餐交通酒店，和小程序里的 TOC 详情页不是同一个页面。 */}
    <Modal open={!!share} onClose={() => setShare(null)} title="分享给客人"
      sub={share ? share.title : ''} width={560}>
      {share && (() => {
        const total = share.price * share.pax + share.childPrice * share.child;
        const url = shareUrl(share);
        const set = (k, v) => setShare(o => ({ ...o, [k]: v }));
        return (<div className="sh-dlg">
          <div className="r"><label>出行人数</label>
            <div className="in">
              <div className="num"><span>成人</span>
                <button onClick={() => set('pax', Math.max(1, share.pax - 1))}>−</button>
                <b>{share.pax}</b>
                <button onClick={() => set('pax', Math.min(60, share.pax + 1))}>+</button></div>
              <div className="num"><span>儿童</span>
                <button onClick={() => set('child', Math.max(0, share.child - 1))}>−</button>
                <b>{share.child}</b>
                <button onClick={() => set('child', Math.min(30, share.child + 1))}>+</button></div>
            </div></div>
          <div className="r"><label>出发日期</label>
            <div className="in">
              {share.cals.length > 0 && (
                <select className="inp" value={share.date} onChange={e => set('date', e.target.value)}>
                  <option value="">不指定日期</option>
                  {share.cals.map(c => <option key={c.date} value={c.date}>{c.date}</option>)}
                </select>)}
              <input className="inp" type="date" value={share.date} onChange={e => set('date', e.target.value)} />
            </div></div>
          <div className="r"><label>当前进度</label>
            <div className="in"><div className="segs">
              {['行程报价', '签约合同', '支付订单'].map((t, i) => (
                <span key={t} className={share.step === i ? 'on' : ''} onClick={() => set('step', i)}>{t}</span>))}
            </div></div></div>
          <div className="r"><label>顾问署名</label>
            <div className="in"><input className="inp" value={share.sales} placeholder="选填，显示在页面底部"
              onChange={e => set('sales', e.target.value)} /></div></div>

          <div className="sum">
            <div><i>报价合计</i><b>{money(total)}</b></div>
            <s>{share.pax} 位成人 × {money(share.price)}
              {share.child ? ` + ${share.child} 位儿童 × ${money(share.childPrice)}` : ''}
              · {share.days} 天</s>
          </div>
          <div className="lnk"><input readOnly value={url} onFocus={e => e.target.select()} /></div>
          <div className="ops">
            <button className="btn btn-o" onClick={() => window.open(url, '_blank', 'noopener')}>预览客人所见</button>
            <button className="btn btn-p" onClick={() => {
              navigator.clipboard ? navigator.clipboard.writeText(url).then(() => toast('分享链接已复制，可直接发给客人'))
                : toast(url);
            }}>复制分享链接</button>
          </div>
        </div>);
      })()}
    </Modal>
  </div>);
}

/* ---------- 产品详情（只读查看）----------
   版式对齐签证业务线的产品详情（up-* 那套）：标题条 + 概览卡 →
   左侧锚点导航 + 右侧分区块纵向滚动，底部操作条常驻。
   不再做顶部页签切换——产品的四块内容（产品信息 / 行程详情 / 内容素材 / 补充说明）
   一屏之内连续读完，比来回点页签顺手。
   两块内容按唐美芳 2026-09-23 的要求从这里撤掉：
   · 团期与价格：以众信产品中心为准，这里只放一个跳转按钮，不二次回显，免得两边对不上；
   · 定制流程 / 服务背书：全平台共用，在「公共配置」里维护一份，不在每个产品里重复。 */
const PD_SECS = [['base', '产品信息'], ['trip', '行程详情'], ['media', '内容素材'], ['extra', '补充说明']];

function ProductDetail({ id, onBack, onEdit, onCommon }) {
  const toast = useToast();
  const { d: p, reload } = useData(() => get('/api/mini/products/' + id), [id]);
  const { d: cfg } = useData(() => get('/api/uom/settings'), [], null);
  const [cur, setCur] = useState('base');

  /* 锚点跟随滚动高亮：滚动容器是后台正文区 .adm-body，不是 window */
  const scroller = () => document.querySelector('.adm-body');
  const goSec = k => {
    const c = scroller(), el = document.getElementById('pd-' + k);
    if (!c || !el) return;
    setCur(k);
    c.scrollTo({ top: c.scrollTop + el.getBoundingClientRect().top - c.getBoundingClientRect().top - 10, behavior: 'smooth' });
  };
  useEffect(() => {
    const c = scroller();
    if (!c || !p) return;
    const onScroll = () => {
      /* 滚到底必须单独判断：最后一个区块通常不够高，顶不到判定线，
         不特判的话锚点会永远停在倒数第二项 */
      if (c.scrollTop + c.clientHeight >= c.scrollHeight - 4) { setCur(PD_SECS[PD_SECS.length - 1][0]); return; }
      const ct = c.getBoundingClientRect().top;
      let k = PD_SECS[0][0];
      PD_SECS.forEach(([s]) => {
        const el = document.getElementById('pd-' + s);
        if (el && el.getBoundingClientRect().top - ct <= 14) k = s;
      });
      setCur(k);
    };
    c.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => c.removeEventListener('scroll', onScroll);
  }, [p]);

  if (!p) return <div className="empty">正在打开产品…</div>;
  const st = PSTAT[p.status] || PSTAT.draft;
  const gross = (p.price_from || 0) - (p.settle_price || 0);
  const rate = p.price_from ? Math.round(gross / p.price_from * 1000) / 10 : 0;
  const no = p.code || p.id;
  const kv = (k, v) => (<div className="od-kv" key={k}><i>{k}</i><b>{v === 0 || v ? v : <span className="od-na">—</span>}</b></div>);
  const copyLink = () => {
    const url = `${location.origin}${location.pathname}#/mini/product/${p.id}`;
    navigator.clipboard ? navigator.clipboard.writeText(url).then(() => toast('小程序产品详情链接已复制')) : toast(url);
  };
  const setStatus = async s2 => {
    await post('/api/uom/products', { ...p, status: s2 });
    toast('产品已' + (PSTAT[s2] || [])[0].replace('待', '置为待')); reload();
  };
  /* 完整团期与价格在众信产品中心看，地址模板存在公共配置里（zx_url），
     不在本系统写死，换域名时不用改代码 */
  const zxUrl = () => ((cfg && cfg.zx_url) || '').replace('{code}', encodeURIComponent(p.zx_code || ''));
  const openZx = () => {
    if (!p.zx_code) return toast('这条产品还没有绑定众信产品编码');
    const u = zxUrl();
    if (!u) return toast('尚未配置众信产品详情地址模板，请在「公共配置」中维护');
    window.open(u, '_blank', 'noopener');
  };
  const zxBtn = (cls) => (
    <button className={cls} disabled={!p.zx_code} onClick={openZx}
      title={p.zx_code ? `在众信产品中心查看 ${p.zx_code} 的完整团期与价格（地址模板可在公共配置中维护）`
        : '未绑定众信产品编码'}>查看完整团期价格</button>);

  const days = p.itinerary || [];
  const hls = (p.highlights || []).map(h => (typeof h === 'string' ? h : h.t)).filter(Boolean);

  return (<div className="od">
    <div className="od-hd">
      <button className="back" onClick={onBack}><Icon n="back" s={14} />返回产品列表</button>
      <h2>产品详情</h2><span className="sub mono">产品编号 {no}</span>
    </div>
    <div className="od-top">
      <div className="od-top-h">
        {p.cover && <img className="od-cover" src={oimg(p.cover)} alt="" />}
        <div>
          <div className="od-no"><span className="ic"><Icon n="layers" s={14} /></span>
            产品编号：<b className="mono">{no}</b>
            <span className={'tag ' + st[1]}>{st[0]}</span>
            {p.zx_sale_status === '停售' && <span className="tag bad">众信已停售 · 小程序端已自动下架</span>}
          </div>
          <div className="od-pn">{p.title}</div>
          <div className="od-ptags">
            <em>{p.product_type}</em><em>{p.travel_type}</em><em>{p.region}</em>
            <em>{p.days} 天</em>{p.brand && <em>{p.brand}</em>}
          </div>
          <div className="od-pm">
            <span>产品副标题<b>{p.subtitle || '—'}</b></span>
            <span>供应商<b>{p.supplier_name || '—'}</b></span>
            {p.zx_code && <span>众信编码<b className="mono">{p.zx_code}</b></span>}
          </div>
        </div>
        <div className="od-topr">
          <div><i>零售价</i><b style={{ fontSize: 15 }}>{money(p.price_from)}</b></div>
          <div><i>结算价</i><b>{money(p.settle_price)}</b></div>
          <div><i>毛利率</i><b>{rate}%</b></div>
          <div><i>可售团期</i><b>{(p.cals || []).length} 个</b></div>
          <div className="zxg">{zxBtn('zxb')}
            <s>{p.zx_code ? '团期与价格以众信产品中心为准，本系统不二次回显' : '绑定众信编码后可直接跳转查看'}</s></div>
        </div>
      </div>
    </div>

    <div className="up-main">
      <nav className="up-rail">
        {PD_SECS.map(([k, t]) => (
          <a key={k} className={cur === k ? 'on' : ''} onClick={() => goSec(k)}>{t}</a>))}
      </nav>
      <div className="up-cont">
        <section className="up-sec" id="pd-base">
          <h4>产品信息</h4>
          <div className="od-grid bd">
            {kv('产品编号', <span className="mono">{no}</span>)}
            {kv('众信产品编码', p.zx_code ? <span className="mono">{p.zx_code}</span> : null)}
            {kv('上架状态', <span className={'tag ' + st[1]}>{st[0]}</span>)}
            {kv('众信销售状态', <span className={'tag ' + (p.zx_sale_status === '停售' ? 'bad' : p.zx_code ? 'ok' : 'plain')}>
              {p.zx_code ? (p.zx_sale_status || '在售') : '未绑定众信编码'}</span>)}
            {kv('最近同步时间', p.zx_synced_at)}
            {kv('旅游类型', p.travel_type)}{kv('产品类型', p.product_type)}
            {kv('目的地', p.dest)}{kv('所属区域', p.region)}{kv('出发城市', p.from_city)}
            {kv('行程天数', `${p.days} 天${p.nights ? ' ' + p.nights + ' 晚' : ''}`)}
            {kv('成团人数', (p.group_size || 8) + ' 人')}
            {kv('供应商', p.supplier_name)}{kv('所属品牌', p.brand)}{kv('排序权重', p.sort)}
            {kv('零售价', <b style={{ fontSize: 15 }}>{money(p.price_from)}</b>)}
            {kv('结算价', <b style={{ color: '#a8781f' }}>{money(p.settle_price)}</b>)}
            {kv('毛利额', <b className={gross < 0 ? 'r' : ''}>{money(gross)}</b>)}
            {kv('毛利率', <b className={gross < 0 ? 'r' : ''}>{rate}%</b>)}
            {kv('儿童价', p.child_price ? money(p.child_price) : null)}
            {kv('单房差', p.single_room ? money(p.single_room) : null)}
            {kv('产品标签', (p.tags || []).join('、'))}
          </div>
        </section>

        <section className="up-sec" id="pd-trip">
          <h4>行程详情</h4>
          {hls.length > 0 && (<>
            <div className="pd-sub">行程亮点</div>
            <div className="pd-hl">{hls.map((h, i) => (
              <div key={i}><span>{String(i + 1).padStart(2, '0')}</span><b>{h}</b></div>))}</div>
          </>)}
          {days.length > 0 && <div className="pd-sub">逐日行程</div>}
          <div className="pd-tl">
            {days.map((d, i) => (
              <div className="pd-tr" key={i}>
                <div className="ax"><span className="n">D{d.d || i + 1}</span></div>
                <div className="cd">
                  <div className="ch"><b>{d.title || `第 ${d.d || i + 1} 天`}</b>
                    {d.city && <em>{d.city}</em>}</div>
                  <div className="cb">
                    {d.pic && <img src={oimg(d.pic)} alt="" />}
                    <div className="tx">
                      {d.html ? <RichView html={d.html} />
                        : (d.items || []).length
                          ? <ul>{(d.items || []).map((x, j) => <li key={j}>{x}</li>)}</ul>
                          : <span className="na">当天行程内容待补充</span>}
                    </div>
                  </div>
                  <div className="cf">
                    {[['住宿', d.hotel], ['用餐', d.meals], ['特色体验', d.exp], ['当地美食', d.food]]
                      .map(([k, v]) => (<div key={k}><i>{k}</i><b>{v || <span className="na">—</span>}</b></div>))}
                  </div>
                </div>
              </div>))}
          </div>
          {!days.length && <div className="empty sm">暂无逐日行程内容</div>}
        </section>

        <section className="up-sec" id="pd-media">
          <h4>内容素材</h4>
          <div className="pd-sub">产品图片</div>
          {(p.cover || (p.gallery || []).length)
            ? <div className="pd-gal">
                {p.cover && <img src={oimg(p.cover)} alt="" />}
                {(p.gallery || []).map((g, i) => <img key={i} src={oimg(g, 300)} alt="" />)}
              </div>
            : <div className="empty sm">尚未上传产品图片</div>}
          {p.video && (<><div className="pd-sub">产品视频</div>
            <video src={p.video} controls
              style={{ width: 380, height: 214, background: '#000', borderRadius: 8, objectFit: 'contain' }} /></>)}
          {(p.spots || []).length > 0 && (<>
            <div className="pd-sub">特色景点</div>
            <div className="pd-gal">{(p.spots || []).map((sp, i) => (
              <div className="sp" key={i}>{sp.img && <img src={oimg(sp.img)} alt="" />}
                <b>{sp.n || sp.t || '—'}</b><span>{[sp.c, sp.d].filter(Boolean).join(' · ')}</span></div>))}</div>
          </>)}
        </section>

        <section className="up-sec" id="pd-extra">
          <h4>补充说明</h4>
          <div className="pd-sub">本产品单独维护，同步展示在小程序产品详情页</div>
          {p.extra ? <div className="pd-rich"><RichView html={p.extra} /></div>
            : <div className="empty sm">尚未填写补充说明，可在「编辑产品」中维护费用说明、出行人要求与退改约定</div>}
          <div className="pd-cmn">
            定制流程与服务保障为全平台共用内容，统一在公共配置中维护，不在单个产品里重复录入。
            <a onClick={onCommon}>前往公共配置查看 ›</a>
          </div>
        </section>
      </div>
    </div>

    <div className="od-bar">
      <div className="bar-ctx">产品 <span className="mono">{no}</span><s>{st[0]} · {p.dest} · {p.days} 天</s></div>
      <div className="bar-act">
        {zxBtn('ba')}
        <button className="ba" onClick={copyLink}>复制小程序链接</button>
        {p.status !== 'published' && <button className="ba" onClick={() => setStatus('published')}>上架</button>}
        {p.status === 'published' && <button className="ba" onClick={() => setStatus('off')}>下架</button>}
        <button className="ba p" onClick={onEdit}>编辑产品</button>
      </div>
    </div>
  </div>);
}


/* ---------- 公共配置：各产品共用的内容，统一维护一份 ---------- */
function ProductSettings({ onBack }) {
  const toast = useToast();
  const { d, reload } = useData(() => get('/api/uom/settings'), [], null);
  const [f, setF] = useState(null);
  const [tab, setTab] = useState('process');
  useEffect(() => { if (d) setF(JSON.parse(JSON.stringify(d))); }, [d]);
  if (!f) return <div className="empty">载入中…</div>;
  const set = (k, v) => setF(o => ({ ...o, [k]: v }));
  const setIn = (k, i, kk, v) => setF(o => { const a = [...(o[k] || [])]; a[i] = { ...a[i], [kk]: v }; return { ...o, [k]: a }; });
  const addIn = (k, item) => setF(o => ({ ...o, [k]: [...(o[k] || []), item] }));
  const delIn = (k, i) => setF(o => ({ ...o, [k]: (o[k] || []).filter((_, j) => j !== i) }));
  const save = async () => {
    try { await put('/api/uom/settings', f); toast('公共配置已保存，所有产品同步生效'); reload(); }
    catch (e) { toast(e.message); }
  };
  const TABS = [['process', '定制流程'], ['endorse', '服务背书'], ['zx', '众信跳转地址']];
  return (<div className="od">
    <div className="od-hd">
      <button className="back" onClick={onBack}><Icon n="back" s={14} />返回产品列表</button>
      <h2>公共配置</h2><span className="sub">定制流程 / 服务背书 / 众信跳转地址 —— 全平台共用一份，保存后所有产品与小程序端同步生效</span>
    </div>
    <div className="od-tabs">
      {TABS.map(([k, t]) => <a key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</a>)}
    </div>
    <div className="od-sec">
      <div className="hd"><h3>{(TABS.find(x => x[0] === tab) || [])[1]}</h3>
        <span className="sub">{{
          process: '小程序产品详情页的「定制流程」，向客人说明从咨询到出行的服务步骤',
          endorse: '小程序产品详情页底部的服务保障四宫格',
          zx: '产品详情页「查看完整团期价格」按钮跳转的众信产品中心地址模板',
        }[tab]}</span></div>
      <div className="pad">
        {tab === 'process' && (<>
          {(f.process || []).map((x, i) => (
            <div className="set-row" key={i}>
              <span className="n">{i + 1}</span>
              <input className="inp" style={{ width: 170 }} value={x.t || ''} placeholder="步骤名称"
                onChange={e => setIn('process', i, 't', e.target.value)} />
              <input className="inp" value={x.d || ''} placeholder="该步骤的服务内容与时效说明"
                onChange={e => setIn('process', i, 'd', e.target.value)} />
              <button className="x" onClick={() => delIn('process', i)}>✕</button>
            </div>))}
          <button className="btn btn-o btn-s" onClick={() => addIn('process', { t: '', d: '' })}>
            <Icon n="plus" s={14} />新增流程步骤</button>
        </>)}
        {tab === 'endorse' && (<>
          {(f.endorse || []).map((x, i) => (
            <div className="set-row" key={i}>
              <span className="n">{i + 1}</span>
              <input className="inp" style={{ width: 170 }} value={x.t || ''} placeholder="背书标题，如：深交所上市企业"
                onChange={e => setIn('endorse', i, 't', e.target.value)} />
              <input className="inp" value={x.d || ''} placeholder="背书说明文案"
                onChange={e => setIn('endorse', i, 'd', e.target.value)} />
              <button className="x" onClick={() => delIn('endorse', i)}>✕</button>
            </div>))}
          <button className="btn btn-o btn-s" onClick={() => addIn('endorse', { t: '', d: '' })}>
            <Icon n="plus" s={14} />新增服务背书</button>
        </>)}
        {tab === 'zx' && (<>
          <div className="set-row">
            <input className="inp" value={f.zx_url || ''} placeholder="https://uom.uuxlink.com/#/product/detail?productNum={code}"
              onChange={e => set('zx_url', e.target.value)} />
          </div>
          <div className="od-tip" style={{ padding: '4px 0 0' }}>
            模板里的 <span className="mono">{'{code}'}</span> 会被替换成该产品绑定的众信产品编码。
            后台产品详情页的「查看完整团期价格」按钮按这个模板新开窗口跳转；
            团期与价格以众信产品中心为准，本系统不再二次回显，避免两边数据不一致。
            <br />当前默认值来自本系统预设，<b>尚未与众信产品中心核对过</b>，
            如跳转打不开，请把总部产品中心产品详情页的真实地址填到这里。
          </div>
        </>)}
      </div>
    </div>
    <div className="od-bar">
      <div className="bar-ctx">公共配置<s>保存后所有产品与小程序端同步生效</s></div>
      <div className="bar-act">
        <button className="ba" onClick={onBack}>取消</button>
        <button className="ba p" onClick={save}>保存</button>
      </div>
    </div>
  </div>);
}

/* 从众信产品库按编码拉产品：输入 U 开头的产品编号，自动带出经营字段与行程内容。
   线上接总部产品中心的 search_products（productNum 精确匹配），这里先走库内镜像。 */
function ZxImport({ onPick }) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [sug, setSug] = useState([]);
  const [open, setOpen] = useState(false);
  const pull = async c => {
    const v = (c || code).trim().toUpperCase();
    if (!v) return toast('请先输入众信产品编码');
    setBusy(true);
    try {
      const r = await get('/api/uom/zx/' + v);
      onPick(r.product); setOpen(false); setCode(v);
      toast(`已导入「${r.product.title}」，可继续编辑后保存`);
    } catch (e) { toast(e.message); }
    setBusy(false);
  };
  const search = async q => {
    setCode(q); setOpen(true);
    if (!q) { setSug([]); return; }
    try { setSug(await get('/api/uom/zx/search?q=' + encodeURIComponent(q))); } catch (e) { setSug([]); }
  };
  return (<div className="zx">
    <div className="zx-l"><Icon n="box" s={15} c="var(--accent)" />
      <b>从众信产品库导入</b>
      <span>输入众信产品编码（U 开头 + 6～12 位数字），系统自动带出产品属性、价格、团期与行程内容</span></div>
    <div className="zx-r">
      <div className="zx-in">
        <input className="inp" value={code} placeholder="例如 U386322"
          onChange={e => search(e.target.value)}
          onFocus={() => { setOpen(true); if (!sug.length) search(code); }}
          onKeyDown={e => e.key === 'Enter' && pull()} />
        {open && !!sug.length && (
          <div className="zx-sug">
            {sug.map(x => (
              <div className="it" key={x.code} onClick={() => pull(x.code)}>
                <b className="mono">{x.code}</b>
                <span className="t">{x.title}</span>
                <span className="m">{x.dest} · {x.days} 天 · {x.product_type}</span>
                <span className="p">{money(x.retail)}</span>
              </div>))}
          </div>)}
      </div>
      <button className="btn btn-p btn-s" disabled={busy} onClick={() => pull()}>
        {busy ? '导入中…' : '导入产品'}</button>
    </div>
  </div>);
}

function ProductEditor({ id, onBack, onCommon }) {
  const toast = useToast();
  const isNew = typeof id === 'object';
  const { d: meta } = useData(() => get('/api/meta'), [], {});
  const { d: loaded } = useData(
    () => isNew ? Promise.resolve(null) : get('/api/mini/products/' + id), [id]);
  const [p, setP] = useState(null);
  useEffect(() => {
    if (isNew) setP({
      type: id.type || 'smallgroup', title: '', subtitle: '', dest: '', region: '欧洲',
      days: 8, nights: 7, price_from: 0, settle_price: 0, child_price: 0, single_room: 0,
      group_size: 8, from_city: '北京', travel_type: '境外游', product_type: '私家团',
      brand: '', supplier_id: '', supplier_name: '', zx_code: '',
      cover: '', gallery: [], tags: [], themes: [], highlights: [], spots: [], itinerary: [],
      process: [], endorse: [], cals: [], video: '', poster: '', status: 'draft', sort: 50, extra: '',
      depart: { date: '', size: 8, price: 0 },
    });
    else if (loaded) setP(JSON.parse(JSON.stringify(loaded)));
  }, [isNew, loaded]);
  if (!p) return <div className="empty">载入中…</div>;
  const grp = p.type === 'smallgroup';
  const set = (k, v) => setP(o => ({ ...o, [k]: v }));
  const setIn = (k, i, kk, v) => setP(o => { const a = [...(o[k] || [])]; a[i] = { ...a[i], [kk]: v }; return { ...o, [k]: a }; });
  const addIn = (k, item) => setP(o => ({ ...o, [k]: [...(o[k] || []), item] }));
  const delIn = (k, i) => setP(o => ({ ...o, [k]: (o[k] || []).filter((_, j) => j !== i) }));
  const save = async () => {
    if (!p.title) return toast('请填写产品名称');
    if (!p.dest) return toast('请选择目的地');
    try {
      await post('/api/uom/products', p);
      toast(p.status === 'published' ? '已保存，产品已在小程序端展示' : '已保存，产品当前为待上架状态');
      onBack();
    }
    catch (e) { toast(e.message); }
  };
  /* v57：这里原来有一份内联的表单行组件 L —— 和内容编辑器犯的是同一个错：
     定义在组件函数体内，每次 render 都是全新的组件类型，React 会卸载重建整棵 .pe-line
     子树，产品编辑页的所有输入框都是敲一个字就丢焦点。已删除，改用模块作用域的 L。 */
  return (<>
    <div className="pe-top">
      <button className="btn btn-o btn-s" onClick={onBack}><Icon n="back" s={14} />返回列表</button>
      <h3>{isNew ? '新建定制产品' : '编辑定制产品'}</h3>
      {!isNew && <span className="tag">产品编号 {p.id}</span>}
      {p.zx_code && <span className="tag">众信编码 {p.zx_code}</span>}
      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
        经营字段与众信产品中心保持一致，内容字段对应小程序产品详情页</span>
    </div>

    <ZxImport onPick={d => setP(o => ({
      ...o, ...d, zx_code: d.code,
      // 已经填过的内容不被覆盖，只补空位
      title: o.title || d.title, subtitle: o.subtitle || d.subtitle,
      cover: o.cover || d.cover,
      gallery: (o.gallery || []).length ? o.gallery : d.gallery,
      highlights: (o.highlights || []).length ? o.highlights : d.highlights,
      itinerary: (o.itinerary || []).length ? o.itinerary : d.itinerary,
      tags: (o.tags || []).length ? o.tags : d.tags,
      type: o.type || 'smallgroup', status: o.status || 'on', sort: o.sort || 50,
    }))} />

    <div className="pe-sec">
      <div className="hd"><i /><b>基本信息</b><span>对应小程序产品详情页的标题区</span></div>
      <L label="产品名称" req><input className="inp" value={p.title} onChange={e => set('title', e.target.value)}
        placeholder={grp ? '【星月之国】土耳其 8 晚 9 天' : '冰岛环岛 · 追光者'} /></L>
      <L label="产品副标题"><input className="inp" value={p.subtitle} onChange={e => set('subtitle', e.target.value)}
        placeholder="一句话概括产品特色，展示在小程序详情页标题下方" /></L>
      <div style={{ display: 'flex', gap: 0 }}>
        <div style={{ flex: 1 }}><L label="目的地" req>
          <select className="inp" value={p.dest} onChange={e => {
            const d = (meta.dests || []).find(x => x.name === e.target.value);
            setP(o => ({ ...o, dest: e.target.value, region: d?.region || o.region, cover: o.cover || d?.cover || '' }));
          }}><option value="">请选择</option>{(meta.dests || []).map(d => <option key={d.key}>{d.name}</option>)}
            {p.dest && !(meta.dests || []).some(d => d.name === p.dest) && <option>{p.dest}</option>}</select></L></div>
        <div style={{ flex: 1 }}><L label="所属区域"><select className="inp" value={p.region} onChange={e => set('region', e.target.value)}>
          {['欧洲', '亚洲', '中东非', '美洲', '大洋洲', '海岛'].map(r => <option key={r}>{r}</option>)}</select></L></div>
      </div>
      <div style={{ display: 'flex' }}>
        <div style={{ flex: 1 }}><L label="行程天数"><input className="inp" type="number" value={p.days} onChange={e => set('days', +e.target.value)} /></L></div>
        <div style={{ flex: 1 }}><L label="主推出发日期"><input className="inp" value={p.depart?.date || ''}
          onChange={e => set('depart', { ...(p.depart || {}), date: e.target.value, size: p.group_size || 8 })}
          placeholder="小程序列表卡片展示的出发信息，如：09月30日" /></L></div>
      </div>
      <L label="产品标签"><input className="inp" value={(p.tags || []).join('、')}
        onChange={e => set('tags', e.target.value.split(/[、,，\s]+/).filter(Boolean))}
        placeholder="以顿号分隔，如：臻品团、品质纯玩、特色酒店" /></L>
      <div style={{ display: 'flex' }}>
        <div style={{ flex: 1 }}><L label="上架状态"><select className="inp" value={p.status || 'draft'} onChange={e => set('status', e.target.value)}>
          <option value="draft">待上架</option><option value="published">已上架（小程序端对客展示）</option>
          <option value="off">已下架</option></select></L></div>
        <div style={{ flex: 1 }}><L label="排序权重"><input className="inp" type="number" value={p.sort}
          onChange={e => set('sort', +e.target.value)} /><s className="pe-tip">数值越大，在小程序列表中的展示位置越靠前</s></L></div>
      </div>
    </div>

    <div className="biz-ro">
      <div className="h"><Icon n="box" s={14} c="var(--accent)" /><b>经营信息</b>
        <span>产品属性、价格信息、团期与库存均由众信产品库同步，本页面仅作展示；
          如需调整请在总部产品中心维护后，回到产品列表点击「同步团期」拉取最新数据。</span>
        {p.zx_code ? <em className="ok">已绑定 {p.zx_code}</em> : <em className="warn">未绑定众信编码</em>}
      </div>
      <div className="g">
        {[['旅游类型', p.travel_type], ['产品类型', p.product_type], ['出发城市', p.from_city],
          ['行程晚数', p.nights ? p.nights + ' 晚' : null], ['成团人数', (p.group_size || 8) + ' 人'],
          ['供应商', p.supplier_name], ['所属品牌', p.brand],
          ['零售价', money(p.price_from)], ['结算价', money(p.settle_price)],
          ['儿童价', p.child_price ? money(p.child_price) : null], ['单房差', p.single_room ? money(p.single_room) : null],
        ].map(([k, v]) => <div key={k}><i>{k}</i><b>{v || <span className="na">—</span>}</b></div>)}
      </div>
      <div className="g2">
        <div className="mg">毛利额 <b>{money((p.price_from || 0) - (p.settle_price || 0))}</b>
          　毛利率 <b className={(p.price_from || 0) - (p.settle_price || 0) < 0 ? 'r' : ''}>
            {p.price_from ? Math.round(((p.price_from - (p.settle_price || 0)) / p.price_from) * 1000) / 10 : 0}%</b></div>
        <div className="cal-ro">
          {(p.cals || []).length
            ? <>{(p.cals || []).slice(0, 6).map((c, ci) => (
                <span className="c" key={ci}>{c.date}<em>{money(c.price)}</em><s>{c.stock} 位</s></span>))}
              {(p.cals || []).length > 6 && <span className="c more">共 {(p.cals || []).length} 个团期</span>}</>
            : <span className="none">暂无团期数据</span>}
        </div>
      </div>
    </div>

    <div className="pe-sec">
      <div className="hd"><i /><b>视频与图片</b><span>对应小程序详情页顶部的视频、封面与产品图</span></div>
      <L label="产品视频"><VideoUpload value={p.video} onChange={v => set('video', v)}
        tip="支持上传 mp4（≤40MB），或填写已有视频地址；未上传时详情页仅展示封面图" /></L>
      <L label="封面图" req><ImgUpload value={p.cover} onChange={v => set('cover', v)}
        tip="建议尺寸 750×500，用于详情页顶部与各列表卡片" /></L>
      <L label="产品图"><ImgUpload value={p.gallery} onChange={v => set('gallery', v)} multiple
        tip="详情页标签下方的横滑图组，建议上传 3–5 张" /></L>
    </div>

    <div className="pe-sec">
      <div className="hd"><i /><b>行程亮点</b><span>对应详情页「行程亮点」编号列表</span></div>
      <div className="pe-rows">
        {(p.highlights || []).map((h, i) => (
          <div className="r" key={i}>
            <span className="no">{String(i + 1).padStart(2, '0')}</span>
            <input className="inp" value={h} onChange={e => set('highlights', p.highlights.map((x, j) => j === i ? e.target.value : x))} />
            <span className="x" onClick={() => delIn('highlights', i)}><Icon n="trash" s={15} /></span>
          </div>))}
        <button className="mc-add" onClick={() => addIn('highlights', '')}><Icon n="plus" s={15} c="var(--accent)" />新增亮点</button>
      </div>
    </div>

    <div className="pe-sec">
      <div className="hd"><i /><b>特色景点</b><span>对应详情页「特色景点」列表</span></div>
      <div className="pe-rows">
        {(p.spots || []).map((sp, i) => (
          <div className="r" key={i}>
            <span className="no">{String(i + 1).padStart(2, '0')}</span>
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 8 }}>
              <input className="inp" value={sp.n || ''} placeholder="景点名称" onChange={e => setIn('spots', i, 'n', e.target.value)} />
              <input className="inp" value={sp.c || ''} placeholder="所在城市" onChange={e => setIn('spots', i, 'c', e.target.value)} />
              <input className="inp" value={sp.d || ''} placeholder="景点推荐说明" onChange={e => setIn('spots', i, 'd', e.target.value)} />
            </div>
            <span className="x" onClick={() => delIn('spots', i)}><Icon n="trash" s={15} /></span>
          </div>))}
        <button className="mc-add" onClick={() => addIn('spots', { n: '', c: '', d: '' })}><Icon n="plus" s={15} c="var(--accent)" />新增景点</button>
      </div>
    </div>

    <div className="pe-sec">
      <div className="hd"><i /><b>行程详情</b><span>按天编排，正文为富文本，小程序详情页按天展示</span></div>
      {(p.itinerary || []).map((d2, i) => (
        <div className="pe-day" key={i}>
          <div className="h"><span className="d">DAY {d2.d || i + 1}</span>
            <input className="inp" style={{ flex: 1 }} value={d2.title || ''} placeholder="当日行程标题"
              onChange={e => setIn('itinerary', i, 'title', e.target.value)} />
            <input className="inp" style={{ width: 120 }} value={d2.city || ''} placeholder="所在城市"
              onChange={e => setIn('itinerary', i, 'city', e.target.value)} />
            <span className="x" onClick={() => delIn('itinerary', i)}><Icon n="trash" s={15} /></span></div>
          <Rich value={d2.html || (d2.items || []).map(x => `<p>${x}</p>`).join('')}
            onChange={v => setIn('itinerary', i, 'html', v)} minH={130}
            placeholder="当日具体行程安排，支持加粗、分点与图片" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 9 }}>
            <input className="inp" value={d2.hotel || ''} placeholder="当日住宿" onChange={e => setIn('itinerary', i, 'hotel', e.target.value)} />
            <input className="inp" value={d2.meals || ''} placeholder="当日餐食" onChange={e => setIn('itinerary', i, 'meals', e.target.value)} />
            <input className="inp" value={d2.exp || ''} placeholder="特色体验" onChange={e => setIn('itinerary', i, 'exp', e.target.value)} />
          </div>
        </div>))}
      {!(p.itinerary || []).length && (
        <div className="trip-empty">
          暂无逐日行程。可从众信产品库导入完整行程，或按行程天数生成空白框架后逐日填写。
          <button className="btn btn-p btn-s" onClick={() => setP(o => ({
            ...o,
            itinerary: Array.from({ length: Math.max(1, +o.days || 8) }, (_, i) => ({
              d: i + 1, title: '', city: o.dest || '', html: '', hotel: '', meals: '', exp: '',
            })),
          }))}><Icon n="plus" s={14} c="#fff" />按 {p.days || 8} 天生成行程框架</button>
        </div>)}
      <button className="mc-add" onClick={() => addIn('itinerary', { d: (p.itinerary || []).length + 1, title: '', city: p.dest, html: '', hotel: '', meals: '', exp: '' })}>
        <Icon n="plus" s={15} c="var(--accent)" />新增一天</button>
    </div>

    <div className="pe-sec">
      <div className="hd"><i /><b>补充说明</b><span>本产品单独维护，展示在小程序产品详情页底部</span></div>
      <div className="pe-note">
        用于说明费用包含与不含、签证与出行人要求、退改约定等本产品特有的内容；
        各产品口径不同，因此不作为公共配置统一维护。
      </div>
      <Rich value={p.extra || ''} onChange={v => set('extra', v)} minH={220}
        placeholder="示例：费用包含 —— 全程机票、境外用车、指定星级酒店…；费用不含 —— 签证服务费、个人消费…；退改约定 —— 出发前 30 日以上取消…" />
    </div>

    <div className="pe-sec">
      <div className="hd"><i /><b>公共内容</b><span>定制流程 / 服务背书</span></div>
      <div className="pe-common">
        这两块内容为全平台产品共用，不在单个产品中维护。
        <a className="lnk" onClick={onCommon}>前往公共配置 ›</a>
      </div>
    </div>

    <div className="pe-bar">
      <button className="btn btn-o" onClick={onBack}>取消</button>
      <button className="btn btn-p" onClick={save}>保存产品</button>
    </div>
  </>);
}

/* ---------- 首页配置：列表 + 编辑（左预览 × 右模块配置） ---------- */
function HomeCfg() {
  const [edit, setEdit] = useState(null);
  return edit ? <PageEditor id={edit} onBack={() => setEdit(null)} />
              : <PageList onEdit={setEdit} />;
}

function PageList({ onEdit }) {
  const toast = useToast();
  const [qs, setQs] = useState({});
  const [fpOpen, setFpOpen] = useState(false);
  const { d: rows, reload } = useData(() => get('/api/uom/pages'), [], []);
  const toggle = async (id, v) => { await post(`/api/uom/pages/${id}/status`, { status: v }); toast(v ? '已启用' : '已停用'); reload(); };
  const copy = async id => { const r = await post(`/api/uom/pages/${id}/copy`); toast('已复制一份'); reload(); onEdit(r.id); };
  const remove = async id => {
    if (!window.confirm('确认删除这套配置吗？删除后不可恢复。')) return;
    try { await del('/api/uom/pages/' + id); toast('已删除'); reload(); } catch (e) { toast(e.message); }
  };
  const create = async () => {
    const base = (rows || [])[0];
    const cfg = base ? (await get('/api/uom/pages/' + base.id)).config : {};
    const r = await post('/api/uom/pages', { name: '新配置 ' + new Date().toLocaleDateString('zh-CN'), config: cfg, channels: ['优定制小程序'] });
    toast('已新建'); reload(); onEdit(r.id);
  };
  const FIELDS = [
    { k: 'name', t: '配置名称', ph: '请输入名称' },
    { k: 'creator', t: '创建人', ph: '请输入创建人' },
    { k: 'channel', t: '适用渠道', type: 'sel', opts: ['优定制小程序', '有米小程序'] },
    { k: 'status', t: '状态', type: 'sel', opts: ['启用', '停用'] },
  ];
  const list = (rows || []).filter(r => {
    if (qs.name && !(r.name || '').includes(qs.name)) return false;
    if (qs.creator && !(r.creator || '').includes(qs.creator)) return false;
    if (qs.channel && !(r.channels || []).includes(qs.channel)) return false;
    if (qs.status && (r.status ? '启用' : '停用') !== qs.status) return false;
    return true;
  });
  return (<div className="op">
    <section className="mod">
      <div className="mod-h"><h3>筛选条件</h3><span className="en">Filter</span></div>
      <div className="mod-b"><FiltPanel fields={FIELDS} val={qs} onChange={setQs} open={fpOpen} setOpen={setFpOpen} /></div>
    </section>

    <section className="mod">
      <div className="mod-h"><h3>首页配置方案</h3><span className="en">Home Pages</span>
        <div className="mod-stat">
          <i>方案：<b>{list.length} 套</b></i>
          <i>启用中：<b className="g">{list.filter(r => r.status).length} 套</b></i>
        </div>
      </div>
      <div className="op-tool">
        <button className="tb" onClick={create}>+ 新增配置</button>
        <button className="tb" onClick={reload}>刷新</button>
        <span className="cnt">共 {list.length} 套 · 小程序读取「启用」中的最新一套</span>
      </div>
      <table className="tbl">
        <thead><tr>
          <th>名称</th><th style={{ width: 88 }}>创建人</th><th style={{ width: 150 }}>创建日期</th>
          <th style={{ width: 88 }}>修改人</th><th style={{ width: 150 }}>更新日期</th>
          <th style={{ width: 150 }}>适用渠道</th><th style={{ width: 120 }}>生效 / 失效</th>
          <th style={{ width: 88 }}>状态</th><th style={{ width: 190 }}>操作</th>
        </tr></thead>
        <tbody>{list.map(r => (
          <tr key={r.id}>
            <td><b style={{ fontSize: 13.2 }}>{r.name}</b>{r.is_default ? <span className="tag" style={{ marginLeft: 7 }}>默认</span> : null}
              <div className="t2">{r.id} · {r.mods} 个模块</div></td>
            <td>{r.creator}</td><td className="t2">{r.created_at}</td>
            <td>{r.modifier}</td><td className="t2">{r.updated_at}</td>
            <td><div className="ch-list">{(r.channels || []).map(c => <span key={c}>{c}</span>)}</div></td>
            <td className="t2">{r.valid_from ? r.valid_from + ' 起' : '长期有效'}</td>
            <td><span className={'sw ' + (r.status ? 'on' : '')} onClick={() => toggle(r.id, !r.status)}><i /></span>
              <div className="t2">{r.status ? '启用' : '停用'}</div></td>
            <td><div className="lnks">
              <a onClick={() => onEdit(r.id)}>编辑</a>
              <a onClick={() => copy(r.id)}>复制配置</a>
              {!r.is_default && <a className="r" onClick={() => remove(r.id)}>删除</a>}
            </div></td>
          </tr>))}</tbody>
      </table>
      {!list.length && <div className="empty"><div className="ic">◎</div>暂无配置方案，请点击上方「新增配置」创建</div>}
    </section>
  </div>);
}

function PageEditor({ id, onBack }) {
  const toast = useToast();
  const { d, reload } = useData(() => get('/api/uom/pages/' + id), [id], null);
  const { d: lib } = useData(() => get('/api/uom/home'), [], {});   // 内容库：文章由「内容管理」维护
  const [h, setH] = useState(null);
  const [meta, setMeta] = useState(null);
  const [sel, setSel] = useState('banner');
  useEffect(() => { if (d) { setH(JSON.parse(JSON.stringify(d.config || {}))); setMeta({ name: d.name, channels: d.channels || [], status: d.status }); } }, [d]);
  if (!h || !meta) return <div className="empty">载入中…</div>;

  const mods = h.modules || [];
  const save = async () => {
    const { articles, ...cfg } = h;   // 文章是内容库，不随版面配置存快照
    try { await post('/api/uom/pages', { id, name: meta.name, channels: meta.channels, status: meta.status, config: cfg });
      toast('已保存，小程序刷新即生效'); reload(); } catch (e) { toast(e.message); }
  };
  const setArr = (key, i, k, v) => setH(o => { const a = [...(o[key] || [])]; a[i] = { ...a[i], [k]: v }; return { ...o, [key]: a }; });
  const addTo = (key, item) => setH(o => ({ ...o, [key]: [...(o[key] || []), item] }));
  const delFrom = (key, i) => setH(o => ({ ...o, [key]: (o[key] || []).filter((_, j) => j !== i) }));
  const moveIn = (key, i, dir) => setH(o => {
    const a = [...(o[key] || [])]; const j = i + dir; if (j < 0 || j >= a.length) return o;
    [a[i], a[j]] = [a[j], a[i]]; return { ...o, [key]: a };
  });
  const modOn = k => { const m = mods.find(x => x.k === k); return !m || m.on !== 0; };
  const toggleMod = k => setH(o => ({ ...o, modules: (o.modules || []).map(m => m.k === k ? { ...m, on: m.on ? 0 : 1 } : m) }));
  const moveMod = (k, dir) => setH(o => {
    const a = [...(o.modules || [])]; const i = a.findIndex(m => m.k === k); const j = i + dir;
    if (i < 0 || j < 0 || j >= a.length || a[i].fixed || a[j].fixed) return o;
    [a[i], a[j]] = [a[j], a[i]]; return { ...o, modules: a };
  });
  const ICONS = ['map','home','sun','users','heart','star','ticket','compass','shield','sparkle','chat','file','bag','img','grid','layers'];
  const MOD_T = k => (mods.find(m => m.k === k) || {}).t || k;

  const Mod = ({ k, children }) => (
    <div className={'vz-mod' + (sel === k ? ' on' : '') + (modOn(k) ? '' : ' off')} onClick={() => setSel(k)}>
      <span className="vz-tag">{MOD_T(k)}</span>
      <div className="vz-ops" onClick={e => e.stopPropagation()}>
        {!(mods.find(m => m.k === k) || {}).fixed && <>
          <button title="上移" onClick={() => moveMod(k, -1)}>↑</button>
          <button title="下移" onClick={() => moveMod(k, 1)}>↓</button></>}
        <button className={modOn(k) ? 'del' : ''} onClick={() => toggleMod(k)}>{modOn(k) ? '×' : '+'}</button>
      </div>
      {children}
    </div>
  );
  const PV = {
    search: <Mod k="search" key="search"><div className="pv-s"><span className="logo" /><span className="box">搜目的地 / 主题</span></div></Mod>,
    cats: <Mod k="cats" key="cats"><div className="pv-cats">
      <div className="pv-r1">{(h.cats || []).slice(0, 5).map(c => <div key={c.k}><i /><span>{c.t}</span></div>)}</div>
      <div className="pv-r2">{(h.cats || []).slice(5, 10).map(c => <span key={c.k}>{c.t}</span>)}</div></div></Mod>,
    banner: <Mod k="banner" key="banner"><div className="pv-bn">
      {(h.banners || [])[0] && <img src={oimg(h.banners[0].img)} alt="" />}
      <div className="t"><b>{(h.banners || [])[0]?.title}</b><span>{(h.banners || [])[0]?.sub}</span></div></div></Mod>,
    entries: <Mod k="entries" key="entries"><div className="pv-e3">
      {(h.entries || []).map(e => <div key={e.k}><b>{e.t}</b><span>{e.s}</span></div>)}</div></Mod>,
    ranking: <Mod k="ranking" key="ranking"><div className="pv-rk">
      <div className="l"><b>本周榜单</b>{(h.ranking || []).slice(0, 3).map(r => <div key={r.r}>{r.r}　{r.name}</div>)}</div>
      <div className="r"><div /><div /></div></div></Mod>,
    content: <Mod k="content" key="content"><div className="pv-ct">
      <div className="tabs">{(h.ctabs || []).slice(0, 4).map(t => <span key={t.k}>{t.t}</span>)}</div>
      <div className="grid">{(lib.articles || []).slice(0, 4).map(a => <div key={a.id}><img src={oimg(a.img, 300)} alt="" /></div>)}</div></div></Mod>,
    footer: <Mod k="footer" key="footer"><div className="pv-ft">
      <b>{h.brand?.name || '优定制 U-DESIGN'}</b><span>ZHONGXIN BESPOKE</span></div></Mod>,
  };
  const order = mods.length ? mods.map(m => m.k) : Object.keys(PV);

  /* 卡片行编辑：缩略图 + 字段 + 排序/删除（对齐参考图） */
  const Row = ({ img, onImg, children, i, arr, canDel = true }) => (
    <div className="mc-item">
      {img !== undefined && (
        <div className="mc-pic">
          <div className="im">{img ? <img src={oimg(img, 300)} alt="" /> : <Icon n="img" s={22} c="var(--muted-2)" />}</div>
          <ImgPick value={img} onChange={onImg} />
        </div>)}
      <div className="mc-fields">{children}</div>
      <div className="mc-ops">
        <button title="上移" onClick={() => moveIn(arr, i, -1)}><Icon n="up" s={15} /></button>
        <button title="下移" onClick={() => moveIn(arr, i, 1)}><Icon n="down" s={15} /></button>
        {canDel && <button className="del" title="删除" onClick={() => delFrom(arr, i)}><Icon n="trash" s={15} /></button>}
      </div>
    </div>
  );
  const F = ({ label, req, children }) => (
    <div className="mc-f"><span className="lb">{req && <b>*</b>}{label}</span><div className="in">{children}</div></div>
  );

  const Panel = () => {
    if (sel === 'banner') return (<>
      {(h.banners || []).map((b, i) => (
        <Row key={i} i={i} arr="banners" img={b.img} onImg={v => setArr('banners', i, 'img', v)}>
          <F label="主标题" req><input className="inp" value={b.title || ''} onChange={e => setArr('banners', i, 'title', e.target.value)} /></F>
          <F label="副标题"><input className="inp" value={b.sub || ''} onChange={e => setArr('banners', i, 'sub', e.target.value)} /></F>
          <F label="跳转类型">
            <select className="inp" value={b.linkType || 'dest'} onChange={e => setArr('banners', i, 'linkType', e.target.value)}>
              <option value="dest">目的地频道</option><option value="product">指定产品</option>
              <option value="url">链接地址</option><option value="none">不跳转</option></select></F>
          <F label="跳转内容"><input className="inp" value={b.link || ''} onChange={e => setArr('banners', i, 'link', e.target.value)}
            placeholder="目的地名称 / 产品 ID / 链接地址" /></F>
        </Row>))}
      <button className="mc-add" onClick={() => addTo('banners', { title: '新运营主题', sub: '一句话副标题', img: '', linkType: 'dest', link: '' })}>
        <Icon n="plus" s={15} c="var(--accent)" />新增一张轮播图</button>
    </>);
    if (sel === 'cats') return (<>
      {(h.cats || []).map((c, i) => (
        <Row key={i} i={i} arr="cats">
          <F label="分类名称" req><input className="inp" value={c.t || ''} onChange={e => setArr('cats', i, 't', e.target.value)} /></F>
          <F label="图标"><select className="inp" value={c.ic || 'map'} onChange={e => setArr('cats', i, 'ic', e.target.value)}>
            {ICONS.map(x => <option key={x}>{x}</option>)}</select></F>
          <F label="标识 key"><input className="inp" value={c.k || ''} onChange={e => setArr('cats', i, 'k', e.target.value)} /></F>
          <F label="展示位置"><span className="tag">{i < 5 ? '第 1 排图标卡 ' + (i + 1) : '第 2 排分栏 ' + (i - 4)}</span></F>
        </Row>))}
      <button className="mc-add" onClick={() => addTo('cats', { k: 'n' + Date.now().toString().slice(-4), t: '新分类', ic: 'map' })}>
        <Icon n="plus" s={15} c="var(--accent)" />新增分类</button>
    </>);
    if (sel === 'entries') return (<>
      {(h.entries || []).map((e, i) => (
        <Row key={i} i={i} arr="entries" canDel={(h.entries || []).length > 1}>
          <F label="标题" req><input className="inp" value={e.t || ''} onChange={e2 => setArr('entries', i, 't', e2.target.value)} /></F>
          <F label="副标题"><input className="inp" value={e.s || ''} onChange={e2 => setArr('entries', i, 's', e2.target.value)} /></F>
          <F label="图标"><select className="inp" value={e.ic || 'sparkle'} onChange={e2 => setArr('entries', i, 'ic', e2.target.value)}>
            {ICONS.map(x => <option key={x}>{x}</option>)}</select></F>
          <F label="跳转"><select className="inp" value={e.k} onChange={e2 => setArr('entries', i, 'k', e2.target.value)}>
            <option value="ai">AI 定制</option><option value="guide">攻略频道</option><option value="expert">提交需求</option></select></F>
        </Row>))}
    </>);
    if (sel === 'ranking') return (<>
      {(h.ranking || []).map((r, i) => (
        <Row key={i} i={i} arr="ranking">
          <F label="名次"><input className="inp" type="number" value={r.r || i + 1} onChange={e => setArr('ranking', i, 'r', +e.target.value)} /></F>
          <F label="目的地" req><input className="inp" value={r.name || ''} onChange={e => setArr('ranking', i, 'name', e.target.value)} /></F>
          <F label="热度文案"><input className="inp" value={r.hot || ''} onChange={e => setArr('ranking', i, 'hot', e.target.value)} placeholder="9.8万人想去" /></F>
          <F label="趋势"><select className="inp" value={r.trend || 'flat'} onChange={e => setArr('ranking', i, 'trend', e.target.value)}>
            <option value="up">上升</option><option value="flat">持平</option><option value="down">下降</option></select></F>
        </Row>))}
      <button className="mc-add" onClick={() => addTo('ranking', { r: (h.ranking || []).length + 1, name: '', hot: '', trend: 'flat' })}>
        <Icon n="plus" s={15} c="var(--accent)" />新增一名</button>
    </>);
    if (sel === 'content') return (<>
      <Row i={0} arr="_" canDel={false}>
        <F label="首页展示条数"><select className="inp" value={(h.feed && h.feed.limit) || 8}
          onChange={e => setH({ ...h, feed: { ...(h.feed || {}), limit: +e.target.value } })}>
          {[4, 6, 8, 10, 12].map(n => <option key={n} value={n}>{n} 条</option>)}</select></F>
        <F label="区块标题"><input className="inp" value={(h.feed && h.feed.title) || ''} placeholder="目的地攻略 · 玩法灵感"
          onChange={e => setH({ ...h, feed: { ...(h.feed || {}), title: e.target.value } })} /></F>
        <F label="背书文案"><input className="inp" value={(h.feed && h.feed.note) || ''} placeholder="定制顾问实地走访原创"
          onChange={e => setH({ ...h, feed: { ...(h.feed || {}), note: e.target.value } })} /></F>
      </Row>
      <div className="mc-note">
        首页内容流按「内容管理」里的顺序取前 N 条，客人点「进入攻略社区」可看全部
        <b>（共 {(lib.articles || []).length} 条）</b>。内容的标题、封面、正文请到「内容管理」里维护。
      </div>
      <div className="mc-preview">
        {(lib.articles || []).slice(0, (h.feed && h.feed.limit) || 8).map((a2, i) => (
          <div className="it" key={a2.id || i}>
            <img src={oimg(a2.img)} alt="" />
            <div className="tx"><b>{a2.t}</b><span>{a2.k} · {a2.by}</span></div>
          </div>))}
      </div>
    </>);
    if (sel === 'search') return (
      <Row i={0} arr="_" canDel={false}>
        <F label="品牌名" req><input className="inp" value={h.brand?.name || ''} onChange={e => setH({ ...h, brand: { ...h.brand, name: e.target.value } })} /></F>
        <F label="中文标语"><input className="inp" value={h.brand?.slogan || ''} onChange={e => setH({ ...h, brand: { ...h.brand, slogan: e.target.value } })} /></F>
        <F label="英文小字"><input className="inp" value={h.brand?.en || ''} onChange={e => setH({ ...h, brand: { ...h.brand, en: e.target.value } })} /></F>
        <F label="搜索占位"><input className="inp" value={h.searchPh || '搜目的地 / 主题'} onChange={e => setH({ ...h, searchPh: e.target.value })} /></F>
      </Row>);
    if (sel === 'footer') return (
      <Row i={0} arr="_" canDel={false}>
        <F label="顾问姓名"><input className="inp" value={h.advisor?.name || ''} onChange={e => setH({ ...h, advisor: { ...h.advisor, name: e.target.value } })} /></F>
        <F label="顾问头衔"><input className="inp" value={h.advisor?.title || ''} onChange={e => setH({ ...h, advisor: { ...h.advisor, title: e.target.value } })} /></F>
        <F label="计数基数"><input className="inp" type="number" value={h.counter?.base || 0} onChange={e => setH({ ...h, counter: { ...h.counter, base: +e.target.value } })} /></F>
        <F label="计数后缀"><input className="inp" value={h.counter?.label || ''} onChange={e => setH({ ...h, counter: { ...h.counter, label: e.target.value } })} /></F>
      </Row>);
    return <div className="vz-empty"><div className="ic">◎</div>点左侧预览里的任意模块开始配置</div>;
  };

  return (<>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
      <button className="btn btn-o btn-s" onClick={onBack}><Icon n="back" s={14} />返回列表</button>
      <input className="inp" style={{ width: 240 }} value={meta.name} onChange={e => setMeta({ ...meta, name: e.target.value })} />
      <span className="tag">{id}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--muted)' }}>
        {meta.status ? '启用中' : '已停用'}
        <span className={'sw ' + (meta.status ? 'on' : 'off')} onClick={() => setMeta({ ...meta, status: meta.status ? 0 : 1 })}><i /></span>
      </span>
      <a className="btn btn-o btn-s" style={{ marginLeft: 'auto' }} href="#/mini" target="_blank" rel="noreferrer">
        <Icon n="eye" s={14} />打开小程序</a>
    </div>
    <div className="vz">
      <div className="vz-left">
        <div className="vz-phone">
          <div className="vz-bar"><span className="dot"><i /><i /><i /></span>小程序首页 · 实时预览</div>
          <div className="vz-body">{order.map(k => PV[k]).filter(Boolean)}</div>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10, lineHeight: 1.8 }}>
          点模块即可配置　·　悬停出现 ↑↓ 调顺序、× 停用<br />搜索条与金刚位固定在顶部，不参与排序
        </div>
      </div>
      <div className="vz-right">
        <div className="mc-hd">
          <i /><b>{MOD_T(sel)}设置</b><span className="k">{sel}</span>
          <span className="sw-wrap">{modOn(sel) ? '已启用' : '已停用'}
            <span className={'sw ' + (modOn(sel) ? 'on' : 'off')} onClick={() => toggleMod(sel)}><i /></span></span>
        </div>
        <Panel />
        <div className="mc-bar">
          <button className="btn btn-o" onClick={onBack}>取消</button>
          <button className="btn btn-p" onClick={save}>保存配置</button>
        </div>
      </div>
    </div>
  </>);
}

/* ---------- 内容管理（PGC 攻略与游记） ----------
   状态：待发布 / 已发布 / 已撤销；分类（页签）降为筛选条件。
   指标全部来自真实埋点：PV/UV 取内容浏览记录，收藏取客人端收藏，咨询取由该内容带来的咨询单。 */
const ART_ST = { draft: ['待发布', 'warn'], published: ['已发布', 'ok'], revoked: ['已撤销', 'plain'] };
/* 列宽：minmax(0,...) 的下限是 0，列被压窄时里面 nowrap 的值会直接溢出压到右边。
   v56 实测：署名作者列「署名作者 定制顾问 万敏君」要 159.2px，原来只分到 136.7px。
   给每一列补上实测的最小宽度，fr 只负责分配富余。 */
const AG = 'minmax(250px,1.7fr) minmax(136px,0.8fr) minmax(172px,1fr) minmax(130px,0.78fr) minmax(136px,0.82fr) minmax(136px,0.82fr) minmax(120px,0.72fr)';
/* v56：原来第三列是「内容素材」（正文字数 / 图片数量 / 视频素材），运营不看，
   换成业务方要的署名作者；关联产品 / 关联内容也从摘要条挪进来，摘要条不再重复。
   ACOLS 与 AG 的列数必须严格一一对应，改一个就得改另一个，否则整行错位。 */
const ACOLS = ['内容标题', '内容分类', '署名作者', '数据表现', '创建信息', '最近操作', '内容状态'];
/* 分类表现环形图配色，与数据概览指标色系同源 */
const PIE_C = ['#2c6e75', '#a8781f', '#3663a6', '#3a7d5d', '#8c6d3a', '#7a5c86'];

/* 分类表现环形图：按各分类的浏览量占比画环，中心放浏览总量。
   纯 SVG 计算，不引图表库；鼠标悬停高亮对应扇区与图例。 */
function CatePie({ data, wan }) {
  const [hov, setHov] = useState(-1);
  const rows = (data || []).filter(x => x.pv > 0);
  const total = rows.reduce((n, x) => n + x.pv, 0);
  if (!total) return <div className="ct-pie"><div className="hd">分类浏览占比</div>
    <div className="none">暂无浏览数据</div></div>;
  const R = 52, r = 34, CX = 62, CY = 62;
  let acc = -Math.PI / 2;
  const arcs = rows.map((x, i) => {
    const ang = (x.pv / total) * Math.PI * 2;
    const a0 = acc, a1 = acc + ang; acc = a1;
    const pt = (rad, ra) => [CX + Math.cos(rad) * ra, CY + Math.sin(rad) * ra];
    const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R);
    const [x2, y2] = pt(a1, r), [x3, y3] = pt(a0, r);
    const big = ang > Math.PI ? 1 : 0;
    return { ...x, i, pct: Math.round(x.pv / total * 1000) / 10,
      d: `M${x0} ${y0}A${R} ${R} 0 ${big} 1 ${x1} ${y1}L${x2} ${y2}A${r} ${r} 0 ${big} 0 ${x3} ${y3}Z` };
  });
  const cur = hov >= 0 ? arcs[hov] : null;
  return (<div className="ct-pie">
    <div className="hd">分类浏览占比</div>
    <div className="bd">
      <svg viewBox="0 0 124 124" width="124" height="124">
        {arcs.map(a2 => (
          <path key={a2.k} d={a2.d} fill={PIE_C[a2.i % PIE_C.length]}
            opacity={hov < 0 || hov === a2.i ? 1 : 0.28}
            onMouseEnter={() => setHov(a2.i)} onMouseLeave={() => setHov(-1)} />))}
        <text x="62" y="58" textAnchor="middle" className="pc-v">{cur ? cur.pct + '%' : wan(total)}</text>
        <text x="62" y="73" textAnchor="middle" className="pc-l">{cur ? cur.t : '总浏览量'}</text>
      </svg>
      <div className="lg">
        {arcs.map(a2 => (
          <div className={'it' + (hov === a2.i ? ' on' : '')} key={a2.k}
            onMouseEnter={() => setHov(a2.i)} onMouseLeave={() => setHov(-1)}>
            <i style={{ background: PIE_C[a2.i % PIE_C.length] }} />
            <span className="t">{a2.t}</span>
            <b>{a2.pct}%</b>
            <s>{a2.n} 篇 · {a2.con} 咨询</s>
          </div>))}
      </div>
    </div>
  </div>);
}

function Contents() {
  const { arg, setArg } = usePage('/uom', 'content');
  if (arg === 'new') return <ArticleEditor id={null} onBack={() => setArg(null)} />;
  if (arg) return <ArticleEditor id={arg} onBack={() => setArg(null)} />;
  return <ArticleList go={setArg} />;
}

function ArticleList({ go }) {
  const toast = useToast();
  const { d: list, reload } = useData(() => get('/api/uom/articles'), [], []);
  const { d: st } = useData(() => get('/api/uom/content-stats'), [], null);
  const { d: home } = useData(() => get('/api/uom/home'), [], {});
  const [fv, setFv] = useState({});
  const [fpOpen, setFpOpen] = useState(false);
  const [tab, setTab] = useState('all');
  const [sort, setSort] = useState('pv-');
  const arts = list || [];
  const tabs = (home.ctabs || []).filter(t => t.k !== 'all');
  const uniq = f => [...new Set(arts.map(f).filter(Boolean))];
  const wan = n => n >= 10000 ? (n / 10000).toFixed(1) + ' 万' : String(Math.round(n || 0));

  const FIELDS = [
    { k: 'q', t: '关键词', ph: '标题 / 导语' },
    { k: 'cate', t: '内容分类', type: 'sel', opts: tabs.map(t => t.t) },
    { k: 'dest', t: '关联目的地', type: 'sel', opts: uniq(a => a.dest) },
    { k: 'by', t: '署名作者', type: 'sel', opts: uniq(a => a.by) },
    { k: 'cby', t: '创建人', type: 'sel', opts: uniq(a => a.created_by) },
    { k: 'uby', t: '最近操作人', type: 'sel', opts: uniq(a => a.updated_by) },
    { k: 'media', t: '素材类型', type: 'sel', opts: ['图文', '含视频'] },
    { k: 'pub', t: '发布日期', type: 'dr' },
    { k: 'hasprod', t: '仅看已关联产品', type: 'ck' },
    { k: 'novideo', t: '仅看无视频', type: 'ck' },
  ];

  const byFilt = useMemo(() => arts.filter(a => {
    const has = (k, v) => !fv[k] || String(v || '') === fv[k];
    if (fv.q && !`${a.t}${a.lead || ''}`.toLowerCase().includes(fv.q.toLowerCase())) return false;
    if (!has('cate', a.cate) || !has('dest', a.dest) || !has('by', a.by)) return false;
    if (!has('cby', a.created_by) || !has('uby', a.updated_by)) return false;
    if (fv.media && (a.video ? '含视频' : '图文') !== fv.media) return false;
    if (fv.pub_a || fv.pub_b) {
      const d = String(a.published_at || '').slice(0, 10);
      if (!d) return false;
      if (fv.pub_a && d < fv.pub_a) return false;
      if (fv.pub_b && d > fv.pub_b) return false;
    }
    if (fv.hasprod && !(a.rel_prod || []).length) return false;
    if (fv.novideo && a.video) return false;
    return true;
  }), [arts, fv]);

  const TABS = [['all', '全部'], ['draft', '待发布'], ['published', '已发布'], ['revoked', '已撤销']]
    .filter(([k]) => k === 'all' || byFilt.some(a => (a.status || 'draft') === k));
  const rows = useMemo(() => {
    const l = byFilt.filter(a => tab === 'all' || (a.status || 'draft') === tab);
    const [key, dir] = [sort.replace('-', ''), sort.endsWith('-') ? -1 : 1];
    const val = a => key === 'pub' ? (a.published_at || '')
      : key === 'created' ? (a.created_at || '')
      : key === 'updated' ? (a.updated_at || '') : (a[key] || 0);
    return [...l].sort((x, y) => (val(x) > val(y) ? 1 : val(x) < val(y) ? -1 : 0) * dir);
  }, [byFilt, tab, sort]);

  const K = st ? [
    { lb: '内容总量', vl: st.total, sv: `已发布 ${st.published} · 待发布 ${st.draft} · 已撤销 ${st.revoked}`,
      ft: '小程序首页瀑布流与攻略社区的内容池', c: '#2c6e75' },
    { lb: '浏览量 PV', vl: wan(st.pv), sv: `近 7 日 ${wan(st.pv7)}`, ft: `独立访客 UV ${wan(st.uv)}`, c: '#a8781f' },
    { lb: '收藏量', vl: st.fav, sv: `收藏率 ${st.favRate}%`, ft: '客人在小程序点心形收藏的次数', c: '#3663a6' },
    { lb: '带来咨询单', vl: st.consult, sv: `内容转化率 ${st.cvr}%`, ft: '由内容详情页发起的定制咨询', c: '#3a7d5d' },
  ] : [];

  const setStatus = async (a, s2) => {
    await post(`/api/uom/articles/${a.id}/status`, { status: s2 });
    toast(`已${(ART_ST[s2] || [])[0]}`); reload();
  };
  const remove = async a => {
    if (!window.confirm(`确认删除内容「${a.t}」？删除后小程序上立即不可见。`)) return;
    await del('/api/uom/articles/' + a.id); toast('已删除'); reload();
  };
  const miniUrl = a => `${location.origin}${location.pathname}#/mini/article/${a.id}`;
  const copyLink = a => {
    const url = miniUrl(a);
    navigator.clipboard ? navigator.clipboard.writeText(url).then(() => toast('内容详情链接已复制')) : toast(url);
  };
  /* 预览：新开窗口打开小程序里这篇内容的详情页，所见即客人所见（同产品列表的「预览」） */
  const preview = a => window.open(miniUrl(a), '_blank', 'noopener');

  return (<div className="op">
    <section className="mod">
      <div className="mod-h"><h3>数据概览</h3><span className="en">Overview</span>
        <span className="mod-stat"><i>指标取自内容浏览埋点、客人收藏与内容带来的咨询单</i></span></div>
      <div className="mod-b">
        <div className="ct-ov">
          <div className="ct-k">
            {K.map(k => (
              <div className="it" key={k.lb} style={{ '--c': k.c }}>
                <i className="lb">{k.lb}</i>
                <b className="vl">{k.vl}</b>
                <s className="sv">{k.sv}</s>
              </div>))}
          </div>
          {st && <CatePie data={st.byTab} wan={wan} />}
          {st && (<div className="ct-top">
            <div className="hd">浏览量 Top 5</div>
            {st.top.map((x, i) => (
              <div className="rw" key={x.id}
                style={{ '--p': Math.round(x.pv / Math.max(1, st.top[0].pv) * 100) + '%' }}>
                <i className={'no' + (i < 3 ? ' hot' : '')}>{i + 1}</i>
                <span className="t" title={x.t}>{x.t}</span>
                <b>{wan(x.pv)}</b>
              </div>))}
          </div>)}
        </div>
      </div>
    </section>

    <section className="mod">
      <div className="mod-h"><h3>筛选条件</h3><span className="en">Filter</span></div>
      <div className="mod-b">
        <FiltPanel fields={FIELDS} val={fv} onChange={setFv} open={fpOpen} setOpen={setFpOpen} />
      </div>
    </section>

    <section className="mod">
      <div className="mod-h"><h3>内容列表</h3><span className="en">Articles</span>
        <div className="mod-stat">
          <i>本页：<b>{rows.length} 篇</b></i>
          <i>浏览：<b>{wan(rows.reduce((s2, a) => s2 + a.pv, 0))}</b></i>
          <i>收藏：<b>{rows.reduce((s2, a) => s2 + a.fav, 0)}</b></i>
          <i>带来咨询：<b className="g">{rows.reduce((s2, a) => s2 + a.consult, 0)}</b></i>
        </div>
      </div>
      <div className="op-tabs">
        {TABS.map(([k, t]) => (
          <a key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {t}<b>{k === 'all' ? byFilt.length : byFilt.filter(a => (a.status || 'draft') === k).length}</b></a>))}
      </div>
      <div className="op-tool">
        <button className="tb" onClick={() => go('new')}>新建内容</button>
        <button className="tb" onClick={reload}>刷新列表</button>
        <span className="cnt">PGC 攻略与游记，发布后出现在小程序首页瀑布流、攻略社区与目的地频道</span>
        <select className="srt" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="pv-">浏览量 PV（由高到低）</option>
          <option value="pv">浏览量 PV（由低到高）</option>
          <option value="uv-">独立访客 UV（由高到低）</option>
          <option value="fav-">收藏量（由高到低）</option>
          <option value="consult-">带来咨询（由高到低）</option>
          <option value="cvr-">内容转化率（由高到低）</option>
          <option value="pub-">发布时间（由近到远）</option>
          <option value="pub">发布时间（由远到近）</option>
          <option value="created-">创建时间（由近到远）</option>
          <option value="updated-">最近操作时间（由近到远）</option>
        </select>
      </div>

      <div className="ol-head" style={{ gridTemplateColumns: AG }}>
        {ACOLS.map(c => <span key={c}>{c}</span>)}
      </div>

      {!rows.length ? <div className="op-empty">没有符合条件的内容</div> : rows.map(a => {
        const s2 = ART_ST[a.status || 'draft'] || ART_ST.draft;
        return (<div className="ol-row" key={a.id}>
          <div className="ol-sub">
            <span className="f">内容编号 <b className="mono">{a.id}</b></span>
            {a.video && <span className="tag info">含视频</span>}
            {/* 原来这里也是「编辑内容 ›」，和下面操作区的「编辑内容」重复了。
                改成预览，跟产品列表的「预览」一个套路：新窗口打开小程序里这篇内容的详情页。 */}
            <a className="more" onClick={() => preview(a)}>预览 ›</a>
          </div>
          <div className="ol-cells" style={{ gridTemplateColumns: AG }}>
            <div className="c">
              <div className="oc-ac">
                <div className="im">
                  {a.img ? <img src={oimg(a.img, 300)} alt="" /> : <Icon n="img" s={15} c="var(--muted-2)" />}
                  {a.video && <span className="vd">视频</span>}
                </div>
                <div className="tx">
                  <div className="no">{a.id}</div>
                  <div className="nm" onClick={() => go(a.id)}>{a.t}</div>
                  <div className="ld">{a.lead || '未填写内容导语'}</div>
                </div>
              </div>
            </div>
            {/* 展示角标那一行撤了：角标现在就是分类本身，摆两行等于同一个值写两遍 */}
            <div className="c">
              <div className="oc-r"><i>内容分类</i><b>{a.cate}</b></div>
              <div className="oc-r"><i>关联目的地</i><b>{a.dest || '—'}</b></div>
              <div className="oc-r"><i>正文字数</i><b className={a.words ? '' : 'mu'}>
                {a.words ? a.words + ' 字' : '未填写'}</b></div>
            </div>
            <div className="c">
              <div className="oc-r"><i>署名作者</i><b>{a.by || '—'}</b></div>
              <div className="oc-r"><i>关联产品</i><b className={(a.rel_prod || []).length ? '' : 'mu'}>
                {(a.rel_prod || []).length} 个</b></div>
              <div className="oc-r"><i>关联内容</i><b className={(a.rel_art || []).length ? '' : 'mu'}>
                {(a.rel_art || []).length} 篇</b></div>
            </div>
            <div className="c">
              <div className="oc-r"><i>浏览量 PV</i><b>{wan(a.pv)}</b></div>
              <div className="oc-r"><i>访客数 UV</i><b>{wan(a.uv)}</b></div>
              <div className="oc-r"><i>收藏量</i><b className={a.fav ? 'g' : 'mu'}>{a.fav}</b></div>
              <div className="oc-r"><i>咨询量</i><b className={a.consult ? 'g' : 'mu'}>{a.consult}</b></div>
            </div>
            <div className="c">
              <div className="oc-v"><i>创建人</i><b>{a.created_by || '—'}</b></div>
              <div className="oc-v"><i>创建时间</i><b className="mu">{(a.created_at || '—').slice(0, 16)}</b></div>
            </div>
            <div className="c">
              <div className="oc-v"><i>最近操作人</i><b>{a.updated_by || '—'}</b></div>
              <div className="oc-v"><i>最近操作时间</i><b className="mu">{(a.updated_at || '—').slice(0, 16)}</b></div>
            </div>
            <div className="c">
              <div className="oc-v"><i>内容状态</i><span className={'tag ' + s2[1]}>{s2[0]}</span></div>
              <div className="oc-v"><i>发布时间</i><b className="mu">{a.published_at ? a.published_at.slice(0, 10) : '未发布'}</b></div>
            </div>
          </div>
          <div className="ol-ops">
            <button className="ob" onClick={() => copyLink(a)}>复制链接</button>
            {a.status !== 'published' && <button className="ob" onClick={() => setStatus(a, 'published')}>发布</button>}
            {a.status === 'published' && <button className="ob" onClick={() => setStatus(a, 'revoked')}>撤销发布</button>}
            <button className="ob r" onClick={() => remove(a)}>删除</button>
            <button className="ob p" onClick={() => go(a.id)}>编辑内容</button>
          </div>
        </div>);
      })}
      <div className="op-ft">共 {rows.length} 篇 · 仅「已发布」的内容在小程序端展示；「已撤销」的内容保留数据但不对外展示</div>
    </section>
  </div>);
}

/* 表单行。必须定义在模块作用域：原来它写在 ArticleEditor 函数体里，
   每次 render 都是一个全新的组件类型，React 会把整棵 .pe-line 子树卸载重建，
   结果是所有 input 敲一个字就丢焦点——标题、导语、作者、阅读量全都只能输入一个字符，
   业务方看到的「关联产品、关联内容不能自定义配置」就是这个 bug 的外在表现。 */
const L = ({ label, req, children, tip }) => (
  <div className="pe-line"><span className="lb">{req && <b>*</b>}{label}</span>
    <div className="in">{children}{tip && <div className="up-tip">{tip}</div>}</div></div>);

/* 关联推荐选择器：搜索过滤 + 勾选 + 已选拖拽排序。
   items 传候选（已发布的），total 传未过滤的总数——空态要能区分
   「一条都还没建」和「建了但都不是已发布」，原来只判 total===0，
   后者会渲染出一片什么都没有的空白。
   已选的顺序就是客人端「相关行程 / 延伸阅读」的展示次序，所以支持拖拽调序。 */
function RelPicker({ items, total, value, onChange, ph, emptyNone, emptyDraft, sm }) {
  const [q, setQ] = useState('');
  const [drag, setDrag] = useState(null);
  const sel = value || [];
  const cand = items || [];
  const byId = useMemo(() => { const m = {}; cand.forEach(x => { m[x.id] = x; }); return m; }, [cand]);
  const kw = q.trim().toLowerCase();
  const shown = cand.filter(x => !kw || `${x.title}${x.sub}${x.id}`.toLowerCase().includes(kw));
  const toggle = id => onChange(sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
  const move = (from, to) => {
    if (from == null || to == null || from === to) return;
    const n = [...sel]; const [it] = n.splice(from, 1); n.splice(to, 0, it); onChange(n);
  };
  return (<div className="rel-w">
    <div className="rel-bar">
      <input className="rel-q" value={q} onChange={e => setQ(e.target.value)} placeholder={ph} />
      <span className="rel-n">已选 <b>{sel.length}</b> 个{sel.length > 1 ? ' · 拖动卡片可调整客人端的展示次序' : ''}</span>
      {!!sel.length && <a className="rel-clr" onClick={() => onChange([])}>清空</a>}
      <span className="rel-t">候选 {cand.length} / 共 {total}</span>
    </div>
    {!!sel.length && (<div className="rel-sel">
      {sel.map((id, i) => (
        <span className={'rel-c' + (drag === i ? ' dg' : '')} key={id} draggable
          onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); move(drag, i); setDrag(null); }}>
          <i className="no">{i + 1}</i>
          <b>{byId[id] ? byId[id].title : id}</b>
          <a title="移出" onClick={() => toggle(id)}>×</a>
        </span>))}
    </div>)}
    <div className={'rel-box' + (sm ? ' sm' : '')}>
      {shown.map(x => (
        <label className={'rel-i' + (sel.includes(x.id) ? ' on' : '')} key={x.id}
          onClick={() => toggle(x.id)}>
          <span className="ck"><Icon n="check" s={10} c="#fff" /></span>
          {x.img ? <img src={oimg(x.img, 300)} alt="" /> : <span className="ph" />}
          <div className="tx"><b>{x.title}</b><span>{x.sub}</span></div>
        </label>))}
      {!shown.length && <span className="rel-e">
        {cand.length ? `没有匹配「${q}」的条目，换个关键词试试`
          : total ? emptyDraft : emptyNone}</span>}
    </div>
  </div>);
}

/* ---------- 内容编辑（独立页） ---------- */
function ArticleEditor({ id, onBack }) {
  const toast = useToast();
  const { d: list } = useData(() => get('/api/uom/articles'), [], []);
  const { d: home } = useData(() => get('/api/uom/home'), [], {});
  const { d: meta } = useData(() => get('/api/meta'), [], {});
  const { d: prods } = useData(() => get('/api/uom/products'), [], []);
  const [a, setA] = useState(null);
  useEffect(() => {
    if (!list) return;
    if (!id) { setA({ t: '', tab: 'guide', k: '目的地攻略', dest: '', img: '', by: '定制顾问 李晴',
      lead: '', html: '', video: '', rel_prod: [], rel_art: [], status: 'draft', read: '0' }); return; }
    const hit = (list || []).find(x => x.id === id);
    if (hit) setA(JSON.parse(JSON.stringify(hit)));
  }, [list, id]);
  if (!a) return <div className="empty">载入中…</div>;
  const tabs = (home.ctabs || []).filter(t => t.k !== 'all');
  const set = (k, v) => setA(o => ({ ...o, [k]: v }));
  const save = async st => {
    if (!a.t) return toast('请填写内容标题');
    if (!a.dest) return toast('请选择关联目的地');
    try {
      await post('/api/uom/articles', { ...a, status: st || a.status });
      toast(st === 'published' ? '内容已发布，小程序端同步展示' : '内容已保存');
      onBack();
    } catch (e) { toast(e.message); }
  };
  return (<>
    <div className="pe-top">
      <button className="btn btn-o btn-s" onClick={onBack}><Icon n="back" s={14} />返回内容列表</button>
      <h3>{id ? '编辑内容' : '新建内容'}</h3>
      {id && <span className="tag">{a.id}</span>}
      <span className={'tag ' + (ART_ST[a.status || 'draft'] || [])[1]}>{(ART_ST[a.status || 'draft'] || [])[0]}</span>
      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
        字段与小程序内容详情页一一对应</span>
    </div>

    <div className="pe-sec">
      <div className="hd"><i /><b>基本信息</b><span>小程序列表卡片与详情页头部</span></div>
      <L label="内容标题" req><input className="inp" value={a.t} onChange={e => set('t', e.target.value)}
        placeholder="冰岛追光 9 天，我们避开了所有旅行团" /></L>
      <L label="导语"><textarea className="inp" rows={2} value={a.lead || ''} onChange={e => set('lead', e.target.value)}
        placeholder="列表卡片与详情页顶部展示的一段摘要" /></L>
      <div className="pe-grid">
        {/* v56：角标不再是一个可单独编辑的字段。分类选什么，封面角标就是什么。
            k 由 tab 自动带出（服务端保存时也会再兜一次底），小程序端读的仍是 a.k，不用改。 */}
        <L label="内容分类" req tip={'小程序封面左上角的角标直接用分类名，当前会显示「' +
          ((tabs.find(x => x.k === a.tab) || {}).t || a.k || '—') + '」'}>
          <select className="inp" value={a.tab} onChange={e => {
            const t = tabs.find(x => x.k === e.target.value);
            setA(o => ({ ...o, tab: e.target.value, k: t ? t.t : o.k }));
          }}>{tabs.map(t => <option key={t.k} value={t.k}>{t.t}</option>)}</select></L>
        <L label="关联目的地" req><select className="inp" value={a.dest || ''} onChange={e => set('dest', e.target.value)}>
          <option value="">请选择</option>
          {(meta.dests || []).map(d => <option key={d.key} value={d.name}>{d.name}</option>)}
          {a.dest && !(meta.dests || []).some(d => d.name === a.dest) && <option>{a.dest}</option>}
        </select></L>
        <L label="作者"><input className="inp" value={a.by || ''} onChange={e => set('by', e.target.value)}
          placeholder="定制顾问 李晴" /></L>
        <L label="展示阅读量"><input className="inp" value={a.read || ''} onChange={e => set('read', e.target.value)}
          placeholder="2.4万（仅用于小程序展示，后台统计以真实埋点为准）" /></L>
        <L label="内容状态"><select className="inp" value={a.status || 'draft'} onChange={e => set('status', e.target.value)}>
          <option value="draft">待发布</option><option value="published">已发布</option>
          <option value="revoked">已撤销</option></select></L>
      </div>
    </div>

    <div className="pe-sec">
      <div className="hd"><i /><b>封面与视频</b><span>列表卡片封面 / 详情页顶部视频</span></div>
      <L label="封面图" req><ImgUpload value={a.img} onChange={v => set('img', v)}
        tip="建议 750×500，列表与详情页顶部都用它" /></L>
      <L label="内容视频"><VideoUpload value={a.video} onChange={v => set('video', v)}
        tip="上传 mp4（≤40MB）或粘贴视频地址；含视频的内容在小程序列表带播放标识" /></L>
      {/* v56 补：小程序「攻略社区」的卡片在无视频且图集≥3 张时出三宫格（Mini.jsx 的 cq-g3），
          用的就是 a.imgs，但后台一直没有这个字段，只能靠种子数据，运营填不了。 */}
      <L label="内容图集"><ImgUpload multiple value={a.imgs || []} onChange={v => set('imgs', v)}
        tip="攻略社区的卡片在没有视频、且图集满 3 张时出三宫格；不足 3 张只显示封面图" /></L>
    </div>

    <div className="pe-sec">
      <div className="hd"><i /><b>正文</b><span>富文本，可插入图片、标题、列表与引用</span></div>
      <Rich value={a.html || (a.secs || []).map(x => `<h3>${x.h || ''}</h3><p>${x.p || ''}</p>`).join('')}
        onChange={v => set('html', v)} minH={340} placeholder="在这里撰写正文，可加粗、分点、插入图片" />
    </div>

    <div className="pe-sec">
      <div className="hd"><i /><b>关联推荐</b><span>详情页底部的「相关行程」与「相关内容」</span></div>
      <L label="关联产品" tip="勾选后在内容详情页底部的「相关行程」展示，客人可直接点进产品详情；上方已选卡片的先后顺序就是客人端的展示次序">
        <RelPicker
          items={(prods || []).filter(p => p.status === 'published')
            .map(p => ({ id: p.id, img: p.cover, title: p.title,
              sub: `${p.dest} · ${p.days} 天 · ${money(p.price_from)}` }))}
          total={(prods || []).length}
          value={a.rel_prod} onChange={v => set('rel_prod', v)}
          ph="搜产品标题、目的地或产品编号"
          emptyNone="产品库里还没有产品，请先到「定制产品管理」新建"
          emptyDraft="已有产品，但没有一条是「已发布」状态——请先到「定制产品管理」把要推的产品上架" />
      </L>
      <L label="关联内容" tip="勾选后在内容详情页底部的「延伸阅读」展示；同样按已选顺序出现">
        <RelPicker sm
          items={(list || []).filter(x => x.id !== a.id && x.status === 'published')
            .map(x => ({ id: x.id, img: x.img, title: x.t, sub: `${x.cate} · ${x.dest}` }))}
          total={(list || []).filter(x => x.id !== a.id).length}
          value={a.rel_art} onChange={v => set('rel_art', v)}
          ph="搜内容标题、分类或目的地"
          emptyNone="还没有别的内容可关联，先多建几篇"
          emptyDraft="已有其他内容，但都不是「已发布」状态——已撤销 / 待发布的内容不会出现在客人端，所以这里不列出" />
      </L>
    </div>

    <div className="pe-bar">
      <button className="btn btn-o" onClick={onBack}>取消</button>
      <button className="btn btn-o" onClick={() => save('draft')}>保存为待发布</button>
      <button className="btn btn-p" onClick={() => save('published')}>保存并发布</button>
    </div>
  </>);
}

/* ---------- 定制规则 ---------- */
function Rules({ go }) {
  const toast = useToast();
  const { d, reload } = useData(() => get('/api/uom/rules'), [], null);
  const [r, setR] = useState(null);
  useEffect(() => { if (d) setR({ ...d }); }, [d]);
  if (!r) return <div className="empty">载入中…</div>;
  const save = async () => { await put('/api/uom/rules', r); toast('规则已保存，门店派单时立刻按新规则走'); reload(); };
  const SELF = ['国际机票', '境外医疗保险', '签证服务', '境内交通', '行前物料'];
  return (<div className="op">
    <section className="mod">
      <div className="mod-h"><h3>供应商接单方式</h3><span className="en">Dispatch</span></div>
      <div className="mod-b">
      <div className="card" style={{ padding: '16px 18px' }}>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>
          按门店来定：这家店的定制单，是<b>由门店自己指定供应商报价</b>，还是<b>平台自动分配供应商去抢报价</b>。
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {[['auto', '自动分配', '同时派给多家，谁先报价谁先出价'], ['assign', '指定供应商', '门店自己挑一家，单子直接进这家的报价台']].map(([k, t, s]) => (
            <div key={k} onClick={() => setR({ ...r, mode: k })} style={{
              flex: 1, padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
              border: '1.5px solid ' + (r.mode === k ? 'var(--gold)' : 'var(--line)'),
              background: r.mode === k ? 'var(--gold-soft)' : '#fff',
            }}>
              <b style={{ fontSize: 13.5 }}>{t}</b>
              <div className="t2" style={{ marginTop: 3 }}>{s}</div>
            </div>
          ))}
        </div>
        {r.mode === 'auto' && <div className="fld" style={{ marginTop: 14, marginBottom: 0, maxWidth: 220 }}>
          <label>最多同时派给几家</label>
          <input className="inp" type="number" min={1} max={6} value={r.max_vendor} onChange={e => setR({ ...r, max_vendor: +e.target.value })} /></div>}
      </div>
      </div>
    </section>

    <section className="mod">
      <div className="mod-h"><h3>平台自供资源</h3><span className="en">Self-supplied</span>
        <span className="mod-stat"><i>勾中的由平台统一供，供应商报价时不含这几项</i></span></div>
      <div className="mod-b">
      <div className="card" style={{ padding: '16px 18px' }}>
        <div className="chips">
          {SELF.map(s => (
            <div key={s} className={'chip gold' + ((r.self_items || []).includes(s) ? ' on' : '')}
              onClick={() => setR(o => ({ ...o, self_items: (o.self_items || []).includes(s) ? o.self_items.filter(x => x !== s) : [...(o.self_items || []), s] }))}>{s}</div>
          ))}
        </div>
      </div>
      </div>
    </section>

    <section className="mod">
      <div className="mod-h"><h3>谁能接单</h3><span className="en">Who takes it</span>
        <span className="mod-stat"><i>不在这里维护</i></span></div>
      <div className="mod-b">
        <div className="card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 12.8, color: 'var(--ink-3)', lineHeight: 1.85 }}>
            派单时谁能接这一单，由地接社档案里的<b>接单范围</b>决定，不再单独维护一份供应商名单——
            启用状态、合作状态、可接目的地、可接门店、可接资源类型、最少接团人数、可接急单天数，
            全部在一处配好，派单直接照它筛。
          </div>
          <div className="chips" style={{ marginTop: 12 }}>
            {['启用中', '合作中', '目的地对得上', '门店对得上', '人数达门槛', '急单接得住', '未超月接单上限']
              .map(x => <div key={x} className="chip" style={{ cursor: 'default' }}>{x}</div>)}
          </div>
          <button className="btn btn-o btn-s" style={{ marginTop: 14 }} onClick={() => go('vendor')}>
            <Icon n="arrow" s={14} />去「供应 · 地接社」维护接单范围</button>
        </div>
      </div>
    </section>

    <div style={{ position: 'sticky', bottom: 0, background: 'linear-gradient(180deg,transparent,var(--paper) 40%)', padding: '14px 0 4px' }}>
      <button className="btn btn-p" onClick={save}>保存规则</button>
    </div>
  </div>);
}

/* ---------- 定制咨询单（总部视角）----------
   复用门店端的咨询看板，scope='uom' 时走只读监控口径：
   汇总全部门店的咨询单（CSP 侧）与各供应商的报价承接情况（UBK 侧），不执行销售动作。 */
function UomConsults() {
  const { arg, setArg } = usePage('/uom', 'consult');
  return <ConsultBoard scope="uom" openNo={arg} onOpenNo={no => setArg(no)} />;
}

/* ---------- 外壳 ---------- */
export default function Uom() {
  const nav = useNavigate();
  const { page, go: setPage } = usePage('/uom', 'prod');
  const T = {
    prod: ['定制产品管理', '定制产品即臻品团 · 经营字段对齐众信产品中心，内容字段对应小程序详情页'],
    home: ['首页配置', '多套配置方案 · 左侧点模块、右侧改配置，保存即发布'],
    content: ['内容管理', 'PGC 攻略与游记 · 小程序瀑布流与攻略频道的内容源'],
    tpl: ['行程规划模板', 'AI 出方案时每个模块怎么写，由这里定'],
    rule: ['定制规则配置', '供应商接单方式、平台自供资源、供应商名单'],
    consult: ['定制咨询单', '全平台定制咨询总览 · 覆盖门店跟进与供应商承接，总部只读监控'],
    order: ['订单管理', '全平台订单总览 · 成交额、成本与毛利'],
    hotel: ['酒店资源库', '签约与常用酒店 · 只管房型规格，价格由供应商报价时给'],
    ticket: ['门票资源库', '景区 / 展馆 / 演出 · 票种、预约规则与退改'],
    car: ['用车资源库', '接送机 / 包车 / 日租 / 城际 · 按人数匹配车型'],
    dining: ['餐厅资源库', '特色餐与团队餐厅 · 餐标、包间与预订规则'],
    guide: ['导游资源库', '导游 / 领队 / 司兼导 · 语种、证件有效期与带团评价'],
    exp: ['体验资源库', '特色体验项目 · 成行人数、季节与档期'],
    other: ['其他资源库', '保险 / 翻译 / 摄影 / 物料等杂项 · 报价里的其他费用'],
    vendor: ['地接社', '供应商档案与资质 · 建档即开通供应商系统账号，接单范围决定派单给谁'],
    member: ['会员管理', '会员档案与消费统计 · 等级按年度订单实收金额自动判定'],
    mlevel: ['等级管理', '等级门槛、保级规则与卡面配置 · 保存后自动重算全部会员等级'],
    mbenefit: ['权益管理', '权益主数据 · 服务 / 折扣 / 礼遇 / 特权四类'],
    mmap: ['等级权益配置', '按等级维护权益项与额度 · 同一权益可在各等级设置不同额度'],
  };
  const M = [
    { g: '产品', items: [{ k: 'prod', t: '定制产品管理', ic: 'layers' }] },
    { g: '交易', items: [
      { k: 'consult', t: '定制咨询单', ic: 'grid' },
      { k: 'order', t: '订单管理', ic: 'ticket' },
    ]},
    { g: '资源', items: [
      { k: 'hotel', t: '酒店', ic: 'bed' },
      { k: 'ticket', t: '门票', ic: 'tag' },
      { k: 'car', t: '用车', ic: 'car' },
      { k: 'dining', t: '餐厅', ic: 'dish' },
      { k: 'guide', t: '导游', ic: 'users' },
      { k: 'exp', t: '体验', ic: 'sparkle' },
      { k: 'other', t: '其他', ic: 'box' },
    ]},
    { g: '供应', items: [
      { k: 'vendor', t: '地接社', ic: 'box' },
    ]},
    { g: '运营', items: [
      { k: 'home', t: '首页配置', ic: 'img' },
      { k: 'content', t: '内容管理', ic: 'file' },
    ]},
    /* 会员拆成独立一组：业务后面要按菜单分权限，
       谁能看会员档案、谁能改等级门槛，必须拆得开 */
    { g: '会员', items: [
      { k: 'member', t: '会员管理', ic: 'users' },
      { k: 'mlevel', t: '等级管理', ic: 'star' },
      { k: 'mbenefit', t: '权益管理', ic: 'tag' },
      { k: 'mmap', t: '等级权益配置', ic: 'layers' },
    ]},
    { g: '配置', items: [
      { k: 'tpl', t: '行程规划模板', ic: 'grid' },
      { k: 'rule', t: '定制规则配置', ic: 'cog' },
    ]},
  ];
  /* 窄屏下侧边栏是抽屉，默认收起；点任意菜单自动关上 */
  const [side, setSide] = useState(false);
  return (<div className={'adm' + (side ? ' side-on' : '')}>
    <div className="adm-side">
      <div className="adm-brand" onClick={() => nav('/')} style={{ cursor: 'pointer' }}>
        <b>运营后台</b><span>优定制 U-DESIGN · Admin</span></div>
      <div className="adm-nav" onClick={() => setSide(false)}>
        {M.map(g => (<div key={g.g}>
          <div className="adm-grp">{g.g}</div>
          {g.items.map(it => <div key={it.k} className={'adm-item' + (page === it.k ? ' on' : '')} onClick={() => setPage(it.k)}>
            <Icon n={it.ic} s={16} />{it.t}</div>)}
        </div>))}
        <div style={{ height: 10 }} />
        <div className="adm-item" onClick={() => nav('/')}><Icon n="back" s={16} />返回平台首页</div>
      </div>
      <div className="adm-foot">众信旅游 · 总部运营中心<br />当前登录：运营管理员</div>
    </div>
    <div className="adm-main">
      {/* 地址里的菜单 key 写错（旧链接 / 手输）时给个兜底，
          原来直接取 T[page][0]，取不到就整页白屏，连左侧菜单都没了。 */}
      <div className="adm-top"><AdmBurger on={side} set={setSide} />
        <div><h2>{(T[page] || ['页面不存在'])[0]}</h2>
          <div className="sub">{(T[page] || ['', '这个地址不对，从左侧菜单里选一个'])[1]}</div></div></div>
      <div className="adm-body">
        {page === 'prod' && <Products />}
        {page === 'home' && <HomeCfg />}
        {page === 'content' && <Contents />}
        {page === 'tpl' && <TplPage />}
        {page === 'rule' && <Rules go={setPage} />}
        {page === 'consult' && <UomConsults />}
        {page === 'order' && <OrderList scope="uom" />}
        {page === 'vendor' && <VendorPage />}
        {page === 'member' && <MemberListPage />}
        {page === 'mlevel' && <MemberLevelPage />}
        {page === 'mbenefit' && <MemberBenefitPage />}
        {page === 'mmap' && <MemberMapPage />}
        {RESCFG[page] && <ResPage type={page} />}
      </div>
    </div>
  </div>);
}
