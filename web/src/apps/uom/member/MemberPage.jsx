import React, { useState, useMemo, useEffect } from 'react';
import { get, post, put, del, money0 } from '../../../shared/api.js';
import { Icon, useToast, useData } from '../../../shared/ui.jsx';
import { usePage } from '../../../shared/route.js';
import { FiltPanel } from '../../../shared/Orders.jsx';
import { Rich } from '../../../shared/Rich.jsx';

/* ============ 运营 · 会员 ============
   三块：会员列表（真实数据，从订单实收金额算）、等级定义（门槛可改）、权益与关联。
   本期唯一定级规则是「年度订单消费金额」——业务口径，规则字段留了扩展位，
   以后要按积分或订单数定级，加一种 rule_kind 就行，表结构不用动。 */

const KIND_CN = { service: '服务', discount: '折扣', gift: '礼遇', privilege: '特权' };

/* 权益图标：客人在小程序会员中心那一格看到的就是它。
   原来在小程序里按 code 写死一张映射表，后台新建的权益一律落成默认星星，运营改不了。 */
const BEN_ICONS = ['chat', 'calendar', 'clock', 'tag', 'car', 'shield', 'bed', 'heart', 'star',
  'ticket', 'map', 'user', 'check', 'sparkle', 'eye', 'gift'];

/* 四块各自是一个菜单项，不再共用一层页签 ——
   业务后面要按菜单分权限，谁能看会员档案、谁能改等级门槛，得拆得开。 */
export function MemberListPage() {
  const { arg, setArg } = usePage('/uom', 'member');
  if (arg) return <MemberDetailPage phone={arg} onBack={() => setArg(null)} />;
  return <MemberList onOpen={p => setArg(p)} />;
}
export function MemberLevelPage() { return <LevelCfg />; }
export function MemberBenefitPage() { return <BenefitCfg />; }
export function MemberMapPage() { return <LevelBenefitMap />; }
export default MemberListPage;

/* ---------- 会员管理 ---------- */
function MemberList({ onOpen }) {
  const toast = useToast();
  /* 从等级管理点「当前会员」过来时，地址上带着 ?level=ML3，进来就筛好 */
  const [lv, setLv] = useState(() => {
    const m = /[?&]level=([^&]+)/.exec(location.hash || '');
    return m ? decodeURIComponent(m[1]) : '';
  });
  const [sort, setSort] = useState('year');
  const [fv, setFv] = useState({});
  const [fpOpen, setFpOpen] = useState(false);
  const { d, loading, reload } = useData(
    () => get(`/api/uom/members?sort=${sort}`), [sort], { list: [], stat: {} });
  const all = d.list || [], stat = d.stat || {};
  const uniq = f => [...new Set(all.map(f).filter(Boolean))];

  const recalc = async () => {
    const r = await post('/api/uom/members/recalc', { operator: '运营管理员' });
    toast(`已重算 ${r.n} 位会员的等级`); reload();
  };

  /* 筛选条件独立成一块，和列表分开 —— 和订单、内容管理同一套 FiltPanel。
     等级不放进来：它是列表上方的页签，放两处等于同一个条件给两个入口。 */
  const FIELDS = [
    { k: 'q', t: '手机号 / 昵称 / 会员号', ph: '支持模糊匹配' },
    { k: 'lv', t: '会员等级', type: 'sel', opts: (stat.by_level || []).map(b => b.name) },
    { k: 'ben', t: '在享权益', type: 'sel', opts: [...new Set(all.flatMap(g => g.benefits || []))] },
    { k: 'src', t: '注册来源', type: 'sel', opts: uniq(g => g.source) },
    { k: 'city', t: '出发城市', type: 'sel', opts: uniq(g => g.from_city) },
    { k: 'reg', t: '注册时间', type: 'dr' },
    { k: 'login', t: '最近登录', type: 'dr' },
    { k: 'year', t: '年度消费（元）', type: 'nr' },
    { k: 'total', t: '累计消费（元）', type: 'nr' },
    { k: 'ord', t: '订单数（单）', type: 'nr' },
    { k: 'paid', t: '仅看成交会员', type: 'ck' },
    { k: 'silent', t: '仅看沉默会员（注册满 30 天未成交）', type: 'ck' },
    { k: 'nolv', t: '仅看未定级', type: 'ck' },
  ];

  const list = useMemo(() => {
    const num = v => (v === '' || v == null ? null : Number(v));
    const inRange = (v, a, b) => (a == null || v >= a) && (b == null || v <= b);
    const inDate = (v, a, b) => {
      const d2 = String(v || '').slice(0, 10);
      if (!d2) return !a && !b;
      return (!a || d2 >= a) && (!b || d2 <= b);
    };
    const days = s => (Date.now() - new Date(String(s || '').replace(' ', 'T')).getTime()) / 864e5;
    return all.filter(g => {
      if (lv && !(g.level && g.level.id === lv)) return false;
      if (fv.lv && !(g.level && g.level.name === fv.lv)) return false;
      if (fv.ben && !(g.benefits || []).includes(fv.ben)) return false;
      if (fv.q && !`${g.phone}${g.nick || ''}${g.member_no || ''}`.toLowerCase().includes(fv.q.toLowerCase())) return false;
      if (fv.src && (g.source || '') !== fv.src) return false;
      if (fv.city && (g.from_city || '') !== fv.city) return false;
      if ((fv.reg_a || fv.reg_b) && !inDate(g.created_at, fv.reg_a, fv.reg_b)) return false;
      if ((fv.login_a || fv.login_b) && !inDate(g.last_login, fv.login_a, fv.login_b)) return false;
      if (!inRange(g.year_amount || 0, num(fv.year_a), num(fv.year_b))) return false;
      if (!inRange(g.total_amount || 0, num(fv.total_a), num(fv.total_b))) return false;
      if (!inRange(g.order_cnt || 0, num(fv.ord_a), num(fv.ord_b))) return false;
      if (fv.paid && !(g.order_cnt > 0)) return false;
      if (fv.silent && (g.order_cnt > 0 || days(g.created_at) < 30)) return false;
      if (fv.nolv && g.level) return false;
      return true;
    });
  }, [all, lv, fv]);

  const lvCount = id => all.filter(g => g.level && g.level.id === id).length;

  return (<div className="op">
    <section className="mod">
      <div className="mod-h"><h3>数据概览</h3><span className="en">Overview</span>
        <span className="mod-stat"><i>口径与定级一致：只认未取消订单的实收金额，散客咨询不计入漏斗</i></span></div>
      <div className="mod-b"><MemberOverview onPickLevel={id => {
        setLv(id); setFv(o => ({ ...o }));
        document.querySelector('.mb-rows')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }} /></div>
    </section>

    <section className="mod">
      <div className="mod-h"><h3>筛选条件</h3><span className="en">Filter</span>
        <span className="mod-stat"><i>命中：<b>{list.length} 位</b></i></span></div>
      <div className="mod-b">
        <FiltPanel fields={FIELDS} val={fv} onChange={setFv} open={fpOpen} setOpen={setFpOpen} />
      </div>
    </section>

    <section className="mod">
      <div className="mod-h"><h3>会员列表</h3><span className="en">Members</span>
        <div className="mod-stat">
          <i>本页：<b>{list.length} 位</b></i>
          <i>年度消费：<b>{money0(list.reduce((s, g) => s + (g.year_amount || 0), 0))}</b></i>
          <i>成交会员：<b className="g">{list.filter(g => g.order_cnt > 0).length}</b></i>
        </div>
      </div>
      <div className="op-tabs">
        <a className={lv === '' ? 'on' : ''} onClick={() => setLv('')}>全部<b>{all.length}</b></a>
        {(stat.by_level || []).map(b => (
          <a key={b.id} className={lv === b.id ? 'on' : ''} onClick={() => setLv(b.id)}>
            {b.name}<b>{lvCount(b.id)}</b></a>))}
      </div>
      <div className="op-tool">
        <button className="tb" onClick={recalc}>重算等级</button>
        <button className="tb" onClick={reload}>刷新列表</button>
        <span className="cnt">等级按本年度订单实收金额自动判定</span>
        <select className="srt" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="year">按年度消费金额（由高到低）</option>
          <option value="total">按累计消费金额（由高到低）</option>
          <option value="new">按注册时间（由近到远）</option>
        </select>
      </div>

      <div className="mb-rows">
        {loading ? <div className="op-empty">载入中…</div>
          : !list.length ? <div className="op-empty">没有符合条件的会员</div>
          : list.map(g => {
            const c = (g.level && g.level.color) || '#8a7c6a';
            return (
              <div className="r" key={g.phone} onClick={() => onOpen(g.phone)} style={{ '--c': c }}>
                <span className="av"><Icon n="user" s={17} c={c} /></span>
                <div className="who">
                  <b>{g.nick || '旅行者'}</b>
                  <i className="mono">{g.phone}</i>
                </div>
                <div className="lv">
                  {g.level
                    ? <span className="tag" style={{ background: c + '14', color: c }}>{g.level.name}</span>
                    : <span className="mu">未定级</span>}
                  <i className="mono">{g.member_no}</i>
                </div>
                <div className="num"><b>{money0(g.year_amount)}</b><i>年度消费</i></div>
                <div className="num"><b className="mu">{money0(g.total_amount)}</b><i>累计消费</i></div>
                <div className="num"><b>{g.order_cnt}</b><i>订单</i></div>
                <div className="meta">
                  <i>注册 {String(g.created_at || '').slice(0, 10) || '—'}</i>
                  <i>来源 {g.source || '小程序'}</i>
                </div>
                <span className="go">查看档案 ›</span>
              </div>
            );
          })}
      </div>
      <div className="op-ft">共 {list.length} 位 · 点任意一行进入会员档案，可看基础信息、等级权益、历史订单、咨询单与常用旅客</div>
    </section>
  </div>);
}

