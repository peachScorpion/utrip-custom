import React, { useState, useEffect, useMemo } from 'react';
import { img as oimg } from '../../../shared/img.js';
import { get, post, del, money } from '../../../shared/api.js';
import { Icon, useToast, useData } from '../../../shared/ui.jsx';
import { FiltPanel } from '../../../shared/Orders.jsx';
import { ImgUpload } from '../../../shared/Upload.jsx';
import { usePage } from '../../../shared/route.js';
import { RESCFG } from './cfg.js';

/* ============ 地接资源：列表 / 编辑 ============
   七类资源共用这一套页面，差异全部来自 cfg.js。
   列表：筛选 + 页签 + 批量上下架 + 增删改查；编辑：基本信息 + 专属属性 + 可售单元 + 图片简介。 */

const GRID = 'minmax(0,1.9fr) minmax(0,1.15fr) minmax(0,1fr) minmax(0,1.35fr) minmax(0,1fr) minmax(0,0.7fr)';
/* 资源就是资源：这里只描述「是什么、在哪、有哪些规格」。
   价格与供应商不属于资源，是供应商报价时产生的，列表上只反映「谁报过、报了多少」。 */
const COLS = ['资源信息', '分类属性', '目的地', '可售单元', '供应商报价', '状态'];
/* 协议 / 证件到期提醒：只有酒店与导游有到期概念 */
const EXPK = { hotel: ['contract_to', '协议'], guide: ['cert_to', '证件'] };
const days = d => d ? Math.round((new Date(d) - new Date()) / 864e5) : null;

export default function ResPage({ type }) {
  const { arg, setArg } = usePage('/uom', type);
  if (arg === 'new') return <ResEditor type={type} id={null} onBack={() => setArg(null)} />;
  if (arg) return <ResEditor type={type} id={arg} onBack={() => setArg(null)} />;
  return <ResList type={type} go={setArg} />;
}

