/* ============ 行程规划模板 ============
   对齐 OPC 有米 UOM 的「定制配置 · 模板列表」，字段与匹配规则照搬，界面按我们自己这套 UI 重做。

   一份模板管三件事：
   1) 什么单子用它 —— type（主题）+ dest_mode/dest（全部目的地 / 指定目的地）
   2) 行程出哪些模块、每块叫什么、怎么写 —— modules[]（可开关、可改标题、可排序、可加自定义模块）
   3) 客人手机上长什么样 —— skin（配色 / 封面样式 / 密度 / 圆角）

   匹配规则（照搬 OPC `_tpl_match`）：
   主题为空 → 默认模板；否则先找「主题相同 + 指定目的地且互相包含」，
   再退「主题相同 + 适用全部目的地」，都不中 → 默认模板。 */
const db = require('./db');

const J = o => JSON.stringify(o == null ? null : o);
const P = (s, d) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch { return d; } };
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

/* 六个内置模块：key 与 OPC 一致，出方案与客人端渲染都认这套 key */
const BUILTIN = [
  { key: 'cover', name: '封面', tip: '行程第一屏：主标题、副标题、三个关键信息' },
  { key: 'overview', name: '行程概览', tip: '线路、总述、亮点、交通住宿含餐等事实卡' },
  { key: 'days', name: '每日详情', tip: '逐天时间轴：当天城市、标题、分段安排、住宿用餐、贴士' },
  { key: 'feature', name: '特色体验', tip: '挑出这条线不可替代的体验，单独成块' },
  { key: 'stay', name: '住宿', tip: '按晚列酒店：城市、酒店、房型、为什么选它' },
  { key: 'food', name: '美食', tip: '当地菜与餐厅，标注是否含餐' },
];
const BUILTIN_KEYS = BUILTIN.map(m => m.key);

/* 五套预置配色 + 自定义，取值与 OPC 一致 */
const PALETTE = {
  default: { cn: '墨绿', hl: '#1f6f74', warm: '#b4762a' },
  prussian: { cn: '普鲁士蓝', hl: '#0b3868', warm: '#b89076' },
  tiffany: { cn: '蒂芙尼蓝', hl: '#3bb39b', warm: '#3c4252' },
  hermes: { cn: '爱马仕橙', hl: '#e5760f', warm: '#2b2a2a' },
  titian: { cn: '提香红', hl: '#d34947', warm: '#023270' },
};
const SKIN_DEFAULT = { color: 'default', hl: PALETTE.default.hl, warm: PALETTE.default.warm,
  cover: 'photo', density: 'normal', radius: 'round' };

const HEX = /^#[0-9a-fA-F]{6}$/;
function normSkin(s) {
  const o = { ...SKIN_DEFAULT, ...(s || {}) };
  const p = PALETTE[o.color];
  if (p && o.color !== 'custom') { o.hl = p.hl; o.warm = p.warm; }   // 预置色以色板为准，改色板即改色
  if (!HEX.test(o.hl || '')) o.hl = SKIN_DEFAULT.hl;
  if (!HEX.test(o.warm || '')) o.warm = SKIN_DEFAULT.warm;
  if (!['video', 'photo', 'gradient'].includes(o.cover)) o.cover = 'photo';
  if (!['normal', 'compact'].includes(o.density)) o.density = 'normal';
  if (!['round', 'square'].includes(o.radius)) o.radius = 'round';
  return o;
}

/* 模块归一化：内置模块永远在（关掉只是 on=0，不删），自定义模块跟在后面 */
function normMods(mods) {
  const arr = Array.isArray(mods) ? mods : [];
  const out = BUILTIN.map((b, i) => {
    const hit = arr.find(m => m && m.key === b.key) || {};
    return {
      key: b.key, cust: 0,
      name: String(hit.name || b.name).trim() || b.name,      // 模块标题，客人端小标题用这个
      on: hit.on === 0 || hit.on === false ? 0 : 1,
      tip: typeof hit.tip === 'string' ? hit.tip : (hit.desc || ''),   // 写作要求
      sort: Number.isFinite(+hit.sort) ? +hit.sort : i,
    };
  });
  arr.filter(m => m && m.cust && m.key && !BUILTIN_KEYS.includes(m.key)).forEach((m, i) => out.push({
    key: String(m.key).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24) || ('cust' + i),
    cust: 1, name: String(m.name || '自定义模块').trim(), on: m.on === 0 || m.on === false ? 0 : 1,
    tip: m.tip || '', sort: Number.isFinite(+m.sort) ? +m.sort : (BUILTIN.length + i),
  }));
  return out.sort((a, b) => a.sort - b.sort).map((m, i) => ({ ...m, sort: i }));
}

const splitDest = d => String(d || '').split(/[、,，/\s]+/).map(x => x.trim()).filter(Boolean);

function shape(t) {
  if (!t) return null;
  return {
    ...t, is_def: t.is_def ? 1 : 0,
    dest_mode: t.dest_mode === 'some' ? 'some' : 'all',
    destList: splitDest(t.dest),
    modules: normMods(P(t.modules, [])),
    skin: normSkin(P(t.skin, null)),
  };
}
const all = () => db.prepare('SELECT * FROM template ORDER BY is_def DESC, sort, id').all().map(shape);

