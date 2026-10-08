/* 会员体系：定级、会员档案、后台的等级/权益/关联维护。
   定级口径（本期唯一规则）：按自然年内该手机号名下**已收款金额**合计。
   用 paid 而不是 amount —— 下了单没付钱不该算消费；取消单一律排除。 */
const db = require('./db/index.js');
const J = v => JSON.stringify(v);
const ST_CN = { pending: '待接单', taken: '已接单', following: '跟进中', quoting: '报价中',
  won: '已成交', lost: '已流失' };

const CANCELLED = ['cancelled', 'canceled', 'closed'];

/* 某个手机号的消费统计：今年的、累计的、订单数 */
function statOf(phone) {
  const y = new Date().getFullYear();
  const rows = db.prepare('SELECT status, paid, amount, created_at FROM torder WHERE phone=?').all(phone)
    .filter(o => !CANCELLED.includes(String(o.status || '').toLowerCase()));
  const paidOf = o => Number(o.paid || 0);
  const year = rows.filter(o => String(o.created_at || '').slice(0, 4) === String(y));
  return {
    year_amount: year.reduce((s, o) => s + paidOf(o), 0),
    total_amount: rows.reduce((s, o) => s + paidOf(o), 0),
    order_cnt: rows.length,
  };
}

function levels() {
  return db.prepare('SELECT * FROM member_level WHERE status=1 ORDER BY sort').all();
}

/* 按年度消费落到哪一档：取门槛不超过消费额的最高一档 */
function levelFor(yearAmount) {
  const ls = levels();
  let hit = ls[0] || null;
  ls.forEach(l => { if (yearAmount >= (l.min_amount || 0)) hit = l; });
  return hit;
}

/* 重算一个人的等级并落库，返回最新档案 */
function recalc(phone, operator = 'system') {
  const g = db.prepare('SELECT * FROM guest WHERE phone=?').get(phone);
  if (!g) return null;
  const st = statOf(phone);
  const lv = levelFor(st.year_amount);
  const from = g.level_id || null, to = lv ? lv.id : null;
  const no = g.member_no || ('M' + String(phone).slice(-8).padStart(8, '0'));
  db.prepare(`UPDATE guest SET year_amount=?, total_amount=?, order_cnt=?, level_id=?, member_no=?,
    level_at=CASE WHEN IFNULL(level_id,'')<>IFNULL(?,'') THEN datetime('now','localtime') ELSE level_at END
    WHERE phone=?`).run(st.year_amount, st.total_amount, st.order_cnt, to, no, to, phone);
  if (from !== to) {
    db.prepare(`INSERT INTO member_log (phone,from_level,to_level,year_amount,reason,operator)
      VALUES (?,?,?,?,?,?)`).run(phone, from, to, st.year_amount,
      `年度消费 ${st.year_amount} 元，落入${lv ? lv.name : '无等级'}`, operator);
  }
  return profile(phone);
}

function recalcAll(operator = 'system') {
  const ps = db.prepare('SELECT phone FROM guest').all().map(r => r.phone);
  ps.forEach(p => recalc(p, operator));
  return ps.length;
}

/* 会员档案：等级 + 权益 + 距离下一档还差多少 */
function profile(phone) {
  const g = db.prepare('SELECT * FROM guest WHERE phone=?').get(phone);
  if (!g) return null;
  const ls = levels();
  const cur = ls.find(l => l.id === g.level_id) || ls[0] || null;
  const next = ls.find(l => (l.min_amount || 0) > (g.year_amount || 0)) || null;
  const bens = cur ? db.prepare(`SELECT b.*, lb.val, lb.sort AS bsort FROM member_level_benefit lb
      JOIN member_benefit b ON b.id=lb.benefit_id
      WHERE lb.level_id=? AND b.status=1 ORDER BY lb.sort, b.sort`).all(cur.id) : [];
  return {
    phone, member_no: g.member_no, nick: g.nick,
    level: cur, next,
    gap: next ? Math.max(0, (next.min_amount || 0) - (g.year_amount || 0)) : 0,
    year_amount: g.year_amount || 0, total_amount: g.total_amount || 0,
    order_cnt: g.order_cnt || 0, level_at: g.level_at,
    benefits: bens,
    /* 所有等级都带出去：会员中心要展示完整的等级阶梯，不能只给当前档 */
    all_levels: ls.map(l => ({ ...l,
      benefits: db.prepare(`SELECT b.name, b.code, b.icon, lb.val FROM member_level_benefit lb
        JOIN member_benefit b ON b.id=lb.benefit_id WHERE lb.level_id=? AND b.status=1
        ORDER BY lb.sort, b.sort`).all(l.id) })),
  };
}

