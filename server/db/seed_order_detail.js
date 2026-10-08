/* 订单明细回填：出行人 / 收款流水 / 订单日志 / 其他费用
   —— 老订单是直接 INSERT 进 torder 的，详情页需要的明细当时没落库，这里按状态补齐。
   幂等：每张单只在没有明细时补。 */
const db = require('./index.js');

const SUR = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨';
const GIV = ['宇轩', '思远', '梓涵', '雨桐', '若彤', '皓然', '书瑶', '嘉懿', '欣怡', '博文'];
const EN = ['ZHAO/YUXUAN', 'LI/SIYUAN', 'WANG/ZIHAN', 'CHEN/YUTONG', 'ZHOU/RUOTONG', 'WU/HAORAN'];
const rnd = a => a[Math.floor(Math.random() * a.length)];
const RANK = { created: 0, deposit: 1, contracted: 2, paid: 3, ready: 4, traveling: 5, done: 6 };
const pad = n => String(n).padStart(2, '0');

function travelersFor(o) {
  const n = Math.max(1, o.pax || 2);
  const out = [];
  for (let i = 0; i < n; i++) {
    const first = i === 0;
    const kind = i === 0 ? 'adult' : i === n - 1 && n > 2 ? 'elder' : i % 3 === 2 ? 'child' : 'adult';
    const year = kind === 'child' ? 2016 + (i % 5) : kind === 'elder' ? 1955 + (i % 6) : 1982 + (i % 10);
    out.push({
      name: first ? o.customer : rnd(SUR.split('')) + rnd(GIV),
      en_name: rnd(EN),
      gender: i % 2 ? '女' : '男',
      birth: `${year}-${pad(1 + (i * 3) % 12)}-${pad(1 + (i * 7) % 28)}`,
      kind, id_type: '护照',
      id_no: 'E' + String(10000000 + Math.floor(Math.random() * 89999999)),
      id_exp: `203${(i % 4) + 1}-0${(i % 9) + 1}-15`,
      phone: first ? o.phone : '',
      is_contact: first ? 1 : 0,
      doc_state: ['done', 'part', 'todo'][['done', 'deposit'].includes(o.status) ? 0 : i % 3],
    });
  }
  return out;
}

