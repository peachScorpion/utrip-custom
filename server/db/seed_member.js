/* 会员体系初始数据：四档等级 + 一组权益 + 等级×权益关联。
   门槛按优定制的客单（私家团人均 2-3 万）定，业务可在后台改。 */
const db = require('./index.js');

const LEVELS = [
  { id: 'ML1', name: '旅行会员', code: 'base',     min_amount: 0,      keep_amount: 0,      sort: 1, color: '#8a7c6a', memo: '注册即可，下单后开始累计年度消费' },
  { id: 'ML2', name: '银卡会员', code: 'silver',   min_amount: 30000,  keep_amount: 20000,  sort: 2, color: '#9aa3ab', memo: '年度消费满 3 万' },
  { id: 'ML3', name: '金卡会员', code: 'gold',     min_amount: 80000,  keep_amount: 60000,  sort: 3, color: '#b08d4f', memo: '年度消费满 8 万' },
  { id: 'ML4', name: '黑卡会员', code: 'platinum', min_amount: 200000, keep_amount: 150000, sort: 4, color: '#2f2a24', memo: '年度消费满 20 万，专属接待' },
];

const BENEFITS = [
  { id: 'MB1', name: '专属服务通道', code: 'advisor',  kind: 'service',   descr: '全程一个对接口，不转手' },
  { id: 'MB2', name: '行前确认服务', code: 'preplan', kind: 'service',  descr: '出发前专人过一遍行程与注意事项' },
  { id: 'MB3', name: '优先排期',      code: 'priority', kind: 'privilege', descr: '旺季档期优先锁位' },
  { id: 'MB4', name: '定制服务费减免', code: 'feeoff',  kind: 'discount',  descr: '按等级减免定制服务费' },
  { id: 'MB5', name: '机场接送',      code: 'pickup',   kind: 'gift',      descr: '出发地机场单程或往返接送' },
  { id: 'MB6', name: '行中 24 小时应急', code: 'sos',   kind: 'service',   descr: '境外应急响应' },
  { id: 'MB7', name: '酒店升级',      code: 'upgrade',  kind: 'gift',      descr: '合作酒店视房态升级' },
  { id: 'MB8', name: '生日礼遇',      code: 'birthday', kind: 'gift',      descr: '生日当月专属礼遇' },
  { id: 'MB9', name: '专属活动邀约',  code: 'invite',   kind: 'privilege', descr: '目的地推介会、品鉴活动优先邀请' },
];

/* 等级 × 权益：低档几条，高档累加，同一条权益不同档位额度不同 */
const MAP = {
  ML1: [['MB1', '在线服务通道']],
  ML2: [['MB1', '优先响应'], ['MB2', '出发前 1 次'], ['MB4', '减免 200 元'], ['MB8', '生日礼遇']],
  ML3: [['MB1', '专属服务通道'], ['MB2', '出发前 2 次'], ['MB3', '旺季优先锁位'], ['MB4', '减免 500 元'],
        ['MB5', '出发地单程接送'], ['MB6', '境外 24 小时'], ['MB8', '生日礼遇']],
  ML4: [['MB1', '专属接待'], ['MB2', '不限次'], ['MB3', '最高优先级'], ['MB4', '全免'],
        ['MB5', '往返接送'], ['MB6', '境外 24 小时 + 专线'], ['MB7', '视房态升级'],
        ['MB8', '生日礼遇 + 专属礼品'], ['MB9', '全年活动邀约']],
};

const n = db.prepare('SELECT COUNT(*) c FROM member_level').get().c;
if (n) { console.log('会员等级已存在，跳过'); process.exit(0); }

const insL = db.prepare(`INSERT INTO member_level (id,name,code,rule_kind,min_amount,keep_amount,sort,color,memo,status)
  VALUES (@id,@name,@code,'year_amount',@min_amount,@keep_amount,@sort,@color,@memo,1)`);
LEVELS.forEach(l => insL.run(l));
const insB = db.prepare(`INSERT INTO member_benefit (id,name,code,kind,descr,sort,status)
  VALUES (@id,@name,@code,@kind,@descr,@sort,1)`);
BENEFITS.forEach((b, i) => insB.run({ ...b, sort: i + 1 }));
const insM = db.prepare('INSERT INTO member_level_benefit (level_id,benefit_id,val,sort) VALUES (?,?,?,?)');
Object.entries(MAP).forEach(([lv, arr]) => arr.forEach(([bid, val], i) => insM.run(lv, bid, val, i + 1)));

console.log('会员等级', LEVELS.length, '权益', BENEFITS.length,
  '关联', db.prepare('SELECT COUNT(*) c FROM member_level_benefit').get().c);
