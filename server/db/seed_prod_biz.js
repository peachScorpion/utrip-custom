/* 产品经营字段回填：老产品只有内容字段，补上散拼产品的价格体系与团期，
   让「定制产品管理」的毛利、团期、余位这些列有真实数据。幂等。 */
const db = require('./index.js');
const SUP = db.prepare('SELECT * FROM supplier').all();
const pick = (dest) => SUP.find(s => JSON.parse(s.dests || '[]').some(d => (dest || '').includes(d))) || SUP[0];
const BRAND = ['优耐德', '竹园', '奇迹'];
const pad = n => String(n).padStart(2, '0');

let n = 0;
for (const p of db.prepare('SELECT * FROM product').all()) {
  const cals = JSON.parse(p.cals || '[]');
  const upd = {};
  if (!p.settle_price) upd.settle_price = Math.round((p.price_from || 0) * (0.62 + (p.id.charCodeAt(1) % 8) / 100));
  if (!p.child_price) upd.child_price = Math.round((p.price_from || 0) * 0.88);
  if (!p.single_room) upd.single_room = Math.round((p.price_from || 0) * 0.16 / 100) * 100;
  if (!p.nights) upd.nights = Math.max(1, (p.days || 8) - 1);
  if (!p.supplier_id) { const s = pick(p.dest); upd.supplier_id = s.id; upd.supplier_name = s.name; }
  if (!p.brand) upd.brand = BRAND[(p.id.charCodeAt(2) || 0) % 3];
  if (!p.travel_type) upd.travel_type = (p.region === '国内') ? '境内游' : '境外游';
  if (!p.product_type) upd.product_type = p.type === 'smallgroup' ? '跟团游' : '私家团';
  if (!p.group_mode) upd.group_mode = p.type === 'smallgroup' ? '保证成团' : '满人成团';
  if (!p.from_city) upd.from_city = ['北京', '上海', '广州'][(p.id.charCodeAt(2) || 0) % 3];
  if (!p.group_size) upd.group_size = p.type === 'smallgroup' ? 8 : 6;
  if (!cals.length) {
    const base = p.price_from || 0, out = [];
    const d0 = Date.now();
    for (let i = 1; i <= 5; i++) {
      const d = new Date(d0 + (i * 18 + 25) * 864e5);
      out.push({ date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        price: base + (i % 3) * 800, stock: 2 + (i * 3) % 10 });
    }
    upd.cals = JSON.stringify(out);
  }
  const ks = Object.keys(upd);
  if (!ks.length) continue;
  db.prepare(`UPDATE product SET ${ks.map(k => k + '=?').join(',')} WHERE id=?`).run(...ks.map(k => upd[k]), p.id);
  n++;
}
console.log('✓ 产品经营字段回填：', n, '条');
