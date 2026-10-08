const Database = require('better-sqlite3');
const fs = require('fs'), path = require('path');
const DB_PATH = process.env.UTRIP_DB || path.join(__dirname, '..', '..', 'utrip.db');
const db = new Database(DB_PATH);
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// 加列升级段：CREATE TABLE 对已存在的表整段跳过，新增列必须在这里补
// （幂等：先查 PRAGMA table_info，没有才 ALTER）
function addCol(table, col, decl) {
  const has = db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col);
  if (!has) db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`).run();
}
[['video', 'TEXT'], ['poster', 'TEXT'], ['spots', 'TEXT'], ['itinerary', 'TEXT'],
 ['process', 'TEXT'], ['endorse', 'TEXT']].forEach(([c, d]) => addCol('product', c, d));
[['contact_name', 'TEXT'], ['contact_phone', 'TEXT'], ['contact_email', 'TEXT'],
 ['addr', 'TEXT'], ['invoice_title', 'TEXT'], ['invoice_state', "TEXT DEFAULT 'none'"],
 ['refund_amount', 'INTEGER DEFAULT 0'], ['refund_state', "TEXT DEFAULT 'none'"],
 ['cancel_reason', 'TEXT'], ['remark', 'TEXT'], ['product_id', 'TEXT'],
 ['settle_state', "TEXT DEFAULT 'unpaid'"]].forEach(([c, d]) => addCol('torder', c, d));

addCol('rule', 'margin', 'INTEGER DEFAULT 25');   // 目标毛利率（%），成交时算建议成交价

// 订单状态按众信旅游订单口径重构：订单状态只管「钱」，出行/资源/合同/保险各走自己的状态位
[['trip_state', "TEXT DEFAULT '未出行'"],      // 未出行 / 出行中 / 已回团
 ['res_state', "TEXT DEFAULT '待确认'"],       // 资源确认（对应散拼的占位状态）：待确认 / 已确认 / 确认失败
 ['insure_state', "TEXT DEFAULT '未投保'"],    // 未投保 / 已投保
 ['notify_state', "TEXT DEFAULT '未通知'"],    // 出行通知：未通知 / 已通知
 ['audit_state', "TEXT DEFAULT '无需审核'"],   // 审核状态
 ['trip_back', 'TEXT']                          // 回程日期
].forEach(([c, d]) => addCol('torder', c, d));

// 定制产品补齐散拼产品的经营字段（与众信产品中心口径一致）
[['zx_code', 'TEXT'], ['travel_type', "TEXT DEFAULT '境外游'"], ['product_type', "TEXT DEFAULT '私家团'"],
 ['group_mode', "TEXT DEFAULT '保证成团'"], ['from_city', "TEXT DEFAULT '北京'"], ['nights', 'INTEGER'],
 ['settle_price', 'INTEGER DEFAULT 0'], ['child_price', 'INTEGER DEFAULT 0'], ['single_room', 'INTEGER DEFAULT 0'],
 ['group_size', 'INTEGER DEFAULT 8'], ['cals', 'TEXT'], ['themes', 'TEXT'], ['brand', 'TEXT'],
 ['supplier_id', 'TEXT'], ['supplier_name', 'TEXT']].forEach(([c, d]) => addCol('product', c, d));

addCol('zx_product', 'sale_status', "TEXT DEFAULT '在售'");   // 众信侧原始销售状态：在售 / 停售
addCol('zx_product', 'off_reason', 'TEXT');
[['zx_sale_status', "TEXT DEFAULT '在售'"], ['zx_synced_at', 'TEXT']].forEach(([c, d]) => addCol('product', c, d));

// 产品级补充说明（费用包含/不含、签证与出行人要求、退改约定等），逐个产品维护，
// 取代原先放在公共配置里的「预订须知 / 退改政策」两块
addCol('product', 'extra', 'TEXT');

// 对外产品编号（D + 6 位数字）与操作留痕。id 仍是内部主键，不对外展示
[['code', 'TEXT'], ['created_by', 'TEXT'], ['updated_by', 'TEXT'], ['updated_at', 'TEXT']]
  .forEach(([c, d]) => addCol('product', c, d));

/* 行程规划模板对齐 OPC 有米 UOM 的「定制配置 · 模板列表」：
   type 主题类型 + dest_mode/dest 适用目的地 → 出方案时按「目的地 + 主题」自动匹配模板；
   skin 决定客人端行程页的配色/封面样式/密度/圆角；modules 由 key-value 改成有序数组，
   每块可开关、可改标题、可加自定义模块。 */
[['type', 'TEXT'], ['dest_mode', "TEXT DEFAULT 'all'"], ['dest', 'TEXT'],
 ['skin', 'TEXT'], ['sort', 'INTEGER DEFAULT 50']].forEach(([c, d]) => addCol('template', c, d));

[['tpl_id', 'TEXT'], ['tpl_name', 'TEXT']].forEach(([c, d]) => addCol('consult', c, d));
[['tpl_id', 'TEXT'], ['tpl_name', 'TEXT']].forEach(([c, d]) => addCol('plan', c, d));

/* 地接社（供应商）档案：原来只有名字 + 目的地 + 评分，现在补齐入驻要的基础信息、
   资质证照与可接单范围。可接单范围沿用 OPC 定制规则配置的口径：门店 + 目的地，
   再加上我们自己资源库的七类资源。 */
[['type', "TEXT DEFAULT '境外地接社'"], ['country', 'TEXT'], ['city', 'TEXT'], ['addr', 'TEXT'],
 ['founded', 'TEXT'], ['site', 'TEXT'], ['intro', 'TEXT'],
 ['contact', 'TEXT'], ['contact_title', 'TEXT'], ['phone', 'TEXT'], ['email', 'TEXT'], ['wechat', 'TEXT'],
 ['sos_name', 'TEXT'], ['sos_phone', 'TEXT'],
 ['settle_cycle', "TEXT DEFAULT '月结 30 天'"], ['currency', "TEXT DEFAULT 'CNY'"],
 ['bank_name', 'TEXT'], ['bank_acct', 'TEXT'], ['invoice_title', 'TEXT'], ['tax_no', 'TEXT'],
 ['legal_person', 'TEXT'], ['reg_capital', 'TEXT'],
 ['license_no', 'TEXT'], ['license_to', 'TEXT'], ['license_file', 'TEXT'],
 ['travel_no', 'TEXT'], ['travel_to', 'TEXT'], ['travel_file', 'TEXT'],
 ['insure_no', 'TEXT'], ['insure_amt', 'TEXT'], ['insure_to', 'TEXT'], ['insure_file', 'TEXT'],
 ['agree_no', 'TEXT'], ['agree_from', 'TEXT'], ['agree_to', 'TEXT'], ['agree_file', 'TEXT'],
 ['res_types', 'TEXT'], ['shop_mode', "TEXT DEFAULT 'all'"], ['max_order', 'INTEGER DEFAULT 0'],
 ['min_pax', 'INTEGER DEFAULT 0'], ['rush_days', 'INTEGER DEFAULT 0'],
 ['coop_state', "TEXT DEFAULT '合作中'"], ['memo', 'TEXT'],
 ['created_at', 'TEXT'], ['updated_at', 'TEXT']].forEach(([c, d]) => addCol('supplier', c, d));

addCol('consult', 'plan_ok', 'INTEGER DEFAULT 0');   // 行程方案是否已与客人确认（原「方案已确认」状态降级为进度标记）

[['created_by', 'TEXT'], ['updated_by', 'TEXT']].forEach(([c, d]) => addCol('consult', c, d));

addCol('consult', 'from_article', 'TEXT');   // 由哪篇内容带来的咨询单

// 客人档案：常用出发城市与偏好标签，「我的 · 个人资料」里可自己维护，
// 定制顾问接单时能直接看到，省一轮来回问
[['from_city', 'TEXT'], ['prefs', 'TEXT']].forEach(([c, d]) => addCol('guest', c, d));

/* 报价单要素（对标定制同行的行程报价页）：
   - day.drive 当天参考车程，定制客人最在意每天坐多久车
   - plan.notice 报价注意事项（不含机票 / 资源未预留 / 人数日期变动需重核）—— 定制生意的风险声明
   - plan.fee_inc / fee_exc 费用包含与不含（分类写，不是一句概括）
   - plan.standard 接待标准（正餐、讲解、司陪职责与工时） */
addCol('day', 'drive', 'TEXT');
[['notice', 'TEXT'], ['fee_inc', 'TEXT'], ['fee_exc', 'TEXT'], ['standard', 'TEXT']]
  .forEach(([c, d]) => addCol('plan', c, d));

// 会员：等级与统计口径都落在 guest 上，避免每次查列表都去 torder 现算
[['level_id', 'TEXT'], ['year_amount', 'INTEGER DEFAULT 0'], ['total_amount', 'INTEGER DEFAULT 0'],
 ['order_cnt', 'INTEGER DEFAULT 0'], ['level_at', 'TEXT'], ['member_no', 'TEXT']]
  .forEach(([c, d]) => addCol('guest', c, d));

/* 个人资料补充字段：性别与生日是会员权益（生日礼遇）和称呼用的，
   英文名出境订机票要，邮箱用来发行程单与电子合同 */
[['gender', 'TEXT'], ['birth', 'TEXT'], ['en_name', 'TEXT'], ['email', 'TEXT']]
  .forEach(([c, d]) => addCol('guest', c, d));

/* 咨询单推送开关：AI 定制提交后先进 CSP 后台，销售改完确认推送，客人才看得到。
   guest_visible=0 的单客人端一律查不到。已有的历史单默认可见，
   否则客人端会突然一单不剩。 */
[['guest_visible', 'INTEGER DEFAULT 0'], ['pushed_at', 'TEXT'], ['pushed_by', 'TEXT']]
  .forEach(([c, d]) => addCol('consult', c, d));
db.prepare("UPDATE consult SET guest_visible=1 WHERE guest_visible IS NULL OR (guest_visible=0 AND created_at < datetime('now','localtime','-1 minute'))").run();

/* 权益图标：小程序会员中心那一格用它。原来在前端按 code 写死一张映射表，
   后台新建的权益一律落成默认星星，运营改不了。 */
addCol('member_benefit', 'icon', 'TEXT');

module.exports = db;
