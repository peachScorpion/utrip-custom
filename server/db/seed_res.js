/* 资源确认明细：供应商侧逐项回写的履约清单。幂等。 */
const db = require('./index.js');
const CATE = [['机位', '国际往返机票 + 内陆段'], ['酒店', '全程住宿确认件'],
  ['地接车导', '车辆与中文导游'], ['餐食', '行程内团餐'], ['门票与体验', '景点门票与特色体验']];
let n = 0;
for (const o of db.prepare('SELECT * FROM torder').all()) {
  if (db.prepare('SELECT COUNT(*) c FROM res_item WHERE order_no=?').get(o.no).c) continue;
  const done = o.res_state === '已确认';
  CATE.forEach(([c, nm], i) => {
    db.prepare('INSERT INTO res_item (order_no,cate,name,state,who) VALUES (?,?,?,?,?)')
      .run(o.no, c, nm, done ? 'done' : (i < 2 ? 'done' : 'todo'), o.supplier_name || '供应商');
    n++;
  });
}
console.log('✓ 资源确认明细：', n, '条');
