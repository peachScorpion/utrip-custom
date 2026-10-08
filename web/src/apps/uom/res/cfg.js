/* ============ 七类地接资源的字段配置 ============
   列表列、筛选项、编辑表单、可售单元，全部由这份配置驱动，
   七个子菜单共用同一套 ResList / ResEditor，加一类资源只要加一段配置。

   字段口径参考成熟地接（DMC）系统的通用做法：
   资源主档（是什么、在哪、谁供的、什么档次）＋ 可售单元（卖什么规格、多少钱）分开建，
   因为一家酒店有多个房型、一个景点有多个票种，价格挂在主档上必然要拆。 */

/* 各类共用的字段类型：txt 文本 / num 数字 / sel 下拉 / chips 多选标签 / date 日期 / area 多行 */
export const RESCFG = {
  hotel: {
    cn: '酒店', en: 'Hotel', ic: 'bed', pfx: 'HT',
    desc: '定制行程里住宿是客单价大头。签约与常用酒店统一进库，供应商报价、行程排房都从这里选。',
    levelT: '星级', levels: ['五星', '准五星', '四星', '三星', '精品酒店', '度假村', '民宿客栈', '公寓'],
    unitT: '房型', unitTip: '一个房型一行：房型名 + 床型面积 + 按什么单位计价。价格不在这里填，由供应商报价时给。',
    unitUnits: ['间夜', '间', '人'],
    unitDef: { unit: '间夜', cap: 2 },
    ext: [
      { k: 'brand', t: '酒店品牌', type: 'txt', ph: '如 Marriott / Accor / 独立经营' },
      { k: 'area', t: '所在商圈', type: 'txt', ph: '如 市中心 / 老城区 / 海滨' },
      { k: 'breakfast', t: '含早情况', type: 'sel', opts: ['不含早', '含单早', '含双早', '含全早'] },
      { k: 'checkin', t: '入住时间', type: 'txt', ph: '15:00' },
      { k: 'checkout', t: '退房时间', type: 'txt', ph: '12:00' },
      { k: 'contract_to', t: '协议有效期至', type: 'date' },
      { k: 'facilities', t: '酒店设施', type: 'chips', opts: ['免费WiFi', '健身房', '室内泳池', '室外泳池', 'SPA', '停车场', '接送机', '中文服务', '行李寄存', '会议室'] },
      { k: 'child', t: '儿童政策', type: 'txt', ph: '如 12 岁以下不占床免费' },
      { k: 'cancel', t: '取消政策', type: 'area', ph: '如 入住前 14 天免费取消，7 天内收取首晚房费' },
    ],
    filt: [{ k: 'breakfast', t: '含早情况', opts: ['不含早', '含单早', '含双早', '含全早'] }],
    tags: ['协议价', '含双早', '临地铁', '可接待团队', '有中文服务', '海景房'],
    attr: r => [['品牌', r.ext.brand], ['含早', r.ext.breakfast], ['商圈', r.ext.area]],
  },

  ticket: {
    cn: '门票', en: 'Ticket', ic: 'tag', pfx: 'TK',
    desc: '景区、展馆、演出门票。能不能进、要不要预约、儿童怎么算钱，在这里定死，避免门店口头承诺与实际不符。',
    levelT: '景点级别', levels: ['世界遗产', '国家级景区', '博物馆美术馆', '主题乐园', '演出秀场', '观景台', '宗教场所', '自然公园'],
    unitT: '票种', unitTip: '成人票 / 儿童票 / 长者票 / 家庭套票 / 快速通道，各自一行。价格由供应商报价时给。',
    unitUnits: ['人', '张', '团'],
    unitDef: { unit: '人', cap: 1 },
    ext: [
      { k: 'open_time', t: '开放时间', type: 'txt', ph: '如 09:00-18:00，周一闭馆' },
      { k: 'duration', t: '建议游览时长', type: 'txt', ph: '如 2 小时' },
      { k: 'need_book', t: '是否需预约', type: 'sel', opts: ['无需预约', '需要预约'] },
      { k: 'book_days', t: '需提前预约天数', type: 'num', ph: '7' },
      { k: 'guide_service', t: '讲解服务', type: 'sel', opts: ['不含讲解', '含中文讲解', '含讲解器', '可加购讲解'] },
      { k: 'fast', t: '快速通道', type: 'sel', opts: ['无', '可加购', '已含'] },
      { k: 'refund', t: '退改规则', type: 'area', ph: '如 出票后不可退改；未使用可改期一次' },
      { k: 'notice', t: '入园须知', type: 'area', ph: '如 需携带护照原件，禁止携带大件行李' },
    ],
    filt: [{ k: 'need_book', t: '预约要求', opts: ['无需预约', '需要预约'] }],
    tags: ['免排队', '含讲解', '需实名', '旺季限流', '亲子友好'],
    attr: r => [['预约', r.ext.need_book], ['时长', r.ext.duration], ['讲解', r.ext.guide_service]],
  },

  car: {
    cn: '用车', en: 'Transfer', ic: 'car', pfx: 'CR',
    desc: '接送机、包车、日租、城际转运。定制团人数一变车型就得跟着变，按座位数建库，报价时按人数匹配。',
    levelT: '车型级别', levels: ['经济型', '舒适型', '豪华型', '商务型', '中巴', '大巴'],
    unitT: '用车服务', unitTip: '一种服务一行：如「接机（市区内）」「日租 8 小时 100 公里」，按次或按天计价。价格由供应商报价时给。',
    unitUnits: ['次', '天', '辆天', '小时', '公里'],
    unitDef: { unit: '次', cap: 4 },
    ext: [
      { k: 'service', t: '服务类型', type: 'sel', opts: ['接送机', '市内包车', '日租', '城际转运', '多日包车'] },
      { k: 'model', t: '品牌车型', type: 'txt', ph: '如 奔驰 V 级 / 丰田埃尔法' },
      { k: 'seats', t: '核载座位数', type: 'num', ph: '7' },
      { k: 'luggage', t: '行李位', type: 'num', ph: '5' },
      { k: 'car_age', t: '车龄要求', type: 'txt', ph: '如 5 年以内' },
      { k: 'include', t: '费用已含', type: 'chips', opts: ['含司机', '含油费', '含停车费', '含过路费', '含司机餐补', '含司机住宿', '中文司兼导', '含儿童座椅'] },
      { k: 'over_rule', t: '超时加价规则', type: 'txt', ph: '如 超出 8 小时后每小时加收 30 欧' },
      { k: 'routes', t: '常跑线路', type: 'area', ph: '如 巴黎戴高乐机场 ↔ 市区、巴黎 ↔ 凡尔赛' },
    ],
    filt: [{ k: 'service', t: '服务类型', opts: ['接送机', '市内包车', '日租', '城际转运', '多日包车'] }],
    tags: ['中文司机', '可接大件行李', '含儿童座椅', '新车', '可跨城'],
    attr: r => [['服务', r.ext.service], ['车型', r.ext.model], ['座位', r.ext.seats ? r.ext.seats + ' 座' : '']],
  },

  dining: {
    cn: '餐厅', en: 'Dining', ic: 'dish', pfx: 'DN',
    desc: '特色餐、米其林、包间团餐。高端定制里一顿好饭常常就是行程记忆点，这里管能接待、接待得了多少人的餐厅。',
    levelT: '餐厅档次', levels: ['米其林星级', '米其林餐盘', '当地人气餐厅', '高级中餐', '特色风味餐', '团队餐厅', '简餐快餐'],
    unitT: '餐标', unitTip: '一个餐标一行：如「团队午餐 六菜一汤」「主厨套餐」，按人或按桌计价。价格由供应商报价时给。',
    unitUnits: ['人', '桌', '团'],
    unitDef: { unit: '人', cap: 1 },
    ext: [
      { k: 'cuisine', t: '菜系', type: 'txt', ph: '如 法餐 / 地中海 / 中餐' },
      { k: 'per_person', t: '人均消费', type: 'num', ph: '380' },
      { k: 'room', t: '是否有包间', type: 'sel', opts: ['无包间', '有包间', '可整场包场'] },
      { k: 'max_pax', t: '最大接待人数', type: 'num', ph: '40' },
      { k: 'open_time', t: '营业时间', type: 'txt', ph: '如 11:30-14:30 / 18:00-22:00' },
      { k: 'need_book', t: '是否需预订', type: 'sel', opts: ['无需预订', '需要预订'] },
      { k: 'book_days', t: '需提前预订天数', type: 'num', ph: '3' },
      { k: 'special', t: '可做特殊餐', type: 'chips', opts: ['清真餐', '素食', '无麸质', '儿童餐', '可调整忌口', '生日布置'] },
    ],
    filt: [{ k: 'room', t: '包间', opts: ['无包间', '有包间', '可整场包场'] }],
    tags: ['米其林', '可包场', '含酒水', '景观位', '需提前预订'],
    attr: r => [['菜系', r.ext.cuisine], ['人均', r.ext.per_person ? '¥' + r.ext.per_person : ''], ['接待', r.ext.max_pax ? r.ext.max_pax + ' 人' : '']],
  },

  guide: {
    cn: '导游', en: 'Guide', ic: 'users', pfx: 'GD',
    desc: '地接导游、领队、司兼导、私人向导。定制团的口碑八成看带团的人，按语种和目的地建人才库，带证件有效期与带团评价。',
    levelT: '服务类型', levels: ['全程领队', '地接导游', '司兼导', '景点讲解', '私人管家', '摄影师兼向导'],
    unitT: '服务档', unitTip: '一种服务一行：如「全天中文导游 8 小时」「半天讲解」，按天或按次计价。价格由供应商报价时给。',
    unitUnits: ['天', '半天', '次', '小时'],
    unitDef: { unit: '天', cap: 20 },
    ext: [
      { k: 'langs', t: '服务语种', type: 'chips', opts: ['中文', '英语', '法语', '德语', '意大利语', '西班牙语', '日语', '韩语', '阿拉伯语', '俄语'] },
      { k: 'cert', t: '持证类型', type: 'txt', ph: '如 当地导游证 / 领队证' },
      { k: 'cert_to', t: '证件有效期至', type: 'date' },
      { k: 'exp_years', t: '从业年限', type: 'num', ph: '8' },
      { k: 'max_pax', t: '可带团人数', type: 'num', ph: '20' },
      { k: 'skill', t: '擅长方向', type: 'chips', opts: ['历史人文', '艺术博物馆', '亲子', '美食', '户外徒步', '滑雪', '摄影', '购物', '商务考察'] },
      { k: 'resume', t: '带团经历', type: 'area', ph: '如 常驻罗马 8 年，带过 200+ 高端定制团' },
    ],
    filt: [{ k: 'langs', t: '语种', opts: ['中文', '英语', '法语', '德语', '意大利语', '西班牙语', '日语'], multi: 1 }],
    tags: ['中文导游', '持证', '高端团经验', '可跨城', '带团评分高'],
    attr: r => [['语种', (r.ext.langs || []).join('、')], ['年限', r.ext.exp_years ? r.ext.exp_years + ' 年' : ''], ['带团', r.ext.max_pax ? '≤' + r.ext.max_pax + ' 人' : '']],
  },

  exp: {
    cn: '体验', en: 'Experience', ic: 'sparkle', pfx: 'EX',
    desc: '热气球、私人游艇、主厨晚宴、手作课这类特色项目，是定制游区别于标准团的核心卖点，单独成库便于快速组货。',
    levelT: '项目类别', levels: ['户外探险', '文化手作', '美食体验', '水上项目', '空中项目', '演出秀场', '亲子项目', '奢华私享'],
    unitT: '场次规格', unitTip: '一种规格一行：如「热气球日出场 1 小时」「私人游艇半日包船」，按人或按团计价。价格由供应商报价时给。',
    unitUnits: ['人', '团', '场', '艘次'],
    unitDef: { unit: '人', cap: 1 },
    ext: [
      { k: 'duration', t: '体验时长', type: 'txt', ph: '如 3 小时' },
      { k: 'min_pax', t: '最少成行人数', type: 'num', ph: '2' },
      { k: 'max_pax', t: '最多接待人数', type: 'num', ph: '12' },
      { k: 'season', t: '适用季节', type: 'txt', ph: '如 4-10 月，冬季停运' },
      { k: 'age_limit', t: '年龄限制', type: 'txt', ph: '如 6 岁以上，70 岁以下' },
      { k: 'need_book', t: '是否需预约', type: 'sel', opts: ['无需预约', '需要预约'] },
      { k: 'book_days', t: '需提前预约天数', type: 'num', ph: '14' },
      { k: 'include', t: '费用已含', type: 'area', ph: '如 含专业教练、装备、保险、酒店接送' },
      { k: 'exclude', t: '费用不含', type: 'area', ph: '如 不含个人消费与小费' },
      { k: 'safety', t: '安全提示', type: 'area', ph: '如 遇大风取消并全额退款' },
    ],
    filt: [{ k: 'need_book', t: '预约要求', opts: ['无需预约', '需要预约'] }],
    tags: ['网红打卡', '限量供应', '需提前预约', '看天气', '亲子适合', '高端私享'],
    attr: r => [['时长', r.ext.duration], ['成行', r.ext.min_pax ? '≥' + r.ext.min_pax + ' 人' : ''], ['季节', r.ext.season]],
  },

  other: {
    cn: '其他', en: 'Other', ic: 'box', pfx: 'OT',
    desc: '不归前六类、但报价里常出现的杂项：保险、翻译、随行摄影、快速通关、设备租赁、行前物料，统一挂这里，免得散在备注里算不清成本。',
    levelT: '资源类别', levels: ['旅游保险', '翻译服务', '随行摄影', '通关礼遇', '设备租赁', '行前物料', '签证服务', '其他'],
    unitT: '规格', unitTip: '一种规格一行：如「全程随行摄影 1 天」「境外 WiFi 每台每天」。价格由供应商报价时给。',
    unitUnits: ['人', '团', '天', '次', '台'],
    unitDef: { unit: '人', cap: 0 },
    ext: [
      { k: 'scope', t: '适用范围', type: 'txt', ph: '如 全欧洲通用 / 仅限日本' },
      { k: 'provider', t: '提供方', type: 'txt', ph: '如 安联保险 / 当地合作商' },
      { k: 'lead_days', t: '需提前天数', type: 'num', ph: '3' },
      { k: 'detail', t: '服务说明', type: 'area', ph: '写清这项服务具体做什么、交付物是什么' },
    ],
    filt: [],
    tags: ['常备项', '报价必选', '按人计费', '按团计费'],
    attr: r => [['类别', r.level], ['适用', r.ext.scope], ['提供方', r.ext.provider]],
  },
};

export const RESTYPES = Object.keys(RESCFG);
export const isRes = k => RESTYPES.includes(k);