function backfill() {
  const orders = db.prepare('SELECT * FROM torder').all();
  let t = 0, p = 0, l = 0, f = 0;
  orders.forEach(o => {
    // 出行人
    if (!db.prepare('SELECT COUNT(*) n FROM traveler WHERE order_no=?').get(o.no).n) {
      travelersFor(o).forEach(x => {
        db.prepare(`INSERT INTO traveler (order_no,name,en_name,gender,birth,kind,id_type,id_no,id_exp,phone,is_contact,doc_state)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(o.no, x.name, x.en_name, x.gender, x.birth, x.kind,
            x.id_type, x.id_no, x.id_exp, x.phone, x.is_contact, x.doc_state);
        t++;
      });
    }
    // 联系人
    if (!o.contact_name) db.prepare('UPDATE torder SET contact_name=?, contact_phone=?, contact_email=?, addr=? WHERE no=?')
      .run(o.customer, o.phone, (o.phone || '').slice(-8) + '@qq.com',
        '北京市朝阳区望京 SOHO T1 ' + (10 + (o.pax || 2)) + ' 层', o.no);

    // 收款流水：按订单所处阶段倒推，保证「状态 / 已收 / 流水」三者自洽
    const R = RANK[o.status] != null ? RANK[o.status] : 0;
    if (!db.prepare('SELECT COUNT(*) n FROM payment WHERE order_no=?').get(o.no).n) {
      const dep = Math.round((o.amount || 0) * 0.3);
      const add = (item, amt, way, kind = 'recv') => {
        db.prepare(`INSERT INTO payment (order_no,kind,item,amount,way,trade_no,state,operator,created_at)
          VALUES (?,?,?,?,?,?, 'done', ?,?)`).run(o.no, kind, item, amt, way,
            (kind === 'recv' ? 'SK' : 'JS') + String(Math.floor(Math.random() * 1e9)).padStart(9, '0'),
            o.sales_name || '李晴', o.created_at);
        p++;
      };
      let recv = 0;
      if (R >= 1 && o.amount) { add('定金', dep, '微信支付'); recv += dep; }
      if (R >= 3 && o.amount) { add('尾款', o.amount - dep, '对公转账'); recv = o.amount; }
      db.prepare('UPDATE torder SET paid=? WHERE no=?').run(recv, o.no);
      o.paid = recv;
      if (R >= 5) {
        add('供应商结算', o.cost || 0, '对公转账', 'settle');
        db.prepare("UPDATE torder SET settle_state='paid' WHERE no=?").run(o.no);
      }
    }
    // 其他费用：客人承担的费用要一起收，否则「应收 = 成交价 + 附加费」永远收不齐
    if (!db.prepare('SELECT COUNT(*) n FROM fee WHERE order_no=?').get(o.no).n && (o.pax || 0) >= 3) {
      const amt = 3800 * Math.max(1, Math.floor((o.days || 8) / 4));
      db.prepare('INSERT INTO fee (order_no,name,amount,bear,remark) VALUES (?,?,?,?,?)')
        .run(o.no, '单房差', amt, '客人', '一位长者单独住一间');
      f++;
      if (RANK[o.status] >= 3) {
        db.prepare(`INSERT INTO payment (order_no,kind,item,amount,way,trade_no,state,operator,created_at)
          VALUES (?,'recv','附加费',?,?,?, 'done', ?,?)`).run(o.no, amt, '微信支付',
            'SK' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0'), o.sales_name || '李晴', o.created_at);
        db.prepare('UPDATE torder SET paid=paid+? WHERE no=?').run(amt, o.no);
        p++;
      }
    }
    // 订单日志
    if (!db.prepare('SELECT COUNT(*) n FROM orderlog WHERE order_no=?').get(o.no).n) {
      const seq = [];
      seq.push(['系统', '系统', '订单生成',
        o.consult_no ? `由咨询单 ${o.consult_no} 成交生成，成交金额 ${(o.amount || 0).toLocaleString()} 元`
                     : `门店手工建单，成交金额 ${(o.amount || 0).toLocaleString()} 元`]);

      if (R >= 1) seq.push(['销售', o.sales_name || '李晴', '收取定金',
        `登记定金 ${Math.round((o.amount || 0) * 0.3).toLocaleString()} 元（微信支付）`]);
      if (R >= 2) seq.push(['销售', o.sales_name || '李晴', '签署合同', `电子合同 ${o.contract_no || '—'} 签署完成`]);
      if (R >= 3) seq.push(['销售', o.sales_name || '李晴', '收取全款', `尾款到账，累计已收 ${(o.amount || 0).toLocaleString()} 元`]);
      if (R >= 3) seq.push(['供应商', o.supplier_name || '供应商', '资源确认', '机位、酒店与地接车导全部确认完毕']);
      if (R >= 4) seq.push(['销售', o.sales_name || '李晴', '出行准备', '确认单、行前说明与紧急联系卡已发送给客人']);
      if (R >= 5) seq.push(['销售', o.sales_name || '李晴', '出行中', '客人已出发，境外服务由地接跟进']);
      if (R >= 6) seq.push(['总部', '财务', '行程完成', '回程确认，供应商结算完成，已发起客人回访']);
      seq.forEach(x => {
        db.prepare('INSERT INTO orderlog (order_no,role,who,act,detail) VALUES (?,?,?,?,?)').run(o.no, x[0], x[1], x[2], x[3]);
        l++;
      });
    }
  });
  console.log(`✓ 订单明细回填：出行人 ${t} · 流水 ${p} · 日志 ${l} · 费用 ${f}`);
}

backfill();
