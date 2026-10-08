import React, { useState, useEffect, useRef, useMemo } from 'react';
import { img as oimg } from '../../shared/img.js';
import { useNavigate, useLocation } from 'react-router-dom';
import { get, post, del as del2, money, money0, ST_CN } from '../../shared/api.js';
import { Icon, useToast, useData, Counter, Modal } from '../../shared/ui.jsx';
import { StoryList, StoryBook, StoryShare } from './Story.jsx';
import { ImgPick } from '../../shared/Upload.jsx';
import { ULogo, UMark, AiMark, AiBadge } from '../../shared/Logo.jsx';
import TripView from '../trip/TripView.jsx';
import { drawPoster } from '../../shared/poster.js';
import './mini.css';
import '../../shared/rich.css';

const clock = () => { const d = new Date(); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); };

function StatusBar({ dark }) {
  return (<div className={'mi-bar' + (dark ? ' dark' : '')}>
    <span>{clock()}</span>
    <span style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 11 }}>
      <svg width="15" height="10" viewBox="0 0 16 11" fill="currentColor"><rect x="0" y="7" width="2.6" height="4" rx=".6"/><rect x="4" y="5" width="2.6" height="6" rx=".6"/><rect x="8" y="2.6" width="2.6" height="8.4" rx=".6"/><rect x="12" y="0" width="2.6" height="11" rx=".6"/></svg>
      <svg width="14" height="11" viewBox="0 0 16 12" fill="currentColor"><path d="M8 10.5 1.2 4.2a9.6 9.6 0 0 1 13.6 0z" opacity=".95"/></svg>
      <svg width="22" height="11" viewBox="0 0 25 12" fill="none" stroke="currentColor"><rect x=".5" y=".5" width="20" height="11" rx="3"/><rect x="2" y="2" width="16" height="8" rx="1.6" fill="currentColor" stroke="none"/><path d="M22.5 4v4" strokeWidth="2.4" strokeLinecap="round"/></svg>
    </span>
  </div>);
}

/* ============ 首页 v7 ============
   金刚位上移到 banner 之上，顶部整块带氛围底色（当前轮播图的高斯模糊，颜色跟着 banner 走）；
   金刚位两排刻意不同质：第 1 排图标卡（主），第 2 排文字胶囊（弱化）；
   Banner 改堆叠卡片轮播（能看见后面卡片的边）；排行榜与顾问推荐并排成一块。 */
/* ============ 开屏 ============ */
/* 冷启动的第一屏：整幅摄影缓慢推近，品牌分层浮现，2.8 秒后自动让开。
   点任意处或右上角「跳过」可立即进入。只在从首页进入时出现，
   分享链接直达产品页时不挡内容。 */
/* brand.name 形如「U-DESIGN 优定制」，拆成英文标与中文标两段。
   brand.en 是英文标语（YOUR JOURNEY, YOUR RULES），不是品牌名，不能拿来当 logo */
function brandOf(data) {
  const raw = String(((data || {}).brand || {}).name || 'U-DESIGN 优定制').trim();
  const m = raw.match(/^([A-Za-z0-9\-\s.]+?)\s*([\u4e00-\u9fff].*)?$/);
  return { en: (m && m[1] ? m[1] : 'U-DESIGN').trim(), cn: (m && m[2] ? m[2] : '优定制').trim() };
}

function Splash({ data, onDone }) {
  const [out, setOut] = useState(false);
  const [ready, setReady] = useState(false);   // 底图解码完成
  const doneRef = useRef(false);
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setOut(true);
    setTimeout(onDone, 950);          // 等淡出动画走完再卸载
  };
  /* 倒计时与推近动画都等底图解码完再开始。
     否则浏览器在图片就绪前不推进动画时钟：实测底图 2.4 秒才解码完，
     而开屏只有 2.8 秒，客人看到的几乎是一张静止的图。
     加载慢时最多等 2.5 秒就放行，不把人卡在开屏上。 */
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(finish, 2800);
    return () => clearTimeout(t);
  }, [ready]);
  useEffect(() => {
    /* 底图 1 秒还没就绪就先放行（原来等 2.5 秒）。另外加一条不依赖 ready 的绝对兜底：
       开屏最多停 4 秒。iOS 低电量模式会节流定时器，链式的「等 ready 再计时」不够稳。 */
    const guard = setTimeout(() => setReady(true), 1000);
    const hard = setTimeout(finish, 4000);
    return () => { clearTimeout(guard); clearTimeout(hard); };
  }, []);
  const sp = data.splash || {};
  const img = sp.img || ((data.banners || [])[0] || {}).img;
  const brand = brandOf(data);
  return (
    <div className={'mi-sp' + (out ? ' out' : '') + (ready ? ' go' : '')} onClick={finish}>
      <div className={'ph' + (ready ? ' go' : '')}>
        {img && <img src={oimg(img, 1200)} alt="" onLoad={() => setReady(true)} onError={() => setReady(true)} />}
      </div>
      <button className="skip" onClick={e => { e.stopPropagation(); finish(); }}>跳过</button>
      <div className="c">
        <div className="rule" />
        <div className="mk">{brand.en}</div>
        <div className="cn">{brand.cn}</div>
        <div className="sl">{(sp.title || '一次只做\n一个人的行程').split('\n').map((l, i) =>
          <React.Fragment key={i}>{i > 0 && <br />}{l}</React.Fragment>)}</div>
      </div>
      <div className="bar" />
    </div>
  );
}

/* ============ 首页 ============ */
/* 2026-09-24 晚定稿：欧美氛围版。
   上一版照搬了餐饮小程序的功能模块（会员码 / 会员卡 / 储值 / 积分 / 邀友），
   但优定制没有会员体系，那些数字都是编的，已全部去掉；
   竖排毛笔字是中式茶饮的语言，也一并换成衬线英文大字。
   这一版只借氛围手法：整屏摄影开场、衬线英文、大留白、克制的卡片。
   内容仍然全部来自后台「首页配置」：主图 ← splash/banners，两个入口 ← duo，
   行程 ← 已发布产品，主推 ← 产品首条，故事 ← story。 */