/* 等级结构饼图：人数占比看形状、消费贡献看图例，点任意一档直接筛出这批人。
   原来是四条横向条，纵向占掉大半栏，右边的趋势图被挤得只剩一条窄缝。 */
function LevelPie({ rows, onPick }) {
  const [hov, setHov] = useState(-1);
  const ls = (rows || []).filter(x => x.n > 0);
  const total = ls.reduce((n, x) => n + x.n, 0);
  if (!total) return <div className="none">还没有会员落到任何等级</div>;
  const R = 54, r = 35, CX = 64, CY = 64;
  let acc = -Math.PI / 2;
  const arcs = ls.map(x => {
    const ang = (x.n / total) * Math.PI * 2;
    const a0 = acc, a1 = acc + ang - (ls.length > 1 ? .012 : 0); acc += ang;
    const pt = (rad, ra) => [CX + Math.cos(rad) * ra, CY + Math.sin(rad) * ra];
    const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R);
    const [x2, y2] = pt(a1, r), [x3, y3] = pt(a0, r);
    const big = (a1 - a0) > Math.PI ? 1 : 0;
    return { ...x, d: `M${x0} ${y0}A${R} ${R} 0 ${big} 1 ${x1} ${y1}L${x2} ${y2}A${r} ${r} 0 ${big} 0 ${x3} ${y3}Z` };
  });
  const cur = hov >= 0 ? arcs[hov] : null;
  return (<div className="mbs-pie">
    <svg viewBox="0 0 128 128">
      {arcs.map((a, i) => (
        <path key={a.id} d={a.d} fill={a.color || '#8a7c6a'}
          opacity={hov < 0 || hov === i ? 1 : .32}
          onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(-1)}
          onClick={() => onPick && onPick(a.id)} />))}
      <text x="64" y="61" className="pv">{cur ? cur.n : total}</text>
      <text x="64" y="76" className="pl">{cur ? cur.name : '会员总数'}</text>
    </svg>
    <div className="lg">
      {arcs.map((a, i) => (
        <div key={a.id} className={'it' + (hov === i ? ' on' : '')}
          onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(-1)}
          onClick={() => onPick && onPick(a.id)}>
          <i style={{ background: a.color || '#8a7c6a' }} />
          <span className="t">{a.name}</span>
          <b>{a.n} 人</b>
          <s>占 {a.nPct}% · 贡献 {money0(a.amount)}（{a.aPct}%）· 人均 {money0(a.avg)}</s>
        </div>))}
      <div className="ft">点任意一档筛出这批会员</div>
    </div>
  </div>);
}

