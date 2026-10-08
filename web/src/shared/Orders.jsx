/* ============================================================
   订单中台 · 三端共用（CSP 门店 / UOM 总部 / UBK 供应商）
   版式与签证业务线（visaops）的订单列表 / 订单详情保持一致，
   两条线共用一个订单底层，只做字段替换：
     办签人 → 出行人 ·  办签状态 → 履约状态 ·  套餐 → 线路类型 ·  领区 → 目的地区域
   列表：横排汇总条 + 四列筛选面板 + 批量条 + 一单三行的七段表格
   详情：产品条（订单号+状态标签组 / 产品名+属性 / 供应商行）+ 关键信息网格
         + 整行政策段 + 吸顶锚点页签（四块全铺开）+ 交易二级页签 + 吸底操作条
   ============================================================ */
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { img as oimg } from './img.js';
import { get, post, del, money, money0 } from './api.js';
import { Icon, useToast, useData } from './ui.jsx';
import { usePage } from './route.js';
import { useNavigate } from 'react-router-dom';
import './orders.css';

/* 订单状态对齐众信旅游订单：只描述「钱」，出行 / 资源 / 合同 / 保险各自独立 */
export const O_ST = {
  created: ['待支付', 'warn'], deposit: ['部分支付', 'warn'], paid: ['已支付', 'info'],
  done: ['已完成', 'ok'], cancelled: ['已取消', 'plain'], refunded: ['已退订', 'bad'],
};
const TRIP_TAG = { 未出行: 'plain', 出行中: 'info', 已回团: 'ok' };
const RES_TAG = { 待确认: 'warn', 已确认: 'ok', 确认失败: 'bad', 已终止: 'plain' };
const PAY_TAG = { unpaid: 'plain', part: 'warn', paid: 'ok', closed: 'bad' };
const KIND_CN = { adult: '成人', child: '儿童', elder: '长者' };
const DOC_CN = { done: ['资料齐全', 'ok'], part: ['部分已收', 'warn'], todo: ['待收资料', 'plain'] };
const WHO = { csp: ['销售', '李晴'], uom: ['总部', '运营管理员'], ubk: ['供应商', '供应商操作员'] };
const NA = <span className="od-na">—</span>;
/* 进度节点图标：和抖店那种圆形图标节点一致 */
const PROG_IC = { created: 'file', deposit: 'bag', contracted: 'check', paid: 'bag',
  ready: 'box', traveling: 'send', done: 'star' };

/* 完成度环 */
function Ring({ pct }) {
  const R = 30, C = 2 * Math.PI * R;
  return (<div className="od-ring">
    <svg width="70" height="70" viewBox="0 0 70 70">
      <circle cx="35" cy="35" r={R} fill="none" stroke="var(--oc-line2)" strokeWidth="5" />
      <circle cx="35" cy="35" r={R} fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round"
        strokeDasharray={`${C * pct / 100} ${C}`} transform="rotate(-90 35 35)" />
      <text x="35" y="40" textAnchor="middle" className="pc">{pct}%</text>
    </svg>
    <div className="lb">完成度</div>
  </div>);
}

const Tag = ({ c, children }) => <span className={'tag ' + (c || 'plain')}>{children}</span>;
/* 一行「标签 —— （副信息） 值」：标签定宽左对齐 / 副信息 / 数值右对齐，
   整列数字咬同一条右边线，和签证列表一致 */
const OlRow = ({ t, extra, children }) => (
  <div className="ol-r"><i>{t}</i><em>{extra || ''}</em>{children}</div>);
const Mo = ({ v, c }) => <b className={c || ''}>{money(v || 0)}</b>;
const odKV = (label, val, span) => (
  <div className={'od-kv' + (span ? ' sp' : '')} key={label}>
    <i>{label}</i><b>{val === 0 || val ? val : NA}</b></div>);