function Home({ go, data }) {
  const [cat, setCat] = useState('');
  const [bigPlay, setBigPlay] = useState(false);
  const banners = data.banners || [];
  const hero = (data.splash || {}).img || (banners[0] || {}).img;
  /* 主图支持视频（业务反馈 P1-2）：后台 splash.video 配了就静音循环当背景播，
     没配回落到静态图。不加播放键——banner 是氛围位，点一下应该进内容而不是控制播放。
     banner 自己也能配视频，splash 没配时用第一条 banner 的。 */
  const heroVideo = (data.splash || {}).video || (banners[0] || {}).video || null;
  const prods = data.inspire || [];
  const groups = data.group || [];
  const arts = (data.articles || []).slice(0, 8);
  const bd = brandOf(data);
  const lead = data.heroLead || { en: 'Bespoke', it: 'Journeys', t: '一次只做一个人的行程',
    p: '没有既定路线，没有购物店。从一句想法到能出发的行程，全程一条线跟到底、不转手。' };
  /* 业务反馈修正：首页要有金刚位，一排把「有哪些内容」摊开给客人看。
     标签控制在 4 字内，后台 quick 可配；不出现「顾问/定制师」——客人只对 AI。 */
  const quick = (data.quick || []).slice(0, 5);
  const duo = data.duo || [
    { t: '看看大家怎么玩', s: '踩线选定的成型路线', en: 'Curated', go: 'dest' },
    { t: '为你定制', s: '提需求，1 个工作日出方案', en: 'Bespoke', go: 'form' },
  ];
  const story = data.story || {};
  /* 分类从在售产品自己的标签聚合。themes 是「亲子/蜜月」人群分类，
     和产品标签（极光/雪山/艺术）对不上，拿来当筛选条件客人点了没反应 */
  const chips = useMemo(() => {
    const n = {};
    prods.forEach(p => (p.tags || []).forEach(t => { n[t] = (n[t] || 0) + 1; }));
    return ['全部', ...Object.entries(n).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t]) => t)];
  }, [prods]);
  const shown = useMemo(() => cat ? prods.filter(p => (p.tags || []).includes(cat)) : prods, [prods, cat]);
  /* 主推候选把臻品团也算进来：视频目前全配在小团产品上，
     只从灵感之旅里挑的话主推位永远没有视频可放 */
  const bigPool = useMemo(() => [...shown, ...(data.group || [])], [shown, data]);
  useEffect(() => { setBigPlay(false); }, [cat]);   // 换了分类就换了主推，视频要收回去
  /* 主推位优先挑配了视频的：会议定的是图文为主、视频为辅，
     但 Demo 打开第一眼要能看到视频，否则等于没做。没有带视频的就退回第一条。 */
  const big = bigPool.find(p => p.video) || shown[0] || prods[0];
  const rest = shown.filter(p => !big || p.id !== big.id);

  return (<div className="nh">
    <section className="nh-hero2">
      {heroVideo
        ? <video src={heroVideo} poster={hero} autoPlay muted loop playsInline />
        : (hero && <img src={oimg(hero, 1200)} alt="" />)}
      <div className="c">
        <div className="en">{lead.en}<i>{lead.it}</i></div>
        <div className="rule" />
        <h1>{lead.t}</h1>
        <p>{lead.p}</p>
      </div>
      <div className="nh-sb2" onClick={() => go('dest')}>
        <Icon n="search" s={15} c="var(--nh-brown3)" />搜目的地、你想去的城市
      </div>
    </section>

    {quick.length > 0 && (
      <div className="nh-jg">
        {quick.map((q, i) => (
          <div key={i} onClick={() => go(q.link || 'dest')}>
            <span><Icon n={q.icon || 'compass'} s={21} c="var(--nh-brown)" sw={1.4} /></span>
            <i>{q.label}</i>
          </div>
        ))}
      </div>
    )}

    <div className="nh-two">
      {duo.map((d, i) => (
        <div key={i} onClick={() => go(d.go || 'dest')}>
          <div className="en">{d.en || ''}</div>
          <b>{d.t}</b><i>{d.s}</i>
        </div>
      ))}
    </div>

    {prods.length > 0 && <>
      <section className="nh-sec">
        <div className="hd"><div className="l"><i>This Season</i><b>这个季节在安排</b></div>
          <span onClick={() => go('dest')}>全部 ›</span></div>
      </section>
      <div className="nh-chips">
        {chips.map(c => (
          <span key={c} className={(c === '全部' ? !cat : cat === c) ? 'on' : ''}
            onClick={() => setCat(c === '全部' ? '' : c)}>{c}</span>
        ))}
      </div>

      {big && (
        <div className="nh-big" onClick={() => { if (bigPlay) return; go('product', big.id); }}>
          {big.video && bigPlay
            ? <video src={big.video} poster={big.poster || big.cover} controls autoPlay playsInline
                onClick={e => e.stopPropagation()} />
            : <img src={oimg(big.poster || big.cover)} alt="" />}
          {big.video && !bigPlay && (
            <div className="play" onClick={e => { e.stopPropagation(); setBigPlay(true); }}><i /></div>
          )}
          <div className="c">
            <div className="k">{big.dest}</div>
            <h3>{big.title}</h3>
            <div className="ft">
              <span className="m">{[big.days && big.days + ' 天', (big.tags || []).slice(0, 2).join(' · ')].filter(Boolean).join(' · ')}</span>
              <span className="p">{money0(big.price_from)}<em>起</em></span>
            </div>
          </div>
        </div>
      )}

      {rest.length > 0 && (
        <div className="nh-rail">
          {rest.slice(0, 5).map(p => (
            <div className="it" key={p.id} onClick={() => go('product', p.id)}>
              <div className="ph"><img src={oimg(p.cover)} alt="" />
                {p.video
                  ? <span className="nh-vtag"><i />视频</span>
                  : (p.tags || [])[0] && <span className="tag">{p.tags[0]}</span>}</div>
              <div className="bd">
                <b>{p.title}</b>
                <div className="m">{[p.days && p.days + ' 天', p.dest].filter(Boolean).join(' · ')}</div>
                <div className="ft"><span className="p">{money0(p.price_from)}<em>起</em></span>
                  <span className="go">›</span></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>}

    {groups.length > 0 && <>
      <section className="nh-sec">
        <div className="hd"><div className="l"><i>Small Group</i><b>臻品团</b></div>
          <span onClick={() => go('group')}>全部 ›</span></div>
      </section>
      {groups.filter(p => !big || p.id !== big.id).slice(0, 2).map(p => (
        <div className="nh-lcard" key={p.id} onClick={() => go('product', p.id)}>
          <div className="ph" style={{ position: 'relative' }}><img src={oimg(p.cover)} alt="" />
            {p.video && <span className="nh-vtag" style={{ left: 6, top: 6, padding: '2px 7px 2px 5px', fontSize: 9 }}><i />视频</span>}</div>
          <div className="bd">
            <b>{p.title}</b>
            <div className="m">{[p.days && p.days + ' 天', p.dest].filter(Boolean).join(' · ')}</div>
            <div className="tg">{(p.tags || []).slice(0, 2).map(t => <span key={t}>{t}</span>)}</div>
            <div className="ft"><span className="p">{money0(p.price_from)}<em>起</em></span>
              <span className="btn">看行程</span></div>
          </div>
        </div>
      ))}
    </>}

    {arts.length > 0 && <>
      <section className="nh-sec">
        <div className="hd"><div className="l"><i>Inspiration</i><b>旅行灵感</b></div>
          <span onClick={() => go('guide')}>全部 ›</span></div>
      </section>
      <div className="nh-note">
        {arts.slice(0, 5).map(a => (
          <div className="it" key={a.id} onClick={() => go('article', a.id)}>
            <div className="ph"><img src={oimg(a.img)} alt="" />
              {a.video
                ? <span className="nh-vtag"><i />视频</span>
                : a.k && <span className="k">{a.k}</span>}</div>
            <b>{a.t}</b>
            {/* 署名收到栏目名：内容是 PGC，客人联系不到具体的人，不拿个人署名当卖点 */}
            <div className="by"><em>{a.k || '优定制'}</em>
              {a.read && <u>{a.read} 阅读</u>}</div>
          </div>
        ))}
      </div>
    </>}

    {story.t && (<>
      <div className="nh-story" onClick={() => go('about')}>
        <img src={oimg(story.img || hero)} alt="" />
        <div className="c"><i>{story.en}</i><b>{story.t}</b><p>{story.p}</p></div>
      </div>
      {/* 业务反馈 P3「品牌介绍内容优化」：一段话讲不清实力，
          补三个能被核实的硬指标（年头 / 地接覆盖 / 服务方式），后台 story.kv 可改 */}
      {(story.kv || []).length > 0 && (
        <div className="nh-kv">
          {story.kv.map((k, i) => (<div key={i}><b>{k.n}</b><i>{k.l}</i></div>))}
        </div>
      )}
    </>)}

    <div className="nh-foot">
      <div className="mk">{bd.en}</div>
      <div className="co">众信旅游集团<br />旅行社业务经营许可证 L-BJ-CJ00001</div>
    </div>
  </div>);
}

function ArtCard({ a, h, go }) {
  return (
    <div className="ac" onClick={() => go('article', a.id)}>
      <div className="pic" style={{ height: h }}>
        <img src={oimg(a.img)} alt="" loading="lazy" style={{ height: h }} />
        <span className="k">{a.k}</span>
        {/* 目的地压在图片左下角：客人一眼看到讲的是哪儿，又不额外占一行 */}
        {a.dest && <span className="dz"><Icon n="pin" s={9} c="#fff" />{a.dest}</span>}
        {a.video && <span className="vd"><i /></span>}
      </div>
      <div className="bd">
        <h4>{a.t}</h4>
        <div className="ft">
          <span className="av"><Icon n="user" s={9} c="#fff" /></span>
          <span className="by">{a.k || '优定制'}</span>
          <span><Icon n="eye" s={10} c="var(--muted-2)" style={{ verticalAlign: -1, marginRight: 2 }} />{a.read}</span>
        </div>
      </div>
    </div>
  );
}

function ProdCard({ p, group, onClick }) {
  return (
    <div className="mi-card" onClick={onClick}>
      <div className="pic">
        <img src={oimg(p.cover)} alt="" loading="lazy" />
        {group ? <span className="badge">{p.depart?.size || 8} 人小团 · {p.depart?.date || ''} 出发</span>
               : <span className="badge">{p.dest}</span>}
        <span className="days">{p.days} 天</span>
      </div>
      <div className="bd">
        <h4 className="clamp2">{p.title}</h4>
        <div className="sub clamp2">{p.subtitle}</div>
        <div className="tags">{(group ? p.highlights : p.tags || []).slice(0, 3).map(t => <span key={t}>{t}</span>)}</div>
        <div className="ft">
          <div className="price"><em>{group ? '¥' : '参考价 ¥'}</em>{money0(p.price_from)}<s>/人起</s></div>
          <span className="btn btn-o btn-xs">{group ? '看行程' : '看详情'}</span>
        </div>
      </div>
    </div>
  );
}

/* ============ 目的地频道 ============ */
/* ============ 目的地频道 ============
   业务定稿：一条瀑布流，目的地、行程、攻略、排行榜、轮播广告全部混在流里，
   不再分成一段段的板块。头部要有氛围但不能占版面 —— 用一条矮氛围带解决。 */
function Dest({ go, data, preset }) {
  const [region, setRegion] = useState('');
  const [q, setQ] = useState(preset || '');
  const [adI, setAdI] = useState(0);
  const dests = data.dests || [];
  const regions = data.regions || [];
  const list = useMemo(() => {
    let l = dests;
    if (region) l = l.filter(d => d.region === region);
    if (q) {
      const s = q.trim();
      l = l.filter(d => (d.name + d.en + (d.tagline || '') + (d.cities || []).join('')).includes(s));
    }
    return l;
  }, [dests, region, q]);

  const statOf = useMemo(() => {
    const all = [...(data.inspire || []), ...(data.group || [])];
    const arts = data.articles || [];
    return name => ({
      trips: all.filter(p => (p.dest || '').includes(name)).length,
      arts: arts.filter(a => a.dest === name).length,
    });
  }, [data]);
  const statTotal = useMemo(() => {
    const all = [...(data.inspire || []), ...(data.group || [])];
    return { trips: all.length, arts: (data.articles || []).length };
  }, [data]);
  const cntOf = useMemo(() => {
    const m = {};
    dests.forEach(d => { m[d.region] = (m[d.region] || 0) + 1; });
    return m;
  }, [dests]);

  const heroDest = useMemo(() => list[0] || dests[0] || null, [list, dests]);
  const ads = (data.banners || []).slice(0, 4);
  const rank = (data.ranking || []).slice(0, 5);

  /* 广告位在流里是一张会自己轮播的卡 */
  useEffect(() => {
    if (ads.length < 2) return;
    const t = setInterval(() => setAdI(i => (i + 1) % ads.length), 4200);
    return () => clearInterval(t);
  }, [ads.length]);

  /* 组流：目的地打底，每隔几张插一次广告 / 榜单 / 行程 / 攻略。
     区域筛选只筛目的地和行程，攻略、榜单、广告始终在，免得选了小区域整页只剩两张卡。 */
  const feed = useMemo(() => {
    const prods = (data.inspire || []).filter(p => !region || p.region === region);
    const arts = (data.articles || []).slice();
    const out = [];
    let pi = 0, ai = 0;
    list.forEach((d, i) => {
      out.push({ t: 'dest', k: 'd' + d.key, d });
      if (i === 1 && ads.length) out.push({ t: 'ads', k: 'ads' });
      if (i === 3 && rank.length) out.push({ t: 'rank', k: 'rank' });
      if (i % 2 === 1 && pi < prods.length) out.push({ t: 'prod', k: 'p' + prods[pi].id, p: prods[pi++] });
      if (i % 2 === 0 && ai < arts.length) out.push({ t: 'art', k: 'a' + arts[ai].id, a: arts[ai++] });
    });
    // 目的地排完了，剩下的行程与攻略继续交替铺，保证流足够长
    while (pi < prods.length || ai < arts.length) {
      if (pi < prods.length) out.push({ t: 'prod', k: 'p' + prods[pi].id, p: prods[pi++] });
      if (ai < arts.length) out.push({ t: 'art', k: 'a' + arts[ai].id, a: arts[ai++] });
    }
    if (!list.length) {   // 筛不到目的地时，广告和榜单也得有个位置
      if (ads.length) out.unshift({ t: 'ads', k: 'ads' });
      if (rank.length) out.splice(1, 0, { t: 'rank', k: 'rank' });
    }
    return out;
  }, [list, data, region, ads.length, rank.length]);

  /* 两列瀑布：按卡片类型估一个高度，谁矮往谁那边放。
     不用 CSS column-count —— 那个是先填满左列再填右列，穿插的顺序全乱。 */
  const cols = useMemo(() => {
    const H = { dest: 232, prod: 246, art: 196, rank: 250, ads: 158 };
    const c = [[], []], h = [0, 0];
    feed.forEach(it => {
      const k = h[0] <= h[1] ? 0 : 1;
      c[k].push(it); h[k] += (H[it.t] || 200) + 11;
    });
    return c;
  }, [feed]);

  const Card = ({ it }) => {
    if (it.t === 'dest') {
      const d = it.d, st = statOf(d.name);
      return (
        <div className="wf-c wf-dest" onClick={() => go('destDetail', d.name)}>
          <div className="ph"><img src={oimg(d.cover)} alt="" loading="lazy" />
            {d.video && <span className="nh-vtag"><i />视频</span>}
            {!d.video && d.season && <span className="se">{d.season}</span>}</div>
          <div className="bd">
            <div className="n"><b>{d.name}</b><i>{d.en}</i></div>
            <p>{d.tagline || (d.cities || []).join(' · ')}</p>
            <div className="mt">
              {st.trips > 0 && <span>{st.trips} 条行程</span>}
              {st.arts > 0 && <span className="a">{st.arts} 篇攻略</span>}
            </div>
            {d.base ? <div className="p">{money0(d.base)}<em>日均起</em></div> : null}
          </div>
        </div>
      );
    }
    if (it.t === 'prod') {
      const p = it.p;
      return (
        <div className="wf-c wf-prod" onClick={() => go('product', p.id)}>
          <div className="ph"><img src={oimg(p.cover)} alt="" loading="lazy" />
            {p.video && <span className="nh-vtag"><i />视频</span>}
            <span className="kd">行程</span></div>
          <div className="bd">
            <b>{p.title}</b>
            <div className="m">{[p.days && p.days + ' 天', p.dest].filter(Boolean).join(' · ')}</div>
            <div className="ft"><span className="p">{money0(p.price_from)}<em>起</em></span>
              <span className="go">看行程 ›</span></div>
          </div>
        </div>
      );
    }
    if (it.t === 'art') {
      const a = it.a;
      return (
        <div className="wf-c wf-art" onClick={() => go('article', a.id)}>
          <div className="ph"><img src={oimg(a.img)} alt="" loading="lazy" />
            {a.video && <span className="nh-vtag"><i />视频</span>}
            <span className="kd k2">{a.k || '攻略'}</span></div>
          <div className="bd">
            <b>{a.t}</b>
            <div className="m">{a.dest ? a.dest : '优定制'}{a.read ? ' · ' + a.read + ' 阅读' : ''}</div>
          </div>
        </div>
      );
    }
    if (it.t === 'ads') {
      const a = ads[adI] || ads[0];
      return (
        <div className="wf-c wf-ad" onClick={() => a && (a.dest ? go('destDetail', a.dest) : go('form'))}>
          <div className="ph">{a && (a.video
            ? <video src={a.video} poster={a.img} autoPlay muted loop playsInline />
            : <img src={oimg(a.img)} alt="" loading="lazy" />)}</div>
          <span className="tag">推广</span>
          <div className="c"><b>{a && a.title}</b><i>{a && a.sub}</i></div>
          <div className="dots">{ads.map((_, i) => <em key={i} className={i === adI ? 'on' : ''} />)}</div>
        </div>
      );
    }
    if (it.t === 'rank') {
      return (
        <div className="wf-c wf-rank">
          <div className="h"><i>Trending</i><b>本季想去榜</b></div>
          {rank.map(r => {
            const st = statOf(r.name);
            return (
              <div className="r" key={r.name} onClick={() => go('destDetail', r.name)}>
                <span className={'no n' + r.r}>{r.r}</span>
                <div className="tx"><b>{r.name}</b>
                  <i>{r.hot}{st.trips > 0 ? ' · ' + st.trips + ' 条行程' : ''}</i></div>
                <span className={'tr ' + (r.trend || 'flat')}>
                  {r.trend === 'up' ? '↑' : r.trend === 'down' ? '↓' : '—'}</span>
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };

  return (<div className="nd">
    {/* 头部：矮，但要有氛围 —— 用当前区域的图做底，压暗之后把刊头文字叠上去。
        高度只有首页 hero 的一半，图还在，气口也还在。 */}
    <div className="nd-band">
      {heroDest && <img src={oimg(heroDest.cover)} alt="" />}
      <div className="c">
        <div className="rule"><i /><span>Destinations</span><i /></div>
        <h1>去哪里</h1>
        <em>Where the year takes you</em>
        <div className="meta">
          <span><b>{dests.length}</b> 个目的地</span><u />
          <span><b>{statTotal.trips}</b> 条行程</span><u />
          <span><b>{statTotal.arts}</b> 篇攻略</span>
        </div>
      </div>
      <div className="sb">
        <Icon n="search" s={14} c="var(--nh-brown3)" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜国家、城市或景点" />
        {q && <span onClick={() => setQ('')} style={{ fontSize: 15, color: 'var(--nh-brown3)' }}>✕</span>}
      </div>
    </div>

    <div className="nh-chips nd-chips">
      {['', ...regions].map(r => (
        <span key={r || 'all'} className={region === r ? 'on' : ''} onClick={() => setRegion(r)}>
          {r || '全部'}{r && cntOf[r] ? <em>{cntOf[r]}</em> : null}
        </span>
      ))}
    </div>

    {!feed.length ? (
      <div className="nd-empty">{region && !cntOf[region]
        ? region + '线路正在筹备，先看看别的区域'
        : '没有符合条件的目的地，换个词试试'}</div>
    ) : (
      <div className="wf">
        {cols.map((col, i) => (
          <div className="wf-col" key={i}>
            {col.map(it => <Card it={it} key={it.k} />)}
          </div>
        ))}
      </div>
    )}
    <div style={{ height: 18 }} />
  </div>);
}

/* 私家团的产品标准：写成可核对的数值，不是「品质纯玩」这种形容词。
   后台 groupStd 配了就用后台的。 */
const GROUP_STD = [
  ['users', '8–20 人', '小团成行'],
  ['bed', '4–5 星', '特色酒店'],
  ['shield', '0 购物店', '全程纯玩'],
  ['user', '领队+地陪', '专业陪同'],
];

/* ============ 臻品团 ============ */
function Group({ go, data }) {
  const [region, setRegion] = useState('');
  const list = (data.group || []).filter(p => !region || p.region === region);
  return (<>
    <div className="grp-hd">
      <div className="nm">臻品团</div>
      <div className="en">Light Luxury · Small Group</div>
      <div className="sl">8 至 20 人成行的私家小团 · 顾问踩线选定<br />不拼大团、不进购物店，节奏按人定</div>
      {/* 业务反馈：上部要看到私家团的核心亮点或产品标准，但别占大版面。
          所以只给一行带数值的硬标准（成团人数 / 酒店档次 / 领队配置），
          后台 groupStd 可配，配了几条就显示几条。 */}
      <div className="std">
        {(data.groupStd || GROUP_STD).map(([ic, n, t]) => (
          <div key={t}><Icon n={ic} s={13} c="var(--gold)" /><b>{n}</b><i>{t}</i></div>
        ))}
      </div>
    </div>
    <div style={{ padding: '16px 14px 24px' }}>
      <div className="mi-themes" style={{ padding: '0 0 16px' }}>
        {['', ...(data.regions || [])].map(r => (
          <div key={r || 'a'} className={'mi-theme' + (region === r ? ' on' : '')} onClick={() => setRegion(r)}>{r || '全部'}</div>
        ))}
      </div>
      {list.map(p => <ProdCard key={p.id} p={p} group onClick={() => go('product', p.id)} />)}
      {!list.length && <div className="empty"><div className="ic">◎</div>该区域暂无在售小团</div>}
    </div>
  </>);
}

/* ============ 产品详情 ============ */
function Product({ go, back, id, onConsult, isFav, toggleFav }) {
  const { d: p, loading } = useData(() => get('/api/mini/products/' + id), [id]);
  const [playing, setPlaying] = useState(false);
  const [day, setDay] = useState(0);
  const [mi, setMi] = useState(0);
  const vref = useRef();
  const trackRef = useRef();
  /* 章节吸顶栏：滚过头图后顶上留一条常驻导航，客人不用一路往回滑找行程和费用 */
  const barRef = useRef();
  const secRef = useRef({});
  const [secOn, setSecOn] = useState('');
  const [topped, setTopped] = useState(false);
  /* 换产品时把轮播归位：组件是复用的，不重置的话上一条产品滑到第几张，
     新产品的缩略图就跟着高亮在第几张。 */
  useEffect(() => {
    setMi(0); setPlaying(false); setDay(0); setSecOn(''); setTopped(false);
    if (trackRef.current) trackRef.current.scrollLeft = 0;
  }, [id]);
  /* 当前章节靠「章节顶边越过吸顶栏底边」判断，比 IntersectionObserver 直观，
     也不会因为章节高度差太多出现两个同时命中。 */
  useEffect(() => {
    const sc = document.querySelector('.mi-scroll');
    if (!sc) return;
    const onScroll = () => {
      const bar = barRef.current;
      /* 头图上那两个浮钮（返回 / 收藏）是 absolute 挂在 .mi-app 上的，不随内容滚走，
         吸顶栏一吸住就会和它们叠在一起，所以吸住后把浮钮收掉、收藏并进吸顶栏 */
      if (bar) setTopped(bar.getBoundingClientRect().top - sc.getBoundingClientRect().top <= 1);
      const line = (bar ? bar.getBoundingClientRect().bottom : 0) + 6;
      let cur = '';
      Object.keys(secRef.current).forEach(k => {
        const el = secRef.current[k];
        if (el && el.getBoundingClientRect().top <= line) cur = k;
      });
      setSecOn(cur);
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => sc.removeEventListener('scroll', onScroll);
  }, [id, loading]);
  const goSec = k => {
    const el = secRef.current[k], sc = document.querySelector('.mi-scroll'), bar = barRef.current;
    if (!el || !sc) return;
    const h = bar ? bar.offsetHeight : 0;
    sc.scrollTo({ top: sc.scrollTop + el.getBoundingClientRect().top - sc.getBoundingClientRect().top - h,
      behavior: 'smooth' });
  };
  if (loading || !p) return <div className="empty" style={{ paddingTop: 140 }}>载入中…</div>;
  const grp = p.type === 'smallgroup';
  const gal = p.gallery || [];
  const play = () => { setPlaying(true); setTimeout(() => vref.current && vref.current.play().catch(() => {}), 60); };

  /* 顶部媒体轮播：封面 → 视频 → 产品图，全部排在同一条横向 scroll-snap 轨道上。
     改版前封面单独占一屏（300px）、产品图另起一块纵向铺两排（224px），加起来 500+px，
     首屏几乎只剩图；合成一条横滑带之后版面省掉一整块，图片与视频也能左右来回切换。
     封面固定第一屏；视频那一屏点播放键就地播，滑走自动停。 */
  const cover0 = p.poster || p.cover;
  const media = [{ t: 'img', src: cover0 }];
  if (p.video) media.push({ t: 'video', src: p.video, poster: cover0 });
  gal.forEach(g => { if (g && g !== cover0) media.push({ t: 'img', src: g }); });
  const vIdx = media.findIndex(x => x.t === 'video');
  const onTrack = e => {
    const el = e.currentTarget;
    const n = Math.max(0, Math.min(media.length - 1, Math.round(el.scrollLeft / Math.max(1, el.clientWidth))));
    if (n !== mi) { setMi(n); if (n !== vIdx) setPlaying(false); }
  };
  const SECS = [
    ['price', '概览', true],
    ['hl', '亮点', !!(p.highlights || []).length],
    ['spot', '景点', !!(p.spots || []).length],
    ['itin', '行程详情', !!(p.itinerary || []).length],
    ['extra', '费用说明', !!p.extra],
    ['proc', '定制流程', !!(p.process || []).length],
  ].filter(x => x[2]).map(x => ({ k: x[0], t: x[1] }));

  /* 左右箭头：触屏直接滑，桌面演示端（手机壳里）没有横向拖拽，得给按钮才切得动 */
  const slide = n => {
    const el = trackRef.current; if (!el) return;
    const k = Math.max(0, Math.min(media.length - 1, n));
    el.scrollTo({ left: k * el.clientWidth, behavior: 'smooth' });
  };

  return (<>
    <div className={'mi-nav' + (topped ? ' pd-fade' : '')}>
      <div className="mi-back" onClick={() => back('home')}><Icon n="back" s={15} c="#fff" /></div></div>
    <button className={'fav-btn fav-fl' + (isFav && isFav('product', p.id) ? ' on' : '') + (topped ? ' pd-fade' : '')}
      onClick={() => toggleFav && toggleFav('product', p.id)}>
      <Icon n="heart" s={14} c={isFav && isFav('product', p.id) ? '#fff' : 'var(--ink)'} />
      {isFav && isFav('product', p.id) ? '已收藏' : '收藏'}
    </button>

    {/* 顶部媒体轮播：图片 + 视频混排，左右滑动切换 */}
    <div className="pd-media">
      <div className="pd-mtrack" ref={trackRef} onScroll={onTrack}>
        {media.map((m, i) => (
          <div className="pd-mslide" key={i}>
            {m.t === 'video' && playing
              ? <video ref={vref} src={m.src} poster={m.poster} controls playsInline />
              : <img src={oimg(m.t === 'video' ? m.poster : m.src, 1200)} alt="" loading={i ? 'lazy' : 'eager'} />}
            {m.t === 'video' && !playing && (<>
              <span className="pd-vtag"><Icon n="eye" s={10} c="#fff" />产品视频</span>
              <div className="pd-play" onClick={play}><i /></div>
            </>)}
          </div>
        ))}
      </div>
      {!playing && (<>
        <div className="pd-hero-c">
          {grp && p.depart && <span className="dep"><Icon n="calendar" s={11} c="#fff" />{p.depart.date} 出发 · {p.depart.size} 人成团</span>}
          <h1>{p.title}</h1>
          <p>{p.subtitle}</p>
        </div>
        {media.length > 1 && (<>
          <button className="pd-marr l" disabled={mi === 0} onClick={() => slide(mi - 1)} aria-label="上一张">‹</button>
          <button className="pd-marr r" disabled={mi === media.length - 1} onClick={() => slide(mi + 1)} aria-label="下一张">›</button>
          <div className="pd-mnum">{mi + 1} / {media.length}</div>
        </>)}
      </>)}
    </div>

    {/* 图片展示区：业务反馈说改版前这块挺好用、点一下能切，改版时被并进横滑带里丢了。
        这里补回来，并且把视频和图片分开标出来 —— 视频缩略图带播放角标，
        上面那行也写清各有几项，客人一眼知道这产品有没有视频。 */}
    {media.length > 1 && (
      <div className="pd-thumbs">
        <div className="hd">
          {vIdx >= 0 && (
            <span className={'tb' + (mi === vIdx ? ' on' : '')} onClick={() => slide(vIdx)}>
              <i className="vd" />视频 {media.filter(m => m.t === 'video').length}
            </span>
          )}
          <span className={'tb' + (mi !== vIdx ? ' on' : '')}
            onClick={() => slide(vIdx === 0 ? 1 : 0)}>
            图片 {media.filter(m => m.t === 'img').length}
          </span>
          <em>点击下方缩略图切换</em>
        </div>
        <div className="ls">
          {media.map((m, i) => (
            <div className={'th' + (mi === i ? ' on' : '')} key={i} onClick={() => slide(i)}>
              <img src={oimg(m.t === 'video' ? m.poster : m.src)} alt="" loading="lazy" />
              {m.t === 'video' && <span className="pl"><i /></span>}
            </div>
          ))}
        </div>
      </div>
    )}

    {/* 章节吸顶栏：只列这条产品真有内容的章节，滚到哪一段就亮哪一个 */}
    {SECS.length > 1 && (
      <div className="pd-anchor" ref={barRef}>
        <div className="bk" onClick={() => back('home')}><Icon n="back" s={14} c="var(--ink)" /></div>
        <div className="ls">
          {SECS.map(x => (
            <button key={x.k} className={secOn === x.k ? 'on' : ''} onClick={() => goSec(x.k)}>{x.t}</button>
          ))}
        </div>
        <div className={'fv' + (isFav && isFav('product', p.id) ? ' on' : '')}
          onClick={() => toggleFav && toggleFav('product', p.id)}>
          <Icon n="heart" s={15} c={isFav && isFav('product', p.id) ? 'var(--accent)' : 'var(--muted)'} />
        </div>
      </div>
    )}

    {/* 价格 */}
    <div className="pd-price" ref={el => { secRef.current.price = el; }}>
      <div className="l"><em>¥</em><b>{money0(p.price_from)}</b><s>{grp ? ' /人' : ' 起/人'}</s></div>
      <div className="r"><b>{p.days} 天 {p.days - 1} 晚</b>
        <span>{grp ? '品质纯玩 · 不进店' : '可根据出行需求调整'}</span></div>
    </div>

    {/* 标签 */}
    {!!(p.tags || []).length && <div className="pd-tags">{p.tags.map(t => <span key={t}>{t}</span>)}</div>}

    {/* 行程亮点 */}
    {!!(p.highlights || []).length && (
      <div className="pd-sec" ref={el => { secRef.current.hl = el; }}>
        <div className="pd-h"><div className="ln"><i /><span>Highlights</span><i /></div><h3>行程亮点</h3></div>
        <div className="mi-pdhl">
          {p.highlights.map((h, i) => (
            <div key={i}><span className="no">{String(i + 1).padStart(2, '0')}</span><p>{h}</p></div>
          ))}
        </div>
      </div>
    )}

    {/* 特色景点 */}
    {!!(p.spots || []).length && (
      <div className="pd-sec" ref={el => { secRef.current.spot = el; }}>
        <div className="pd-h"><div className="ln"><i /><span>Must See</span><i /></div><h3>特色景点</h3></div>
        {p.spots.map((x, i) => (
          <div className="pd-spot" key={x.n}>
            <div className="im"><img src={oimg(gal[i % Math.max(1, gal.length)] || p.cover)} alt="" loading="lazy" /></div>
            <div className="t"><div className="c">{x.c}</div><b>{x.n}</b><p>{x.d}</p></div>
          </div>
        ))}
      </div>
    )}

    {/* 行程详情 */}
    {!!(p.itinerary || []).length && (
      <div className="pd-sec" ref={el => { secRef.current.itin = el; }}>
        <div className="pd-h"><div className="ln"><i /><span>Itinerary</span><i /></div><h3>行程详情</h3></div>
        {/* 日序 chip 带上当天城市与标题：D1 · 东京｜抵达与自由活动。
            城市或标题缺失就自动降级（只剩其中一个 / 只剩日序），过长由 CSS 截断，不撑破宽度 */}
        <div className="pd-daybar">
          {p.itinerary.map((d2, i) => {
            const city = (d2.city || '').trim(), ttl = (d2.title || '').trim();
            const label = 'D' + d2.d + (city ? ' · ' + city : '') + (ttl ? '｜' + ttl : '');
            return (
              <button key={i} className={'pd-daychip' + (day === i ? ' on' : '')} title={label}
                onClick={() => setDay(i)}>{label}</button>
            );
          })}
        </div>
        {p.itinerary.slice(day, day + 3).map(d2 => (
          <div className="pd-day" key={d2.d}>
            <div className="dn">Day {String(d2.d).padStart(2, '0')}{d2.city ? ' · ' + d2.city : ''}</div>
            <h4>{d2.title}</h4>
            {d2.html ? <div className="rich-view" dangerouslySetInnerHTML={{ __html: d2.html }} />
              : <ul>{(d2.items || []).map((x, j) => <li key={j}>{x}</li>)}</ul>}
            <div className="meta">
              {d2.hotel && <span>住 · {d2.hotel}</span>}
              {d2.meals && <span>餐 · {d2.meals}</span>}
              {d2.exp && <span>体验 · {d2.exp}</span>}
            </div>
          </div>
        ))}
        {p.itinerary.length > day + 3 && (
          <div style={{ textAlign: 'center', paddingTop: 6 }}>
            <button className="btn btn-o btn-s" onClick={() => setDay(d3 => Math.min(d3 + 3, p.itinerary.length - 1))}>
              展开后面 {p.itinerary.length - day - 3} 天 <Icon n="down" s={13} /></button>
          </div>
        )}
      </div>
    )}

    {/* 补充说明：费用包含与不含、出行人要求、退改约定，逐产品单独维护 */}
    {!!p.extra && (
      <div className="pd-sec" ref={el => { secRef.current.extra = el; }}>
        <div className="pd-h"><div className="ln"><i /><span>Good to Know</span><i /></div><h3>补充说明</h3></div>
        <div className="pd-extra rich-view" dangerouslySetInnerHTML={{ __html: p.extra }} />
      </div>
    )}

    {/* 定制流程 */}
    {!!(p.process || []).length && (
      <div className="pd-sec" ref={el => { secRef.current.proc = el; }}>
        <div className="pd-h"><div className="ln"><i /><span>How it works</span><i /></div><h3>定制流程</h3></div>
        <div className="mi-pdproc">
          {p.process.map(x => (
            <div key={x.no}><span className="no">{x.no}</span><b>{x.t}</b><p>{x.d}</p></div>
          ))}
        </div>
      </div>
    )}

    {/* 背书 */}
    {!!(p.endorse || []).length && (
      <div className="pd-end">
        <div className="rule" />
        <div className="g">
          {p.endorse.map(x => <div key={x.t}><b>{x.t}</b><span>{x.d}</span></div>)}
        </div>
      </div>
    )}

    {/* 注意：下面的操作条是 position:sticky，本身就占着流内高度，
        再给它垫一个 88px 的占位块只会在背书区和操作条之间多出一整块空白（客户反馈的「底部大片空白」）。 */}
    <div className="mi-submit" style={{ position: 'sticky', bottom: 0 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-o" style={{ flex: '0 0 104px', height: 50, borderRadius: 2 }} onClick={() => go('ai', p.dest)}>
          <Icon n="sparkle" s={15} c="var(--accent)" />AI 规划
        </button>
        <button style={{ flex: 1, height: 50, borderRadius: 2, fontSize: 15.5, fontWeight: 600, color: '#fff', background: 'linear-gradient(120deg,var(--accent),var(--accent-2))' }}
          onClick={() => onConsult(p)}>{grp ? '咨询该小团' : '立即咨询定制'}</button>
      </div>
    </div>
  </>);
}

const PREFS = [['family', '亲子旅行'], ['nature', '自然风光'], ['hidden', '小众秘境'], ['leisure', '休闲度假'],
  ['food', '美食探店'], ['culture', '人文古迹'], ['honeymoon', '蜜月浪漫'], ['photo', '摄影出片'], ['luxury', '高端奢享']];

/* 常用出发城市：众信有出港资源的主要口岸城市 */
const DEPART_CITIES = ['北京', '上海', '广州', '深圳', '成都', '重庆', '杭州', '南京',
  '武汉', '西安', '青岛', '厦门', '昆明', '长沙', '天津', '沈阳', '哈尔滨', '郑州'];

const J = v => JSON.stringify(v);

function Counter3({ label, hint, v, set }) {
  return (<div className="b"><div className="n">{label}</div>
    <div className="r">
      <button onClick={() => set(Math.max(0, v - 1))}>−</button>
      <span className="v">{v}</span>
      <button className="p" onClick={() => set(v + 1)}>+</button>
    </div><div className="h">{hint}</div></div>);
}
function Ai({ go, data, preset, onPlan }) {
  const toast = useToast();
  const [dest, setDest] = useState(preset || '');
  const [days, setDays] = useState(8);
  const [a, setA] = useState(2), [c, setC] = useState(0), [e, setE] = useState(0);
  const [prefs, setPrefs] = useState(['nature']);
  const [must, setMust] = useState('');
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(5);
  const dests = data.dests || [];
  /* 客人先看到完整的一版：浏览满意了再点「采用此方案」提交。
     提交之后这份行程就归定制师核对了，在推送回来之前客人看不到（见 /api/trip 的校验）。 */
  const run = async () => {
    if (!dest) return toast('请先选择目的地');
    setBusy(true);
    try {
      const p = await post('/api/mini/ai/preview', { dest, days, adults: a, children: c, elders: e, prefs, mustSee: must, fromCity: '北京' });
      setLeft(x => Math.max(0, x - 1));
      onPlan(p, { dest, days, adults: a, children: c, elders: e, prefs, mustSee: must, fromCity: '北京' });
    } catch (err) { toast('方案生成失败：' + err.message); } finally { setBusy(false); }
  };
  return (<>
    {/* 头部换成和会员页同一套墨金语言：光晕 + 细网格 + 金色徽章，
        再压一行「它能做到什么」的短标签，比单纯一段说明更有说服力 */}
    <div className="mi-ai-hd">
      <span className="glow" />
      {/* 装饰航线：一条起飞弧线 + 三个落点。这一屏原来全是字，
          氛围靠图形撑起来，比多写两句更像这个小程序的调性。 */}
      <svg className="deco" viewBox="0 0 220 150" fill="none" aria-hidden="true">
        <path d="M6 138 C 58 132, 104 106, 136 66 S 186 18, 212 12" stroke="url(#aiArc)"
          strokeWidth="1.1" strokeDasharray="4 5" strokeLinecap="round" />
        <circle cx="6" cy="138" r="2.6" fill="#e8cf9a" opacity=".55" />
        <circle cx="136" cy="66" r="3.4" fill="#e8cf9a" opacity=".8" />
        <circle cx="136" cy="66" r="9" stroke="#e8cf9a" strokeWidth=".9" opacity=".3" />
        <circle cx="212" cy="12" r="2.2" fill="#e8cf9a" opacity=".45" />
        <defs>
          <linearGradient id="aiArc" x1="0" y1="150" x2="220" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="#e8cf9a" stopOpacity=".1" />
            <stop offset=".55" stopColor="#e8cf9a" stopOpacity=".55" />
            <stop offset="1" stopColor="#e8cf9a" stopOpacity=".12" />
          </linearGradient>
        </defs>
      </svg>
      <div className="hi">
        <div className="bot"><span className="halo" /><Icon n="sparkle" s={22} c="#fff" /></div>
        <h3 className="ttl">您好<br />我是优定制 AI 行程师</h3>
      </div>
      <p className="sub">选几项，一分钟先看见一版完整的旅程</p>
      <div className="caps">
        <span>真实资源与报价</span><span>可改可重来</span>
      </div>
    </div>
    <div className="mi-ai-card">
      <div className="mi-ai-q">您计划前往的目的地？</div>
      <select className="inp" value={dest} onChange={ev => setDest(ev.target.value)} style={{ height: 44, marginBottom: 18 }}>
        <option value="">请选择目的地</option>
        {dests.map(d => <option key={d.key} value={d.name}>{d.name} · {d.tagline}</option>)}
      </select>
      <div className="mi-ai-q">预计出行多少天？</div>
      <div className="mi-themes" style={{ padding: '0 0 18px' }}>
        {[5, 6, 7, 8, 9, 10, 12, 14].map(n => (
          <div key={n} className={'mi-theme' + (days === n ? ' on' : '')} onClick={() => setDays(n)}>{n} 天</div>
        ))}
      </div>
      <div className="mi-ai-q">预计出行人数？</div>
      <div className="mi-cnt" style={{ marginBottom: 18 }}>
        <Counter3 label="成人" hint="18 周岁以上" v={a} set={setA} />
        <Counter3 label="儿童" hint="2–18 周岁" v={c} set={setC} />
        <Counter3 label="老人" hint="60 周岁以上" v={e} set={setE} />
      </div>
      <div className="mi-ai-q">您的旅行偏好？</div>
      <div className="chips" style={{ marginBottom: 18 }}>
        {PREFS.map(([k, t]) => (
          <div key={k} className={'chip gold' + (prefs.includes(k) ? ' on' : '')}
            onClick={() => setPrefs(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k])}>{t}</div>
        ))}
      </div>
      <div className="mi-ai-q">有必访的景点吗？（选填）</div>
      <input className="inp" value={must} onChange={ev => setMust(ev.target.value)}
        placeholder="例：圣托里尼日落、天空之镜" style={{ height: 44, marginBottom: 18 }} />
      <button className="mi-aibtn" onClick={run} disabled={busy}>
        {busy ? '正在生成线路方案…' : 'AI 规划行程'}
        <span>今日剩余体验次数：{left}</span>
      </button>
      <div style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--muted-2)', marginTop: 12 }}>内容由 AI 生成，仅供参考</div>
    </div>
    {/* 两条路分工：AI 负责「还没想好、先看看长什么样」，表单负责「已经想好、直接下需求」。
        都留着，但在页面上互相指路，免得客人对着两个入口不知道点哪个。 */}
    <div className="mi-swap" onClick={() => go('form')}>
      <div className="ic"><Icon n="pen" s={16} c="var(--nh-gold)" /></div>
      <div className="tx"><b>已经想好了？直接提需求</b>
        <i>填出行日期、预算与联系方式，1 个工作日内给到含真实资源与报价的方案</i></div>
      <span className="go">去填写 ›</span>
    </div>
    <div style={{ height: 24 }} />
  </>);
}

/* ============ AI 结果 · 行程页 ============ */
function PlanView({ p, req, go, back, onSubmit }) {
  const [tab, setTab] = useState(0);
  const toast = useToast();
  const pax = (req.adults || 0) + (req.children || 0) + (req.elders || 0);
  return (<>
    <div className="mi-nav"><div className="mi-back" onClick={() => back('ai')}><Icon n="back" s={15} c="#fff" /></div>
      <b style={{ color: '#fff' }}>您的专属行程</b></div>
    <div className="mi-plan-hero">
      <img src={oimg(p.cover)} alt="" />
      <div className="c">
        <div className="tk" style={{ color: 'var(--gold-2)' }}>{p.name}</div>
        <h2 className="serif" style={{ fontSize: 23, fontWeight: 400, margin: '6px 0 4px' }}>{p.route}</h2>
        <p style={{ fontSize: 12.5, opacity: .86, margin: 0 }}>{p.tagline}</p>
      </div>
    </div>
    <div className="mi-quotebar">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        <div><div style={{ fontSize: 11, opacity: .7 }}>行程总报价</div>
          <div className="n">{money(p.total)}</div>
          <div style={{ fontSize: 11, opacity: .65, marginTop: 2 }}>{p.quoteNote}</div></div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 11, opacity: .7 }}>人均</div>
          <div className="serif" style={{ fontSize: 18 }}>{money(p.perPerson)}</div></div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.12)' }}>
        {(p.highlights || []).map(h => <span key={h} style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 5, background: 'rgba(207,174,116,.2)', color: 'var(--gold-2)' }}>{h}</span>)}
      </div>
    </div>
    <div style={{ display: 'flex', gap: 7, overflowX: 'auto', padding: '4px 14px 14px', scrollbarWidth: 'none' }}>
      {p.days.map((d, i) => (
        <div key={i} onClick={() => setTab(i)} style={{
          flex: '0 0 auto', padding: '7px 14px', borderRadius: 999, fontSize: 12.5, whiteSpace: 'nowrap',
          background: tab === i ? 'var(--ink)' : '#fff', color: tab === i ? '#fff' : 'var(--ink)',
          border: '1px solid ' + (tab === i ? 'var(--ink)' : 'var(--line)'),
        }}>D{d.d} {d.city}</div>
      ))}
    </div>
    {p.days.map((d, i) => i === tab && (
      <div key={i} className="mi-daycard fade-in" style={{ marginBottom: 14 }}>
        {d.pic && <div className="mi-daypic"><img src={oimg(d.pic)} alt="" /></div>}
        <div className="h">
          <div className="dno"><b>{String(d.d).padStart(2, '0')}</b><span>DAY</span></div>
          <div className="tt"><b>{d.title}</b><span>{d.city}</span></div>
        </div>
        <div className="bd">
          <ul>{d.items.map((x, j) => <li key={j}>{x}</li>)}</ul>
          <div className="meta">
            {d.hotel && <span>住 · {d.hotel}</span>}
            {d.meals && <span>餐 · {d.meals}</span>}
            {d.exp && <span>体验 · {d.exp}</span>}
            {d.food && <span>美食 · {d.food}</span>}
          </div>
        </div>
      </div>
    ))}
    <div style={{ padding: '0 14px 20px' }}>
      <div className="card" style={{ padding: '14px 16px', background: 'var(--gold-soft)', border: '1px solid #e9dcc2' }}>
        <div style={{ fontSize: 12.5, lineHeight: 1.7, color: '#6b5a38' }}>
          本方案由 AI 依据您的需求生成初版。<b>提交后由专属服务通道接手跟进</b>，
          将于 1 个工作日内提供含真实资源与报价的正式方案，并可根据您的意见多轮调整。
        </div>
      </div>
    </div>
    <div className="mi-submit" style={{ position: 'sticky', bottom: 0 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-o" style={{ flex: '0 0 96px', height: 50, borderRadius: 999 }} onClick={() => go('ai')}>重新生成方案</button>
        <button style={{ flex: 1, height: 50, borderRadius: 999, fontSize: 15.5, fontWeight: 600,
          color: '#fff', whiteSpace: 'nowrap', background: 'linear-gradient(120deg,var(--gold),var(--gold-2))' }}
          onClick={onSubmit}>采用此方案</button>
      </div>
    </div>
  </>);
}

/* ============ 需求表单 ============ */
const STEPS = [['file', '需求提交'], ['chat', '行程设计'], ['shield', '合同签约'], ['sun', '开心出行']];
function Form({ go, back, data, preset, onDone, guest }) {
  const toast = useToast();
  const [f, setF] = useState({ goDate: '', dest: preset?.dest || '', days: '', pax: '', budget: '', customer: '', phone: '', note: '', kind: 'person', org: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(o => ({ ...o, [k]: v }));
  const ok = f.dest && f.budget && f.customer && f.phone;
  const submit = async () => {
    if (!f.dest) return toast('请选择目的地');
    if (!f.budget) return toast('请填写出行预算');
    if (!f.customer) return toast('请填写联系人');
    if (!/^1[3-9]\d{9}$/.test(f.phone)) return toast('请填写正确的手机号');
    if (f.kind === 'org' && !f.org.trim()) return toast('请填写公司名称');
    setBusy(true);
    try {
      const pax = String(f.pax || '2');
      const r = await post('/api/mini/consult', {
        customer: f.customer, phone: f.phone, dest: f.dest, goDate: f.goDate,
        days: parseInt(f.days) || 8, adults: parseInt(pax) || 2,
        budget: parseInt(String(f.budget).replace(/\D/g, '')) || null, note: f.note,
        fromCity: (guest && guest.from_city) || '北京', prefs: (guest && guest.prefs) || [],
        fromArticle: preset && preset.fromArticle,
        /* 个人出行与企业团建是两种生意：企业单要走对公、要发票抬头、人数与预算量级都不同，
           进后台要分得开，顾问接单时才知道该按哪套流程走 */
        kind: f.kind, org: f.kind === 'org' ? f.org.trim() : '',
      });
      /* 把目的地与天数一并带出去：提交成功页要用它取背景图、写「意大利 · 8 天」 */
      onDone(r, { dest: f.dest, days: parseInt(f.days) || 8 });
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };
  const hero = (data.banners || [])[0]?.img;
  return (<div style={{ minHeight: '100%', position: 'relative' }}>
    <div style={{ position: 'absolute', inset: 0, height: 330, overflow: 'hidden' }}>
      {hero && <img src={oimg(hero, 1200)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(10,20,18,.62),rgba(10,20,18,.35) 45%,var(--paper) 100%)' }} />
    </div>
    {/* 状态栏安全区用 padding 不用 margin：父元素没有 padding/border 时，
        子元素的 marginTop 会被外边距折叠折出去，44px 留不住，返回键会被手机壳状态栏盖住 */}
    <div style={{ position: 'relative', zIndex: 2, paddingTop: 44 }}>
      <div className="mi-nav" style={{ position: 'static' }}>
        <div className="mi-back" onClick={() => back('home')}><Icon n="back" s={15} c="#fff" /></div>
        <b>{f.kind === 'org' ? '企业定制需求' : '定制旅游需求'}</b>
      </div>
      <div className="mi-steps">
        {STEPS.map(([ic, t], i) => (<React.Fragment key={t}>
          <div className={'mi-step' + (i === 0 ? ' on' : '')}>
            <div className="c"><Icon n={ic} s={17} c="#fff" /></div><b>{t}</b>
          </div>{i < 3 && <div className="mi-line" />}
        </React.Fragment>))}
      </div>
      <div className="mi-swap" onClick={() => go('ai')} style={{ marginTop: 2 }}>
        <div className="ic"><Icon n="sparkle" s={16} c="var(--nh-gold)" /></div>
        <div className="tx"><b>还没想好去哪、怎么玩？</b>
          <i>先用 AI 行程师排一版看看，满意了再回来提需求</i></div>
        <span className="go">试一下 ›</span>
      </div>
      {/* 个人还是企业，先分清楚。两边后续要走的流程不一样 */}
      <div className="mi-kind">
        <div className={f.kind === 'person' ? 'on' : ''} onClick={() => set('kind', 'person')}>
          <b>个人出行</b><i>家庭、情侣、朋友同行</i></div>
        <div className={f.kind === 'org' ? 'on' : ''} onClick={() => set('kind', 'org')}>
          <b>企业定制</b><i>团建、奖励旅游、商务考察</i></div>
      </div>
      <div className="mi-form">
        {f.kind === 'org' && (
          <div className="mi-row"><span className="lb">公司名称<b>*</b></span>
            <input value={f.org} onChange={e => set('org', e.target.value)} placeholder="请填写公司全称" /></div>
        )}
        <div className="mi-row"><span className="lb">出行日期</span>
          <input type="date" value={f.goDate} onChange={e => set('goDate', e.target.value)} /></div>
        <div className="mi-row"><span className="lb">目的地<b>*</b></span>
          <select value={f.dest} onChange={e => set('dest', e.target.value)}
            style={{ flex: 1, border: 0, outline: 0, background: 'transparent', fontSize: 14, color: f.dest ? 'var(--ink)' : '#c2c7c4' }}>
            <option value="">请选择目的国家、城市</option>
            {(data.dests || []).map(d => <option key={d.key} value={d.name}>{d.name}</option>)}
          </select></div>
        <div className="mi-row"><span className="lb">出行天数</span>
          <input value={f.days} onChange={e => set('days', e.target.value)} placeholder="请输入出行天数" inputMode="numeric" /></div>
        <div className="mi-row"><span className="lb">出行人数</span>
          <input value={f.pax} onChange={e => set('pax', e.target.value)}
            placeholder={f.kind === 'org' ? '请输入参加人数' : '请输入出行人数'} inputMode="numeric" /></div>
        <div className="mi-row"><span className="lb">出行预算<b>*</b></span>
          <input value={f.budget} onChange={e => set('budget', e.target.value)}
            placeholder={f.kind === 'org' ? '请输入人均预算（元）' : '请输入出行预算（元）'} inputMode="numeric" /></div>
        <div className="mi-row"><span className="lb">联系人<b>*</b></span>
          <input value={f.customer} onChange={e => set('customer', e.target.value)}
            placeholder={f.kind === 'org' ? '对接人称呼' : '您的称呼'} /></div>
        <div className="mi-row"><span className="lb">联系电话<b>*</b></span>
          <input value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="请输入手机号" inputMode="tel" /></div>
        <div className="mi-row" style={{ alignItems: 'flex-start' }}><span className="lb" style={{ paddingTop: 2 }}>其他需求</span>
          <textarea value={f.note} onChange={e => set('note', e.target.value)} rows={2}
            placeholder={f.kind === 'org'
              ? '如会议场地、颁奖晚宴、团队活动、开票要求等，可在此说明'
              : '如老人同行、饮食忌口、指定酒店类型等，可在此说明，方案中会一并考虑'}
            style={{ resize: 'none', lineHeight: 1.6 }} /></div>
      </div>
      <div style={{ padding: '14px 24px 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.7 }}>
        *需求提交成功后，我们将在 1 个工作日内与您联系。请您留意来电号码保持手机畅通。
      </div>
      <div style={{ height: 20 }} />
      <div className="mi-submit" style={{ position: 'sticky', bottom: 0 }}>
        <button onClick={submit} disabled={busy || !ok}>{busy ? '提交中…' : '提交定制需求'}</button>
      </div>
    </div>
  </div>);
}

/* ============ 登录（一键授权 / 手机号） ============ */
function LoginPage({ onClose, onDone, hero, heroVideo }) {
  const toast = useToast();
  const [mode, setMode] = useState('wechat');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [doc, setDoc] = useState(null);
  const send = () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) return toast('请输入正确的手机号');
    setSent(60); toast('验证码已发送，演示环境可输入任意 4 位');
    const t = setInterval(() => setSent(s => { if (s <= 1) { clearInterval(t); return 0; } return s - 1; }), 1000);
  };
  const login = async (m) => {
    if (m === 'phone') {
      if (!/^1[3-9]\d{9}$/.test(phone)) return toast('请输入正确的手机号');
      if (code.length !== 4) return toast('请输入 4 位验证码');
    }
    setBusy(true);
    try {
      /* demo 标记只给微信一键登录——它是演示入口。
         手机号登录不带：原先两个入口都带，于是任何真实客人第一次登录，
         都会被灌进三段假旅程和一张四万多的假订单。
         演示号固定成一个（原来用 Date.now() 造随机号），否则每次点一键登录
         都是个新客人、都要补一遍演示数据，库里很快堆满「微信用户」的假单。 */
      const body = m === 'wechat'
        ? { mode: 'wechat', phone: '13900001234', nick: '微信用户', demo: 1 }
        : { mode: 'phone', phone, code };
      const r = await post('/api/mini/login', body);
      onDone(r.guest);
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="lgp">
      <div className="bg">
        {heroVideo
          ? <video src={heroVideo} poster={hero} autoPlay muted loop playsInline />
          : (hero && <img className="ken" src={oimg(hero, 1200)} alt="" />)}
      </div>
      <div className="top"><div className="x" onClick={onClose}><Icon n="x" s={15} c="#fff" /></div></div>
      <div className="mid">
        <div className="rule" />
        <div className="en">U-DESIGN</div>
        <h1>您的旅行<br />由您定义</h1>
        <p>登录后可收藏灵感、查看定制进度<br />并同步你的会员等级与权益</p>
      </div>
      <div className="btm">
        {mode === 'wechat' ? (<>
          <button className="lgp-btn gold" disabled={busy} onClick={() => login('wechat')}>
            <Icon n="user" s={17} c="#fff" />微信一键授权登录</button>
          <button className="lgp-btn ghost" onClick={() => setMode('phone')}>使用其他手机号登录</button>
        </>) : (<>
          <div className="lgp-f"><input value={phone} onChange={e => setPhone(e.target.value)}
            placeholder="请输入手机号" inputMode="tel" maxLength={11} /></div>
          <div className="lgp-f lgp-code">
            <input value={code} onChange={e => setCode(e.target.value)} placeholder="4 位验证码" inputMode="numeric" maxLength={4} />
            <button onClick={send} disabled={sent > 0}>{sent > 0 ? sent + ' s' : '获取验证码'}</button>
          </div>
          <button className="lgp-btn gold" disabled={busy} onClick={() => login('phone')}>登录 / 注册</button>
          <div className="alt" onClick={() => setMode('wechat')}>返回微信一键登录</div>
        </>)}
        <div className="tip">登录即表示同意
          <a onClick={() => setDoc('user')} style={{ color: 'var(--gold)', cursor: 'pointer' }}>《用户协议》</a>与
          <a onClick={() => setDoc('privacy')} style={{ color: 'var(--gold)', cursor: 'pointer' }}>《隐私政策》</a>
          <br />演示环境 · 验证码任意 4 位即可通过</div>
      </div>
      {/* 登录页是全屏覆盖层，条款不能跳页（跳走登录态就断了），就地开一层可滚动的正文 */}
      {doc && <div className="lgp-doc" onClick={e => e.target === e.currentTarget && setDoc(null)}>
        <div className="bd">
          <div className="hd"><b>{(POLICY_DOCS.find(d => d.k === doc) || {}).t}</b>
            <div className="x" onClick={() => setDoc(null)}><Icon n="x" s={14} /></div></div>
          <div className="sc"><div className="doc">
            {((POLICY_DOCS.find(d => d.k === doc) || {}).body || []).map(([h, t]) =>
              <React.Fragment key={h}><h4>{h}</h4>{t}</React.Fragment>)}
          </div></div>
        </div>
      </div>}
    </div>
  );
}

/* 会员形象与标语：定制旅游卖的是「这一程只为你」，
   所以「我的」首屏不摆功能入口，先摆一个属于这个人的身份场景。
   形象图是抠好背景的 webp，随前端一起发（60 KB），不走素材库；
   等级不同标语不同——黑卡看到的那句不该和刚注册的人一样。 */
const MEMBER_FIG = (import.meta.env.BASE_URL || '/') + 'brand/member-fig.webp';
const LV_SLOGAN = {
  base: '世界很大，先从一次出发开始',
  silver: '你值得一程更从容的旅途',
  gold: '每一程，都只为你一人而设',
  platinum: '世界为你让路',
};
const ANON_SLOGAN = '独一无二的行程，配得上独一无二的你';

/* ============ 我的 · 旅行档案 ============ */
/* 不做「头像 + 数字方块 + 功能长列表」那套个人中心：那是把人当成一个账号。
   这里呈现的是这个人的旅程——封面用他最近一段旅程的目的地图，
   主体是一本按时间排的旅程册，功能入口压到最底下。 */

/* 旅程册里一段旅程的进度：已成行 / 在办 / 已结束，用实心度表示，不用彩色胶囊 */
/* 咨询单在客人端的说法。成交之后不再说咨询单状态，改为指向订单，
   否则同一段行程在「咨询」和「订单」两处各显示一个状态，客人不知道该信哪个。 */
const JN_STATE = {
  pending: ['已收到需求', 'wait'], taken: ['需求已受理', 'doing'],
  following: ['方案设计中', 'doing'], quoting: ['方案报价中', 'wait'],
  won: ['已生成订单', 'done'], lost: ['已结束', 'stop'],
};
const OD_CLS = { created: 'wait', deposit: 'wait', paid: 'doing', done: 'done',
  cancelled: 'stop', refunded: 'stop' };

/* 订单与咨询单行的缩略图：按目的地名到首页配置的 destCover 里取。
   接口里订单与咨询单都没有图字段，用目的地图最省事也最不会错配。 */
function usePic() {
  const { d } = useData(() => get('/api/mini/home'), [], {});
  const map = (d && d.destCover) || {};
  return dest => {
    if (!dest) return null;
    const k = Object.keys(map).find(x => String(dest).includes(x));
    return k ? map[k] : null;
  };
}

function Me({ go, guest, onLogin, onLogout }) {
  const picOf = usePic();
  const { d, loading, reload } = useData(
    () => get('/api/mini/me' + (guest ? '?phone=' + guest.phone : '')), [guest && guest.phone]);
  const { d: orders } = useData(
    () => guest ? get('/api/mini/orders?phone=' + guest.phone) : Promise.resolve([]),
    [guest && guest.phone], []);
  const g = d && d.guest;
  const consults = (d && d.consults) || [];
  const ods = orders || [];
  /* 后台把咨询单与订单分成两套单据，客人端也分两块看。
     成交后的咨询单只留一个指向订单的入口，不再重复报状态。 */
  const openC = consults.filter(c => c.status !== 'won');
  /* 「我的」首屏只摆一张在办的单：订单取最近一张未结束的，没有在办的就取最近一张；
     咨询单同理。想看全部走「全部订单 ›」「全部 ›」。 */
  const odOne = [...(ods.filter(o => !o.closed).length ? ods.filter(o => !o.closed) : ods)]
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, 1);
  const csOne = [...(openC.length ? openC : consults)].slice(0, 1);
  const csPending = (d && d.consultPending) || 0;   // 顾问还没确认推送的需求条数
  const favN = (d && d.stats) ? d.stats.fav : 0;
  const cnt = k => ods.filter(o => o.status === k).length;
  const payN = ods.filter(o => ['created', 'deposit'].includes(o.status)).length;

  /* 未登录态与登录后必须是同一套版面：同样的顶栏、订单四宫格、咨询块、功能列表，
     只是数据为空、任何操作先拉起登录。原先未登录只给三条文字说明，
     客人登录前后看到的是完全两个页面。 */
  const anon = !guest;
  const nav = k => anon ? onLogin() : go(k);
  /* 顶栏换成每日一句：按当天日期从文案库里取一条，同一天进来看到的是同一句。
     业务要的是「积极但让人放松」，所以不写口号，写的是想出门那一刻的念头。
     出发在即或正在旅途时，让位给更要紧的那句提醒。 */
  const hl = (d && d.headline) || { kind: 'none', text: '' };
  const daily = useMemo(() => {
    const t = new Date();
    const n = Math.floor((t - new Date(t.getFullYear(), 0, 0)) / 86400000);
    return DAILY_LINES[n % DAILY_LINES.length];
  }, []);
  const urgent = hl.kind === 'going' || (hl.kind === 'soon' && (hl.days == null || hl.days <= 30));
  const { d: mem } = useData(
    () => get('/api/mini/member' + (guest ? '?phone=' + guest.phone : '')), [guest && guest.phone], null);

  const lv = (mem && mem.level) || null;
  const lvCode = (lv && lv.code) || 'base';
  const days = g && g.created_at
    ? Math.max(1, Math.round((Date.now() - new Date(String(g.created_at).replace(' ', 'T')).getTime()) / 864e5))
    : 0;
  const pct = mem && mem.next
    ? Math.min(100, Math.round(((mem.year_amount || 0) / Math.max(1, mem.next.min_amount)) * 100)) : 100;

  return (<div className="mi-me">
    {/* 会员形象区：上半区是这个人（称呼 / 同行天数 / 标语 + 会员形象），
        下半区仍是一张完整的会员卡 —— 等级、卡号、消费、进度都收在卡里。
        之前把这些字段直接摊在背景上，看着散，卡的仪式感也丢了。 */}
    <div className={'nm-hero lv-' + lvCode + (anon ? ' anon' : '')}
      style={{ '--mc': (lv && lv.color) || '#8a7c6a' }}>
      <span className="glow" />
      <div className="up">
        {MEMBER_FIG && <img className="fig" src={MEMBER_FIG} alt="" />}
        <div className="bd">
          <div className="hi">Hi，<b>{anon ? '旅行者' : ((g && g.nick) || '旅行者')}</b></div>
          <p className="who">{anon ? '登录后开启属于你的定制旅程'
            : [g ? g.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '',
               days ? `已一同走过 ${days} 天` : ''].filter(Boolean).join(' · ')}</p>
          <div className="slogan">{anon ? ANON_SLOGAN : (LV_SLOGAN[lvCode] || LV_SLOGAN.base)}</div>
          {/* 每日一句 / 出行提醒原来吊在会员卡下面，上半区反而空着一大块；
              挪到标语下方，既填了空白，读起来也是同一段话的延续 */}
          {!anon && (
            <div className={'nm-hl' + (urgent ? ' hot' : '')}>
              {hl.kind === 'soon' && hl.days != null && hl.days <= 30 && (
                <span className="cd"><b>{hl.days}</b><i>天后</i></span>
              )}
              {hl.kind === 'going' && <span className="dot" />}
              <span className="tx">{urgent ? hl.text : daily}</span>
            </div>)}
        </div>
      </div>

      {/* 会员卡：等级色走卡面，英文码压成水印，右上一枚印章 */}
      <div className="nm-card" onClick={() => anon ? onLogin() : go('member')}>
        <span className="wm">{(lv && lv.code) || 'MEMBER'}</span>
        <div className="seal"><i>{anon ? '优' : (((lv && lv.name) || '旅')[0])}</i></div>
        {/* 「当前等级」原来是浮在右上角的一枚标签，人物一往右站就被挡住；
            并进卡里更合理——它本来说的就是这张卡 */}
        <div className="c-st">{anon ? '登录后自动定级' : '当前等级'}</div>
        <div className="c-t">
          <b>{anon ? '会员等级' : ((lv && lv.name) || '旅行会员')}</b>
          {!anon && <span className="no">NO. {(mem && mem.member_no) || '—'}</span>}
        </div>
        {anon ? (
          <p className="c-an">登录后按年度消费自动定级<br />专属服务通道、优先排期、机场接送等权益逐级解锁</p>
        ) : (<>
          <div className="c-a">{money0(mem ? mem.year_amount : 0)}<em>本年度消费</em></div>
          <div className="c-b"><i style={{ width: pct + '%' }} /></div>
          <p className="c-g">{mem && mem.next
            ? <>再消费 <b>{money0(mem.gap)}</b> 升至 <b>{mem.next.name}</b></>
            : '已是最高等级'}</p>
        </>)}
        <span className="c-go">{anon ? '看看权益' : '会员中心'} ›</span>
      </div>

    </div>

    {/* ① 订单线 */}
    <div className="nm-blk" style={{ marginTop: 14 }}>
      <div className="hd"><b>我的订单</b>
        <span onClick={() => nav('myorders')}>全部订单 ›</span></div>
      <div className="nm-ord">
        <div onClick={() => nav('myorders')}>
          <div className="ic"><Icon n="clock" s={24} c="var(--nh-gold)" sw={1.3} /></div><b>待支付</b>
          {payN > 0 && <span className="dot">{payN}</span>}</div>
        <div onClick={() => nav('myorders')}>
          <div className="ic"><Icon n="ticket" s={24} c="var(--nh-gold)" sw={1.3} /></div><b>待出行</b></div>
        <div onClick={() => nav('myorders')}>
          <div className="ic"><Icon n="map" s={24} c="var(--nh-gold)" sw={1.3} /></div><b>行程中</b></div>
        <div onClick={() => nav('myorders')}>
          <div className="ic"><Icon n="check" s={24} c="var(--nh-gold)" sw={1.3} /></div><b>已完成</b>
          {cnt('done') > 0 && null}</div>
      </div>
      {odOne.map(o => (
        <div className="nm-row" key={o.no} onClick={() => go('orderDetail', o.no)}>
          <div className="ph">{picOf(o.dest) && <img src={oimg(picOf(o.dest))} alt="" />}</div>
          <div className="t"><b>{o.dest} · {o.days} 天</b>
            <i>{o.no} · {o.owe > 0 ? '待付 ' + money0(o.owe) : money0(o.amount)}</i></div>
          <span className={'st ' + (OD_CLS[o.status] || 'wait')}>
            {o.closed ? o.status_cn : (o.stage_cn || o.status_cn)}</span>
        </div>
      ))}
      {!ods.length && <div className="nm-empty">{anon ? '登录后这里显示你的订单与付款进度' : '还没有订单，行程确认后会在这里出现'}</div>}
    </div>

    {/* ② 咨询单线 */}
    <div className="nm-blk">
      <div className="hd"><b>我的定制咨询</b>
        <span onClick={() => nav('myconsults')}>{openC.length ? openC.length + ' 单在办 ›' : '全部 ›'}</span></div>
      {/* 顾问还没确认推送的需求：不摆单据内容，只给一条「收到了、在处理」的回执 */}
      {!!csPending && (
        <div className="cs-pending sm" onClick={() => nav('myconsults')}>
          <span className="dot" />
          <div className="tx"><b>{csPending} 条需求已收到</b>
            <i>顾问正在核对，确认后会推送给您</i></div>
        </div>)}
      {csOne.map(c => {
        const [cn, cls] = JN_STATE[c.status] || [c.st_cn, 'wait'];
        return (
          <div className="nm-row" key={c.no}
            onClick={() => go('consultDetail', c.no)}>
            <div className="ph">{picOf(c.dest) && <img src={oimg(picOf(c.dest))} alt="" />}</div>
            <div className="t"><b>{c.dest} · {c.days} 天</b>
              <i>{c.no} · 提交于 {String(c.created_at || '').slice(5, 10)}</i></div>
            <span className={'st ' + cls}>{cn}</span>
          </div>
        );
      })}
      {!consults.length && !csPending && <div className="nm-empty">{anon ? '登录后这里显示你提交过的定制需求' : '还没有定制需求'}
        <div><button onClick={() => anon ? onLogin() : go('form')}>说说想去哪</button></div></div>}
    </div>

    <div className="nm-blk nm-list">
      <div className="r" onClick={() => nav('profile')}><b>个人资料</b><div className="ar" /></div>
      <div className="r" onClick={() => nav('travelers')}><b>常用旅客</b><div className="ar" /></div>

      <div className="r" onClick={() => nav('favs')}><b>我的收藏</b>
        {favN ? <i>{favN} 个</i> : null}<div className="ar" /></div>
      <div className="r" onClick={() => go('member')}><b>会员中心</b>
        {mem && mem.level ? <i>{mem.level.name}</i> : null}<div className="ar" /></div>
      <div className="r" onClick={() => nav('stories')}><b>旅途故事</b>
        <i>照片视频存成故事</i><div className="ar" /></div>
      {/* 隐私与协议不需要登录也能看 */}
      <div className="r" onClick={() => go('policy')}><b>隐私与协议</b><div className="ar" /></div>
    </div>

    {!anon && <div className="nm-out" onClick={() => { onLogout(); reload(); }}>退出登录</div>}
  </div>);
}

/* 等级徽章里那个字：取等级名第一个字，没有就用「优」 */
/* ============ 众信定制旅游介绍 ============
   首页底部那块品牌故事点进来的落地页。业务要的是把「众信的定制旅游到底是什么」
   讲清楚：我们是谁、和普通跟团/自由行差在哪、一条线怎么做出来、服务包含什么。 */
const ABOUT_NUM = [['34', '年', '专做出境旅行'], ['40', '+ 国', '自有地接网络'],
  ['1', '位对接人', '全程不转手'], ['0', '购物店', '不推自费']];
const ABOUT_DIFF = [
  ['跟团游', '固定出发日、固定路线，二三十人同行，购物与自费项目常见'],
  ['自由行', '只给机票酒店，落地之后所有麻烦自己扛，出状况没人兜'],
  ['优定制', '按你的人、你的日子排一条线，用车酒店领队全程自有资源，出事有人管'],
];
const ABOUT_FLOW = [
  ['1', '说想法', '目的地、大概日子、几个人、预算量级，说个方向就行'],
  ['2', '出方案', '1 个工作日给到含真实资源与报价的行程，不满意改到满意'],
  ['3', '定细节', '酒店房型、用车车型、餐食与特殊需求逐项确认，签合同'],
  ['4', '出发前', '行前说明、证件核对、集合信息一次说清'],
  ['5', '行程中', '境外 24 小时应急通道，领队与地陪在地服务'],
  ['6', '回来后', '行程回访与资料归档，下次定制直接调用你的偏好'],
];
const ABOUT_INC = [
  ['bed', '住宿', '4–5 星或特色精品，房型按人数与偏好定'],
  ['car', '用车', '当地自有车队，含接送机与全程用车'],
  ['users', '服务', '中文领队 / 当地地陪，按目的地配置'],
  ['ticket', '门票', '行程内景点门票与预约'],
  ['dish', '餐食', '特色餐与团队餐，忌口提前报备'],
  ['shield', '保障', '境外旅行意外险与 24 小时应急'],
];

function About({ back, go, data }) {
  const story = data.story || {};
  const hero = (data.splash || {}).img || ((data.banners || [])[0] || {}).img;
  return (<SubPage title="定制旅游" onBack={() => back('home')}>
    <div className="ab-hero">
      {hero && <img src={oimg(hero, 1200)} alt="" />}
      <div className="c">
        <i>Since 1992</i>
        <h1>一次只做<br />一个人的行程</h1>
        <p>众信旅游 · 优定制</p>
      </div>
    </div>

    <div className="ab-num">
      {ABOUT_NUM.map(([n, u, t]) => (
        <div key={t}><b>{n}<em>{u}</em></b><i>{t}</i></div>
      ))}
    </div>

    <div className="ab-sec">
      <div className="h"><i>Who we are</i><b>我们是谁</b></div>
      <p>优定制是众信旅游旗下的定制旅游品牌。众信旅游 1992 年开始做出境游，
        在 40 余个国家有自己的地接网络 —— 也就是说，落地之后接你的车、带你的人、
        订的酒店，都是我们自己签的资源，不是层层转手的散单。</p>
      <p>{story.p || ''}</p>
    </div>

    <div className="ab-sec">
      <div className="h"><i>What's different</i><b>和跟团、自由行差在哪</b></div>
      <div className="ab-diff">
        {ABOUT_DIFF.map(([k, v], i) => (
          <div key={k} className={i === 2 ? 'on' : ''}>
            <b>{k}</b><p>{v}</p>
          </div>
        ))}
      </div>
    </div>

    <div className="ab-sec">
      <div className="h"><i>How it works</i><b>一条线是怎么做出来的</b></div>
      <div className="ab-flow">
        {ABOUT_FLOW.map(([n, t, d]) => (
          <div key={n}><span>{n}</span><div className="tx"><b>{t}</b><p>{d}</p></div></div>
        ))}
      </div>
    </div>

    <div className="ab-sec">
      <div className="h"><i>What's included</i><b>一条定制线里包含什么</b></div>
      <div className="ab-inc">
        {ABOUT_INC.map(([ic, t, d]) => (
          <div key={t}><Icon n={ic} s={16} c="var(--gold)" />
            <b>{t}</b><p>{d}</p></div>
        ))}
      </div>
      <div className="ab-note">以上为常规定制线的构成，具体以报价单中列明的项目为准。
        签证代办、单房差与行程外自选项目按实际情况单独计费。</div>
    </div>

    <div className="ab-cta">
      <b>想好去哪了？</b>
      <i>提交需求，1 个工作日内给到含真实资源与报价的方案</i>
      <div className="bs">
        <button className="btn btn-o" onClick={() => go('ai')}>先让 AI 排一版</button>
        <button className="btn btn-p" onClick={() => go('form')}>提交定制需求</button>
      </div>
    </div>

    <div className="ab-foot">众信旅游集团 · 旅行社业务经营许可证 L-BJ-CJ00001</div>
  </SubPage>);
}

/* ============ 我的收藏 ============
   单排大卡。收藏通常就几条，分成双列或加页签都撑不起版面，
   不如一条一张大图，类型用角标区分就够了。 */
const FAV_KIND = { article: '攻略', product: '行程', dest: '目的地' };

function Favs({ go, back, guest }) {
  const toast = useToast();
  const { d, loading, reload } = useData(
    () => guest ? get('/api/mini/me?phone=' + guest.phone) : Promise.resolve({ favs: [] }),
    [guest && guest.phone], {});
  const list = (d && d.favs) || [];
  const open = f => {
    if (f.kind === 'article') return go('article', f.ref);
    if (f.kind === 'product') return go('product', f.ref);
    return go('destDetail', f.ref);
  };
  const drop = async (e, f) => {
    e.stopPropagation();
    if (!confirm(`取消收藏「${f.title}」？`)) return;
    await post('/api/mini/fav', { phone: guest.phone, kind: f.kind, ref: f.ref });
    reload(); toast('已取消收藏');
  };

  return (<SubPage title="我的收藏" onBack={() => back('me')}>
    {loading ? <div className="empty">载入中…</div>
      : list.length ? list.map((f, i) => (
        <div className="fv-c" key={f.kind + f.ref + i} onClick={() => open(f)}>
          <div className="ph">
            {f.img ? <img src={oimg(f.img)} alt="" loading="lazy" />
              : <span className="no"><Icon n="pin" s={26} c="var(--muted-2)" /></span>}
            <span className="k">{FAV_KIND[f.kind] || '收藏'}</span>
            <span className="x" onClick={e => drop(e, f)}>
              <Icon n="heart" s={15} c="#fff" /></span>
          </div>
          <div className="bd">
            <b>{f.title}</b>
            <i>{f.sub}</i>
            <div className="ft">
              {f.price ? <span className="p">{money0(f.price)}<em>起</em></span>
                : <span className="p mu">已收藏</span>}
              <span className="go">{f.kind === 'article' ? '去阅读' : '看详情'} ›</span>
            </div>
          </div>
        </div>
      )) : <div className="empty" style={{ padding: '46px 0' }}>
          还没有收藏<br />在行程、攻略或目的地页点收藏，会出现在这里</div>}
  </SubPage>);
}

/* ============ 在线客服 ============
   业务反馈：在线咨询点了直接跳需求表单，不是咨询。这里做成真的会话 ——
   消息落服务端（session_key = guest:<手机号>），常见问题给确定答案，
   覆盖不到的转人工。不接大模型：客服场景答错一句比慢一分钟严重。 */
const CS_QUICK = ['报价包含哪些项目', '签证需要什么材料', '带孩子出行怎么安排', '怎么开发票'];

function CustomerService({ back, guest, onLogin, preset }) {
  const [list, setList] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const boxRef = useRef();
  const phone = guest ? guest.phone : '';
  useEffect(() => {
    if (!phone) return;
    get('/api/mini/cs?phone=' + phone).then(r => setList(r.list || [])).catch(() => {});
  }, [phone]);
  useEffect(() => {
    const el = boxRef.current; if (el) el.scrollTop = el.scrollHeight;
  }, [list.length]);
  const send = async (t) => {
    const v = String(t == null ? text : t).trim();
    if (!v || busy) return;
    setBusy(true); setText('');
    try {
      const r = await post('/api/mini/cs', { phone, text: v });
      setList(r.list || []);
    } finally { setBusy(false); }
  };
  /* 未登录也把输入框摆出来：先让人能打字、能看到常见问题，
     真按发送时再拉登录。原来直接换成一张登录卡，客人进来只看到一句「登录后可与客服对话」，
     会以为这个功能是坏的。 */
  if (!phone) return (<SubPage title="在线客服" onBack={() => back('home')}>
    <div className="cs-chat">
      <div className="m cs"><span className="av"><Icon n="chat" s={13} c="#fff" /></span>
        <div className="bb">您好，我是您的定制顾问李晴。<br />想去哪儿、几个人、什么时候走，随时问我。</div></div>
      <div className="cs-tipbox">登录后聊天记录会保留，顾问也能看到您之前问过什么</div>
    </div>
    <div className="cs-quick">
      {CS_QUICK.map(q => <span key={q} onClick={onLogin}>{q}</span>)}
    </div>
    <div className="cs-input">
      <input value={text} onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onLogin()}
        placeholder="说说您想问的，例如报价、签证、行程节奏" />
      <button onClick={onLogin}>发送</button>
    </div>
  </SubPage>);

  return (<SubPage title="在线客服" onBack={() => back('home')}>
    <div className="cs-chat" ref={boxRef}>
      {preset && <div className="tip">正在咨询单 {preset} 的问题</div>}
      {list.map(m => (
        <div key={m.id} className={'m ' + (m.role === 'guest' ? 'me' : 'cs')}>
          {m.role !== 'guest' && <span className="av"><Icon n="chat" s={13} c="#fff" /></span>}
          <div className="bb">{m.text}
            <s>{String(m.created_at || '').slice(11, 16)}</s></div>
        </div>
      ))}
      {busy && <div className="m cs"><span className="av"><Icon n="chat" s={13} c="#fff" /></span>
        <div className="bb typing"><i /><i /><i /></div></div>}
    </div>
    <div className="cs-quick">
      {CS_QUICK.map(q => <span key={q} onClick={() => send(q)}>{q}</span>)}
    </div>
    <div className="cs-input">
      <input value={text} onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && send()}
        placeholder="说说您想问的，例如报价、签证、行程节奏" />
      <button disabled={!text.trim() || busy} onClick={() => send()}>发送</button>
    </div>
  </SubPage>);
}

/* ============ 定制咨询单详情 ============
   咨询单和订单是两套单据，后台本来就分开，客人端也得分开：
   这里看「需求怎么提的、方案排到第几版、走到哪一步」，钱和履约在订单详情里。 */
const PREF_CN = { nature: '自然风光', food: '美食探店', culture: '人文古迹', family: '亲子旅行',
  honeymoon: '蜜月浪漫', photo: '摄影出片', luxury: '高端奢享', niche: '小众秘境', leisure: '休闲度假' };

function ConsultDetail({ go, back, no, guest }) {
  const { d, loading } = useData(
    () => get('/api/mini/consults/' + no + (guest ? '?phone=' + guest.phone : '')), [no]);
  if (loading || !d) return <SubPage title="咨询单详情" onBack={() => back('me')}><div className="empty">载入中…</div></SubPage>;
  if (d.err) return <SubPage title="咨询单详情" onBack={() => back('me')}><div className="empty">{d.err}</div></SubPage>;
  const pax = (d.adults || 0) + (d.children || 0) + (d.elders || 0);

  return (<SubPage title="咨询单详情" onBack={() => back('me')}>
    <div className="cs-card">
      <div className="hd"><span className="no">{d.no}</span>
        <span className={'st ' + (JN_STATE[d.status] ? JN_STATE[d.status][1] : 'wait')}>{d.st_cn}</span></div>
      <h4>{d.dest} · {d.days} 天</h4>
      <div className="sub">{d.go_date ? d.go_date + ' 出发' : '日期待定'} · {pax || '—'} 人
        {d.kind === 'org' ? ' · 企业定制' : ''}</div>
      <div className="steps">
        {(d.steps || []).map(st => (
          <div key={st.k} className={st.done ? 'on' : ''}><i />{st.t}</div>
        ))}
      </div>
    </div>

    <div className="mi-odsec"><i />需求明细</div>
    <div className="cs-kv">
      <div><span>出发城市</span><b>{d.from_city || '—'}</b></div>
      <div><span>目的地</span><b>{d.dest}{d.region ? ' · ' + d.region : ''}</b></div>
      <div><span>出行日期</span><b>{d.go_date || '待定'}</b></div>
      <div><span>行程天数</span><b>{d.days} 天</b></div>
      <div><span>出行人数</span><b>{d.adults || 0} 成人
        {d.children ? ' · ' + d.children + ' 儿童' : ''}{d.elders ? ' · ' + d.elders + ' 长者' : ''}</b></div>
      <div><span>预算</span><b>{d.budget ? money0(d.budget) + ' 元' : '未填'}</b></div>
      {d.kind === 'org' && <div><span>公司名称</span><b>{d.org || '—'}</b></div>}
      {!!(d.prefs || []).length && <div className="w"><span>旅行偏好</span>
        <b>{d.prefs.map(x => PREF_CN[x] || x).join('、')}</b></div>}
      {d.must_see && <div className="w"><span>必访景点</span><b>{d.must_see}</b></div>}
      {d.remark && <div className="w"><span>补充说明</span><b>{d.remark}</b></div>}
    </div>

    {d.plan && <>
      <div className="mi-odsec"><i />行程方案</div>
      <div className="cs-plan" onClick={() => d.share_token && go('trip', d.share_token)}>
        <img src={oimg(d.plan.cover)} alt="" />
        <div className="t">
          <b>{d.plan.route}</b>
          <i>第 {d.plan.ver} 版 · {d.plan.days} 天 · 共 {d.plan_count} 版
            {d.plan_ok ? ' · 已确认' : ''}</i>
          {d.share_token && <span className="go">查看完整行程 ›</span>}
        </div>
      </div>
    </>}

    {d.order_no && <>
      <div className="mi-odsec"><i />关联订单</div>
      <div className="od-link" onClick={() => go('orderDetail', d.order_no)}>
        <div className="l"><b>{d.order_no}</b>
          <div className="m">这张需求单已成交并生成订单</div></div>
        <span className="st">查看订单 ›</span>
      </div>
    </>}

    {/* 处理进度改时间轴：这几条本来就是按时间发生的，
        竖轴 + 节点比一堆并排的卡片更能看出先后关系。最新一条在最上面并标出来。 */}
    <div className="mi-odsec"><i />处理进度</div>
    {(d.logs || []).length ? (
      <div className="cs-tl">
        {d.logs.map((l, i) => (
          <div className={'it' + (i === 0 ? ' now' : '')} key={i}>
            <span className="dot" />
            <div className="bd">
              <div className="t"><b>{l.act}</b>{i === 0 && <em>最新</em>}</div>
              {l.detail && <p>{l.detail}</p>}
              <s>{l.who} · {String(l.created_at || '').slice(0, 16)}</s>
            </div>
          </div>
        ))}
      </div>
    ) : <div className="cs-logs"><div className="empty" style={{ padding: '18px 0' }}>暂无处理记录</div></div>}

    {!d.order_no && (
      <div className="cs-bar">
        <button className="btn btn-o" onClick={() => go('form')}>再提一单</button>
        <button className="btn btn-p" onClick={() => go('chat', d.no)}>联系客服</button>
      </div>
    )}
  </SubPage>);
}

/* ============ 会员中心 ============
   等级来自后台的「会员体系」，门槛与权益都在那边配，这里只负责展示。
   未登录也能进：先把等级阶梯和权益摆出来，再引导登录。 */
/* ============ 会员中心 ============
   业务要的是「高奢沉浸式、让客人觉得值得」。全站是米白暖色，唯独这一页走深色 ——
   会员是尊享场景，深底 + 香槟金比米白更能撑住仪式感，也和首页拉开层次。
   结构：等级卡面 → 进阶轨道 → 等级横滑 → 权益宫格 → 升级路径。 */
const BEN_ICON = { advisor: 'chat', preplan: 'calendar', priority: 'clock', feeoff: 'tag',
  pickup: 'car', sos: 'shield', upgrade: 'bed', birthday: 'heart', invite: 'star' };

function MemberCenter({ back, guest, onLogin }) {
  const { d, loading } = useData(
    () => get('/api/mini/member' + (guest ? '?phone=' + guest.phone : '')), [guest && guest.phone], null);
  const [pick, setPick] = useState(null);
  if (loading || !d) return <div className="empty" style={{ paddingTop: 140 }}>载入中…</div>;
  const anon = !guest || !d.level;
  const ls = d.all_levels || [];
  const curId = d.level && d.level.id;
  const curIdx = Math.max(0, ls.findIndex(l => l.id === curId));
  const viewIdx = pick == null ? curIdx : pick;
  const view = ls[viewIdx] || ls[0] || {};
  const reached = (d.year_amount || 0) >= (view.min_amount || 0);
  const gapTo = Math.max(0, (view.min_amount || 0) - (d.year_amount || 0));
  const pct = d.next ? Math.min(100, Math.round(((d.year_amount || 0) / Math.max(1, d.next.min_amount)) * 100)) : 100;

  return (<div className="mb-wrap">
    <div className="mb-bg"><i /><i /><i /></div>
    <div className="mb-nav">
      <div className="bk" onClick={() => back('me')}><Icon n="back" s={15} c="#e8dcc4" /></div>
      <b>会员中心</b>
    </div>

    {/* 等级切换放在卡面上方：客人一进来先看清自己在哪一档、下一档叫什么，
        再往下看卡面和权益。原来切换在卡面下方，重点被埋掉了。 */}
    <div className="mbc-tabs">
      {ls.map((l, i) => (
        <button key={l.id} className={(i === viewIdx ? 'on' : '') + (i <= curIdx && !anon ? ' got' : '')}
          onClick={() => setPick(i)}>
          <b>{l.name.replace('会员', '')}{!anon && i === curIdx && <em>当前</em>}</b>
          <u>{l.min_amount ? (l.min_amount / 10000) + ' 万' : '注册即享'}</u>
        </button>
      ))}
    </div>

    {/* 卡面：等级 + 年度消费 + 会员号 */}
    <div className={'mb-hero' + (reached && !anon ? ' got' : '')} style={{ '--mc': (view.color || '#a8803f') }}>
      <span className="wm">{view.code || 'MEMBER'}</span>
      <span className="ring" />
      <div className="crest"><i>{(view.name || '优')[0]}</i></div>
      <div className="st">{anon ? '登录后自动定级' : reached ? '已解锁' : '未解锁'}</div>
      <div className="lv">{anon ? '会员等级' : view.name}</div>
      <div className="sub">{anon ? '按本年度订单实收金额自动判定'
        : viewIdx < curIdx ? '你已超越该等级'
        : viewIdx === curIdx ? '你的当前等级'
        : '还差 ' + money0(gapTo) + ' 升到这一档'}</div>
      <div className="no">{anon ? '' : 'NO. ' + (d.member_no || '')}</div>
      {!anon && (<>
        <div className="amt">{money0(d.year_amount)}<em>本年度消费</em></div>
        <div className="bar"><i style={{ width: pct + '%' }} /></div>
        <div className="gp">{d.next
          ? <>距 <b>{d.next.name}</b> 还差 {money0(d.gap)}</>
          : <>已是最高等级</>}</div>
      </>)}
    </div>

    {/* 当前查看的这一档：权益宫格 */}
    <div className="mb-panel">
      {/* 解锁状态已经在卡面上说清楚了，这里只标权益项数，不再重复一遍 */}
      <div className="h">
        <b>{view.name}权益</b>
        <span className="ok">{(view.benefits || []).length} 项</span>
      </div>
      <div className="grid">
        {(view.benefits || []).map(b => (
          <div key={b.code} className={reached && !anon ? '' : 'dim'}>
            {/* 图标优先用后台配的，没配才回落到按 code 的老映射 */}
            <span className="ic"><Icon n={b.icon || BEN_ICON[b.code] || 'star'} s={17} c="#d8b97e" /></span>
            <b>{b.name}</b>
            <i>{b.val || '—'}</i>
          </div>
        ))}
        {!(view.benefits || []).length && <div className="none">权益配置中</div>}
      </div>
    </div>

    {anon && (
      <div className="mb-cta" onClick={onLogin}>
        <b>登录查看我的等级</b>
        <i>等级按本年度订单实收金额自动判定，下单即累计</i>
      </div>
    )}

    {!anon && (
      <div className="mb-stat">
        <div><b>{d.order_cnt || 0}</b><i>累计订单</i></div>
        <div><b>{money0(d.total_amount)}</b><i>累计消费</i></div>
        <div><b>{(d.benefits || []).length}</b><i>在享权益</i></div>
      </div>
    )}

    {/* 升级路径：旅游没有签到打卡那套，能提升的只有真实消费与同行人数 */}
    <div className="mb-up">
      <div className="h"><i>How to upgrade</i><b>如何提升等级</b></div>
      {[
        ['提交定制需求并成交', '订单实收金额计入本年度累计', 'form'],
        ['同行亲友一并出行', '同一订单的全额都算在您名下', 'ai'],
        ['参加臻品团', '成型小团同样计入年度消费', 'group'],
      ].map(([t, d2, go2]) => (
        <div className="r" key={t}>
          <div className="tx"><b>{t}</b><p>{d2}</p></div>
          <span className="go">›</span>
        </div>
      ))}
    </div>

    <div className="mb-note">
      等级按自然年内订单的实收金额自动判定，下单后实时更新；<br />
      具体权益以出行前确认为准，最终解释权归众信旅游所有。
    </div>
  </div>);
}

/* ============ 我的 · 子页面 ============ */
/* 订单状态与进度一律由服务端算好给过来，客人端只负责配色。
   原先这里自己维护了一张状态表和一张七步表，两处都和后台对不上：
   「已签约」不在状态表里 → 已付定金的单显示成「待支付」；
   进度用状态名去七步里找位置 → 签约、行前准备、出行三格永远不亮；
   取消与退订找不到位置退回 0 → 已退订的单进度条反而回到「下单」打勾。 */
const OD_PILL = { created: 'p-pending', deposit: 'p-taken', paid: 'p-confirmed',
  done: 'p-won', refunded: 'p-lost', cancelled: 'p-lost' };
const pill = o => OD_PILL[o.status] || 'p-pending';

function SubPage({ title, onBack, children, bottom }) {
  /* bottom：页面底部有吸底操作条时，正文要多留出那条的高度，不然最后一块被压住 */
  return (<div className={'sub-pg' + (bottom ? ' has-bar' : '')}>
    <div className="sub-hd"><div className="bk" onClick={onBack}><Icon n="back" s={15} /></div><b>{title}</b></div>
    <div className="sub-bd">{children}</div>
  </div>);
}

/* 订单与咨询单都按状态分 tab，客人要找「待付款的那单」不用一条条翻。
   两个列表共用一套 tab 外壳。 */
function TabBarList({ tabs, cur, setCur, counts }) {
  return (<div className="ml-tabs">
    {tabs.map(([k, t]) => (
      <span key={k} className={cur === k ? 'on' : ''} onClick={() => setCur(k)}>
        {t}{counts[k] ? <em>{counts[k]}</em> : null}
      </span>
    ))}
  </div>);
}

const OD_TABS = [['all', '全部'], ['pay', '待付款'], ['go', '待出行'], ['ing', '行程中'], ['done', '已完成']];
const odGroup = o => {
  if (o.closed) return 'done';
  if ((o.owe || 0) > 0) return 'pay';
  if (o.trip_state === '出行中') return 'ing';
  if (o.trip_state === '已回团') return 'done';
  return 'go';
};

function MyOrders({ go, back, guest, onOpen }) {
  const [cur, setCur] = useState('all');
  const { d: list, loading } = useData(
    () => guest ? get('/api/mini/orders?phone=' + guest.phone) : Promise.resolve([]), [guest && guest.phone], []);
  const all = list || [];
  const counts = useMemo(() => {
    const m = { all: all.length };
    all.forEach(o => { const g = odGroup(o); m[g] = (m[g] || 0) + 1; });
    return m;
  }, [all]);
  const rows = cur === 'all' ? all : all.filter(o => odGroup(o) === cur);

  return (<SubPage title="我的订单" onBack={() => back('me')}>
    {!!all.length && <TabBarList tabs={OD_TABS} cur={cur} setCur={setCur} counts={counts} />}
    {loading ? <div className="empty">载入中…</div>
      : rows.length ? rows.map(o => (
        <div className="od-card" key={o.no} style={{ cursor: 'pointer' }} onClick={() => onOpen(o.no)}>
          <div className="hd"><span className="no">{o.no}</span>
            <span className={'pill ' + pill(o)} style={{ marginLeft: 'auto', borderRadius: 2 }}><i />{o.status_cn}</span></div>
          <h4>{o.dest}</h4>
          <div className="meta">{o.days} 天 · {o.pax} 人{o.go_date ? ' · ' + o.go_date + ' 出发' : ''}</div>
          {!o.closed && o.stage_cn && <div className="od-now">当前进度 · {o.stage_cn}</div>}
          {o.refund_cn && <div className="od-now rf">{o.refund_cn}</div>}
          <div className="ft"><span style={{ fontSize: 11, color: 'var(--muted)' }}>订单金额</span>
            <b className="amt">{money(o.amount)}</b>
            {o.owe > 0 && <span className="od-owe">待付 {money(o.owe)}</span>}
            <span className="btn2"><button className="fav-btn" onClick={() => onOpen(o.no)}>查看进度</button></span></div>
        </div>
      )) : <div className="empty"><div className="ic">◎</div>
        {!guest ? '登录后可查看您的订单'
          : all.length ? '这个状态下暂时没有订单' : '暂无订单，行程确认后将在此展示'}</div>}
  </SubPage>);
}

/* ============ 提交成功 · 氛围页 ============
   原来提交完是在方案页上盖一个小弹窗，关掉又退回 AI 详情页，客人不知道自己该干嘛。
   改成整页接管：一张目的地大图压暗，一枚对勾，说清楚接下来谁在什么时候联系他。 */
function Submitted({ go, arg, data }) {
  const picOf = usePic();
  const a = arg || {};
  const hero = (a.dest && picOf(a.dest)) || (data.splash || {}).img || ((data.banners || [])[0] || {}).img;
  return (<div className="sb-wrap">
    {hero && <img className="bg" src={oimg(hero, 1200)} alt="" />}
    {/* 不能叫 mask：全局有个 .mask 是弹窗遮罩（position:fixed + 拦点击），
        撞上以后这一页的按钮全点不动，遮罩还会铺出手机壳 */}
    <div className="sb-mask" />
    <div className="bd">
      <div className="tick"><Icon n="check" s={30} c="#1c140c" sw={2.4} /></div>
      <h2>需求已提交</h2>
      {a.no && <div className="no mono">{a.no}</div>}
      <p className="ln">
        定制师将在 <b>1 个工作日内</b> 与您电话联系，<br />
        确认出行日期、预算与行程细节。
      </p>
      <div className="steps">
        {[['已提交', '需求进入门店工作台', 1],
          ['定制师核对', '核对行程与真实报价', 0],
          ['推送给您', '在「我的」中查看与反馈', 0]].map(([t, d2, on], i) => (
          <div className={'s' + (on ? ' on' : '')} key={t}>
            <i>{i + 1}</i><div className="tx"><b>{t}</b><span>{d2}</span></div>
          </div>))}
      </div>
      {a.dest && <div className="dest">{a.dest}{a.days ? ` · ${a.days} 天` : ''}</div>}
      <div className="ops">
        <button className="o" onClick={() => go('home')}>回首页逛逛</button>
        <button className="p" onClick={() => go('me')}>去「我的」看看</button>
      </div>
      <div className="tip">顾问确认后，这张咨询单与完整行程会推送到「我的」</div>
    </div>
  </div>);
}

/* 我的定制咨询：和订单分开的一套单据，同样按状态分 tab */
const CS_TABS = [['all', '全部'], ['open', '进行中'], ['won', '已成交'], ['lost', '已关闭']];
const csGroup = c => c.status === 'won' ? 'won' : (c.status === 'lost' ? 'lost' : 'open');

function MyConsults({ go, back, guest }) {
  const [cur, setCur] = useState('all');
  const picOf = usePic();
  const { d: list, loading } = useData(
    () => guest ? get('/api/mini/consults?phone=' + guest.phone) : Promise.resolve([]), [guest && guest.phone], []);
  /* 待顾问确认的条数走 /api/mini/me —— 上面那个接口保持返回数组，
     改它的形状会让客人手机上还开着的老页面崩掉 */
  const { d: me } = useData(
    () => guest ? get('/api/mini/me?phone=' + guest.phone) : Promise.resolve(null), [guest && guest.phone], null);
  const all = list || [];
  const pending = (me && me.consultPending) || 0;
  const counts = useMemo(() => {
    const m = { all: all.length };
    all.forEach(c => { const g = csGroup(c); m[g] = (m[g] || 0) + 1; });
    return m;
  }, [all]);
  const rows = cur === 'all' ? all : all.filter(c => csGroup(c) === cur);

  return (<SubPage title="我的定制咨询" onBack={() => back('me')}>
    {/* 新流程：需求提交后先由顾问核对，确认后才推送过来。
        这里不摆单据内容，只告诉客人「收到了、在处理」，免得以为没提交上去又提一遍。 */}
    {!!pending && (
      <div className="cs-pending">
        <span className="dot" />
        <div className="tx"><b>{pending} 条需求已收到</b>
          <i>顾问正在核对行程与报价，确认后会推送给您</i></div>
      </div>)}
    {!!all.length && <TabBarList tabs={CS_TABS} cur={cur} setCur={setCur} counts={counts} />}
    {loading ? <div className="empty">载入中…</div>
      : rows.length ? rows.map(c => {
        const [cn, cls] = JN_STATE[c.status] || [c.st_cn, 'wait'];
        const pax = (c.adults || 0) + (c.children || 0) + (c.elders || 0);
        return (
          <div className="cs-row" key={c.no} onClick={() => go('consultDetail', c.no)}>
            <div className="ph">{picOf(c.dest) && <img src={oimg(picOf(c.dest))} alt="" />}</div>
            <div className="tx">
              <div className="t1"><b>{c.dest} · {c.days} 天</b>
                <span className={'st ' + cls}>{cn}</span></div>
              <div className="t2">{pax ? pax + ' 人' : ''}
                {c.go_date ? (pax ? ' · ' : '') + c.go_date + ' 出发' : ''}</div>
              <div className="t3">{c.no} · 提交于 {String(c.created_at || '').slice(5, 10)}</div>
              {c.order_no && <div className="t4">订单 {c.order_no} ›</div>}
            </div>
          </div>
        );
      }) : <div className="empty"><div className="ic">◎</div>
        {!guest ? '登录后可查看您的定制咨询'
          : all.length ? '这个状态下暂时没有咨询单'
          : pending ? '需求已提交，顾问确认后就会出现在这里' : '还没有定制需求'}</div>}
  </SubPage>);
}

function MyOrderDetail({ go, no, onBack, guest }) {
  const toast = useToast();
  const { d: o, loading, reload } = useData(
    () => get('/api/mini/orders/' + no + (guest ? '?phone=' + guest.phone : '')), [no]);
  const [more, setMore] = useState(false);
  const [pay, setPay] = useState(false);
  if (loading || !o) return <SubPage title="订单详情" onBack={onBack}><div className="empty">载入中…</div></SubPage>;
  const c = o.consult, b = o.base || {}, rq = o.req || {};
  const STEP_CLS = { done: 'on', doing: 'doing', todo: '', skip: 'skip' };
  const STEP_SHORT = { created: '下单', deposit: '定金', contracted: '签约',
    paid: '尾款', ready: '行前', traveling: '在途', done: '完成' };
  const owe = o.owe || 0;
  const pax = (rq.adults || 0) + (rq.children || 0) + (rq.elders || 0) || o.pax;
  const paxTxt = [rq.adults && rq.adults + ' 成人', rq.children && rq.children + ' 儿童',
    rq.elders && rq.elders + ' 长者'].filter(Boolean).join(' · ') || (o.pax + ' 人');
  const dt = v => String(v || '').slice(0, 16);
  /* 底部按钮按订单当前状态给，主要操作直接放出来，不藏进「更多」。
     取消与退款都走客服 —— 定制单已收定金，退改要按合同算，不能让客人自助点掉。 */
  const acts = (() => {
    if (o.closed) return [['联系客服', () => go('chat', o.no), 'pri']];
    if (owe > 0) return [
      ['联系客服', () => go('chat', o.no), ''],
      ['取消订单', () => go('chat', o.no), ''],
      ['立即支付', () => setPay(true), 'pri'],
    ];
    /* 已付清但还没回团：退改还有可能，给「申请退款」（走客服，按合同算） */
    if (o.trip_state !== '已回团') return [
      ['联系客服', () => go('chat', o.no), ''],
      ['申请退款', () => go('chat', o.no), 'pri'],
    ];
    return [['联系客服', () => go('chat', o.no), 'pri']];
  })();

  return (<SubPage title="订单详情" onBack={onBack} bottom>
    {/* ① 进度 · 状态 · 行程，顺带把来源需求单的入口放在这一屏 */}
    <div className="od-card">
      <div className="hd"><span className="no">{o.no}</span>
        <span className={'pill ' + pill(o)} style={{ marginLeft: 'auto', borderRadius: 2 }}><i />{o.status_cn}</span></div>
      <h4>{o.dest}</h4>
      <div className="sub">{o.days} 天 · {pax} 人 · {o.go_date} 出发</div>
      <div className="mo-steps">
        {(o.progress || []).map(p => (
          <div key={p.key} className={STEP_CLS[p.state] || ''}>
            <i /><b>{STEP_SHORT[p.key] || p.title}</b>
            <u>{p.at ? String(p.at).slice(5) : ''}</u>
          </div>
        ))}
      </div>
      {c && (
        <div className="od-cslink" onClick={() => go('consultDetail', c.no)}>
          <Icon n="grid" s={13} c="var(--gold)" />
          由需求单 <b>{c.no}</b> 成交
          <span>查看 ›</span>
        </div>
      )}
    </div>

    {/* ② 产品 + 行程 + 金额 */}
    <div className="mi-odsec"><i />产品与费用</div>
    <div className="od-prod">
      {c && c.plan && (
        <div className="p" onClick={() => c.share_token && go('trip', c.share_token)}>
          <img src={oimg(c.plan.cover)} alt="" />
          <div className="t">
            <b>{c.plan.route}</b>
            <i>{o.dest} · {o.days} 天 · 第 {c.plan.ver} 版</i>
            {c.share_token && <span className="go">查看完整行程 ›</span>}
          </div>
        </div>
      )}
      <div className="m">
        <div className="row"><span>订单金额</span><b>{money(o.amount)}</b></div>
        <div className="row"><span>已付款</span><b className="g">{money(o.paid)}</b></div>
        {owe > 0
          ? <div className="row"><span>待付款</span><b className="r">{money(owe)}</b></div>
          : <div className="row"><span>付款状态</span><b className="g">已付清</b></div>}
        {o.refunded > 0 && <div className="row"><span>已退款</span><b>{money(o.refunded)}</b></div>}
      </div>
    </div>

    {/* ③ 出行信息 —— 行程条件与出行人合成一块，不再分两段 */}
    <div className="mi-odsec"><i />出行信息</div>
    <div className="mo-kv">
      <div><span>出发日期</span><b>{o.go_date || '待定'}</b></div>
      <div><span>行程天数</span><b>{o.days} 天</b></div>
      <div><span>出行人数</span><b>{paxTxt}</b></div>
      <div><span>出发城市</span><b>{b.from_city || '—'}</b></div>
      {rq.budget ? <div><span>预算</span><b>{money(rq.budget)}</b></div> : null}
      {rq.kind === 'org' && <div><span>企业定制</span><b>{rq.org || '—'}</b></div>}
      {!!(rq.prefs || []).length && <div className="w"><span>旅行偏好</span>
        <b>{rq.prefs.map(x => PREF_CN[x] || x).join('、')}</b></div>}
      {rq.must_see && <div className="w"><span>必访景点</span><b>{rq.must_see}</b></div>}
      {rq.remark && <div className="w"><span>特殊要求</span><b>{rq.remark}</b></div>}
      {!!(o.travelers || []).length && (
        <div className="w trv">
          <span>出行人（{o.travelers.length} 位）</span>
          <div className="ls">
            {o.travelers.map((t, i) => (
              <div key={i}>
                <b>{t.name}{t.en_name ? <u>{t.en_name}</u> : null}</b>
                <i>{kindCn(t.kind)} · {t.id_type} {t.id_no}
                  {t.id_exp ? ' · 有效期至 ' + t.id_exp : ''}</i>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>

    {/* ④ 订单信息 */}
    <div className="mi-odsec"><i />订单信息</div>
    <div className="mo-kv">
      <div className="w"><span>订单号</span><b className="mono">{o.no}</b></div>
      <div><span>下单时间</span><b>{dt(b.created_at) || '—'}</b></div>
      <div><span>最近付款</span><b>{dt(b.paid_at) || '—'}</b></div>
      <div><span>下单联系人</span><b>{b.contact_name || '—'}</b></div>
      <div><span>联系电话</span><b className="mono">{b.contact_phone || '—'}</b></div>
      {b.contact_email && <div className="w"><span>邮箱</span><b>{b.contact_email}</b></div>}
      {b.addr && <div className="w"><span>联系地址</span><b>{b.addr}</b></div>}
      {b.contract_no && <div><span>合同编号</span><b className="mono">{b.contract_no}</b></div>}
      <div><span>订单来源</span><b>{b.source}</b></div>
    </div>

    {/* 底部：主要操作直接摆出来 */}
    <div className={'od-cbar n' + acts.length}>
      <div className="l" onClick={() => setMore(true)}>
        <Icon n="grid" s={17} c="var(--muted)" /><span>更多</span>
      </div>
      {acts.map(([t, fn, cls]) => (
        <button key={t} className={cls || 'sec'} onClick={fn}>{t}</button>
      ))}
    </div>

    {more && (
      <div className="od-sheet" onClick={e => e.target === e.currentTarget && setMore(false)}>
        <div className="bd">
          <div className="h">订单操作</div>
          <div className="r" onClick={() => { setMore(false); go('chat', o.no); }}>
            <Icon n="file" s={16} c="var(--gold)" />
            <div className="tx"><b>开具发票</b>
              <i>{owe > 0 ? '付清全款后由客服开具' : '联系客服开具，电子发票发至您的邮箱'}</i></div>
          </div>
          {b.contract_no && <div className="r" onClick={() => { setMore(false); go('chat', o.no); }}>
            <Icon n="shield" s={16} c="var(--gold)" />
            <div className="tx"><b>电子合同</b><i>{b.contract_no}</i></div>
          </div>}
          {c && <div className="r" onClick={() => { setMore(false); go('consultDetail', c.no); }}>
            <Icon n="grid" s={16} c="var(--gold)" />
            <div className="tx"><b>来源需求单</b><i>{c.no}</i></div>
          </div>}
          <div className="r" onClick={() => { setMore(false); go('chat', o.no); }}>
            <Icon n="chat" s={16} c="var(--gold)" />
            <div className="tx"><b>退改与其他问题</b><i>由客服协助处理</i></div>
          </div>
          <button className="cancel" onClick={() => setMore(false)}>取消</button>
        </div>
      </div>
    )}

    {pay && <PaySheet o={o} owe={owe} phone={guest && guest.phone}
      onClose={() => setPay(false)}
      onDone={r => { setPay(false); reload(); toast(`已支付 ${money(r.amount)}`); }} />}
  </SubPage>);
}

/* 在线支付：本期不接真实通道（业务口径），走模拟流程，
   但钱要真的落到 payment 与 torder.paid 上，后台看到的进度才是对的。 */
const PAY_WAYS = [['wechat', '微信支付', '推荐'], ['alipay', '支付宝', ''], ['card', '银行卡', '']];

function PaySheet({ o, owe, phone, onClose, onDone }) {
  const toast = useToast();
  const [way, setWay] = useState('wechat');
  const [busy, setBusy] = useState(false);
  const [part, setPart] = useState(false);          // 只付定金还是付全部
  /* 只有一分钱没付的单才给「先付定金」；已付过定金的只剩付清余款 */
  const dep = (o.paid || 0) > 0 ? 0 : Math.min(owe, Math.round((o.amount || 0) * 0.3));
  const amt = part && dep > 0 && dep < owe ? dep : owe;
  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await post('/api/mini/pay', { no: o.no, phone, amount: amt,
        way: (PAY_WAYS.find(w => w[0] === way) || [])[1] });
      onDone(r);
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };
  return (<div className="od-sheet" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="bd">
      <div className="h">支付</div>
      <div className="pay-amt">{money(amt)}<em>{part ? '本次支付 30% 定金' : '应付全部余款'}</em></div>
      {dep > 0 && dep < owe && (
        <div className="pay-seg">
          <span className={part ? '' : 'on'} onClick={() => setPart(false)}>付全部 {money(owe)}</span>
          <span className={part ? 'on' : ''} onClick={() => setPart(true)}>先付定金 {money(dep)}</span>
        </div>
      )}
      {PAY_WAYS.map(([k, t, tag]) => (
        <div className={'r pay-r' + (way === k ? ' on' : '')} key={k} onClick={() => setWay(k)}>
          <Icon n={k === 'wechat' ? 'chat' : k === 'alipay' ? 'tag' : 'ticket'} s={16} c="var(--gold)" />
          <div className="tx"><b>{t}{tag ? <em>{tag}</em> : null}</b></div>
          <span className="rd" />
        </div>
      ))}
      <button className="pay-go" disabled={busy} onClick={run}>
        {busy ? '支付中…' : '确认支付 ' + money(amt)}</button>
      <div className="pay-note">演示环境，不产生真实扣款；支付结果会同步到订单与门店工作台。</div>
      <button className="cancel" onClick={onClose}>取消</button>
    </div>
  </div>);
}

/* 常用旅客：改成服务端存储，并把这位客人历史订单里的出行人自动带进来。
   原先只写 localStorage —— 换台手机就没了、后台也看不到，而且客人明明下过单，
   进来还是一句「暂无常用旅客」，等于让他把自己填过的东西再敲一遍。 */
const TRV_KIND = { adult: '成人', child: '儿童', elder: '长者', baby: '婴儿' };
const kindCn = k => TRV_KIND[k] || k || '成人';

function Travelers({ go, back, guest }) {
  const toast = useToast();
  const phone = guest ? guest.phone : '';
  const { d: list, reload } = useData(
    () => phone ? get('/api/mini/travelers?phone=' + phone) : Promise.resolve([]), [phone], []);
  /* 编辑改成小程序内的二级页，不再弹全屏遮罩 —— 业务反馈那个看着像跳出了小程序 */
  const [ed, setEd] = useState(null);
  const save = async () => {
    if (!ed.name) return toast('请填写姓名');
    if (!ed.id_no) return toast('请填写证件号码');
    await post('/api/mini/travelers', { ...ed, phone });
    setEd(null); reload(); toast('已保存');
  };
  const remove = async t => {
    if (!confirm(`确认删除「${t.name}」？`)) return;
    await del2('/api/mini/travelers/' + t.id + '?phone=' + phone);
    reload(); toast('已删除');
  };
  const mask = v => String(v || '').replace(/^(.{4}).*(.{3})$/, '$1********$2');

  if (ed) return (<SubPage title={ed.id ? '编辑旅客' : '添加旅客'} onBack={() => setEd(null)}>
    <div className="tv-form">
      <div className="g">
        <label>中文姓名<em>*</em>
          <input value={ed.name || ''} onChange={e => setEd({ ...ed, name: e.target.value })}
            placeholder="与证件一致" /></label>
        <label>英文 / 拼音姓名
          <input value={ed.en_name || ''} onChange={e => setEd({ ...ed, en_name: e.target.value })}
            placeholder="护照上的拼写，出境必填" /></label>
        <label>旅客类型
          <select value={ed.kind || 'adult'} onChange={e => setEd({ ...ed, kind: e.target.value })}>
            {Object.entries(TRV_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>证件类型
          <select value={ed.id_type || '身份证'} onChange={e => setEd({ ...ed, id_type: e.target.value })}>
            <option>身份证</option><option>护照</option><option>港澳通行证</option><option>台湾通行证</option>
          </select></label>
        <label>证件号码<em>*</em>
          <input value={ed.id_no || ''} onChange={e => setEd({ ...ed, id_no: e.target.value })} /></label>
        <label>证件有效期
          <input value={ed.id_exp || ''} onChange={e => setEd({ ...ed, id_exp: e.target.value })}
            placeholder="如 2031-06-30" /></label>
        <label>联系手机
          <input value={ed.tphone || ''} onChange={e => setEd({ ...ed, tphone: e.target.value })}
            inputMode="tel" /></label>
      </div>
      <div className="tip">证件信息仅用于预订机票、酒店与代办签证，加密存储，不作他用。</div>
      <div className="bs">
        <button className="btn btn-o" onClick={() => setEd(null)}>取消</button>
        <button className="btn btn-p" onClick={save}>保存</button>
      </div>
    </div>
  </SubPage>);

  return (<SubPage title="常用旅客" onBack={() => back('me')}>
    {!phone && <div className="empty" style={{ padding: '40px 0' }}>登录后可维护常用旅客</div>}
    {!!phone && !!list.length && <div className="tv-tip">出行人信息提前存好，下单时直接选用，无需重复填写。</div>}
    <div className="tv-list">
      {list.map(t => (
        <div className="it" key={t.id}>
          <div className="hd">
            <b>{t.name}</b>
            {t.en_name ? <u>{t.en_name}</u> : null}
            {t.is_self ? <span className="tg">本人</span> : null}
            {t.src === 'order' ? <span className="tg o">订单带入</span> : null}
          </div>
          <div className="kv">
            <span>{kindCn(t.kind)}</span><i />
            <span>{t.id_type || '身份证'}</span><i />
            <span className="mono">{mask(t.id_no) || '证件待补'}</span>
          </div>
          {t.id_exp && <div className="ex">证件有效期至 {t.id_exp}</div>}
          <div className="ops">
            <a onClick={() => setEd({ ...t })}>编辑</a>
            <a className="d" onClick={() => remove(t)}>删除</a>
          </div>
        </div>))}
    </div>
    {phone && !list.length && (
      <div className="empty" style={{ padding: '34px 0' }}>还没有常用旅客<br />下过单之后，出行人会自动出现在这里</div>
    )}
    {phone && (
      <button className="tv-add"
        onClick={() => setEd({ name: '', id_type: '身份证', id_no: '', kind: 'adult', tphone: phone })}>
        <Icon n="plus" s={15} />添加旅客</button>
    )}
  </SubPage>);
}

/* 每日一句。不喊口号、不催下单，就是想出门那一刻的念头。
   按当天序号取，同一天进来是同一句。 */
const DAILY_LINES = [
  '总要去看一看世界的。',
  '好天气不该只在窗外发生。',
  '把日子过成想去的样子。',
  '有些风景，照片替不了你。',
  '慢一点走，路才像路。',
  '攒够了假，就该攒点回忆了。',
  '世界很大，不急着一次看完。',
  '出发这件事，从来不用等准备好。',
  '走远一点，日子会松一点。',
  '最好的时节，往往就是现在。',
  '海和山都在原地等你。',
  '生活需要一点不着急的时间。',
  '一年总要有几天，交给远方。',
  '不必带太多行李，带上兴致就行。',
  '路上遇到的人，也是风景。',
  '偶尔离开熟悉的街道。',
  '想去的地方，先记下来。',
  '把清晨还给一座陌生的城。',
  '旅行不为逃开，只为看看别处。',
  '收拾一只箱子，就能换个心情。',
];

const isImg = v => !!v && /^(https?:|data:|\/)/.test(v);
const AVATARS = [
  ['a1', '#8c6b3f'], ['a2', '#2f5d50'], ['a3', '#7a4a52'], ['a4', '#3d5a7a'],
  ['a5', '#6b5b8c'], ['a6', '#4a6b3f'], ['a7', '#8c5a3f'], ['a8', '#3f6b6b'],
];
const avColor = k => (AVATARS.find(a => a[0] === k) || [])[1] || null;
function GuestAvatar({ g, size = 25 }) {
  /* avatar 现在有两种取值：预设色块的 key，或者客人自己上传的图片地址 */
  const av = g && g.avatar;
  if (av && /^(https?:|data:|\/)/.test(av)) {
    return <img src={oimg(av, 300)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />;
  }
  const c = g && avColor(av);
  if (!c) return <Icon n="user" s={size} c="var(--accent-3)" />;
  return (<div style={{ width: '100%', height: '100%', borderRadius: '50%', background: c,
    display: 'grid', placeItems: 'center', color: '#fff', fontSize: size * 0.7,
    fontFamily: 'var(--serif)' }}>{(g.nick || '客').trim().slice(0, 1)}</div>);
}

const GENDERS = ['女', '男', '不便透露'];

function Profile({ back, guest, onSaved }) {
  const toast = useToast();
  const { d, loading } = useData(
    () => guest ? get('/api/mini/me?phone=' + guest.phone) : Promise.resolve({ guest: null }), [guest && guest.phone]);
  const g = d && d.guest;
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!g) return;
    setF({
      nick: g.nick || '', avatar: g.avatar || '', city: g.from_city || '', prefs: g.prefs || [],
      gender: g.gender || '', birth: g.birth || '', enName: g.en_name || '', email: g.email || '',
    });
  }, [g && g.phone, g && g.nick, g && g.avatar, g && g.from_city, g && g.gender,
      g && g.birth, g && g.en_name, g && g.email, J(g && g.prefs || [])]);

  if (!guest) return (<SubPage title="个人资料" onBack={() => back('me')}>
    <div className="empty" style={{ padding: '40px 0' }}>请先登录后再维护个人资料</div></SubPage>);
  if (loading || (g && !f)) return (<SubPage title="个人资料" onBack={() => back('me')}><div className="empty">载入中…</div></SubPage>);
  /* 本地留着登录态但服务端查不到这个号（换库、清过数据），不能一直转圈 */
  if (!g) return (<SubPage title="个人资料" onBack={() => back('me')}>
    <div className="empty" style={{ padding: '40px 0' }}>账号信息已失效，请退出登录后重新进入</div></SubPage>);

  const set = (k, v) => setF(o => ({ ...o, [k]: v }));
  const togglePref = k => setF(o => ({ ...o,
    prefs: o.prefs.includes(k) ? o.prefs.filter(x => x !== k) : o.prefs.concat(k) }));
  const dirty = f.nick.trim() !== (g.nick || '') || f.avatar !== (g.avatar || '')
    || f.city !== (g.from_city || '') || J(f.prefs) !== J(g.prefs || [])
    || f.gender !== (g.gender || '') || f.birth !== (g.birth || '')
    || f.enName !== (g.en_name || '') || f.email !== (g.email || '');
  const save = async () => {
    if (!f.nick.trim()) return toast('请填写昵称');
    setBusy(true);
    try {
      const r = await post('/api/mini/profile', {
        phone: guest.phone, nick: f.nick.trim(), avatar: f.avatar, fromCity: f.city, prefs: f.prefs,
        gender: f.gender, birth: f.birth, enName: f.enName, email: f.email.trim(),
      });
      onSaved(r.guest); toast('个人资料已保存');
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };
  const initial = (f.nick || '客').trim().slice(0, 1);

  return (<SubPage title="个人资料" onBack={() => back('me')}>
    {/* 头像：大圆 + 右下角相机按钮，底色在同一块里横排选。
        原来是「当前头像 + 虚线上传框 + 另起一行的底色圆」三段，尺寸不一看着散。 */}
    <div className="pf-card pf-av">
      <div className="ring">
        <div className="cur">
          {isImg(f.avatar)
            ? <img src={oimg(f.avatar, 300)} alt="" />
            : (avColor(f.avatar)
              ? <span style={{ background: avColor(f.avatar) }}>{initial}</span>
              : <span className="ph"><Icon n="user" s={30} c="var(--muted-2)" /></span>)}
        </div>
        <ImgPick value={isImg(f.avatar) ? f.avatar : ''} onChange={v => set('avatar', v || '')}
          className="cam" text="＋" />
      </div>
      <div className="tx">
        <b>{f.nick || '旅行者'}</b>
        <i>点右下角 ＋ 上传照片，或在下面挑一个底色</i>
        {isImg(f.avatar) && <a onClick={() => set('avatar', '')}>移除照片</a>}
      </div>
      <div className="dots">
        {AVATARS.map(([k, c]) => (
          <span key={k} className={f.avatar === k ? 'on' : ''} style={{ background: c }}
            onClick={() => set('avatar', k)}>{initial}</span>))}
        <span className={'none' + (!f.avatar ? ' on' : '')} onClick={() => set('avatar', '')}>
          <Icon n="user" s={15} c="var(--muted-2)" /></span>
      </div>
    </div>

    <div className="pf-card pf-form">
      <div className="pf-t">基础信息</div>
      <label className="pf-r">
        <span className="lb">昵称</span>
        <input value={f.nick} onChange={e => set('nick', e.target.value)} maxLength={16} placeholder="请填写昵称" />
      </label>
      <div className="pf-r">
        <span className="lb">性别</span>
        <div className="segs">
          {GENDERS.map(x => (
            <span key={x} className={f.gender === x ? 'on' : ''}
              onClick={() => set('gender', f.gender === x ? '' : x)}>{x}</span>))}
        </div>
      </div>
      <label className="pf-r">
        <span className="lb">生日</span>
        <input type="date" value={f.birth} max={new Date().toISOString().slice(0, 10)}
          onChange={e => set('birth', e.target.value)} />
      </label>
      <label className="pf-r">
        <span className="lb">英文 / 拼音名</span>
        <input value={f.enName} onChange={e => set('enName', e.target.value.toUpperCase())}
          placeholder="与护照一致，如 ZHOU XIAOJIE" maxLength={40} />
      </label>
      <div className="pf-r">
        <span className="lb">手机号</span>
        <span className="ro">{g.phone}</span>
      </div>
      <label className="pf-r">
        <span className="lb">邮箱</span>
        <input type="email" value={f.email} onChange={e => set('email', e.target.value)}
          placeholder="用于接收行程单与电子合同" maxLength={60} />
      </label>
      <label className="pf-r last">
        <span className="lb">常用出发城市</span>
        <select value={f.city} onChange={e => set('city', e.target.value)}
          className={f.city ? '' : 'ph'}>
          <option value="">未填写</option>
          {DEPART_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <div className="pf-tip">生日用于会员的生日礼遇；英文名与护照一致可省去出票前再问一次。</div>
    </div>

    <div className="pf-card">
      <div className="pf-t">旅行偏好</div>
      <div className="pf-tip" style={{ margin: '0 0 12px' }}>
        保存后，您提交的定制需求会自动带上这些偏好，无需重复填写。
      </div>
      <div className="pf-chips">
        {PREFS.map(([k, t]) => (
          <span key={k} className={f.prefs.includes(k) ? 'on' : ''} onClick={() => togglePref(k)}>{t}</span>))}
      </div>
    </div>

    <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.85, marginBottom: 16 }}>
      手机号为账号唯一标识，您的定制咨询单、订单与收藏均关联于此，故不支持自助修改。
      如需变更绑定手机号，请联系众信旅游客服，核验身份后为您办理账号信息迁移。
    </div>
    <div style={{ display: 'flex', gap: 10 }}>
      <button className="btn btn-o" style={{ flex: 1 }} onClick={() => back('me')}>取消</button>
      <button className="btn btn-p" style={{ flex: 1 }} disabled={busy || !dirty} onClick={save}>
        {busy ? '保存中…' : '保存'}</button>
    </div>
  </SubPage>);
}

/* 协议正文。原先「隐私与协议」是一整块纯文本，四个标题看着像条目却点不动，
   客人以为坏了。改成条目列表 + 独立正文页，每条都能打开、滚动、返回。 */
const POLICY_DOCS = [
  { k: 'user', t: '用户协议', sub: '服务范围、预订与变更、双方责任', upd: '2026-09-01',
    body: [
      ['一、协议主体与适用范围',
        '《优定制用户协议》（下称"本协议"）由您与北京众信国际旅行社股份有限公司及其授权经营主体（下称"众信旅游"）共同订立。您通过"优定制"小程序浏览内容、提交定制需求、接受行程方案或签署旅游合同，即视为已阅读并同意本协议。本协议适用于优定制小程序内的全部服务。'],
      ['二、服务内容',
        '优定制提供的是定制旅游的咨询与方案设计服务，具体包括：根据您提交的目的地、出行日期、人数与预算，由我们的服务团队为您设计行程方案、核算报价、代为预订机票酒店与当地服务、协助办理签证，以及行程中的应急支持。小程序内展示的行程、图片与价格均为方案参考，不构成要约。'],
      ['三、需求提交与报价',
        '您在小程序提交的定制需求将生成一张定制咨询单，我们将在 1 个工作日内与您联系确认细节。出具的报价单有效期通常为 3 个工作日，逾期后因航班舱位、酒店房态或汇率变动导致的价格调整，以重新确认的报价为准。报价未包含的项目将在报价单中单独列明。'],
      ['四、合同与付款',
        '双方就行程与价格达成一致后，需签署《境内/出境旅游合同》，并按约定支付定金或全款。未签署合同前，任何一方均可终止商洽，众信旅游将全额退还已收取的意向金。付款后，机票、酒店、签证等已实际发生的费用按供应商规则处理。'],
      ['五、行程变更与取消',
        '因您的原因取消或变更行程的，按合同约定的损失标准扣除已产生的实际费用后退还余款。因不可抗力（自然灾害、公共卫生事件、目的地政策变动、航班取消等）导致行程无法成行的，双方协商变更或解除合同，已发生的不可退费用由双方按合同约定分担。'],
      ['六、您的责任',
        '请您如实提供出行人姓名、证件号码、证件有效期与特殊需求（如疾病、孕期、饮食禁忌）。因信息填写错误、证件失效、拒签或个人原因未能出行的，相关损失由您承担。行程中请遵守目的地法律法规与当地风俗。'],
      ['七、知识产权',
        '小程序内的行程方案、文字、图片、视频及界面设计归众信旅游或相应权利人所有。未经书面许可，不得用于商业性复制、转载或对外发布。'],
      ['八、协议更新与争议解决',
        '本协议如有更新，将在小程序内公示，公示后继续使用即视为接受。因本协议产生的争议，双方应友好协商；协商不成的，提交众信旅游所在地有管辖权的人民法院诉讼解决。'],
    ] },
  { k: 'privacy', t: '隐私政策', sub: '我们收集什么、怎么用、怎么保护', upd: '2026-09-01',
    body: [
      ['一、我们收集哪些信息',
        '为向您提供定制旅游服务，我们会在下列场景收集必要信息：① 登录注册时收集手机号与微信昵称、头像；② 提交定制需求时收集出行日期、目的地、天数、人数、预算与您备注的偏好；③ 签约与预订时收集出行人姓名、证件类型与号码、证件有效期、紧急联系人；④ 开具发票时收集发票抬头、纳税人识别号与接收邮箱。除此之外，我们不会索取与出行无关的信息。'],
      ['二、我们如何使用这些信息',
        '手机号用于账号识别与顾问与您联系；行程偏好用于方案设计与产品推荐；证件信息仅用于预订机票、酒店、当地用车用船以及代办签证；发票信息仅用于开具与寄送电子发票。我们不会将您的信息用于与本次行程无关的营销，也不会出售您的个人信息。'],
      ['三、信息的对外提供',
        '完成预订必须将出行人信息提供给相应的航空公司、酒店、目的地地接社、保险公司与使领馆。我们仅提供完成该项预订所必需的最小信息，并要求合作方承担同等的保密义务。除法律法规要求或司法机关依法调取外，我们不会向其他第三方提供您的信息。'],
      ['四、信息的存储与安全',
        '您的信息存储于中国境内的服务器。涉及出境行程的，我们会在取得您单独同意后，向目的地的航司、酒店与使领馆传输必要信息。证件信息在传输与存储过程中均经过加密处理，仅授权的业务人员可在办理业务时调取。'],
      ['五、保存期限',
        '行程结束后，出行人证件信息保留 2 年，用于售后核对、保险理赔与签证记录查询，到期后删除或匿名化。您的咨询与订单记录按财税法规要求保留相应年限。'],
      ['六、您的权利',
        '您可以在「我的 · 常用旅客」中随时查看、修改或删除已保存的出行人信息，在「我的 · 个人资料」中修改昵称与头像。如需查询、更正、复制或彻底删除您的全部个人信息，或撤回此前作出的同意，可联系众信旅游客服，我们将在 15 个工作日内答复。'],
      ['七、未成年人信息',
        '涉及未满 14 周岁儿童出行的，须由其监护人代为提交信息并同意本政策。我们仅收集办理该次出行所必需的儿童信息，并采取更严格的访问控制。'],
      ['八、政策更新与联系方式',
        '本政策如发生重大变更，我们将在小程序内以显著方式告知。如您对个人信息处理有任何疑问、意见或投诉，可拨打众信旅游全国客服热线。'],
    ] },
  { k: 'child', t: '儿童个人信息保护规则', sub: '未满 14 周岁出行人的特别说明', upd: '2026-09-01',
    body: [
      ['一、适用对象', '本规则适用于行程中涉及未满 14 周岁儿童的情形，是《隐私政策》的组成部分。'],
      ['二、监护人同意', '儿童信息须由其父母或其他监护人代为提交。提交即视为监护人已阅读本规则并同意我们按本规则处理儿童信息。'],
      ['三、收集范围', '我们仅收集办理本次出行所必需的儿童信息：姓名、性别、出生日期、证件类型与号码、证件有效期，以及为保障安全所必需的健康说明（如过敏史）。不收集与出行无关的儿童信息。'],
      ['四、使用与共享', '儿童信息仅用于机票、酒店、门票的预订与签证办理，仅向承运人、住宿方、地接社与使领馆提供必需部分，不用于任何画像或营销。'],
      ['五、删除与更正', '监护人可随时要求查阅、更正或删除儿童信息。收到请求后，我们将在核验监护关系后 15 个工作日内处理；行程尚未结束且删除会导致无法履约的，我们会先行告知。'],
    ] },
  { k: 'service', t: '旅游服务须知', sub: '出行前必读：证件、保险、安全提示', upd: '2026-09-01',
    body: [
      ['一、证件与签证', '请确认护照有效期在行程结束之日起 6 个月以上，且有足够空白页。签证由我们协助办理，但是否获签由使领馆决定，拒签不属于旅行社责任，已发生的签证费与预订损失按合同约定处理。'],
      ['二、保险', '出境行程我社已按规定为您投保旅行社责任险，但该险种不覆盖您个人的意外与医疗。我们强烈建议您另行购买含医疗与紧急救援的旅游意外险，前往申根国家的须购买符合签证要求的保额。'],
      ['三、健康与特殊人群', '孕期、术后恢复期、患有心脑血管疾病或慢性病的旅客，请在签约前如实告知，以便顾问调整行程强度并确认航司与目的地的接收条件。高海拔、潜水、雪上等项目请遵医嘱。'],
      ['四、行程调整', '因天气、交通管制、罢工、场馆临时闭馆等客观原因，领队或地接社可能对当日顺序作出调整，我们会尽量保证游览项目不减少；确需减少的，按合同约定退还差价。'],
      ['五、安全提示', '请随身保管护照与贵重物品，遵守目的地法律法规与风俗禁忌，不参加未经我社确认的自费项目。出行前请留存我社 24 小时应急电话与当地中国使领馆领保电话。'],
      ['六、投诉与售后', '行程中如对服务不满意，请第一时间联系领队、地接社或众信旅游客服现场处理并留存凭证；行程结束后 30 日内可向我社提出书面意见，我们将在 15 个工作日内答复。'],
    ] },
];

function Policy({ go, back }) {
  return (<SubPage title="隐私与协议" onBack={() => back('me')}>
    <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.8 }}>
      以下条款构成您与众信旅游之间的完整约定，请在提交定制需求或签约前阅读。
    </div>
    {POLICY_DOCS.map(doc => (
      <div className="fm-row" key={doc.k} onClick={() => go('policyDoc', doc.k)}>
        <div className="ic"><Icon n="shield" s={15} c="var(--accent)" /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 14 }}>《{doc.t}》</b>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{doc.sub}</div>
        </div>
        <Icon n="chevron" s={13} c="var(--muted-2)" />
      </div>
    ))}
    <div style={{ fontSize: 11.5, color: 'var(--muted-2)', lineHeight: 1.9, marginTop: 18 }}>
      众信旅游 · 优定制（U-DESIGN）<br />
      北京众信国际旅行社股份有限公司<br />
      如对以上条款有疑问，可联系众信旅游客服。
    </div>
  </SubPage>);
}

function PolicyDoc({ back, k }) {
  const doc = POLICY_DOCS.find(d => d.k === k) || POLICY_DOCS[0];
  return (<SubPage title={doc.t} onBack={() => back('policy')}>
    <div className="doc">
      <div style={{ fontSize: 11.5, color: 'var(--muted-2)', marginBottom: 14, lineHeight: 1.8 }}>
        生效日期：{doc.upd}　·　适用主体：北京众信国际旅行社股份有限公司
      </div>
      {doc.body.map(([h, t]) => (<React.Fragment key={h}>
        <h4>{h}</h4>{t}
      </React.Fragment>))}
      <div style={{ marginTop: 22, paddingTop: 14, borderTop: '1px solid var(--line)', fontSize: 11.5, color: 'var(--muted-2)' }}>
        本文为演示环境展示文本，正式版本以签约时提供的纸质/电子文件为准。
      </div>
    </div>
  </SubPage>);
}

/* ============ PGC 攻略详情 ============ */
function Article({ go, back, id, data, isFav, toggleFav }) {
  const toast = useToast();
  const [poster, setPoster] = useState(null);
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState(false);
  const inHome = (data.articles || []).find(x => x.id === id);
  /* 首页数据里只有「已发布」的内容。后台点「预览」看一篇待发布/已撤销的稿子时
     这里会落空，再按 id 单独拉一次（/api/mini/articles/:id 不看状态）。
     客人端的入口永远来自已发布列表，所以不会因此多看到不该看的内容。 */
  const { d: fetched } = useData(() => inHome ? Promise.resolve(null)
    : get('/api/mini/articles/' + id).catch(() => null), [id, !!inHome], null);
  const a = inHome || fetched;
  /* 浏览打点：一次访问一条 PV，visitor 存本地用于 UV 去重 */
  useEffect(() => {
    if (!a) return;
    let vid = localStorage.getItem('u_visitor');
    if (!vid) { vid = 'v' + Math.random().toString(36).slice(2, 11); localStorage.setItem('u_visitor', vid); }
    post(`/api/mini/article/${a.id}/view`, {
      visitor: vid, phone: localStorage.getItem('u_phone') || null, ref: 'mini',
    }).catch(() => {});
  }, [a && a.id]);
  /* 相关行程：优先用后台配置的关联产品，没有配置再按目的地兜底 */
  const rel = useMemo(() => {
    if (!a) return [];
    const all = [...(data.inspire || []), ...(data.group || [])];
    const picked = (a.rel_prod || []).map(pid => all.find(p => p.id === pid)).filter(Boolean);
    if (picked.length) return picked.slice(0, 3);
    const hit = all.filter(p => (p.dest || '').includes(a.dest));
    return (hit.length ? hit : all).slice(0, 3);
  }, [a, data]);
  /* 延伸阅读：后台配置的关联内容 */
  const relArt = useMemo(() => (a && (a.rel_art || []).length)
    ? (a.rel_art || []).map(aid => (data.articles || []).find(x => x.id === aid)).filter(Boolean).slice(0, 3)
    : [], [a, data]);
  if (!a) return <div className="empty" style={{ paddingTop: 140 }}>该内容不存在或已下线</div>;
  const preview = !inHome && a.status !== 'published';
  return (<>
    {preview && <div className="ar-pv">预览模式 · 当前是「{a.status === 'revoked' ? '已撤销' : '待发布'}」，客人端看不到</div>}
    <div className={'mi-nav' + (preview ? ' pv' : '')}>
      <div className="mi-back" onClick={() => back('home')}><Icon n="back" s={15} c="#fff" /></div></div>
    <div className="ar-hero">
      <img src={oimg(a.img)} alt="" />
      <div className="c">
        <span className="k">{a.k}</span>
        <h1>{a.t}</h1>
        <div className="m">
          <span className="av"><Icon n="user" s={11} c="#fff" /></span>
          <span>{a.k || '优定制'}</span><span>·</span>
          <span><Icon n="eye" s={11} c="#fff" style={{ verticalAlign: -2, marginRight: 3 }} />{a.read} 阅读</span>
        </div>
      </div>
    </div>
    <div className="ar-bd">
      {a.lead && <div className="ar-lead">{a.lead}</div>}
      {a.html
        ? <div className="ar-rich rich-view" dangerouslySetInnerHTML={{ __html: a.html }} />
        : (a.secs || []).map((s2, i) => (
            <div className="ar-sec" key={i}><h3>{s2.h}</h3><p>{s2.p}</p></div>))}
      {!!rel.length && (
        <div className="ar-rel">
          <div className="hd"><Icon n="compass" s={15} c="var(--gold)" /><b>{a.dest} · 相关行程</b>
            <span onClick={() => go('destDetail', a.dest)}>更多 ›</span></div>
          {rel.map(p => (
            <div className="ar-p" key={p.id} onClick={() => go('product', p.id)}>
              <img src={oimg(p.cover)} alt="" />
              <div className="t"><b>{p.title}</b>
                <div className="r"><em>{p.days} 天 ·</em><em>¥</em><strong>{money0(p.price_from)}</strong><s>起/人</s></div>
              </div>
            </div>
          ))}
        </div>
      )}
      {!!relArt.length && (
        <div className="ar-rel">
          <div className="hd"><Icon n="file" s={15} c="var(--gold)" /><b>延伸阅读</b>
            <span onClick={() => go('guide')}>攻略社区 ›</span></div>
          {relArt.map(x => (
            <div className="ar-p" key={x.id} onClick={() => go('article', x.id)}>
              <img src={oimg(x.img)} alt="" />
              <div className="t"><b>{x.t}</b>
                <div className="r"><em>{x.k}</em><em>·</em><em>{x.dest}</em></div>
              </div>
            </div>))}
        </div>)}
      <div className="ar-cta">
        <b>想按自己的节奏走这条线路</b>
        <p>提交出行时间、人数与预算，1 个工作日内给到含真实资源与报价的方案。</p>
        <div className="who"><span className="av"><Icon n="user" s={12} c="#fff" /></span>
          优定制 · 内容团队</div>
      </div>
    </div>

    <div className="ar-bar">
      <div className={'ops' + (isFav && isFav('article', a.id) ? ' on' : '')}
        onClick={() => toggleFav && toggleFav('article', a.id)}>
        <Icon n="heart" s={19} c={isFav && isFav('article', a.id) ? 'var(--brand)' : 'var(--ink-3)'} />
        {isFav && isFav('article', a.id) ? '已收藏' : '收藏'}
      </div>
      <div className="ops" onClick={() => setShare(true)}>
        <Icon n="send" s={19} c="var(--ink-3)" />转发</div>
      <div className="ops" onClick={async () => {
        if (busy) return; setBusy(true); toast('正在生成海报…');
        const url = await drawPoster(a, (data.brand && data.brand.name) || '优定制 U-DESIGN');
        setBusy(false);
        url ? setPoster(url) : toast('海报生成失败：图片跨域受限');
      }}><Icon n="img" s={19} c="var(--ink-3)" />生成海报</div>
      <div className="ops" onClick={() => go('chat')}>
        <Icon n="chat" s={19} c="var(--ink-3)" />咨询</div>
      <button className="go" onClick={() => go('form', { dest: a.dest, fromArticle: a.id })}>提交定制需求</button>
    </div>

    {poster && (
      <div className="ps-mask" onClick={e => e.target === e.currentTarget && setPoster(null)}>
        <div className="ps-box"><img src={oimg(poster, 1200)} alt="海报" /></div>
        <div className="ps-tip">长按图片保存至相册　·　分享后可扫码识别</div>
        <div className="ps-acts">
          <button className="close" onClick={() => setPoster(null)}>关闭</button>
          <button className="save" onClick={() => {
            const link = document.createElement('a');
            link.href = poster; link.download = (a.t || '攻略') + '.png'; link.click();
            toast('已保存到本地');
          }}>保存海报</button>
        </div>
      </div>
    )}

    {share && (
      <div className="sh-mask" onClick={e => e.target === e.currentTarget && setShare(false)}>
        <div className="sh-sheet">
          <div className="hd">分享到</div>
          <div className="sh-g">
            {[['chat', '微信好友'], ['users', '朋友圈'], ['img', '生成海报'], ['file', '复制链接']].map(([ic, t]) => (
              <div className="sh-i" key={t} onClick={async () => {
                setShare(false);
                if (t === '生成海报') {
                  toast('正在生成海报…');
                  const url = await drawPoster(a, (data.brand && data.brand.name) || '优定制 U-DESIGN');
                  url ? setPoster(url) : toast('海报生成失败：图片跨域受限');
                } else if (t === '复制链接') {
                  try { await navigator.clipboard.writeText(location.origin + location.pathname + '#/mini'); toast('链接已复制'); }
                  catch { toast('链接已复制'); }
                } else toast('演示环境暂不支持该操作' + t + '分享');
              }}>
                <div className="ic"><Icon n={ic} s={19} c="var(--accent)" /></div><span>{t}</span>
              </div>))}
          </div>
          <button className="sh-cancel" onClick={() => setShare(false)}>取消</button>
        </div>
      </div>
    )}
  </>);
}

/* ============ 查攻略玩法（内容列表） ============ */
function Guide({ go, back, data, preset, isFav, toggleFav, guest, onLogin }) {
  /* 社区分三个频道：
     关注 —— 客人自己收藏的内容；
     发现 —— 全部内容的瀑布流，可按分类筛选；
     专栏 —— 按栏目聚合的 PGC 内容流。内容由团队产出，不挂个人署名：
     客人接触得到的只有 AI，露出具体的人反而会让人以为能直接找到他。 */
  const [mtab, setMtab] = useState(preset ? 'find' : 'find');
  const [ctab, setCtab] = useState(preset || 'all');
  const toast = useToast();
  const arts = data.articles || [];
  const tabs = data.ctabs || [];
  const list = arts.filter(a => ctab === 'all' || a.tab === ctab);
  const faved = arts.filter(a => isFav && isFav('article', a.id));
  const groups = (data.group || []).slice(0, 2);
  const dests = data.dests || [];
  const destOf = d => dests.find(x => d && d.includes(x.name));
  /* v57：频道导航不再挂数字角标。业务方明确要求头部不出现「N 篇原创」这类文案，
     频道名旁边挂计数是同一类噪声，参考图（大众点评首页）的主导航也只有文字。 */
  const MT = [['follow', '关注'], ['find', '发现'], ['advisor', '专栏']];
  /* 分类 chips 现在挪到了社区头第二层，关注与发现两个频道共用它做筛选；
     专栏没有分类维度，第二层整条收起。
     关注频道在「未登录」和「一条收藏都没有」这两种状态下也收起——这时候整屏只有一个
     空态提示，留一排点不出结果的筛选就是装饰性空条。 */
  const showChips = mtab === 'find' || (mtab === 'follow' && !!guest && faved.length > 0);
  const favList = faved.filter(a => ctab === 'all' || a.tab === ctab);
  /* 瀑布流分两列，按顺序交错，高度错落 */
  const half = l => [l.filter((_, i) => i % 2 === 0), l.filter((_, i) => i % 2 === 1)];
  const Fall = ({ l }) => {
    const [ca, cb] = half(l);
    return (<div className="mi-fall">
      <div className="mi-fcol">{ca.map((x, i) => <ArtCard key={x.id} a={x} h={[176, 148, 168, 156][i % 4]} go={go} />)}</div>
      <div className="mi-fcol">{cb.map((x, i) => <ArtCard key={x.id} a={x} h={[152, 178, 146, 170][i % 4]} go={go} />)}</div>
    </div>);
  };

  /* 社区流：PGC 版 —— 顾问署名条 + 正文摘要 + 目的地卡 + 图组/视频 + 互动条。
     不做关注与评论（内容全部由顾问产出，不是 UGC），互动收敛到收藏 / 转发 / 找顾问定制。 */
  const Card = ({ a }) => {
    const d = destOf(a.dest);
    const imgs = (a.imgs || []).filter(Boolean);
    const faved = isFav && isFav('article', a.id);
    return (<div className="cq-card">
      <div className="cq-au">
        <span className="av"><Icon n="user" s={13} c="#fff" /></span>
        <div className="nm"><b>{a.k || '优定制'}</b>
          <span className="vf"><Icon n="check" s={9} c="#fff" />优定制出品</span></div>
        <span className="dt">{(a.published_at || '').slice(0, 10)}</span>
      </div>
      <h3 onClick={() => go('article', a.id)}>{a.t}</h3>
      {a.lead && <p onClick={() => go('article', a.id)}>{a.lead}</p>}
      {a.dest && (
        <div className="cq-dest" onClick={() => go('destDetail', d ? d.name : a.dest)}>
          <Icon n="pin" s={13} c="var(--gold)" />
          <span>{a.dest}{d && d.region ? ' · ' + d.region : ''}</span>
          <Icon n="chevron" s={13} c="var(--muted-2)" />
        </div>)}
      {a.video
        ? (<div className="cq-video" onClick={() => go('article', a.id)}>
            <img src={oimg(a.img)} alt="" loading="lazy" />
            <span className="pl"><i /></span>
            <span className="tagv">视频</span>
          </div>)
        : imgs.length >= 3
          ? (<div className="cq-g3" onClick={() => go('article', a.id)}>
              {imgs.slice(0, 3).map((x, i) => <img key={i} src={oimg(x)} alt="" loading="lazy" />)}
            </div>)
          : (<div className="cq-one" onClick={() => go('article', a.id)}>
              <img src={oimg(a.img)} alt="" loading="lazy" /></div>)}
      <div className="cq-ft">
        <span className="rd"><Icon n="eye" s={13} c="var(--muted-2)" />{a.read}</span>
        <span className={'ac' + (faved ? ' on' : '')} onClick={() => { toggleFav && toggleFav('article', a.id); }}>
          <Icon n="heart" s={15} c={faved ? 'var(--brand)' : 'var(--muted)'} />{faved ? '已收藏' : '收藏'}</span>
        <span className="ac" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(location.href); toast('链接已复制，可转发给好友'); }}>
          <Icon n="send" s={15} c="var(--muted)" />转发</span>
        <button className="cta" onClick={() => go('form', { dest: a.dest, fromArticle: a.id })}>找他定制</button>
      </div>
    </div>);
  };

  const OpBlock = () => (
    <div className="cq-op">
      <div className="hd"><b>同款行程 · 臻品团</b>
        <span onClick={() => go('group')}>全部小团 ›</span></div>
      <div className="row">
        {groups.map(p => (
          <div className="it" key={p.id} onClick={() => go('product', p.id)}>
            <img src={oimg(p.cover)} alt="" />
            <div className="tx"><b>{p.title}</b>
              <span>{p.days} 天 · {money0(p.price_from)} 起</span></div>
          </div>))}
      </div>
    </div>);

  return (<>
    {/* 社区头（v57）：按参考图（大众点评首页）重做成两层。
        第一层 —— 一行大字频道主导航（关注 / 发现 / 专栏），当前项加粗并在下方带一小段
        品牌玫红色块下划线；最右是圆形头像入口，点进「我的」。左端保留一个小返回键：
        攻略社区不在底部 tab 里（showTabs 不含 guide），去掉返回客人就回不去首页了。
        第二层 —— 内容分类 chips，选中项填品牌玫红；原来压在「发现」正文区里的那排分类
        筛选整体上移到这里，正好对上参考图的两层结构，也少占一条高度。
        整块浅色渐变：玫红 + 香槟金两团柔光叠在米白纸底上（参考图那个绿色不用）。
        不展示「N 篇原创」这类文案。 */}
    <div className={'cq-head' + (showChips ? '' : ' one')}>
      <div className="ln1">
        <div className="bk" onClick={() => back('home')}><Icon n="back" s={14} c="var(--ink)" /></div>
        <nav className="nv">
          {MT.map(([k, t]) => (
            <a key={k} className={mtab === k ? 'on' : ''} onClick={() => setMtab(k)}>{t}</a>))}
        </nav>
        <div className="me" onClick={() => go('me')}><Icon n="user" s={15} c="#fff" /></div>
      </div>
      {showChips && (
        <div className="cts">
          {tabs.map(t => (
            <a key={t.k} className={ctab === t.k ? 'on' : ''} onClick={() => setCtab(t.k)}>{t.t}</a>))}
        </div>)}
    </div>

    {/* 关注：客人收藏过的内容 */}
    {mtab === 'follow' && (<div className="cq-wrap">
      {!guest ? (<div className="cq-null">
        <div className="ic">♡</div>
        <b>登录后可查看收藏的内容</b>
        <p>收藏攻略与游记，出行前随时回看</p>
        <button className="btn btn-p" onClick={() => onLogin && onLogin()}>立即登录</button>
      </div>) : !faved.length ? (<div className="cq-null">
        <div className="ic">♡</div>
        <b>还没有收藏的内容</b>
        <p>在「发现」或「专栏」里点收藏，内容会出现在这里</p>
        <button className="btn btn-p" onClick={() => setMtab('find')}>去发现看看</button>
      </div>) : !favList.length ? (<div className="cq-null">
        <div className="ic">♡</div>
        <b>这个分类下还没有收藏</b>
        <p>已收藏 {faved.length} 篇，换个分类看看</p>
        <button className="btn btn-p" onClick={() => setCtab('all')}>看全部收藏</button>
      </div>) : (<>
        <div className="cq-note">已收藏 {faved.length} 篇{ctab === 'all' ? '' : ' · 当前分类 ' + favList.length + ' 篇'}</div>
        <Fall l={favList} />
      </>)}
    </div>)}

    {/* 发现：全部内容瀑布流，按分类筛选 */}
    {mtab === 'find' && (<div className="cq-wrap">
      {/* 分类筛选已上移到社区头第二层，这里不再重复一排 chips */}
      {list.length ? (<>
        <Fall l={list.slice(0, 6)} />
        {!!groups.length && <OpBlock />}
        {list.length > 6 && <Fall l={list.slice(6)} />}
        <div className="cq-end">— 已展示全部 {list.length} 篇内容 —</div>
      </>) : <div className="empty"><div className="ic">◎</div>该分类内容持续更新中</div>}
    </div>)}

    {/* 专栏：按栏目聚合的 PGC 内容流 */}
    {mtab === 'advisor' && (<div className="cq-feed">
      {arts.map((a, i) => (
        <React.Fragment key={a.id}>
          <Card a={a} />
          {i === 2 && !!groups.length && (
            <div className="cq-op">
              <div className="hd"><b>同款行程 · 臻品团</b>
                <span onClick={() => go('group')}>全部小团 ›</span></div>
              <div className="row">
                {groups.map(p => (
                  <div className="it" key={p.id} onClick={() => go('product', p.id)}>
                    <img src={oimg(p.cover)} alt="" />
                    <div className="tx"><b>{p.title}</b>
                      <span>{p.days} 天 · {money0(p.price_from)} 起</span></div>
                  </div>))}
              </div>
            </div>)}
        </React.Fragment>))}
      {!arts.length && <div className="empty"><div className="ic">◎</div>内容持续更新中</div>}
      {!!arts.length && <div className="cq-end">— 已展示全部 {arts.length} 篇内容 —</div>}
    </div>)}
  </>);
}

/* ============ 目的地详情 ============ */
function DestDetail({ go, back, name, data }) {
  const d = (data.dests || []).find(x => x.name === name) || (data.dests || [])[0];
  const prods = useMemo(() => [...(data.inspire || []), ...(data.group || [])]
    .filter(p => (p.dest || '').includes(d?.name || '')), [data, d]);
  const arts = useMemo(() => {
    const all = data.articles || [];
    const hit = all.filter(a => a.dest === d?.name);
    // 本地的排前面，其余补足，横滑不会只有孤零零一张
    return [...hit, ...all.filter(a => a.dest !== d?.name)].slice(0, 5);
  }, [data, d]);
  if (!d) return <div className="empty" style={{ paddingTop: 140 }}>目的地信息整理中</div>;
  const it = d.intro || {};
  const gal = d.gallery || [d.cover];

  return (<>
    <div className="mi-nav"><div className="mi-back" onClick={() => back('dest')}><Icon n="back" s={15} c="#fff" /></div></div>

    {/* 氛围图 */}
    <div className="dd-hero">
      <img src={oimg(d.cover)} alt="" />
      <div className="c">
        <div className="en">{d.en}</div>
        <h1>{d.name}</h1>
        <p>{d.tagline}</p>
      </div>
    </div>

    {/* 目的地简介 */}
    <div className="dv-intro">
      <div className="dv-rule" />
      <div className="sub">{it.sub || d.tagline}</div>
      <p>{it.txt || ''}</p>
      <div className="tags">{(it.tags || []).map(t => <span key={t}>{t}</span>)}</div>
    </div>

    {/* 推荐玩法 */}
    {!!arts.length && (
      <div className="dv-sec">
        <div className="dv-h">
          <div className="ln"><i /><span>Things to do</span><i /></div>
          <h3>推荐玩法</h3>
          <p>实地走访原创内容</p>
        </div>
        <div className="pw">
          {arts.map(a => (
            <div className="pw-c" key={a.id} onClick={() => go('article', a.id)}>
              <div className="im"><img src={oimg(a.img)} alt="" loading="lazy" /></div>
              <div className="bd">
                <div className="k">{a.k}</div>
                <h4>{a.t}</h4>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    {/* 必打卡景点 */}
    {!!(d.poi || []).length && (
      <div className="dv-sec">
        <div className="dv-h">
          <div className="ln"><i /><span>Must See</span><i /></div>
          <h3>必打卡景点</h3>
          <p>{d.name}最不该错过的 {d.poi.length} 处</p>
        </div>
        {d.poi.map((x, i) => (
          <div className="mp" key={x.n} onClick={() => go('form', { dest: d.name })}>
            <span className="no">{String(i + 1).padStart(2, '0')}</span>
            <div className="t">
              <div className="k">{x.t}</div>
              <b>{x.n}</b>
              <p>{x.d}</p>
            </div>
            <div className="im"><img src={oimg(gal[i % gal.length] || d.cover)} alt="" loading="lazy" /></div>
          </div>
        ))}
      </div>
    )}

    {/* 推荐行程 */}
    {!!prods.length && (
      <div className="dv-sec">
        <div className="dv-h">
          <div className="ln"><i /><span>Journeys</span><i /></div>
          <h3>推荐行程</h3>
          <p>可根据出行时间、人数与预算调整</p>
        </div>
        {prods.map(p => (
          <div className="jn" key={p.id} onClick={() => go('product', p.id)}>
            <div className="im"><img src={oimg(p.cover)} alt="" loading="lazy" /><span className="d">{p.days} 天</span></div>
            <div className="bd">
              <h4>{p.title}</h4>
              <div className="s">{p.subtitle}</div>
              <div className="ft"><em>¥</em><strong>{money0(p.price_from)}</strong><s>起/人</s>
                <span className="go">查看行程 <Icon n="arrow" s={11} c="var(--accent)" /></span></div>
            </div>
          </div>
        ))}
      </div>
    )}

    <div style={{ height: 18 }} />

    {/* 吸底定制入口 */}
    <div className="dd-foot">
      <div className="in">
        <div className="t"><b>定制您的专属行程</b><span>1 个工作日内给到含报价的方案</span></div>
        <button onClick={() => go('form', { dest: d.name })}>开始定制</button>
      </div>
    </div>
  </>);
}

/* ============ 壳 ============ */
/* 已经自带咨询 / 下单固定入口的页面，不再浮出「在线咨询」胶囊（否则同一个动作出现两次）：
     product   底部操作条「AI 规划 / 咨询该小团」
     plan      底部操作条「采用此方案」
     article   底部操作条「提交定制需求」
     destDetail吸底「开始定制」
     form / ai 页面本身就是需求提交 / AI 规划入口
     trip      行程页自带翻页条与「对这一天的安排提意见」
     me        「专属顾问 · 去咨询」+「提交定制需求」
     orderDetail「联系我的顾问」
   新增页面时只要在这张表里登记一次，不要在别处再写 if。 */
/* home 改版后自带顾问条（「去聊聊」）与底部 AI 行程师两个入口，
   再压一颗玫红圆角悬浮球既多余，也和首页零圆角的版面打架 */
/* 小程序里所有合法页面。不在这张表里的地址走兜底页，不能白屏。 */
const MINI_PAGES = ['home', 'dest', 'group', 'product', 'ai', 'plan', 'form', 'submitted', 'me',
  'myorders', 'myconsults', 'orderDetail', 'travelers', 'profile', 'member', 'consultDetail',
  'chat', 'about', 'favs', 'policy', 'policyDoc', 'trip', 'article', 'guide', 'destDetail',
  'stories', 'story', 'storyShare'];

/* 页面没内容时的统一兜底：说清楚发生了什么 + 给一条出路，不要留白屏 */
function Gone({ go, t, s, bt, bp }) {
  return (<div className="mi-gone">
    <div className="ic"><Icon n="compass" s={26} c="var(--muted-2)" /></div>
    <b>{t}</b>
    <p>{s}</p>
    <button className="btn btn-p" onClick={() => go(bp || 'home')}>{bt || '回首页'}</button>
  </div>);
}

const PAGES_WITH_CONSULT_ENTRY = ['home', 'dest', 'product', 'plan', 'article', 'destDetail', 'form', 'ai', 'trip', 'me', 'orderDetail', 'chat', 'consultDetail', 'about', 'member', 'favs', 'travelers', 'profile', 'submitted'];
const TABS = [['home', 'home', '首页'], ['dest', 'map', '目的地'], ['ai', 'sparkle', 'AI 行程师'], ['group', 'ticket', '臻品团'], ['me', 'user', '我的']];
export default function Mini() {
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  /* 页面写进地址栏：产品、内容这类可分享的页面要能被外部链接直接打开
     （后台「复制小程序链接」发出去的就是 #/mini/product/<产品编号>）。
     首次进入按地址栏还原，之后页面切换回写地址，参数只写字符串型的。 */
  const seg = loc.pathname.replace(/^\/mini\/?/, '').split('/').filter(Boolean);
  const [page, setPage] = useState(seg[0] || 'home');
  const [arg, setArg] = useState(seg[1] ? decodeURIComponent(seg[1]) : null);
  /* 开屏只在「从首页进入」时播一次。刷新页面会重播（组件重新挂载），
     小程序内切 tab 回首页不会重播。分享链接直达产品页时不播，免得挡住内容。 */
  const [splash, setSplash] = useState(() => (seg[0] || 'home') === 'home');
  const [plan, setPlan] = useState(null);
  const [planReq, setPlanReq] = useState({});
  const [guest, setGuest] = useState(() => { try { return JSON.parse(localStorage.utripGuest || 'null'); } catch { return null; } });
  const [login, setLogin] = useState(false);
  const [favs, setFavs] = useState([]);
  const phone = guest ? guest.phone : '';
  const setPhone = () => {};
  const scRef = useRef();
  const { d: data, loading } = useData(() => get('/api/mini/home'), [], {});
  useEffect(() => {
    if (!guest) { setFavs([]); return; }
    get('/api/mini/fav?phone=' + guest.phone).then(setFavs).catch(() => {});
  }, [guest]);
  const isFav = (kind, ref) => favs.some(f => f.kind === kind && f.ref === ref);
  const toggleFav = async (kind, ref) => {
    if (!guest) { setLogin(true); return; }
    try {
      const r = await post('/api/mini/fav', { phone: guest.phone, kind, ref });
      setFavs(f => r.on ? [...f, { kind, ref }] : f.filter(x => !(x.kind === kind && x.ref === ref)));
      toast(r.on ? '已收藏，可在「我的 · 我的收藏」中查看' : '已取消收藏');
    } catch (e) { toast(e.message); }
  };
  const doLogin = g => { setGuest(g); localStorage.utripGuest = JSON.stringify(g); setLogin(false); toast('欢迎，' + g.nick); };
  /* 提交需求时填的手机号服务端已建档，若此前未登录就直接认下来，免得客人回「我的」还是空的 */
  const adopt = g => { if (!guest && g) { setGuest(g); localStorage.utripGuest = JSON.stringify(g); } };
  const doLogout = () => { setGuest(null); localStorage.removeItem('utripGuest'); toast('已退出登录'); };
  /* 小程序内部的返回栈。地址栏是 replace 写入的，浏览器 history 用不上，
     所以自己记一条来路链；back() 回上一页，栈空时兜底回首页，保证任何子页都有退路。 */
  const stack = useRef([]);
  /* 版本自检：小程序页面开着不动时不会重新请求 index.html，
     我们发了新版，客人手上跑的还是旧代码（2026-09-28 就因此让业务方看到了旧流程）。
     每 2 分钟、以及每次页面重新可见时比对一次服务端的入口文件名，
     发现变了就刷新——但正在填写的页面不打断，等他切走再刷。 */
  const staleRef = useRef(false);
  useEffect(() => {
    const mine = ((document.querySelector('script[type="module"][src*="index-"]') || {}).src || '')
      .match(/(index-[\w-]+\.js)/);
    const cur = mine && mine[1];
    if (!cur) return;
    let dead = false;
    const TYPING = ['form', 'ai', 'plan', 'chat', 'profile', 'travelers'];
    const check = async () => {
      try {
        const r = await get('/api/app-version');
        if (dead || !r || !r.v || r.v === cur) return;
        staleRef.current = true;
        if (!TYPING.includes(pageRef.current)) location.reload();
      } catch (e) { /* 网络抖动不管 */ }
    };
    const t = setInterval(check, 120000);
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    check();
    return () => { dead = true; clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  const go = (p, a) => {
    /* 有新版在等着：客人离开填写页的这一下就是最好的刷新时机 */
    if (staleRef.current && !['form', 'ai', 'plan', 'chat', 'profile', 'travelers'].includes(p)) {
      location.reload(); return;
    }
    if (p !== page) stack.current.push({ p: page, a: arg });
    setArg(a ?? null); setPage(p); if (scRef.current) scRef.current.scrollTop = 0;
  };
  const back = (fb = 'home') => {
    const prev = stack.current.pop();
    const t = prev || { p: fb, a: null };
    setArg(t.a ?? null); setPage(t.p); if (scRef.current) scRef.current.scrollTop = 0;
  };
  const pageRef = useRef(page);
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { if (scRef.current) scRef.current.scrollTop = 0; }, [page]);
  useEffect(() => {
    const path = `/mini${page === 'home' ? '' : '/' + page}`
      + (typeof arg === 'string' && arg ? '/' + encodeURIComponent(arg) : '');
    if (loc.pathname !== path) nav(path, { replace: true });
  }, [page, arg]);
  /* 反向同步：浏览器前进后退、或在已打开的小程序里直接改地址栏时，页面要跟着走。
     arg 为对象（如表单预填）时地址栏只有页面段，这种情况不回写 arg，免得把预填冲掉。 */
  useEffect(() => {
    const sg = loc.pathname.replace(/^\/mini\/?/, '').split('/').filter(Boolean);
    const p = sg[0] || 'home';
    const a = sg[1] ? decodeURIComponent(sg[1]) : null;
    if (p !== page) { setPage(p); setArg(a); }
    else if (!(arg && typeof arg === 'object') && a !== arg) setArg(a);
  }, [loc.pathname]);

  /* 采用此方案 = 正式提交。
     把客人刚看过的那一版 plan 一并传给后端落库，保证「客人看到的」「CSP 里的」
     「推送回来的」是同一份内容，而不是后端再算一遍。 */
  const submitPlan = async () => {
    if (!guest) { setLogin(true); return toast('请先登录，方便定制师与您联系'); }
    try {
      const r = await post('/api/mini/ai/submit', {
        ...planReq, plan, source: 'mini_ai',
        customer: guest.nick || '微信用户', phone: guest.phone });
      adopt(r.guest);
      go('submitted', { no: r.no, dest: (planReq || {}).dest, days: (planReq || {}).days });
    } catch (e) { toast(e.message); }
  };
  const darkHead = ['product', 'plan', 'form', 'article', 'destDetail', 'me'].includes(page);
  const darkBar = darkHead;
  const showTabs = ['home', 'dest', 'ai', 'group', 'me'].includes(page);

  return (<div className="mi-stage">
    <div className="mi-wrap">
      <div className="mi-note">
        <div className="tk" style={{ color: 'var(--gold-2)' }}>GUEST MINI-APP</div>
        <h2 className="serif" style={{ color: '#fff', fontSize: 27, fontWeight: 400, margin: '10px 0 12px' }}>优定制 · 客人端</h2>
        <p style={{ fontSize: 13, lineHeight: 1.85, margin: '0 0 18px' }}>
          客人从这里进：浏览灵感之旅、让 AI 行程师排一版、或直接提交定制需求。
          提交后即刻落成咨询单，门店工作台「待接单」里就能看到。
        </p>
        <div style={{ borderTop: '1px solid rgba(255,255,255,.12)', paddingTop: 16 }}>
          {['首页 · 目的地 · 臻品团 · 我的', 'AI 行程师（结构化出方案）', '需求表单（目的地/预算必填）', '提交即落单 → 门店看板'].map(t =>
            <div key={t} style={{ fontSize: 12.3, marginBottom: 7, display: 'flex', gap: 8 }}>
              <span style={{ color: 'var(--gold)' }}>—</span>{t}</div>)}
        </div>
        <button className="btn btn-o btn-s" style={{ marginTop: 20, background: 'transparent', color: '#cfd6d3', borderColor: 'rgba(255,255,255,.2)' }}
          onClick={() => nav('/')}><Icon n="back" s={14} />返回平台首页</button>
      </div>

      <div className="mi-phone"><div className="mi-screen"><div className="mi-app">
        <div className={darkBar ? '' : 'sb-solid'}
          /* 状态栏只是装饰：这层壳必须放行点击，否则顶部 44px 内的返回键等按钮会被它整片吞掉 */
          style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 14, pointerEvents: 'none' }}><StatusBar dark={!darkBar} /></div>
        <div className="mi-scroll" ref={scRef} style={{ paddingTop: 0 }}>
          {loading ? <div className="empty" style={{ paddingTop: 160 }}>载入中…</div> : <>
            {page === 'home' && <Home go={go} data={data} />}
            {page === 'dest' && <Dest go={go} data={data} preset={arg} />}
            {page === 'group' && <Group go={go} data={data} />}
            {page === 'product' && <Product go={go} back={back} id={arg} isFav={isFav} toggleFav={toggleFav} onConsult={p => go('form', { dest: p.dest })} />}
            {page === 'ai' && <Ai go={go} data={data} preset={arg} onPlan={(p, r) => { setPlan(p); setPlanReq(r); go('plan'); }} />}
            {/* 方案只存在内存里：刷新、从提交成功页返回、或直接打开 /mini/plan 时它就没了。
                原来这种情况下整页什么都不渲染 —— 就是客人看到的白屏。 */}
            {/* 方案预览：客人提交前先完整看一遍。方案只存在内存里，
                刷新或从提交成功页返回时它就没了，那种情况给兜底，不能整页空白。 */}
            {page === 'plan' && (plan
              ? <PlanView p={plan} req={planReq} go={go} back={back} onSubmit={submitPlan} />
              : <Gone go={go} t="这版方案已经不在了"
                  s="行程方案只在当前会话里保留，页面刷新或退出后需要重新生成一版。"
                  bt="重新让 AI 排一版" bp="ai" />)}
            {page === 'form' && <Form go={go} back={back} data={data} preset={arg} guest={guest}
              onDone={(r, req) => { adopt(r.guest); go('submitted', { no: r.no, dest: (req || {}).dest, days: (req || {}).days }); }} />}
            {page === 'submitted' && <Submitted go={go} arg={arg} data={data} />}
            {page === 'me' && <Me go={go} guest={guest} onLogin={() => setLogin(true)} onLogout={doLogout} />}
            {page === 'myorders' && <MyOrders go={go} back={back} guest={guest} onOpen={n => go('orderDetail', n)} />}
            {page === 'myconsults' && <MyConsults go={go} back={back} guest={guest} />}
            {page === 'orderDetail' && <MyOrderDetail go={go} no={arg} guest={guest} onBack={() => back('myorders')} />}
            {page === 'travelers' && <Travelers go={go} back={back} guest={guest} />}

            {page === 'profile' && <Profile back={back} guest={guest} onSaved={g2 => { setGuest(g2); localStorage.utripGuest = JSON.stringify(g2); }} />}
            {page === 'member' && <MemberCenter back={back} guest={guest} onLogin={() => setLogin(true)} />}
            {page === 'consultDetail' && <ConsultDetail go={go} back={back} no={arg} guest={guest} />}
            {page === 'chat' && <CustomerService back={back} guest={guest} preset={typeof arg === 'string' ? arg : null} onLogin={() => setLogin(true)} />}
            {page === 'about' && <About back={back} go={go} data={data} />}
            {page === 'favs' && <Favs go={go} back={back} guest={guest} />}
            {page === 'stories' && <StoryList guest={guest} back={() => back('me')} onOpen={no => go('story', no)} />}
            {page === 'story' && <StoryBook guest={guest} orderNo={arg} back={() => back('stories')} />}
            {page === 'storyShare' && <StoryShare token={arg} onBack={() => back('me')} />}
            {page === 'policy' && <Policy go={go} back={back} />}
            {page === 'policyDoc' && <PolicyDoc back={back} k={arg} />}
            {page === 'trip' && <TripView token={arg} onBack={() => back('me')} />}
            {page === 'article' && <Article go={go} back={back} id={arg} data={data} isFav={isFav} toggleFav={toggleFav} />}
            {page === 'guide' && <Guide go={go} back={back} data={data} preset={typeof arg === 'string' ? arg : null}
              isFav={isFav} toggleFav={toggleFav} guest={guest} onLogin={() => setLogin(true)} />}
            {page === 'destDetail' && <DestDetail go={go} back={back} name={arg} data={data} />}
            {/* 地址写错或旧链接：以前什么都不渲染，页面是全白的，客人只会以为程序坏了 */}
            {!MINI_PAGES.includes(page) && <Gone go={go} t="页面不存在"
              s="这个地址可能已经失效，或者链接不完整。" bt="回首页" bp="home" />}
          </>}
        </div>
        {showTabs && <div className={'mi-tabs' + (['home', 'dest', 'me'].includes(page) ? ' nh-tabs' : '')}>
          {TABS.map(([k, ic, t]) => k === 'ai' ? (
            <div key={k} className={'mi-tab raise' + (page === k ? ' on' : '')} onClick={() => go(k)}>
              {/* 首页改版后 tab 栏是纸白配墨绿，原来那颗黑金圆角徽章跟它打架。
                  首页用同一套语言的方块 + 线条标；其余页面仍是金色系，保持徽章不变。 */}
              {/* 中间这颗一律用原来那枚带 Ai 字样的徽章。换成线条标之后唐美芳说「有点丑」，
                  而且那枚徽章本来就是「AI 定制」的品牌符号，不该为了配色把它换掉 */}
              <div className="bump"><AiBadge s={54} /></div>
            </div>
          ) : (
            <div key={k} className={'mi-tab' + (page === k ? ' on' : '')} onClick={() => go(k)}>
              <Icon n={ic} s={18} sw={page === k ? 1.9 : 1.6} />{t}<i className="dt" />
            </div>
          ))}
        </div>}
        {splash && <Splash data={data} onDone={() => setSplash(false)} />}
        {!PAGES_WITH_CONSULT_ENTRY.includes(page) && (
          <div className={'chat-fab' + (showTabs ? '' : ' low')} onClick={() => go('chat')}>
            <div className="av"><Icon n="chat" s={15} c="#fff" /></div>
            <div><b>在线咨询</b><span>{data.advisor?.name || '李晴'} · 秒回</span></div>
          </div>
        )}
        {login && <LoginPage onClose={() => setLogin(false)} onDone={doLogin}
          hero={(data.splash || {}).img || (data.banners || [])[0]?.img}
          heroVideo={(data.splash || {}).video || (data.banners || [])[0]?.video} />}

      </div></div></div>
    </div>

  </div>);
}
