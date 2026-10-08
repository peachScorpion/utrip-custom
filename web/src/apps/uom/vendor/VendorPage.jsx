import React, { useState, useEffect, useMemo } from 'react';
import { get, post, del } from '../../../shared/api.js';
import { Icon, useToast, useData } from '../../../shared/ui.jsx';
import { FiltPanel } from '../../../shared/Orders.jsx';
import { ImgUpload } from '../../../shared/Upload.jsx';
import { usePage } from '../../../shared/route.js';

/* ============ 供应 · 地接社 ============
   建一家地接社＝建档 + 开账号 + 定接单范围。
   接单范围沿用 OPC 定制规则配置的口径（门店 + 目的地），再加上我们资源库的七类资源；
   派单时只把单子派给「能接这个门店 + 这个目的地」的家。
   建档时填的主联系人会自动开一个 UBK 管理员账号，建完就能登供应商系统。 */

const GRID = 'minmax(0,1.7fr) minmax(0,1.15fr) minmax(0,1.5fr) minmax(0,1.1fr) minmax(0,1fr) minmax(0,0.7fr)';
const COLS = ['地接社信息', '联系方式', '可接单范围', '资质证照', '合作信息', '状态'];
const TYPES = ['境外地接社', '境内地接社', '单项资源商', '综合供应链', '自营资源'];
const COOP = ['合作中', '试合作', '暂停合作', '已终止', '待审核'];
const SETTLE = ['预付全款', '预付定金 30%', '现结', '月结 30 天', '月结 60 天', '出团前结清', '回团后结算'];
const RES_CN = { hotel: '酒店', ticket: '门票', car: '用车', dining: '餐厅', guide: '导游', exp: '体验', other: '其他' };
const RES_KEYS = Object.keys(RES_CN);
const CERT_TAG = { 齐全: 'ok', 将到期: 'warn', 缺件: 'plain', 有过期: 'bad' };
/* 能不能接单：与后端 matchVendors 的基本条件一致（具体某一单还要看目的地/人数/急单） */
const canTake = v => !!v.enabled && v.coop_state === '合作中' && v.type !== '单项资源商' && !!v.dests.length;
const whyNot = v => !v.enabled ? '已停用' : v.coop_state !== '合作中' ? v.coop_state
  : v.type === '单项资源商' ? '单项资源商只在资源库报价' : !v.dests.length ? '没配可接目的地' : '';

export default function VendorPage() {
  const { arg, setArg } = usePage('/uom', 'vendor');
  if (arg === 'new') return <VendorEditor id={null} onBack={() => setArg(null)} />;
  if (arg) return <VendorEditor id={arg} onBack={() => setArg(null)} />;
  return <VendorList go={setArg} />;
}