/* ============ 详情 ============ */
export function OrderDetail({ no, scope = 'csp', onBack }) {
  const toast = useToast();
  const nav = useNavigate();
  const { d, loading, reload } = useData(() => get(`/api/order/${no}/full`), [no]);
  const [trTab, setTrTab] = useState('detail');
  const [cur, setCur] = useState('base');
  const [logOpen, setLogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dlg, setDlg] = useState(null);
  const refs = useRef({});
  const scroller = useRef(null);
  useEffect(() => {
    const el = scroller.current && scroller.current.closest('.adm-body');
    if (!el) return;
    const sync = () => {
      const line = el.scrollTop + 92;
      let k = 'base';
      Object.entries(refs.current).forEach(([kk, node]) => { if (node && node.offsetTop <= line) k = kk; });
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 6) k = 'trade';
      setCur(k);
    };
    el.addEventListener('scroll', sync, { passive: true });
    return () => el.removeEventListener('scroll', sync);
  }, [d]);
  if (loading || !d) return <div className="empty">正在打开订单…</div>;

  const isUbk = scope === 'ubk';
  const m = d.money, v = d.view, p = v.product;
  const [role, who] = WHO[scope] || WHO.csp;
  const call = async (path, body, okMsg) => {
    if (busy) return; setBusy(true);
    try { await post(path, { ...body, role, who }); toast(okMsg || '已处理'); setDlg(null); reload(); }
    catch (e) { toast(e.message); }
    setBusy(false);
  };
  const c = d.consult, plan = c && c.cur;
  const jump = k => {
    const el = scroller.current && scroller.current.closest('.adm-body');
    const t = refs.current[k];
    if (el && t) el.scrollTo({ top: Math.max(0, t.offsetTop - 84), behavior: 'smooth' });
  };

  /* ---- 顶部产品条 ---- */
  const head = (
    <div className="od-top">
      <div className="od-top-h">
        {v.cover && <img className="od-cover" src={oimg(v.cover, 300)} alt="" />}
        <div>
          <div className="od-no"><span className="ic"><Icon n="ticket" s={14} /></span>
            订单编号：<b className="mono">{d.no}</b>
            <Tag c={(O_ST[v.status_key] || [])[1]}>{v.status_text}</Tag>
            <Tag c={TRIP_TAG[v.trip_state]}>{v.trip_state}</Tag>
            <Tag c={RES_TAG[v.res_state]}>资源{v.res_state}</Tag>
            {isUbk && <Tag c={PAY_TAG[v.recv_state]}>{v.recv_state_cn}</Tag>}
            {d.refund_state === 'applied' && <Tag c="bad">退款审核中</Tag>}
            {v.doc_state === '待录入' && <Tag c="warn">待补录出行人资料 · {v.doc_left} 人</Tag>}
          </div>
          <div className="od-pn">{plan ? plan.route : p.name}</div>
          <div className="od-ptags">
            <em>{p.type}</em>
            {p.region && <em>{p.region}</em>}
            <em>{d.days} 天</em>
            <em>{d.pax} 人</em>
            {p.theme && <em>{p.theme}</em>}
          </div>
          <div className="od-pm">
            <span>目的地<b>{d.dest}</b></span>
            <span>供应商<b>{p.supplier || '—'}</b></span>
            {d.consult_no && <span>关联咨询单{isUbk
              ? <b className="mono">{d.consult_no}</b>
              : <b><a className="lnk mono" onClick={() => nav('/csp/board/' + d.consult_no)}>{d.consult_no} ›</a></b>}</span>}
            {d.contract_no && <span>合同号<b className="mono">{d.contract_no}</b></span>}
          </div>
        </div>
        <div className="od-topr">
          <div><i>客户名称</i><b>{d.customer}</b></div>
          <div><i>销售渠道</i><b>{v.channel_text || '—'}</b></div>
          <div><i>下单日期</i><b>{(d.created_at || '').slice(0, 16)}</b></div>
          <div><i>出行日期</i><b>{d.go_date || '待定'}</b></div>
          {!isUbk && <div><i>服务销售</i><b>{d.sales_name || '—'}</b></div>}
          <div><i>{isUbk ? '我的结算价' : '成交金额'}</i>
            <b style={{ fontSize: 15 }}>{money(isUbk ? m.cost : m.amount)}</b></div>
        </div>
        <button className="od-logbtn" onClick={() => setLogOpen(true)}>订单日志（{d.logs.length}）</button>
      </div>
      <div className="od-fast">
        {odKV('预计出行日期', d.go_date)}
        {odKV('出行人数', d.pax + ' 人' + (v.pax_mix ? `（成人 ${v.pax_mix.adults} · 儿童 ${v.pax_mix.children} · 长者 ${v.pax_mix.elders}）` : ''))}
        {odKV('线路类型', p.type)}
        {odKV('目的地', d.dest)}
        {odKV('行程天数', d.days ? d.days + ' 天' : null)}
        {odKV('出发城市', p.from_city)}
        {odKV('行程主题', p.theme)}
        {odKV('行程版本', plan ? `第 ${plan.ver} 版 · 共 ${c.plans.length} 版` : null)}
        {odKV('出行人资料', v.doc_state
          ? <Tag c={v.doc_state === '已录齐' ? 'ok' : 'warn'}>{v.doc_state}</Tag> : null)}
        {odKV('最近更新', d.updated_at)}
      </div>
      <div className="od-pol">
        {isUbk ? (<>
          <div><i>结算规则</i><s>
            本单结算价以平台选定的报价为准，行程完成后由平台财务统一结算；
            如出行前发生客人取消，按已发生的不可退成本据实结算，需提供供应商方的损失凭证。</s></div>
          <div><i>履约要求</i><s>
            出行前 7 个工作日内完成机位、酒店与地接车导的最终确认并回写平台；
            出行期间保持 7×24 联络畅通，行程变更须经门店书面确认后执行。</s></div>
          <div><i>信息边界</i><s>
            平台仅下发履约所需信息：出行人姓名、证件（脱敏）、团期与人数。
            客人成交价、平台毛利与联系方式不在供应商侧展示。</s></div>
        </>) : (<>
        <div><i>退改规则</i><s>
          未收款前可直接取消订单。已收款的需提交退款申请，由总部按退改规则审核后出账：
          出行前 30 日以上扣 10%，15–29 日扣 30%，7–14 日扣 60%，7 日内及已出票机票、
          已签发签证按实际损失扣除。</s></div>
        <div><i>服务时效</i><s>
          提交需求后 1 个工作日内出带报价的方案，方案确认后由 {p.supplier || '选定供应商'} 落实境外资源；
          出行期间提供 7×24 中文应急支持。行程调整以书面确认为准。</s></div>
        <div><i>发票信息</i><s>
          发票由 {v.invoice_entity} 开具，结算主体 {v.settle_entity}；
          全款结清后可申请开具，开票在众信财务系统中完成，可联系服务销售人员办理。</s></div>
        </>)}
      </div>
    </div>);

  /* ---- 页签 1：订单信息（三列多行）---- */
  const base = (
    <div className="od-sec"><div className="hd"><h3>订单信息</h3><span className="en">Order</span></div>
      <div className="od-grid bd">
        {odKV('订单编号', <span className="mono">{d.no}</span>)}
        {odKV('下单日期', d.created_at)}
        {odKV('平台订单状态', <Tag c={(O_ST[v.status_key] || [])[1]}>{v.status_text}</Tag>)}
        {!isUbk && odKV('业务来源', v.biz_source)}
        {!isUbk && odKV('活动来源', null)}
        {!isUbk && odKV('下单客户端', v.client)}
        {odKV('出行状态', <Tag c={TRIP_TAG[v.trip_state]}>{v.trip_state}</Tag>)}
        {odKV('资源确认状态', <Tag c={RES_TAG[v.res_state]}>{v.res_state}</Tag>)}
        {odKV('出行通知状态', <Tag c={v.notify_state === '已通知' ? 'ok' : 'plain'}>{v.notify_state}</Tag>)}
        {odKV('订单保险状态', <Tag c={v.insure_state === '已投保' ? 'ok' : 'plain'}>{v.insure_state}</Tag>)}
        {odKV('审核状态', v.audit_state)}
        {!isUbk && odKV('销售渠道', v.channel_text)}
        {!isUbk && odKV('服务销售人员', d.sales_name)}
        {!isUbk && odKV('服务销售公司', v.sale_org)}
        {!isUbk && odKV('客户类型', v.cust_type)}
        {!isUbk && odKV('客户名称', v.cust_name)}
        {odKV('预订人数', d.pax + ' 人')}
        {!isUbk && odKV('采购人', null)}
        {!isUbk && odKV('采购部门', null)}
        {!isUbk && odKV('采购公司', v.settle_entity)}
        {!isUbk && odKV('订单合同状态', <Tag c={d.contract_no ? 'ok' : 'warn'}>{v.contract_status}</Tag>)}
        {odKV('供应商', p.supplier)}
        {odKV('供应商销售人员', null)}
        {!isUbk && odKV('关联咨询单', d.consult_no
          ? <a className="lnk mono" onClick={() => nav('/csp/board/' + d.consult_no)}>{d.consult_no} ›</a>
          : '门店手工建单')}
        {odKV('合同编号', d.contract_no ? <span className="mono">{d.contract_no}</span> : null)}
        {odKV(isUbk ? '收款状态' : '支付状态',
          <Tag c={PAY_TAG[isUbk ? v.recv_state : v.pay_state]}>{isUbk ? v.recv_state_cn : v.pay_state_cn}</Tag>)}
        {!isUbk && odKV('供应商结算状态', <Tag c={d.settle_state === 'paid' ? 'ok' : 'warn'}>
          {d.settle_state === 'paid' ? '已结算' : '未结算'}</Tag>)}
        {!isUbk && odKV('建单人', v.created_by_name)}
        {!isUbk && odKV('最近操作', d.logs[0] ? `${d.logs[0].who} · ${d.logs[0].created_at}` : null)}
      </div>
      <div className="od-grid bd one">
        {odKV('订单备注', d.remark || <span className="od-na">—　销售备注请在「订单日志」中补记</span>)}
      </div>
      {plan && (
        <div className="od-plan">
          <img src={oimg(plan.cover)} alt="" />
          <div className="tx">
            <div className="tk">{plan.name} · 第 {plan.ver} 版行程</div>
            <h4>{plan.route}</h4>
            <div className="t2">{plan.days.length} 天 · 共 {c.plans.length} 版方案 · {c.feedback.length} 条客人反馈</div>
            {c.share_token && <a className="btn btn-o btn-xs" href={'#/trip/' + c.share_token}
              target="_blank" rel="noreferrer">查看完整行程</a>}
          </div>
        </div>)}
    </div>);

  /* ---- 页签 2：联系人信息 ---- */
  const maskP = x => (x || '').replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
  const contact = (
    <div className="od-sec"><div className="hd"><h3>联系人信息</h3><span className="en">Contact</span></div>
      <div className="pad">
        <table className="tbl"><thead><tr><th>联系人</th><th>联系电话</th><th>电子邮箱</th><th>客户类型</th></tr></thead>
          <tbody><tr>
            <td><b>{d.contact_name || d.customer}</b></td>
            <td className="mono">{d.contact_phone || d.phone}</td>
            <td>{d.contact_email || NA}</td>
            <td>{v.cust_type}</td>
          </tr></tbody></table>
      </div>
      <div className="od-th2"><b>收件信息</b><s>行程确认单、签证材料与发票寄送地址</s></div>
      <div className="pad">
        <table className="tbl"><thead><tr><th>收件人</th><th>联系电话</th><th>收件地址</th><th>发票抬头</th><th>开票状态</th></tr></thead>
          <tbody><tr>
            <td>{d.contact_name || d.customer}</td>
            <td className="mono">{d.contact_phone || d.phone}</td>
            <td>{d.addr || NA}</td>
            <td>{d.invoice_title || NA}</td>
            <td><Tag c={d.invoice_state === 'done' ? 'ok' : 'plain'}>{d.invoice_state === 'done' ? '已开具' : '未开具'}</Tag></td>
          </tr></tbody></table>
      </div>
    </div>);

  /* ---- 页签 3：出行人信息 ---- */
  const travelers = (
    <div className="od-sec">
      <div className="hd"><h3>出行人信息</h3><span className="en">Travelers</span><span className="sub">共 {d.travelers.length} 人</span>
        {!isUbk && <button className="btn btn-o btn-s" style={{ marginLeft: 'auto' }}
          onClick={() => setDlg({ k: 'traveler', t: {} })}><Icon n="plus" s={14} />添加出行人</button>}</div>
      <div className="pad scrollx">
        <table className="tbl"><thead><tr>
          <th style={{ width: 118 }}>姓名</th><th style={{ width: 136 }}>英文名 / 拼音</th>
          <th style={{ width: 58 }}>性别</th><th style={{ width: 102 }}>出生日期</th>
          <th style={{ width: 64 }}>类型</th><th style={{ width: 96 }}>证件类型</th>
          <th style={{ width: 142 }}>证件号码</th><th style={{ width: 100 }}>证件有效期</th>
          <th style={{ width: 112 }}>资料状态</th>{!isUbk && <th style={{ width: 64 }}>操作</th>}
        </tr></thead>
          <tbody>{d.travelers.map(t => (
            <tr key={t.id}>
              <td><b>{t.name || <span className="od-na">待补录</span>}</b>
                {t.is_contact ? <Tag c="info">联系人</Tag> : null}</td>
              <td className="mono sm">{t.en_name || '—'}</td>
              <td>{t.gender || '—'}</td>
              <td className="mono sm">{t.birth || '—'}</td>
              <td>{KIND_CN[t.kind] || t.kind}</td>
              <td>{t.id_type || '—'}</td>
              <td className="mono sm">{isUbk ? (t.id_no || '').replace(/^(.{2}).*(.{2})$/, '$1******$2') : (t.id_no || '—')}</td>
              <td className="mono sm">{t.id_exp || '—'}</td>
              <td><Tag c={(DOC_CN[t.doc_state] || [])[1]}>{(DOC_CN[t.doc_state] || ['—'])[0]}</Tag></td>
              {!isUbk && <td><a className="lnk" onClick={() => setDlg({ k: 'traveler', t })}>编辑</a></td>}
            </tr>))}</tbody></table>
      </div>
      <div className="od-tip">出行人姓名须与护照完全一致，用于出票与送签；供应商侧只看到脱敏后的证件号。</div>
    </div>);

  /* ---- 页签 4：交易信息（二级页签）---- */
  const pax = d.pax || 1;
  const unit = Math.round((d.amount || 0) / pax);
  const sUnit = Math.round((d.cost || 0) / pax);
  const tradeDetail = (<>
    <div className="od-th"><b>交易明细</b><s>销售金额与结算金额两栏对照</s></div>
    <div className="pad scrollx">
      <table className="od-tt">
        <thead><tr><th /><th>销售金额</th><th>结算金额</th></tr></thead>
        <tbody>
          <tr><th>报名</th>
            <td>{isUbk ? '—' : `${p.type}：${money(unit)} × ${pax} 人`}</td>
            <td>{`${p.supplier || '供应商'}：${money(sUnit)} × ${pax} 人`}</td></tr>
          <tr><th>其他费用</th>
            <td>{m.fee ? money(m.fee) : '—'}</td><td>—</td></tr>
          <tr><th>退款</th>
            <td>{m.refunded ? <b className="r">− {money(m.refunded)}</b> : '—'}</td><td>—</td></tr>
          <tr className="tot"><th>合计</th>
            <td>{isUbk ? '—' : (<>
              <div className="od-tt-k"><i>合同金额</i><b>{money(m.amount)}</b></div>
              <div className="od-tt-k"><i>应收金额</i><b>{money(m.due)}</b></div>
              <div className="od-tt-k"><i>实收金额</i><b>{money(m.recv)}</b></div>
              {!!m.refunded && <div className="od-tt-k"><i>已退金额</i><b className="w">{money(m.refunded)}</b></div>}
              <div className="od-tt-k"><i>待收金额</i><b className={m.owe ? 'r' : ''}>{money(m.owe)}</b></div>
            </>)}</td>
            <td>
              <div className="od-tt-k"><i>结算金额</i><b>{money(m.cost)}</b></div>
              <div className="od-tt-k"><i>成本金额</i><b>{money(m.cost)}</b></div>
              <div className="od-tt-k"><i>实付金额</i><b>{money(d.settle_state === 'paid' ? m.cost : 0)}</b></div>
              {!isUbk && <div className="od-tt-k"><i>毛利</i>
                <b className={m.profit < 0 ? 'r' : 'g'}>{money(m.profit)}（{d.rate != null ? d.rate : 0}%）</b></div>}
            </td></tr>
        </tbody></table>
    </div>
    <div className="od-sumbar">
      {!isUbk && <span className="it">合同金额<b>{money(m.amount)}</b></span>}
      {!isUbk && <span className="it">其他费用<b>{money(m.fee)}</b></span>}
      {!isUbk && !!m.refunded && <span className="it">已退款<b>{money(m.refunded)}</b></span>}
      <span className="it">供应商结算<b>{money(m.cost)}</b></span>
      <span className="tot">{isUbk ? '结算合计' : '应收合计'}<b>{money(isUbk ? m.cost : m.due)}</b></span>
    </div>
  </>);
  const tradeFund = (<>
    <div className="od-th"><b>收款单据</b></div>
    <div className="pad scrollx">
      <table className="tbl"><thead><tr>
        <th style={{ width: 140 }}>收款单号</th><th style={{ width: 120 }}>收款类别 / 方式</th>
        <th style={{ width: 80 }}>款项</th><th style={{ width: 110 }}>收款金额</th>
        <th style={{ width: 96 }}>审核状态</th><th style={{ width: 96 }}>经办人</th><th>制单时间</th>
      </tr></thead>
        <tbody>{d.payments.filter(x => x.kind !== 'refund').map(x => (
          <tr key={x.id}>
            <td className="mono sm"><b>{x.trade_no}</b></td>
            <td>{x.kind === 'recv' ? '客户收款' : '供应商结算'}<div className="hint">{x.way}</div></td>
            <td>{x.item}</td>
            <td className="num"><b>{money(x.amount)}</b></td>
            <td><Tag c={x.state === 'done' ? 'ok' : x.state === 'pending' ? 'warn' : 'bad'}>
              {x.state === 'done' ? '已审核' : x.state === 'pending' ? '待审核' : '有误'}</Tag></td>
            <td>{x.operator}</td><td className="t2">{x.created_at}</td>
          </tr>))}</tbody></table>
      {!d.payments.filter(x => x.kind !== 'refund').length && <div className="empty sm">无收款单据</div>}
    </div>
    <div className="od-th"><b>付款单据</b><s>平台付给供应商的结算款</s></div>
    <div className="pad">
      <table className="tbl"><thead><tr><th>结算对象</th><th style={{ width: 130 }}>应付金额</th>
        <th style={{ width: 130 }}>已付金额</th><th style={{ width: 110 }}>结算状态</th></tr></thead>
        <tbody><tr>
          <td>{p.supplier || NA}</td><td className="num">{money(m.cost)}</td>
          <td className="num">{money(d.settle_state === 'paid' ? m.cost : 0)}</td>
          <td><Tag c={d.settle_state === 'paid' ? 'ok' : 'warn'}>{d.settle_state === 'paid' ? '已结算' : '待结算'}</Tag></td>
        </tr></tbody></table>
    </div>
  </>);
  const tradeRefund = (<>
    <div className="od-th"><b>退款单据</b><s>发起 → 总部审核 → 出账</s></div>
    <div className="pad scrollx">
      <table className="tbl"><thead><tr>
        <th style={{ width: 140 }}>退款单号</th><th style={{ width: 110 }}>退款金额</th>
        <th style={{ width: 100 }}>退款方式</th><th style={{ width: 96 }}>状态</th>
        <th style={{ width: 90 }}>发起人</th><th>原因</th><th style={{ width: 150 }}>发起时间</th>
      </tr></thead>
        <tbody>{d.payments.filter(x => x.kind === 'refund').map(x => (
          <tr key={x.id}>
            <td className="mono sm"><b>{x.trade_no}</b></td>
            <td className="num"><b className="r">{money(x.amount)}</b></td>
            <td>{x.way}</td>
            <td><Tag c={x.state === 'done' ? 'ok' : x.state === 'pending' ? 'warn' : 'bad'}>
              {x.state === 'done' ? '已出账' : x.state === 'pending' ? '待审核' : '已驳回'}</Tag></td>
            <td>{x.operator}</td><td className="sm">{x.reason}</td><td className="t2">{x.created_at}</td>
          </tr>))}</tbody></table>
      {!d.payments.some(x => x.kind === 'refund') && <div className="empty sm">暂无退款单据</div>}
    </div>
  </>);
  const tradeContract = (
    <div className="pad">
      <table className="tbl"><thead><tr><th>合同编号</th><th style={{ width: 120 }}>合同状态</th>
        <th style={{ width: 140 }}>签署时间</th><th style={{ width: 120 }}>签署方式</th><th>签约主体</th></tr></thead>
        <tbody><tr>
          <td className="mono">{d.contract_no || NA}</td>
          <td><Tag c={d.contract_no ? 'ok' : 'warn'}>{v.contract_status}</Tag></td>
          <td className="t2">{(d.logs.find(l => l.act === '签署合同') || {}).created_at || '—'}</td>
          <td>{d.contract_no ? '电子签署' : '—'}</td>
          <td>{v.settle_entity}</td>
        </tr></tbody></table>
    </div>);
  const tradeFee = (<>
    <div className="pad scrollx">
      <table className="tbl"><thead><tr><th>费用名目</th><th style={{ width: 110 }}>金额</th>
        <th style={{ width: 90 }}>承担方</th><th>备注</th><th style={{ width: 150 }}>录入时间</th>
        {!isUbk && <th style={{ width: 56 }}>操作</th>}</tr></thead>
        <tbody>{d.fees.map(f => (
          <tr key={f.id}><td>{f.name}</td><td className="num">{money(f.amount)}</td><td>{f.bear}</td>
            <td className="sm">{f.remark || '—'}</td><td className="t2">{f.created_at}</td>
            {!isUbk && <td><a className="lnk r" onClick={async () => {
              await del(`/api/order/${no}/fee/${f.id}`); toast('已删除'); reload();
            }}>删除</a></td>}</tr>))}</tbody></table>
      {!d.fees.length && <div className="empty sm">暂无其他费用</div>}
    </div>
    {!isUbk && <div className="pad"><button className="btn btn-o btn-s" onClick={() => setDlg({ k: 'fee' })}>
      <Icon n="plus" s={14} />新增费用</button></div>}
  </>);
  const TR_TABS = isUbk
    ? [['detail', '结算明细', tradeDetail], ['fund', '结算单据', tradeFund]]
    : [['detail', '交易信息', tradeDetail], ['fund', '资金流水', tradeFund],
       ['refund', '退款记录', tradeRefund], ['contract', '合同信息', tradeContract], ['fee', '其他杂费', tradeFee]];
  const trade = (
    <div className="od-sec"><div className="hd"><h3>{isUbk ? '我的结算' : '交易信息'}</h3>
      <span className="en">{isUbk ? 'Settlement' : 'Transaction'}</span>
      {isUbk && <span className="sub">只展示平台与本供应商之间的结算口径，客人成交价与平台毛利不在此列</span>}</div>
      <div className="od-subtabs">
        {TR_TABS.map(([k, t]) => <a key={k} className={trTab === k ? 'on' : ''} onClick={() => setTrTab(k)}>{t}</a>)}
      </div>
      {(TR_TABS.find(x => x[0] === trTab) || TR_TABS[0])[2]}
    </div>);

  /* ---- 底部操作条 ---- */
  const closed = ['done', 'refunded', 'cancelled'].includes(d.status);
  const acts = [];
  if (!isUbk && !closed) {
    if (m.owe > 0) acts.push(['收款登记', 'p', () => setDlg({ k: 'pay' })]);
    if (!d.contract_no && (d.paid || 0) > 0) acts.push(['签署合同', 'p', () => call(`/api/order/${no}/contract`, {}, '合同已签署')]);
    /* 履约推进按状态位走：资源没确认之前门店推不动，只能催供应商 */
    if (v.trip_state === '未出行' && v.res_state !== '已确认')
      acts.push(['催供应商确认资源', 'o', () => call(`/api/order/${no}/note`,
        { text: `已催办供应商确认资源，待确认 ${(d.resItems || []).filter(x => x.state !== 'done').length} 项` }, '已记录催办')]);
    if (v.trip_state === '未出行' && v.res_state === '已确认' && v.notify_state !== '已通知')
      acts.push(['发出行通知', 'p', () => call(`/api/order/${no}/forward`, { step: 'notify' }, '出行通知已发出')]);
    if (v.trip_state === '未出行' && v.notify_state === '已通知')
      acts.push(['标记已出发', 'o', () => call(`/api/order/${no}/forward`, { step: 'go' }, '已标记出行中')]);
    if (v.trip_state === '出行中')
      acts.push(['标记回团完成', 'o', () => call(`/api/order/${no}/forward`, { step: 'back' }, '订单已完成')]);
  }
  if (scope === 'uom' && d.refund_state === 'applied') {
    acts.push(['退款审核通过', 'p', () => call(`/api/order/${no}/refund/audit`, { pass: true }, '退款已出账')]);
    acts.push(['驳回退款', 'o', () => call(`/api/order/${no}/refund/audit`, { pass: false, reason: '不符合退改政策' }, '退款已驳回')]);
  }
  if (scope === 'uom' && d.settle_state !== 'paid' && ['traveling', 'done'].includes(d.status))
    acts.push(['供应商结算', 'o', () => call(`/api/order/${no}/settle`, {}, '已结算')]);
  if (!isUbk && !closed) {
    acts.push(['添加备注', 'o', () => setDlg({ k: 'note' })]);
    if ((d.paid || 0) > 0 && d.refund_state !== 'applied') acts.push(['申请退款', 'r', () => setDlg({ k: 'refund' })]);
    if ((d.paid || 0) === 0) acts.push(['取消订单', 'r', () => setDlg({ k: 'cancel' })]);
  }
  if (isUbk && !closed) {
    const pend = (d.resItems || []).filter(x => x.state !== 'done');
    if (pend.length) acts.push([`一键确认剩余 ${pend.length} 项资源`, 'p',
      async () => { for (const it of pend) await post(`/api/order/${no}/res`, { id: it.id, state: 'done', role, who }); toast('资源已全部确认'); reload(); }]);
    if (d.settle_state !== 'paid' && ['traveling', 'done'].includes(d.status))
      acts.push(['申请结算', 'o', () => setDlg({ k: 'note' })]);
    acts.push(['回写备注', 'o', () => setDlg({ k: 'note' })]);
  }

  const doneN = d.progress.filter(x => x.state === 'done').length;
  const pct = Math.round(doneN / d.progress.length * 100);

  /* ---- 资源确认：供应商侧的履约核心，门店与总部只读 ---- */
  const canRes = isUbk || scope === 'uom';
  const RES_ST = { todo: ['待确认', 'warn'], done: ['已确认', 'ok'], fail: ['无法确认', 'bad'] };
  const setRes = (it, st) => call(`/api/order/${no}/res`, { id: it.id, state: st },
    st === 'done' ? `${it.cate} 已确认` : st === 'fail' ? `${it.cate} 标记为无法确认` : `${it.cate} 回到待确认`);
  const resPane = (
    <div className="od-sec"><div className="hd"><h3>资源确认</h3><span className="en">Resources</span>
      <span className="sub">{isUbk ? '逐项确认后回写平台，全部确认订单才能进入出行准备'
        : '由供应商回写，门店与总部只读'}</span></div>
      <div className="pad scrollx">
        <table className="tbl"><thead><tr>
          <th style={{ width: 130 }}>资源类别</th><th>内容</th><th style={{ width: 110 }}>状态</th>
          <th style={{ width: 130 }}>回写人</th><th style={{ width: 150 }}>更新时间</th>
          {canRes && <th style={{ width: 170 }}>操作</th>}
        </tr></thead>
          <tbody>{(d.resItems || []).map(it => {
            const r = RES_ST[it.state] || RES_ST.todo;
            return (<tr key={it.id}>
              <td><b>{it.cate}</b></td>
              <td>{it.name}{it.memo && <div className="hint">{it.memo}</div>}</td>
              <td><Tag c={r[1]}>{r[0]}</Tag></td>
              <td>{it.who || '—'}</td>
              <td className="t2">{it.updated_at}</td>
              {canRes && <td><div style={{ display: 'flex', gap: 6 }}>
                {it.state !== 'done' && <button className="ba" style={{ height: 26, padding: '0 12px', fontSize: 12 }}
                  disabled={busy} onClick={() => setRes(it, 'done')}>确认</button>}
                {it.state !== 'fail' && <button className="ba r" style={{ height: 26, padding: '0 12px', fontSize: 12 }}
                  disabled={busy} onClick={() => setRes(it, 'fail')}>无法确认</button>}
                {it.state !== 'todo' && <button className="ba" style={{ height: 26, padding: '0 12px', fontSize: 12 }}
                  disabled={busy} onClick={() => setRes(it, 'todo')}>撤回</button>}
              </div></td>}
            </tr>);
          })}</tbody></table>
        {!(d.resItems || []).length && <div className="empty sm">该订单暂无资源清单</div>}
      </div>
      <div className="od-tip">{isUbk
        ? '资源全部确认后，门店才能给客人发出行通知；任何一项标记为「无法确认」都会立刻通知门店。'
        : '资源确认由供应商端回写，这里只读。若长时间未确认，可在订单日志里留言催办。'}</div>
    </div>);

  const TABS = [['base', '订单信息']].concat(isUbk ? [] : [['contact', '联系人信息']],
    [['trv', `出行人信息（${d.travelers.length}）`],
     ['res', `资源确认（${(d.resItems || []).filter(x => x.state === 'done').length}/${(d.resItems || []).length}）`],
     ['trade', isUbk ? '我的结算' : '交易信息']]);
  const SEC = { base, contact, trv: travelers, res: resPane, trade };

  return (<div className="od" ref={scroller}>
    <div className="od-hd">
      <button className="back" onClick={onBack}><Icon n="back" s={14} />返回订单列表</button>
      <h2>订单详情</h2><span className="sub mono">订单编号 {d.no}</span>
    </div>
    {/* 订单当前进度（放在最上方）+ 右侧当前状态大版面 */}
    <div className="od-sec od-progsec">
      <div className="od-progl">
        <div className="hd"><h3>订单当前进度</h3><span className="en">Progress</span>
          <span className="sub">节点时间取自订单日志</span></div>
        <div className="od-steps">
          {d.progress.map(x => (
            <div className={'st ' + x.state} key={x.key}>
              <span className="dt"><Icon n={PROG_IC[x.key] || 'check'} s={16} /></span>
              <b>{x.title}</b>
              <span className="tm">{x.at
                ? <>{x.at.slice(5, 10)}<br />{x.at.slice(11, 16)}</>
                : x.state === 'doing' ? '进行中' : '待完成'}</span>
            </div>))}
        </div>
        {['refunded', 'cancelled'].includes(d.status) && (
          <div className="od-closed">本单已{v.status_text}{d.cancel_reason ? `：${d.cancel_reason}` : ''}，后续节点不再推进。</div>)}
      </div>
      <div className="od-progr">
        <div className="lb">当前订单状态</div>
        <div className={'big ' + (O_ST[v.status_key] || [])[1]}>{v.status_text}</div>
        <Ring pct={pct} />
        <div className="sts">
          <div><i>支付状态</i><Tag c={PAY_TAG[v.pay_state]}>{v.pay_state_cn}</Tag></div>
          <div><i>出行状态</i><Tag c={TRIP_TAG[v.trip_state]}>{v.trip_state}</Tag></div>
          <div><i>资源确认</i><Tag c={RES_TAG[v.res_state]}>{v.res_state}</Tag></div>
          <div><i>合同状态</i><Tag c={d.contract_no ? 'ok' : 'warn'}>{v.contract_status}</Tag></div>
          <div><i>出行通知</i><Tag c={v.notify_state === '已通知' ? 'ok' : 'plain'}>{v.notify_state}</Tag></div>
          <div><i>结算状态</i><Tag c={d.settle_state === 'paid' ? 'ok' : 'warn'}>
            {d.settle_state === 'paid' ? '已结算' : '未结算'}</Tag></div>
        </div>
      </div>
    </div>
    {head}
    <div className="od-tabs">
      {TABS.map(([k, t]) => <a key={k} className={cur === k ? 'on' : ''} onClick={() => jump(k)}>{t}</a>)}
    </div>
    {TABS.map(([k]) => <div className="od-anchor" key={k} ref={el => { refs.current[k] = el; }}>{SEC[k]}</div>)}

    {!!acts.length && (
      <div className="od-bar">
        <div className="bar-ctx">订单 <span className="mono">{d.no}</span>
          <s>{v.status_text} · {v.trip_state} · 资源{v.res_state}{p.supplier ? ' · ' + p.supplier : ''}</s></div>
        <div className="bar-act">{acts.map(([t, kind, fn]) => (
          <button key={t} className={'ba' + (kind === 'p' ? ' p' : kind === 'r' ? ' r' : '')}
            disabled={busy} onClick={fn}>{t}</button>))}
        </div>
      </div>)}

    {logOpen && (
      <div className="od-mask" onClick={() => setLogOpen(false)}>
        <div className="od-drawer" onClick={e => e.stopPropagation()}>
          <div className="hd"><b>订单日志</b><span className="mono">{d.no}</span>
            <button onClick={() => setLogOpen(false)}><Icon n="x" s={16} /></button></div>
          <div className="bd">
            {d.logs.map(l => (
              <div className="it" key={l.id}>
                <div className="t"><b>{l.act}</b><span>{l.created_at}</span></div>
                <div className="w">{l.role} · {l.who}</div>
                {l.detail && <div className="d">{l.detail}</div>}
              </div>))}
            {!d.logs.length && <div className="empty sm">暂无操作记录</div>}
          </div>
        </div>
      </div>)}
    {dlg && <OrderDlg d={d} no={no} dlg={dlg} busy={busy} onClose={() => setDlg(null)} onSubmit={call} />}
  </div>);
}

