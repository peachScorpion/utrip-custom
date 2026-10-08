const db=require('/home/ec2-user/.openclaw/workspace/users/tang-assistant/utrip-custom/server/db/index.js');
for(const o of db.prepare('SELECT * FROM torder').all()){
  const fee=db.prepare("SELECT IFNULL(SUM(amount),0) s FROM fee WHERE order_no=? AND bear='客人'").get(o.no).s;
  if(!fee) continue;
  const recv=db.prepare("SELECT IFNULL(SUM(amount),0) s FROM payment WHERE order_no=? AND kind='recv' AND state='done'").get(o.no).s;
  const due=(o.amount||0)+fee;
  if(recv>=due) continue;
  if(!['paid','done'].includes(o.status) && o.trip_state==='未出行') continue;
  const gap=due-recv;
  db.prepare("INSERT INTO payment (order_no,kind,item,amount,way,trade_no,state,operator,created_at) VALUES (?,'recv','附加费',?,'微信支付',?,'done',?,?)")
    .run(o.no,gap,'SK'+String(Math.floor(Math.random()*1e9)).padStart(9,'0'),o.sales_name||'李晴',o.created_at);
  const st = ['done','cancelled','refunded'].includes(o.status) ? o.status : 'paid';
  db.prepare('UPDATE torder SET paid=?, status=? WHERE no=?').run(due,st,o.no);
  console.log('补收',o.no,gap);
}
