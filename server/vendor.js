/* ============ 地接社（供应商）档案 ============
   建一家地接社 = 建档 + 开账号 + 定接单范围，三件事一次做完：
   - 档案：基础信息 + 资质证照（照 OPC 供应商入驻的口径，补齐执照/许可证/责任险/合作协议）
   - 账号：建档时填的主联系人自动开一个 UBK 管理员账号，建完就能登供应商系统
   - 接单范围：沿用 OPC 定制规则配置的「门店 + 目的地」，再加我们资源库的七类资源
     （派单时只把单子派给能接这个门店 + 这个目的地的家） */
const db = require('./db');

const J = o => JSON.stringify(o || []);
const P = (s, d) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch { return d; } };
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const RES_TYPES = ['hotel', 'ticket', 'car', 'dining', 'guide', 'exp', 'other'];
const days = d => d ? Math.round((new Date(d) - new Date()) / 864e5) : null;

/* 资质齐不齐、有没有快过期，列表上要一眼看出来 */
function certOf(v) {
  const items = [
    ['营业执照', v.license_no, v.license_to],
    ['经营许可', v.travel_no, v.travel_to],
    ['责任险', v.insure_no, v.insure_to],
    ['合作协议', v.agree_no, v.agree_to],
  ];
  const miss = items.filter(x => !x[1]).map(x => x[0]);
  const expired = items.filter(x => x[1] && x[2] && days(x[2]) < 0).map(x => x[0]);
  const soon = items.filter(x => x[1] && x[2] && days(x[2]) >= 0 && days(x[2]) <= 60)
    .map(x => ({ name: x[0], days: days(x[2]) }));
  return {
    total: items.length, ok: items.length - miss.length, miss, expired, soon,
    state: expired.length ? '有过期' : miss.length ? '缺件' : soon.length ? '将到期' : '齐全',
  };
}

function shape(v) {
  if (!v) return null;
  const accs = db.prepare('SELECT id,name,phone,role,status,last_login FROM account WHERE vendor_id=? ORDER BY id').all(v.id);
  return {
    ...v,
    dests: P(v.dests, []), channels: P(v.channels, []), res_types: P(v.res_types, RES_TYPES),
    enabled: v.enabled ? 1 : 0,
    accounts: accs, accN: accs.length, accOn: accs.filter(a => a.status === 1).length,
    cert: certOf(v),
    rateN: db.prepare('SELECT COUNT(*) c FROM gres_rate WHERE supplier_id=?').get(v.id).c,
    quoteN: db.prepare('SELECT COUNT(*) c FROM quote WHERE supplier_id=?').get(v.id).c,
    wonN: db.prepare("SELECT COUNT(*) c FROM quote WHERE supplier_id=? AND state='won'").get(v.id).c,
  };
}

const nextId = () => {
  const last = db.prepare("SELECT id FROM supplier WHERE id LIKE 'V%' ORDER BY id DESC LIMIT 1").get();
  const n = last ? (parseInt(String(last.id).slice(1), 10) || 0) + 1 : 1;
  return 'V' + String(n).padStart(2, '0');
};