/* ---- 操作弹层：收款 / 退款 / 取消 / 备注 / 费用 / 出行人 ---- */
function OrderDlg({ d, no, dlg, busy, onClose, onSubmit }) {
  const m = d.money;
  const [f, setF] = useState(() => {
    if (dlg.k === 'pay') return { item: (d.paid || 0) > 0 ? '尾款' : '定金', amount: (d.paid || 0) > 0 ? m.owe : Math.round(m.amount * 0.3), way: '微信支付' };
    if (dlg.k === 'refund') return { amount: d.paid || 0, way: '原路退回', reason: '' };
    if (dlg.k === 'fee') return { name: '', amount: '', bear: '客人', remark: '' };
    if (dlg.k === 'traveler') return { kind: 'adult', id_type: '护照', doc_state: 'todo', ...dlg.t };
    return { reason: '', text: '' };
  });
  const set = (k, v) => setF(o => ({ ...o, [k]: v }));
  const T = { pay: '收款登记', refund: '申请退款', cancel: '取消订单', note: '添加备注', fee: '新增费用', traveler: dlg.t && dlg.t.id ? '编辑出行人' : '添加出行人' }[dlg.k];
  const go = () => {
    if (dlg.k === 'pay') return onSubmit(`/api/order/${no}/pay`, f, '收款已登记');
    if (dlg.k === 'refund') return onSubmit(`/api/order/${no}/refund/apply`, f, '退款申请已提交，等待总部审核');
    if (dlg.k === 'cancel') return onSubmit(`/api/order/${no}/cancel`, f, '订单已取消');
    if (dlg.k === 'note') return onSubmit(`/api/order/${no}/note`, f, '备注已记录');
    if (dlg.k === 'fee') return onSubmit(`/api/order/${no}/fee`, f, '费用已新增');
    if (dlg.k === 'traveler') return onSubmit(`/api/order/${no}/traveler`, f, '出行人已保存');
  };
  const L = ({ label, children }) => (<div className="dl-l"><span>{label}</span><div>{children}</div></div>);
  return (<div className="od-mask" onClick={onClose}>
    <div className="od-dlg" onClick={e => e.stopPropagation()}>
      <div className="hd"><b>{T}</b><button onClick={onClose}><Icon n="x" s={16} /></button></div>
      <div className="bd">
        {dlg.k === 'pay' && (<>
          <L label="收款项目"><select className="inp" value={f.item} onChange={e => set('item', e.target.value)}>
            <option>定金</option><option>尾款</option><option>全款</option></select></L>
          <L label="收款金额"><input className="inp" type="number" value={f.amount} onChange={e => set('amount', e.target.value)} /></L>
          <L label="收款方式"><select className="inp" value={f.way} onChange={e => set('way', e.target.value)}>
            <option>微信支付</option><option>支付宝</option><option>对公转账</option><option>POS 刷卡</option></select></L>
          <div className="dl-tip">本单应收 {money(m.amount)}，已收 {money(m.recv)}，还差 {money(m.owe)}。</div>
        </>)}
        {dlg.k === 'refund' && (<>
          <L label="退款金额"><input className="inp" type="number" value={f.amount} onChange={e => set('amount', e.target.value)} /></L>
          <L label="退款方式"><select className="inp" value={f.way} onChange={e => set('way', e.target.value)}>
            <option>原路退回</option><option>对公转账</option></select></L>
          <L label="退款原因"><textarea className="inp" rows={3} value={f.reason} onChange={e => set('reason', e.target.value)}
            placeholder="如：客人因签证被拒申请取消" /></L>
          <div className="dl-tip">本单已收 {money(d.paid || 0)}。提交后进入总部审核，审核通过才出账。</div>
        </>)}
        {dlg.k === 'cancel' && (<>
          <L label="取消原因"><textarea className="inp" rows={3} value={f.reason} onChange={e => set('reason', e.target.value)}
            placeholder="如：客人行程变更，暂不出行" /></L>
          <div className="dl-tip">本单尚未收款，取消后订单关闭，关联咨询单同步标记为「已流失」。</div>
        </>)}
        {dlg.k === 'note' && (
          <L label="备注内容"><textarea className="inp" rows={3} value={f.text} onChange={e => set('text', e.target.value)}
            placeholder="写入订单日志，三端可见" /></L>)}
        {dlg.k === 'fee' && (<>
          <L label="费用名目"><input className="inp" value={f.name} onChange={e => set('name', e.target.value)} placeholder="单房差 / 改签费 / 签证费" /></L>
          <L label="金额"><input className="inp" type="number" value={f.amount} onChange={e => set('amount', e.target.value)} /></L>
          <L label="承担方"><select className="inp" value={f.bear} onChange={e => set('bear', e.target.value)}>
            <option>客人</option><option>门店</option><option>供应商</option></select></L>
          <L label="备注"><input className="inp" value={f.remark} onChange={e => set('remark', e.target.value)} /></L>
        </>)}
        {dlg.k === 'traveler' && (<>
          <L label="中文姓名"><input className="inp" value={f.name || ''} onChange={e => set('name', e.target.value)} /></L>
          <L label="英文名 / 拼音"><input className="inp" value={f.en_name || ''} onChange={e => set('en_name', e.target.value)}
            placeholder="须与护照一致，如 ZHANG/SAN" /></L>
          <L label="性别 / 出生日期"><div style={{ display: 'flex', gap: 8 }}>
            <select className="inp" style={{ width: 90 }} value={f.gender || ''} onChange={e => set('gender', e.target.value)}>
              <option value="">选择</option><option>男</option><option>女</option></select>
            <input className="inp" value={f.birth || ''} onChange={e => set('birth', e.target.value)} placeholder="1990-01-01" /></div></L>
          <L label="出行人类型"><select className="inp" value={f.kind} onChange={e => set('kind', e.target.value)}>
            <option value="adult">成人</option><option value="child">儿童</option><option value="elder">长者</option></select></L>
          <L label="证件号码"><input className="inp" value={f.id_no || ''} onChange={e => set('id_no', e.target.value)} /></L>
          <L label="证件有效期"><input className="inp" value={f.id_exp || ''} onChange={e => set('id_exp', e.target.value)} placeholder="2032-05-20" /></L>
          <L label="资料状态"><select className="inp" value={f.doc_state} onChange={e => set('doc_state', e.target.value)}>
            <option value="todo">待收资料</option><option value="part">部分已收</option><option value="done">资料齐全</option></select></L>
        </>)}
      </div>
      <div className="ft">
        <button className="btn btn-o" onClick={onClose}>取消</button>
        <button className="btn btn-p" disabled={busy} onClick={go}>确认</button>
      </div>
    </div>
  </div>);
}