/* 常用旅客：客人自己维护，同时从他的历史订单出行人自动带入一份。
   业务要求小程序不要出现空列表 —— 只要这个人下过单，进来就该有人可选，
   而不是让他对着「暂无常用旅客」自己从头敲一遍。 */
function syncTravelersFromOrders(phone) {
  const has = db.prepare('SELECT COUNT(*) c FROM guest_traveler WHERE phone=?').get(phone).c;
  if (has) return 0;
  const rows = db.prepare(`SELECT t.* FROM traveler t JOIN torder o ON o.no=t.order_no
    WHERE o.phone=? ORDER BY t.id`).all(phone);
  const seen = new Set(); let n = 0, selfDone = false;
  const ins = db.prepare(`INSERT INTO guest_traveler
    (phone,name,en_name,gender,birth,kind,id_type,id_no,id_exp,tphone,is_self,src)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'order')`);
  rows.forEach(t => {
    /* 按姓名去重就够了：同一位客人不会有两个同名的出行人，
       按「姓名+证件号」去重的话，两张单里同一个人证件号录得不一样就会重复出现 */
    const key = String(t.name || '').trim();
    if (!t.name || seen.has(key)) return;
    seen.add(key);
    /* 「本人」只能有一位：多张订单的联系人都留了本人手机号，
       照 phone 相等判断的话会标出好几个本人 */
    const isSelf = !selfDone && t.phone === phone;
    if (isSelf) selfDone = true;
    ins.run(phone, t.name, t.en_name, t.gender, t.birth, t.kind || '成人',
      t.id_type || '身份证', t.id_no, t.id_exp, t.phone, isSelf ? 1 : 0);
    n++;
  });
  return n;
}

/* 客人与客服的会话。原来小程序上「在线咨询」点了直接跳需求表单 ——
   业务要的是真的能聊。消息落 chat 表（session_key = guest:<手机号>），
   门店端在 CSP 的会话里看到同一条流。 */
const CS_WELCOME = [
  '您好，这里是优定制在线客服。',
  '行程怎么安排、报价包含什么、签证与证件要求，都可以直接问；需要出方案的话我帮您转给定制团队。',
];
function csKey(phone) { return 'guest:' + phone; }
function csEnsure(phone) {
  const k = csKey(phone);
  const n = db.prepare('SELECT COUNT(*) c FROM chat WHERE session_key=?').get(k).c;
  if (n) return;
  CS_WELCOME.forEach(t => db.prepare(
    "INSERT INTO chat (session_key,role,kind,text) VALUES (?,'bot','text',?)").run(k, t));
}
/* 自动答复：先按关键词给确定的答案，覆盖不到的再转人工。
   不接大模型 —— 这是客服咨询，答错一句比慢一分钟严重。 */