/* 没有默认模板就当场补一份（照搬 OPC 的回落：库里读不到也要能用） */
function ensureDefault() {
  if (db.prepare('SELECT COUNT(*) c FROM template WHERE is_def=1').get().c) return;
  const first = db.prepare('SELECT id FROM template LIMIT 1').get();
  if (first) { db.prepare('UPDATE template SET is_def=1 WHERE id=?').run(first.id); return; }
  db.prepare(`INSERT INTO template (id,name,is_def,type,dest_mode,dest,modules,skin,note,sort)
    VALUES (?,?,1,'','all','',?,?,?,0)`).run('TPL-DEFAULT', '默认行程模板',
    J(normMods([])), J(SKIN_DEFAULT), '系统兜底模板，匹配不到专属模板时用它。可以改，不能删。');
}

/* 按「目的地 + 主题」挑模板 */
function match(dest, theme) {
  ensureDefault();
  const rows = all();
  const def = rows.find(t => t.is_def) || rows[0] || null;
  const th = String(theme || '').trim();
  if (!th || th === '无') return { tpl: def, isDef: 1, reason: 'no theme' };
  const hitType = rows.filter(t => t.type && (t.type.includes(th) || th.includes(t.type)));
  const d = String(dest || '');
  const some = hitType.find(t => t.dest_mode === 'some' &&
    t.destList.some(x => d.includes(x) || x.includes(d)));
  if (some) return { tpl: some, isDef: some.is_def, reason: 'hit_some' };
  const any = hitType.find(t => t.dest_mode !== 'some');
  if (any) return { tpl: any, isDef: any.is_def, reason: 'hit_all' };
  return { tpl: def, isDef: 1, reason: 'no match' };
}

module.exports = function mount(app) {
  app.get('/api/uom/templates', (req, res) => { ensureDefault(); res.json(all()); });
  app.get('/api/uom/templates/meta', (req, res) => res.json({ builtin: BUILTIN, palette: PALETTE, skinDefault: SKIN_DEFAULT }));

  app.post('/api/uom/templates/match', (req, res) => {
    const { dest, theme } = req.body || {};
    const m = match(dest, theme);
    res.json({ ok: 1, ...m });
  });

  app.post('/api/uom/templates', (req, res) => {
    const b = req.body || {};
    if (!String(b.name || '').trim()) return res.status(400).json({ err: '模板名称必填' });
    const id = b.id || ('TPL' + new Date().toISOString().slice(0, 10).replace(/-/g, '') +
      Math.random().toString(36).slice(2, 7).toUpperCase());
    const ex = db.prepare('SELECT * FROM template WHERE id=?').get(id);
    const isDef = b.is_def ? 1 : (ex && ex.is_def ? 1 : 0);
    if (isDef) db.prepare('UPDATE template SET is_def=0').run();
    const F = {
      name: String(b.name).trim(), is_def: isDef, type: b.type || '',
      dest_mode: b.dest_mode === 'some' ? 'some' : 'all',
      dest: Array.isArray(b.dest) ? b.dest.join('、') : (b.dest || ''),
      modules: J(normMods(b.modules)), skin: J(normSkin(b.skin)),
      note: b.note || '', sort: +b.sort || 50, updated_at: now(),
    };
    const keys = Object.keys(F), vals = keys.map(k => F[k]);
    if (ex) db.prepare(`UPDATE template SET ${keys.map(k => k + '=?').join(',')} WHERE id=?`).run(...vals, id);
    else db.prepare(`INSERT INTO template (${keys.join(',')},id) VALUES (${keys.map(() => '?').join(',')},?)`).run(...vals, id);
    ensureDefault();
    res.json({ ok: 1, id, tpl: shape(db.prepare('SELECT * FROM template WHERE id=?').get(id)) });
  });

  /* 默认模板不许删，只能改（照搬 OPC） */
  app.delete('/api/uom/templates/:id', (req, res) => {
    const t = db.prepare('SELECT * FROM template WHERE id=?').get(req.params.id);
    if (!t) return res.status(404).json({ err: '模板不存在' });
    if (t.is_def) return res.status(400).json({ err: '默认模板不能删除，只能改。要删它，先把别的模板设为默认。' });
    const used = db.prepare('SELECT COUNT(*) c FROM consult WHERE tpl_id=?').get(req.params.id).c;
    if (used) return res.status(400).json({ err: `已有 ${used} 张咨询单套用了这个模板，删不了。可以改成停用或直接改内容。` });
    db.prepare('DELETE FROM template WHERE id=?').run(req.params.id);
    res.json({ ok: 1 });
  });

  app.post('/api/uom/templates/:id/copy', (req, res) => {
    const t = db.prepare('SELECT * FROM template WHERE id=?').get(req.params.id);
    if (!t) return res.status(404).json({ err: '模板不存在' });
    const id = 'TPL' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + Math.random().toString(36).slice(2, 7).toUpperCase();
    db.prepare(`INSERT INTO template (id,name,is_def,type,dest_mode,dest,modules,skin,note,sort)
      VALUES (?,?,0,?,?,?,?,?,?,?)`).run(id, t.name + '（副本）', t.type, t.dest_mode, t.dest,
      t.modules, t.skin, t.note, (t.sort || 50) + 1);
    res.json({ ok: 1, id });
  });
};
module.exports.match = match;
module.exports.BUILTIN = BUILTIN;
module.exports.normMods = normMods;
module.exports.normSkin = normSkin;
module.exports.ensureDefault = ensureDefault;