/* ---------- 列表 ---------- */
function ResList({ type, go }) {
  const C = RESCFG[type];
  const toast = useToast();
  const { d: list, reload } = useData(() => get('/api/res?type=' + type), [type], []);
  const { d: meta } = useData(() => get('/api/meta'), [], {});
  const [fv, setFv] = useState({});
  const [fpOpen, setFpOpen] = useState(false);
  const [tab, setTab] = useState('all');
  const [sort, setSort] = useState('new');
  const [sel, setSel] = useState([]);
  useEffect(() => { setFv({}); setTab('all'); setSel([]); }, [type]);
  const all = list || [];
  const uniq = f => [...new Set(all.map(f).filter(Boolean))].sort();
  /* 供应商不挂在资源上，筛选项来自「谁给这类资源报过价」 */
  const supOpts = [...new Set(all.flatMap(r => (r.units || []).flatMap(u =>
    (u.rates || []).filter(x => x.status !== 'off').map(x => x.supplier_name))).filter(Boolean))].sort();
  const ek = EXPK[type];

  const COST = [['1000 以下', c => c > 0 && c < 1000], ['1000-3000', c => c >= 1000 && c < 3000],
    ['3000-8000', c => c >= 3000 && c < 8000], ['8000 以上', c => c >= 8000]];
  const FIELDS = [
    { k: 'q', t: `${C.cn}名称 / 编号`, ph: '支持模糊查询' },
    { k: 'country', t: '国家 / 目的地', type: 'sel', opts: uniq(r => r.country) },
    { k: 'city', t: '城市', type: 'sel', opts: uniq(r => r.city) },
    { k: 'level', t: C.levelT, type: 'sel', opts: C.levels },
    { k: 'sup', t: '报过价的供应商', type: 'sel', opts: supOpts },
    ...C.filt.map(f => ({ k: 'x_' + f.k, t: f.t, type: 'sel', opts: f.opts })),
    { k: 'cost', t: '供应商报价', type: 'sel', opts: COST.map(x => x[0]) },
    { k: 'st', t: '状态', type: 'sel', opts: ['启用中', '已停用'] },
    { k: 'nounit', t: `只看没录${C.unitT}的`, type: 'ck' },
  ];

  const byFilt = useMemo(() => all.filter(r => {
    if (fv.q && !`${r.name}${r.name_en || ''}${r.id}${r.city || ''}`.toLowerCase().includes(fv.q.toLowerCase())) return false;
    if (fv.country && r.country !== fv.country) return false;
    if (fv.city && r.city !== fv.city) return false;
    if (fv.level && r.level !== fv.level) return false;
    if (fv.sup && !(r.units || []).some(u => (u.rates || []).some(x => x.supplier_name === fv.sup && x.status !== 'off'))) return false;
    for (const f of C.filt) {
      const v = fv['x_' + f.k]; if (!v) continue;
      const ev = (r.ext || {})[f.k];
      if (Array.isArray(ev) ? !ev.includes(v) : String(ev || '') !== v) return false;
    }
    if (fv.cost) { const c = COST.find(x => x[0] === fv.cost); if (c && !c[1](r.cost_from || 0)) return false; }
    if (fv.st && (r.status === 'off' ? '已停用' : '启用中') !== fv.st) return false;
    if (fv.nounit && (r.units || []).length) return false;
    return true;
  }), [all, fv, type]);

  const expSoon = r => ek && days((r.ext || {})[ek[0]]) !== null && days((r.ext || {})[ek[0]]) <= 60;
  const QUICK = [
    ['all', '全部', () => true],
    ['on', '启用中', r => r.status !== 'off'],
    ['off', '已停用', r => r.status === 'off'],
    ['nounit', `未录${C.unitT}`, r => !(r.units || []).length],
    ['norate', '还没人报价', r => !(r.units || []).some(u => (u.rates || []).some(x => x.status !== 'off' && x.cost > 0))],
    ...(ek ? [['exp', `${ek[1]}将到期`, expSoon]] : []),
  ];
  const TABS = QUICK.filter(([k, , fn]) => k === 'all' || byFilt.some(fn));
  const rows = useMemo(() => {
    const q = QUICK.find(x => x[0] === tab);
    const l = byFilt.filter(r => !q || q[0] === 'all' || q[2](r));
    const cmp = {
      new: (a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''),
      cost: (a, b) => (a.cost_from || 0) - (b.cost_from || 0),
      costd: (a, b) => (b.cost_from || 0) - (a.cost_from || 0),
      used: (a, b) => (b.used || 0) - (a.used || 0),
      city: (a, b) => (a.city || '').localeCompare(b.city || ''),
    };
    return [...l].sort(cmp[sort] || cmp.new);
  }, [byFilt, tab, sort]);

  const STAT = [
    [C.cn, rows.length + ' 条'],
    ['启用中', byFilt.filter(r => r.status !== 'off').length + ' 条', 'g'],
    ['已停用', byFilt.filter(r => r.status === 'off').length + ' 条'],
    [`未录${C.unitT}`, byFilt.filter(r => !(r.units || []).length).length + ' 条',
      byFilt.some(r => !(r.units || []).length) ? 'r' : ''],
    ['已有报价', byFilt.filter(r => (r.units || []).some(u => (u.rates || []).some(x => x.status !== 'off' && x.cost > 0))).length + ' 条', 'g'],
    ['覆盖城市', uniq(r => r.city).length + ' 个'],
    ...(ek ? [[`${ek[1]}将到期`, byFilt.filter(expSoon).length + ' 条', byFilt.some(expSoon) ? 'r' : '']] : []),
  ];

  const toggle = id => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const setStatus = async (ids, st) => {
    await post('/api/res/status', { ids, status: st });
    toast(st === 'off' ? '已停用，报价时不再可选' : '已启用'); setSel([]); reload();
  };
  const remove = async r => {
    if (!window.confirm(`确认删除${C.cn}「${r.name}」吗？连同它的 ${(r.units || []).length} 个${C.unitT}一起删除，不可恢复。`)) return;
    await del('/api/res/' + r.id); toast('已删除'); reload();
  };
  const copy = async r => { const x = await post(`/api/res/${r.id}/copy`, {}); toast(`已复制为 ${x.id}（默认停用，改完再启用）`); reload(); };

  return (<div className="op">
    <section className="mod">
      <div className="mod-h"><h3>筛选条件</h3><span className="en">Filter</span>
        <span className="mod-stat"><i>{C.desc}</i></span></div>
      <div className="mod-b"><FiltPanel fields={FIELDS} val={fv} onChange={setFv} open={fpOpen} setOpen={setFpOpen} /></div>
    </section>

    <section className="mod">
      <div className="mod-h"><h3>{C.cn}资源列表</h3><span className="en">{C.en}</span>
        <div className="mod-stat">{STAT.map(([k, v, c]) => <i key={k}>{k}：<b className={c || ''}>{v}</b></i>)}</div>
      </div>
      <div className="op-tabs">
        {TABS.map(([k, t, fn]) => (<a key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
          {t}<b>{k === 'all' ? byFilt.length : byFilt.filter(fn).length}</b></a>))}
      </div>
      <div className="op-tool">
        <button className="tb" onClick={() => go('new')}>+ 新建{C.cn}</button>
        {!!sel.length && <>
          <span className="sel">已选 {sel.length} 条</span>
          <button className="tb" onClick={() => setStatus(sel, 'on')}>批量启用</button>
          <button className="tb" onClick={() => setStatus(sel, 'off')}>批量停用</button>
          <button className="tb" onClick={() => setSel([])}>取消选择</button>
        </>}
        <button className="tb" onClick={reload}>刷新</button>
        <span className="cnt">共 {rows.length} 条</span>
        <select className="srt" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="new">更新时间（由近到远）</option>
          <option value="cost">结算起价（由低到高）</option>
          <option value="costd">结算起价（由高到低）</option>
          <option value="used">被报价引用（由多到少）</option>
          <option value="city">按城市</option>
        </select>
      </div>

      <div className="ol-head" style={{ gridTemplateColumns: GRID }}>{COLS.map(c => <span key={c}>{c}</span>)}</div>

      {!rows.length ? <div className="op-empty">
        没有符合条件的{C.cn}资源{all.length ? '' : `，点右上「+ 新建${C.cn}」开始录入`}
      </div> : rows.map(r => {
        const us = r.units || [], on = us.filter(u => u.status !== 'off');
        /* 同一个房型/票种，不同供应商给的价不一样：列表上看的是「几家报过价、价差多少」，
           不是资源自己的价（资源上的 cost 只是参考价）。 */
        const allRates = us.flatMap(u => (u.rates || []).filter(x => x.status !== 'off' && x.cost > 0));
        const rateN = allRates.length;
        const supN = new Set(allRates.map(x => x.supplier_id)).size;
        const rateLo = rateN ? Math.min(...allRates.map(x => x.cost)) : 0;
        const rateHi = rateN ? Math.max(...allRates.map(x => x.cost)) : 0;
        const lowSup = rateN ? (allRates.find(x => x.cost === rateLo) || {}).supplier_name || '—' : '—';
        const exd = ek ? days((r.ext || {})[ek[0]]) : null;
        return (<div className="ol-row" key={r.id}>
          <div className="ol-sub">
            <span className="ck"><input type="checkbox" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} /></span>
            <span className="f">编号 <b className="mono">{r.id}</b></span>
            <span className="f">{C.levelT} <b>{r.level || '未分类'}</b></span>
            {r.contact && <span className="f">资源方联系人 <b className="mu">{r.contact}</b></span>}
            {!!(r.tags || []).length && <span className="f">{(r.tags || []).slice(0, 4).map(t => <em key={t} style={{ fontStyle: 'normal', marginRight: 6 }}>#{t}</em>)}</span>}
            {exd !== null && exd <= 60 && <span className={'tag ' + (exd < 0 ? 'bad' : 'warn')}>
              {exd < 0 ? `${ek[1]}已过期 ${-exd} 天` : `${ek[1]}${exd} 天后到期`}</span>}
            <span className="f">更新 <b className="mu">{(r.updated_at || '').slice(0, 10)}</b></span>
            <a className="more" onClick={() => go(r.id)}>编辑资源 ›</a>
          </div>
          <div className="ol-cells" style={{ gridTemplateColumns: GRID }}>
            <div className="c">
              <div className="oc-p">
                {r.cover ? <img src={oimg(r.cover, 300)} alt="" /> : <span className="ph"><Icon n={C.ic} s={16} c="var(--muted-2)" /></span>}
                <div className="tx">
                  <div className="nm" onClick={() => go(r.id)}>{r.name}</div>
                  <div className="oc-s">{r.name_en || r.intro || '—'}</div>
                </div>
              </div>
            </div>
            <div className="c">
              {C.attr(r).map(([k, v], i) => <div className="oc-r" key={i}><i>{k}</i><b className={v ? '' : 'mu'}>{v || '—'}</b></div>)}
            </div>
            <div className="c">
              <div className="oc-r"><i>国家</i><b>{r.country || '—'}</b></div>
              <div className="oc-r"><i>城市</i><b>{r.city || '—'}</b></div>
              {r.addr && <div className="oc-r"><i>地址</i><b className="mu">{r.addr}</b></div>}
            </div>
            <div className="c">
              <div className="oc-r"><i>{C.unitT}</i><b className={us.length ? '' : 'r'}>{us.length ? `${us.length} 个（启用 ${on.length}）` : '未录入'}</b></div>
              <div className="tpl-ms">{on.slice(0, 4).map(u => <em key={u.id}>{u.name}</em>)}
                {on.length > 4 && <em>+{on.length - 4}</em>}</div>
            </div>
            <div className="c">
              <div className="oc-r"><i>报价</i><b className={rateN ? '' : 'r'}>
                {rateN ? `${supN} 家供应商` : '待供应商报价'}</b></div>
              {!!rateN && <div className="oc-r"><i>区间</i><b>
                {rateLo !== rateHi ? `${money(rateLo)} – ${money(rateHi)}` : money(rateLo)}</b></div>}
              {!!rateN && <div className="oc-r"><i>最低</i><b className="mu">{lowSup}</b></div>}
              {!rateN && <div className="t2">资源建好后，供应商在报价台按自己的协议价报</div>}
            </div>
            <div className="c">
              <span className={'tag ' + (r.status === 'off' ? 'plain' : 'ok')}>{r.status === 'off' ? '已停用' : '启用中'}</span>
              <div className="oc-r" style={{ marginTop: 6 }}><i>引用</i><b className="mu">{r.used || 0} 次</b></div>
            </div>
          </div>
          <div className="ol-ops">
            <button className="ob" onClick={() => copy(r)}>复制</button>
            <button className="ob" onClick={() => setStatus([r.id], r.status === 'off' ? 'on' : 'off')}>
              {r.status === 'off' ? '启用' : '停用'}</button>
            <button className="ob r" onClick={() => remove(r)}>删除</button>
            <button className="ob p" onClick={() => go(r.id)}>编辑</button>
          </div>
        </div>);
      })}
      <div className="op-ft">{C.unitTip}　资源库只管「是什么」，不带价也不归属供应商；价格是供应商在报价台按自己的协议价报上来的。</div>
    </section>
  </div>);
}

/* ---------- 编辑 ---------- */
const L = ({ label, req, tip, children }) => (
  <div className="pe-line"><span className="lb">{req && <b>*</b>}{label}</span>
    <div className="in">{children}{tip && <div className="t2">{tip}</div>}</div></div>
);

function ResEditor({ type, id, onBack }) {
  const C = RESCFG[type];
  const toast = useToast();
  const { d: meta } = useData(() => get('/api/meta'), [], {});
  const { d: loaded } = useData(() => id ? get('/api/res/' + id) : Promise.resolve(null), [id]);
  const [r, setR] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!id) setR({
      type, name: '', name_en: '', country: '', city: '', addr: '', level: C.levels[0],
      supplier_id: '', supplier_name: '', contact: '', phone: '', tags: [], cover: '', images: [],
      intro: '', ext: {}, rating: 0, status: 'on', memo: '', units: [],
    });
    else if (loaded) setR(JSON.parse(JSON.stringify(loaded)));
  }, [id, loaded, type]);
  if (!r) return <div className="empty">载入中…</div>;

  const set = (k, v) => setR(o => ({ ...o, [k]: v }));
  const setE = (k, v) => setR(o => ({ ...o, ext: { ...o.ext, [k]: v } }));
  const toggleIn = (arr, v) => (arr || []).includes(v) ? arr.filter(x => x !== v) : [...(arr || []), v];
  const setU = (i, k, v) => setR(o => { const u = [...o.units]; u[i] = { ...u[i], [k]: v }; return { ...o, units: u }; });
  const addU = () => setR(o => ({ ...o, units: [...o.units, { name: '', spec: '', unit: C.unitDef.unit, cap: C.unitDef.cap || 0, min_pax: 0, season: '全年', stock: '', status: 'on' }] }));
  const delU = i => setR(o => ({ ...o, units: o.units.filter((_, j) => j !== i) }));

  const dests = meta.dests || [];
  const cities = (dests.find(d => d.name === r.country) || {}).cities || [];
  const save = async () => {
    if (!r.name.trim()) return toast(`${C.cn}名称必填`);
    if (!r.country) return toast('国家 / 目的地必填');
    if (!r.units.filter(u => u.name.trim()).length &&
      !window.confirm(`还没录任何${C.unitT}，保存后供应商在报价台看不到可报的规格。确认先存？`)) return;
    setBusy(true);
    try { const x = await post('/api/res', r); toast(`已保存（${x.id}）`); onBack(); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  };

  const F = f => {
    const v = (r.ext || {})[f.k];
    if (f.type === 'sel') return <select className="inp" value={v || ''} onChange={e => setE(f.k, e.target.value)}>
      <option value="">请选择</option>{f.opts.map(o => <option key={o}>{o}</option>)}</select>;
    if (f.type === 'num') return <input className="inp" type="number" value={v ?? ''} placeholder={f.ph}
      onChange={e => setE(f.k, e.target.value === '' ? '' : +e.target.value)} />;
    if (f.type === 'date') return <input className="inp" type="date" value={v || ''} onChange={e => setE(f.k, e.target.value)} />;
    if (f.type === 'area') return <textarea className="inp" rows={2} value={v || ''} placeholder={f.ph} onChange={e => setE(f.k, e.target.value)} />;
    if (f.type === 'chips') return <div className="chips">
      {f.opts.map(o => <div key={o} className={'chip gold' + ((v || []).includes(o) ? ' on' : '')}
        onClick={() => setE(f.k, toggleIn(v, o))}>{o}</div>)}</div>;
    return <input className="inp" value={v || ''} placeholder={f.ph} onChange={e => setE(f.k, e.target.value)} />;
  };

  return (<>
    <div className="pe-top">
      <button className="btn btn-o btn-s" onClick={onBack}><Icon n="back" s={14} />返回列表</button>
      <h3>{id ? `编辑${C.cn}` : `新建${C.cn}`}</h3>
      {id && <span className="tag mono">{r.id}</span>}
      <span className={'tag ' + (r.status === 'off' ? 'plain' : 'ok')}>{r.status === 'off' ? '已停用' : '启用中'}</span>
      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
        启用中的资源，供应商按客人需求单报价时可以选到</span>
    </div>

    <div className="pe-sec">
      <div className="hd"><i /><b>基本信息</b><span>报价单与行程上展示给门店和客人的身份信息</span></div>
      <L label={`${C.cn}名称`} req><input className="inp" value={r.name} onChange={e => set('name', e.target.value)}
        placeholder={PH[type][0]} /></L>
      <L label="英文名 / 别名"><input className="inp" value={r.name_en} onChange={e => set('name_en', e.target.value)}
        placeholder={PH[type][1]} /></L>
      <div className="pe-grid2">
        <L label="国家 / 目的地" req>
          <select className="inp" value={r.country} onChange={e => setR(o => ({ ...o, country: e.target.value, city: '' }))}>
            <option value="">请选择</option>
            {dests.map(d => <option key={d.key}>{d.name}</option>)}
            {r.country && !dests.some(d => d.name === r.country) && <option>{r.country}</option>}
          </select></L>
        <L label="城市"><input className="inp" list="res-cities" value={r.city} onChange={e => set('city', e.target.value)}
          placeholder="可直接输入，也可从下拉里选" />
          <datalist id="res-cities">{cities.map(c => <option key={c} value={c} />)}</datalist></L>
      </div>
      <L label="详细地址"><input className="inp" value={r.addr} onChange={e => set('addr', e.target.value)}
        placeholder="供应商与司机导游按这个地址找过去" /></L>
      <L label={C.levelT}><select className="inp" value={r.level} onChange={e => set('level', e.target.value)}>
        <option value="">未分类</option>{C.levels.map(o => <option key={o}>{o}</option>)}</select></L>
      <div className="pe-grid2">
        <L label="资源方联系人" tip="资源自己的对接人（酒店销售、景区票务），不是供应商">
          <input className="inp" value={r.contact} onChange={e => set('contact', e.target.value)} placeholder="如 酒店销售经理 王女士" /></L>
        <L label="联系电话"><input className="inp" value={r.phone} onChange={e => set('phone', e.target.value)} placeholder="含国际区号" /></L>
      </div>
      <div className="pe-grid2">
        <L label="状态"><select className="inp" value={r.status} onChange={e => set('status', e.target.value)}>
          <option value="on">启用中（供应商报价时可选）</option><option value="off">已停用（报价不可选）</option></select></L>
        <L label="内部评分" tip="0–5 分，自己人用的评价，不对客展示">
          <input className="inp" type="number" step="0.1" min="0" max="5" value={r.rating}
            onChange={e => set('rating', +e.target.value)} /></L>
      </div>
      <L label="标签" tip="标签会跟着资源出现在报价单上，也可以拿来筛选">
        <div className="chips">{[...new Set([...C.tags, ...(r.tags || [])])].map(t =>
          <div key={t} className={'chip gold' + ((r.tags || []).includes(t) ? ' on' : '')}
            onClick={() => set('tags', toggleIn(r.tags, t))}>{t}</div>)}
          <input className="inp" style={{ width: 130, height: 31 }} placeholder="自定义标签回车"
            onKeyDown={e => { if (e.key === 'Enter' && e.target.value.trim()) { set('tags', [...(r.tags || []), e.target.value.trim()]); e.target.value = ''; } }} />
        </div></L>
    </div>

    <div className="pe-sec">
      <div className="hd"><i /><b>{C.cn}专属属性</b><span>这一类资源特有的字段，报价与行程会按这些条件筛</span></div>
      {C.ext.map(f => <L key={f.k} label={f.t}>{F(f)}</L>)}
    </div>

    <div className="pe-sec">
      <div className="hd"><i /><b>{C.unitT}规格</b><span>{C.unitTip}</span></div>
      <div className="ru-head">
        <span>{C.unitT}名称</span><span>规格说明</span><span>计价单位</span><span>容量</span><span>起订</span>
        <span>适用期</span><span>库存 / 配额</span><span>状态</span><span />
      </div>
      {!r.units.length && <div className="empty sm">还没有{C.unitT}，点下面「+ 添加{C.unitT}」录第一条</div>}
      {r.units.map((u, i) => (<div className="ru-row" key={i}>
          <input className="inp" value={u.name} placeholder={PH[type][2]} onChange={e => setU(i, 'name', e.target.value)} />
          <input className="inp" value={u.spec} placeholder={PH[type][3]} onChange={e => setU(i, 'spec', e.target.value)} />
          <select className="inp" value={u.unit} onChange={e => setU(i, 'unit', e.target.value)}>
            {C.unitUnits.map(x => <option key={x}>{x}</option>)}</select>
          <input className="inp num" type="number" value={u.cap} title="可住人数 / 座位数 / 可接待人数" onChange={e => setU(i, 'cap', +e.target.value)} />
          <input className="inp num" type="number" value={u.min_pax} title="起订人数" onChange={e => setU(i, 'min_pax', +e.target.value)} />
          <input className="inp" value={u.season} placeholder="全年" onChange={e => setU(i, 'season', e.target.value)} />
          <input className="inp" value={u.stock} placeholder="如 每日 5 间" onChange={e => setU(i, 'stock', e.target.value)} />
          <select className="inp" value={u.status} onChange={e => setU(i, 'status', e.target.value)}>
            <option value="on">启用</option><option value="off">停用</option></select>
          <span className="x" onClick={() => delU(i)}><Icon n="trash" s={14} /></span>
        </div>))}
      <button className="mc-add" onClick={addU}>+ 添加{C.unitT}</button>
      <div className="t2" style={{ marginTop: 8 }}>
        这里只定义<b>卖什么规格、按什么单位计价</b>，不填价格——同一个{C.unitT}每家供应商的价不一样，
        价格由供应商在报价台按自己的协议价填。停用的{C.unitT}供应商报价时选不到。
      </div>
    </div>

    {id ? <RateBox resId={id} cn={C.cn} unitT={C.unitT} /> : (
      <div className="pe-sec">
        <div className="hd"><i /><b>供应商报价情况</b><span>只读 · 价格由供应商在报价台按自己的协议价填</span></div>
        <div className="empty sm">先把{C.cn}和{C.unitT}保存一次，供应商才能在报价台选到它并报价。</div>
      </div>
    )}

    <div className="pe-sec">
      <div className="hd"><i /><b>图片与说明</b><span>封面与图集会出现在报价单和客人看到的行程里</span></div>
      <L label="封面图"><ImgUpload value={r.cover} onChange={v => set('cover', v)} tip="建议 4:3，单张不超过 10MB" /></L>
      <L label="图集"><ImgUpload value={r.images} onChange={v => set('images', v)} multiple tip="最多传 12 张" /></L>
      <L label={`${C.cn}简介`}><textarea className="inp" rows={3} value={r.intro} onChange={e => set('intro', e.target.value)}
        placeholder="一段话说清这个资源好在哪，客人看得到" /></L>
      <L label="内部备注" tip="只有我们自己看得到，客人与供应商都看不到">
        <textarea className="inp" rows={2} value={r.memo} onChange={e => set('memo', e.target.value)}
          placeholder="如 结算周期月结 30 天；对接人休假期间找 XX" /></L>
    </div>

    <div className="pe-bar">
      <button className="btn btn-o" onClick={onBack}>取消</button>
      <button className="btn btn-p" disabled={busy} onClick={save}>{busy ? '保存中…' : '保存'}</button>
    </div>
  </>);
}

