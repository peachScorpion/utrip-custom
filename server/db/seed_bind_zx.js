/* 把演示产品绑定到众信产品编码，让「同步团期 / 同步销售状态」链路可验证。幂等。 */
const db = require('./index.js');
const MAP = {
  P01: 'U386415', P02: 'U387120', P03: 'U388003', P04: 'U389040',
  P06: 'U388591', P07: 'U386322', P08: 'U388274',
  G01: 'U387566', G03: 'U389702', G04: 'U388003',
};
let n = 0;
for (const [pid, code] of Object.entries(MAP)) {
  const p = db.prepare('SELECT * FROM product WHERE id=?').get(pid);
  if (!p || p.zx_code) continue;
  db.prepare('UPDATE product SET zx_code=? WHERE id=?').run(code, pid);
  n++;
}
console.log('✓ 绑定众信编码：', n, '条');