module.exports = function mount(app) {
  app.get('/api/uom/vendors', (req, res) => {
    res.json(db.prepare('SELECT * FROM supplier ORDER BY (enabled=0), id').all().map(shape));
  });
  app.get('/api/uom/vendors/:id', (req, res) => {
    const v = shape(db.prepare('SELECT * FROM supplier WHERE id=?').get(req.params.id));
    if (!v) return res.status(404).json({ err: '地接社不存在' });
    res.json(v);
  });

  app.post('/api/uom/vendors', (req, res) => {
    const b = req.body || {};
    if (!String(b.name || '').trim()) return res.status(400).json({ err: '地接社名称必填' });
    const id = b.id || nextId();
    const ex = db.prepare('SELECT id FROM supplier WHERE id=?').get(id);
    if (!ex && db.prepare('SELECT id FROM supplier WHERE name=?').get(String(b.name).trim()))
      return res.status(400).json({ err: '已经有同名的地接社了' });
    const F = {
      name: String(b.name).trim(), short: b.short || '', type: b.type || '境外地接社',
      country: b.country || '', city: b.city || '', addr: b.addr || '',
      founded: b.founded || '', site: b.site || '', intro: b.intro || '',
      contact: b.contact || '', contact_title: b.contact_title || '', phone: b.phone || '',
      email: b.email || '', wechat: b.wechat || '', sos_name: b.sos_name || '', sos_phone: b.sos_phone || '',
      settle_cycle: b.settle_cycle || '月结 30 天', currency: b.currency || 'CNY',
      bank_name: b.bank_name || '', bank_acct: b.bank_acct || '', invoice_title: b.invoice_title || '',
      tax_no: b.tax_no || '', legal_person: b.legal_person || '', reg_capital: b.reg_capital || '',
      license_no: b.license_no || '', license_to: b.license_to || '', license_file: b.license_file || '',
      travel_no: b.travel_no || '', travel_to: b.travel_to || '', travel_file: b.travel_file || '',
      insure_no: b.insure_no || '', insure_amt: b.insure_amt || '', insure_to: b.insure_to || '',
      insure_file: b.insure_file || '',
      agree_no: b.agree_no || '', agree_from: b.agree_from || '', agree_to: b.agree_to || '',
      agree_file: b.agree_file || '',
      dests: J(b.dests), channels: J(b.channels), res_types: J(b.res_types && b.res_types.length ? b.res_types : RES_TYPES),
      shop_mode: b.shop_mode === 'some' ? 'some' : 'all',
      max_order: +b.max_order || 0, min_pax: +b.min_pax || 0, rush_days: +b.rush_days || 0,
      coop_state: b.coop_state || '合作中', rating: +b.rating || 0,
      enabled: b.enabled === 0 || b.enabled === false ? 0 : 1,
      memo: b.memo || '', updated_at: now(),
    };
    const keys = Object.keys(F), vals = keys.map(k => F[k]);
    if (ex) db.prepare(`UPDATE supplier SET ${keys.map(k => k + '=?').join(',')} WHERE id=?`).run(...vals, id);
    else db.prepare(`INSERT INTO supplier (${keys.join(',')},id,created_at,deals) VALUES (${keys.map(() => '?').join(',')},?,?,0)`)
      .run(...vals, id, now());

    /* 建档时给主联系人开一个 UBK 管理员账号——地接社建进来，人就能登供应商系统。
       已经有账号的不重复开；手机号重复的跳过（同一人换公司的情况按现有账号走）。 */
    let acc = null;
    if (!ex && b.contact && /^1\d{10}$/.test(b.phone || '')) {
      const dup = db.prepare('SELECT id FROM account WHERE vendor_id=? AND phone=?').get(id, b.phone);
      if (!dup) {
        acc = 'U' + String(Date.now()).slice(-8);
        db.prepare(`INSERT INTO account (id,vendor_id,name,phone,email,role,dept,remark,status)
          VALUES (?,?,?,?,?, 'admin','', ?, 1)`).run(acc, id, b.contact, b.phone, b.email || '',
          '建地接社档案时自动开通');
      }
    }
    res.json({ ok: 1, id, account: acc });
  });

  /* 停用 / 启用：停用后不再派单，已在手的单子不受影响 */
  app.post('/api/uom/vendors/status', (req, res) => {
    const { ids, enabled } = req.body || {};
    const v = enabled ? 1 : 0;
    (Array.isArray(ids) ? ids : [ids]).filter(Boolean).forEach(id =>
      db.prepare('UPDATE supplier SET enabled=?, updated_at=? WHERE id=?').run(v, now(), id));
    res.json({ ok: 1 });
  });

  app.delete('/api/uom/vendors/:id', (req, res) => {
    const id = req.params.id;
    const q = db.prepare('SELECT COUNT(*) c FROM quote WHERE supplier_id=?').get(id).c;
    if (q) return res.status(400).json({ err: `这家已经参与过 ${q} 次报价，不能删。要停止合作请改成「停用」。` });
    const r = db.prepare('SELECT COUNT(*) c FROM gres_rate WHERE supplier_id=?').get(id).c;
    if (r) return res.status(400).json({ err: `这家在资源库里有 ${r} 条报价，不能删。要停止合作请改成「停用」。` });
    db.prepare('DELETE FROM account WHERE vendor_id=?').run(id);
    db.prepare('DELETE FROM supplier WHERE id=?').run(id);
    res.json({ ok: 1 });
  });

  /* 派单候选预览：跟真正派单用的是同一个函数，界面上看到的就是实际会派的家 */
  app.get('/api/uom/vendors/match/list', (req, res) => {
    const { shop, dest, type, pax, go_date } = req.query || {};
    const { hit, why } = matchVendors({ shop, dest, resType: type, pax: +pax || 0, goDate: go_date });
    res.json({ vendors: hit.map(v => ({ id: v.id, name: v.name, short: v.short, rating: v.rating })), why });
  });
};

/* ============ 派单候选：谁能接这一单 ============
   判定全部来自地接社档案，不再另存一份「供应商名单」：
   启用 + 合作中 + 不是单项资源商 + 门店对得上 + 目的地对得上 + 人数不低于门槛
   + 急单在它接得住的范围里 + 本月没超接单上限。
   why 记下每家被排除的原因，界面上要能说清「为什么没人可派」。 */
function matchVendors({ shop, dest, resType, pax, goDate } = {}) {
  const rows = db.prepare('SELECT * FROM supplier ORDER BY (enabled=0), id').all().map(shape);
  const d2go = goDate ? days(goDate) : null;
  const ym = new Date().toISOString().slice(0, 7);
  const why = [];
  const hit = rows.filter(v => {
    const no = r => { why.push({ id: v.id, name: v.name, reason: r }); return false; };
    if (!v.enabled) return no('已停用');
    if (v.coop_state !== '合作中') return no('合作状态：' + v.coop_state);
    if (v.type === '单项资源商') return no('单项资源商，只在资源库里报价，不接整单');
    if (shop && v.shop_mode === 'some' && !v.channels.includes(shop)) return no('不接这家门店的单');
    if (dest && v.dests.length && !v.dests.some(x => String(dest).includes(x) || x.includes(String(dest))))
      return no('不做这个目的地');
    if (resType && v.res_types.length && !v.res_types.includes(resType)) return no('不做这类资源');
    if (pax && v.min_pax && pax < v.min_pax) return no(`最少接 ${v.min_pax} 人，这单只有 ${pax} 人`);
    /* 距出发 15 天以内算急单，要它的「可接急单天数」够得上 */
    if (d2go !== null && d2go < 15 && !(v.rush_days >= d2go)) {
      return no(v.rush_days ? `只接出发前 ${v.rush_days} 天以外的单，这单还有 ${d2go} 天` : `不接急单（这单还有 ${d2go} 天出发）`);
    }
    if (v.max_order) {
      const n = db.prepare(`SELECT COUNT(*) c FROM quote WHERE supplier_id=? AND substr(created_at,1,7)=?`).get(v.id, ym).c;
      if (n >= v.max_order) return no(`本月已接 ${n} 单，到上限 ${v.max_order}`);
    }
    return true;
  });
  return { hit, why };
}
module.exports.matchVendors = matchVendors;
module.exports.RES_TYPES = RES_TYPES;
