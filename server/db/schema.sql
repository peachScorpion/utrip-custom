PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS channel (
  id TEXT PRIMARY KEY, name TEXT, company TEXT, city TEXT
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY, name TEXT, phone TEXT, channel_id TEXT, avatar TEXT
);

CREATE TABLE IF NOT EXISTS supplier (
  id TEXT PRIMARY KEY, name TEXT, short TEXT, dests TEXT, channels TEXT,
  rating REAL DEFAULT 4.6, deals INTEGER DEFAULT 0, enabled INTEGER DEFAULT 1
);

-- UOM 录入的「灵感之旅」内容产品
CREATE TABLE IF NOT EXISTS product (
  id TEXT PRIMARY KEY, title TEXT, subtitle TEXT, dest TEXT, region TEXT,
  days INTEGER, price_from INTEGER, cover TEXT, gallery TEXT,
  tags TEXT, highlights TEXT, outline TEXT, theme TEXT,
  status TEXT DEFAULT 'on', sort INTEGER DEFAULT 0, type TEXT DEFAULT 'inspire', depart TEXT,
  video TEXT, poster TEXT, spots TEXT, itinerary TEXT, process TEXT, endorse TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 小程序首页配置
CREATE TABLE IF NOT EXISTS home_config (
  k TEXT PRIMARY KEY, v TEXT, updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 行程规划模板
CREATE TABLE IF NOT EXISTS template (
  id TEXT PRIMARY KEY, name TEXT, is_def INTEGER DEFAULT 0,
  modules TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 定制规则（接单方式 / 平台自供 / 供应商名单）
CREATE TABLE IF NOT EXISTS rule (
  id TEXT PRIMARY KEY, channel_id TEXT, mode TEXT DEFAULT 'auto',
  max_vendor INTEGER DEFAULT 3, self_items TEXT, vendors TEXT
);

-- 定制咨询单（核心）
CREATE TABLE IF NOT EXISTS consult (
  no TEXT PRIMARY KEY,
  source TEXT,                -- mini_form / mini_ai / csp_agent / csp_manual
  status TEXT DEFAULT 'pending',
  customer TEXT, phone TEXT, from_city TEXT, dest TEXT, region TEXT,
  go_date TEXT, days INTEGER, adults INTEGER DEFAULT 2, children INTEGER DEFAULT 0, elders INTEGER DEFAULT 0,
  budget INTEGER, theme TEXT, prefs TEXT, must_see TEXT, note TEXT,
  product_id TEXT,
  sales_id TEXT, sales_name TEXT, channel_id TEXT, shop TEXT,
  quote INTEGER, sup_quote INTEGER, sup_state TEXT, sup_vendors TEXT, sup_mode TEXT, sup_pick TEXT,
  order_no TEXT, intent TEXT DEFAULT 'mid',
  share_token TEXT, last_seen_at TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 方案（一单可多版）
CREATE TABLE IF NOT EXISTS plan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consult_no TEXT, ver INTEGER DEFAULT 1, name TEXT,
  route TEXT, tagline TEXT, highlights TEXT, total INTEGER, quote_note TEXT,
  cover TEXT, geo TEXT, is_cur INTEGER DEFAULT 1,
  kind TEXT DEFAULT 'ai', memo TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 逐日行程
CREATE TABLE IF NOT EXISTS day (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER, d INTEGER, title TEXT, city TEXT,
  items TEXT, hotel TEXT, meals TEXT, pic TEXT, exp TEXT, food TEXT, note TEXT
);

-- 供应商报价
CREATE TABLE IF NOT EXISTS quote (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consult_no TEXT, supplier_id TEXT, supplier_name TEXT,
  state TEXT DEFAULT 'pending',      -- pending/taken/quoted/lost/won
  total INTEGER, per_person INTEGER, items TEXT, day_notes TEXT, memo TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  quoted_at TEXT
);

-- 客人反馈标注
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consult_no TEXT, round INTEGER DEFAULT 1, d INTEGER, target TEXT, text TEXT,
  from_who TEXT DEFAULT 'guest',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 操作日志
CREATE TABLE IF NOT EXISTS log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consult_no TEXT, who TEXT, act TEXT, detail TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 对话消息（C端 AI 行程师 / CSP 销售端定制师）
CREATE TABLE IF NOT EXISTS chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_key TEXT, role TEXT, kind TEXT DEFAULT 'text', text TEXT, payload TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS ix_consult_status ON consult(status);
CREATE INDEX IF NOT EXISTS ix_plan_no ON plan(consult_no);
CREATE INDEX IF NOT EXISTS ix_day_plan ON day(plan_id);
CREATE INDEX IF NOT EXISTS ix_quote_no ON quote(consult_no);
CREATE INDEX IF NOT EXISTS ix_chat_sess ON chat(session_key);

-- C 端用户
CREATE TABLE IF NOT EXISTS guest (
  phone TEXT PRIMARY KEY, nick TEXT, avatar TEXT, source TEXT,
  level TEXT DEFAULT 'silver',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  last_login TEXT
);
-- 收藏（内容 / 产品 / 目的地）
CREATE TABLE IF NOT EXISTS favorite (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT, kind TEXT, ref TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_fav ON favorite(phone, kind, ref);

-- 旅游订单（咨询单成交后生成，三端共享同一条）
CREATE TABLE IF NOT EXISTS torder (
  no TEXT PRIMARY KEY, consult_no TEXT,
  customer TEXT, phone TEXT, dest TEXT, days INTEGER, pax INTEGER, go_date TEXT,
  channel_id TEXT, shop TEXT, sales_name TEXT,
  amount INTEGER, cost INTEGER,
  supplier_id TEXT, supplier_name TEXT,
  status TEXT DEFAULT 'created',
  paid INTEGER DEFAULT 0, contract_no TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_order_consult ON torder(consult_no);

-- 小程序首页配置方案（可多套复用）
CREATE TABLE IF NOT EXISTS homepage (
  id TEXT PRIMARY KEY, name TEXT, creator TEXT, modifier TEXT,
  channels TEXT, valid_from TEXT, valid_to TEXT,
  status INTEGER DEFAULT 1, is_default INTEGER DEFAULT 0,
  config TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- UBK 供应商账号（供应商自己的员工账号与权限）
CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  vendor_id TEXT, name TEXT, phone TEXT, email TEXT,
  role TEXT DEFAULT 'quote',          -- admin 管理员 / quote 报价员 / ops 履约操作 / view 只读
  dept TEXT, remark TEXT,
  status INTEGER DEFAULT 1,           -- 1 启用 / 0 停用
  last_login TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_account_vendor ON account(vendor_id);

-- 订单出行人
CREATE TABLE IF NOT EXISTS traveler (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT, name TEXT, en_name TEXT, gender TEXT, birth TEXT,
  kind TEXT DEFAULT 'adult',           -- adult 成人 / child 儿童 / elder 长者
  id_type TEXT DEFAULT '护照', id_no TEXT, id_exp TEXT,
  phone TEXT, is_contact INTEGER DEFAULT 0,
  doc_state TEXT DEFAULT 'todo',       -- todo 待收 / part 部分 / done 齐全
  remark TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_traveler_order ON traveler(order_no);

-- 订单日志（谁在什么时候做了什么）
CREATE TABLE IF NOT EXISTS orderlog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT, role TEXT, who TEXT, act TEXT, detail TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_orderlog_order ON orderlog(order_no);

-- 收款 / 退款流水
CREATE TABLE IF NOT EXISTS payment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT, kind TEXT,            -- recv 收款 / refund 退款 / settle 供应商结算
  item TEXT,                            -- 定金 / 尾款 / 全款 / 退款
  amount INTEGER, way TEXT, trade_no TEXT,
  state TEXT DEFAULT 'done',           -- pending 待确认 / done 已到账 / rejected 已驳回
  operator TEXT, reason TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_payment_order ON payment(order_no);

-- 其他费用（改签费、单房差、签证费等）
CREATE TABLE IF NOT EXISTS fee (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT, name TEXT, amount INTEGER, bear TEXT DEFAULT '客人',
  remark TEXT, created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_fee_order ON fee(order_no);

-- 众信产品库镜像：按产品编码把总部产品中心的散拼产品拉进来，做定制产品的底稿
CREATE TABLE IF NOT EXISTS zx_product (
  code TEXT PRIMARY KEY,          -- 众信产品编号，U + 6~12 位数字
  title TEXT, sub TEXT,
  travel_type TEXT,               -- 境外游 / 境内游
  product_type TEXT,              -- 跟团游 / 半自助 / 私家团 / 定制游
  group_mode TEXT,                -- 保证成团 / 满人成团
  dest_country TEXT, dest_city TEXT, region TEXT,
  depart_city TEXT, days INTEGER, nights INTEGER,
  supplier TEXT, supplier_code TEXT, brand TEXT,
  settle_price INTEGER,           -- 结算价
  retail_price INTEGER,           -- 建议零售价
  child_price INTEGER, single_room INTEGER,
  group_size INTEGER,             -- 成团人数
  cals TEXT,                      -- 团期 [{date, price, stock}]
  themes TEXT, tags TEXT,
  highlights TEXT, itinerary TEXT,
  cover TEXT, gallery TEXT,
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 平台公共配置：定制流程 / 服务背书 / 预订须知 / 退改政策 等各产品共用的内容
CREATE TABLE IF NOT EXISTS setting (
  k TEXT PRIMARY KEY, v TEXT,
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 资源确认明细（供应商侧履约）：机位 / 酒店 / 地接车导 / 餐食 / 门票
CREATE TABLE IF NOT EXISTS res_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT, cate TEXT, name TEXT,
  state TEXT DEFAULT 'todo',      -- todo 待确认 / done 已确认 / fail 无法确认
  memo TEXT, who TEXT,
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_res_order ON res_item(order_no);

-- ============ 地接资源库（酒店 / 门票 / 用车 / 餐厅 / 导游 / 体验 / 其他）============
-- 一张主档表用 type 区分七类，共性字段建列（列表与筛选都走列），
-- 各类专属字段进 ext(JSON)，避免七张结构雷同的表。
-- 价格不落在主档上：一家酒店有多个房型、一个景点有多个票种，
-- 统一由 gres_unit（可售单元）承载，主档只存由单元汇总出来的起价。
CREATE TABLE IF NOT EXISTS gres (
  id TEXT PRIMARY KEY,                       -- HT0001 / TK0001 / CR0001 ...
  type TEXT NOT NULL,                        -- hotel/ticket/car/dining/guide/exp/other
  name TEXT, name_en TEXT,
  country TEXT, city TEXT, addr TEXT,        -- 目的地：国家 + 城市 + 具体地址
  level TEXT,                                -- 各类的主分类维度（星级/景点级别/车型级别/餐厅档次/导游类型/体验类别）
  supplier_id TEXT, supplier_name TEXT,      -- 关联供应商（可空＝平台直采）
  contact TEXT, phone TEXT,                  -- 资源方联系人
  tags TEXT,                                 -- JSON 数组
  cover TEXT, images TEXT,                   -- 封面 + 图集(JSON)
  intro TEXT,                                -- 资源简介，报价与行程里会展示给客人
  ext TEXT,                                  -- JSON：各类专属字段
  cost_from INTEGER DEFAULT 0,               -- 起结算价（由 gres_unit 汇总，只读）
  price_from INTEGER DEFAULT 0,              -- 起售价（同上）
  currency TEXT DEFAULT 'CNY',
  rating REAL DEFAULT 0,                     -- 内部评分
  used INTEGER DEFAULT 0,                    -- 被报价引用次数
  status TEXT DEFAULT 'on',                  -- on 启用 / off 停用
  memo TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_gres_type ON gres(type, status);

-- 可售单元：房型 / 票种 / 车型服务 / 餐标 / 导服档 / 体验场次 / 其他规格
CREATE TABLE IF NOT EXISTS gres_unit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  res_id TEXT NOT NULL, name TEXT, spec TEXT,
  unit TEXT DEFAULT '人',                    -- 计价单位：间夜/人/团/天/次/辆天
  cost INTEGER DEFAULT 0,                    -- 结算价（给供应商的）
  price INTEGER DEFAULT 0,                   -- 建议售价（对客）
  cap INTEGER DEFAULT 0,                     -- 容量：可住人数/座位数/可接待人数
  min_pax INTEGER DEFAULT 0,                 -- 起订人数
  season TEXT,                               -- 适用期：如 全年 / 4-10月 / 旺季
  stock TEXT,                                -- 库存或配额说明
  status TEXT DEFAULT 'on',
  sort INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_gres_unit_res ON gres_unit(res_id);

-- 报价里选用的地接资源明细：供应商按客人需求单报价时，从资源库挑出来的每一条
-- （哪家酒店的哪个房型、几间几晚、多少钱）。按 (咨询单, 供应商) 全量覆盖。
CREATE TABLE IF NOT EXISTS quote_res (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consult_no TEXT NOT NULL, supplier_id TEXT NOT NULL,
  cate TEXT,                                 -- 报价分类：地接车导 / 酒店 / 门票与体验 / 餐食 / 其他
  res_id TEXT, unit_id INTEGER,
  res_type TEXT, res_name TEXT, unit_name TEXT, spec TEXT,
  city TEXT, unit TEXT DEFAULT '人',
  cost INTEGER DEFAULT 0,                    -- 单价（结算价）
  qty REAL DEFAULT 1,                        -- 数量：间夜 / 人次 / 天 / 次
  amount INTEGER DEFAULT 0,                  -- 小计 = cost × qty
  day INTEGER,                               -- 用在第几天，可空
  memo TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_quote_res ON quote_res(consult_no, supplier_id);
CREATE INDEX IF NOT EXISTS ix_quote_res_res ON quote_res(res_id);

-- 内容浏览埋点：PV 一次一条，UV 按 visitor 去重
CREATE TABLE IF NOT EXISTS content_view (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  art_id TEXT, visitor TEXT, phone TEXT, ref TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_cv_art ON content_view(art_id);

-- 供应商对某个资源单元的报价：同一家酒店的同一个房型，不同供应商给的结算价不一样，
-- 所以价格不能挂在资源上，必须按「供应商 × 资源单元」单独存。
-- 资源主档（gres/gres_unit）只描述「这是什么」，以及一个用于估算与比价的参考价。
CREATE TABLE IF NOT EXISTS gres_rate (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  res_id TEXT NOT NULL, unit_id INTEGER NOT NULL,
  supplier_id TEXT NOT NULL, supplier_name TEXT,
  cost INTEGER DEFAULT 0,                    -- 这家供应商给我们的结算价
  currency TEXT DEFAULT 'CNY',
  valid_from TEXT, valid_to TEXT,            -- 协议有效期 / 季节价区间，空＝长期有效
  min_qty INTEGER DEFAULT 0,                 -- 起订量
  tax TEXT DEFAULT '含税',                   -- 含税 / 不含税
  status TEXT DEFAULT 'on',                  -- on 生效 / off 停用
  memo TEXT,
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_gres_rate ON gres_rate(res_id, unit_id);
CREATE INDEX IF NOT EXISTS ix_gres_rate_sup ON gres_rate(supplier_id);

-- ===== 会员体系 =====
-- 等级按「年度订单消费金额」划，这是本期唯一的定级规则（业务口径）。
-- rule_kind 预留出来：以后要按积分、按订单数、按手工指定，加枚举就行，不用改表。
CREATE TABLE IF NOT EXISTS member_level (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                        -- 展示名，如「白金会员」
  code TEXT NOT NULL,                        -- 英文码，前端配色/图标按它取
  rule_kind TEXT DEFAULT 'year_amount',      -- 定级规则：year_amount 年度消费金额
  min_amount INTEGER DEFAULT 0,              -- 达标门槛（含），单位元
  keep_amount INTEGER DEFAULT 0,             -- 保级门槛，0 表示不降级
  sort INTEGER DEFAULT 0,                    -- 由低到高
  color TEXT,                                -- 卡面主色
  icon TEXT,
  memo TEXT,
  status INTEGER DEFAULT 1,                  -- 1 启用 0 停用
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 权益主档。和等级是多对多：同一条权益可以挂在多个等级上，额度不同。
CREATE TABLE IF NOT EXISTS member_benefit (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  kind TEXT DEFAULT 'service',               -- service 服务 / discount 折扣 / gift 礼遇 / privilege 特权
  descr TEXT,
  icon TEXT,
  sort INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 等级 × 权益 的关联（业务说的「关联」）。val 存这一档的额度／说明，
-- 例如同一条「行前专属顾问」，金卡是「1 对 1」，白金是「1 对 1 + 24 小时」。
CREATE TABLE IF NOT EXISTS member_level_benefit (
  level_id TEXT NOT NULL,
  benefit_id TEXT NOT NULL,
  val TEXT,
  sort INTEGER DEFAULT 0,
  PRIMARY KEY (level_id, benefit_id)
);

-- 定级流水：每次变更留痕，后台要能查「为什么是这个等级」
CREATE TABLE IF NOT EXISTS member_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  from_level TEXT, to_level TEXT,
  year_amount INTEGER DEFAULT 0,
  reason TEXT,
  operator TEXT DEFAULT 'system',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_member_log_phone ON member_log(phone);

-- 客人的常用旅客档案。原先只存在小程序的 localStorage 里：换个手机就没了、
-- 后台也看不到、和订单出行人对不上。挪到服务端，并支持从历史订单出行人一键带入。
CREATE TABLE IF NOT EXISTS guest_traveler (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,                       -- 属于哪位客人
  name TEXT NOT NULL, en_name TEXT,
  gender TEXT, birth TEXT,
  kind TEXT DEFAULT '成人',                  -- 成人 / 儿童 / 婴儿
  id_type TEXT DEFAULT '身份证',
  id_no TEXT, id_exp TEXT,
  tphone TEXT,                               -- 旅客本人手机号
  is_self INTEGER DEFAULT 0,                 -- 是不是本人
  src TEXT DEFAULT 'manual',                 -- manual 手工录入 / order 从订单带入
  remark TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_gt_phone ON guest_traveler(phone);

-- 行程方案里的航班。对标定制同行的报价单：客人要能看到几点起飞、落哪个航站楼。
-- 本期由运营在后台填（不接航司实时库存），所以只存展示所需的字段。
CREATE TABLE IF NOT EXISTS plan_flight (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  d INTEGER DEFAULT 1,                       -- 第几天
  airline TEXT, fno TEXT,                    -- 航司 / 航班号
  from_city TEXT, from_air TEXT, dep_time TEXT, dep_date TEXT,
  to_city TEXT,   to_air TEXT,   arr_time TEXT, arr_date TEXT,
  stop TEXT,                                 -- 经停地，空＝直飞
  sort INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_plan_flight ON plan_flight(plan_id);

-- ============ 旅途故事 ============
-- 一次出行（一张订单）一个故事：客人在路上传照片视频，回来用 AI 把它写成一篇按天的图文故事，
-- 可以分享，也可以推到数字相框上。
-- 素材归到行程第几天，靠照片自带的拍摄时间与出发日相减算出来（客人关了定位也不影响）。
CREATE TABLE IF NOT EXISTS story (
  id TEXT PRIMARY KEY,                       -- ST + 订单号尾段
  order_no TEXT, consult_no TEXT, phone TEXT,
  dest TEXT, days INTEGER, go_date TEXT,     -- 冗余一份出行信息，故事页不用再关联查
  title TEXT, cover TEXT,
  intro TEXT, outro TEXT,                    -- 开篇与结语
  state TEXT DEFAULT 'draft',                -- draft 还没生成 / ready 已生成 / failed 生成失败
  gen_by TEXT, gen_at TEXT, gen_err TEXT,    -- ai / template，失败原因
  share_token TEXT, views INTEGER DEFAULT 0,
  authorized INTEGER DEFAULT 0,              -- 客人是否授权把这些照片用于产品展示
  frame_at TEXT,                             -- 最近一次推到相框的时间
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_story_phone ON story(phone);

-- 素材：照片与视频
CREATE TABLE IF NOT EXISTS story_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id TEXT NOT NULL, kind TEXT DEFAULT 'photo',   -- photo / video
  url TEXT, thumb TEXT, name TEXT, size INTEGER,
  w INTEGER, h INTEGER, dur REAL,
  shot_at TEXT,                              -- 拍摄时间（EXIF，取不到就用文件时间）
  lat REAL, lon REAL,
  day INTEGER DEFAULT 0,                     -- 归到行程第几天，0＝还没归
  city TEXT, caption TEXT,
  is_cover INTEGER DEFAULT 0, sort INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_story_media ON story_media(story_id, day, sort);

-- 故事的每日段落：AI 写的正文 + 客人自己补的一句话
CREATE TABLE IF NOT EXISTS story_day (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id TEXT NOT NULL, d INTEGER,
  city TEXT, title TEXT, text TEXT,
  note TEXT,                                 -- 客人写的感受，生成时会喂给 AI
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_story_day ON story_day(story_id, d);

-- 推到相框的记录（硬件对接方式定了之后补真实推送，先把流水记下来）
CREATE TABLE IF NOT EXISTS frame_push (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id TEXT, device TEXT, way TEXT,      -- device 相框标识，way 推送方式
  n_photo INTEGER DEFAULT 0, n_video INTEGER DEFAULT 0,
  state TEXT DEFAULT 'done', memo TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
