/* 对外产品编号与操作留痕回填：
   产品编号统一为 D + 6 位数字（D100001 起按创建顺序递增），与内部主键 id 解耦；
   存量产品按创建时间回填创建人与最近操作信息。幂等：已有 code 的不动。 */
const db = require('./index.js');

module.exports = function seedPcode() {
  const rows = db.prepare('SELECT * FROM product ORDER BY created_at, id').all();
  const used = new Set(rows.map(p => p.code).filter(Boolean));
  let seq = 100001;
  const nextCode = () => {
    while (used.has('D' + seq)) seq++;
    const c = 'D' + seq; used.add(c); seq++; return c;
  };
  const OPS = ['王思远', '周宁', '运营管理员'];
  const up = db.prepare('UPDATE product SET code=?, created_by=?, updated_by=?, created_at=?, updated_at=? WHERE id=?');
  const fmt = t => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
  const now = Date.now();
  let n = 0;
  rows.forEach((p, i) => {
    if (p.code) return;
    /* 存量产品的 created_at 是建库时间，统一按上架批次往前铺开，最近操作落在创建之后、当前之前 */
    const cT = now - (i + 6) * 864e5;
    const uT = Math.min(now - 36e5, cT + ((i % 5) + 1) * 864e5);
    up.run(nextCode(), OPS[i % 3], OPS[(i + 2) % 3], fmt(cT), fmt(uT), p.id);
    n++;
  });
  if (n) console.log(`[seed_pcode] 已生成 ${n} 条产品编号与操作留痕`);
};
