const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const { plan, DEST, BANK } = require('./planner');
const TPL = require('./tpl.js');
const VENDOR = require('./vendor.js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '60mb' }));
app.use((req, res, next) => { if (req.url.startsWith('/utrip/api/')) req.url = req.url.slice(6); next(); });

const J = o => JSON.stringify(o);
const P = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const QUOTE = require('./quote.js');
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
/* 咨询单状态精简为 5 态：原「已接单 / 方案已确认」合并为「跟进中」（方案是否确认降为
   plan_ok 进度标记），原「供应商报价中 / 供应商已报价」合并为「报价中」（回价家数由报价记录派生）。 */
/* taken（门店已接单）原先不在这张表里，凡是这个状态的咨询单，
   小程序和后台的状态文字都渲染成空白 */
const ST_CN = { pending: '待接单', taken: '已接单', following: '跟进中', quoting: '报价中',
  won: '已成交', lost: '已流失' };
/* 旅行偏好：与小程序 AI 行程师的选项一一对应 */
const SRC_CN = { mini_form: '小程序 · 需求表单', mini_ai: '小程序 · AI 行程师',
  csp_agent: '门店 · 定制师对话', csp_manual: '门店 · 手工建单',
  share_page: '销售分享页 · 客户下单' };
const PREF_CN = { family: '亲子旅行', nature: '自然风光', hidden: '小众秘境', leisure: '休闲度假',
  food: '美食探店', culture: '人文古迹', honeymoon: '蜜月浪漫', photo: '摄影出片', luxury: '高端奢享' };
const OPEN = ['pending', 'taken', 'following', 'quoting'];
const log = (no, who, act, detail) => db.prepare('INSERT INTO log (consult_no,who,act,detail) VALUES (?,?,?,?)').run(no, who, act, detail);
const touch = no => db.prepare("UPDATE consult SET updated_at=datetime('now','localtime') WHERE no=?").run(no);
const touchBy = (no, who) => db.prepare("UPDATE consult SET updated_at=datetime('now','localtime'), updated_by=? WHERE no=?").run(who || null, no);

function newNo(pfx = 'DZ') {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return pfx + String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) + String(Math.floor(100 + Math.random() * 900));
}
function fullConsult(no) {
  const c = db.prepare('SELECT * FROM consult WHERE no=?').get(no);
  if (!c) return null;
  c.prefs = P(c.prefs, []); c.sup_vendors = P(c.sup_vendors, []);
  const plans = db.prepare('SELECT * FROM plan WHERE consult_no=? ORDER BY ver').all(no).map(p => ({
    ...p, highlights: P(p.highlights, []), geo: P(p.geo, null),
    days: db.prepare('SELECT * FROM day WHERE plan_id=? ORDER BY d').all(p.id).map(d => ({ ...d, items: P(d.items, []) })),
  }));
  return {
    ...c, plans, cur: plans.find(p => p.is_cur) || plans[plans.length - 1] || null,
    quotes: db.prepare('SELECT * FROM quote WHERE consult_no=? ORDER BY (total IS NULL), total').all(no).map(q => ({
      ...q, items: P(q.items, []),
      res: db.prepare('SELECT * FROM quote_res WHERE consult_no=? AND supplier_id=? ORDER BY cate, id').all(no, q.supplier_id),
    })),
    tpl: TPL.match(c.dest, c.theme).tpl,
    feedback: db.prepare('SELECT * FROM feedback WHERE consult_no=? ORDER BY round,d').all(no),
    logs: db.prepare('SELECT * FROM log WHERE consult_no=? ORDER BY id DESC').all(no),
  };
}
function savePlan(no, p, { ver, name, kind = 'ai', memo = '' } = {}) {
  const v = ver || ((db.prepare('SELECT MAX(ver) m FROM plan WHERE consult_no=?').get(no).m || 0) + 1);
  db.prepare('UPDATE plan SET is_cur=0 WHERE consult_no=?').run(no);
  /* 出方案时按「目的地 + 主题」挑行程模板：模块清单、模块标题、客人端配色都由它决定。
     挑到哪套要落到单子和这一版方案上——换了模板重出方案时能看出前后用的不是同一套。 */
  const cc = db.prepare('SELECT dest, theme FROM consult WHERE no=?').get(no) || {};
  const mt = TPL.match(cc.dest, cc.theme);
  const tid = mt.tpl ? mt.tpl.id : null, tname = mt.tpl ? mt.tpl.name : null;
  db.prepare('UPDATE consult SET tpl_id=?, tpl_name=? WHERE no=?').run(tid, tname, no);
  const pid = db.prepare(`INSERT INTO plan (consult_no,ver,name,route,tagline,highlights,total,quote_note,cover,geo,is_cur,kind,memo,tpl_id,tpl_name)
    VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)`).run(no, v, name || p.name, p.route, p.tagline, J(p.highlights), p.total, p.quoteNote, p.cover, J(p.geo), kind, memo, tid, tname).lastInsertRowid;
  const ins = db.prepare('INSERT INTO day (plan_id,d,title,city,items,hotel,meals,pic,exp,food,drive) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  p.days.forEach(d => ins.run(pid, d.d, d.title, d.city, J(d.items), d.hotel, d.meals, d.pic, d.exp, d.food, d.drive || null));
  /* 报价要素：注意事项 / 费用包含 / 不含 / 接待标准。
     先写默认文案，运营可以按单改 —— 这几块讲不清楚，行中和退改都要扯皮。 */
  db.prepare('UPDATE plan SET notice=?, fee_inc=?, fee_exc=?, standard=? WHERE id=?')
    .run(J(QUOTE.NOTICE), J(QUOTE.FEE_INC), J(QUOTE.FEE_EXC), J(QUOTE.STANDARD), pid);
  /* 航班：本期由运营在后台维护，不接航司库存。按目的地给一组合理的推荐航班。 */
  const fl = QUOTE.DEMO_FLIGHTS[cc.dest];
  if (fl) {
    const insF = db.prepare(`INSERT INTO plan_flight
      (plan_id,d,airline,fno,from_city,from_air,dep_time,to_city,to_air,arr_time,stop,sort)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    fl.forEach((f, i) => insF.run(pid, 1, f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[7], f[8] || '', i));
    const last = fl[fl.length - 1];
    insF.run(pid, (p.days || []).length || 1, last[0], last[1].replace(/\d+$/, m => String(+m + 1)),
      last[5], last[6], '10:50', last[2], last[3], '06:30', '', 99);
  }
  db.prepare('UPDATE consult SET quote=? WHERE no=?').run(p.total, no);
  return pid;
}

/* ============ META ============ */
app.get('/api/meta', (req, res) => {
  const home = {}; db.prepare('SELECT * FROM home_config').all().forEach(r => home[r.k] = P(r.v, null));
  res.json({
    home,
    dests: Object.entries(DEST).map(([k, v]) => ({ key: k, name: v.name, en: v.en, region: v.region, tagline: v.tagline, cities: v.cities.map(c => c.name), cover: (BANK[v.img[0]] || [])[0] })),
    sales: db.prepare('SELECT * FROM sales').all(),
    suppliers: db.prepare('SELECT * FROM supplier').all().map(s => ({ ...s, dests: P(s.dests, []) })),
    channel: db.prepare('SELECT * FROM channel').get(),
  });
});

/* ============ 小程序 ============ */
app.get('/api/mini/home', (req, res) => {
  let home = activeCfg();
  const lib = {}; db.prepare('SELECT * FROM home_config').all().forEach(r => lib[r.k] = P(r.v, null));
  if (!home) home = lib;
  // 内容库（文章 / 内容页签）始终以「内容管理」为准，首页配置只负责版面
  // 小程序只拿「已发布」的内容；待发布与已撤销不对外
  home = { ...home,
    articles: (lib.articles || []).filter(a => (a.status || 'draft') === 'published'),
    ctabs: lib.ctabs || home.ctabs || [],
    /* 开屏：优先跟着当前首页方案走（不同渠道可以有不同开屏），
       方案里没配就回落到全局配置，再没有就用第一张 banner */
    splash: home.splash || lib.splash || null,
    brand: home.brand || lib.brand || null,
    /* 首页改版后新增的几块也走同一套回落，后台仍然可配 */
    heroVt: home.heroVt || lib.heroVt || null,
    heroVl: home.heroVl || lib.heroVl || null,
    duo: home.duo || lib.duo || null,
    trio: home.trio || lib.trio || null,
    story: home.story || lib.story || null,
    memberLv: home.memberLv || lib.memberLv || null,
    memberTip: home.memberTip || lib.memberTip || null,
    couponN: home.couponN != null ? home.couponN : (lib.couponN != null ? lib.couponN : null),
    destCover: home.destCover || lib.destCover || null,
    destVideo: home.destVideo || lib.destVideo || null };
  const prods = db.prepare("SELECT * FROM product WHERE status='published' AND IFNULL(zx_sale_status,'在售')<>'停售' ORDER BY sort DESC").all()
    .map(p => ({ ...p, gallery: P(p.gallery, []), tags: P(p.tags, []), highlights: P(p.highlights, []), outline: P(p.outline, []), depart: P(p.depart, null), spots: P(p.spots, []), itinerary: P(p.itinerary, []), process: P(p.process, []), endorse: P(p.endorse, []) }));
  const cnt = home.counter || { base: 700000 };
  const live = cnt.base + Math.floor((Date.now() / 60000) % 5000);
  res.json({
    ...home, counter: { ...cnt, value: live },
    inspire: prods.filter(p => p.type === 'inspire'),
    group: prods.filter(p => p.type === 'smallgroup'),
    dests: Object.entries(DEST).map(([k, v]) => ({ key: k, name: v.name, en: v.en, region: v.region, tagline: v.tagline,
      /* 最佳季节走后台配置（destSeason），没配的目的地不显示这一栏 */
      season: ((home.destSeason || lib.destSeason || {})[v.name]) || null,
      /* 封面同样可被后台覆盖，图库里那批游客快照撑不起版面 */
      coverOv: ((home.destCover || lib.destCover || {})[v.name]) || null,
      /* 目的地短片：不是每个都有，配了的在列表打视频标、详情页能就地播 */
      video: ((home.destVideo || lib.destVideo || {})[v.name]) || null,
      cities: v.cities.map(c => c.name), base: v.base, poi: v.poi || [], intro: v.intro || null, gallery: (v.img || []).flatMap(t => (BANK[t] || []).slice(0, 2)),
      cover: ((home.destCover || lib.destCover || {})[v.name]) || (BANK[v.img[0]] || [])[0] })),
    recent: db.prepare("SELECT customer,dest,days,created_at FROM consult ORDER BY created_at DESC LIMIT 8").all(),
  });
});
app.get('/api/mini/products', (req, res) => {
  const { type, region, dest, q } = req.query;
  let sql = "SELECT * FROM product WHERE status='published' AND IFNULL(zx_sale_status,'在售')<>'停售'", args = [];
  if (type) { sql += ' AND type=?'; args.push(type); }
  if (region) { sql += ' AND region=?'; args.push(region); }
  if (dest) { sql += ' AND dest LIKE ?'; args.push('%' + dest + '%'); }
  if (q) { sql += ' AND (title LIKE ? OR dest LIKE ? OR subtitle LIKE ?)'; args.push('%'+q+'%','%'+q+'%','%'+q+'%'); }
  sql += ' ORDER BY sort DESC';
  res.json(db.prepare(sql).all(...args).map(p => ({ ...p, gallery: P(p.gallery, []), tags: P(p.tags, []), highlights: P(p.highlights, []), outline: P(p.outline, []), depart: P(p.depart, null) })));
});
/* ============ 销售分享给客人的产品行程页 ============
   和小程序里的产品详情（TOC 视角）不是一个东西：客人从销售这儿拿到链接时，
   关心的是「多少钱、哪天走、每天吃住怎么安排、怎么走」，以及这单走到哪一步了。
   所以这里额外给出：按人数算好的总价、按出发日期铺开的每日日期、
   拆成三餐的餐食、跨城交通、以及顶部那条「行程报价 → 签约合同 → 支付订单」。 */
const COORDS_SHARE = require('./db/coords');

/* 产品里三餐存成一句「早餐：酒店 / 午餐：自理」，分享页要一餐一格。
   解析不出来的按「敬请自理」显示——不要留空，这恰恰是客人最在意的一项。 */
function meals3(s) {
  const t = String(s || '');
  const pick = k => {
    const m = new RegExp(k + '[：:]\\s*([^/／、，,；;]+)').exec(t);
    return m ? m[1].trim() : '';
  };
  const ac = /自理|自行|不含/.test(t);
  return ['早餐', '午餐', '晚餐'].map(k => {
    const v = pick(k);
    return { k, v: v || (ac || !t ? '敬请自理' : '敬请自理') };
  });
}

/* 跨城那天给一段交通：首日与末日算国际航班，中间按坐标估公路里程。
   和每日行程里的「参考车程」同一套算法（db/coords + 直线 ×1.25 ÷ 75km/h）。 */
function legOf(prevCity, city, fromCity, i, total) {
  if (i === 0) return { kind: 'flight', from: fromCity || '北京', to: city, note: '国际航班 · 具体航班以出票为准' };
  if (i === total - 1) return { kind: 'flight', from: city, to: fromCity || '北京', note: '返程航班 · 具体航班以出票为准' };
  if (!prevCity || prevCity === city) return null;
  const a = COORDS_SHARE[prevCity], b2 = COORDS_SHARE[city];
  if (!a || !b2) return { kind: 'car', from: prevCity, to: city, note: '专车转场' };
  const dx = (a[0] - b2[0]) * 85, dy = (a[1] - b2[1]) * 111;
  const km = Math.round(Math.sqrt(dx * dx + dy * dy) * 1.25 / 10) * 10;
  if (km < 30) return null;
  const hr = Math.round((km / 75) * 2) / 2;
  return { kind: 'car', from: prevCity, to: city, note: `专车转场 · 约 ${km} 公里 / ${hr} 小时` };
}

/* 分享页下单：客人看完销售发来的行程，直接在页面底部提交意向。
   落的还是同一张咨询单表 —— 顾问在 CSP 里看到的是「销售分享页 · 客户下单」这个来源，
   并且带着具体产品、人数与出行日期，不用再回头问一遍。
   同样遵守新流程：落单后 guest_visible=0，顾问核对确认后才对客户发布。 */
app.post('/api/share/order', (req, res) => {
  const b = req.body || {};
  const p = db.prepare('SELECT * FROM product WHERE id=?').get(String(b.productId || ''));
  if (!p) return res.status(404).json({ err: '产品不存在或已下架' });
  const phone = String(b.phone || '').trim();
  if (!/^1\d{10}$/.test(phone)) return res.status(400).json({ err: '请填写正确的手机号' });
  const customer = String(b.customer || '').trim().slice(0, 20) || '客户';
  const pax = Math.max(1, Math.min(60, parseInt(b.pax, 10) || 2));
  const child = Math.max(0, Math.min(30, parseInt(b.child, 10) || 0));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || '')) ? b.date : '';

  /* 防重：同一个人对同一条产品 3 分钟内重复提交，复用已有那张单 */
  const dup = db.prepare(`SELECT no FROM consult WHERE phone=? AND product_id=?
    AND created_at > datetime('now','localtime','-3 minutes') ORDER BY created_at DESC LIMIT 1`)
    .get(phone, p.id);
  if (dup) return res.json({ ok: 1, no: dup.no, dedup: 1 });

  const no = newNo();
  const token = 'sh' + Math.random().toString(36).slice(2, 10);
  const adultP = p.price_from || 0;
  const childP = p.child_price || Math.round(adultP * 0.75);
  db.prepare(`INSERT INTO consult (no,source,status,customer,phone,from_city,dest,region,go_date,days,
      adults,children,elders,budget,theme,prefs,note,product_id,channel_id,shop,quote,share_token,guest_visible)
    VALUES (?,'share_page','pending',?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,'C001','优定制 · 望京旗舰店',?,?,0)`).run(
    no, customer, phone, p.from_city || '北京', p.dest, p.region, date, p.days,
    pax, child, adultP * pax + childP * child, p.theme || '', J([]),
    String(b.note || '').slice(0, 300), p.id, adultP * pax + childP * child, token);
  db.prepare('UPDATE consult SET created_by=?, updated_by=? WHERE no=?').run(customer, customer, no);
  log(no, '客户', '提交意向',
    `客户在销售分享页提交意向 · ${p.title} · ${pax} 成人${child ? ' + ' + child + ' 儿童' : ''}${date ? ' · ' + date + ' 出发' : ''}`);
  ensureGuest(phone, customer, 'share_page');
  res.json({ ok: 1, no });
});

app.get('/api/share/product/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM product WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ err: '产品不存在或已下架' });
  const pax = Math.max(1, Math.min(60, parseInt(req.query.pax, 10) || 2));
  const child = Math.max(0, Math.min(30, parseInt(req.query.child, 10) || 0));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? req.query.date : '';
  /* 进度：销售把链接发出去时通常停在第一步，后面两步由销售在后台推进 */
  const step = Math.max(0, Math.min(2, parseInt(req.query.step, 10) || 0));
  const sales = String(req.query.sales || '').slice(0, 20);

  const it = P(p.itinerary, []);
  const total = it.length || p.days || 0;
  const d0 = date ? new Date(date + 'T00:00:00') : null;
  const ymd = n => {
    if (!d0) return '';
    const x = new Date(d0.getTime() + n * 86400000);
    return `${x.getFullYear()}.${String(x.getMonth() + 1).padStart(2, '0')}.${String(x.getDate()).padStart(2, '0')}`;
  };
  const days = it.map((x, i) => ({
    d: x.d || i + 1, date: ymd(i), city: x.city || '', title: x.title || '',
    items: Array.isArray(x.items) ? x.items : [],
    /* 产品里常把续住那天写成「同上」，客人看不懂同的是哪家，往回翻一版把名字带出来 */
    hotel: (/^同上/.test(String(x.hotel || '')) && i > 0
      ? (it.slice(0, i).reverse().find(y => y.hotel && !/^同上/.test(String(y.hotel))) || {}).hotel
      : x.hotel) || '',
    sameHotel: i > 0 && !!x.hotel && (/^同上/.test(String(x.hotel))
      || x.hotel === (it[i - 1] || {}).hotel),
    meals: meals3(x.meals), exp: x.exp || '', food: x.food || '', pic: x.pic || '',
    leg: legOf(i > 0 ? (it[i - 1] || {}).city : null, x.city, p.from_city, i, total),
    spotN: (Array.isArray(x.items) ? x.items : []).length,
  }));

  /* 报价：成人按产品起价，儿童有单独价就用单独价，没有按成人的 75% —— 和报价单口径一致 */
  const adultP = p.price_from || 0;
  const childP = p.child_price || Math.round(adultP * 0.75);
  const sum = adultP * pax + childP * child;

  res.json({
    id: p.id, code: p.code || p.id, title: p.title, subtitle: p.subtitle,
    cover: p.poster || p.cover, gallery: P(p.gallery, []), dest: p.dest, region: p.region,
    days: p.days, nights: p.nights, from_city: p.from_city || '北京',
    product_type: p.product_type, travel_type: p.travel_type, brand: p.brand,
    highlights: P(p.highlights, []), spots: P(p.spots, []), tags: P(p.tags, []),
    extra: p.extra || '',
    quote: { adult: adultP, childPrice: childP, pax, child, total: sum,
      note: `${pax} 位成人${child ? ` + ${child} 位儿童` : ''} · ${p.days} 天 · 含机票住宿与当地服务` },
    go_date: date, days_detail: days, step, sales,
    shop: '优定制 U-DESIGN',
  });
});

app.get('/api/mini/products/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM product WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ err: 'not found' });
  const st = settings();
  res.json({ ...p, gallery: P(p.gallery, []), tags: P(p.tags, []), themes: P(p.themes, []), highlights: P(p.highlights, []), outline: P(p.outline, []), depart: P(p.depart, null), cals: P(p.cals, []), spots: P(p.spots, []), itinerary: P(p.itinerary, []), process: st.process, endorse: st.endorse, extra: p.extra || '' });
});

// AI 行程师：先出方案（不落单）
/* 客人提交需求时用的建档：提交页并不要求先登录，但成功弹窗承诺「可在我的中查看进度」，
   而「我的」是按 guest 表查的——不建档这句话就是空的。此处只建档，不灌演示数据。 */
function ensureGuest(phone, nick, source) {
  if (!/^1[3-9]\d{9}$/.test(String(phone || ''))) return null;
  const ex = db.prepare('SELECT * FROM guest WHERE phone=?').get(phone);
  if (!ex) db.prepare("INSERT INTO guest (phone,nick,source,last_login) VALUES (?,?,?,datetime('now','localtime'))")
    .run(phone, nick || ('客人' + String(phone).slice(-4)), source || 'mini');
  const g = db.prepare('SELECT * FROM guest WHERE phone=?').get(phone);
  return g && { ...g, prefs: P(g.prefs, []) };
}
app.post('/api/mini/ai/preview', (req, res) => {
  const p = plan(req.body || {});
  res.json(p);
});
// 采用方案 → 落单（直接进 CSP 看板「待接单」）
app.post('/api/mini/ai/submit', (req, res) => {
  const b = req.body || {};
  const p = b.plan || plan(b);
  /* 同 /api/mini/consult 的防重：提交成功页是独立一页，客人用返回手势能退回方案页再点一次 */
  if (b.phone) {
    const dup = db.prepare(`SELECT no, share_token FROM consult
      WHERE phone=? AND dest=? AND created_at > datetime('now','localtime','-3 minutes')
      ORDER BY created_at DESC LIMIT 1`).get(b.phone, b.dest || p.destName);
    if (dup) return res.json({ ok: 1, no: dup.no, token: dup.share_token, dedup: 1,
      guest: ensureGuest(b.phone, b.customer, 'mini_ai') });
  }
  const no = newNo();
  const token = 'sh' + Math.random().toString(36).slice(2, 10);
  db.prepare(`INSERT INTO consult (no,source,status,customer,phone,from_city,dest,region,go_date,days,adults,children,elders,budget,theme,prefs,must_see,note,channel_id,shop,quote,share_token)
    VALUES (?,?,'pending',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'C001','优定制 · 望京旗舰店',?,?)`).run(
    no, b.source || 'mini_ai', b.customer || '微信用户', b.phone || '', b.fromCity || '北京',
    b.dest || p.destName, p.region, b.goDate || '', p.days.length, b.adults || 2, b.children || 0, b.elders || 0,
    b.budget || null, b.theme || '', J(b.prefs || []), b.mustSee || '', b.note || '', p.total, token);
  db.prepare('UPDATE consult SET created_by=?, updated_by=? WHERE no=?')
    .run(b.customer || '微信用户', b.customer || '微信用户', no);
  savePlan(no, p, { ver: 1, kind: 'ai' });
  /* 新流程：先进 CSP 后台，销售核对确认后才推送给客人 */
  db.prepare('UPDATE consult SET guest_visible=0 WHERE no=?').run(no);
  log(no, 'AI 行程师', '生成行程', `客人在小程序自助生成 · ${p.route} · ${p.days.length} 天`);
  res.json({ ok: 1, no, token, guest: ensureGuest(b.phone, b.customer, 'mini_ai') });
});
// 表单提交需求 → 落单 + 自动出方案
app.post('/api/mini/consult', (req, res) => {
  const b = req.body || {};
  if (!b.dest) return res.status(400).json({ err: '目的地必填' });
  if (!b.phone) return res.status(400).json({ err: '联系电话必填' });
  /* 防重：提交成功页是独立一页，客人用手机的返回手势能退回方案页再点一次提交。
     同一个人 3 分钟内同目的地同天数的单，直接把已有那张还回去，不再新建，
     免得顾问那边收到两张一模一样的需求。 */
  const dup = db.prepare(`SELECT no, share_token FROM consult
    WHERE phone=? AND dest=? AND days=? AND created_at > datetime('now','localtime','-3 minutes')
    ORDER BY created_at DESC LIMIT 1`).get(b.phone, b.dest, b.days || 8);
  if (dup) return res.json({ ok: 1, no: dup.no, token: dup.share_token, dedup: 1,
    guest: ensureGuest(b.phone, b.customer, 'mini_form') });
  const p = plan({ dest: b.dest, days: b.days || 8, adults: b.adults || 2, children: b.children || 0, elders: b.elders || 0, prefs: b.prefs, fromCity: b.fromCity });
  const no = newNo(); const token = 'sh' + Math.random().toString(36).slice(2, 10);
  db.prepare(`INSERT INTO consult (no,source,status,customer,phone,from_city,dest,region,go_date,days,adults,children,elders,budget,theme,prefs,note,channel_id,shop,quote,share_token)
    VALUES (?,'mini_form','pending',?,?,?,?,?,?,?,?,?,?,?,?,?,?,'C001','优定制 · 望京旗舰店',?,?)`).run(
    no, b.customer || '微信用户', b.phone, b.fromCity || '北京', b.dest, p.region, b.goDate || '',
    b.days || 8, b.adults || 2, b.children || 0, b.elders || 0, b.budget || null, b.theme || '', J(b.prefs || []), b.note || '', p.total, token);
  if (b.fromArticle) db.prepare('UPDATE consult SET from_article=? WHERE no=?').run(b.fromArticle, no);
  /* 个人出行与企业团建是两种生意：企业单要走对公、要开票抬头、人数与预算量级都不同。
     落库时分开记，顾问接单时才知道按哪套流程走。 */
  const kind = b.kind === 'org' ? 'org' : 'person';
  db.prepare('UPDATE consult SET cust_kind=?, org=? WHERE no=?')
    .run(kind, kind === 'org' ? String(b.org || '').slice(0, 60) : null, no);
  db.prepare('UPDATE consult SET created_by=?, updated_by=? WHERE no=?')
    .run(b.customer || '微信用户', b.customer || '微信用户', no);
  savePlan(no, p, { ver: 1, kind: 'ai' });
  /* 新流程：提交后先进 CSP 后台，销售核对/编辑再确认推送，客人端才看得到这张单。
     这里显式写 0，不依赖列默认值——建表早于这个需求。 */
  db.prepare('UPDATE consult SET guest_visible=0 WHERE no=?').run(no);
  log(no, '小程序', '提交需求', kind === 'org'
    ? `企业客户提交定制需求 · ${b.org || '未填公司'} · ${b.dest} · ${b.days || 8} 天`
    : `客人提交定制需求 · ${b.dest} · ${b.days || 8} 天`);
  res.json({ ok: 1, no, token, guest: ensureGuest(b.phone, b.customer, 'mini_form') });
});
app.get('/api/mini/consults', (req, res) => {
  const ph = req.query.phone;
  const rows = ph ? db.prepare('SELECT * FROM consult WHERE phone=? ORDER BY created_at DESC').all(ph)
                  : db.prepare('SELECT * FROM consult WHERE guest_visible=1 ORDER BY created_at DESC LIMIT 20').all();
  /* 只返回已推送的单。
     ⚠️ 这里必须保持「返回数组」这个形态：客人手机上还开着的老页面跑的是旧 JS，
     直接改成 { list, pending } 会让它 list.map 报错、整页白屏（2026-09-28 出过一次）。
     待确认的条数走 /api/mini/me 的 consultPending，不动这个接口的形状。 */
  res.json(rows.filter(c => c.guest_visible).map(c => ({ ...c, st_cn: ST_CN[c.status] })));
});

/* 客人侧模拟支付。业务口径：本期不接真实支付通道，客人侧走模拟流程，
   但钱要真的落到 payment 与 torder.paid 上，后台看到的进度才是对的。 */
app.post('/api/mini/pay', (req, res) => {
  const { no, phone, amount, way } = req.body || {};
  const o = db.prepare('SELECT * FROM torder WHERE no=?').get(no);
  if (!o) return res.status(404).json({ err: '订单不存在' });
  if (!phone || o.phone !== phone) return res.status(403).json({ err: '无权操作' });
  const owe = Math.max(0, (o.amount || 0) - (o.paid || 0));
  const amt = Math.min(Math.max(1, Math.round(+amount || owe)), owe);
  if (!amt) return res.status(400).json({ err: '该订单已付清' });
  const item = amt >= owe ? (o.paid > 0 ? '尾款' : '全款') : '部分付款';
  db.prepare(`INSERT INTO payment (order_no,kind,item,amount,way,trade_no,state,operator)
    VALUES (?,'recv',?,?,?,?,'done','客人自助')`)
    .run(no, item, amt, way || '在线支付', 'SK' + String(Date.now()).slice(-9));
  const paid = (o.paid || 0) + amt;
  const st = paid >= (o.amount || 0) ? 'paid' : 'deposit';
  db.prepare("UPDATE torder SET paid=?, status=?, updated_at=datetime('now','localtime') WHERE no=?")
    .run(paid, st, no);
  olog(no, '客人', o.customer || '客人', '在线支付', `${item} ${amt.toLocaleString()} 元已到账`);
  res.json({ ok: 1, paid, owe: Math.max(0, (o.amount || 0) - paid), item, amount: amt });
});

/* 客人侧：单张咨询单详情。咨询单和订单是两套单据，后台本来就分开，
   客人端也得分开 —— 咨询单看的是「需求怎么提的、方案排到第几版、走到哪一步」，
   订单看的是「钱和履约」。报价明细、供应商、结算价一律不带出去。 */
app.get('/api/mini/consults/:no', (req, res) => {
  const ph = req.query.phone;
  const c = db.prepare('SELECT * FROM consult WHERE no=?').get(req.params.no);
  if (!c) return res.status(404).json({ err: '咨询单不存在' });
  if (!ph || c.phone !== ph) return res.status(403).json({ err: '无权查看' });
  /* 顾问还没确认推送的单，客人拿着单号也看不了 */
  if (!c.guest_visible) return res.status(404).json({ err: '顾问正在整理这条需求，确认后会推送给您' });
  const f = fullConsult(c.no);
  const STEPS = [
    ['submit', '需求提交', ['pending', 'taken', 'following', 'quoting', 'won', 'lost']],
    ['taken', '需求受理', ['taken', 'following', 'quoting', 'won']],
    ['plan', '方案设计', ['following', 'quoting', 'won']],
    ['quote', '报价确认', ['quoting', 'won']],
    ['won', '成交下单', ['won']],
  ];
  res.json({
    no: f.no, status: f.status, st_cn: ST_CN[f.status] || f.status,
    created_at: f.created_at, dest: f.dest, region: f.region, days: f.days,
    go_date: f.go_date, from_city: f.from_city,
    adults: f.adults, children: f.children, elders: f.elders,
    budget: f.budget, prefs: P(f.prefs, []), must_see: f.must_see, remark: f.remark,
    kind: f.kind, org: f.org,
    order_no: f.order_no || null,
    share_token: f.share_token || null,
    plan: f.cur ? { ver: f.cur.ver, route: f.cur.route, cover: f.cur.cover,
      tagline: f.cur.tagline, days: (f.cur.days || []).length } : null,
    plan_count: (f.plans || []).length,
    plan_ok: f.plan_ok ? 1 : 0,
    /* 进度：后台那条流水里客人该看到的部分（接单、出方案、报价、成交），
       不含内部派单与供应商比价 */
    steps: STEPS.map(([k, t, ok]) => ({ k, t, done: ok.includes(f.status) })),
    logs: (f.logs || [])
      .filter(l => !/供应商|派单|比价|结算|成本/.test((l.act || '') + (l.detail || '')))
      .map(l => ({ act: l.act, detail: l.detail, who: l.who, created_at: l.created_at })),
  });
});

/* ============ 客人行程分享页 ============ */
app.get('/api/trip/:token', (req, res) => {
  const c = db.prepare('SELECT no, guest_visible FROM consult WHERE share_token=?').get(req.params.token);
  if (!c) return res.status(404).json({ err: '链接已失效' });
  /* 销售确认推送之前，客人连 AI 出的这版行程也不能看——
     否则等于绕过了「先核对再给客人」这一步。
     ?preview=1 是 CSP 后台的「预览客人所见」：销售改完要能确认客人到底看到什么，
     这条路不校验推送状态，也不记「客人最近打开」，免得把销售自己的预览算成客人看过。 */
  const preview = String(req.query.preview || '') === '1';
  if (!c.guest_visible && !preview) return res.status(404).json({ err: '顾问正在核对这份行程，确认后会推送给您' });
  if (!preview) db.prepare("UPDATE consult SET last_seen_at=datetime('now','localtime') WHERE no=?").run(c.no);
  const f = fullConsult(c.no);
  /* 客人看到的这份行程长什么样，由这单套用的模板决定（模块开关与标题 + 配色版式） */
  const tpl = f.tpl || TPL.match(f.dest, f.theme).tpl;
  const cur = f.cur || {};
  const flights = cur.id
    ? db.prepare('SELECT * FROM plan_flight WHERE plan_id=? ORDER BY sort, d, id').all(cur.id) : [];
  /* 酒店汇总：把每天的住宿按城市合并成「城市 · DayX~Y · 酒店」，
     客人不用一天天翻也能看清这一路住哪 */
  const stays = [];
  (cur.days || []).forEach(d => {
    const last = stays[stays.length - 1];
    const same = last && (d.hotel === last.hotel || /^同上/.test(String(d.hotel || '')));
    if (same) { last.to = d.d; return; }
    if (d.hotel) stays.push({ city: d.city, hotel: d.hotel, from: d.d, to: d.d });
  });
  res.json({ no: f.no, customer: f.customer, dest: f.dest, days: f.days, go_date: f.go_date,
    adults: f.adults, children: f.children, elders: f.elders, plan: f.cur, feedback: f.feedback,
    shop: f.shop, sales_name: f.sales_name,
    /* 顾问改过行程之后这个时间会往前走，客人端据此显示「顾问最近更新于」——
       不然行程悄悄变了，客人不知道自己看的是不是最新那版 */
    updated_at: f.pushed_at || f.updated_at, updated_by: f.pushed_by || f.sales_name,
    flights, stays,
    quote: {
      /* ⚠️ JSON.parse(null) 返回 null 而不抛错，所以 P 的默认值在这儿是失效的，必须再兜一层 */
      notice: P(cur.notice, null) || QUOTE.NOTICE,
      fee_inc: P(cur.fee_inc, null) || QUOTE.FEE_INC,
      fee_exc: P(cur.fee_exc, null) || QUOTE.FEE_EXC,
      standard: P(cur.standard, null) || QUOTE.STANDARD,
    },
    tpl: tpl ? { id: tpl.id, name: tpl.name, modules: tpl.modules, skin: tpl.skin } : null });
});
app.post('/api/trip/:token/feedback', (req, res) => {
  const c = db.prepare('SELECT no, guest_visible FROM consult WHERE share_token=?').get(req.params.token);
  if (!c) return res.status(404).json({ err: '链接已失效' });
  if (!c.guest_visible) return res.status(404).json({ err: '这份行程还未推送给您' });
  const b = req.body || {};
  const round = (db.prepare('SELECT MAX(round) m FROM feedback WHERE consult_no=?').get(c.no).m || 0);
  db.prepare('INSERT INTO feedback (consult_no,round,d,target,text) VALUES (?,?,?,?,?)').run(c.no, Math.max(1, round), b.d || 0, b.target || '行程', b.text || '');
  log(c.no, '客人', '提交反馈', `第 ${b.d || 0} 天 · ${b.target || '行程'}：${(b.text || '').slice(0, 40)}`);
  res.json({ ok: 1 });
});

/* ============ UOM ============ */
app.get('/api/uom/products', (req, res) => {
  res.json(db.prepare('SELECT * FROM product ORDER BY type, sort DESC').all()
    .map(p => ({ ...p, gallery: P(p.gallery, []), tags: P(p.tags, []), themes: P(p.themes, []), highlights: P(p.highlights, []), outline: P(p.outline, []), depart: P(p.depart, null), cals: P(p.cals, []), spots: P(p.spots, []), itinerary: P(p.itinerary, []), process: P(p.process, []), endorse: P(p.endorse, []) })));
});
app.post('/api/uom/products', (req, res) => {
  const b = req.body || {};
  const id = b.id || ('P' + String(Date.now()).slice(-6));
  const ex = db.prepare('SELECT id FROM product WHERE id=?').get(id);
  /* 字段与众信产品中心对齐：经营字段（结算价/零售价/团期/成团人数）+ 内容字段（小程序详情页用） */
  /* 经营字段由众信产品库同步而来，编辑页不做二次维护。
     保存时如果前端没带这些字段，一律保留库里原值，避免被默认值清零。 */
  const cur = ex ? db.prepare('SELECT * FROM product WHERE id=?').get(id) : {};
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const who = b.who || '运营管理员';
  const keep = (k, def) => (b[k] === undefined || b[k] === null || b[k] === '')
    ? (cur[k] !== undefined && cur[k] !== null ? cur[k] : def) : b[k];
  const keepN = (k, def) => { const v = keep(k, def); return v === '' || v === null ? def : +v || def; };
  const F = {
    title: b.title || '未命名产品', subtitle: b.subtitle || '', dest: b.dest || '',
    region: b.region || '欧洲', days: +b.days || 8, nights: keepN('nights', (+b.days || 8) - 1),
    price_from: keepN('price_from', 0), settle_price: keepN('settle_price', 0),
    child_price: keepN('child_price', 0), single_room: keepN('single_room', 0),
    group_size: keepN('group_size', 8), from_city: keep('from_city', '北京'),
    travel_type: keep('travel_type', '境外游'), product_type: keep('product_type', '私家团'),
    group_mode: keep('group_mode', '保证成团'), brand: keep('brand', ''),
    supplier_id: keep('supplier_id', ''), supplier_name: keep('supplier_name', ''),
    zx_code: keep('zx_code', ''), theme: b.theme || '', extra: keep('extra', ''),
    /* 对外产品编号 D + 6 位，仅在首次保存时生成；创建人同样只写一次 */
    code: cur.code || nextProductCode(),
    created_by: cur.created_by || who, updated_by: who, updated_at: now, status: ['draft', 'published', 'off'].includes(b.status) ? b.status : 'draft',
    sort: +b.sort || 50, type: b.type || 'smallgroup', video: b.video || '', poster: b.poster || '',
    cover: b.cover || '',
    gallery: J(b.gallery || []), tags: J(b.tags || []), themes: J(b.themes || []),
    highlights: J(b.highlights || []), outline: J(b.outline || []), spots: J(b.spots || []),
    itinerary: J(b.itinerary || []),
    cals: b.cals ? J(b.cals) : (cur.cals || '[]'), depart: J(b.depart || null),
  };
  const keys = Object.keys(F), vals = keys.map(k => F[k]);
  if (ex) db.prepare(`UPDATE product SET ${keys.map(k => k + '=?').join(',')} WHERE id=?`).run(...vals, id);
  else db.prepare(`INSERT INTO product (${keys.join(',')},id) VALUES (${keys.map(() => '?').join(',')},?)`).run(...vals, id);
  res.json({ ok: 1, id });
});
/* 产品编号：D + 6 位数字，按库内最大值递增，保证不重复 */
function nextProductCode() {
  const rows = db.prepare("SELECT code FROM product WHERE code LIKE 'D%'").all();
  const max = rows.reduce((m, r) => Math.max(m, parseInt(String(r.code).slice(1), 10) || 0), 100000);
  return 'D' + (max + 1);
}
app.delete('/api/uom/products/:id', (req, res) => { db.prepare('DELETE FROM product WHERE id=?').run(req.params.id); res.json({ ok: 1 }); });
/* ---------- 平台公共配置：定制流程 / 服务背书 ----------
   这两块全平台产品口径一致，抽出来统一维护，产品详情页与小程序都读这一份。
   费用包含、出行人要求、退改约定等逐个产品不同的内容，放在产品的「补充说明」里，
   不再作为公共配置维护。 */
const SET_KEYS = ['process', 'endorse', 'zx_url'];
/* 众信产品中心的产品详情地址模板，{code} 会被替换成该产品的众信编码。
   后台「查看团期价格」直接跳总部系统，本平台不再二次回显团期，避免两边数据不一致。 */
const ZX_URL_DEF = 'https://uom.uuxlink.com/#/product/detail?productNum={code}';
function settings() {
  const o = {};
  db.prepare('SELECT * FROM setting').all()
    .filter(r => SET_KEYS.includes(r.k))
    .forEach(r => { o[r.k] = P(r.v, null); });
  SET_KEYS.forEach(k => { if (o[k] == null) o[k] = k === 'zx_url' ? ZX_URL_DEF : []; });
  if (!o.zx_url) o.zx_url = ZX_URL_DEF;
  return o;
}
app.get('/api/uom/settings', (req, res) => res.json(settings()));
/* 内容数据概览：小程序内容侧的整体口径，给「内容管理」的数据看板用。
   阅读量是内容自带字段（「2.4万」「9678」两种写法都折算成人次），
   收藏来自客人端真实收藏记录，没有埋点的指标不编。 */
function readNum(t) {
  const v = parseFloat(String(t || '')) || 0;
  return String(t || '').includes('万') ? v * 10000 : v;
}
/* 内容列表（后台）：带真实埋点口径的 PV / UV / 收藏 / 咨询 */
const ART_ST = { draft: '待发布', published: '已发布', revoked: '已撤销' };
function artMetrics() {
  const pv = {}, uv = {}, fav = {}, con = {};
  db.prepare('SELECT art_id, COUNT(*) c, COUNT(DISTINCT visitor) u FROM content_view GROUP BY art_id')
    .all().forEach(r => { pv[r.art_id] = r.c; uv[r.art_id] = r.u; });
  db.prepare("SELECT ref, COUNT(*) c FROM favorite WHERE kind='article' GROUP BY ref")
    .all().forEach(r => { fav[r.ref] = r.c; });
  db.prepare("SELECT from_article a, COUNT(*) c FROM consult WHERE from_article IS NOT NULL GROUP BY from_article")
    .all().forEach(r => { con[r.a] = r.c; });
  return { pv, uv, fav, con };
}
app.get('/api/uom/articles', (req, res) => {
  const home = {}; db.prepare('SELECT * FROM home_config').all().forEach(r => home[r.k] = P(r.v, null));
  const m = artMetrics();
  const tabs = home.ctabs || [];
  res.json((home.articles || []).map(a => ({
    ...a,
    status: a.status || 'draft',
    status_cn: ART_ST[a.status || 'draft'],
    cate: (tabs.find(t => t.k === a.tab) || {}).t || a.tab,
    pv: m.pv[a.id] || 0, uv: m.uv[a.id] || 0,
    fav: m.fav[a.id] || 0, consult: m.con[a.id] || 0,
    cvr: m.uv[a.id] ? Math.round((m.con[a.id] || 0) / m.uv[a.id] * 1000) / 10 : 0,
    words: (a.html || '').replace(/<[^>]+>/g, '').length
      || (a.secs || []).reduce((n, x) => n + (x.p || '').length, 0),
    imgs_n: (a.imgs || []).length + (a.img ? 1 : 0),
    created_by: a.created_by || a.by || '', created_at: a.created_at || a.published_at || '',
    updated_by: a.updated_by || a.created_by || a.by || '',
    updated_at: a.updated_at || a.created_at || a.published_at || '',
  })));
});
app.post('/api/uom/articles', (req, res) => {
  const b = req.body || {};
  const home = {}; db.prepare('SELECT * FROM home_config').all().forEach(r => home[r.k] = P(r.v, null));
  const arts = home.articles || [];
  const id = b.id || ('A' + Date.now().toString().slice(-6));
  const keep = arts.find(x => x.id === id) || {};
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const who = b.who || '运营管理员';
  /* v56 约定：内容角标（k）不再是独立可编辑字段，恒等于内容分类（tab 对应的 ctabs.t）。
     后台编辑页已去掉「角标文案」输入框，这里再兜一次底，保证任何写入路径都不会留下
     和分类对不上的孤儿角标。小程序端读的仍然是 a.k（封面角标、详情页头、延伸阅读行），
     所以小程序侧不用改。要改角标文案 = 去首页配置里改该分类的名字。 */
  const ctabs = home.ctabs || [];
  const tabK = b.tab || keep.tab;
  const cateName = (ctabs.find(t => t.k === tabK) || {}).t;
  const one = {
    ...keep, ...b, id,
    k: cateName || b.k || keep.k || '',
    /* 创建信息只在首次落库时写入，之后每次保存刷新最近操作人与时间 */
    created_by: keep.created_by || who, created_at: keep.created_at || now,
    updated_by: who, updated_at: now,
    status: ['draft', 'published', 'revoked'].includes(b.status) ? b.status : (keep.status || 'draft'),
    rel_prod: b.rel_prod || keep.rel_prod || [],
    rel_art: b.rel_art || keep.rel_art || [],
    published_at: b.status === 'published' && !keep.published_at
      ? new Date().toISOString().slice(0, 16).replace('T', ' ') : keep.published_at,
  };
  /* v57：内容标签（tags）整条撤掉——后台可填、可筛，但小程序端四处（社区卡片 ArtCard、
     社区流 Card、内容详情 Article、目的地详情）一处都没渲染，是个纯白填字段。
     这里在保存时把历史遗留的 tags 一并抹掉，不留前后端都不读的孤儿字段。 */
  delete one.tags;
  const next = arts.some(x => x.id === id) ? arts.map(x => x.id === id ? one : x) : [...arts, one];
  db.prepare("INSERT OR REPLACE INTO home_config (k,v) VALUES ('articles',?)").run(J(next));
  res.json({ ok: 1, id });
});
app.post('/api/uom/articles/:id/status', (req, res) => {
  const st = (req.body || {}).status;
  if (!['draft', 'published', 'revoked'].includes(st)) return res.status(400).json({ err: '状态不合法' });
  const home = {}; db.prepare('SELECT * FROM home_config').all().forEach(r => home[r.k] = P(r.v, null));
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const who = (req.body || {}).who || '运营管理员';
  const arts = (home.articles || []).map(a => a.id === req.params.id
    ? { ...a, status: st, updated_by: who, updated_at: now,
        published_at: st === 'published' && !a.published_at ? now : a.published_at } : a);
  db.prepare("INSERT OR REPLACE INTO home_config (k,v) VALUES ('articles',?)").run(J(arts));
  res.json({ ok: 1 });
});
app.delete('/api/uom/articles/:id', (req, res) => {
  const home = {}; db.prepare('SELECT * FROM home_config').all().forEach(r => home[r.k] = P(r.v, null));
  db.prepare("INSERT OR REPLACE INTO home_config (k,v) VALUES ('articles',?)")
    .run(J((home.articles || []).filter(a => a.id !== req.params.id)));
  res.json({ ok: 1 });
});
/* 小程序：按 id 直取单篇内容，不过滤状态。
   /api/mini/home 只吐「已发布」，所以后台点「预览」看一篇待发布的稿子会是空白。
   产品那边 /api/mini/products/:id 本来就不看状态，这里对齐同样的口径：
   预览是给运营在发布前看的，草稿必须能打开；客人端的列表入口仍然只有已发布的。 */
app.get('/api/mini/articles/:id', (req, res) => {
  const home = {}; db.prepare('SELECT * FROM home_config').all().forEach(r => home[r.k] = P(r.v, null));
  const a = (home.articles || []).find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ err: 'not found' });
  res.json({ ...a, status: a.status || 'draft' });
});
/* 小程序：内容浏览打点（PV 一次一条，UV 按 visitor 去重） */
app.post('/api/mini/article/:id/view', (req, res) => {
  const b = req.body || {};
  db.prepare('INSERT INTO content_view (art_id,visitor,phone,ref) VALUES (?,?,?,?)')
    .run(req.params.id, b.visitor || 'anon', b.phone || null, b.ref || 'mini');
  res.json({ ok: 1 });
});

app.get('/api/uom/content-stats', (req, res) => {
  const home = {}; db.prepare('SELECT * FROM home_config').all().forEach(r => home[r.k] = P(r.v, null));
  const arts = home.articles || [];
  const tabs = home.ctabs || [];
  const m = artMetrics();
  const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
  const pub = arts.filter(a => (a.status || 'draft') === 'published');
  const pv = sum(m.pv), uv = sum(m.uv), fav = sum(m.fav), con = sum(m.con);
  const d7 = db.prepare("SELECT COUNT(*) c, COUNT(DISTINCT visitor) u FROM content_view WHERE created_at >= date('now','-7 day')").get();
  res.json({
    total: arts.length,
    published: pub.length,
    draft: arts.filter(a => (a.status || 'draft') === 'draft').length,
    revoked: arts.filter(a => a.status === 'revoked').length,
    pv, uv, fav, consult: con,
    pv7: d7.c, uv7: d7.u,
    favRate: uv ? Math.round(fav / uv * 1000) / 10 : 0,
    cvr: uv ? Math.round(con / uv * 1000) / 10 : 0,
    byTab: tabs.filter(t => t.k !== 'all').map(t => {
      const g = arts.filter(a => a.tab === t.k);
      return { k: t.k, t: t.t, n: g.length,
        pv: g.reduce((a, x) => a + (m.pv[x.id] || 0), 0),
        con: g.reduce((a, x) => a + (m.con[x.id] || 0), 0) };
    }),
    top: [...arts].sort((a, b) => (m.pv[b.id] || 0) - (m.pv[a.id] || 0)).slice(0, 5)
      .map(a => ({ id: a.id, t: a.t, pv: m.pv[a.id] || 0, uv: m.uv[a.id] || 0,
        fav: m.fav[a.id] || 0, con: m.con[a.id] || 0 })),
    srcs: db.prepare('SELECT ref, COUNT(*) c FROM content_view GROUP BY ref ORDER BY c DESC').all(),
  });
});

app.put('/api/uom/settings', (req, res) => {
  const b = req.body || {};
  SET_KEYS.forEach(k => {
    if (b[k] === undefined) return;
    db.prepare("INSERT INTO setting (k,v,updated_at) VALUES (?,?,datetime('now','localtime')) " +
      'ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at')
      .run(k, J(b[k]));
  });
  res.json({ ok: 1 });
});

/* 同步团期：按产品绑定的众信编码，把总部产品中心的最新团期拉过来覆盖 */
app.post('/api/uom/products/:id/sync-cal', (req, res) => {
  const p0 = db.prepare('SELECT * FROM product WHERE id=?').get(req.params.id);
  if (!p0) return res.status(404).json({ err: '产品不存在' });
  if (!p0.zx_code) return res.status(409).json({ err: '这条产品还没有绑定众信产品编码，请先在编辑页里导入' });
  const z = db.prepare('SELECT * FROM zx_product WHERE code=?').get(p0.zx_code);
  if (!z) return res.status(404).json({ err: `众信产品库里查不到编码 ${p0.zx_code}` });
  const cals = P(z.cals, []);
  const sale = z.sale_status || '在售';
  db.prepare(`UPDATE product SET cals=?, settle_price=?, price_from=?, child_price=?, single_room=?,
    group_size=?, zx_sale_status=?, zx_synced_at=datetime('now','localtime') WHERE id=?`)
    .run(J(cals), z.settle_price, z.retail_price, z.child_price, z.single_room, z.group_size, sale, p0.id);
  res.json({ ok: 1, cals: cals.length, code: p0.zx_code, sale_status: sale, off_reason: z.off_reason || '' });
});
app.post('/api/uom/products/sync-all', (req, res) => {
  const rows = db.prepare("SELECT * FROM product WHERE zx_code IS NOT NULL AND zx_code<>''").all();
  let n = 0, off = 0;
  rows.forEach(p0 => {
    const z = db.prepare('SELECT * FROM zx_product WHERE code=?').get(p0.zx_code);
    if (!z) return;
    db.prepare(`UPDATE product SET cals=?, settle_price=?, price_from=?, child_price=?, single_room=?,
      group_size=?, zx_sale_status=?, zx_synced_at=datetime('now','localtime') WHERE id=?`)
      .run(z.cals, z.settle_price, z.retail_price, z.child_price, z.single_room, z.group_size,
        z.sale_status || '在售', p0.id);
    if ((z.sale_status || '在售') === '停售') off++;
    n++;
  });
  res.json({ ok: 1, n, off, total: rows.length });
});

/* ---------- 从众信产品库按编码拉产品 ----------
   线上接的是总部产品中心（search_products / get_product_info，按 productNum 精确匹配）。
   这里先走本地镜像表 zx_product，字段映射与线上一致；
   配好 ZX_API / ZX_TOKEN 之后把 fetchZx() 换成真实请求即可，映射层不用动。 */
function zxMap(z) {
  if (!z) return null;
  return {
    code: z.code,
    title: z.title, subtitle: z.sub,
    dest: z.dest_country + (z.dest_city ? ' ' + z.dest_city : ''),
    region: z.region,
    days: z.days, nights: z.nights,
    from_city: z.depart_city,
    travel_type: z.travel_type, product_type: z.product_type, group_mode: z.group_mode,
    supplier_id: z.supplier_code, supplier_name: z.supplier, brand: z.brand,
    settle_price: z.settle_price, price_from: z.retail_price,
    child_price: z.child_price, single_room: z.single_room,
    group_size: z.group_size,
    cals: P(z.cals, []), tags: P(z.tags, []), themes: P(z.themes, []),
    highlights: P(z.highlights, []), itinerary: P(z.itinerary, []),
    cover: z.cover, gallery: P(z.gallery, []),
    zx_sale_status: z.sale_status || '在售', off_reason: z.off_reason || '',
  };
}
app.get('/api/uom/zx/search', (req, res) => {
  const q = (req.query.q || '').trim();
  let rows = db.prepare('SELECT * FROM zx_product ORDER BY code').all();
  if (q) rows = rows.filter(z => (z.code + z.title + z.dest_country + z.supplier).includes(q));
  res.json(rows.slice(0, 20).map(z => ({
    code: z.code, title: z.title, dest: z.dest_country + ' ' + z.dest_city,
    days: z.days, supplier: z.supplier, retail: z.retail_price, settle: z.settle_price,
    product_type: z.product_type, travel_type: z.travel_type, sale_status: z.sale_status || '在售',
  })));
});
app.get('/api/uom/zx/:code', (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!/^U\d{6,12}$/.test(code))
    return res.status(400).json({ err: '产品编码格式不对，应为 U 开头 + 6～12 位数字，例如 U386322' });
  const z = db.prepare('SELECT * FROM zx_product WHERE code=?').get(code);
  if (!z) return res.status(404).json({ err: `众信产品库里没有查到编码 ${code}，请确认后重试` });
  res.json({ ok: 1, product: zxMap(z) });
});

app.get('/api/uom/home', (req, res) => { const h = {}; db.prepare('SELECT * FROM home_config').all().forEach(r => h[r.k] = P(r.v, null)); res.json(h); });
app.put('/api/uom/home', (req, res) => {
  Object.entries(req.body || {}).forEach(([k, v]) => db.prepare("INSERT OR REPLACE INTO home_config (k,v,updated_at) VALUES (?,?,datetime('now','localtime'))").run(k, J(v)));
  res.json({ ok: 1 });
});
/* 行程规划模板的接口在 server/tpl.js，见文件末尾的挂载 */
app.get('/api/uom/rules', (req, res) => {
  const row = db.prepare('SELECT * FROM rule WHERE channel_id=?').get('C001') || {};
  /* vendors（供应商名单）已取消：谁能接单由「供应 · 地接社」的接单范围决定。
     列先留在表里不动（老数据回退用），接口一律不吐、也不再写。 */
  const { vendors, ...r } = row;
  res.json({ ...r, self_items: P(r.self_items, []) });
});
app.put('/api/uom/rules', (req, res) => {
  const b = req.body || {};
  db.prepare('UPDATE rule SET mode=?, max_vendor=?, self_items=? WHERE channel_id=?')
    .run(b.mode || 'auto', b.max_vendor || 3, J(b.self_items || []), 'C001');
  res.json({ ok: 1 });
});
app.put('/api/uom/suppliers/:id', (req, res) => {
  const b = req.body || {};
  db.prepare('UPDATE supplier SET dests=?, enabled=? WHERE id=?').run(J(b.dests || []), b.enabled ? 1 : 0, req.params.id);
  res.json({ ok: 1 });
});

/* ============ CSP ============ */
app.get('/api/csp/consults', (req, res) => {
  const { status, q, dest, sales } = req.query;
  let rows = db.prepare('SELECT * FROM consult ORDER BY updated_at DESC, created_at DESC').all();
  if (status && status !== 'all') rows = rows.filter(r => r.status === status);
  if (dest) rows = rows.filter(r => (r.dest || '').includes(dest));
  if (sales) rows = rows.filter(r => r.sales_name === sales);
  if (q) { const s = q.toLowerCase(); rows = rows.filter(r => [r.no, r.customer, r.phone, r.dest, r.sales_name, r.shop, r.go_date, r.note].join('|').toLowerCase().includes(s)); }
  res.json(rows.map(r => {
    const qs = db.prepare('SELECT supplier_id,supplier_name,state,total FROM quote WHERE consult_no=? ORDER BY (total IS NULL), total').all(r.no);
    /* 下一步动作由「状态 + 进度标记」推导，不再靠状态一一对应 */
    const next = r.status === 'pending' ? 'take'
      : r.status === 'taken' ? 'follow'
      : r.status === 'following' ? (r.plan_ok ? 'dispatch' : 'confirm')
      : r.status === 'quoting'
        ? (r.sup_pick ? 'order' : (qs.some(x => x.total) ? 'pick' : null))
        : null;
    const prefs = P(r.prefs, []);
    return {
      ...r, st_cn: ST_CN[r.status], next, quotes: qs,
      plan_ok: r.plan_ok ? 1 : 0,
      prefs, prefs_cn: prefs.map(x => PREF_CN[x] || x),
      pax: (r.adults || 0) + (r.children || 0) + (r.elders || 0),
      src_cn: SRC_CN[r.source] || r.source,
      /* 企业单要走对公与开票，顾问接单前就得知道 */
      kind_cn: r.cust_kind === 'org' ? '企业' : null, org: r.org || null,
      product: r.product_id ? db.prepare('SELECT id,title,dest,days,price_from FROM product WHERE id=?').get(r.product_id) : null,
      quote_n: qs.length, quote_back: qs.filter(x => x.total).length,
      step_cn: r.status === 'taken' ? '待开始跟进'
        : r.status === 'following' ? (r.plan_ok ? '方案已确认' : '方案待确认')
        : r.status === 'quoting' ? (qs.length ? `${qs.filter(x => x.total).length}/${qs.length} 家已回价` : '待派单')
        : r.status === 'won' ? '已生成订单' : '',
      vercnt: db.prepare('SELECT COUNT(*) c FROM plan WHERE consult_no=?').get(r.no).c,
    };
  }));
});
app.get('/api/csp/stats', (req, res) => {
  const all = db.prepare('SELECT status,budget,quote FROM consult').all();
  const sum = f => all.filter(f).reduce((a, r) => a + (r.quote || r.budget || 0), 0);
  res.json({
    total: all.length, totalAmt: all.reduce((a, r) => a + (r.budget || 0), 0),
    pending: all.filter(r => r.status === 'pending').length,
    open: all.filter(r => OPEN.includes(r.status)).length, openAmt: sum(r => OPEN.includes(r.status)),
    won: all.filter(r => r.status === 'won').length, wonAmt: sum(r => r.status === 'won'),
    byStatus: Object.fromEntries(Object.keys(ST_CN).map(k => [k, all.filter(r => r.status === k).length])),
  });
});
app.get('/api/csp/consult/:no', (req, res) => {
  const f = fullConsult(req.params.no);
  if (!f) return res.status(404).json({ err: 'not found' });
  const qs = db.prepare('SELECT total FROM quote WHERE consult_no=?').all(req.params.no);
  const prefs = Array.isArray(f.prefs) ? f.prefs : P(f.prefs, []);
  res.json({
    ...f, plan_ok: f.plan_ok ? 1 : 0, quote_n: qs.length, quote_back: qs.filter(x => x.total).length,
    prefs, prefs_cn: prefs.map(x => PREF_CN[x] || x),
    pax: (f.adults || 0) + (f.children || 0) + (f.elders || 0),
    src_cn: SRC_CN[f.source] || f.source,
    product: f.product_id ? db.prepare('SELECT id,title,dest,days,price_from,cover FROM product WHERE id=?').get(f.product_id) : null,
  });
});

/* CSP：销售编辑客人提交的需求。
   新流程里客人提交完先落到这里，销售核对（电话问细节、纠正目的地写法、补预算）
   之后再推送给客人，所以这些字段必须可改。改动逐条写进日志，回头能查是谁改的。 */
app.put('/api/csp/consult/:no', (req, res) => {
  const no = req.params.no, b = req.body || {};
  const c = db.prepare('SELECT * FROM consult WHERE no=?').get(no);
  if (!c) return res.status(404).json({ err: '咨询单不存在' });
  if (c.order_no) return res.status(409).json({ err: '已生成订单的咨询单不能再改需求' });
  const who = b.who || c.sales_name || '李晴';
  const num = (v, d2) => (v === '' || v == null ? d2 : Math.max(0, Math.round(Number(v) || 0)));
  const next = {
    customer: String(b.customer == null ? c.customer : b.customer).trim().slice(0, 30),
    from_city: String(b.fromCity == null ? c.from_city : b.fromCity).trim().slice(0, 20),
    dest: String(b.dest == null ? c.dest : b.dest).trim().slice(0, 40),
    go_date: String(b.goDate == null ? c.go_date : b.goDate).slice(0, 10),
    days: Math.min(60, Math.max(1, num(b.days, c.days))),
    adults: num(b.adults, c.adults), children: num(b.children, c.children), elders: num(b.elders, c.elders),
    budget: b.budget === '' ? null : num(b.budget, c.budget),
    theme: String(b.theme == null ? c.theme : b.theme).trim().slice(0, 30),
    must_see: String(b.mustSee == null ? c.must_see : b.mustSee).trim().slice(0, 200),
    note: String(b.note == null ? c.note : b.note).trim().slice(0, 500),
    prefs: b.prefs == null ? c.prefs : J((Array.isArray(b.prefs) ? b.prefs : []).slice(0, 9)),
  };
  if (!next.dest) return res.status(400).json({ err: '目的地不能为空' });
  const LB = { customer: '客人称呼', from_city: '出发城市', dest: '目的地', go_date: '出发日期',
    days: '行程天数', adults: '成人数', children: '儿童数', elders: '长者数', budget: '预算',
    theme: '行程主题', must_see: '必访景点', note: '其他需求', prefs: '旅行偏好' };
  const diff = Object.keys(next).filter(k => String(next[k] ?? '') !== String(c[k] ?? ''))
    .map(k => `${LB[k]}：${c[k] || '空'} → ${next[k] || '空'}`);
  db.prepare(`UPDATE consult SET customer=?,from_city=?,dest=?,go_date=?,days=?,adults=?,children=?,elders=?,
      budget=?,theme=?,must_see=?,note=?,prefs=?,updated_at=datetime('now','localtime') WHERE no=?`)
    .run(next.customer, next.from_city, next.dest, next.go_date, next.days, next.adults, next.children,
      next.elders, next.budget, next.theme, next.must_see, next.note, next.prefs, no);
  touchBy(no, who);
  if (diff.length) log(no, who, '修改需求', diff.join('；'));
  res.json({ ok: 1, changed: diff.length });
});

/* CSP：销售改行程方案本身。
   AI 排出来的东西一定要能改——写错的酒店、客人电话里补的要求、砍掉的某个景点，
   销售当场就得能动，否则只能整份重出，把已经谈好的部分也冲掉。
   改的是当前版本（is_cur=1）那一份，客人端读的是同一份，所以存下即同步。
   逐项 diff 写进修改记录，回头能查是谁在什么时候改了哪一天的什么。 */
app.put('/api/csp/consult/:no/plan', (req, res) => {
  const no = req.params.no, b = req.body || {};
  const c = db.prepare('SELECT * FROM consult WHERE no=?').get(no);
  if (!c) return res.status(404).json({ err: '咨询单不存在' });
  const pl = db.prepare('SELECT * FROM plan WHERE consult_no=? AND is_cur=1').get(no);
  if (!pl) return res.status(404).json({ err: '这张咨询单还没有行程方案' });
  const who = b.who || c.sales_name || '李晴';
  const diff = [];
  const S = (v, d2, n) => (v == null ? d2 : String(v).trim().slice(0, n));

  /* 方案层：路线、副标题、亮点、总价与报价说明 */
  if (b.plan) {
    const q = b.plan;
    const next = {
      route: S(q.route, pl.route, 120), tagline: S(q.tagline, pl.tagline, 80),
      total: q.total == null ? pl.total : Math.max(0, Math.round(Number(q.total) || 0)),
      quote_note: S(q.quoteNote, pl.quote_note, 120),
      highlights: q.highlights == null ? pl.highlights
        : J((Array.isArray(q.highlights) ? q.highlights : []).map(x => String(x).slice(0, 30)).filter(Boolean).slice(0, 12)),
    };
    const LB = { route: '路线', tagline: '副标题', total: '总报价', quote_note: '报价说明', highlights: '行程亮点' };
    Object.keys(next).forEach(k => {
      if (String(next[k] ?? '') !== String(pl[k] ?? '')) diff.push(`${LB[k]}：${pl[k] || '空'} → ${next[k] || '空'}`);
    });
    db.prepare('UPDATE plan SET route=?,tagline=?,total=?,quote_note=?,highlights=? WHERE id=?')
      .run(next.route, next.tagline, next.total, next.quote_note, next.highlights, pl.id);
    /* 商务测算那块读的是 consult.quote，不跟着改的话会和行程里的报价对不上 */
    if (next.total !== pl.total) db.prepare('UPDATE consult SET quote=? WHERE no=?').run(next.total, no);
  }

  /* 每日层：只改传上来的那几天，没传的原样不动 */
  (Array.isArray(b.days) ? b.days : []).forEach(x => {
    const cur = db.prepare('SELECT * FROM day WHERE plan_id=? AND d=?').get(pl.id, x.d);
    if (!cur) return;
    const next = {
      title: S(x.title, cur.title, 60), city: S(x.city, cur.city, 30),
      hotel: S(x.hotel, cur.hotel, 60), meals: S(x.meals, cur.meals, 60),
      exp: S(x.exp, cur.exp, 60), food: S(x.food, cur.food, 60), drive: S(x.drive, cur.drive, 80),
      items: x.items == null ? cur.items
        : J((Array.isArray(x.items) ? x.items : []).map(t => String(t).trim().slice(0, 200)).filter(Boolean).slice(0, 12)),
    };
    const LB = { title: '标题', city: '城市', hotel: '住宿', meals: '餐食', exp: '体验',
      food: '美食', drive: '车程', items: '行程内容' };
    Object.keys(next).forEach(k => {
      if (String(next[k] ?? '') !== String(cur[k] ?? '')) {
        diff.push(k === 'items' ? `D${x.d} 行程内容已调整` : `D${x.d} ${LB[k]}：${cur[k] || '空'} → ${next[k] || '空'}`);
      }
    });
    db.prepare('UPDATE day SET title=?,city=?,hotel=?,meals=?,exp=?,food=?,drive=?,items=? WHERE id=?')
      .run(next.title, next.city, next.hotel, next.meals, next.exp, next.food, next.drive, next.items, cur.id);
  });

  if (!diff.length) return res.json({ ok: 1, changed: 0 });
  db.prepare("UPDATE consult SET updated_at=datetime('now','localtime') WHERE no=?").run(no);
  db.prepare("UPDATE plan SET memo=datetime('now','localtime') WHERE id=?").run(pl.id);
  touchBy(no, who);
  log(no, who, '修改行程', diff.slice(0, 12).join('；') + (diff.length > 12 ? ` 等 ${diff.length} 处` : ''));
  /* 已经推给客人的单，改完即同步（两边读的是同一份），顺手把推送时间刷成现在，
     客人端行程页上「顾问最近更新于」就跟着走。 */
  if (c.guest_visible) {
    db.prepare("UPDATE consult SET pushed_at=datetime('now','localtime'), pushed_by=? WHERE no=?").run(who, no);
  }
  res.json({ ok: 1, changed: diff.length, synced: c.guest_visible ? 1 : 0 });
});

/* CSP：确认并推送给客人。推送之后客人端才看得到这张咨询单与完整行程。
   支持重复推送：销售改过需求或重出行程之后，再推一次，客人看到的就是最新那一版。
   客人端看的行程和 CSP 里看的是同一份（都取 plan 表的当前版本），不会两边不一致。 */
app.post('/api/csp/consult/:no/push', (req, res) => {
  const no = req.params.no, b = req.body || {};
  const c = db.prepare('SELECT * FROM consult WHERE no=?').get(no);
  if (!c) return res.status(404).json({ err: '咨询单不存在' });
  const who = b.who || c.sales_name || '李晴';
  const again = !!c.guest_visible;
  db.prepare("UPDATE consult SET guest_visible=1, pushed_at=datetime('now','localtime'), pushed_by=? WHERE no=?")
    .run(who, no);
  touchBy(no, who);
  log(no, who, again ? '重新推送' : '推送给客人',
    again ? '行程或需求已更新，最新一版已同步给客人'
          : '需求已核对确认，客人可在小程序查看这张咨询单与完整行程');
  res.json({ ok: 1, again: again ? 1 : 0 });
});

app.post('/api/csp/consult/:no/action', (req, res) => {
  const no = req.params.no, key = (req.body || {}).key;
  const c = db.prepare('SELECT * FROM consult WHERE no=?').get(no);
  if (!c) return res.status(404).json({ err: 'not found' });
  const who = (req.body || {}).who || c.sales_name || '李晴';
  const from = ST_CN[c.status];
  const set = (st, extra = '') => {
    db.prepare('UPDATE consult SET status=? WHERE no=?').run(st, no);
    log(no, who, extra || '状态流转', `状态由「${from}」变更为「${ST_CN[st]}」`); touchBy(no, who);
  };
  switch (key) {
    case 'take':
      /* 接单只表示「这单归我了」，还没开始干活。原先 take 直接跳到「跟进中」，
         「已接单」这个状态在真实流程里永远产生不了，只有种子数据上才看得到，
         客人端那句「顾问已接单」等于是假的。 */
      if (c.status !== 'pending') return res.status(409).json({ err: '当前状态不支持该操作' });
      db.prepare('UPDATE consult SET sales_id=?, sales_name=? WHERE no=?').run((req.body || {}).salesId || 'S001', who, no);
      set('taken', '接单'); break;
    case 'follow':
      if (c.status !== 'taken') return res.status(409).json({ err: '当前状态不支持该操作' });
      set('following', '开始跟进'); break;
    case 'confirm':
      // 方案确认由状态降级为进度标记，不再单独占一个状态
      if (c.status !== 'following') return res.status(409).json({ err: '当前状态不支持该操作' });
      if (c.plan_ok) return res.status(409).json({ err: '该咨询单的行程方案已确认' });
      db.prepare('UPDATE consult SET plan_ok=1 WHERE no=?').run(no);
      log(no, who, '方案确认', '行程方案已与客人确认，可提交供应商报价'); touchBy(no, who);
      return res.json({ ok: 1, status: c.status, plan_ok: 1 });
    case 'order': {
      if (c.status !== 'quoting') return res.status(409).json({ err: '当前状态不支持该操作' });
      if (!c.sup_pick) return res.status(409).json({ err: '尚未选定供应商，请先在「供应商报价」中选定后再成交' });
      const cost = c.sup_quote || 0;
      const deal = Math.round(+(req.body || {}).amount || c.quote || 0);
      if (!deal) return res.status(400).json({ err: '请填写对客成交价' });
      if (deal < cost) return res.status(409).json({
        err: `成交价 ¥${deal.toLocaleString()} 低于供应商结算价 ¥${cost.toLocaleString()}，本单将亏损 ¥${(cost - deal).toLocaleString()}。请调整成交价或更换供应商。` });
      const on = 'DD' + String(Date.now()).slice(-10);
      db.prepare('UPDATE consult SET order_no=?, sup_state=?, quote=? WHERE no=?').run(on, 'won', deal, no);
      set('won', '生成订单');
      log(no, who, '生成订单', `订单号 ${on}，对客成交价 ¥${deal.toLocaleString()}，结算价 ¥${cost.toLocaleString()}，毛利 ¥${(deal - cost).toLocaleString()}`);
      makeOrder(no);
      res.json({ ok: 1, orderNo: on }); return;
    }
    case 'lost':
      if (!OPEN.includes(c.status)) return res.status(409).json({ err: '当前状态不支持该操作' });
      db.prepare("UPDATE consult SET sup_state=CASE WHEN sup_state IS NULL THEN NULL ELSE 'lost' END WHERE no=?").run(no);
      set('lost', '标记流失'); break;
    case 'recall':
      if (!['won', 'lost'].includes(c.status)) return res.status(409).json({ err: '当前状态不支持该操作' });
      db.prepare('UPDATE consult SET plan_ok=0 WHERE no=?').run(no);
      set('pending', '召回'); break;
    default: return res.status(400).json({ err: '未知动作' });
  }
  res.json({ ok: 1, status: db.prepare('SELECT status FROM consult WHERE no=?').get(no).status });
});

app.post('/api/csp/consult/:no/dispatch', (req, res) => {
  const no = req.params.no, b = req.body || {};
  const c = db.prepare('SELECT * FROM consult WHERE no=?').get(no);
  if (!c) return res.status(404).json({ err: 'not found' });
  if (c.status !== 'following') return res.status(409).json({ err: '当前状态不支持派单' });
  if (!c.plan_ok) return res.status(409).json({ err: '请先完成行程方案确认后再提交供应商报价' });
  const rule = db.prepare('SELECT * FROM rule WHERE channel_id=?').get(c.channel_id || 'C001');
  /* 谁能接这一单，完全由地接社档案的接单范围决定（不再另存一份供应商名单） */
  const pax = (c.adults || 0) + (c.children || 0) + (c.elders || 0);
  const { hit: all, why } = VENDOR.matchVendors({ shop: c.channel_id, dest: c.dest, pax, goDate: c.go_date });
  if (!all.length) return res.status(409).json({ err: `没有能接这一单的地接社。\n门店：${c.shop}\n目的地：${c.dest}\n`
    + (why.length ? `\n被排除的原因：\n${why.slice(0, 6).map(w => `· ${w.name}：${w.reason}`).join('\n')}\n` : '')
    + `\n去总部端「供应 · 地接社」里放开对应的目的地或接单范围。` });
  const mode = b.mode || rule.mode || 'auto';
  let picks = mode === 'assign' ? all.filter(s => s.id === b.vendor) : all.slice(0, rule.max_vendor || 3);
  if (!picks.length) return res.status(400).json({ err: '没有选中供应商' });
  db.prepare('DELETE FROM quote WHERE consult_no=?').run(no);
  const ins = db.prepare('INSERT INTO quote (consult_no,supplier_id,supplier_name,state) VALUES (?,?,?,?)');
  picks.forEach(s => ins.run(no, s.id, s.name, 'pending'));
  db.prepare("UPDATE consult SET status='quoting', sup_state='pending', sup_mode=?, sup_vendors=? WHERE no=?").run(mode, J(picks.map(s => s.id)), no);
  log(no, c.sales_name || '销售', '提交报价', `状态由「跟进中」变更为「报价中」，${mode === 'assign' ? '指定供应商 ' + picks[0].name : '自动分配至 ' + picks.map(s => s.name).join('、')}`);
  touch(no);
  res.json({ ok: 1, vendors: picks.map(s => ({ id: s.id, name: s.name })) });
});
// 可派供应商预览（前端弹窗用）
app.get('/api/csp/consult/:no/vendors', (req, res) => {
  const c = db.prepare('SELECT * FROM consult WHERE no=?').get(req.params.no);
  const rule = db.prepare('SELECT * FROM rule WHERE channel_id=?').get('C001');
  const pax = c ? (c.adults || 0) + (c.children || 0) + (c.elders || 0) : 0;
  /* 与真正派单同一个判定函数，界面上看到的就是实际会派的家；why 用来解释谁为什么没进来 */
  const { hit, why } = VENDOR.matchVendors({ shop: c?.channel_id, dest: c?.dest, pax, goDate: c?.go_date });
  res.json({ mode: rule.mode, max: rule.max_vendor, shop: c?.shop, dest: c?.dest, why,
    vendors: hit.map(v => ({ id: v.id, name: v.name, short: v.short, dests: v.dests, rating: v.rating,
      type: v.type, cert: v.cert.state, quoteN: v.quoteN, wonN: v.wonN })) });
});
// 选定供应商
app.post('/api/csp/consult/:no/pick', (req, res) => {
  const no = req.params.no, vid = (req.body || {}).vendor;
  const q = db.prepare('SELECT * FROM quote WHERE consult_no=? AND supplier_id=?').get(no, vid);
  if (!q) return res.status(404).json({ err: '没有这家的报价' });
  db.prepare("UPDATE quote SET state='lost' WHERE consult_no=? AND supplier_id<>?").run(no, vid);
  db.prepare("UPDATE quote SET state='won' WHERE consult_no=? AND supplier_id=?").run(no, vid);
  db.prepare('UPDATE consult SET sup_pick=?, sup_quote=?, sup_state=? WHERE no=?').run(vid, q.total, 'quoted', no);
  log(no, '销售', '选定供应商', `选定 ${q.supplier_name} · ¥${(q.total || 0).toLocaleString()}`);
  const c2 = db.prepare('SELECT * FROM consult WHERE no=?').get(no);
  // 建议成交价：结算价 × (1 + 目标毛利率)，与门店当前对客报价取高
  const rule = db.prepare('SELECT * FROM rule WHERE channel_id=?').get(c2.channel_id || 'C001') || {};
  const margin = (rule.margin != null ? rule.margin : 25) / 100;
  const suggest = Math.max(c2.quote || 0, Math.round((q.total || 0) * (1 + margin) / 100) * 100);
  touch(no);
  res.json({ ok: 1, cost: q.total || 0, quote: c2.quote || 0, suggest, margin: Math.round(margin * 100) });
});
// 重出行程（整份 / 按反馈）
app.post('/api/csp/consult/:no/replan', (req, res) => {
  const no = req.params.no, kind = (req.body || {}).kind || 'orig';
  const c = db.prepare('SELECT * FROM consult WHERE no=?').get(no);
  if (!c) return res.status(404).json({ err: 'not found' });
  const p = plan({ dest: c.dest, days: c.days, adults: c.adults, children: c.children, elders: c.elders,
    prefs: P(c.prefs, []), fromCity: c.from_city, variant: kind === 'fb' ? 1 : (req.body.variant || 0) });
  const fbs = db.prepare('SELECT * FROM feedback WHERE consult_no=?').all();
  if (kind === 'fb' && fbs.length) {
    fbs.forEach(f => { const d = p.days.find(x => x.d === f.d); if (d) d.items.push('按客人意见调整：' + f.text); });
  }
  const pid = savePlan(no, p, { kind, memo: kind === 'fb' ? `按客人 ${fbs.length} 条反馈重出` : '重出整份行程' });
  log(no, c.sales_name || '定制师', kind === 'fb' ? '按反馈重出' : '重出整份行程', `生成第 ${db.prepare('SELECT MAX(ver) m FROM plan WHERE consult_no=?').get(no).m} 版`);
  touch(no); res.json({ ok: 1, planId: pid });
});
app.post('/api/csp/consult/:no/switch-ver', (req, res) => {
  const no = req.params.no, ver = (req.body || {}).ver;
  db.prepare('UPDATE plan SET is_cur=0 WHERE consult_no=?').run(no);
  db.prepare('UPDATE plan SET is_cur=1 WHERE consult_no=? AND ver=?').run(no, ver);
  res.json({ ok: 1 });
});
// 走马灯事件
app.get('/api/csp/ticks', (req, res) => {
  const out = [];
  db.prepare('SELECT * FROM consult').all().filter(c => OPEN.includes(c.status)).forEach(c => {
    db.prepare('SELECT * FROM quote WHERE consult_no=?').all(c.no).forEach(q => {
      if (q.state === 'quoted' && q.total) out.push({ k: c.no + '|q|' + q.supplier_id, ico: 'box', t: `**${q.supplier_name}** 已报价，结算 ¥${Math.round(q.total / Math.max(1, c.adults + c.children + c.elders)).toLocaleString()}/人`, tail: `${c.no} · ${c.customer}`, at: q.quoted_at || q.created_at });
      else if (q.state === 'taken') out.push({ k: c.no + '|t|' + q.supplier_id, ico: 'check', t: `**${q.supplier_name}** 已接单，正在核资源`, tail: `${c.no} · ${c.customer}`, at: q.created_at });
      else if (q.state === 'lost') out.push({ k: c.no + '|l|' + q.supplier_id, ico: 'x', t: `**${q.supplier_name}** 接不了这一单，需要改派`, tail: `${c.no} · ${c.customer}`, at: q.created_at });
    });
    const fb = db.prepare('SELECT round, COUNT(*) c, MAX(created_at) at FROM feedback WHERE consult_no=? GROUP BY round ORDER BY round DESC LIMIT 1').get(c.no);
    if (fb) out.push({ k: c.no + '|f|' + fb.round, ico: 'chat', t: `**${c.customer}** 提交了第 ${fb.round} 轮反馈，标注 ${fb.c} 条`, tail: `${c.no} · ${c.customer}`, at: fb.at });
  });
  out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  res.json(out.slice(0, 20));
});

/* ============ UBK ============ */
/* ---------- UBK 账号管理：供应商自己的员工账号与权限 ---------- */
const ROLE_CN = { admin: '管理员', quote: '报价员', ops: '履约操作', view: '只读' };
app.get('/api/ubk/accounts', (req, res) => {
  const { vendor, q, status, role } = req.query;
  let rows = db.prepare('SELECT * FROM account WHERE vendor_id=? ORDER BY status DESC, created_at').all(vendor || 'V01');
  if (q) rows = rows.filter(r => ((r.name || '') + (r.phone || '') + (r.email || '')).includes(q));
  if (role) rows = rows.filter(r => r.role === role);
  if (status !== undefined && status !== '') rows = rows.filter(r => String(r.status) === String(status));
  res.json(rows.map(r => ({ ...r, roleCn: ROLE_CN[r.role] || r.role })));
});
app.post('/api/ubk/accounts', (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ err: '姓名必填' });
  if (!/^1\d{10}$/.test(b.phone || '')) return res.status(400).json({ err: '请填写正确的手机号' });
  const dup = db.prepare('SELECT id FROM account WHERE vendor_id=? AND phone=? AND id<>?')
    .get(b.vendor_id, b.phone, b.id || '');
  if (dup) return res.status(400).json({ err: '该手机号在本供应商下已存在' });
  if (b.id && db.prepare('SELECT id FROM account WHERE id=?').get(b.id)) {
    db.prepare(`UPDATE account SET name=?, phone=?, email=?, role=?, dept=?, remark=?, status=?,
      updated_at=datetime('now','localtime') WHERE id=?`)
      .run(b.name, b.phone, b.email || '', b.role || 'quote', b.dept || '', b.remark || '',
        b.status === 0 ? 0 : 1, b.id);
    return res.json({ ok: 1, id: b.id });
  }
  const id = 'U' + String(Date.now()).slice(-8);
  db.prepare(`INSERT INTO account (id,vendor_id,name,phone,email,role,dept,remark,status)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(id, b.vendor_id || 'V01', b.name, b.phone, b.email || '',
      b.role || 'quote', b.dept || '', b.remark || '', b.status === 0 ? 0 : 1);
  res.json({ ok: 1, id });
});
app.post('/api/ubk/accounts/:id/status', (req, res) => {
  db.prepare("UPDATE account SET status=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run((req.body || {}).status ? 1 : 0, req.params.id);
  res.json({ ok: 1 });
});
app.post('/api/ubk/accounts/:id/reset', (req, res) => {
  // 演示环境不落密码，只回一个初始密码给前端展示
  res.json({ ok: 1, pwd: 'U' + Math.random().toString(36).slice(2, 8).toUpperCase() });
});
app.delete('/api/ubk/accounts/:id', (req, res) => {
  db.prepare('DELETE FROM account WHERE id=?').run(req.params.id);
  res.json({ ok: 1 });
});

app.get('/api/ubk/consults', (req, res) => {
  const vid = req.query.vendor || 'V01';
  const rows = db.prepare(`SELECT q.*, c.customer,c.dest,c.days,c.go_date,c.adults,c.children,c.elders,c.budget,c.quote,c.shop,c.sales_name,c.status cstatus,c.no cno
    FROM quote q JOIN consult c ON c.no=q.consult_no WHERE q.supplier_id=? ORDER BY q.created_at DESC`).all(vid);
  res.json(rows.map(r => ({ ...r, items: P(r.items, []), pax: r.adults + r.children + r.elders })));
});
app.get('/api/ubk/consult/:no', (req, res) => {
  const f = fullConsult(req.params.no);
  if (!f) return res.status(404).json({ err: 'not found' });
  const rule = db.prepare('SELECT * FROM rule WHERE channel_id=?').get('C001');
  const vid = req.query.vendor || '';
  /* 咨询单的 dest 是「日本 东京·箱根·京都」这种写法，资源库按国家存，这里解析出国名给资源筛选用 */
  const hit = Object.values(DEST).find(v => String(f.dest || '').includes(v.name));
  const picks = vid ? db.prepare('SELECT * FROM quote_res WHERE consult_no=? AND supplier_id=? ORDER BY cate, id')
    .all(req.params.no, vid) : [];
  res.json({ ...f, selfItems: P(rule.self_items, []), picks, country: hit ? hit.name : '' });
});
app.post('/api/ubk/take', (req, res) => {
  const { no, vendor } = req.body || {};
  db.prepare("UPDATE quote SET state='taken' WHERE consult_no=? AND supplier_id=?").run(no, vendor);
  const q = db.prepare('SELECT supplier_name FROM quote WHERE consult_no=? AND supplier_id=?').get(no, vendor);
  db.prepare("UPDATE consult SET sup_state='taken' WHERE no=? AND sup_state='pending'").run(no);
  log(no, q?.supplier_name || '供应商', '供应商接单', '供应商已接单，正在核资源');
  res.json({ ok: 1 });
});
app.post('/api/ubk/quote', (req, res) => {
  const b = req.body || {};
  const c = db.prepare('SELECT * FROM consult WHERE no=?').get(b.no);
  if (!c) return res.status(404).json({ err: 'not found' });
  const pax = Math.max(1, c.adults + c.children + c.elders);
  const total = Number(b.total) || 0;
  db.prepare(`UPDATE quote SET state='quoted', total=?, per_person=?, items=?, day_notes=?, memo=?, quoted_at=datetime('now','localtime')
    WHERE consult_no=? AND supplier_id=?`).run(total, Math.round(total / pax), J(b.items || []), J(b.dayNotes || []), b.memo || '', b.no, b.vendor);
  /* 报价里选用的地接资源：全量覆盖这家供应商在这张单上的明细 */
  if (Array.isArray(b.picks)) {
    db.prepare('DELETE FROM quote_res WHERE consult_no=? AND supplier_id=?').run(b.no, b.vendor);
    const ins = db.prepare(`INSERT INTO quote_res (consult_no,supplier_id,cate,res_id,unit_id,res_type,res_name,
      unit_name,spec,city,unit,cost,qty,amount,day,memo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const vname = db.prepare('SELECT supplier_name n FROM quote WHERE consult_no=? AND supplier_id=?').get(b.no, b.vendor)?.n || '';
    b.picks.filter(x => x && x.res_id).forEach(x => {
      ins.run(b.no, b.vendor, x.cate || '', x.res_id, x.unit_id || null,
        x.res_type || '', x.res_name || '', x.unit_name || '', x.spec || '', x.city || '', x.unit || '人',
        Math.round(+x.cost || 0), +x.qty || 1, Math.round((+x.cost || 0) * (+x.qty || 1)), x.day || null, x.memo || '');
      /* 供应商在报价台现填的价：回存成他对这个资源单元的报价，下次报价自动带出来，
         平台在资源库里也能看到这家给的是多少。 */
      if (x.saveRate && x.unit_id && +x.cost > 0) {
        const ex = db.prepare('SELECT id FROM gres_rate WHERE res_id=? AND unit_id=? AND supplier_id=?')
          .get(x.res_id, x.unit_id, b.vendor);
        if (ex) db.prepare("UPDATE gres_rate SET cost=?, status='on', updated_at=? WHERE id=?").run(Math.round(+x.cost), now(), ex.id);
        else db.prepare(`INSERT INTO gres_rate (res_id,unit_id,supplier_id,supplier_name,cost,tax,status,memo)
          VALUES (?,?,?,?,?,'含税','on',?)`).run(x.res_id, x.unit_id, b.vendor, vname, Math.round(+x.cost),
          `供应商报价 ${b.no} 时填入`);
      }
    });
  }
  const qs = db.prepare("SELECT * FROM quote WHERE consult_no=?").all(b.no);
  const anyQ = qs.some(q => q.state === 'quoted');
  if (anyQ) db.prepare("UPDATE consult SET sup_state='quoted' WHERE no=?").run(b.no);
  log(b.no, db.prepare('SELECT supplier_name n FROM quote WHERE consult_no=? AND supplier_id=?').get(b.no, b.vendor)?.n || '供应商',
    '提交报价', `结算价 ¥${total.toLocaleString()}（¥${Math.round(total / pax).toLocaleString()}/人）`);
  touch(b.no);
  res.json({ ok: 1 });
});
// AI 比价（纯算法，不调模型）
app.get('/api/csp/consult/:no/compare', (req, res) => {
  const no = req.params.no;
  const c = db.prepare('SELECT * FROM consult WHERE no=?').get(no);
  const qs = db.prepare("SELECT * FROM quote WHERE consult_no=? AND state IN ('quoted','won')").all(no).map(q => ({ ...q, items: P(q.items, []) }));
  if (qs.length < 1) return res.json({ ready: 0 });
  const pax = Math.max(1, c.adults + c.children + c.elders);
  const low = qs.reduce((a, b) => (a.total <= b.total ? a : b));
  const high = qs.reduce((a, b) => (a.total >= b.total ? a : b));
  const cats = ['地接车导', '酒店', '门票与体验', '餐食', '其他'].filter(n => qs.some(q => (q.items || []).some(i => i.n === n)));
  const table = cats.map(n => ({ n, cells: qs.map(q => (q.items.find(i => i.n === n) || {}).v || 0) }));
  const gross = c.quote ? Math.round((c.quote - low.total) / c.quote * 1000) / 10 : null;
  const reasons = [];
  reasons.push(`${low.supplier_name} 报价最低，¥${low.total.toLocaleString()}（¥${Math.round(low.total / pax).toLocaleString()}/人），比最高的 ${high.supplier_name} 低 ¥${(high.total - low.total).toLocaleString()}`);
  cats.forEach(n => {
    const vals = qs.map(q => (q.items.find(i => i.n === n) || {}).v || 0);
    const mn = Math.min(...vals), mx = Math.max(...vals);
    if (mx && (mx - mn) / mx > 0.12) reasons.push(`「${n}」这一项差距 ${Math.round((mx - mn) / mx * 100)}%，${qs[vals.indexOf(mn)].supplier_name} 最优`);
  });
  if (gross != null) reasons.push(`按当前对客报价 ¥${c.quote.toLocaleString()} 计，选最低价门店毛利率约 ${gross}%`);
  res.json({ ready: 1, vendors: qs.map(q => ({ id: q.supplier_id, name: q.supplier_name, total: q.total, per: q.per_person, memo: q.memo, state: q.state })), table, low: low.supplier_id, gross, reasons, pax, sell: c.quote });
});

/* ============ 销售端定制师对话（CSP） ============ */
const QA = [
  { k: 'dest', q: '客人想去哪儿？国家或城市都行（比如：意大利 罗马·佛罗伦萨）', ph: '目的地' },
  { k: 'days', q: '打算玩几天？', ph: '天数' },
  { k: 'goDate', q: '大概什么时候出发？', ph: '出发日期' },
  { k: 'pax', q: '几个人出行？（例：2大1小）', ph: '人数' },
  { k: 'budget', q: '预算大概多少？（总预算，人民币）', ph: '预算' },
  { k: 'prefs', q: '客人偏好什么？（亲子 / 蜜月 / 美食 / 摄影 / 自然 / 人文，可多选）', ph: '偏好' },
  { k: 'customer', q: '客人怎么称呼？留个电话我建单。', ph: '姓名电话' },
];
app.get('/api/csp/chat/:sess', (req, res) => {
  res.json(db.prepare('SELECT * FROM chat WHERE session_key=? ORDER BY id').all(req.params.sess).map(m => ({ ...m, payload: P(m.payload, null) })));
});
app.post('/api/csp/chat/:sess', (req, res) => {
  const sess = req.params.sess, b = req.body || {};
  const push = (role, text, kind = 'text', payload = null) =>
    db.prepare('INSERT INTO chat (session_key,role,kind,text,payload) VALUES (?,?,?,?,?)').run(sess, role, kind, text, payload ? J(payload) : null);
  const hist = db.prepare('SELECT * FROM chat WHERE session_key=? ORDER BY id').all(sess);
  const answers = {}; hist.filter(m => m.role === 'user').forEach((m, i) => { const step = QA[i]; if (step) answers[step.k] = m.text; });
  if (b.text) { push('user', b.text); answers[QA[Object.keys(answers).length]?.k || 'x'] = b.text; }
  const n = Object.keys(answers).length;
  if (n < QA.length) push('bot', QA[n].q);
  else {
    const pax = String(answers.pax || '2大');
    const adults = parseInt((pax.match(/(\d+)\s*[大成]/) || [])[1] || 2);
    const children = parseInt((pax.match(/(\d+)\s*[小儿]/) || [])[1] || 0);
    const elders = parseInt((pax.match(/(\d+)\s*[老长]/) || [])[1] || 0);
    const PMAP = { 亲子:'family', 蜜月:'honeymoon', 美食:'food', 摄影:'photo', 自然:'nature', 人文:'culture', 奢华:'luxury', 休闲:'leisure' };
    const prefs = Object.entries(PMAP).filter(([cn]) => String(answers.prefs || '').includes(cn)).map(([, en]) => en);
    const days = parseInt(String(answers.days || '8').replace(/\D/g, '')) || 8;
    const p = plan({ dest: answers.dest, days, adults, children, elders, prefs, fromCity: '北京' });
    const phone = (String(answers.customer || '').match(/1[3-9]\d{9}/) || [''])[0];
    const name = String(answers.customer || '客人').replace(/1[3-9]\d{9}/, '').trim() || '客人';
    const no = newNo(); const token = 'sh' + Math.random().toString(36).slice(2, 10);
    db.prepare(`INSERT INTO consult (no,source,status,customer,phone,from_city,dest,region,go_date,days,adults,children,elders,budget,prefs,sales_id,sales_name,channel_id,shop,quote,share_token)
      VALUES (?,'csp_agent','taken',?,?,'北京',?,?,?,?,?,?,?,?,?,?,?,'C001','优定制 · 望京旗舰店',?,?)`).run(
      no, name, phone, answers.dest, p.region, answers.goDate || '', days, adults, children, elders,
      parseInt(String(answers.budget || '').replace(/\D/g, '')) || null, J(prefs), 'S001', '李晴', p.total, token);
    savePlan(no, p, { ver: 1, kind: 'ai' });
    log(no, '定制师', '生成行程', `销售端对话建单 · ${p.route} · ${days} 天`);
    push('bot', `需求收齐了，我已经建单 ${no}，并排好了 ${days} 天的行程与报价。`, 'plan', { no, token, route: p.route, total: p.total, days: p.days.length, cover: p.cover });
  }
  res.json(db.prepare('SELECT * FROM chat WHERE session_key=? ORDER BY id').all(sess).map(m => ({ ...m, payload: P(m.payload, null) })));
});
app.delete('/api/csp/chat/:sess', (req, res) => { db.prepare('DELETE FROM chat WHERE session_key=?').run(req.params.sess); res.json({ ok: 1 }); });


/* ============ C 端登录与收藏 ============ */
/* 新账号的演示数据：两张不同状态的咨询单 + 三条收藏，让「我的」一进去就是活的 */
/* 一张已完成、已付清的历史订单：让演示账号的「我的订单 · 已完成」、
   「发票管理」都有东西可看，会员等级也落在中间档而不是永远最低档。 */
function seedDoneOrder(phone, nick) {
  if (db.prepare("SELECT COUNT(*) c FROM torder WHERE phone=? AND status='done'").get(phone).c) return;
  const y = new Date().getFullYear();
  const no = 'DD' + String(Date.now() + 7).slice(-10);
  const amount = 62000, cost = Math.round(amount * 0.7);
  db.prepare(`INSERT INTO torder (no,customer,phone,dest,days,pax,go_date,channel_id,shop,sales_name,
      amount,cost,supplier_id,supplier_name,status,paid,contract_no,created_at,trip_state,trip_back,settle_state,invoice_state)
    VALUES (?,?,?,'日本',7,2,?,'C001','优定制 · 望京旗舰店','李晴',?,?,'V03','关西风物 DMC','done',?,?,?,'已回团',?,'settled','none')`)
    .run(no, nick, phone, y + '-03-18', amount, cost, amount,
      'HT' + String(Date.now()).slice(-8), y + '-02-26 10:12:00', y + '-03-25');
  db.prepare(`INSERT INTO payment (order_no,kind,item,amount,way,trade_no,state,operator)
    VALUES (?,'recv','全款',?,'对公转账',?,'done','李晴')`)
    .run(no, amount, 'SK' + String(Date.now()).slice(-9));
  const NAMES = [[nick || '本人', 'adult'], ['许清和', 'adult']];
  NAMES.forEach(([n2, k], i) => db.prepare(
    `INSERT INTO traveler (order_no,name,kind,id_type,id_no,id_exp,phone,is_contact,doc_state)
     VALUES (?,?,?,'护照',?,?,?,?,'done')`)
    .run(no, n2, k, 'E' + (60000000 + i * 137) + (100 + i), (y + 6) + '-08-20', i ? '' : phone, i ? 0 : 1));
  olog(no, '销售', '李晴', '订单生成', '咨询单成交，订单落库');
  olog(no, '销售', '李晴', '收取全款', `全款 ${amount.toLocaleString()} 元已到账（对公转账）`);
  olog(no, '销售', '李晴', '出行通知', '行前说明与集合信息已发送');
  olog(no, '销售', '李晴', '回团', '客人已回国，行程结束');
  return no;
}

function seedGuestDemo(phone, nick) {
  const { plan } = require('./planner');
  const mk = (dest, days, adults, children, status, prefs, goDate, budget) => {
    const p = plan({ dest, days, adults, children, prefs, fromCity: '北京' });
    const no = newNo();
    const token = 'sh' + Math.random().toString(36).slice(2, 10);
    db.prepare(`INSERT INTO consult (no,source,status,customer,phone,from_city,dest,region,go_date,days,adults,children,elders,budget,prefs,sales_id,sales_name,channel_id,shop,quote,share_token)
      VALUES (?,'mini_ai',?,?,?,'北京',?,?,?,?,?,?,0,?,?,?,?,'C001','优定制 · 望京旗舰店',?,?)`).run(
      no, status, nick, phone, dest, p.region, goDate, days, adults, children, budget,
      JSON.stringify(prefs), status === 'pending' ? null : 'S001', status === 'pending' ? null : '李晴', p.total, token);
    const v = savePlan(no, p, { ver: 1, kind: 'ai' });
    log(no, 'AI 定制', '生成行程', `客人在小程序自助生成 · ${p.route} · ${days} 天`);
    if (status !== 'pending') log(no, '李晴', '接单', '状态从「待接单」变为「已接单」');
    return no;
  };
  try {
    // 一张已成交并生成订单的（客人能在「我的订单」看到进度），一张在办的，一张待接单的
    const wonNo = mk('冰岛', 9, 2, 0, 'won', ['photo', 'nature'], '2026-11-20', 90000);
    const c0 = db.prepare('SELECT * FROM consult WHERE no=?').get(wonNo);
    const on = 'DD' + String(Date.now()).slice(-10);
    db.prepare("UPDATE consult SET order_no=?, sup_pick='V02', sup_quote=?, sup_state='won' WHERE no=?")
      .run(on, Math.round((c0.quote || 0) * 0.68), wonNo);
    db.prepare(`INSERT INTO torder (no,consult_no,customer,phone,dest,days,pax,go_date,channel_id,shop,sales_name,amount,cost,supplier_id,supplier_name,status,paid,contract_no)
      VALUES (?,?,?,?,?,?,?,?,'C001','优定制 · 望京旗舰店','李晴',?,?,'V02','北欧极光 DMC','deposit',?,?)`).run(
      on, wonNo, nick, phone, c0.dest, c0.days, 2, c0.go_date, c0.quote,
      Math.round((c0.quote || 0) * 0.68), Math.round((c0.quote || 0) * 0.3), 'HT' + String(Date.now()).slice(-8));
    /* 演示订单也要带出行人：不然客人进「常用旅客」看到的是空的，
       而他明明有一张已成交的单。这也是常旅客能自动带出人来的前提。 */
    seedTravelers(on, c0);
    log(wonNo, '李晴', '生成订单', '订单号 ' + on);
    log(wonNo, '李晴', '收定金', '已收定金 ' + Math.round((c0.quote || 0) * 0.3).toLocaleString());
    log(wonNo, '李晴', '签约', '电子合同已签署');
    /* 订单自己的日志也要落。客人端订单详情的七段进度靠 orderlog 取每一步的时间点，
       原先只写咨询单日志，演示订单的进度条因此全是空时间。收款也要落 payment，
       不然订单详情里「已付」有数字但对不上任何一笔流水。 */
    const dep = Math.round((c0.quote || 0) * 0.3);
    db.prepare(`INSERT INTO payment (order_no,kind,item,amount,way,trade_no,state,operator)
      VALUES (?,'recv','定金',?,'微信支付',?,'done','李晴')`).run(on, dep, 'SK' + String(Date.now()).slice(-9));
    olog(on, '销售', '李晴', '订单生成', '咨询单成交，订单落库');
    olog(on, '销售', '李晴', '收取定金', `登记定金 ${dep.toLocaleString()} 元（微信支付）`);
    olog(on, '销售', '李晴', '签署合同', '电子合同签署完成');
    mk('意大利', 10, 2, 1, 'following', ['family', 'food'], '2027-04-05', 120000);   // 原来写的 'taken' 不在现行 5 态里
    mk('希腊', 9, 2, 0, 'pending', ['honeymoon'], '2027-05-01', 110000);
    /* 再补一张今年已走完、款已付清的历史单。演示账号如果只有一张付了定金的在途单，
       「发票管理」永远是空的（要付清全款才可开票），会员等级也一直停在最低档。 */
    seedDoneOrder(phone, nick);
    const favs = [['article', 'A1'], ['article', 'A5'], ['product', 'P02']];
    favs.forEach(([k, r]) => { try { db.prepare('INSERT INTO favorite (phone,kind,ref) VALUES (?,?,?)').run(phone, k, r); } catch {} });
  } catch (e) { console.warn('[demo] seed guest failed', e.message); }
}

/* 演示账号白名单：拿这几个号登录，「我的」页永远有内容可看（演示用）。
   其余手机号一律按真实客人处理，不灌任何数据。 */
const DEMO_PHONES = ['13900001234'];
app.post('/api/mini/login', (req, res) => {
  const b = req.body || {};
  const phone = String(b.phone || '').trim();
  if (!/^1[3-9]\d{9}$/.test(phone)) return res.status(400).json({ err: '手机号格式不对' });
  if (b.mode === 'phone' && String(b.code || '').length !== 4) return res.status(400).json({ err: '请输入 4 位验证码' });
  const ex = db.prepare('SELECT * FROM guest WHERE phone=?').get(phone);
  const nick = b.nick || (ex && ex.nick) || ('微信用户' + phone.slice(-4));
  if (ex) db.prepare("UPDATE guest SET nick=?, last_login=datetime('now','localtime') WHERE phone=?").run(nick, phone);
  else db.prepare("INSERT INTO guest (phone,nick,source,last_login) VALUES (?,?,?,datetime('now','localtime'))")
        .run(phone, nick, b.mode || 'wechat');
  const g = db.prepare('SELECT * FROM guest WHERE phone=?').get(phone);
  /* 演示数据只给两种情况：① 前端明确带了 demo 标记（微信一键登录，用的是随机号）；
     ② 手机号在演示账号白名单里。真实客人用自己手机号登录，不再被灌假旅程假订单。
     条件仍是「名下没有咨询单才补」——清理过演示数据之后，演示号再登录要能重建。 */
  const mine = db.prepare('SELECT COUNT(*) c FROM consult WHERE phone=?').get(phone).c;
  if ((b.demo || DEMO_PHONES.includes(phone)) && !mine) seedGuestDemo(phone, nick);
  res.json({ ok: 1, guest: { ...g, prefs: P(g.prefs, []) } });
});
app.get('/api/mini/me', (req, res) => {
  const phone = req.query.phone;
  const g = phone ? db.prepare('SELECT * FROM guest WHERE phone=?').get(phone) : null;
  if (!g) {
    /* 没登录也要给一张底图——「我的」的未登录态是一张邀请卡，不是空壳 */
    const hm = {}; db.prepare('SELECT * FROM home_config').all().forEach(r => hm[r.k] = P(r.v, null));
    return res.json({ guest: null, cover: ((hm.banners || [])[0] || {}).img || null });
  }
  const allCs = db.prepare('SELECT * FROM consult WHERE phone=? ORDER BY created_at DESC').all(phone);
  const consults = allCs.filter(c => c.guest_visible).map(c => ({ ...c, st_cn: ST_CN[c.status] }));
  const consultPending = allCs.filter(c => !c.guest_visible).length;   // 顾问还没推送的条数
  const favs = db.prepare('SELECT * FROM favorite WHERE phone=? ORDER BY id DESC').all(phone);
  const home = {}; db.prepare('SELECT * FROM home_config').all().forEach(r => home[r.k] = P(r.v, null));
  const arts = home.articles || [];
  const prods = db.prepare("SELECT * FROM product WHERE status='published' AND IFNULL(zx_sale_status,'在售')<>'停售'").all();
  const favList = favs.map(f => {
    if (f.kind === 'article') { const a = arts.find(x => x.id === f.ref); return a && { ...f, title: a.t, img: a.img, sub: a.k }; }
    if (f.kind === 'product') { const p2 = prods.find(x => x.id === f.ref); return p2 && { ...f, title: p2.title, img: p2.cover, sub: p2.dest + ' · ' + p2.days + ' 天', price: p2.price_from }; }
    return { ...f, title: f.ref, img: '', sub: '目的地' };
  }).filter(Boolean);
  /* 顶栏那句话：与其堆「N 段旅程、M 个收藏」这种统计，不如说一件此刻跟他有关的事。
     优先级：马上要出发的 → 正在路上的 → 走过哪些地方 → 还没开始。 */
  const ords = db.prepare('SELECT * FROM torder WHERE phone=? ORDER BY go_date').all(phone);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dayDiff = d => Math.ceil((new Date(d + 'T00:00:00') - today) / 86400000);
  const going = ords.find(o => o.trip_state === '出行中');
  const soon = ords.filter(o => o.go_date && dayDiff(o.go_date) >= 0 && o.trip_state !== '已回团')
    .sort((a, b) => a.go_date.localeCompare(b.go_date))[0];
  const been = [...new Set(ords.filter(o => o.trip_state === '已回团').map(o => o.dest))];
  let headline = null;
  if (going) headline = { kind: 'going', dest: going.dest, text: '正在' + going.dest + ' · 旅途愉快' };
  else if (soon) {
    const n = dayDiff(soon.go_date);
    headline = { kind: 'soon', dest: soon.dest, days: n,
      text: n === 0 ? '今天出发去' + soon.dest : '距 ' + soon.dest + ' 出发还有 ' + n + ' 天' };
  } else if (been.length) headline = { kind: 'been', dest: been[been.length - 1],
    text: '已走过 ' + been.length + ' 个目的地 · 最近一次 ' + been[been.length - 1] };
  else headline = { kind: 'none', text: '你的下一段旅程，从一个想法开始' };

  /* 「我的」做成旅行档案：封面用这位客人最近一段旅程的目的地图，
     每个人的档案封面长得不一样。没有旅程时退回首页主图 */
  const pickImg = dest => {
    if (!dest) return null;
    const key = String(dest).split(/[\s·]/)[0];
    const m = prods.find(x => x.dest && (x.dest.includes(key) || key.includes(x.dest)));
    return m ? m.cover : null;
  };
  const cover = (consults.length && pickImg(consults[0].dest))
    || (favList.find(f => f.img) || {}).img
    || ((home.banners || [])[0] || {}).img || null;
  res.json({
    guest: { ...g, prefs: P(g.prefs, []) },
    consults, consultPending, favs: favList, headline,
    cover,
    since: String(g.created_at || '').slice(0, 4) || null,
    stats: { consult: consults.length, fav: favList.length, order: consults.filter(c => c.order_no).length },
    advisor: home.advisor || null,
  });
});
/* 修改个人资料：昵称与头像落 guest 表。
   手机号不在这里改——consult / torder / favorite 全部按 phone 关联，
   直接改号会让客人的历史咨询单和订单对不上，真要支持换绑得先把账号主键从手机号里解耦。 */
app.post('/api/mini/profile', (req, res) => {
  const b = req.body || {};
  const phone = String(b.phone || '').trim();
  if (!phone) return res.status(401).json({ err: '请先登录' });
  const g = db.prepare('SELECT * FROM guest WHERE phone=?').get(phone);
  if (!g) return res.status(404).json({ err: '账号不存在' });
  const nick = String(b.nick == null ? g.nick : b.nick).trim();
  if (!nick) return res.status(400).json({ err: '昵称不能为空' });
  if (nick.length > 16) return res.status(400).json({ err: '昵称请控制在 16 个字以内' });
  const avatar = b.avatar == null ? g.avatar : String(b.avatar).slice(0, 16);
  /* 常用出发城市与偏好标签：客人自己维护，顾问接单时直接可见，少问一轮 */
  const fromCity = b.fromCity == null ? g.from_city : String(b.fromCity).trim().slice(0, 12);
  const prefs = b.prefs == null ? g.prefs : J((Array.isArray(b.prefs) ? b.prefs : []).slice(0, 9));
  /* 性别 / 生日 / 英文名 / 邮箱：生日对应会员的生日礼遇权益，
     英文名出境订机票要用，邮箱用来发行程单与电子合同。都允许留空。 */
  const GENDERS = ['女', '男', '不便透露'];
  const gender = b.gender == null ? g.gender : (GENDERS.includes(String(b.gender)) ? String(b.gender) : '');
  const birth = b.birth == null ? g.birth
    : (/^\d{4}-\d{2}-\d{2}$/.test(String(b.birth)) ? String(b.birth) : '');
  const enName = b.enName == null ? g.en_name
    : String(b.enName).replace(/[^A-Za-z \/]/g, '').toUpperCase().slice(0, 40).trim();
  const email = b.email == null ? g.email : String(b.email).trim().slice(0, 60);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ err: '邮箱格式不正确' });
  db.prepare(`UPDATE guest SET nick=?, avatar=?, from_city=?, prefs=?,
      gender=?, birth=?, en_name=?, email=? WHERE phone=?`)
    .run(nick, avatar, fromCity, prefs, gender, birth, enName, email, phone);
  const n = db.prepare('SELECT * FROM guest WHERE phone=?').get(phone);
  res.json({ ok: 1, guest: { ...n, prefs: P(n.prefs, []) } });
});
/* 开票申请：原先前端只弹一个 alert 就结束，什么也没存。
   torder 上本来就有 invoice_title / invoice_state 两个位，直接落进去，后台订单里能看见。 */
app.post('/api/mini/invoice', (req, res) => {
  const b = req.body || {};
  const o = b.no ? db.prepare('SELECT * FROM torder WHERE no=?').get(b.no) : null;
  if (!o) return res.status(404).json({ err: '订单不存在' });
  if (!['paid', 'done'].includes(o.status)) return res.status(400).json({ err: '该订单尚未付清全款，暂不能开票' });
  if (o.invoice_state === 'applied' || o.invoice_state === 'issued') return res.status(400).json({ err: '该订单已提交过开票申请' });
  const title = String(b.title || '').trim();
  if (!title) return res.status(400).json({ err: '请填写发票抬头' });
  db.prepare("UPDATE torder SET invoice_title=?, invoice_state='applied', updated_at=datetime('now','localtime') WHERE no=?")
    .run(title, b.no);
  olog(b.no, 'guest', o.customer || '客人', '申请开票',
    `抬头 ${title}${b.taxno ? ' · 税号 ' + b.taxno : ''}${b.email ? ' · 接收邮箱 ' + b.email : ''}`);
  res.json({ ok: 1 });
});
app.post('/api/mini/fav', (req, res) => {
  const { phone, kind, ref } = req.body || {};
  if (!phone) return res.status(401).json({ err: '请先登录' });
  const ex = db.prepare('SELECT id FROM favorite WHERE phone=? AND kind=? AND ref=?').get(phone, kind, ref);
  if (ex) { db.prepare('DELETE FROM favorite WHERE id=?').run(ex.id); return res.json({ ok: 1, on: 0 }); }
  db.prepare('INSERT INTO favorite (phone,kind,ref) VALUES (?,?,?)').run(phone, kind, ref);
  res.json({ ok: 1, on: 1 });
});
app.get('/api/mini/fav', (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.json([]);
  res.json(db.prepare('SELECT kind,ref FROM favorite WHERE phone=?').all(phone));
});


/* ============ 订单（三端共享） ============ */
/* 订单状态对齐众信旅游订单：主状态只描述「钱」，
   出行 / 资源确认 / 合同 / 保险 / 通知各自独立成状态位，不混在一起 */
const O_ST = { created: '待支付', deposit: '部分支付', paid: '已支付',
  done: '已完成', cancelled: '已取消', refunded: '已退订' };
const O_FLOW = { created: 'deposit', deposit: 'paid' };
function makeOrder(consultNo) {
  const c = db.prepare('SELECT * FROM consult WHERE no=?').get(consultNo);
  if (!c) return null;
  const ex = db.prepare('SELECT * FROM torder WHERE consult_no=?').get(consultNo);
  if (ex) return ex;
  const no = c.order_no || ('DD' + String(Date.now()).slice(-10));
  const q = c.sup_pick ? db.prepare('SELECT * FROM quote WHERE consult_no=? AND supplier_id=?').get(consultNo, c.sup_pick) : null;
  db.prepare(`INSERT INTO torder (no,consult_no,customer,phone,dest,days,pax,go_date,channel_id,shop,sales_name,amount,cost,supplier_id,supplier_name,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'created')`).run(
    no, consultNo, c.customer, c.phone, c.dest, c.days, (c.adults || 0) + (c.children || 0) + (c.elders || 0),
    c.go_date, c.channel_id, c.shop, c.sales_name, c.quote || c.budget || 0,
    c.sup_quote || (q && q.total) || 0, c.sup_pick || null, q ? q.supplier_name : null);
  db.prepare('UPDATE torder SET contact_name=?, contact_phone=? WHERE no=?').run(c.customer, c.phone, no);
  seedTravelers(no, c);
  olog(no, '系统', '系统', '订单生成', `由咨询单 ${consultNo} 成交生成，成交金额 ${(c.quote || c.budget || 0).toLocaleString()} 元`);
  return db.prepare('SELECT * FROM torder WHERE no=?').get(no);
}

/* 订单日志：三端共用一条流水，谁做的、做了什么，全留痕 */
function olog(no, role, who, act, detail) {
  db.prepare('INSERT INTO orderlog (order_no,role,who,act,detail) VALUES (?,?,?,?,?)')
    .run(no, role, who, act, detail || '');
}
/* 出行人：按咨询单里的人数结构先占位，姓名证件由销售在详情页补录 */
function seedTravelers(no, c) {
  if (db.prepare('SELECT COUNT(*) n FROM traveler WHERE order_no=?').get(no).n) return;
  const add = (kind, i, first) => db.prepare(
    `INSERT INTO traveler (order_no,name,kind,id_type,phone,is_contact,doc_state)
     VALUES (?,?,?,'护照',?,?, 'todo')`)
    .run(no, first ? c.customer : '', kind, first ? c.phone : '', first ? 1 : 0);
  let n = 0;
  for (let i = 0; i < (c.adults || 0); i++) add('adult', i, n++ === 0);
  for (let i = 0; i < (c.children || 0); i++) add('child', i, n++ === 0);
  for (let i = 0; i < (c.elders || 0); i++) add('elder', i, n++ === 0);
  if (!n) add('adult', 0, true);
}
const withProfit = o => ({ ...o, st_cn: O_ST[o.status] || o.status, next: O_FLOW[o.status],
  profit: (o.amount || 0) - (o.cost || 0),
  rate: o.amount ? Math.round(((o.amount - (o.cost || 0)) / o.amount) * 1000) / 10 : null });

app.get('/api/order/list', (req, res) => {
  const { scope, vendor, q, status } = req.query;
  let rows = db.prepare('SELECT * FROM torder ORDER BY created_at DESC').all();
  if (scope === 'ubk') rows = rows.filter(o => o.supplier_id === (vendor || 'V01'));
  if (status && status !== 'all') rows = rows.filter(o => o.status === status);
  if (q) { const s2 = q.toLowerCase(); rows = rows.filter(o => [o.no, o.customer, o.phone, o.dest, o.sales_name].join('|').toLowerCase().includes(s2)); }
  res.json(rows.map(o => {
    const recv = db.prepare("SELECT IFNULL(SUM(amount),0) s FROM payment WHERE order_no=? AND kind='recv' AND state='done'").get(o.no).s;
    const refunded = db.prepare("SELECT IFNULL(SUM(amount),0) s FROM payment WHERE order_no=? AND kind='refund' AND state='done'").get(o.no).s;
    const fees = db.prepare('SELECT * FROM fee WHERE order_no=?').all(o.no);
    const feeC = fees.filter(f => f.bear === '客人').reduce((a, f) => a + (f.amount || 0), 0);
    const due = (o.amount || 0) + feeC, net = recv - refunded;
    return {
      ...withProfit(o),
      due, recv, refunded, net, fee: feeC,
      owe: ['refunded', 'cancelled'].includes(o.status) ? 0 : Math.max(0, due - net),
      gross: (o.amount || 0) + feeC - (o.cost || 0) - refunded,
      payable_open: o.settle_state === 'paid' ? 0 : (o.cost || 0),
      payable_paid: o.settle_state === 'paid' ? (o.cost || 0) : 0,
      view: orderView(o, recv, refunded, fees),
    };
  }));
});
app.get('/api/order/stats', (req, res) => {
  const { scope, vendor } = req.query;
  let rows = db.prepare('SELECT * FROM torder').all();
  if (scope === 'ubk') rows = rows.filter(o => o.supplier_id === (vendor || 'V01'));
  const sum = (f, k) => rows.filter(f).reduce((a, r) => a + (r[k] || 0), 0);
  res.json({
    count: rows.length, amount: sum(() => true, 'amount'), cost: sum(() => true, 'cost'),
    profit: sum(() => true, 'amount') - sum(() => true, 'cost'),
    doing: rows.filter(o => !['done', 'refunded'].includes(o.status)).length,
    done: rows.filter(o => o.status === 'done').length,
    byStatus: Object.fromEntries(Object.keys(O_ST).map(k => [k, rows.filter(o => o.status === k).length])),
  });
});
/* ============ 订单详情中台（三端共用一套数据，按角色裁剪展示） ============
   结构对齐签证业务线的订单详情：关键信息 + 四个主页签 + 交易子页签 + 订单日志 + 底部操作条。
   两条业务线共用一个订单底层，所以字段命名与状态机保持一致，只把「办签人/办签进度」
   换成「出行人/定制进度」。 */

/* 七段进度：正向七步 + 逆向两态，时间点取订单日志里第一条命中的记录 */
const PROG = [
  ['created', '订单生成', '咨询单成交，订单落库'],
  ['deposit', '收取定金', '客人支付定金，资源开始锁定'],
  ['contracted', '签署合同', '电子合同签署完成'],
  ['paid', '收取全款', '出行款项结清'],
  ['ready', '出行准备', '确认单、签证与行前说明发出'],
  ['traveling', '出行中', '客人已出发，境外服务跟进中'],
  ['done', '行程完成', '回程后结算与回访'],
];
/* 七段进度的真实阶段：钱走到哪 + 合同签没签 + 人出发没有，三者合起来判断 */
function stageOf(o) {
  if (o.status === 'done') return 6;
  if (o.trip_state === '已回团') return 6;
  if (o.trip_state === '出行中') return 5;
  if (o.status === 'paid') return o.res_state === '已确认' || o.notify_state === '已通知' ? 4 : 3;
  if (o.contract_no) return 2;
  if (o.status === 'deposit') return 1;
  return 0;
}
function progressOf(o, logs) {
  const closed = ['refunded', 'cancelled'].includes(o.status);
  // 订单已关闭时，状态字段已经不代表进度了，改按日志回推真正走到了哪一步
  // rank = 已经走完到第几个节点。
  // 「已付定金 / 已签约 / 已付全款」这类状态名描述的是已完成的事，对应节点算 done；
  // 「出行准备 / 出行中」描述的是正在进行的事，对应节点算 doing，所以 rank 要退一格。
  let rank = stageOf(o);
  // 「出行中」是进行时，对应节点算 doing 而不是 done
  if (o.trip_state === '出行中' && o.status !== 'done') rank -= 1;
  if (closed) {
    rank = 0;
    PROG.forEach((p, i) => { if (logs.some(l => l.act === p[1])) rank = Math.max(rank, i); });
  }
  return PROG.map((p, i) => {
    const hit = logs.find(l => l.act === p[1] || (l.detail || '').includes(p[1]));
    return {
      key: p[0], title: p[1], desc: p[2],
      state: closed ? (i <= rank ? 'done' : 'skip')
        : i <= rank ? 'done' : i === rank + 1 ? 'doing' : 'todo',
      at: hit ? hit.created_at : (i === 0 ? o.created_at : null),
      by: hit ? hit.who : null,
    };
  });
}
function orderFull(no) {
  const o = db.prepare('SELECT * FROM torder WHERE no=?').get(no);
  if (!o) return null;
  const logs = db.prepare('SELECT * FROM orderlog WHERE order_no=? ORDER BY id DESC').all(no);
  const pays = db.prepare('SELECT * FROM payment WHERE order_no=? ORDER BY id').all(no);
  const recv = pays.filter(p => p.kind === 'recv' && p.state === 'done').reduce((a, p) => a + p.amount, 0);
  const refunded = pays.filter(p => p.kind === 'refund' && p.state === 'done').reduce((a, p) => a + p.amount, 0);
  const fees = db.prepare('SELECT * FROM fee WHERE order_no=? ORDER BY id').all(no);
  return {
    ...withProfit(o),
    consult: fullConsult(o.consult_no),
    travelers: db.prepare('SELECT * FROM traveler WHERE order_no=? ORDER BY is_contact DESC, id').all(no),
    logs, payments: pays, fees,
    resItems: db.prepare('SELECT * FROM res_item WHERE order_no=? ORDER BY id').all(no),
    money: (() => {
      const fee = fees.filter(f => f.bear === '客人').reduce((a, f) => a + (f.amount || 0), 0);
      const net = recv - refunded;                       // 实收净额
      const due = (o.amount || 0) + fee;                 // 应收 = 成交价 + 客人承担的费用
      return {
        amount: o.amount || 0, fee, due, recv, refunded, net,
        owe: ['refunded', 'cancelled'].includes(o.status) ? 0 : Math.max(0, due - net),
        cost: o.cost || 0, profit: (o.amount || 0) + fee - (o.cost || 0) - refunded,
      };
    })(),
    progress: progressOf(o, logs.slice().reverse()),
    view: orderView(o, recv, refunded, fees),
  };
}
/* 订单的派生字段：和签证业务线那张详情页一一对应的口径。
   没有维护的字段一律给 null，页面上显示「—」，不拿别的字段顶上去。 */
const SRC_BIZ = { mini_ai: '小程序 · AI 行程师', mini_form: '小程序 · 需求表单',
  csp_agent: '门店 · 定制师对话', csp_manual: '门店 · 手工建单' };
const SRC_CLIENT = { mini_ai: '微信小程序', mini_form: '微信小程序',
  csp_agent: '门店工作台', csp_manual: '门店工作台' };
function orderView(o, recv, refunded, fees) {
  const c = o.consult_no ? db.prepare('SELECT * FROM consult WHERE no=?').get(o.consult_no) : null;
  const feeC = fees.filter(f => f.bear === '客人').reduce((a, f) => a + (f.amount || 0), 0);
  const due = (o.amount || 0) + feeC, net = recv - refunded;
  const trv = db.prepare('SELECT * FROM traveler WHERE order_no=?').all(o.no);
  const docDone = trv.length && trv.every(t => t.doc_state === 'done');
  const prod = db.prepare('SELECT * FROM product WHERE id=?').get(o.product_id || '') || null;
  /* v57：渠道与分公司原来都取 o.shop，两列内容一模一样。渠道 = channel.name（门店），
     分公司 = channel.company（签约主体），来源不同，后台订单列表要分两列看。 */
  const ch = db.prepare('SELECT * FROM channel WHERE id=?').get(o.channel_id || '') || null;
  return {
    // 订单状态一律由「钱」推导，避免库里的 status 与实收金额两处打架
    status_key: ['done', 'cancelled', 'refunded'].includes(o.status) ? o.status
      : net <= 0 ? 'created' : net >= due ? 'paid' : 'deposit',
    status_text: ['done', 'cancelled', 'refunded'].includes(o.status) ? O_ST[o.status]
      : net <= 0 ? '待支付' : net >= due ? '已支付' : '部分支付',
    /* 众信口径：订单状态（钱）/ 出行状态 / 资源确认 / 合同 / 保险 / 出行通知 各自独立 */
    trip_state: o.trip_state || '未出行',
    res_state: ['refunded', 'cancelled'].includes(o.status) ? '已终止' : (o.res_state || '待确认'),
    insure_state: o.insure_state || '未投保',
    notify_state: o.notify_state || '未通知',
    audit_state: o.refund_state === 'applied' ? '退款待审核' : (o.audit_state || '无需审核'),
    pay_state: ['refunded', 'cancelled'].includes(o.status) ? 'closed'
      : net <= 0 ? 'unpaid' : net >= due ? 'paid' : 'part',
    pay_state_cn: ['refunded', 'cancelled'].includes(o.status) ? '已关闭'
      : net <= 0 ? '未支付' : net >= due ? '已付清' : '部分支付',
    recv_state: o.settle_state === 'paid' ? 'paid' : 'unpaid',
    recv_state_cn: o.settle_state === 'paid' ? '已收款' : '待收款',
    contract_status: o.contract_no ? '已签约' : '未签约',
    /* 快捷待办分类：和众信顶部那排「待占位 / 临近出团未收全款 / 超期欠款」一个意思 */
    flags: (() => {
      const f = [];
      const open2 = !['done', 'cancelled', 'refunded'].includes(o.status);
      const owe = Math.max(0, due - net);
      const days = o.go_date ? Math.ceil((new Date(o.go_date) - new Date()) / 864e5) : null;
      if (open2 && (o.res_state || '待确认') !== '已确认') f.push('res');
      if (open2 && !o.contract_no) f.push('contract');
      if (open2 && owe > 0 && days != null && days <= 15) f.push('nearowe');
      if (open2 && owe > 0 && days != null && days < 0) f.push('overdue');
      if (o.refund_state === 'applied') f.push('refund');
      if (open2 && o.trip_state === '未出行' && days != null && days >= 0 && days <= 7) f.push('neargo');
      return f;
    })(),
    biz_source: c ? (SRC_BIZ[c.source] || c.source) : '门店 · 手工建单',
    client: c ? (SRC_CLIENT[c.source] || '—') : '门店工作台',
    channel_text: (ch && ch.name) || o.shop || '门店直营',
    channel_code: o.channel_id || null,
    channel_city: (ch && ch.city) || null,
    sale_org: (ch && ch.company) || null,
    cust_type: '直客',
    cust_name: o.customer,
    settle_entity: '北京众信悠哉国际旅行社有限公司',
    invoice_entity: '众信旅游集团',
    created_by_name: o.sales_name || null,
    doc_state: !trv.length ? null : docDone ? '已录齐' : '待录入',
    doc_left: trv.filter(t => t.doc_state !== 'done').length,
    cover: (() => {
      const pl = o.consult_no ? db.prepare('SELECT cover FROM plan WHERE consult_no=? AND is_cur=1').get(o.consult_no) : null;
      if (pl && pl.cover) return pl.cover;
      if (prod && prod.cover) return prod.cover;
      // 兜底：按目的地取一张图，别让列表里出现空图位
      const dk = Object.values(DEST).find(x => (o.dest || '').includes(x.name));
      return dk ? (BANK[dk.img[0]] || [])[0] || null : null;
    })(),
    product: {
      name: (c && c.dest) || o.dest,
      route: null,     // 下面用当前行程版本补
      type: prod ? (prod.type === 'smallgroup' ? '臻品团' : '定制产品') : '一对一定制',
      code: o.product_id || null,
      supplier: o.supplier_name || null,
      region: c ? c.region : null,
      theme: c ? c.theme : null,
      from_city: c ? c.from_city : null,
    },
    // 手工建单没有咨询单，人数结构按全成人兜底，列表里不出现两种排版
    pax_mix: c ? { adults: c.adults || 0, children: c.children || 0, elders: c.elders || 0 }
               : { adults: o.pax || 0, children: 0, elders: 0 },
  };
}
app.get('/api/order/:no/full', (req, res) => {
  const d = orderFull(req.params.no);
  d ? res.json(d) : res.status(404).json({ err: '订单不存在' });
});

/* 出行人维护 */
app.post('/api/order/:no/traveler', (req, res) => {
  if (!db.prepare('SELECT 1 FROM torder WHERE no=?').get(req.params.no)) return res.status(404).json({ err: '订单不存在' });
  const b = req.body || {}, no = req.params.no;
  if (b.id) {
    db.prepare(`UPDATE traveler SET name=?,en_name=?,gender=?,birth=?,kind=?,id_type=?,id_no=?,id_exp=?,
      phone=?,doc_state=?,remark=? WHERE id=? AND order_no=?`).run(
      b.name || '', b.en_name || '', b.gender || '', b.birth || '', b.kind || 'adult',
      b.id_type || '护照', b.id_no || '', b.id_exp || '', b.phone || '',
      b.doc_state || 'todo', b.remark || '', b.id, no);
    olog(no, b.role || '销售', b.who || '李晴', '出行人更新', `更新出行人「${b.name || '未命名'}」的信息`);
  } else {
    db.prepare(`INSERT INTO traveler (order_no,name,en_name,gender,birth,kind,id_type,id_no,id_exp,phone,doc_state,remark)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(no, b.name || '', b.en_name || '', b.gender || '', b.birth || '',
        b.kind || 'adult', b.id_type || '护照', b.id_no || '', b.id_exp || '', b.phone || '',
        b.doc_state || 'todo', b.remark || '');
    olog(no, b.role || '销售', b.who || '李晴', '出行人新增', `新增出行人「${b.name || '未命名'}」`);
  }
  res.json({ ok: 1 });
});
app.delete('/api/order/:no/traveler/:id', (req, res) => {
  if (!db.prepare('SELECT 1 FROM torder WHERE no=?').get(req.params.no)) return res.status(404).json({ err: '订单不存在' });
  const t = db.prepare('SELECT * FROM traveler WHERE id=?').get(req.params.id);
  db.prepare('DELETE FROM traveler WHERE id=? AND order_no=?').run(req.params.id, req.params.no);
  olog(req.params.no, '销售', '李晴', '出行人删除', `删除出行人「${(t && t.name) || ''}」`);
  res.json({ ok: 1 });
});

/* 资源确认：供应商逐项回写（机位 / 酒店 / 地接车导 / 餐食 / 门票），
   全部确认后订单的资源状态自动置「已确认」，门店与总部同步看到。 */
app.post('/api/order/:no/res', (req, res) => {
  const no = req.params.no, b = req.body || {};
  const o = db.prepare('SELECT * FROM torder WHERE no=?').get(no);
  if (!o) return res.status(404).json({ err: '订单不存在' });
  if (!b.id) return res.status(400).json({ err: '缺少资源项' });
  const it = db.prepare('SELECT * FROM res_item WHERE id=? AND order_no=?').get(b.id, no);
  if (!it) return res.status(404).json({ err: '资源项不存在' });
  const st = ['todo', 'done', 'fail'].includes(b.state) ? b.state : 'done';
  db.prepare("UPDATE res_item SET state=?, memo=?, who=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(st, b.memo || it.memo || '', b.who || o.supplier_name || '供应商', b.id);
  const all = db.prepare('SELECT * FROM res_item WHERE order_no=?').all(no);
  const ok = all.length && all.every(x => x.state === 'done');
  const anyFail = all.some(x => x.state === 'fail');
  const next = anyFail ? '确认失败' : ok ? '已确认' : '待确认';
  if (next !== o.res_state) {
    db.prepare("UPDATE torder SET res_state=?, updated_at=datetime('now','localtime') WHERE no=?").run(next, no);
    olog(no, '供应商', b.who || o.supplier_name || '供应商', next === '已确认' ? '资源确认' : '资源状态变更',
      next === '已确认' ? '机位、酒店与地接车导等资源全部确认完毕' : `资源状态变为「${next}」`);
  } else {
    olog(no, '供应商', b.who || o.supplier_name || '供应商', '资源回写',
      `${it.cate}：${{ done: '已确认', todo: '待确认', fail: '无法确认' }[st]}${b.memo ? '，' + b.memo : ''}`);
  }
  res.json({ ok: 1, res_state: next });
});

/* 收款登记：定金 / 尾款 / 全款，落流水再回写订单状态 */
const PAY_NEXT = { 定金: 'deposit', 尾款: 'paid', 全款: 'paid' };
app.post('/api/order/:no/pay', (req, res) => {
  const no = req.params.no, b = req.body || {};
  const o = db.prepare('SELECT * FROM torder WHERE no=?').get(no);
  if (!o) return res.status(404).json({ err: '订单不存在' });
  if (['refunded', 'cancelled'].includes(o.status)) return res.status(409).json({ err: '订单已关闭，不能再收款' });
  const amt = Math.round(+b.amount || 0);
  if (amt <= 0) return res.status(400).json({ err: '收款金额要大于 0' });
  const already = db.prepare("SELECT IFNULL(SUM(amount),0) s FROM payment WHERE order_no=? AND kind='recv' AND state='done'").get(no).s;
  const feeSum = db.prepare("SELECT IFNULL(SUM(amount),0) s FROM fee WHERE order_no=? AND bear='客人'").get(no).s;
  const due = (o.amount || 0) + feeSum;
  if (already + amt > due + 1) return res.status(400).json({
    err: `超出应收：本单应收 ${due.toLocaleString()} 元（含客人承担费用 ${feeSum.toLocaleString()} 元），已收 ${already.toLocaleString()} 元` });
  const item = b.item || '定金';
  db.prepare(`INSERT INTO payment (order_no,kind,item,amount,way,trade_no,state,operator)
    VALUES (?,'recv',?,?,?,?, 'done', ?)`).run(no, item, amt, b.way || '对公转账',
      'SK' + String(Date.now()).slice(-9), b.who || '李晴');
  const recv = already + amt;
  let st = o.status;
  if (['done', 'cancelled', 'refunded'].includes(o.status)) st = o.status;
  else if (recv >= due) st = 'paid';
  else if (recv > 0) st = 'deposit';
  db.prepare("UPDATE torder SET paid=?, status=?, updated_at=datetime('now','localtime') WHERE no=?").run(recv, st, no);
  olog(no, '销售', b.who || '李晴', recv >= due ? '收取全款' : '收取定金',
    `登记${item} ${amt.toLocaleString()} 元（${b.way || '对公转账'}），累计已收 ${recv.toLocaleString()} 元`);
  res.json({ ok: 1, recv, status: st });
});

/* 合同签署 */
app.post('/api/order/:no/contract', (req, res) => {
  const no = req.params.no, o = db.prepare('SELECT * FROM torder WHERE no=?').get(no);
  if (!o) return res.status(404).json({ err: '订单不存在' });
  if (o.contract_no) return res.status(409).json({ err: '本单已签约：' + o.contract_no });
  if ((o.paid || 0) <= 0) return res.status(409).json({ err: '请先登记定金再签署合同' });
  const cno = 'HT' + String(Date.now()).slice(-8);
  /* 签约不改订单状态。status 只描述「钱走到哪」（待支付/部分支付/已支付/完成/取消/退订），
     签没签约由 contract_no 表示，进度条那一格由 stageOf() 统一判断。
     原先这里想把状态推成 'contracted'，但 'contracted' 不在 O_ST 里，
     客人端查不到对应中文就兜底显示「待支付」——已签约已付定金的单写成待支付。 */
  db.prepare("UPDATE torder SET contract_no=?, updated_at=datetime('now','localtime') WHERE no=?").run(cno, no);
  olog(no, '销售', (req.body || {}).who || '李晴', '签署合同', `电子合同 ${cno} 签署完成`);
  res.json({ ok: 1, contract_no: cno, status: o.status });
});

/* 推进履约：资源确认 → 出行通知 → 出发 → 回团。订单状态（钱）不受影响，
   只有回团后才把订单置为「已完成」——这和众信「订单状态 / 出团通知状态 / 占位状态」分开是一个口径。 */
app.post('/api/order/:no/forward', (req, res) => {
  const no = req.params.no, b = req.body || {}, who = b.who || '李晴';
  const o = db.prepare('SELECT * FROM torder WHERE no=?').get(no);
  if (!o) return res.status(404).json({ err: '订单不存在' });
  if (['cancelled', 'refunded'].includes(o.status)) return res.status(409).json({ err: '订单已关闭，不能再推进' });
  const step = b.step || (o.res_state !== '已确认' ? 'res'
    : o.notify_state !== '已通知' ? 'notify'
    : o.trip_state === '未出行' ? 'go'
    : o.trip_state === '出行中' ? 'back' : null);
  if (!step) return res.status(409).json({ err: '当前没有可推进的履约动作' });
  if (step === 'res') {
    db.prepare("UPDATE torder SET res_state='已确认', updated_at=datetime('now','localtime') WHERE no=?").run(no);
    olog(no, '供应商', who, '资源确认', '机位、酒店与地接车导已全部确认');
    return res.json({ ok: 1, res_state: '已确认' });
  }
  if (step === 'notify') {
    db.prepare("UPDATE torder SET notify_state='已通知', updated_at=datetime('now','localtime') WHERE no=?").run(no);
    olog(no, '销售', who, '出行准备', '确认单、行前说明与紧急联系卡已发送给客人');
    return res.json({ ok: 1, notify_state: '已通知' });
  }
  if (step === 'go') {
    const feeSum = db.prepare("SELECT IFNULL(SUM(amount),0) s FROM fee WHERE order_no=? AND bear='客人'").get(no).s;
    const recv = db.prepare("SELECT IFNULL(SUM(amount),0) s FROM payment WHERE order_no=? AND kind='recv' AND state='done'").get(no).s;
    const rf = db.prepare("SELECT IFNULL(SUM(amount),0) s FROM payment WHERE order_no=? AND kind='refund' AND state='done'").get(no).s;
    if (recv - rf < (o.amount || 0) + feeSum)
      return res.status(409).json({ err: `款项未结清：应收 ${((o.amount || 0) + feeSum).toLocaleString()} 元，实收 ${(recv - rf).toLocaleString()} 元` });
    db.prepare("UPDATE torder SET trip_state='出行中', updated_at=datetime('now','localtime') WHERE no=?").run(no);
    olog(no, '销售', who, '出行中', '客人已出发，境外服务由地接跟进');
    return res.json({ ok: 1, trip_state: '出行中' });
  }
  db.prepare("UPDATE torder SET trip_state='已回团', status='done', updated_at=datetime('now','localtime') WHERE no=?").run(no);
  olog(no, '销售', who, '行程完成', '客人已回团，进入结算与回访');
  res.json({ ok: 1, trip_state: '已回团', status: 'done' });
});

/* 逆向：取消订单（未收款）/ 申请退款（已收款）→ 审核 → 到账 */
app.post('/api/order/:no/cancel', (req, res) => {
  const no = req.params.no, b = req.body || {};
  const o = db.prepare('SELECT * FROM torder WHERE no=?').get(no);
  if (!o) return res.status(404).json({ err: '订单不存在' });
  if (['refunded', 'cancelled', 'done'].includes(o.status)) return res.status(409).json({ err: '该订单已结束，不能取消' });
  if (o.trip_state !== '未出行') return res.status(409).json({ err: '客人已出发，不能直接取消订单' });
  if ((o.paid || 0) > 0) return res.status(409).json({ err: '本单已收款 ' + o.paid + ' 元，请走「申请退款」流程' });
  if (!b.reason) return res.status(400).json({ err: '请填写取消原因' });
  db.prepare("UPDATE torder SET status='cancelled', cancel_reason=?, updated_at=datetime('now','localtime') WHERE no=?").run(b.reason, no);
  if (o.consult_no) {
    db.prepare("UPDATE consult SET status='lost', updated_at=datetime('now','localtime') WHERE no=?").run(o.consult_no);
    log(o.consult_no, '销售', '订单取消', `订单 ${no} 取消：${b.reason}`);
  }
  olog(no, '销售', b.who || '李晴', '取消订单', b.reason);
  res.json({ ok: 1, status: 'cancelled' });
});
/* 退款单：发起 → 待审核；审核通过后按扣费金额出账 */
app.post('/api/order/:no/refund/apply', (req, res) => {
  const no = req.params.no, b = req.body || {};
  const o = db.prepare('SELECT * FROM torder WHERE no=?').get(no);
  if (!o) return res.status(404).json({ err: '订单不存在' });
  if (o.refund_state === 'applied') return res.status(409).json({ err: '已有一笔退款在审核中' });
  if ((o.paid || 0) <= 0) return res.status(409).json({ err: '本单没有收款记录，请直接取消订单' });
  const amt = Math.round(+b.amount || 0);
  if (amt <= 0 || amt > o.paid) return res.status(400).json({ err: `退款金额要在 1 – ${o.paid} 元之间` });
  if (!b.reason) return res.status(400).json({ err: '请填写退款原因' });
  db.prepare(`INSERT INTO payment (order_no,kind,item,amount,way,trade_no,state,operator,reason)
    VALUES (?,'refund','退款',?,?,?, 'pending', ?, ?)`).run(no, amt, b.way || '原路退回',
      'TK' + String(Date.now()).slice(-9), b.who || '李晴', b.reason);
  db.prepare("UPDATE torder SET refund_state='applied', refund_amount=?, updated_at=datetime('now','localtime') WHERE no=?").run(amt, no);
  olog(no, '销售', b.who || '李晴', '申请退款',
    `申请退款 ${amt.toLocaleString()} 元（已收 ${(o.paid || 0).toLocaleString()} 元），原因：${b.reason}`);
  res.json({ ok: 1 });
});
app.post('/api/order/:no/refund/audit', (req, res) => {
  const no = req.params.no, b = req.body || {};
  const o = db.prepare('SELECT * FROM torder WHERE no=?').get(no);
  const pay = db.prepare("SELECT * FROM payment WHERE order_no=? AND kind='refund' AND state='pending' ORDER BY id DESC").get(no);
  if (!o || !pay) return res.status(404).json({ err: '没有待审核的退款单' });
  if (b.pass === false) {
    db.prepare("UPDATE payment SET state='rejected' WHERE id=?").run(pay.id);
    db.prepare("UPDATE torder SET refund_state='rejected', updated_at=datetime('now','localtime') WHERE no=?").run(no);
    olog(no, '总部', b.who || '运营管理员', '退款驳回', b.reason || '不符合退改政策');
    return res.json({ ok: 1, state: 'rejected' });
  }
  db.prepare("UPDATE payment SET state='done' WHERE id=?").run(pay.id);
  // 退款出账即视为本单终止：退给客人的是 pay.amount，差额是按退改规则扣下的损失，
  // 不能继续当「待收」挂在订单上，否则报表里会出现永远收不回来的应收。
  const loss = Math.max(0, (o.paid || 0) - pay.amount);
  db.prepare(`UPDATE torder SET refund_state='done', paid=?, status='refunded', updated_at=datetime('now','localtime') WHERE no=?`)
    .run(Math.max(0, (o.paid || 0) - pay.amount), no);
  if (o.consult_no) {
    db.prepare("UPDATE consult SET status='lost', updated_at=datetime('now','localtime') WHERE no=?").run(o.consult_no);
    log(o.consult_no, '总部', '订单退款', `订单 ${no} 退款 ${pay.amount} 元并关闭`);
  }
  olog(no, '总部', b.who || '运营管理员', '退款到账',
    `退款 ${pay.amount.toLocaleString()} 元已出账（${pay.way}）；按退改规则扣除 ${loss.toLocaleString()} 元，订单关闭`);
  res.json({ ok: 1, state: 'done', status: 'refunded' });
});

/* 其他费用（改签费 / 单房差 / 签证费…） */
app.post('/api/order/:no/fee', (req, res) => {
  if (!db.prepare('SELECT 1 FROM torder WHERE no=?').get(req.params.no)) return res.status(404).json({ err: '订单不存在' });
  const b = req.body || {}, no = req.params.no;
  if (!b.name || !(+b.amount)) return res.status(400).json({ err: '费用名目和金额都要填' });
  db.prepare('INSERT INTO fee (order_no,name,amount,bear,remark) VALUES (?,?,?,?,?)')
    .run(no, b.name, Math.round(+b.amount), b.bear || '客人', b.remark || '');
  olog(no, '销售', b.who || '李晴', '新增费用', `${b.name} ${(+b.amount).toLocaleString()} 元，由${b.bear || '客人'}承担`);
  res.json({ ok: 1 });
});
app.delete('/api/order/:no/fee/:id', (req, res) => {
  if (!db.prepare('SELECT 1 FROM torder WHERE no=?').get(req.params.no)) return res.status(404).json({ err: '订单不存在' });
  const f = db.prepare('SELECT * FROM fee WHERE id=?').get(req.params.id);
  db.prepare('DELETE FROM fee WHERE id=? AND order_no=?').run(req.params.id, req.params.no);
  olog(req.params.no, '销售', '李晴', '删除费用', `删除「${(f && f.name) || ''}」`);
  res.json({ ok: 1 });
});

/* 供应商结算（UBK 侧） */
app.post('/api/order/:no/settle', (req, res) => {
  const no = req.params.no, o = db.prepare('SELECT * FROM torder WHERE no=?').get(no);
  if (!o) return res.status(404).json({ err: '订单不存在' });
  db.prepare("UPDATE torder SET settle_state='paid', updated_at=datetime('now','localtime') WHERE no=?").run(no);
  db.prepare(`INSERT INTO payment (order_no,kind,item,amount,way,trade_no,state,operator)
    VALUES (?,'settle','供应商结算',?,?,?, 'done', ?)`)
    .run(no, o.cost || 0, '对公转账', 'JS' + String(Date.now()).slice(-9), (req.body || {}).who || '财务');
  olog(no, '总部', (req.body || {}).who || '财务', '供应商结算', `向 ${o.supplier_name || '供应商'} 结算 ${(o.cost || 0).toLocaleString()} 元`);
  res.json({ ok: 1 });
});

/* 备注与手工日志 */
app.post('/api/order/:no/note', (req, res) => {
  if (!db.prepare('SELECT 1 FROM torder WHERE no=?').get(req.params.no)) return res.status(404).json({ err: '订单不存在' });
  const b = req.body || {};
  if (!b.text) return res.status(400).json({ err: '备注内容不能为空' });
  db.prepare("UPDATE torder SET remark=? WHERE no=?").run(b.text, req.params.no);
  olog(req.params.no, b.role || '销售', b.who || '李晴', '添加备注', b.text);
  res.json({ ok: 1 });
});

app.get('/api/order/:no', (req, res) => {
  const o = db.prepare('SELECT * FROM torder WHERE no=?').get(req.params.no);
  if (!o) return res.status(404).json({ err: 'not found' });
  const f = fullConsult(o.consult_no);
  res.json({ ...withProfit(o), consult: f });
});
app.post('/api/order/:no/action', (req, res) => {
  const o = db.prepare('SELECT * FROM torder WHERE no=?').get(req.params.no);
  if (!o) return res.status(404).json({ err: 'not found' });
  const key = (req.body || {}).key;
  const next = O_FLOW[o.status];
  if (key === 'next') {
    if (!next) return res.status(409).json({ err: '这一单已经走到最后一步' });
    const paid = next === 'deposit' ? Math.round((o.amount || 0) * 0.3) : next === 'paid' ? o.amount : o.paid;
    const cno = next === 'contracted' ? ('HT' + String(Date.now()).slice(-8)) : o.contract_no;
    db.prepare("UPDATE torder SET status=?, paid=?, contract_no=?, updated_at=datetime('now','localtime') WHERE no=?")
      .run(next, paid, cno, o.no);
    log(o.consult_no, '销售', '订单流转', `订单 ${o.no}：${O_ST[o.status]} → ${O_ST[next]}`);
    return res.json({ ok: 1, status: next });
  }
  if (key === 'refund') {
    db.prepare("UPDATE torder SET status='refunded', updated_at=datetime('now','localtime') WHERE no=?").run(o.no);
    log(o.consult_no, '销售', '订单退款', `订单 ${o.no} 已退款`);
    return res.json({ ok: 1, status: 'refunded' });
  }
  res.status(400).json({ err: '未知动作' });
});
/* ============ 客人侧订单 ============ */
/* 客人端不再自己推导状态、也不自己算进度。这两件事后台各有一套算法——
   状态按实收金额推导（orderView），七段进度由 stageOf() 结合合同号与出行状态判断（progressOf）——
   客人端拿同一份结果，两边就不可能显示不一致。

   原先客人侧直接套后台那个带利润计算的包装函数，于是：
   ① 状态取库里的原始字段，后台按钱推导，同一张单两处显示不同（已结清却写「部分支付」）；
   ② 进度用状态名去七段里找位置，而「已签约 / 行前准备 / 出行中」根本不是状态值，这三格永远不亮；
   ③ 取消与退订不在七段里，找不到位置退回 0，已退订的单进度条反而回到「下单」打勾；
   ④ 响应里明明白白带着 cost / profit / rate，客人抓一次包就知道这单我们赚多少。
   下面这一层既统一口径，也是字段白名单——成本类字段一律不进客人侧响应。 */
const RF_CN = { applied: '退款待审核', done: '退款已到账', rejected: '退款申请已驳回' };
function guestOrderBrief(o) {
  const pays = db.prepare('SELECT kind,amount,state FROM payment WHERE order_no=?').all(o.no);
  const recv = pays.filter(p => p.kind === 'recv' && p.state === 'done').reduce((a, p) => a + p.amount, 0);
  const refunded = pays.filter(p => p.kind === 'refund' && p.state === 'done').reduce((a, p) => a + p.amount, 0);
  const fees = db.prepare('SELECT * FROM fee WHERE order_no=?').all(o.no);
  const v = orderView(o, recv, refunded, fees);
  const feeC = fees.filter(f => f.bear === '客人').reduce((a, f) => a + (f.amount || 0), 0);
  const due = (o.amount || 0) + feeC, net = recv - refunded;
  const closed = ['cancelled', 'refunded'].includes(v.status_key);
  return {
    no: o.no, consult_no: o.consult_no,
    dest: o.dest, days: o.days, pax: o.pax, go_date: o.go_date, created_at: o.created_at,
    status: v.status_key, status_cn: v.status_text, closed,
    amount: o.amount || 0, fee: feeC, due, paid: net,
    owe: closed ? 0 : Math.max(0, due - net),
    recv, refunded, refund_state: o.refund_state || 'none', refund_amount: o.refund_amount || 0,
    refund_cn: RF_CN[o.refund_state] || null,
    contract_no: o.contract_no || null, trip_state: o.trip_state || '未出行',
    /* 进度：给客人「走到第几段」，客人端照着渲染，不自己算 */
    stage: closed ? null : stageOf(o), stage_cn: closed ? null : (PROG[stageOf(o)] || [])[1] || null,
  };
}
function guestOrderFull(no) {
  const f = orderFull(no);
  if (!f) return null;
  const b = guestOrderBrief(db.prepare('SELECT * FROM torder WHERE no=?').get(no));
  const c = f.consult;
  return {
    ...b,
    sales_name: f.sales_name || null, shop: f.shop || null,
    invoice_state: f.invoice_state || null, invoice_title: f.invoice_title || null,
    cancel_reason: f.cancel_reason || null,
    /* 七段进度：客人只看到「走到哪一步、哪天完成的」。
       经办人不给 —— 客人不需要知道是谁点的，也不该从订单页看出我们的内部分工。 */
    progress: (f.progress || []).map(p => ({
      key: p.key, title: p.title, desc: p.desc, state: p.state,
      at: p.at ? String(p.at).slice(0, 10) : null })),
    /* ⚠️ 不给客人收款流水。
       金额层面只给「订单金额 / 已付 / 待付」这三个数（在 guestOrderBrief 里），
       逐笔的渠道、单号、经办人属于财务口径，只在后台看。
       很多单是门店线下促成的，把「对公转账 / 操作人」摆到客人面前既没意义也不合适。 */
    fees: f.fees.filter(x => x.bear === '客人').map(x => ({ name: x.name, amount: x.amount })),
    /* 履约动态：去掉经办人，时间收到天，并把内部措辞换成客人看得懂的说法。
       支付渠道（对公转账 / 微信支付）也一并去掉 —— 不少单是门店线下促成的，
       把渠道摊给客人没有意义，他只需要知道钱到账了。 */
    logs: (f.logs || [])
      .filter(l => !/结算|成本|供应商|派单|比价|毛利/.test((l.act || '') + (l.detail || '')))
      .map(l => ({
        act: String(l.act || '')
          .replace(/^收取/, '已收到').replace(/^登记/, '已收到'),
        detail: String(l.detail || '')
          .replace(/（(对公转账|微信支付|支付宝|现金|刷卡|银行转账)）/g, '')
          .replace(/^登记/, '已收到').replace(/已到账$/, '已到账'),
        at: String(l.created_at || '').slice(0, 10),
      })),
    /* 订单基础信息：下单时填的联系方式、几个关键时间点、合同号。
       支付时间取最后一笔到账的时间（不给逐笔流水，只给「最近一次付款是什么时候」）。 */
    base: (() => {
      const t = db.prepare('SELECT * FROM torder WHERE no=?').get(no) || {};
      const lastPay = db.prepare(`SELECT created_at FROM payment WHERE order_no=? AND kind='recv' AND state='done'
        ORDER BY id DESC LIMIT 1`).get(no);
      return {
        no, created_at: t.created_at || null,
        paid_at: lastPay ? lastPay.created_at : null,
        contract_no: t.contract_no || null,
        contact_name: t.contact_name || t.customer || null,
        contact_phone: t.contact_phone || t.phone || null,
        contact_email: t.contact_email || null,
        addr: t.addr || null,
        from_city: (f.consult && f.consult.from_city) || null,
        source: '小程序定制',
      };
    })(),
    /* 需求要点：下单时填的那些，客人要能回看自己提了什么 */
    req: f.consult ? {
      budget: f.consult.budget || null,
      prefs: P(f.consult.prefs, []),
      must_see: f.consult.must_see || null,
      remark: f.consult.remark || null,
      kind: f.consult.kind || null,
      org: f.consult.org || null,
      adults: f.consult.adults, children: f.consult.children, elders: f.consult.elders,
    } : null,
    /* 出行人：客人自己要能核对这单报了谁，证件号脱敏 */
    travelers: db.prepare('SELECT name,en_name,kind,id_type,id_no,id_exp FROM traveler WHERE order_no=? ORDER BY is_contact DESC, id').all(no)
      .map(t => ({ name: t.name, en_name: t.en_name, kind: t.kind, id_type: t.id_type,
        id_no: String(t.id_no || '').replace(/^(.{3}).*(.{2})$/, '$1******$2'), id_exp: t.id_exp })),
    /* 咨询单只回溯客人自己那部分：行程方案与分享链接。
       报价明细、供应商名单、结算价一律不带出去 */
    consult: c ? {
      no: c.no, created_at: c.created_at, dest: c.dest, days: c.days,
      /* 订单详情要展示「这张单是从哪张需求单来的」，人数与状态一起带出去 */
      adults: c.adults, children: c.children, elders: c.elders,
      st_cn: ST_CN[c.status] || c.status,
      share_token: c.share_token || null,
      plan: c.cur ? { ver: c.cur.ver, route: c.cur.route, cover: c.cur.cover,
        tagline: c.cur.tagline, days: (c.cur.days || []).length } : null,
      plan_count: (c.plans || []).length,
    } : null,
  };
}
// 客人侧：我的订单（列表）
app.get('/api/mini/orders', (req, res) => {
  const phone = req.query.phone;
  if (!phone) return res.json([]);
  res.json(db.prepare('SELECT * FROM torder WHERE phone=? ORDER BY created_at DESC').all(phone)
    .map(guestOrderBrief));
});
// 客人侧：订单详情。不复用三端共用的 /api/order/:no——那个给后台，带成本与毛利
app.get('/api/mini/orders/:no', (req, res) => {
  const d = guestOrderFull(req.params.no);
  if (!d) return res.status(404).json({ err: '订单不存在' });
  const phone = req.query.phone;
  const o = db.prepare('SELECT phone FROM torder WHERE no=?').get(req.params.no);
  /* 订单号是可猜的流水号，必须校验这一单是不是本人的，否则换个号就能翻别人的订单 */
  if (phone && o && o.phone !== phone) return res.status(403).json({ err: '无权查看该订单' });
  res.json(d);
});


/* ============ 首页配置方案（多套可复用） ============ */
function pageCfg(id) {
  const r = db.prepare('SELECT * FROM homepage WHERE id=?').get(id);
  return r ? { ...r, config: P(r.config, {}), channels: P(r.channels, []) } : null;
}
function activeCfg() {
  const r = db.prepare('SELECT * FROM homepage WHERE status=1 ORDER BY is_default DESC, updated_at DESC').get();
  return r ? P(r.config, {}) : null;
}
function ensureDefaultPage() {
  const n = db.prepare('SELECT COUNT(*) c FROM homepage').get().c;
  if (n) return;
  const h = {}; db.prepare('SELECT * FROM home_config').all().forEach(r => h[r.k] = P(r.v, null));
  db.prepare(`INSERT INTO homepage (id,name,creator,modifier,channels,valid_from,valid_to,status,is_default,config)
    VALUES ('HP001','默认配置','唐美芳','唐美芳',?,'','',1,1,?)`)
    .run(J(['优定制小程序']), J(h));
}
ensureDefaultPage();

app.get('/api/uom/pages', (req, res) => {
  const { name, creator, status } = req.query;
  let rows = db.prepare('SELECT * FROM homepage ORDER BY is_default DESC, updated_at DESC').all();
  if (name) rows = rows.filter(r => (r.name || '').includes(name));
  if (creator) rows = rows.filter(r => (r.creator || '').includes(creator));
  if (status !== undefined && status !== '') rows = rows.filter(r => String(r.status) === String(status));
  res.json(rows.map(r => ({ ...r, channels: P(r.channels, []), config: undefined,
    mods: (P(r.config, {}).modules || []).filter(m => m.on !== 0).length })));
});
app.get('/api/uom/pages/:id', (req, res) => {
  const r = pageCfg(req.params.id);
  r ? res.json(r) : res.status(404).json({ err: 'not found' });
});
app.post('/api/uom/pages', (req, res) => {
  const b = req.body || {};
  const id = b.id || ('HP' + String(Date.now()).slice(-6));
  const ex = db.prepare('SELECT id FROM homepage WHERE id=?').get(id);
  if (ex) {
    db.prepare(`UPDATE homepage SET name=?, modifier=?, channels=?, valid_from=?, valid_to=?, status=?, config=?,
      updated_at=datetime('now','localtime') WHERE id=?`).run(
      b.name, b.modifier || '唐美芳', J(b.channels || []), b.valid_from || '', b.valid_to || '',
      b.status === 0 ? 0 : 1, J(b.config || {}), id);
  } else {
    db.prepare(`INSERT INTO homepage (id,name,creator,modifier,channels,valid_from,valid_to,status,is_default,config)
      VALUES (?,?,?,?,?,?,?,?,0,?)`).run(id, b.name || '新配置', b.creator || '唐美芳', b.modifier || '唐美芳',
      J(b.channels || []), b.valid_from || '', b.valid_to || '', b.status === 0 ? 0 : 1, J(b.config || {}));
  }
  res.json({ ok: 1, id });
});
app.post('/api/uom/pages/:id/copy', (req, res) => {
  const r = pageCfg(req.params.id);
  if (!r) return res.status(404).json({ err: 'not found' });
  const id = 'HP' + String(Date.now()).slice(-6);
  db.prepare(`INSERT INTO homepage (id,name,creator,modifier,channels,valid_from,valid_to,status,is_default,config)
    VALUES (?,?,?,?,?,?,?,0,0,?)`).run(id, r.name + ' 副本', '唐美芳', '唐美芳',
    J(r.channels), r.valid_from, r.valid_to, J(r.config));
  res.json({ ok: 1, id });
});
app.post('/api/uom/pages/:id/status', (req, res) => {
  db.prepare("UPDATE homepage SET status=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run((req.body || {}).status ? 1 : 0, req.params.id);
  res.json({ ok: 1 });
});
app.delete('/api/uom/pages/:id', (req, res) => {
  const r = db.prepare('SELECT is_default FROM homepage WHERE id=?').get(req.params.id);
  if (r && r.is_default) return res.status(409).json({ err: '默认配置不能删除，可以停用' });
  db.prepare('DELETE FROM homepage WHERE id=?').run(req.params.id);
  res.json({ ok: 1 });
});


/* ============ 图片上传（base64 直传，避免多装依赖） ============ */
const fs = require('fs');
const UP_DIR = path.join(__dirname, '..', 'web', 'public', 'uploads');
fs.mkdirSync(UP_DIR, { recursive: true });
app.post('/api/upload', (req, res) => {
  const { data, name } = req.body || {};
  const m = /^data:(image\/(?:png|jpe?g|webp|gif)|video\/mp4);base64,/.exec(data || '');
  if (!m) return res.status(400).json({ err: '只支持 png / jpg / webp / gif 图片或 mp4 视频' });
  const isVid = m[1] === 'video/mp4';
  const ext = isVid ? 'mp4' : m[1].slice(6).replace('jpeg', 'jpg');
  const buf = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
  const max = isVid ? 40 * 1024 * 1024 : 10 * 1024 * 1024;
  if (buf.length > max) return res.status(413).json({ err: isVid ? '视频不要超过 40MB' : '图片不要超过 10MB' });
  const fn = Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + '.' + ext;
  fs.writeFileSync(path.join(UP_DIR, fn), buf);
  res.json({ ok: 1, url: '/utrip/uploads/' + fn, name: name || fn, size: buf.length });
});
app.use('/utrip/uploads', express.static(UP_DIR));
app.use('/uploads', express.static(UP_DIR));

/* ============ 地接资源库 ============ */
require('./res.js')(app);

/* ============ 行程规划模板 ============ */
require('./tpl.js')(app);

/* ============ 地接社（供应商）档案 ============ */
require('./vendor.js')(app);

/* ============ 旅途故事 ============ */
require('./story.js')(app);
require('./member.js')(app);

/* ============ 静态 ============ */
const DIST = path.join(__dirname, '..', 'web', 'dist');
/* index.html 一律不进缓存：它引用的是带 hash 的 js/css，缓存住一份旧的
   就会去要一个已经被新构建删掉的文件名，然后拿到下面的 SPA 回退页当 JS 执行 —— 整页白屏，
   而且刷新还会再命中同一份缓存，客人自己修不好。2026-09-24 运营后台白屏就是这么来的。 */
const noStoreHtml = (req, res, next) => {
  if (/\.html$/.test(req.path) || req.path === '/' || req.path === '/utrip' || req.path === '/utrip/')
    res.set('Cache-Control', 'no-store, must-revalidate');
  next();
};
app.use(noStoreHtml);
/* 前端版本号：取当前 index.html 里引用的那个 js 文件名。
   小程序页面开着不动时不会重新请求 index.html，改完版客人手上还是旧代码
   （2026-09-28 因此让业务方看到了旧流程 + 白屏）。前端定时拉这个接口比对，
   发现不一致就自己刷新。 */
app.get('/api/app-version', (req, res) => {
  let v = '';
  try {
    const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
    v = (html.match(/assets\/(index-[\w-]+\.js)/) || [])[1] || '';
  } catch (e) { v = ''; }
  res.set('Cache-Control', 'no-store');
  res.json({ v });
});

app.use(express.static(DIST));
app.use('/utrip', express.static(DIST));          // 经 nginx /utrip/ 反代时前缀可能未被剥掉
app.use('/utrip/api', (req, res, next) => { req.url = req.url; next(); });
/* 静态资源找不到就老老实实 404，不要落进 SPA 回退。
   否则缺失的 .js 会返回一段 HTML，浏览器按 module 解析直接语法错误，排查时还看不出是文件没了。 */
app.use((req, res, next) => {
  const m = /^\/(?:utrip\/)?assets\/(.+)$/.exec(req.path);
  if (!m) return next();
  /* 走到这里说明 express.static 没找到这个文件 —— 多半是它属于某次旧构建，已经被清掉了，
     而某人的浏览器还缓存着那一版 index.html。入口文件名固定是 index-<hash>.js / .css，
     这种就回退到当前构建的同类入口，让旧页面自己活过来，不用去教人硬刷新。
     其他资源仍旧 404，绝不返回 SPA 回退页 —— HTML 被当 JS 执行只会白屏。 */
  const alias = /^index-[\w-]+\.(js|css)$/.exec(m[1]);
  if (alias) {
    const cur = fs.readdirSync(path.join(DIST, 'assets'))
      .find(f => f.startsWith('index-') && f.endsWith('.' + alias[1]));
    if (cur) return res.sendFile(cur, { root: path.join(DIST, 'assets') });
  }
  return res.status(404).type('text').send('asset not found');
});
/* SPA 回退：必须用 root + 相对文件名。工作区路径里含 .openclaw 这类点目录，
   send 默认 dotfiles:'ignore' 会把绝对路径整条判成隐藏文件直接 404，
   导致刷新/直接打开任意子路由（/mini/policy、/uom/... ）全是死页。 */
app.get(/^\/(?!api).*/, (req, res) => res.sendFile('index.html', { root: DIST }));

/* 兜底错误处理（必须放在所有路由之后）：
   不加这个，Express 默认会把整段堆栈当成 HTML 吐给客户端——既泄露服务器路径，
   前端 JSON.parse 又解不出来，只能显示一个光秃秃的「HTTP 500」，
   客人看不懂、我们也不知道出在哪。堆栈留在服务端日志，客户端只拿一句人话。 */
app.use((err, req, res, next) => {
  console.error(`[${req.method} ${req.originalUrl}]`, err && err.stack || err);
  if (res.headersSent) return next(err);
  res.status(err && err.status || 500).json({ err: '服务开小差了，请稍后重试' });
});

const PORT = process.env.PORT || 8930;
app.listen(PORT, '0.0.0.0', () => console.log('U-DESIGN server on :' + PORT));
