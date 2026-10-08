/* ============ 地接资源库 ============
   七类资源（酒店/门票/用车/餐厅/导游/体验/其他）共用一套接口，靠 type 区分。
   主档 gres 存共性字段 + ext(JSON) 存各类专属字段；价格一律落在 gres_unit（可售单元）上，
   主档的 cost_from / price_from 由单元汇总回写，前端只读。
   下游：UBK 供应商按客人需求单选资源报价、CSP 行程排资源、订单成本核算。 */
const db = require('./db');

const J = o => JSON.stringify(o || null);
const P = (s, d) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch { return d; } };
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

const TYPES = ['hotel', 'ticket', 'car', 'dining', 'guide', 'exp', 'other'];
const PFX = { hotel: 'HT', ticket: 'TK', car: 'CR', dining: 'DN', guide: 'GD', exp: 'EX', other: 'OT' };
const CN = { hotel: '酒店', ticket: '门票', car: '用车', dining: '餐厅', guide: '导游', exp: '体验', other: '其他' };

function newId(type) {
  const p = PFX[type] || 'RS';
  const last = db.prepare("SELECT id FROM gres WHERE type=? ORDER BY id DESC LIMIT 1").get(type);
  const n = last ? (parseInt(String(last.id).replace(/\D/g, ''), 10) || 0) + 1 : 1;
  return p + String(n).padStart(4, '0');
}
/* 资源单元上的 cost/price 只是「参考价 / 建议售价」，用来估算与比价；
   真正报价按「供应商 × 单元」存在 gres_rate —— 同一个房型不同供应商给的价不一样。 */
const ratesOf = (rid, uid) => db.prepare(
  `SELECT * FROM gres_rate WHERE res_id=? AND unit_id=? ORDER BY (status = 'off'), cost`).all(rid, uid);
function units(id) {
  return db.prepare('SELECT * FROM gres_unit WHERE res_id=? ORDER BY sort, id').all(id).map(u => {
    const rates = ratesOf(id, u.id);
    const live = rates.filter(r => r.status !== 'off' && r.cost > 0);
    return { ...u, rates,
      rateN: live.length,
      rateLo: live.length ? Math.min(...live.map(r => r.cost)) : 0,
      rateHi: live.length ? Math.max(...live.map(r => r.cost)) : 0 };
  });
}
/* used 不落库、实时算：这条资源被多少张咨询单的报价选用过 */
const usedCnt = id => db.prepare('SELECT COUNT(DISTINCT consult_no) c FROM quote_res WHERE res_id=?').get(id).c;
function shape(r) {
  if (!r) return null;
  return { ...r, tags: P(r.tags, []), images: P(r.images, []), ext: P(r.ext, {}),
    units: units(r.id), used: usedCnt(r.id) };
}
/* 起价完全来自供应商报价：一家都没报过就是 0，列表上显示「待供应商报价」。
   资源本身没有价这个概念。 */
function reprice(id) {
  const us = units(id).filter(u => u.status !== 'off');
  const costs = us.map(u => u.rateLo).filter(v => v > 0);
  db.prepare('UPDATE gres SET cost_from=?, price_from=0 WHERE id=?')
    .run(costs.length ? Math.min(...costs) : 0, id);
}