/* 各类的输入占位示例：照着填就不会跑偏 */
const PH = {
  hotel: ['如 巴黎丽兹酒店', 'Ritz Paris', '豪华大床房', '45㎡ / 1 张特大床 / 含双早'],
  ticket: ['如 卢浮宫博物馆', 'Musée du Louvre', '成人票', '含常设展，不含特展'],
  car: ['如 巴黎市区 7 座商务车', 'Mercedes V-Class', '戴高乐机场接机', '含司机含油，等候 60 分钟内免费'],
  dining: ['如 佛罗伦萨 T 骨牛排餐厅', 'Trattoria Mario', '团队午餐', '六菜一汤 + 软饮，含服务费'],
  guide: ['如 李明（罗马中文导游）', 'Li Ming', '全天中文导游', '8 小时，含讲解器'],
  exp: ['如 卡帕多奇亚热气球日出', 'Cappadocia Balloon', '标准舱日出场', '1 小时，含酒店接送与香槟'],
  other: ['如 申根旅游意外险', 'Schengen Travel Insurance', '全程保障', '医疗 30 万欧，含紧急救援'],
};

/* ---------- 各供应商报价 ----------
   这是资源库里价格的正主：同一家酒店的同一个房型，欧睿报 1620、和风报 1680、环球报 1750，
   谁供就按谁的价算成本。资源单元上的「参考成本」只用来估算和比价，不参与实际报价。 */