/* 会员经营分析：生命周期漏斗 + 等级结构贡献 + 近 6 月趋势。
   原来这里只有四个孤立数字（总数/成交/消费额/占比），看不出人卡在哪一步，
   运营没法据此决定该去捞谁。三栏骨架与内容管理页的「数据概览」保持一致。 */
function MemberOverview({ onPickLevel }) {
  const { d } = useData(() => get('/api/uom/member-stats'), [], null);
  if (!d) return <div className="op-empty">载入中…</div>;
  const { funnel = [], byLevel = [], trend = [], kpi = {} } = d;
  const K = [
    { lb: '会员总数', vl: kpi.total, sv: `近 30 天新增 ${kpi.new30}`, c: '#2c6e75' },
    { lb: '成交会员', vl: kpi.paying, sv: `注册→成交 ${kpi.cvr}%`, c: '#3a7d5d' },
    { lb: '年度消费总额', vl: money0(kpi.year_amount), sv: `成交会员人均 ${money0(kpi.arpu)}`, c: '#a8781f' },
    { lb: '复购率', vl: kpi.repeat_rate + '%', sv: '成交会员中 2 单及以上', c: '#7a6cc4' },
    { lb: '沉默会员', vl: kpi.silent, sv: '注册满 30 天仍未成交', c: '#b06a4f' },
    { lb: '会员咨询单', vl: kpi.consult_cnt, sv: '由会员提交的定制咨询', c: '#3663a6' },
  ];
  const mx = Math.max(1, ...trend.map(t => Math.max(t.reg, t.deal)));

  return (<div className="mbs">
    <div className="mbs-k">{K.map(k => (
      <div className="it" key={k.lb} style={{ '--c': k.c }}>
        <i className="lb">{k.lb}</i><b className="vl">{k.vl}</b><s className="sv">{k.sv}</s>
      </div>))}
    </div>

    <div className="mbs-row">
      <div className="mbs-fn">
        <div className="hd">会员生命周期漏斗</div>
        {funnel.map((f, i) => (
          <div className="st" key={f.k}>
            {/* 条宽按「占注册总量」收窄，五层叠起来就是漏斗形 */}
            <div className="bar" style={{ width: Math.max(18, f.rate) + '%', '--i': i }}>
              <span className="t">{f.t}</span><b>{f.n}</b>
            </div>
            <div className="rt">
              <b>{f.rate}%</b>
              <i>{i === 0 ? f.tip : `较上一步 ${f.step}%${f.lost ? ` · 流失 ${f.lost} 人` : ''}`}</i>
            </div>
          </div>))}
      </div>

      <div className="mbs-lv">
        <div className="hd">等级结构</div>
        <LevelPie rows={byLevel} onPick={onPickLevel} />
      </div>

      <div className="mbs-tr">
        <div className="hd">近 6 个月新增与成交</div>
        <div className="ch">
          {trend.map(t => (
            <div className="col" key={t.m}>
              <div className="bs">
                <span className="a" style={{ height: Math.round(t.reg / mx * 100) + '%' }}
                  title={`新增会员 ${t.reg}`}><em>{t.reg || ''}</em></span>
                <span className="b" style={{ height: Math.round(t.deal / mx * 100) + '%' }}
                  title={`成交会员 ${t.deal}`}><em>{t.deal || ''}</em></span>
              </div>
              <i>{t.label}</i>
            </div>))}
        </div>
        <div className="lg"><span className="a" />新增会员<span className="b" />成交会员</div>
      </div>
    </div>

  </div>);
}

/* 会员档案：结构对齐产品详情页 —— 顶部概要 + 左侧章节导航 + 右侧分节正文。
   第一节把「会员信息 + 等级 + 权益」并在一起：这三样描述的是同一件事（这个人现在是什么身份、
   能享什么），分成三块反而要来回翻。 */
const SRC_CN = { wechat: '微信小程序', mini: '小程序', csp: '门店 / 渠道', uom: '后台录入', h5: 'H5' };
/* 权益说明改富文本后存的是 HTML，档案与卡片里只要纯文字 */
const stripTag = v => String(v || '').replace(/<[^>]+>/g, '').trim();