const CS_RULES = [
  [/报价|多少钱|费用|价格|贵/, '报价按人数、出行日期与酒店档次算，同一条线不同季节差别不小。您把目的地、大概日期和人数告诉我，我让定制团队出一版含明细的报价给您。'],
  [/包含|含什么|不含/, '定制单的报价通常含往返机票、当地用车、酒店、景点门票、领队或地陪服务；不含签证加急、个人消费与行程外自选项目。具体以报价单里列的为准。'],
  [/签证|材料|护照/, '出境签证我们可以代办，需要护照原件、照片与在职证明等材料，具体清单按目的地不同。您说一下去哪个国家，我把对应的材料清单发您。'],
  [/退|改期|取消/, '出行前的退改按合同里的约定执行，越早提出损失越小。您把订单号发我，我帮您核一下当前的退改费用。'],
  [/儿童|小孩|孩子|老人|父母/, '带孩子或长辈出行，我们会把每天的步行时间和换酒店次数压下来。您说一下人数和年龄段，定制团队会按这个节奏排。'],
  [/发票/, '付清全款的订单可以在「我的 · 发票管理」里自助申请电子发票，开好后发到您填的邮箱。'],
  [/会员|等级|权益/, '会员等级按自然年内订单的实收金额自动判定，等级与对应权益在「我的 · 会员中心」能看到完整阶梯。'],
];
function csReply(text) {
  const t = String(text || '');
  for (const [re, ans] of CS_RULES) if (re.test(t)) return ans;
  return '这个我记下了，稍后由定制团队回复您。急的话也可以在「我的 · 我的定制咨询」里提一张需求单，1 个工作日内会有人跟进。';
}