/* ============ 列表 ============ */
/* 版式：筛选与列表拆成两个独立模块；列表模块自带紧凑统计条 + 表头，
   行仍是「一单一块」，但每一格与表头用同一套 grid 模板严格对齐。 */

/* 列宽：七列一律走 minmax(下限, fr)，不再写死 px，余量按 fr 摊平。
   v56 实测修正：日期列原来只有 128px，可用 104px，而横排的「出行 2026-10-25」
   （.oc-r 的 62px 标签列 + 10px 间距 + 不换行的日期值）要 136.7px，溢出 32.7px
   直接压在人数列上；人数列 88px 可用 64px、内容要 79.1px，又压到联系人列。
   现在日期与人数都改竖排 .oc-v（标签在上、值在下，与产品/内容列表一致），
   内容宽度降到 65px 上下，再把产品列与联系人列的富余匀过来，各列余量拉平。 */
const G7 = 'minmax(250px,1.3fr) minmax(128px,0.72fr) minmax(136px,0.78fr) minmax(140px,0.66fr) minmax(176px,0.92fr) minmax(158px,0.82fr) 172px';
const G6 = 'minmax(250px,1.3fr) minmax(128px,0.72fr) minmax(136px,0.78fr) minmax(150px,0.8fr) minmax(158px,0.86fr) minmax(140px,0.72fr) 172px';
/* v57 总部口径（UOM）：销售 / 渠道 / 分公司 原来挤在行首的摘要条里，业务方要各占一列，
   于是这一端是十列。1680px 视口下可用栅格宽 1364px，十列下限合计 1297px 放得下；
   窗口更窄时靠 .op-list 的横向滚动兜底，不让列互相压。
   列序：产品信息 日期 人数 订单联系人 销售 渠道 分公司 订单金额 结算金额 订单状态
   —— 下限值来自 playwright 逐格实测的文本宽度 + 24px 内边距，不是拍脑袋。 */