function MemberDetailPage({ phone, onBack }) {
  const toast = useToast();
  const { d, reload } = useData(() => get('/api/uom/members/' + phone), [phone]);
  /* 锚点跟随滚动高亮：滚动容器是后台正文区 .adm-body，不是 window（同产品详情页） */
  if (!d) return <div className="op-empty">正在打开会员档案…</div>;
  const lvColor = (d.level && d.level.color) || '#8a7c6a';
  const lvName = (d.level && d.level.name) || '未定级';
  const orders = d.orders || [], consults = d.consults || [];
  const travelers = d.travelers || [], bens = d.benefits || [], logs = d.logs || [];
  const paid = orders.reduce((s, o) => s + (o.paid || 0), 0);
  const pct = d.next
    ? Math.min(100, Math.round(((d.year_amount || 0) / Math.max(1, d.next.min_amount)) * 100)) : 100;
  const kv = (k, v) => (<div className="od-kv" key={k}><i>{k}</i>
    <b>{v === 0 || v ? v : <span className="od-na">—</span>}</b></div>);
  const recalc = async () => {
    await post('/api/uom/members/recalc', { operator: '运营管理员' });
    toast('已按当前门槛重算该会员等级'); reload();
  };

  return (<div className="od">
    <div className="od-hd">
      <button className="back" onClick={onBack}><Icon n="back" s={14} />返回会员列表</button>
      <h2>会员档案</h2><span className="sub mono">会员号 {d.member_no}</span>
      <span style={{ marginLeft: 'auto' }}><button className="tb" onClick={recalc}>重算等级</button></span>
    </div>

    <div className="od-top">
      <div className="od-top-h">
        <div className="mb-face" style={{ '--c': lvColor }}><Icon n="user" s={26} c={lvColor} /></div>
        <div>
          <div className="od-no"><span className="ic"><Icon n="user" s={14} /></span>
            会员号：<b className="mono">{d.member_no}</b>
            <span className="tag" style={{ background: lvColor + '16', color: lvColor }}>{lvName}</span>
            {!d.order_cnt && <span className="tag plain">尚未成交</span>}
          </div>
          <div className="od-pn">{d.nick || '旅行者'}</div>
          <div className="od-ptags">
            <em className="mono">{phone}</em>
            <em>{SRC_CN[d.source] || d.source || '小程序'}</em>
            {d.from_city && <em>常从 {d.from_city} 出发</em>}
            {(d.prefs || []).slice(0, 3).map(x => <em key={x}>{x}</em>)}
          </div>
          <div className="od-pm">
            <span>注册时间<b>{String(d.created_at || '—').slice(0, 16)}</b></span>
            <span>最近登录<b>{String(d.last_login || '—').slice(0, 16)}</b></span>
            <span>定级时间<b>{String(d.level_at || '—').slice(0, 16)}</b></span>
          </div>
        </div>
        <div className="od-topr">
          <div><i>本年度消费</i><b style={{ fontSize: 15 }}>{money0(d.year_amount)}</b></div>
          <div><i>累计消费</i><b>{money0(d.total_amount)}</b></div>
          <div><i>历史订单</i><b>{orders.length} 单</b></div>
          <div><i>在享权益</i><b>{bens.length} 项</b></div>
        </div>
      </div>
    </div>

    {/* 结构对齐订单详情页：一串顺排的 od-sec，不用左侧锚点导航 —— 会员档案的信息量
        比产品详情小得多，多一层导航反而要来回跳。 */}
    <div className="od-sec"><div className="hd"><h3>会员信息</h3><span className="en">Profile</span>
      <span className="mod-stat"><i>等级按本年度订单实收金额自动判定</i></span></div>
      <div className="od-grid bd">
        {kv('会员号', <span className="mono">{d.member_no}</span>)}
        {kv('昵称', d.nick)}
        {kv('性别', d.gender)}
        {kv('生日', d.birth)}
        {kv('英文 / 拼音名', d.en_name ? <span className="mono">{d.en_name}</span> : null)}
        {kv('手机号', <span className="mono">{phone}</span>)}
        {kv('邮箱', d.email)}
        {kv('注册来源', SRC_CN[d.source] || d.source)}
        {kv('注册时间', String(d.created_at || '').slice(0, 16))}
        {kv('最近登录', String(d.last_login || '').slice(0, 16))}
        {kv('常用出发城市', d.from_city)}
        {kv('旅行偏好', (d.prefs || []).join('、'))}
      </div>
    </div>

    <div className="od-sec"><div className="hd"><h3>等级与权益</h3><span className="en">Level</span>
      <span className="mod-stat"><i>当前：<b>{lvName}</b></i><i>在享：<b>{bens.length} 项</b></i></span></div>
      <div className="bd">
        <div className="mb-lvbox" style={{ '--c': lvColor }}>
          <div className="l">
            <div className="nm"><i className="dot" /><b>{lvName}</b>
              {d.level && <em className="mono">{d.level.code}</em>}</div>
            <div className="am">{money0(d.year_amount)}<s>本年度实收，定级依据</s></div>
            <div className="bar"><i style={{ width: pct + '%' }} /></div>
            <div className="gp">{d.next
              ? <>距 <b>{d.next.name}</b> 还差 {money0(d.gap)}（门槛 {money0(d.next.min_amount)}）</>
              : '已是最高等级'}</div>
          </div>
          <div className="r">
            {(d.all_levels || []).map(l => {
              const on = d.level && l.id === d.level.id;
              const got = (d.year_amount || 0) >= (l.min_amount || 0);
              return (
                <div className={'s' + (on ? ' on' : '') + (got ? ' got' : '')} key={l.id}
                  style={{ '--c': l.color || '#8a7c6a' }}>
                  <i />
                  <b>{l.name}</b>
                  <u>{l.min_amount ? money0(l.min_amount) : '注册即享'}</u>
                </div>);
            })}
          </div>
        </div>
        {!bens.length ? <div className="op-empty" style={{ padding: '24px 0' }}>该等级暂未配置权益</div> : (
          <div className="mb-bens" style={{ marginTop: 16 }}>
            {bens.map(b2 => (
              <div className="b" key={b2.id}><b>{b2.name}</b><i>{b2.val || stripTag(b2.descr)}</i>
                <span className="k">{KIND_CN[b2.kind] || b2.kind}</span></div>
            ))}
          </div>
        )}
      </div>
    </div>

    <div className="od-sec"><div className="hd"><h3>历史订单</h3><span className="en">Orders</span>
      <span className="mod-stat"><i>共：<b>{orders.length} 单</b></i><i>实收：<b>{money0(paid)}</b></i></span></div>
      {!orders.length ? <div className="op-empty" style={{ padding: '26px 0' }}>暂无订单</div> : (
        <div className="bd">
          <table className="tbl"><thead><tr><th>订单号</th><th>目的地</th><th>金额</th><th>已收</th><th>状态</th><th>下单</th></tr></thead>
            <tbody>{orders.map(o => (<tr key={o.no}>
              <td className="mono">{o.no}</td><td>{o.dest} · {o.days} 天</td>
              <td>{money0(o.amount)}</td><td>{money0(o.paid)}</td><td>{o.status}</td>
              <td className="mu">{String(o.created_at || '').slice(0, 10)}</td></tr>))}</tbody></table>
        </div>
      )}
    </div>

    <div className="od-sec"><div className="hd"><h3>定制咨询</h3><span className="en">Consults</span>
      <span className="mod-stat"><i>共：<b>{consults.length} 单</b></i></span></div>
      {!consults.length ? <div className="op-empty" style={{ padding: '26px 0' }}>暂无咨询单</div> : (
        <div className="bd">
          <table className="tbl"><thead><tr><th>咨询单号</th><th>目的地</th><th>人数</th><th>预算</th><th>状态</th><th>提交</th></tr></thead>
            <tbody>{consults.map(c2 => (<tr key={c2.no}>
              <td className="mono">{c2.no}</td><td>{c2.dest} · {c2.days} 天</td>
              <td>{c2.pax || '—'}</td><td>{c2.budget ? money0(c2.budget) : '—'}</td><td>{c2.st_cn || c2.status}</td>
              <td className="mu">{String(c2.created_at || '').slice(0, 10)}</td></tr>))}</tbody></table>
        </div>
      )}
    </div>

    <div className="od-sec"><div className="hd"><h3>常用旅客</h3><span className="en">Travelers</span>
      <span className="mod-stat"><i>共：<b>{travelers.length} 位</b></i></span></div>
      {!travelers.length ? <div className="op-empty" style={{ padding: '26px 0' }}>暂无常用旅客</div> : (
        <div className="bd">
          <table className="tbl"><thead><tr><th>姓名</th><th>证件</th><th>证件号</th><th>手机号</th><th>有效期</th></tr></thead>
            <tbody>{travelers.map(t => (<tr key={t.id}>
              <td>{t.name}{t.en_name ? ' / ' + t.en_name : ''}</td>
              <td>{t.id_type || '身份证'}</td><td className="mono">{t.id_no || '—'}</td>
              <td className="mono">{t.phone || '—'}</td>
              <td className="mu">{t.id_expire || t.id_exp || '—'}</td></tr>))}</tbody></table>
        </div>
      )}
    </div>

    <div className="od-sec"><div className="hd"><h3>定级记录</h3><span className="en">Level Log</span>
      <span className="mod-stat"><i>共：<b>{logs.length} 条</b></i></span></div>
      {!logs.length ? <div className="op-empty" style={{ padding: '26px 0' }}>暂无定级记录</div> : (
        <div className="bd">
          <div className="mb-logs">{logs.map(l => (
            <div key={l.id}><span className="mu">{String(l.created_at || '').slice(0, 16)}</span>
              {l.reason}<em>{l.operator}</em></div>))}</div>
        </div>
      )}
    </div>
  </div>);
}

