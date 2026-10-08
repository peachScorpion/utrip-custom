/* 把老的模板数据（modules 是 key-value 对象、没有主题/目的地/皮肤）升级到 OPC 口径。
   幂等：modules 已经是数组的跳过。老 key 映射：daily→days、exp→feature、hotel→stay。 */
const db = require('./index.js');
const { normMods, normSkin, ensureDefault } = require('../tpl.js');
const KMAP = { cover: 'cover', overview: 'overview', daily: 'days', exp: 'feature', hotel: 'stay', food: 'food' };
/* 老模板按名字给主题与皮肤，作为示范；正式用时在界面上改 */
const GUESS = {
  T001: { type: '', skin: { color: 'default', cover: 'photo', density: 'normal', radius: 'round' } },
  T002: { type: '亲子旅行', skin: { color: 'tiffany', cover: 'photo', density: 'normal', radius: 'round' } },
  T003: { type: '蜜月浪漫', skin: { color: 'titian', cover: 'gradient', density: 'normal', radius: 'round' } },
};
let n = 0;
for (const t of db.prepare('SELECT * FROM template').all()) {
  let mods; try { mods = JSON.parse(t.modules); } catch { mods = null; }
  if (Array.isArray(mods)) continue;                         // 已经是新结构
  const arr = Object.entries(mods || {}).map(([k, v], i) => ({
    key: KMAP[k] || k, name: undefined, on: 1, tip: String(v || ''), sort: i,
  }));
  const g = GUESS[t.id] || {};
  db.prepare('UPDATE template SET modules=?, skin=?, type=?, dest_mode=?, dest=? WHERE id=?')
    .run(JSON.stringify(normMods(arr)), JSON.stringify(normSkin(g.skin)), t.type || g.type || '',
      t.dest_mode || 'all', t.dest || '', t.id);
  n++;
}
ensureDefault();
console.log('✓ 模板升级：', n, '条');
db.prepare('SELECT * FROM template').all().forEach(t => {
  const m = JSON.parse(t.modules);
  console.log(' ', t.id, t.name, '| 主题:', t.type || '通用', '| 目的地:', t.dest_mode === 'some' ? t.dest : '全部',
    '| 模块:', m.filter(x => x.on).length + '/' + m.length, '| 皮肤:', JSON.parse(t.skin).color, '| 默认:', t.is_def);
});