/* ---------- 列表 ---------- */
function VendorList({ go }) {
  const toast = useToast();
  const { d: list, reload } = useData(() => get('/api/uom/vendors'), [], []);
  const { d: meta } = useData(() => get('/api/meta'), [], {});
  const [fv, setFv] = useState({});
  const [fpOpen, setFpOpen] = useState(false);
  const [tab, setTab] = useState('all');
  const [sel, setSel] = useState([]);
  const all = list || [];
  const uniq = f => [...new Set(all.map(f).filter(Boolean))].sort();

  const FIELDS = [
    { k: 'q', t: '地接社名称 / 编号', ph: '支持模糊查询' },
    { k: 'type', t: '类型', type: 'sel', opts: TYPES },
    { k: 'country', t: '所在国家', type: 'sel', opts: uniq(v => v.country) },
    { k: 'dest', t: '可接目的地', type: 'sel', opts: [...new Set(all.flatMap(v => v.dests))].sort() },
    { k: 'res', t: '可接资源', type: 'sel', opts: RES_KEYS.map(k => RES_CN[k]) },
    { k: 'coop', t: '合作状态', type: 'sel', opts: COOP },
    { k: 'cert', t: '资质状态', type: 'sel', opts: ['齐全', '将到期', '缺件', '有过期'] },
    { k: 'takes', t: '能否接单', type: 'sel', opts: ['能接单', '不能接单'] },
    { k: 'noacc', t: '只看还没开账号的', type: 'ck' },
  ];
  const byFilt = useMemo(() => all.filter(v => {
    if (fv.q && !`${v.name}${v.short || ''}${v.id}`.toLowerCase().includes(fv.q.toLowerCase())) return false;
    if (fv.type && v.type !== fv.type) return false;
    if (fv.country && v.country !== fv.country) return false;
    if (fv.dest && !v.dests.includes(fv.dest)) return false;
    if (fv.res && !v.res_types.includes(RES_KEYS.find(k => RES_CN[k] === fv.res))) return false;
    if (fv.coop && v.coop_state !== fv.coop) return false;
    if (fv.cert && v.cert.state !== fv.cert) return false;
    if (fv.takes && (canTake(v) ? '能接单' : '不能接单') !== fv.takes) return false;
    if (fv.noacc && v.accN) return false;
    return true;
  }), [all, fv]);

  const QUICK = [
    ['all', '全部', () => true],
    ['on', '合作中', v => v.enabled && v.coop_state === '合作中'],
    ['off', '已停用', v => !v.enabled],
    ['cert', '资质有问题', v => ['缺件', '有过期', '将到期'].includes(v.cert.state)],
    ['noacc', '没开账号', v => !v.accN],
    ['cannot', '不能接单', v => !canTake(v)],
  ];
  const TABS = QUICK.filter(([k, , fn]) => k === 'all' || byFilt.some(fn));
  const rows = useMemo(() => {
    const q = QUICK.find(x => x[0] === tab);
    return byFilt.filter(v => !q || q[0] === 'all' || q[2](v));
  }, [byFilt, tab]);

  const STAT = [
    ['地接社', rows.length + ' 家'],
    ['合作中', byFilt.filter(v => v.enabled && v.coop_state === '合作中').length + ' 家', 'g'],
    ['资质有问题', byFilt.filter(v => ['缺件', '有过期', '将到期'].includes(v.cert.state)).length + ' 家',
      byFilt.some(v => ['缺件', '有过期'].includes(v.cert.state)) ? 'r' : ''],
    ['没开账号', byFilt.filter(v => !v.accN).length + ' 家', byFilt.some(v => !v.accN) ? 'r' : ''],
    ['不能接单', byFilt.filter(v => !canTake(v)).length + ' 家', byFilt.some(v => !canTake(v)) ? 'r' : ''],
    ['覆盖目的地', [...new Set(byFilt.flatMap(v => v.dests))].length + ' 个'],
  ];

  const toggle = id => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const setEnabled = async (ids, on) => {
    await post('/api/uom/vendors/status', { ids, enabled: on ? 1 : 0 });
    toast(on ? '已启用' : '已停用，不再给它派单'); setSel([]); reload();
  };
  const remove = async v => {
    if (!window.confirm(`确认删除地接社「${v.name}」吗？它名下的 ${v.accN} 个账号会一起删除。`)) return;
    try { await del('/api/uom/vendors/' + v.id); toast('已删除'); reload(); }
    catch (e) { toast(e.message); }
  };

  return (<div className="op">
    <section className="mod">
      <div className="mod-h"><h3>筛选条件</h3><span className="en">Filter</span>
        <span className="mod-stat"><i>地接社建档后自动开通供应商系统账号，接单范围决定派单时派给谁</i></span></div>
      <div className="mod-b"><FiltPanel fields={FIELDS} val={fv} onChange={setFv} open={fpOpen} setOpen={setFpOpen} /></div>
    </section>

    <section className="mod">
      <div className="mod-h"><h3>地接社列表</h3><span className="en">Vendors</span>
        <div className="mod-stat">{STAT.map(([k, v, c]) => <i key={k}>{k}：<b className={c || ''}>{v}</b></i>)}</div>
      </div>
      <div className="op-tabs">
        {TABS.map(([k, t, fn]) => (<a key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
          {t}<b>{k === 'all' ? byFilt.length : byFilt.filter(fn).length}</b></a>))}
      </div>
      <div className="op-tool">
        <button className="tb" onClick={() => go('new')}>+ 新建地接社</button>
        {!!sel.length && <>
          <span className="sel">已选 {sel.length} 家</span>
          <button className="tb" onClick={() => setEnabled(sel, 1)}>批量启用</button>
          <button className="tb" onClick={() => setEnabled(sel, 0)}>批量停用</button>
          <button className="tb" onClick={() => setSel([])}>取消选择</button>
        </>}
        <button className="tb" onClick={reload}>刷新</button>
        <span className="cnt">共 {rows.length} 家</span>
      </div>

      <div className="ol-head" style={{ gridTemplateColumns: GRID }}>{COLS.map(c => <span key={c}>{c}</span>)}</div>
      {!rows.length ? <div className="op-empty">没有符合条件的地接社</div> : rows.map(v => (
        <div className="ol-row" key={v.id}>
          <div className="ol-sub">
            <span className="ck"><input type="checkbox" checked={sel.includes(v.id)} onChange={() => toggle(v.id)} /></span>
            <span className="f">编号 <b className="mono">{v.id}</b></span>
            <span className="f">类型 <b>{v.type}</b></span>
            {v.founded && <span className="f">成立 <b className="mu">{v.founded}</b></span>}
            {!!v.cert.soon.length && <span className="tag warn">
              {v.cert.soon.map(s => `${s.name} ${s.days} 天后到期`).join('、')}</span>}
            {!!v.cert.expired.length && <span className="tag bad">{v.cert.expired.join('、')}已过期</span>}
            <a className="more" onClick={() => go(v.id)}>编辑档案 ›</a>
          </div>
          <div className="ol-cells" style={{ gridTemplateColumns: GRID }}>
            <div className="c">
              <div className="oc-p"><span className="ph"><Icon n="box" s={15} c="var(--muted-2)" /></span>
                <div className="tx"><div className="nm" onClick={() => go(v.id)}>{v.name}</div>
                  <div className="oc-s">{v.short || v.intro || '—'}</div></div></div>
            </div>
            <div className="c">
              <div className="oc-r"><i>所在地</i><b>{[v.country, v.city].filter(Boolean).join(' · ') || '—'}</b></div>
              <div className="oc-r"><i>联系人</i><b>{v.contact || '—'}</b></div>
              <div className="oc-r"><i>电话</i><b className="mu">{v.phone || '—'}</b></div>
            </div>
            <div className="c">
              <div className="oc-r"><i>目的地</i><b>{v.dests.length ? v.dests.slice(0, 4).join('、') + (v.dests.length > 4 ? ` +${v.dests.length - 4}` : '') : '未限定'}</b></div>
              <div className="oc-r"><i>门店</i><b className="mu">{v.shop_mode === 'some' ? `${v.channels.length} 家指定` : '全部门店'}</b></div>
              <div className="tpl-ms">{RES_KEYS.map(k => (
                <em key={k} className={v.res_types.includes(k) ? '' : 'off'}>{RES_CN[k]}</em>))}</div>
            </div>
            <div className="c">
              <span className={'tag ' + (CERT_TAG[v.cert.state] || 'plain')}>{v.cert.state}</span>
              <div className="oc-r" style={{ marginTop: 5 }}><i>齐备</i><b className={v.cert.miss.length ? 'r' : 'g'}>
                {v.cert.ok} / {v.cert.total}</b></div>
              {!!v.cert.miss.length && <div className="t2">缺 {v.cert.miss.join('、')}</div>}
            </div>
            <div className="c">
              <div className="oc-r"><i>账号</i><b className={v.accN ? '' : 'r'}>
                {v.accN ? `${v.accN} 个（启用 ${v.accOn}）` : '未开通'}</b></div>
              <div className="oc-r"><i>报价</i><b className="mu">{v.quoteN} 次 · 中选 {v.wonN}</b></div>
              <div className="oc-r"><i>资源报价</i><b className="mu">{v.rateN} 条</b></div>
            </div>
            <div className="c">
              <span className={'tag ' + (v.enabled ? (v.coop_state === '合作中' ? 'ok' : 'warn') : 'plain')}>
                {v.enabled ? v.coop_state : '已停用'}</span>
              <div className="oc-r" style={{ marginTop: 6 }}><i>接单</i>
                <b className={canTake(v) ? 'g' : 'r'}>{canTake(v) ? '可派单' : '不可派'}</b></div>
              {!canTake(v) && <div className="t2">{whyNot(v)}</div>}
            </div>
          </div>
          <div className="ol-ops">
            <button className="ob" onClick={() => setEnabled([v.id], !v.enabled)}>{v.enabled ? '停用' : '启用'}</button>
            <button className="ob r" onClick={() => remove(v)}>删除</button>
            <button className="ob p" onClick={() => go(v.id)}>编辑</button>
          </div>
        </div>
      ))}
      <div className="op-ft">
        派单候选完全看这里：启用中 + 合作中 + 不是单项资源商 + 门店与目的地对得上 + 人数达门槛
        + 急单接得住 + 本月未超接单上限。「定制规则配置」只管自动/指定与最多派几家，不再另存一份名单。
      </div>
    </section>
  </div>);
}