/* ---------- 等级管理 ---------- */
const EMPTY_LV = { name: '', code: '', min_amount: 0, keep_amount: 0, sort: 0, color: '#8a7c6a', memo: '', status: 1 };

function LevelCfg() {
  const { arg, setArg } = usePage('/uom', 'mlevel');
  if (arg) return <LevelEditor id={arg === 'new' ? null : arg} onBack={() => setArg(null)} />;
  /* 点某一档的会员数：跳到会员管理并把等级筛选带过去 */
  return <LevelList onEdit={id => setArg(id || 'new')}
    onOpenMembers={lvId => { location.hash = '#/uom/member?level=' + encodeURIComponent(lvId); }} />;
}

function LevelList({ onEdit, onOpenMembers }) {
  const toast = useToast();
  const { d: rows, reload } = useData(() => get('/api/uom/member/levels'), [], []);
  const remove = async l => {
    if (!confirm(`确认删除「${l.name}」？`)) return;
    try { await del('/api/uom/member/levels/' + l.id); toast('已删除'); reload(); }
    catch (e) { toast(e.message); }
  };
  const max = Math.max(1, ...rows.map(r => r.min_amount || 0));
  return (<div className="op">
    <section className="mod">
      <div className="mod-h"><h3>等级管理</h3><span className="en">Levels</span>
        <div className="mod-stat">
          <i>等级：<b>{rows.length} 档</b></i>
          <i>覆盖会员：<b>{rows.reduce((s, r) => s + (r.members || 0), 0)} 位</b></i>
          <i>已配权益：<b>{rows.reduce((s, r) => s + (r.benefits || []).length, 0)} 项次</b></i>
        </div>
      </div>
      <div className="op-tool">
        <button className="tb" onClick={() => onEdit(null)}>+ 新建等级</button>
        <button className="tb" onClick={reload}>刷新</button>
        <span className="cnt">判定规则：本年度订单实收金额；改动门槛保存后会立即重算全部会员等级</span>
      </div>
      <div className="mod-b">
        {!rows.length ? <div className="op-empty">尚未配置等级</div> : (
          <div className="mb-cards">
            {rows.map(l => (
              <div className="mb-lc" key={l.id} style={{ '--c': l.color || '#8a7c6a' }}>
                {/* 卡面预览：等级这一块客人是「拿到一张卡」，后台列表也照着卡面画，
                    运营改了主色能直接看出来长什么样 */}
                <div className="face">
                  <span className="wm">{l.code}</span>
                  <span className="seal">{(l.name || '优')[0]}</span>
                  <b>{l.name}</b>
                  <i>{l.min_amount ? money0(l.min_amount) + ' 起' : '注册即享'}</i>
                  {l.status ? null : <span className="off">停用</span>}
                </div>
                <div className="amt">{money0(l.min_amount)}<i>年度消费达标</i></div>
                <div className="bar"><span style={{ width: Math.max(4, Math.round((l.min_amount || 0) / max * 100)) + '%' }} /></div>
                <div className="kv">
                  <div><b>{l.keep_amount ? money0(l.keep_amount) : '不降级'}</b><i>保级门槛</i></div>
                  <div><b>{(l.benefits || []).length}</b><i>权益项</i></div>
                  {/* 会员数可点：直接跳到会员列表并筛出这一档的人 */}
                  <div className="lk" onClick={e => { e.stopPropagation(); onOpenMembers(l.id); }}
                    title="查看这一档的会员"><b>{l.members}</b><i>当前会员 ›</i></div>
                </div>
                {!!(l.benefits || []).length && (
                  <div className="bs">
                    {l.benefits.slice(0, 4).map(b => <span key={b.id}>{b.name}</span>)}
                    {l.benefits.length > 4 && <span className="more">+{l.benefits.length - 4}</span>}
                  </div>
                )}
                {l.memo && <p className="mm">{String(l.memo).replace(/<[^>]+>/g, '').trim().slice(0, 60)}</p>}
                <div className="ops">
                  <button onClick={() => onEdit(l.id)}>编辑</button>
                  <button className="d" onClick={() => remove(l)}>删除</button>
                </div>
              </div>
            ))}
            <div className="mb-lc add" onClick={() => onEdit(null)}>
              <span>+</span><b>新建等级</b>
            </div>
          </div>
        )}
      </div>
      <div className="op-ft">共 {rows.length} 档 · 排序值越小等级越低，会员中心按此顺序展示等级阶梯</div>
    </section>
  </div>);
}

