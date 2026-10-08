/* 内容侧演示数据：浏览埋点 / 收藏 / 内容带来的咨询单。幂等。 */
const db = require('./index.js');
const h = db.prepare("SELECT v FROM home_config WHERE k='articles'").get();
if (!h) { console.log('× 没有内容，跳过'); process.exit(0); }
const arts = JSON.parse(h.v);
let changed = false;
arts.forEach((a, i) => {
  if (!a.status) { a.status = i < 14 ? 'published' : 'draft'; changed = true; }
  if (!a.tags) { a.tags = [a.k, a.dest].filter(Boolean); changed = true; }
  if (!a.rel_prod) { a.rel_prod = []; changed = true; }
  if (!a.rel_art) { a.rel_art = []; changed = true; }
  if (a.video === undefined) { a.video = ''; changed = true; }
  if (!a.published_at) { a.published_at = '2026-09-' + String(10 + (i % 12)).padStart(2, '0') + ' 10:00'; changed = true; }
});
if (changed) db.prepare("UPDATE home_config SET v=? WHERE k='articles'").run(JSON.stringify(arts));

/* 社区流素材：图片组与部分视频 */
const { BANK } = require('../planner');
const MAP = { 冰岛: '冰岛极光', 瑞士: '少女峰', 意大利: '意大利威尼斯', 法国: '法国普罗旺斯薰衣草',
  希腊: '希腊圣托里尼', 日本: '日本京都', 英国: '英国伦敦', 西班牙: '西班牙巴塞罗那',
  挪威: '挪威峡湾', 摩洛哥: '摩洛哥沙漠', 肯尼亚: '肯尼亚野生动物', 加拿大: '加拿大落基山',
  捷克: '捷克布拉格', 中国: '冰岛冰川湖' };
const VID = 'https://uux-public.oss-cn-beijing.aliyuncs.com/travel/guide/video/蓝色清真寺2.mp4';
arts.forEach((a, i) => {
  const key = MAP[a.dest] || '冰岛极光';
  if (!a.imgs || !a.imgs.length) { a.imgs = (BANK[key] || []).slice(0, 3); changed = true; }
  if (i % 5 === 2 && !a.video) { a.video = VID; changed = true; }
});
if (changed) db.prepare("UPDATE home_config SET v=? WHERE k='articles'").run(JSON.stringify(arts));

if (!db.prepare('SELECT COUNT(*) c FROM content_view').get().c) {
  const ins = db.prepare('INSERT INTO content_view (art_id,visitor,phone,ref,created_at) VALUES (?,?,?,?,?)');
  let n = 0;
  arts.forEach(a => {
    const t = String(a.read || ''), v = parseFloat(t) || 0;
    const pv = Math.round((t.includes('万') ? v * 10000 : v) / 120);
    const uv = Math.max(1, Math.round(pv * 0.62));
    for (let i = 0; i < pv; i++) {
      const d = new Date(Date.now() - Math.floor(Math.random() * 30) * 864e5);
      ins.run(a.id, 'vi' + ((i % uv) + 1) + '_' + a.id, null,
        ['mini_home', 'mini_guide', 'mini_dest', 'share'][i % 4],
        d.toISOString().slice(0, 10) + ' ' + String(8 + i % 12).padStart(2, '0') + ':00:00');
      n++;
    }
  });
  console.log('✓ 内容浏览埋点：', n, '条');
}
if (!db.prepare("SELECT COUNT(*) c FROM favorite WHERE kind='article'").get().c) {
  const ins = db.prepare("INSERT INTO favorite (phone,kind,ref,created_at) VALUES (?,'article',?,?)");
  let n = 0;
  arts.forEach((a, ai) => {
    const k = Math.max(0, Math.round((parseFloat(a.read) || 0) * (String(a.read).includes('万') ? 2.2 : 0.0004)));
    for (let i = 0; i < k; i++) {
      ins.run('139' + String(10000000 + ai * 97 + i).slice(-8), a.id,
        new Date(Date.now() - i * 36e5).toISOString().slice(0, 19).replace('T', ' '));
      n++;
    }
  });
  console.log('✓ 内容收藏：', n, '条');
}
let m = 0;
db.prepare('SELECT no,dest FROM consult').all().forEach((c, i) => {
  if (i % 2) return;
  const a = arts.find(x => x.dest && (c.dest || '').includes(x.dest));
  if (!a) return;
  m += db.prepare('UPDATE consult SET from_article=? WHERE no=? AND from_article IS NULL').run(a.id, c.no).changes;
});
if (m) console.log('✓ 咨询单关联内容：', m, '条');

/* 创建人 / 创建时间 / 最近操作人 / 最近操作时间：
   老数据只有作者与发布时间，这里按作者回填创建信息，最近操作时间在发布时间之后随机落点，
   幂等：已经有 created_by 的内容不动。 */
{
  const home2 = {}; db.prepare('SELECT * FROM home_config').all().forEach(r => { try { home2[r.k] = JSON.parse(r.v); } catch { home2[r.k] = r.v; } });
  const list = home2.articles || [];
  const OPS = ['王思远', '周宁', '运营管理员'];
  let k = 0;
  const next = list.map((a, i) => {
    if (a.created_by) return a;
    k++;
    const pub = a.published_at || new Date(Date.now() - (i + 3) * 864e5).toISOString().slice(0, 16).replace('T', ' ');
    const cAt = new Date(new Date(pub.replace(' ', 'T')).getTime() - (2 + (i % 5)) * 864e5)
      .toISOString().slice(0, 16).replace('T', ' ');
    const uAt = new Date(new Date(pub.replace(' ', 'T')).getTime() + (i % 4) * 864e5 + 36e5)
      .toISOString().slice(0, 16).replace('T', ' ');
    return { ...a, created_by: a.by || OPS[i % 3], created_at: cAt, updated_by: OPS[(i + 1) % 3], updated_at: uAt };
  });
  if (k) {
    db.prepare("INSERT OR REPLACE INTO home_config (k,v) VALUES ('articles',?)").run(JSON.stringify(next));
    console.log('✓ 内容创建/操作信息回填：', k, '条');
  }
}