module.exports = function mount(app) {
  /* 列表：筛选全部在服务端做，前端只管传条件 */
  app.get('/api/res', (req, res) => {
    const q = req.query || {};
    const type = TYPES.includes(q.type) ? q.type : null;
    if (!type) return res.status(400).json({ err: '资源类型不合法' });
    let rows = db.prepare('SELECT * FROM gres WHERE type=? ORDER BY updated_at DESC, id DESC').all(type).map(shape);
    const kw = (q.q || '').trim().toLowerCase();
    if (kw) rows = rows.filter(r => `${r.name}${r.name_en || ''}${r.id}${r.city || ''}${r.addr || ''}${(r.tags || []).join('')}`.toLowerCase().includes(kw));
    const eq = (k, v) => { if (v) rows = rows.filter(r => String(r[k] || '') === v); };
    eq('country', q.country); eq('city', q.city); eq('level', q.level);
    eq('status', q.status);
    if (q.ext) {                       // ext.xxx 等值筛选：ext=breakfast:含双早
      const [k, v] = String(q.ext).split(':');
      if (k && v) rows = rows.filter(r => String((r.ext || {})[k] || '') === v);
    }
    const num = (k, v, cmp) => { if (v !== undefined && v !== '') rows = rows.filter(r => cmp(+r[k] || 0, +v)); };
    num('cost_from', q.min, (a, b) => a >= b);
    num('cost_from', q.max, (a, b) => a > 0 && a <= b);
    if (q.nounit === '1') rows = rows.filter(r => !r.units.length);
    res.json(rows);
  });

  /* 该类资源的筛选选项与汇总：选项从真实数据里来，不写死 */
  app.get('/api/res/meta', (req, res) => {
    const type = TYPES.includes(req.query.type) ? req.query.type : null;
    if (!type) return res.status(400).json({ err: '资源类型不合法' });
    const rows = db.prepare('SELECT * FROM gres WHERE type=?').all(type);
    const uniq = f => [...new Set(rows.map(f).filter(Boolean))].sort();
    /* 供应商不再挂在资源上；这里给的是「对这类资源报过价的供应商」，用于按供应商筛资源 */
    const sups = db.prepare(`SELECT DISTINCT r.supplier_name n FROM gres_rate r
      JOIN gres g ON g.id = r.res_id WHERE g.type=? AND r.supplier_name<>'' ORDER BY n`).all(type).map(x => x.n);
    const counts = {};
    TYPES.forEach(t => counts[t] = db.prepare('SELECT COUNT(*) c FROM gres WHERE type=?').get(t).c);
    res.json({
      countries: uniq(r => r.country), cities: uniq(r => r.city), levels: uniq(r => r.level),
      suppliers: sups, counts,
      total: rows.length, on: rows.filter(r => r.status !== 'off').length,
    });
  });

  /* 报价选资源：只给启用中的资源与启用中的单元，按目的地优先排序。
     供应商在报价台按客人需求单（国家 / 城市）筛，选出来的进 quote_res。 */
  app.get('/api/res/pick', (req, res) => {
    const q = req.query || {};
    const types = String(q.types || '').split(',').filter(t => TYPES.includes(t));
    if (!types.length) return res.status(400).json({ err: '资源类型不合法' });
    let rows = db.prepare(`SELECT * FROM gres WHERE status='on' AND type IN (${types.map(() => '?').join(',')})`)
      .all(...types).map(shape).map(r => ({ ...r, units: r.units.filter(u => u.status !== 'off') }))
      .filter(r => r.units.length);
    if (q.country) {
      const c = q.country;
      rows = rows.filter(r => !r.country || r.country === c);   // 无国别的通用资源（保险、物料）始终可选
    }
    if (q.city) rows = rows.filter(r => !r.city || r.city === q.city);
    const kw = (q.q || '').trim().toLowerCase();
    if (kw) rows = rows.filter(r => `${r.name}${r.name_en || ''}${r.city || ''}${(r.tags || []).join('')}`.toLowerCase().includes(kw));
    rows.sort((a, b) => (b.country === q.country) - (a.country === q.country) || (b.rating || 0) - (a.rating || 0));
    /* 带上「这家供应商自己的报价」：报价台只认 myCost，没有就是这家还没给过价，
       让他在报价台当场填，填完回存到资源库，下次自动带出来。 */
    const vid = q.vendor || '';
    res.json(rows.map(r => ({ ...r, units: r.units.map(u => {
      const mine = vid ? u.rates.find(x => x.supplier_id === vid && x.status !== 'off') : null;
      return { ...u, myCost: mine ? mine.cost : 0, myRateId: mine ? mine.id : 0,
        myTax: mine ? mine.tax : '', myValid: mine ? [mine.valid_from, mine.valid_to] : null };
    }) })));
  });

  app.get('/api/res/:id', (req, res) => {
    const r = shape(db.prepare('SELECT * FROM gres WHERE id=?').get(req.params.id));
    if (!r) return res.status(404).json({ err: '资源不存在' });
    res.json(r);
  });

  /* 新建 / 保存：units 全量覆盖（前端编辑页就是全量提交） */
  app.post('/api/res', (req, res) => {
    const b = req.body || {};
    if (!TYPES.includes(b.type)) return res.status(400).json({ err: '资源类型不合法' });
    if (!String(b.name || '').trim()) return res.status(400).json({ err: (CN[b.type] || '资源') + '名称必填' });
    const id = b.id || newId(b.type);
    const ex = db.prepare('SELECT id FROM gres WHERE id=?').get(id);
    const F = {
      type: b.type, name: String(b.name).trim(), name_en: b.name_en || '',
      country: b.country || '', city: b.city || '', addr: b.addr || '',
      level: b.level || '',
      /* 资源就是资源：不归属任何供应商，也不带价。谁能供、供多少钱，全在 gres_rate 里，
         由供应商报价时产生。contact/phone 是资源方自己的联系人（酒店前台、景区票务），不是供应商。 */
      supplier_id: '', supplier_name: '',
      contact: b.contact || '', phone: b.phone || '',
      tags: J(b.tags || []), cover: b.cover || '', images: J(b.images || []),
      intro: b.intro || '', ext: J(b.ext || {}),
      currency: b.currency || 'CNY', rating: +b.rating || 0,
      status: b.status === 'off' ? 'off' : 'on', memo: b.memo || '', updated_at: now(),
    };
    const keys = Object.keys(F), vals = keys.map(k => F[k]);
    if (ex) db.prepare(`UPDATE gres SET ${keys.map(k => k + '=?').join(',')} WHERE id=?`).run(...vals, id);
    else db.prepare(`INSERT INTO gres (${keys.join(',')},id) VALUES (${keys.map(() => '?').join(',')},?)`).run(...vals, id);

    if (Array.isArray(b.units)) {
      /* 单元是全量覆盖，主键会变；供应商报价挂在 unit_id 上，所以要按前端带回的旧 id
         把报价迁到新 id 上，不能让改一次资源就把各家报价冲掉。 */
      const oldUnits = db.prepare('SELECT * FROM gres_unit WHERE res_id=?').all(id);
      db.prepare('DELETE FROM gres_unit WHERE res_id=?').run(id);
      const keep = [];
      b.units.filter(u => String(u.name || '').trim()).forEach((u, i) => {
        const nid = db.prepare(`INSERT INTO gres_unit (res_id,name,spec,unit,cost,price,cap,min_pax,season,stock,status,sort)
          VALUES (?,?,?,?,0,0,?,?,?,?,?,?)`).run(id, String(u.name).trim(), u.spec || '', u.unit || '人',
          +u.cap || 0, +u.min_pax || 0, u.season || '', u.stock || '',
          u.status === 'off' ? 'off' : 'on', +u.sort || i).lastInsertRowid;
        keep.push({ old: u.id || null, name: String(u.name).trim(), nid });
      });
      keep.forEach(k => {
        // 先按旧 id 认，认不到（比如前端没带 id）再按同名的旧单元认
        const src = k.old || (oldUnits.find(o => o.name === k.name) || {}).id;
        if (src && src !== k.nid) db.prepare('UPDATE gres_rate SET unit_id=? WHERE res_id=? AND unit_id=?').run(k.nid, id, src);
      });
      const liveIds = keep.map(k => k.nid);
      const orphan = db.prepare(`SELECT COUNT(*) c FROM gres_rate WHERE res_id=? AND unit_id NOT IN (${liveIds.map(() => '?').join(',') || '0'})`).get(id, ...liveIds).c;
      if (orphan) db.prepare(`DELETE FROM gres_rate WHERE res_id=? AND unit_id NOT IN (${liveIds.map(() => '?').join(',') || '0'})`).run(id, ...liveIds);
    }
    reprice(id);
    res.json({ ok: 1, id });
  });

  /* ---- 供应商报价 ---- */
  /* 某条资源下所有单元的各家报价，带一份价格对比（同一单元谁高谁低一眼看清） */
  app.get('/api/res/:id/rates', (req, res) => {
    const r = db.prepare('SELECT * FROM gres WHERE id=?').get(req.params.id);
    if (!r) return res.status(404).json({ err: '资源不存在' });
    res.json(units(req.params.id).map(u => ({
      unit_id: u.id, unit_name: u.name, spec: u.spec, unit: u.unit, ref_cost: u.cost,
      rates: u.rates, rateN: u.rateN, rateLo: u.rateLo, rateHi: u.rateHi,
    })));
  });

  /* 保存一条报价（同一供应商 + 同一单元只留一条，重复提交就是改价） */
  app.post('/api/res/:id/rates', (req, res) => {
    const b = req.body || {};
    const rid = req.params.id;
    if (!db.prepare('SELECT id FROM gres WHERE id=?').get(rid)) return res.status(404).json({ err: '资源不存在' });
    if (!b.unit_id || !db.prepare('SELECT id FROM gres_unit WHERE id=? AND res_id=?').get(b.unit_id, rid))
      return res.status(400).json({ err: '资源单元不存在' });
    if (!b.supplier_id) return res.status(400).json({ err: '要先选供应商' });
    if (!(+b.cost > 0)) return res.status(400).json({ err: '结算价要大于 0' });
    const ex = db.prepare('SELECT id FROM gres_rate WHERE res_id=? AND unit_id=? AND supplier_id=?')
      .get(rid, b.unit_id, b.supplier_id);
    const F = {
      supplier_name: b.supplier_name || '', cost: Math.round(+b.cost), currency: b.currency || 'CNY',
      valid_from: b.valid_from || null, valid_to: b.valid_to || null, min_qty: +b.min_qty || 0,
      tax: b.tax === '不含税' ? '不含税' : '含税', status: b.status === 'off' ? 'off' : 'on',
      memo: b.memo || '', updated_at: now(),
    };
    const keys = Object.keys(F), vals = keys.map(k => F[k]);
    if (ex) db.prepare(`UPDATE gres_rate SET ${keys.map(k => k + '=?').join(',')} WHERE id=?`).run(...vals, ex.id);
    else db.prepare(`INSERT INTO gres_rate (${keys.join(',')},res_id,unit_id,supplier_id)
      VALUES (${keys.map(() => '?').join(',')},?,?,?)`).run(...vals, rid, b.unit_id, b.supplier_id);
    reprice(rid);
    res.json({ ok: 1 });
  });

  app.delete('/api/res/:id/rates/:rateId', (req, res) => {
    db.prepare('DELETE FROM gres_rate WHERE id=? AND res_id=?').run(req.params.rateId, req.params.id);
    reprice(req.params.id);
    res.json({ ok: 1 });
  });

  app.delete('/api/res/:id', (req, res) => {
    db.prepare('DELETE FROM gres_rate WHERE res_id=?').run(req.params.id);
    db.prepare('DELETE FROM gres_unit WHERE res_id=?').run(req.params.id);
    db.prepare('DELETE FROM gres WHERE id=?').run(req.params.id);
    res.json({ ok: 1 });
  });

  /* 上下架：单条与批量走同一个口 */
  app.post('/api/res/status', (req, res) => {
    const { ids, status } = req.body || {};
    const st = status === 'off' ? 'off' : 'on';
    (Array.isArray(ids) ? ids : [ids]).filter(Boolean).forEach(id =>
      db.prepare('UPDATE gres SET status=?, updated_at=? WHERE id=?').run(st, now(), id));
    res.json({ ok: 1, n: (ids || []).length });
  });

  /* 复制一条：地接资源常有「同酒店不同协议年度」「同线路不同车型」，复制比重录快 */
  app.post('/api/res/:id/copy', (req, res) => {
    const src = db.prepare('SELECT * FROM gres WHERE id=?').get(req.params.id);
    if (!src) return res.status(404).json({ err: '资源不存在' });
    const id = newId(src.type);
    const cols = Object.keys(src).filter(k => !['id', 'created_at', 'updated_at', 'used'].includes(k));
    db.prepare(`INSERT INTO gres (${cols.join(',')},id,status) VALUES (${cols.map(() => '?').join(',')},?,?)`)
      .run(...cols.map(k => k === 'name' ? src.name + '（副本）' : src[k]), id, 'off');
    /* 只复制资源本身，不复制供应商报价——价是供应商给的，新资源要重新报 */
    units(req.params.id).forEach(u => db.prepare(`INSERT INTO gres_unit
      (res_id,name,spec,unit,cost,price,cap,min_pax,season,stock,status,sort) VALUES (?,?,?,?,0,0,?,?,?,?,?,?)`)
      .run(id, u.name, u.spec, u.unit, u.cap, u.min_pax, u.season, u.stock, u.status, u.sort));
    reprice(id);
    res.json({ ok: 1, id });
  });
};
module.exports.TYPES = TYPES;
module.exports.CN = CN;