function RateBox({ resId, cn, unitT }) {
  const { d: rows } = useData(() => get(`/api/res/${resId}/rates`), [resId], []);
  const list = rows || [];
  const totalN = list.reduce((a, u) => a + u.rates.filter(x => x.status !== 'off').length, 0);
  const supN = new Set(list.flatMap(u => u.rates.filter(x => x.status !== 'off').map(x => x.supplier_id))).size;
  return (<div className="pe-sec">
    <div className="hd"><i /><b>供应商报价情况</b>
      <span>只读 · 这些价是供应商在报价台报上来的，不在这里维护</span>
      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
        {totalN ? `${supN} 家供应商 · ${totalN} 条报价` : '还没有供应商报过价'}</span></div>

    {!list.length && <div className="empty sm">还没有{unitT}，先在上面加{unitT}，供应商才能报价。</div>}
    {!!list.length && !totalN && <div className="empty sm">
      这条{cn}还没有供应商报过价。<br />
      <span className="t2">供应商在报价台选到它时按自己的协议价填，填完就会出现在这里。</span></div>}

    {list.map(u => {
      const live = u.rates.filter(x => x.status !== 'off' && x.cost > 0);
      const lo = live.length ? Math.min(...live.map(x => x.cost)) : 0;
      const used = new Set(u.rates.map(x => x.supplier_id));
      return (<div className="rt-u" key={u.unit_id}>
        <div className="rt-uh">
          <b>{u.unit_name}</b>
          {u.spec && <span className="t2" style={{ marginTop: 0 }}>{u.spec}</span>}
          <span className="tag">按{u.unit}计价</span>
          {u.ref_cost > 0 && <span className="t2" style={{ marginTop: 0 }}>参考成本 {money(u.ref_cost)}</span>}
          <span className="rt-sum">
            {live.length ? <>{live.length} 家报价 · 最低 <b>{money(lo)}</b>
              {live.length > 1 && <em>最高 {money(Math.max(...live.map(x => x.cost)))}</em>}</>
              : <em className="r">还没有供应商报价</em>}
          </span>
        </div>

        {!!u.rates.length && <div className="rt-head">
          <span>供应商</span><span>结算价</span><span>税</span><span>起订</span><span>有效期</span><span>备注</span><span>状态</span><span>报价时间</span></div>}
        {u.rates.map(r => (
          <div className={'rt-row' + (r.status === 'off' ? ' off' : '')} key={r.id}>
            <span className="rt-s">{r.supplier_name || r.supplier_id}
              {r.cost === lo && r.status !== 'off' && <em className="lowest">最低</em>}</span>
            <span className="rt-c">{money(r.cost)}<i>/{u.unit}</i></span>
            <span className="t2" style={{ marginTop: 0 }}>{r.tax}</span>
            <span className="t2" style={{ marginTop: 0 }}>{r.min_qty || '—'}</span>
            <span className="t2" style={{ marginTop: 0 }}>{r.valid_from ? `${r.valid_from} ~ ${r.valid_to || '长期'}` : '长期'}</span>
            <span className="t2 rt-m" style={{ marginTop: 0 }} title={r.memo}>{r.memo || '—'}</span>
            <span className={'tag ' + (r.status === 'off' ? 'plain' : 'ok')}>{r.status === 'off' ? '停用' : '生效'}</span>
            <span className="t2 rt-at" style={{ marginTop: 0 }}>{(r.updated_at || '').slice(5, 10)}</span>
          </div>
        ))}

      </div>);
    })}
    <div className="t2" style={{ marginTop: 10 }}>
      资源库不管价：供应商在报价台选到这条{cn}时，按自己的协议价填，填完自动汇到这里。
      同一个{unitT}各家价格不同是正常的，这一栏就是用来比价的。
    </div>
  </div>);
}