function LevelEditor({ id, onBack }) {
  const toast = useToast();
  const { d: rows } = useData(() => get('/api/uom/member/levels'), [], []);
  const [f, setF] = useState(null);
  useEffect(() => {
    if (!rows.length && id) return;
    if (f) return;
    setF(id ? { ...(rows.find(r => r.id === id) || EMPTY_LV) } : { ...EMPTY_LV, sort: rows.length + 1 });
  }, [rows, id]);
  if (!f) return <div className="op-empty">载入中…</div>;
  const set = (k, v) => setF({ ...f, [k]: v });
  const save = async () => {
    if (!f.name) return toast('请填写等级名称');
    if (!f.code) return toast('请填写等级编码');
    if (id) await put('/api/uom/member/levels/' + id, f);
    else await post('/api/uom/member/levels', f);
    toast('已保存，并按新门槛重算了全部会员等级');
    onBack();
  };
  const c = f.color || '#8a7c6a';
  return (<>
    <div className="pe-top">
      <button className="btn btn-o btn-s" onClick={onBack}><Icon n="back" s={14} />返回等级列表</button>
      <h3>{id ? '编辑等级' : '新建等级'}</h3>
      {id && <span className="tag">{id}</span>}
      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
        保存后立即按新门槛重算全部会员等级</span>
    </div>

    <div className="mb-edit">
      <section className="mod">
        <div className="mod-h"><h3>基础信息</h3><span className="en">Basic</span></div>
        <div className="mod-b">
          <div className="fm">
            <div className="r"><label>等级名称<em>*</em></label>
              <div className="in"><input className="inp" value={f.name} placeholder="如 金卡会员"
                onChange={e => set('name', e.target.value)} />
                <s>客人在会员中心看到的等级名</s></div></div>
            <div className="r"><label>等级编码<em>*</em></label>
              <div className="in"><input className="inp mono" value={f.code} placeholder="gold"
                onChange={e => set('code', e.target.value)} />
                <s>英文小写，客人端卡面的水印文字取它</s></div></div>
            <div className="r"><label>排序</label>
              <div className="in"><input className="inp" type="number" style={{ width: 120 }} value={f.sort}
                onChange={e => set('sort', e.target.value)} />
                <s>数值越小等级越低，会员中心按这个顺序排等级阶梯</s></div></div>
            <div className="r"><label>状态</label>
              <div className="in"><div className="segs">
                <span className={f.status ? 'on' : ''} onClick={() => set('status', 1)}>启用</span>
                <span className={f.status ? '' : 'on'} onClick={() => set('status', 0)}>停用</span>
              </div><s>停用后不参与定级，已有会员保持原等级</s></div></div>
          </div>
        </div>
      </section>

      <section className="mod">
        <div className="mod-h"><h3>判定规则</h3><span className="en">Rule</span>
          <span className="mod-stat"><i>本期唯一规则：本年度订单实收金额</i></span></div>
        <div className="mod-b">
          <div className="fm">
            <div className="r"><label>达标门槛<em>*</em></label>
              <div className="in"><div className="money">
                <input className="inp" type="number" value={f.min_amount}
                  onChange={e => set('min_amount', e.target.value)} /><b>元</b></div>
                <s>本年度订单实收金额达到该值即进入本等级；最低一档填 0</s></div></div>
            <div className="r"><label>保级门槛</label>
              <div className="in"><div className="money">
                <input className="inp" type="number" value={f.keep_amount}
                  onChange={e => set('keep_amount', e.target.value)} /><b>元</b></div>
                <s>次年消费不足该值则降级；填 0 表示不降级</s></div></div>
          </div>
          <div className="mb-tip" style={{ marginTop: 14 }}>
            保存后系统会立即用新门槛重算全部会员的等级，并在每位会员的定级记录里留痕。</div>
        </div>
      </section>

      <section className="mod">
        <div className="mod-h"><h3>卡面配置</h3><span className="en">Card</span>
          <span className="mod-stat"><i>右侧是客人在会员中心看到的卡面效果</i></span></div>
        <div className="mod-b">
          <div className="lv-card-cfg">
            <div className="fm">
              <div className="r"><label>卡面主色</label>
                <div className="in"><div className="mb-color">
                  <input type="color" value={c} onChange={e => set('color', e.target.value)} />
                  <input className="inp mono" value={f.color || ''} placeholder="#b08d4f"
                    onChange={e => set('color', e.target.value)} />
                </div><s>卡面渐变、等级标签、进度条都取这个颜色</s></div></div>
            </div>
            {/* 卡面预览：和客人端会员卡同一套画法，改颜色即时能看到效果 */}
            <div className="lv-preview" style={{ '--mc': c }}>
              <span className="wm">{f.code || 'MEMBER'}</span>
              <span className="seal">{(f.name || '优')[0]}</span>
              <div className="st">当前等级</div>
              <div className="nm">{f.name || '等级名称'}</div>
              <div className="no">NO. M00000000</div>
              <div className="amt">{money0(f.min_amount || 0)}<em>年度消费达标</em></div>
              <div className="bar"><i /></div>
            </div>
          </div>
        </div>
      </section>

      <section className="mod">
        <div className="mod-h"><h3>等级说明</h3><span className="en">Description</span>
          <span className="mod-stat"><i>展示在后台等级卡与客人端会员中心</i></span></div>
        <div className="mod-b">
          <Rich value={f.memo || ''} onChange={v => set('memo', v)} minH={170}
            placeholder="说清楚这一档的定位、能享什么、怎么升上来" />
        </div>
      </section>
    </div>

    <div className="pe-bar">
      <button className="tb" onClick={onBack}>取消</button>
      <button className="tb pri" onClick={save}>保存</button>
    </div>
  </>);
}

