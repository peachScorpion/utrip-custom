/* 把「资源单元自带的结算价」迁成「供应商对这个单元的报价」。
   原来一条资源绑一家供应商 + 一个价，那个价实际上就是这家供应商的报价，
   照原样搬进 gres_rate，不丢数据；资源单元上的 cost 留下来当参考价。
   幂等：已经迁过的（该资源+单元+供应商已有报价）跳过。
   平台直采的资源（没绑供应商）挂到虚拟供应商 PLATFORM 名下，口径上「平台自己就是供应商」。 */
const db = require('./index.js');
let n = 0, skip = 0;
for (const r of db.prepare('SELECT * FROM gres').all()) {
  const sid = r.supplier_id || 'PLATFORM';
  const sname = r.supplier_name || '平台直采';
  for (const u of db.prepare('SELECT * FROM gres_unit WHERE res_id=?').all(r.id)) {
    if (!u.cost) { skip++; continue; }
    const ex = db.prepare('SELECT id FROM gres_rate WHERE res_id=? AND unit_id=? AND supplier_id=?').get(r.id, u.id, sid);
    if (ex) { skip++; continue; }
    db.prepare(`INSERT INTO gres_rate (res_id,unit_id,supplier_id,supplier_name,cost,valid_from,valid_to,min_qty,tax,status,memo)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(r.id, u.id, sid, sname, u.cost, null, null, u.min_pax || 0,
      '含税', u.status === 'off' ? 'off' : 'on', '由资源单元原有结算价迁入');
    n++;
  }
}
console.log('✓ 迁入供应商报价', n, '条（跳过', skip, '条：没价或已存在）');
const sum = db.prepare(`SELECT supplier_name, COUNT(*) c, MIN(cost) lo, MAX(cost) hi FROM gres_rate GROUP BY supplier_name`).all();
sum.forEach(s => console.log('  ', s.supplier_name, s.c, '条报价 ¥' + s.lo, '–', '¥' + s.hi));