/* ---------- 编辑 ---------- */
const L = ({ label, req, tip, children }) => (
  <div className="pe-line"><span className="lb">{req && <b>*</b>}{label}</span>
    <div className="in">{children}{tip && <div className="t2">{tip}</div>}</div></div>
);
const ROLE_CN = { admin: '管理员', quote: '报价员', ops: '履约操作', view: '只读' };

function VendorEditor({ id, onBack }) {
  const toast = useToast();
  const { d: meta } = useData(() => get('/api/meta'), [], {});
  const { d: loaded } = useData(() => id ? get('/api/uom/vendors/' + id) : Promise.resolve(null), [id]);
  const [v, setV] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!id) setV({
      name: '', short: '', type: '境外地接社', country: '', city: '', addr: '', founded: '', site: '', intro: '',
      contact: '', contact_title: '', phone: '', email: '', wechat: '', sos_name: '', sos_phone: '',
      settle_cycle: '月结 30 天', currency: 'CNY', bank_name: '', bank_acct: '', invoice_title: '', tax_no: '',
      legal_person: '', reg_capital: '',
      license_no: '', license_to: '', license_file: '', travel_no: '', travel_to: '', travel_file: '',
      insure_no: '', insure_amt: '', insure_to: '', insure_file: '',
      agree_no: '', agree_from: '', agree_to: '', agree_file: '',
      dests: [], channels: [], res_types: RES_KEYS, shop_mode: 'all',
      max_order: 0, min_pax: 0, rush_days: 0, coop_state: '合作中', rating: 0, enabled: 1, memo: '',
      accounts: [],
    });
    else if (loaded) setV(JSON.parse(JSON.stringify(loaded)));
  }, [id, loaded]);
  if (!v) return <div className="empty">载入中…</div>;

  const set = (k, x) => setV(o => ({ ...o, [k]: x }));
  const tog = (k, x) => setV(o => ({ ...o, [k]: (o[k] || []).includes(x) ? o[k].filter(y => y !== x) : [...(o[k] || []), x] }));
  const dests = meta.dests || [];
  const chans = meta.channel ? [meta.channel] : [];

  const save = async () => {
    if (!v.name.trim()) return toast('地接社名称必填');
    if (!id && !v.contact) return toast('填写主联系人，系统将为其开通供应商系统账号');
    if (!id && !/^1\d{11}?$/.test(v.phone || '') && !/^1\d{10}$/.test(v.phone || ''))
      return toast('主联系人手机号要填对，账号用它登录');
    if (v.shop_mode === 'some' && !v.channels.length) return toast('选了「指定门店」就要至少挑一家门店');
    if (!v.res_types.length) return toast('至少选一类可接资源');
    setBusy(true);
    try {
      const r = await post('/api/uom/vendors', v);
      toast(r.account ? `已建档（${r.id}），并给 ${v.contact} 开通了供应商系统管理员账号` : `已保存（${r.id}）`);
      onBack();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };

  const CertRow = ({ t, no, to, file, keys, tip }) => (
    <div className="vc-row">
      <div className="vc-t"><b>{t}</b>{tip && <span className="t2" style={{ marginTop: 0 }}>{tip}</span>}</div>
      <input className="inp" placeholder="证照编号" value={v[keys[0]] || ''} onChange={e => set(keys[0], e.target.value)} />
      <input className="inp" type="date" title="有效期至" value={v[keys[1]] || ''} onChange={e => set(keys[1], e.target.value)} />
      <div className="vc-f"><ImgUpload value={v[keys[2]]} onChange={x => set(keys[2], x)} tip="扫描件/照片" /></div>
    </div>
  );

  return (<>
    <div className="pe-top">
      <button className="btn btn-o btn-s" onClick={onBack}><Icon n="back" s={14} />返回列表</button>
      <h3>{id ? '编辑地接社档案' : '新建地接社'}</h3>
      {id && <span className="tag mono">{v.id}</span>}
      {id && <span className={'tag ' + (v.enabled ? 'ok' : 'plain')}>{v.enabled ? v.coop_state : '已停用'}</span>}
      {id && v.cert && <span className={'tag ' + (CERT_TAG[v.cert.state] || 'plain')}>资质{v.cert.state}</span>}
      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
        {id ? '改完保存即生效，接单范围立刻影响派单' : '建档时会自动给主联系人开通供应商系统账号'}</span>
    </div>

    <div className="pe-sec">
      <div className="hd"><i /><b>基础信息</b><span>这家地接社是谁、在哪、做什么的</span></div>
      <div className="pe-grid2">
        <L label="地接社全称" req><input className="inp" value={v.name} onChange={e => set('name', e.target.value)}
          placeholder="如 欧睿地接 · 南欧中心" /></L>
        <L label="简称" tip="列表与报价单上显示的短名"><input className="inp" value={v.short} onChange={e => set('short', e.target.value)} /></L>
      </div>
      <div className="pe-grid2">
        <L label="类型"><select className="inp" value={v.type} onChange={e => set('type', e.target.value)}>
          {TYPES.map(t => <option key={t}>{t}</option>)}</select></L>
        <L label="合作状态"><select className="inp" value={v.coop_state} onChange={e => set('coop_state', e.target.value)}>
          {COOP.map(t => <option key={t}>{t}</option>)}</select></L>
      </div>
      <div className="pe-grid2">
        <L label="所在国家"><input className="inp" list="v-countries" value={v.country} onChange={e => set('country', e.target.value)} />
          <datalist id="v-countries">{dests.map(d => <option key={d.key} value={d.name} />)}</datalist></L>
        <L label="所在城市"><input className="inp" value={v.city} onChange={e => set('city', e.target.value)} /></L>
      </div>
      <L label="公司地址"><input className="inp" value={v.addr} onChange={e => set('addr', e.target.value)} /></L>
      <div className="pe-grid2">
        <L label="成立年份"><input className="inp" value={v.founded} onChange={e => set('founded', e.target.value)} placeholder="2015" /></L>
        <L label="官网"><input className="inp" value={v.site} onChange={e => set('site', e.target.value)} placeholder="https://" /></L>
      </div>
      <div className="pe-grid2">
        <L label="法人代表"><input className="inp" value={v.legal_person} onChange={e => set('legal_person', e.target.value)} /></L>
        <L label="注册资本"><input className="inp" value={v.reg_capital} onChange={e => set('reg_capital', e.target.value)} placeholder="如 500 万人民币" /></L>
      </div>
      <L label="公司简介"><textarea className="inp" rows={2} value={v.intro} onChange={e => set('intro', e.target.value)}
        placeholder="擅长什么线路、团队规模、有什么独家资源" /></L>
      <div className="pe-grid2">
        <L label="内部评分" tip="0–5 分，自己人打的分"><input className="inp" type="number" step="0.1" min="0" max="5"
          value={v.rating} onChange={e => set('rating', +e.target.value)} /></L>
        <L label="启用"><select className="inp" value={v.enabled ? 1 : 0} onChange={e => set('enabled', +e.target.value)}>
          <option value={1}>启用（可派单、可报价）</option><option value={0}>停用（不再派单）</option></select></L>
      </div>
    </div>

    <div className="pe-sec">
      <div className="hd"><i /><b>联系人与结算</b><span>主联系人会同时成为供应商系统的管理员账号</span></div>
      <div className="pe-grid2">
        <L label="主联系人" req={!id}><input className="inp" value={v.contact} onChange={e => set('contact', e.target.value)} /></L>
        <L label="职务"><input className="inp" value={v.contact_title} onChange={e => set('contact_title', e.target.value)} placeholder="如 中国市场总监" /></L>
      </div>
      <div className="pe-grid2">
        <L label="手机号" req={!id} tip={id ? '' : '这个手机号就是供应商系统的登录账号'}>
          <input className="inp" value={v.phone} onChange={e => set('phone', e.target.value)} placeholder="11 位手机号" /></L>
        <L label="邮箱"><input className="inp" value={v.email} onChange={e => set('email', e.target.value)} /></L>
      </div>
      <div className="pe-grid2">
        <L label="微信 / WhatsApp"><input className="inp" value={v.wechat} onChange={e => set('wechat', e.target.value)} /></L>
        <L label="24 小时应急电话" tip="客人在当地出状况时找谁">
          <input className="inp" value={v.sos_phone} onChange={e => set('sos_phone', e.target.value)} /></L>
      </div>
      <L label="应急联系人"><input className="inp" value={v.sos_name} onChange={e => set('sos_name', e.target.value)} /></L>
      <div className="pe-grid2">
        <L label="结算方式"><select className="inp" value={v.settle_cycle} onChange={e => set('settle_cycle', e.target.value)}>
          {SETTLE.map(t => <option key={t}>{t}</option>)}</select></L>
        <L label="结算币种"><select className="inp" value={v.currency} onChange={e => set('currency', e.target.value)}>
          {['CNY', 'EUR', 'USD', 'JPY', 'GBP', 'CHF', 'ISK'].map(t => <option key={t}>{t}</option>)}</select></L>
      </div>
      <div className="pe-grid2">
        <L label="开户行"><input className="inp" value={v.bank_name} onChange={e => set('bank_name', e.target.value)} /></L>
        <L label="银行账号"><input className="inp" value={v.bank_acct} onChange={e => set('bank_acct', e.target.value)} /></L>
      </div>
      <div className="pe-grid2">
        <L label="发票抬头"><input className="inp" value={v.invoice_title} onChange={e => set('invoice_title', e.target.value)} /></L>
        <L label="税号"><input className="inp" value={v.tax_no} onChange={e => set('tax_no', e.target.value)} /></L>
      </div>
    </div>

    <div className="pe-sec">
      <div className="hd"><i /><b>资质证照</b>
        <span>四项齐了才算资质齐全；到期前 60 天列表上会标红提醒</span>
        {id && v.cert && <span style={{ marginLeft: 'auto' }} className={'tag ' + (CERT_TAG[v.cert.state] || 'plain')}>
          {v.cert.ok} / {v.cert.total} · {v.cert.state}</span>}</div>
      <div className="vc-head"><span>证照</span><span>编号</span><span>有效期至</span><span>扫描件</span></div>
      <CertRow t="营业执照" keys={['license_no', 'license_to', 'license_file']} tip="境外公司填当地注册证明" />
      <CertRow t="旅行社经营许可" keys={['travel_no', 'travel_to', 'travel_file']} tip="境外填当地旅游局注册号" />
      <CertRow t="责任险保单" keys={['insure_no', 'insure_to', 'insure_file']} tip="地接责任险，保额填在下面" />
      <CertRow t="合作协议" keys={['agree_no', 'agree_to', 'agree_file']} tip="与我们签的框架协议" />
      <div className="pe-grid2" style={{ marginTop: 12 }}>
        <L label="责任险保额"><input className="inp" value={v.insure_amt} onChange={e => set('insure_amt', e.target.value)}
          placeholder="如 每人 50 万 / 每次事故 500 万" /></L>
        <L label="协议签署日期"><input className="inp" type="date" value={v.agree_from} onChange={e => set('agree_from', e.target.value)} /></L>
      </div>
    </div>

    <div className="pe-sec">
      <div className="hd"><i /><b>可接单范围</b>
        <span>派单时按这里筛：门店 + 目的地 + 资源类型都对得上，才会把单子派给它</span></div>
      <L label="可接目的地" req tip="留空＝不限目的地（会被派到所有单子，一般不这么配）">
        <div className="chips">{dests.map(d => (
          <div key={d.key} className={'chip gold' + (v.dests.includes(d.name) ? ' on' : '')}
            onClick={() => tog('dests', d.name)}>{d.name}</div>))}
          <input className="inp" style={{ width: 130, height: 31 }} placeholder="其他目的地回车"
            onKeyDown={e => { if (e.key === 'Enter' && e.target.value.trim()) { tog('dests', e.target.value.trim()); e.target.value = ''; } }} />
        </div>
        {!!v.dests.filter(d => !dests.some(x => x.name === d)).length && <div className="chips" style={{ marginTop: 6 }}>
          {v.dests.filter(d => !dests.some(x => x.name === d)).map(d => (
            <div key={d} className="chip gold on" onClick={() => tog('dests', d)}>{d} ✕</div>))}</div>}
      </L>
      <L label="可接门店">
        <select className="inp" style={{ maxWidth: 220 }} value={v.shop_mode} onChange={e => set('shop_mode', e.target.value)}>
          <option value="all">全部门店</option><option value="some">指定门店</option></select>
        {v.shop_mode === 'some' && <div className="chips" style={{ marginTop: 8 }}>
          {chans.map(c => <div key={c.id} className={'chip gold' + (v.channels.includes(c.id) ? ' on' : '')}
            onClick={() => tog('channels', c.id)}>{c.name}</div>)}
          {!chans.length && <span className="t2">还没有门店数据</span>}
        </div>}
      </L>
      <L label="可接资源类型" req tip="只做酒店的资源商，不会被派到要带导游的单子">
        <div className="chips">{RES_KEYS.map(k => (
          <div key={k} className={'chip gold' + (v.res_types.includes(k) ? ' on' : '')}
            onClick={() => tog('res_types', k)}>{RES_CN[k]}</div>))}</div></L>
      <div className="pe-grid2">
        <L label="每月最多接单" tip="0＝不限"><input className="inp" type="number" value={v.max_order}
          onChange={e => set('max_order', +e.target.value)} /></L>
        <L label="最少接团人数" tip="0＝不限"><input className="inp" type="number" value={v.min_pax}
          onChange={e => set('min_pax', +e.target.value)} /></L>
      </div>
      <L label="可接急单" tip="出发前多少天以内的单子还接；0＝不接急单">
        <input className="inp" style={{ maxWidth: 160 }} type="number" value={v.rush_days}
          onChange={e => set('rush_days', +e.target.value)} /></L>
      <L label="内部备注"><textarea className="inp" rows={2} value={v.memo} onChange={e => set('memo', e.target.value)}
        placeholder="如 旺季房量紧、只接 6 人以上团" /></L>
    </div>

    <div className="pe-sec">
      <div className="hd"><i /><b>供应商系统账号</b>
        <span>{id ? '这家在供应商端的登录账号，明细在供应商端「账号管理」里维护' : '保存后自动给主联系人开一个管理员账号'}</span></div>
      {!id ? <div className="empty sm">
        保存后，系统会用主联系人的姓名与手机号开一个<b>管理员账号</b>，他就能登录供应商系统接单报价。<br />
        <span className="t2">后续要加报价员、履约操作等账号，在供应商端的「账号管理」里加。</span>
      </div> : !(v.accounts || []).length ? <div className="empty sm">
        这家还没有账号 —— 它现在登不了供应商系统。<br />
        <span className="t2">在供应商端「账号管理」里给它开一个，或者把主联系人信息填好后重新保存。</span>
      </div> : (<>
        <div className="va-head"><span>账号</span><span>姓名</span><span>手机</span><span>角色</span><span>最近登录</span><span>状态</span></div>
        {v.accounts.map(a => (<div className={'va-row' + (a.status ? '' : ' off')} key={a.id}>
          <span className="mono">{a.id}</span>
          <b>{a.name}</b>
          <span className="t2" style={{ marginTop: 0 }}>{a.phone}</span>
          <span className="tag">{ROLE_CN[a.role] || a.role}</span>
          <span className="t2" style={{ marginTop: 0 }}>{a.last_login || '还没登录过'}</span>
          <span className={'tag ' + (a.status ? 'ok' : 'plain')}>{a.status ? '正常' : '已停用'}</span>
        </div>))}
      </>)}
    </div>

    <div className="pe-bar">
      <button className="btn btn-o" onClick={onBack}>取消</button>
      <button className="btn btn-p" disabled={busy} onClick={save}>{busy ? '保存中…' : (id ? '保存' : '建档并开通账号')}</button>
    </div>
  </>);
}