/* ---------- 权益管理 ---------- */
const EMPTY_B = { name: '', code: '', kind: 'service', descr: '', sort: 0, status: 1 };

function BenefitCfg() {
  const { arg, setArg } = usePage('/uom', 'mbenefit');
  if (arg) return <BenefitEditor id={arg === 'new' ? null : arg} onBack={() => setArg(null)} />;
  return <BenefitList onEdit={id => setArg(id || 'new')} />;
}

const KIND_IC = { service: 'chat', discount: 'tag', gift: 'heart', privilege: 'star' };

function BenefitList({ onEdit }) {
  const toast = useToast();
  const { d: rows, reload } = useData(() => get('/api/uom/member/benefits'), [], []);
  const remove = async b => {
    if (!confirm(`确认删除「${b.name}」？各等级上的配置会一并清除`)) return;
    await del('/api/uom/member/benefits/' + b.id); toast('已删除'); reload();
  };
  const used = rows.filter(b => (b.levels || []).length).length;
  return (<div className="op">
    <section className="mod">
      <div className="mod-h"><h3>权益管理</h3><span className="en">Benefits</span>
        <div className="mod-stat">
          <i>权益：<b>{rows.length} 项</b></i>
          <i>已挂等级：<b className="g">{used}</b></i>
          <i>未挂等级：<b className={rows.length - used ? 'r' : ''}>{rows.length - used}</b></i>
        </div>
      </div>
      <div className="op-tool">
        <button className="tb" onClick={() => onEdit(null)}>+ 新建权益</button>
        <button className="tb" onClick={reload}>刷新</button>
        <span className="cnt">权益要在「等级权益配置」里挂到等级上，才会对会员可见</span>
      </div>
      <div className="mod-b">
        {!rows.length ? <div className="op-empty">尚未配置权益</div> : (
          /* 权益字段多、说明长，卡片装不下也容易被截断，用表格逐列摊开 */
          <table className="tbl mb-btbl">
            <thead><tr>
              <th style={{ width: 150 }}>权益名称</th>
              <th style={{ width: 92 }}>编码</th>
              <th style={{ width: 66 }}>类型</th>
              <th style={{ width: 260 }}>权益说明</th>
              <th>适用等级</th>
              <th style={{ width: 62 }}>状态</th>
              <th style={{ width: 96 }}>操作</th>
            </tr></thead>
            <tbody>
              {rows.map(b => (
                <tr key={b.id} className={b.status ? '' : 'off'}>
                  <td><div className="nm">
                    <span className={'ic k-' + b.kind}><Icon n={b.icon || KIND_IC[b.kind] || 'star'} s={14} /></span>
                    <b>{b.name}</b></div></td>
                  <td className="mono">{b.code}</td>
                  <td>{KIND_CN[b.kind] || b.kind}</td>
                  {/* 说明改富文本后存的是 HTML，列表里只要纯文字 */}
                  <td className="ds">{b.descr
                    ? String(b.descr).replace(/<[^>]+>/g, '').trim().slice(0, 60) || <span className="mu">未填写</span>
                    : <span className="mu">未填写</span>}</td>
                  <td>
                    {(b.levels || []).length
                      ? <div className="lvs">{b.levels.map(l => (
                          <span key={l.id}>{l.name}{l.val ? <em>{l.val}</em> : null}</span>))}</div>
                      : <span className="mu">未配置到任何等级</span>}
                  </td>
                  <td><span className={'tag ' + (b.status ? 'ok' : 'plain')}>{b.status ? '启用' : '停用'}</span></td>
                  <td className="ops">
                    <a onClick={() => onEdit(b.id)}>编辑</a>
                    <a className="d" onClick={() => remove(b)}>删除</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="op-ft">共 {rows.length} 项 · 停用的权益保留配置但不对会员展示</div>
    </section>
  </div>);
}

function BenefitEditor({ id, onBack }) {
  const toast = useToast();
  const { d: rows } = useData(() => get('/api/uom/member/benefits'), [], []);
  const [f, setF] = useState(null);
  useEffect(() => {
    if (!rows.length && id) return;
    if (f) return;
    setF(id ? { ...(rows.find(r => r.id === id) || EMPTY_B) } : { ...EMPTY_B, sort: rows.length + 1 });
  }, [rows, id]);
  if (!f) return <div className="op-empty">载入中…</div>;
  const set = (k, v) => setF({ ...f, [k]: v });
  const save = async () => {
    if (!f.name) return toast('请填写权益名称');
    if (!f.code) return toast('请填写权益编码');
    if (id) await put('/api/uom/member/benefits/' + id, f);
    else await post('/api/uom/member/benefits', f);
    toast('已保存'); onBack();
  };
  return (<>
    <div className="pe-top">
      <button className="btn btn-o btn-s" onClick={onBack}><Icon n="back" s={14} />返回权益列表</button>
      <h3>{id ? '编辑权益' : '新建权益'}</h3>
      {id && <span className="tag">{id}</span>}
      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
        字段与客人端会员中心的权益卡一一对应</span>
    </div>

    <div className="mb-edit">
      <section className="mod">
        <div className="mod-h"><h3>基础信息</h3><span className="en">Basic</span></div>
        <div className="mod-b">
          <div className="fm">
            <div className="r"><label>权益名称<em>*</em></label>
              <div className="in"><input className="inp" value={f.name} placeholder="如 机场接送"
                onChange={e => set('name', e.target.value)} />
                <s>客人在会员中心看到的标题，控制在 8 个字以内最好看</s></div></div>
            <div className="r"><label>权益编码<em>*</em></label>
              <div className="in"><input className="inp mono" value={f.code} placeholder="pickup"
                onChange={e => set('code', e.target.value)} />
                <s>英文小写，落库后不建议再改</s></div></div>
            <div className="r"><label>权益类型</label>
              <div className="in"><div className="segs">
                {Object.entries(KIND_CN).map(([k, v]) => (
                  <span key={k} className={f.kind === k ? 'on' : ''} onClick={() => set('kind', k)}>{v}</span>))}
              </div><s>列表与卡片按类型配色</s></div></div>
            <div className="r"><label>展示图标</label>
              <div className="in">
                <div className="icons">
                  {BEN_ICONS.map(ic => (
                    <span key={ic} className={(f.icon || '') === ic ? 'on' : ''} onClick={() => set('icon', ic)}>
                      <Icon n={ic} s={17} /></span>))}
                  <span className={f.icon ? '' : 'on'} onClick={() => set('icon', '')}>
                    <i className="none">默认</i></span>
                </div>
                <s>客人在小程序会员中心那一格看到的就是这个图标</s></div></div>
            <div className="r"><label>排序</label>
              <div className="in"><input className="inp" type="number" style={{ width: 120 }} value={f.sort}
                onChange={e => set('sort', e.target.value)} />
                <s>数值越小越靠前</s></div></div>
            <div className="r"><label>状态</label>
              <div className="in"><div className="segs">
                <span className={f.status ? 'on' : ''} onClick={() => set('status', 1)}>启用</span>
                <span className={f.status ? '' : 'on'} onClick={() => set('status', 0)}>停用</span>
              </div><s>停用后保留已有配置，但不对会员展示</s></div></div>
          </div>
        </div>
      </section>

      <section className="mod">
        <div className="mod-h"><h3>权益说明</h3><span className="en">Description</span>
          <span className="mod-stat"><i>展示在客人端会员中心的权益卡里</i></span></div>
        <div className="mod-b">
          <Rich value={f.descr || ''} onChange={v => set('descr', v)} minH={180}
            placeholder="说清楚这项权益具体给什么、怎么用、有什么限制" />
        </div>
      </section>

      <div className="mb-tip">保存后，到「等级权益配置」里按等级勾选并填写各等级的额度，客人才看得到。</div>
    </div>

    <div className="pe-bar">
      <button className="tb" onClick={onBack}>取消</button>
      <button className="tb pri" onClick={save}>保存</button>
    </div>
  </>);
}

/* ---------- 等级 × 权益 关联 ---------- */
/* 等级权益配置：左边选等级（卡片），右边是权益卡片墙，勾上就亮起来并展开额度输入。
   原来是一长条带输入框的列表，太「表单」了。 */
function LevelBenefitMap() {
  const toast = useToast();
  const { d: levels, reload } = useData(() => get('/api/uom/member/levels'), [], []);
  const { d: bens } = useData(() => get('/api/uom/member/benefits'), [], []);
  const [cur, setCur] = useState(null);
  const lv = useMemo(() => levels.find(l => l.id === (cur || (levels[0] || {}).id)), [levels, cur]);
  const [draft, setDraft] = useState(null);
  const rows = draft || (lv ? (lv.benefits || []).map(b => ({ benefit_id: b.id, val: b.val || '' })) : []);

  const toggle = bid => {
    const base = draft || rows;
    setDraft(base.some(r => r.benefit_id === bid)
      ? base.filter(r => r.benefit_id !== bid)
      : [...base, { benefit_id: bid, val: '' }]);
  };
  const setVal = (bid, v) => setDraft((draft || rows).map(r => r.benefit_id === bid ? { ...r, val: v } : r));
  const save = async () => {
    await put(`/api/uom/member/levels/${lv.id}/benefits`, { benefits: draft || rows });
    toast(`「${lv.name}」权益配置已保存`); setDraft(null); reload();
  };

  if (!lv) return <div className="op-empty">请先在「等级管理」中创建等级</div>;
  return (<div className="op">
    <section className="mod">
      <div className="mod-h"><h3>等级权益配置</h3><span className="en">Level × Benefit</span>
        <div className="mod-stat">
          <i>等级：<b>{levels.length} 档</b></i>
          <i>可选权益：<b>{bens.length} 项</b></i>
          <i>当前等级已配：<b className="g">{rows.length}</b></i>
        </div>
      </div>
      <div className="mod-b">
        <div className="mb-map2">
    <aside>
      <div className="h">选择等级</div>
      {levels.map(l => (
        <div className={'lv' + (l.id === lv.id ? ' on' : '')} key={l.id}
          style={{ '--c': l.color || '#8a7c6a' }}
          onClick={() => { setCur(l.id); setDraft(null); }}>
          <span className="dot" />
          <div className="t"><b>{l.name}</b><i>{money0(l.min_amount)} 起</i></div>
          <em>{(l.benefits || []).length}</em>
        </div>
      ))}
      <div className="tip">切换等级会放弃未保存的修改</div>
    </aside>
    <section>
      <div className="hd">
        <div className="l"><b>{lv.name}</b><i>已配置 {rows.length} / {bens.length} 项权益</i></div>
        {draft && <button className="tb" onClick={() => setDraft(null)}>放弃修改</button>}
        <button className="tb pri" onClick={save}>保存配置</button>
      </div>
      <div className="grid">
        {bens.map(b => {
          const on = rows.some(r => r.benefit_id === b.id);
          const val = (rows.find(r => r.benefit_id === b.id) || {}).val || '';
          return (
            <div className={'c' + (on ? ' on' : '')} key={b.id}>
              <div className="top" onClick={() => toggle(b.id)}>
                <span className="ic"><Icon n={KIND_IC[b.kind] || 'star'} s={16} /></span>
                <div className="tx"><b>{b.name}</b><i>{b.descr}</i></div>
                <span className="ck" />
              </div>
              {on && (
                <input className="inp" value={val} placeholder="该等级的额度说明，如「减免 500 元」"
                  onChange={e => setVal(b.id, e.target.value)} />
              )}
            </div>
          );
        })}
          </div>
        </section>
        </div>
      </div>
      <div className="op-ft">勾选即挂到该等级，额度说明会原样展示在客人的会员中心；切换等级前记得保存</div>
    </section>
  </div>);
}

function Fld({ l, s, req, wide, children }) {
  return (<div className={'mb-f' + (wide ? ' wide' : '')}>
    <label>{l}{req && <em>*</em>}{s && <i>{s}</i>}</label>{children}</div>);
}