const G10 = 'minmax(235px,1.46fr) minmax(92px,0.52fr) minmax(108px,0.6fr) minmax(108px,0.6fr) '
  + 'minmax(82px,0.42fr) minmax(122px,0.7fr) minmax(128px,0.74fr) '
  + 'minmax(152px,0.84fr) minmax(152px,0.84fr) minmax(132px,0.68fr)';
/* 十列下限合计（含 .ol-head / .ol-cells 左右各 6px 内边距）*/
const G10_MIN = 1311 + 12;

export function FiltPanel({ fields, val, onChange, open, setOpen, onExport }) {
  const [tmp, setTmp] = useState(val);
  useEffect(() => setTmp(val), [val]);
  const cks = fields.filter(f => f.type === 'ck');
  const body = fields.filter(f => f.type !== 'ck');
  const shown = open ? body : body.slice(0, 8);
  const set = (k, v2) => setTmp(o => ({ ...o, [k]: v2 }));
  const go = () => onChange(tmp);
  const cleared = !Object.values(tmp).some(x => x !== '' && x != null && x !== 0);
  return (<>
    <div className="fp-g">
      {shown.map(f => (
        <label className="fp-c" key={f.k}><s>{f.t}</s>
          {f.type === 'sel'
            ? <select value={tmp[f.k] || ''} onChange={e => set(f.k, e.target.value)}>
                <option value="">全部</option>
                {(f.opts || []).map(o => <option key={o} value={o}>{o}</option>)}</select>
            : f.type === 'dr'
              ? <div className="fp-dr">
                  <input type="date" value={tmp[f.k + '_a'] || ''} onChange={e => set(f.k + '_a', e.target.value)} />
                  <s>—</s>
                  <input type="date" value={tmp[f.k + '_b'] || ''} onChange={e => set(f.k + '_b', e.target.value)} /></div>
            : f.type === 'nr'
              /* 数值区间：金额、订单数这类「多少到多少」的条件，和日期区间同一套写法，
                 落到 k_a / k_b 两个值上 */
              ? <div className="fp-dr">
                  <input type="number" inputMode="numeric" placeholder={f.pha || '最低'}
                    value={tmp[f.k + '_a'] ?? ''} onChange={e => set(f.k + '_a', e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && go()} />
                  <s>—</s>
                  <input type="number" inputMode="numeric" placeholder={f.phb || '最高'}
                    value={tmp[f.k + '_b'] ?? ''} onChange={e => set(f.k + '_b', e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && go()} /></div>
              : <input value={tmp[f.k] || ''} placeholder={f.ph || '请输入'}
                  onChange={e => set(f.k, e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} />}
        </label>))}
    </div>
    <div className="fp-b">
      {cks.map(f => (
        <label className="fp-ck" key={f.k}>
          <input type="checkbox" checked={!!tmp[f.k]}
            onChange={e => { const n = { ...tmp, [f.k]: e.target.checked ? 1 : 0 }; setTmp(n); onChange(n); }} />
          <span>{f.t}</span></label>))}
      <span className="sp" />
      {body.length > 8 && <a className="fp-more" onClick={() => setOpen(!open)}>{open ? '收起筛选 ⌃' : '更多筛选 ⌄'}</a>}
      <button className="fp-rst" disabled={cleared} onClick={() => { setTmp({}); onChange({}); }}>重置</button>
      <button className="fp-go" onClick={go}>查询</button>
    </div>
  </>);
}

export function OrderList({ scope, vendor }) {
  const toast = useToast();
  const nav = useNavigate();
  const { arg: open, setArg: setOpen } = usePage('/' + scope, 'order');
  const [fv, setFv] = useState({});
  const [fpOpen, setFpOpen] = useState(false);
  const [tab, setTab] = useState('all');
  const [sort, setSort] = useState('new');
  const [sel, setSel] = useState([]);
  const { d: rows, reload } = useData(
    () => get(`/api/order/list?scope=${scope}${vendor ? '&vendor=' + vendor : ''}`), [scope, vendor], []);
  const isUbk = scope === 'ubk';
  const isUom = scope === 'uom';
  const all = rows || [];
  const uniq = f => [...new Set(all.map(f).filter(Boolean))];

  const FIELDS = [
    { k: 'no', t: '订单编号', ph: '请输入订单编号' },
    { k: 'cno', t: '关联咨询单号', ph: '请输入咨询单号' },
    { k: 'prod', t: '产品名称 / 目的地', ph: '请输入' },
    { k: 'ptype', t: '产品类型', type: 'sel', opts: ['一对一定制', '定制产品', '臻品团'] },
    { k: 'region', t: '旅游类型', type: 'sel', opts: uniq(o => (o.view || {}).product?.region) },
    { k: 'made', t: '下单日期', type: 'dr' },
    { k: 'go', t: '出行日期', type: 'dr' },
    { k: 'status', t: '订单状态', type: 'sel', opts: ['待支付', '部分支付', '已支付', '已完成', '已取消', '已退订'] },
    { k: 'trip', t: '出行状态', type: 'sel', opts: ['未出行', '出行中', '已回团'] },
    ...(isUbk ? [
      { k: 'settle', t: '收款状态', type: 'sel', opts: ['待收款', '已收款'] },
      { k: 'res', t: '资源确认状态', type: 'sel', opts: ['待确认', '已确认'] },
      { k: 'contact', t: '订单联系人', ph: '姓名或手机号' },
      { k: 'traveler', t: '出行人', ph: '出行人姓名' },
    ] : [
      { k: 'contract', t: '订单合同状态', type: 'sel', opts: ['未签约', '已签约'] },
      { k: 'res', t: '资源确认状态', type: 'sel', opts: ['待确认', '已确认'] },
      { k: 'supplier', t: '供应商', type: 'sel', opts: uniq(o => o.supplier_name) },
      { k: 'shop', t: '销售渠道', type: 'sel', opts: uniq(o => o.shop) },
      { k: 'sales', t: '销售人员', type: 'sel', opts: uniq(o => o.sales_name) },
      { k: 'contact', t: '订单联系人', ph: '姓名或手机号' },
      { k: 'traveler', t: '出行人', ph: '出行人姓名' },
      { k: 'src', t: '业务来源', type: 'sel', opts: uniq(o => (o.view || {}).biz_source) },
      { k: 'client', t: '下单客户端', type: 'sel', opts: uniq(o => (o.view || {}).client) },
      { k: 'notify', t: '出行通知状态', type: 'sel', opts: ['未通知', '已通知'] },
      { k: 'insure', t: '订单保险状态', type: 'sel', opts: ['未投保', '已投保'] },
      { k: 'from', t: '出发城市', type: 'sel', opts: uniq(o => (o.view || {}).product?.from_city) },
    ]),
    ...(isUbk ? [{ k: 'unsettled', t: '只看待收款', type: 'ck' }]
      : [{ k: 'owe', t: '只看有欠款的', type: 'ck' },
         { k: 'overdue', t: '只看超期欠款', type: 'ck' },
         { k: 'refund', t: '只看退款审核中的', type: 'ck' }]),
  ];

  const byFilt = useMemo(() => all.filter(o => {
    const v = o.view || {}, p = v.product || {}, fl = v.flags || [];
    const dr = (key, val2) => {
      const a = fv[key + '_a'], b = fv[key + '_b'];
      if (!a && !b) return true;
      const x = String(val2 || '').slice(0, 10);
      if (!x) return false;
      return (!a || x >= a) && (!b || x <= b);
    };
    const has = (k, val2) => !fv[k] || String(val2 || '') === fv[k];
    const like = (k, val2) => !fv[k] || String(val2 || '').toLowerCase().includes(fv[k].toLowerCase());
    if (!like('no', o.no)) return false;
    if (fv.cno && !(o.consult_no || '').toLowerCase().includes(fv.cno.toLowerCase())) return false;
    if (fv.prod && !`${o.dest}${p.name || ''}`.toLowerCase().includes(fv.prod.toLowerCase())) return false;
    if (!has('ptype', p.type)) return false;
    if (!has('region', p.region)) return false;
    if (!dr('made', o.created_at) || !dr('go', o.go_date)) return false;
    if (!has('status', v.status_text)) return false;
    if (!has('trip', v.trip_state)) return false;
    if (!has('contract', v.contract_status)) return false;
    if (!has('res', v.res_state)) return false;
    if (!has('supplier', o.supplier_name)) return false;
    if (!has('shop', o.shop)) return false;
    if (!has('sales', o.sales_name)) return false;
    if (fv.contact && !`${o.customer}${o.phone}`.toLowerCase().includes(fv.contact.toLowerCase())) return false;
    if (fv.traveler && !(o.travelers || []).some(t => (t || '').includes(fv.traveler))
        && !`${o.customer}`.includes(fv.traveler)) return false;
    if (!has('src', v.biz_source)) return false;
    if (!has('client', v.client)) return false;
    if (!has('notify', v.notify_state)) return false;
    if (!has('insure', v.insure_state)) return false;
    if (!has('from', p.from_city)) return false;
    if (fv.settle && v.recv_state_cn !== fv.settle) return false;
    if (fv.owe && !(o.owe > 0)) return false;
    if (fv.overdue && !fl.includes('overdue')) return false;
    if (fv.refund && o.refund_state !== 'applied') return false;
    if (fv.unsettled && o.settle_state === 'paid') return false;
    return true;
  }), [all, fv]);

  /* 顶部页签＝业务待办分类，和众信「待占位 / 临近出团未收全款 / 超期欠款」一个思路，
     不是订单状态机的罗列——状态筛选在筛选区里做多选。 */
  const flagged = (o, f) => ((o.view || {}).flags || []).includes(f);
  const QUICK = isUbk
    ? [['all', '全部订单', () => true],
       ['res', '待确认资源', o => flagged(o, 'res')],
       ['neargo', '临近出行', o => flagged(o, 'neargo')],
       ['unsettled', '待收结算款', o => o.settle_state !== 'paid'],
       ['traveling', '出行中', o => (o.view || {}).trip_state === '出行中']]
    : [['all', '全部订单', () => true],
       ['unpaid', '待支付', o => (o.view || {}).status_key === 'created'],
       ['res', '待确认资源', o => flagged(o, 'res')],
       ['contract', '待签合同', o => flagged(o, 'contract')],
       ['nearowe', '临近出行未收全款', o => flagged(o, 'nearowe')],
       ['overdue', '超期欠款', o => flagged(o, 'overdue')],
       ['refund', '待退款审核', o => flagged(o, 'refund')],
       ['traveling', '出行中', o => (o.view || {}).trip_state === '出行中']];
  const TABS = QUICK.filter(([k, , fn]) => k === 'all' || byFilt.some(fn));

  const list = useMemo(() => {
    const q = QUICK.find(x => x[0] === tab);
    const l = byFilt.filter(o => !q || q[0] === 'all' || q[2](o));
    const cmp = {
      new: (a, b) => (b.created_at || '').localeCompare(a.created_at || ''),
      old: (a, b) => (a.created_at || '').localeCompare(b.created_at || ''),
      go: (a, b) => (a.go_date || '9999').localeCompare(b.go_date || '9999'),
      owe: (a, b) => (b.owe || 0) - (a.owe || 0),
    };
    return [...l].sort(cmp[sort] || cmp.new);
  }, [byFilt, tab, sort, QUICK]);

  const s2 = k => list.reduce((a, o) => a + (o[k] || 0), 0);
  const pax = list.reduce((a, o) => a + (o.pax || 0), 0);
  /* 统计条：跟着当前筛选结果走，压成一行摆在列表模块头部，不单独占版面 */
  const STAT = isUbk
    ? [['订单', list.length + ' 单'], ['出行人', pax + ' 人'], ['结算收入', money(s2('cost'))],
       ['已收款', money(list.filter(o => o.settle_state === 'paid').reduce((a, o) => a + (o.cost || 0), 0)), 'g'],
       ['待收款', money(list.filter(o => o.settle_state !== 'paid').reduce((a, o) => a + (o.cost || 0), 0)), 'r']]
    : [['订单', list.length + ' 单'], ['出行人', pax + ' 人'], ['成交', money(s2('amount'))],
       ['应收', money(s2('due'))], ['实收', money(s2('recv')), 'g'],
       ['待收', money(s2('owe')), s2('owe') > 0 ? 'r' : ''],
       ['采购', money(s2('cost'))], ['毛利', money(s2('gross')), 'g']];


  const COLS = isUbk
    ? ['产品信息', '团期', '出行人', '归属门店', '我的结算', '履约状态', '订单状态']
    : isUom
      ? ['产品信息', '日期', '人数', '订单联系人', '销售', '渠道', '分公司', '订单金额', '结算金额', '订单状态']
      : ['产品信息', '日期', '人数', '订单联系人', '订单金额', '结算金额', '订单状态'];

  const exportCsv = () => {
    if (!list.length) return toast('没有可导出的订单');
    const hd = ['订单编号', '下单时间', '客户', '联系电话', '目的地', '天数', '人数', '出行日期',
      '成交金额', '应收', '实收', '欠款', '结算价', '毛利', '销售', '供应商', '订单状态', '支付状态', '履约状态'];
    const body = list.map(o => [o.no, o.created_at, o.customer, o.phone, o.dest, o.days, o.pax, o.go_date,
      o.amount, o.due, o.recv, o.owe, o.cost, o.gross, o.sales_name, o.supplier_name,
      (o.view || {}).status_text, (o.view || {}).pay_state_cn, (o.view || {}).trip_state]);
    const csv = '﻿' + [hd, ...body].map(l => l.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = '定制旅游订单.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('已导出 ' + list.length + ' 单');
  };

  if (open) return <OrderDetail no={open} scope={scope} onBack={() => { setOpen(null); setSel([]); reload(); }} />;

  const hit = list.filter(o => sel.includes(o.no));
  const allChecked = list.length > 0 && list.every(o => sel.includes(o.no));
  const grid = isUom
    ? { gridTemplateColumns: G10, minWidth: G10_MIN }
    : { gridTemplateColumns: isUbk ? G6 : G7 };

  return (<div className="op">
    {/* 模块一：筛选条件 */}
    <section className="mod">
      <div className="mod-h"><h3>筛选条件</h3><span className="en">Filter</span>
        <a className="mod-x" onClick={exportCsv}>导出当前结果</a></div>
      <div className="mod-b">
        <FiltPanel fields={FIELDS} val={fv} onChange={setFv} open={fpOpen} setOpen={setFpOpen} onExport={exportCsv} />
      </div>
    </section>

    {/* 模块二：订单列表（统计条压在模块头里）。
        op-list 带横向滚动：UOM 是十列，窗口窄于 ~1580px 时列宽会跌到 minmax 下限，
        此时整块横向滚动，而不是让列互相挤压重合。 */}
    <section className={'mod' + (isUom ? ' op-list' : '')}>
      <div className="mod-h"><h3>订单列表</h3><span className="en">Orders</span>
        <div className="mod-stat">
          {STAT.map(([k, v2, c]) => <i key={k}>{k}：<b className={c || ''}>{v2}</b></i>)}
        </div>
      </div>
      <div className="op-tabs">
        {TABS.map(([k, t, fn]) => (
          <a key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setSel([]); }}>
            {t}<b>{k === 'all' ? byFilt.length : byFilt.filter(fn).length}</b></a>))}
      </div>
      <div className="op-tool">
        <label className="ck"><input type="checkbox" checked={allChecked}
          onChange={e => setSel(e.target.checked ? list.map(o => o.no) : [])} />全选</label>
        <button className="tb" onClick={() => sel.length
          ? toast(isUbk ? '已向平台提交 ' + sel.length + ' 单结算申请' : '开票申请已提交财务，1–3 个工作日内开具')
          : toast('请先勾选订单')}>{isUbk ? '批量申请结算' : '批量开发票'}</button>
        <button className="tb" onClick={exportCsv}>导出</button>
        {!!sel.length && <span className="sel">已选 {sel.length} 单 ·
          {isUbk ? ' 结算金额合计 ' + money(hit.reduce((a, o) => a + (o.cost || 0), 0))
                 : ' 可开票金额 ' + money(hit.reduce((a, o) => a + (o.recv || 0), 0))}
          　<a className="lnk" onClick={() => setSel([])}>取消选择</a></span>}
        <span className="cnt">共 {list.length} 单</span>
        <select className="srt" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="new">下单日期（由近到远）</option>
          <option value="old">下单日期（由远到近）</option>
          <option value="go">出行日期（由近到远）</option>
          <option value="owe">欠款金额（由高到低）</option>
        </select>
      </div>

      {/* 表头 */}
      <div className="ol-head" style={grid}>
        {COLS.map(c => <span key={c}>{c}</span>)}
      </div>

      {!list.length ? <div className="op-empty">没有符合条件的订单</div> : list.map(o => {
        const v = o.view || {};
        const cover = v.cover;
        return (<div className="ol-row" key={o.no} style={isUom ? { minWidth: G10_MIN } : undefined}>
          <div className="ol-sub">
            <label className="ck"><input type="checkbox" checked={sel.includes(o.no)}
              onChange={e => setSel(a => e.target.checked ? [...a, o.no] : a.filter(x => x !== o.no))} /></label>
            <span className="f">订单编号 <b className="mono">{o.no}</b>
              <span className="cp" title="复制订单号"
                onClick={() => { navigator.clipboard && navigator.clipboard.writeText(o.no); toast('订单号已复制'); }}>
                <Icon n="file" s={11} /></span></span>
            <span className="f">下单 <b>{(o.created_at || '').slice(0, 16)}</b></span>
            {/* v57：UOM 下「渠道 / 销售」已各自独占一列，摘要条里不再重复展示 */}
            {!isUom && <span className="f">渠道 <b>{v.channel_text || '—'}</b></span>}
            {isUbk ? <span className="f">咨询单 <b className="mono">{o.consult_no || '—'}</b></span>
                   : !isUom ? <span className="f">销售 <b>{o.sales_name || '—'}</b></span> : null}
            {!isUbk && <span className="f">合同 <b>{v.contract_status}</b></span>}
            <a className="more" onClick={() => setOpen(o.no)}>查看详情 ›</a>
          </div>
          <div className="ol-cells" style={grid}>
            <div className="c">
              <div className="oc-p">
                {cover ? <img src={oimg(cover)} alt="" />
                       : <span className="ph"><Icon n="map" s={15} c="var(--muted-2)" /></span>}
                <div className="tx">
                  <div className="nm" onClick={() => setOpen(o.no)}>{o.dest}</div>
                  <div className="oc-s">{isUbk ? '区域：' + ((v.product || {}).region || '—')
                                               : '供应商：' + (o.supplier_name || '—')}</div>
                  {!isUbk && o.consult_no && <div className="oc-s">咨询单 <a className="lnk mono"
                    onClick={e => { e.stopPropagation(); nav('/csp/board/' + o.consult_no); }}>{o.consult_no}</a></div>}
                  <div className="oc-tags">
                    <em>{(v.product || {}).type || '一对一定制'}</em>
                    {(v.product || {}).region && <em>{v.product.region}</em>}
                    <em>{o.days} 天</em>
                  </div>
                </div>
              </div>
            </div>
            {/* 日期：竖排。横排时 62px 标签列 + 不换行的 10 位日期合计 136.7px，
                塞不进这一列，值会盖到右边的人数列上。天数挪到左边产品列的标签行。 */}
            <div className="c">
              <div className="oc-v"><i>出行日期</i><b>{o.go_date || '—'}</b></div>
              <div className="oc-v"><i>下单日期</i><b className="mu">{(o.created_at || '').slice(0, 10)}</b></div>
            </div>
            {/* 人数：竖排。原来成人/儿童/长者三行横排，62px 标签列就吃掉了全部可用宽度，
                数字被挤出列外。改成总人数一行 + 人员构成一行（只列非零项，可折行）。 */}
            <div className="c">
              <div className="oc-v"><i>出行人数</i><b>{o.pax} 人</b></div>
              {v.pax_mix && <div className="oc-v"><i>人员构成</i><b className="mu wr">
                {[['成人', v.pax_mix.adults], ['儿童', v.pax_mix.children], ['长者', v.pax_mix.elders]]
                  .filter(([, n]) => n).map(([t, n]) => t + ' ' + n).join(' · ') || '未登记'}</b></div>}
            </div>
            <div className="c">
              {isUbk ? (<>
                {/* 原来这里头一行是「N 人出行」，和左边的人数列重复了，改成门店打头 */}
                <div className="nm2">{o.shop || '—'}</div>
                <div className="oc-s">联系人 {(o.customer || '').slice(0, 1)}**</div>
                <div className="oc-s">咨询单 {o.consult_no || '—'}</div>
              </>) : (<>
                <div className="nm2">{o.customer}</div>
                <div className="oc-s mono">{o.phone}</div>
                <div className="oc-s">{v.cust_type || '直客'} · {(v.biz_source || '—').split(' · ').pop()}</div>
              </>)}
            </div>
            {/* v57 新增三列（仅 UOM 总部）：销售 / 渠道 / 分公司。
                渠道取 channel.name（门店），分公司取 channel.company（签约主体），
                两者来源不同不能混用；长名称走 .oc-v>b.wr 折行，不做 nowrap 压邻列。 */}
            {isUom && (<>
              <div className="c">
                <div className="oc-v"><i>服务销售</i><b className="wr">{o.sales_name || '—'}</b></div>
                <div className="oc-v"><i>下单来源</i><b className="mu wr">
                  {(v.biz_source || '—').split(' · ')[0]}</b></div>
              </div>
              <div className="c">
                <div className="oc-v"><i>销售渠道</i><b className="wr">{v.channel_text || '—'}</b></div>
                <div className="oc-v"><i>渠道编号</i><b className="mu">{v.channel_code || '—'}</b></div>
              </div>
              <div className="c">
                <div className="oc-v"><i>归属分公司</i><b className="wr">{v.sale_org || '—'}</b></div>
                <div className="oc-v"><i>所在城市</i><b className="mu">{v.channel_city || '—'}</b></div>
              </div>
            </>)}
            {isUbk ? (<>
              <div className="c">
                <div className="oc-r"><i>结算价</i><b className="w">{money(o.cost)}</b></div>
                <div className="oc-r"><i>人均</i><b className="mu">{money(Math.round((o.cost || 0) / (o.pax || 1)))}</b></div>
                <div className="oc-r"><i>收款</i><b className={o.settle_state === 'paid' ? 'g' : 'r'}>
                  {o.settle_state === 'paid' ? '已收' : '待收'}</b></div>
              </div>
              <div className="c">
                <div className="oc-r2"><i>资源</i><Tag c={RES_TAG[v.res_state]}>{v.res_state}</Tag></div>
                <div className="oc-r2"><i>通知</i>
                  <Tag c={v.notify_state === '已通知' ? 'ok' : 'plain'}>{v.notify_state}</Tag></div>
              </div>
            </>) : (<>
              <div className="c">
                <div className="oc-r"><i>合同</i><b>{money(o.amount)}</b></div>
                <div className="oc-r"><i>应收</i><b>{money(o.due)}</b></div>
                <div className="oc-r"><i>实收</i><b className="g">{money(o.recv)}</b></div>
                <div className="oc-r"><i>欠款</i><b className={o.owe > 0 ? 'r' : 'mu'}>{money(o.owe)}</b></div>
                {!!o.refunded && <div className="oc-r"><i>已退</i><b className="w">{money(o.refunded)}</b></div>}
              </div>
              <div className="c">
                <div className="oc-r"><i>结算</i><b className="w">{money(o.cost)}</b></div>
                <div className="oc-r"><i>待付</i><b className={o.payable_open > 0 ? 'w' : 'mu'}>{money(o.payable_open)}</b></div>
                <div className="oc-r"><i>毛利</i><b className={o.gross < 0 ? 'r' : 'g'}>{money(o.gross)}</b></div>
                <div className="oc-r"><i>毛利率</i><b className="mu">{o.amount ? Math.round(o.gross * 1000 / o.amount) / 10 : 0}%</b></div>
              </div>
            </>)}
            <div className="c">
              <div className="oc-r2"><i>订单</i><Tag c={(O_ST[v.status_key] || [])[1]}>{v.status_text}</Tag></div>
              <div className="oc-r2"><i>出行</i><Tag c={TRIP_TAG[v.trip_state]}>{v.trip_state}</Tag></div>
              <div className="oc-r2"><i>资源</i><Tag c={RES_TAG[v.res_state]}>{v.res_state}</Tag></div>
              {isUbk && <div className="oc-r2"><i>结算</i><Tag c={o.settle_state === 'paid' ? 'ok' : 'warn'}>{v.recv_state_cn}</Tag></div>}
              {o.refund_state === 'applied' && <div className="oc-r2"><i>退款</i><Tag c="bad">审核中</Tag></div>}
            </div>
          </div>
          <div className="ol-ops">
            {!isUbk && o.owe > 0 && !['refunded', 'cancelled'].includes(o.status) &&
              <button className="ob" onClick={() => setOpen(o.no)}>收款登记</button>}
            {!isUbk && !o.contract_no && (o.paid || 0) > 0 &&
              <button className="ob" onClick={() => setOpen(o.no)}>签署合同</button>}
            {scope === 'uom' && o.refund_state === 'applied' &&
              <button className="ob r" onClick={() => setOpen(o.no)}>退款审核</button>}
            {scope === 'uom' && o.settle_state !== 'paid' && ['traveling', 'done'].includes(o.status) &&
              <button className="ob" onClick={() => setOpen(o.no)}>供应商结算</button>}
            {isUbk && <button className="ob" onClick={() => setOpen(o.no)}>回写资源确认</button>}
            {!isUbk && <button className="ob" onClick={() => setOpen(o.no)}>查看行程</button>}
            <button className="ob" onClick={() => setOpen(o.no)}>出行人信息</button>
            <button className="ob p" onClick={() => setOpen(o.no)}>订单详情</button>
          </div>
        </div>);
      })}
      <div className="op-ft">共 {list.length} 单 · 咨询单成交后自动生成订单，门店 / 总部 / 供应商看同一条数据，操作全部留痕</div>
    </section>
  </div>);
}