module.exports = function (app) {
  /* ---------- 在线客服 ---------- */
  app.get('/api/mini/cs', (req, res) => {
    const phone = req.query.phone;
    if (!phone) return res.json({ list: [] });
    csEnsure(phone);
    res.json({ list: db.prepare('SELECT id,role,kind,text,created_at FROM chat WHERE session_key=? ORDER BY id').all(csKey(phone)) });
  });

  app.post('/api/mini/cs', (req, res) => {
    const { phone, text } = req.body || {};
    if (!phone || !String(text || '').trim()) return res.status(400).json({ error: '缺少内容' });
    csEnsure(phone);
    const k = csKey(phone);
    db.prepare("INSERT INTO chat (session_key,role,kind,text) VALUES (?,'guest','text',?)").run(k, String(text).trim());
    db.prepare("INSERT INTO chat (session_key,role,kind,text) VALUES (?,'bot','text',?)").run(k, csReply(text));
    res.json({ list: db.prepare('SELECT id,role,kind,text,created_at FROM chat WHERE session_key=? ORDER BY id').all(k) });
  });

  /* ---------- 常用旅客 ---------- */
  app.get('/api/mini/travelers', (req, res) => {
    const phone = req.query.phone;
    if (!phone) return res.json([]);
    syncTravelersFromOrders(phone);
    res.json(db.prepare('SELECT * FROM guest_traveler WHERE phone=? ORDER BY is_self DESC, id').all(phone));
  });

  app.post('/api/mini/travelers', (req, res) => {
    const b = req.body || {};
    if (!b.phone || !b.name) return res.status(400).json({ error: '缺少手机号或姓名' });
    if (b.id) {
      db.prepare(`UPDATE guest_traveler SET name=?,en_name=?,gender=?,birth=?,kind=?,id_type=?,id_no=?,
        id_exp=?,tphone=?,remark=? WHERE id=? AND phone=?`)
        .run(b.name, b.en_name || '', b.gender || '', b.birth || '', b.kind || '成人',
          b.id_type || '身份证', b.id_no || '', b.id_exp || '', b.tphone || '', b.remark || '', b.id, b.phone);
      return res.json({ ok: 1, id: b.id });
    }
    const r = db.prepare(`INSERT INTO guest_traveler
      (phone,name,en_name,gender,birth,kind,id_type,id_no,id_exp,tphone,remark,src)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'manual')`)
      .run(b.phone, b.name, b.en_name || '', b.gender || '', b.birth || '', b.kind || '成人',
        b.id_type || '身份证', b.id_no || '', b.id_exp || '', b.tphone || '', b.remark || '');
    res.json({ ok: 1, id: r.lastInsertRowid });
  });

  app.delete('/api/mini/travelers/:id', (req, res) => {
    db.prepare('DELETE FROM guest_traveler WHERE id=? AND phone=?').run(req.params.id, req.query.phone || '');
    res.json({ ok: 1 });
  });

  /* ---------- 小程序 ---------- */
  app.get('/api/mini/member', (req, res) => {
    const phone = req.query.phone;
    if (!phone) {
      // 未登录也要能看等级阶梯和权益，否则客人不知道值不值得注册
      return res.json({ guest: null, all_levels: levels().map(l => ({ ...l,
        benefits: db.prepare(`SELECT b.name, b.code, b.icon, lb.val FROM member_level_benefit lb
          JOIN member_benefit b ON b.id=lb.benefit_id WHERE lb.level_id=? AND b.status=1
          ORDER BY lb.sort, b.sort`).all(l.id) })) });
    }
    recalc(phone);
    res.json(profile(phone) || { guest: null });
  });

  /* ---------- 后台：会员列表 ---------- */
  app.get('/api/uom/members', (req, res) => {
    const { q, level, sort } = req.query;
    let rows = db.prepare('SELECT * FROM guest').all();
    rows.forEach(g => {                       // 列表口径要和小程序一致，进页面先对齐一次
      const st = statOf(g.phone);
      const lv = levelFor(st.year_amount);
      Object.assign(g, st, { level_id: lv ? lv.id : null });
    });
    const ls = levels();
    /* 每档等级挂了哪些权益：会员列表要能按「在享权益」筛人，
       比如把享机场接送的都捞出来做一次触达 */
    const lvBen = {};
    ls.forEach(l => {
      lvBen[l.id] = db.prepare(`SELECT b.id,b.name FROM member_level_benefit lb
        JOIN member_benefit b ON b.id=lb.benefit_id WHERE lb.level_id=? AND b.status=1`).all(l.id);
    });
    let out = rows.map(g => ({
      phone: g.phone, nick: g.nick, member_no: g.member_no || ('M' + String(g.phone).slice(-8)),
      benefits: (lvBen[g.level_id] || []).map(b => b.name),
      avatar: g.avatar, source: g.source, from_city: g.from_city,
      created_at: g.created_at, last_login: g.last_login, level_at: g.level_at,
      year_amount: g.year_amount, total_amount: g.total_amount, order_cnt: g.order_cnt,
      level: ls.find(l => l.id === g.level_id) || null,
    }));
    if (q) out = out.filter(g => (g.phone + (g.nick || '') + (g.member_no || '')).includes(String(q).trim()));
    if (level) out = out.filter(g => g.level && g.level.id === level);
    out.sort((a, b) => sort === 'year' ? b.year_amount - a.year_amount
      : sort === 'total' ? b.total_amount - a.total_amount
      : String(b.created_at || '').localeCompare(String(a.created_at || '')));
    res.json({
      list: out,
      stat: {
        total: out.length,
        by_level: ls.map(l => ({ id: l.id, name: l.name, code: l.code, color: l.color,
          n: out.filter(g => g.level && g.level.id === l.id).length })),
        year_amount: out.reduce((s, g) => s + g.year_amount, 0),
        paying: out.filter(g => g.order_cnt > 0).length,
      },
    });
  });

  /* ---------- 后台：会员经营分析 ----------
     会员管理页原来只有四个孤立数字，看不出「人从哪来、走到哪一步、卡在哪」。
     这里出三样：一条生命周期漏斗（注册→咨询→下单→成交→复购）、等级结构贡献、
     近 6 个月新增与成交趋势。口径与定级一致：只认未取消订单的实收金额。 */
  app.get('/api/uom/member-stats', (req, res) => {
    const guests = db.prepare('SELECT * FROM guest').all();
    const gset = new Set(guests.map(g => g.phone));
    const orders = db.prepare('SELECT phone,paid,amount,status,created_at FROM torder').all()
      .filter(o => !CANCELLED.includes(String(o.status || '').toLowerCase()));
    const consults = db.prepare('SELECT phone,status,created_at FROM consult').all();
    const paidOrders = orders.filter(o => Number(o.paid || 0) > 0);

    /* 漏斗只统计注册会员，散客咨询单不算进来——否则转化率会被稀释得没法看 */
    const inG = arr => new Set(arr.map(r => r.phone).filter(p => gset.has(p)));
    const sConsult = inG(consults), sOrder = inG(orders), sPaid = inG(paidOrders);
    const cntBy = {};
    paidOrders.forEach(o => { if (gset.has(o.phone)) cntBy[o.phone] = (cntBy[o.phone] || 0) + 1; });
    const sRepeat = new Set(Object.keys(cntBy).filter(p => cntBy[p] >= 2));

    const total = guests.length;
    const pct = (a, b) => (b ? Math.round(a / b * 1000) / 10 : 0);
    const steps = [
      { k: 'reg', t: '注册会员', n: total, tip: '小程序授权登录即成为会员' },
      { k: 'consult', t: '发起咨询', n: sConsult.size, tip: '提交过定制咨询单' },
      { k: 'order', t: '生成订单', n: sOrder.size, tip: '咨询转成订单' },
      { k: 'paid', t: '付款成交', n: sPaid.size, tip: '订单有实收款' },
      { k: 'repeat', t: '复购会员', n: sRepeat.size, tip: '成交 2 单及以上' },
    ].map((s, i, a) => ({ ...s,
      rate: pct(s.n, total),                                  // 对注册总量
      step: i === 0 ? 100 : pct(s.n, a[i - 1].n),             // 相对上一层
      lost: i === 0 ? 0 : a[i - 1].n - s.n,
    }));

    /* 等级结构：不光看人数，还要看每档贡献了多少钱、人均多少 */
    const ls = db.prepare('SELECT * FROM member_level WHERE status=1 ORDER BY sort').all();
    /* 落档实时算，不读 guest.level_id —— 门槛改过但没点「重算等级」时，
       库里那个字段是旧的，概览会和下面的列表对不上 */
    guests.forEach(g => { Object.assign(g, statOf(g.phone)); const lv = levelFor(g.year_amount); g._lv = lv ? lv.id : null; });
    const yearSum = guests.reduce((s, g) => s + (g.year_amount || 0), 0);
    const byLevel = ls.map(l => {
      const gs = guests.filter(g => g._lv === l.id);
      const amt = gs.reduce((s, g) => s + (g.year_amount || 0), 0);
      return { id: l.id, name: l.name, code: l.code, color: l.color, min_amount: l.min_amount,
        n: gs.length, amount: amt, avg: gs.length ? Math.round(amt / gs.length) : 0,
        nPct: pct(gs.length, total), aPct: pct(amt, yearSum) };
    });

    /* 近 6 个月：新增会员 vs 当月有实收的成交会员 */
    const ym = d => String(d || '').slice(0, 7);
    const now = new Date();
    const months = [...Array(6)].map((_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const trend = months.map(m => ({
      m, label: m.slice(5) + ' 月',
      reg: guests.filter(g => ym(g.created_at) === m).length,
      deal: new Set(paidOrders.filter(o => ym(o.created_at) === m && gset.has(o.phone))
        .map(o => o.phone)).size,
      amount: paidOrders.filter(o => ym(o.created_at) === m)
        .reduce((s, o) => s + Number(o.paid || 0), 0),
    }));

    /* 沉默会员：注册满 30 天还一单没成交的，是最该被运营捞回来的一批 */
    const days = s => (Date.now() - new Date(String(s || '').replace(' ', 'T')).getTime()) / 864e5;
    const silent = guests.filter(g => !sPaid.has(g.phone) && days(g.created_at) >= 30).length;
    const new30 = guests.filter(g => days(g.created_at) <= 30).length;

    res.json({
      funnel: steps,
      byLevel,
      trend,
      kpi: {
        total, paying: sPaid.size, silent, new30,
        year_amount: yearSum,
        arpu: sPaid.size ? Math.round(yearSum / sPaid.size) : 0,   // 成交会员人均年度消费
        cvr: pct(sPaid.size, total),                               // 注册→成交
        repeat_rate: pct(sRepeat.size, sPaid.size),                // 成交会员里的复购率
        consult_cnt: consults.filter(c => gset.has(c.phone)).length,
      },
      top: guests.slice().sort((a, b) => (b.year_amount || 0) - (a.year_amount || 0)).slice(0, 5)
        .filter(g => (g.year_amount || 0) > 0)
        .map(g => ({ phone: g.phone, nick: g.nick, member_no: g.member_no,
          amount: g.year_amount || 0, cnt: g.order_cnt || 0,
          level: (ls.find(l => l.id === g._lv) || {}).name || '未定级' })),
    });
  });

  app.get('/api/uom/members/:phone', (req, res) => {
    const ph = req.params.phone;
    const p = profile(ph);
    if (!p) return res.status(404).json({ error: '会员不存在' });
    /* 档案页要有「这个人是谁」：注册来源、注册与最近登录时间、常用出发城市、旅行偏好。
       profile() 只算等级与消费，这些原始字段得从 guest 表带出来。 */
    const gr = db.prepare('SELECT * FROM guest WHERE phone=?').get(ph) || {};
    let prefs = [];
    try { prefs = JSON.parse(gr.prefs || '[]') || []; } catch (e) { prefs = []; }
    Object.assign(p, {
      avatar: gr.avatar, source: gr.source, from_city: gr.from_city, prefs,
      created_at: gr.created_at, last_login: gr.last_login,
      gender: gr.gender, birth: gr.birth, en_name: gr.en_name, email: gr.email,
    });
    const orders = db.prepare('SELECT no,dest,days,amount,paid,status,created_at FROM torder WHERE phone=? ORDER BY created_at DESC').all(ph);
    const logs = db.prepare('SELECT * FROM member_log WHERE phone=? ORDER BY id DESC LIMIT 20').all(ph);
    /* 档案页要看得到这个人的全貌：咨询单与常用旅客一并给出来 */
    const consults = db.prepare('SELECT * FROM consult WHERE phone=? ORDER BY created_at DESC').all(ph)
      .map(c => ({ ...c, st_cn: ST_CN[c.status] || c.status }));
    syncTravelersFromOrders(ph);
    const travelers = db.prepare('SELECT * FROM guest_traveler WHERE phone=? ORDER BY is_self DESC, id').all(ph);
    res.json({ ...p, orders, logs, consults, travelers });
  });

  app.post('/api/uom/members/recalc', (req, res) => {
    const n = recalcAll(req.body && req.body.operator || '运营管理员');
    res.json({ ok: 1, n });
  });

  /* ---------- 后台：等级定义 ---------- */
  app.get('/api/uom/member/levels', (req, res) => {
    const ls = db.prepare('SELECT * FROM member_level ORDER BY sort').all();
    res.json(ls.map(l => ({ ...l,
      members: db.prepare('SELECT COUNT(*) c FROM guest WHERE level_id=?').get(l.id).c,
      benefits: db.prepare(`SELECT b.id,b.name,b.code,b.kind,b.icon,lb.val,lb.sort FROM member_level_benefit lb
        JOIN member_benefit b ON b.id=lb.benefit_id WHERE lb.level_id=? ORDER BY lb.sort`).all(l.id) })));
  });

  app.post('/api/uom/member/levels', (req, res) => {
    const b = req.body || {};
    const id = b.id || ('ML' + (db.prepare('SELECT COUNT(*) c FROM member_level').get().c + 1));
    db.prepare(`INSERT INTO member_level (id,name,code,rule_kind,min_amount,keep_amount,sort,color,memo,status)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, b.name, b.code || id.toLowerCase(), b.rule_kind || 'year_amount',
      +b.min_amount || 0, +b.keep_amount || 0, +b.sort || 0, b.color || '#8a7c6a', b.memo || '', b.status == null ? 1 : +b.status);
    recalcAll('运营管理员');
    res.json({ ok: 1, id });
  });

  app.put('/api/uom/member/levels/:id', (req, res) => {
    const b = req.body || {};
    db.prepare(`UPDATE member_level SET name=?,code=?,min_amount=?,keep_amount=?,sort=?,color=?,memo=?,status=?,
      updated_at=datetime('now','localtime') WHERE id=?`)
      .run(b.name, b.code, +b.min_amount || 0, +b.keep_amount || 0, +b.sort || 0,
        b.color || '#8a7c6a', b.memo || '', b.status == null ? 1 : +b.status, req.params.id);
    recalcAll('运营管理员');      // 门槛一改，所有人的等级要跟着重算
    res.json({ ok: 1 });
  });

  app.delete('/api/uom/member/levels/:id', (req, res) => {
    const n = db.prepare('SELECT COUNT(*) c FROM guest WHERE level_id=?').get(req.params.id).c;
    if (n) return res.status(400).json({ error: `还有 ${n} 位会员在这一档，先调整门槛或把人挪走` });
    db.prepare('DELETE FROM member_level_benefit WHERE level_id=?').run(req.params.id);
    db.prepare('DELETE FROM member_level WHERE id=?').run(req.params.id);
    recalcAll('运营管理员');
    res.json({ ok: 1 });
  });

  /* ---------- 后台：权益 ---------- */
  app.get('/api/uom/member/benefits', (req, res) => {
    res.json(db.prepare('SELECT * FROM member_benefit ORDER BY sort, id').all().map(b => ({ ...b,
      levels: db.prepare(`SELECT l.id,l.name,lb.val FROM member_level_benefit lb
        JOIN member_level l ON l.id=lb.level_id WHERE lb.benefit_id=? ORDER BY l.sort`).all(b.id) })));
  });

  app.post('/api/uom/member/benefits', (req, res) => {
    const b = req.body || {};
    const id = b.id || ('MB' + (db.prepare('SELECT COUNT(*) c FROM member_benefit').get().c + 1));
    db.prepare(`INSERT INTO member_benefit (id,name,code,kind,descr,sort,status,icon)
      VALUES (?,?,?,?,?,?,?,?)`).run(id, b.name, b.code || id.toLowerCase(), b.kind || 'service',
      b.descr || '', +b.sort || 0, b.status == null ? 1 : +b.status, b.icon || '');
    res.json({ ok: 1, id });
  });

  app.put('/api/uom/member/benefits/:id', (req, res) => {
    const b = req.body || {};
    db.prepare('UPDATE member_benefit SET name=?,code=?,kind=?,descr=?,sort=?,status=?,icon=? WHERE id=?')
      .run(b.name, b.code, b.kind || 'service', b.descr || '', +b.sort || 0,
        b.status == null ? 1 : +b.status, b.icon || '', req.params.id);
    res.json({ ok: 1 });
  });

  app.delete('/api/uom/member/benefits/:id', (req, res) => {
    db.prepare('DELETE FROM member_level_benefit WHERE benefit_id=?').run(req.params.id);
    db.prepare('DELETE FROM member_benefit WHERE id=?').run(req.params.id);
    res.json({ ok: 1 });
  });

  /* ---------- 后台：等级 × 权益 关联 ---------- */
  app.put('/api/uom/member/levels/:id/benefits', (req, res) => {
    const list = (req.body && req.body.benefits) || [];   // [{benefit_id, val}]
    db.prepare('DELETE FROM member_level_benefit WHERE level_id=?').run(req.params.id);
    const ins = db.prepare('INSERT INTO member_level_benefit (level_id,benefit_id,val,sort) VALUES (?,?,?,?)');
    list.forEach((x, i) => ins.run(req.params.id, x.benefit_id, x.val || '', i + 1));
    res.json({ ok: 1, n: list.length });
  });
};

module.exports.recalc = recalc;
module.exports.recalcAll = recalcAll;
module.exports.profile = profile;
