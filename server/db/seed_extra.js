/* 产品补充说明回填：费用包含 / 费用不含 / 出行人要求 / 退改约定。
   这四段过去放在公共配置的「预订须知 / 退改政策」里全平台共用一份，
   实际上各产品口径不同（境内外、是否含签证、单房差），改为逐产品维护。
   幂等：只补 extra 为空的产品，已经人工编辑过的不动。 */
const db = require('./index.js');

const li = a => a.map(x => `<li>${x}</li>`).join('');
const h = t => `<p><strong>${t}</strong></p>`;

function build(p) {
  const out = p.travel_type !== '境内游';
  const inc = [
    out ? '全程国际往返机票及机建燃油税' : '全程交通（含城际交通与当地用车）',
    `${p.nights || (p.days - 1)} 晚当地精选酒店住宿（双人间）`,
    '行程所列餐食与景点首道门票',
    '当地中文领队 / 导游服务',
    out ? '境外旅游意外伤害保险' : '旅游意外伤害保险',
  ];
  const exc = [
    out ? '目的地签证服务费及相关材料费用' : '行程未提及的自费项目',
    `单房差 ${p.single_room ? '￥' + p.single_room + ' / 人' : '（按实际房型核算）'}`,
    '个人消费、行李超重费及自选项目费用',
    '因不可抗力产生的额外食宿与交通费用',
  ];
  const pax = [
    `本产品为 ${p.group_size || 8} 人成团的臻品小团，满员即止`,
    out ? '出行人须持有效期 6 个月以上的因私护照，并配合提供签证材料' : '出行人须携带有效身份证件',
    p.child_price ? `儿童价 ￥${p.child_price} / 人，适用于 2–12 周岁且不占床的儿童` : '儿童及长者报名请提前与定制顾问确认适用条件',
    '65 周岁以上出行人请提前告知健康状况，必要时需提供健康证明',
  ];
  const ref = [
    '出发前 30 日（含）以上取消：扣除已产生的实际损失',
    '出发前 15–29 日取消：收取订单总额 30% 违约金',
    '出发前 7–14 日取消：收取订单总额 60% 违约金',
    '出发前 7 日以内取消：收取订单总额 80% 违约金',
    '机票、签证费等已实际发生的费用，按供应商规定据实扣除',
  ];
  return h('费用包含') + `<ul>${li(inc)}</ul>`
    + h('费用不含') + `<ul>${li(exc)}</ul>`
    + h('出行人要求') + `<ul>${li(pax)}</ul>`
    + h('退改约定') + `<ul>${li(ref)}</ul>`
    + `<p>以上内容以签署的旅游合同条款为准，如有疑问可联系您的专属定制顾问。</p>`;
}

module.exports = function seedExtra() {
  const rows = db.prepare('SELECT * FROM product').all();
  let n = 0;
  const up = db.prepare('UPDATE product SET extra=? WHERE id=?');
  rows.forEach(p => {
    if (p.extra && p.extra.trim()) return;
    up.run(build(p), p.id); n++;
  });
  if (n) console.log(`[seed_extra] 已补充 ${n} 条产品的补充说明`);
};
