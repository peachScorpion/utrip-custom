/* 众信产品库镜像种子：字段与总部产品中心（search_products / get_product_info）对齐。
   线上接入时把 pullFromZx() 换成真实接口即可，字段映射不用改。 */
const db = require('./index.js');
const { BANK, DEST } = require('../planner');
const img = (k, i = 0) => { const a = BANK[k] || []; return a[i % (a.length || 1)] || ''; };

const P = [
  { code: 'U386322', title: '【臻选小团】日本本州 东京·箱根·京都 7 天 6 晚', sub: '8 人成团 · 温泉会席 · 全程无购物',
    tt: '境外游', pt: '跟团游', gm: '保证成团', country: '日本', city: '东京', region: '亚洲',
    from: '北京', days: 7, nights: 6, sup: '和风（东瀛）', supc: 'V05', brand: '优耐德',
    settle: 7854, retail: 11900, child: 9800, single: 2600, size: 8,
    themes: ['温泉', '亲子', '美食'], tags: ['无购物', '专业中文导游', '含往返机票'],
    hl: ['富士山五合目 + 忍野八海一日', '箱根温泉旅馆一泊二食', '京都清水寺和服体验', '全程四星以上 + 一晚温泉旅馆'],
    imgk: '日本京都' },
  { code: 'U386415', title: '【极光专线】冰岛环岛 8 天 7 晚 追光之旅', sub: '10 人小团 · 蓝冰洞 · 三晚极光观测点住宿',
    tt: '境外游', pt: '半自助', gm: '保证成团', country: '冰岛', city: '雷克雅未克', region: '欧洲',
    from: '北京', days: 8, nights: 7, sup: '北欧极光 DMC', supc: 'V02', brand: '优耐德',
    settle: 19800, retail: 28600, child: 25800, single: 6800, size: 10,
    themes: ['极光', '摄影', '自然风光'], tags: ['含蓝冰洞', '极光守候', '四驱专车'],
    hl: ['杰古沙龙冰河湖 + 钻石沙滩', '瓦特纳冰川蓝冰洞探秘', '黑沙滩与塞里雅兰瀑布', '三晚住在无光污染观测点'],
    imgk: '冰岛极光' },
  { code: 'U387120', title: '【瑞士深度】少女峰·采尔马特·卢塞恩 9 天 7 晚', sub: '齿轮火车头等舱 · 雪山四日',
    tt: '境外游', pt: '跟团游', gm: '保证成团', country: '瑞士', city: '因特拉肯', region: '欧洲',
    from: '上海', days: 9, nights: 7, sup: '阿尔卑斯旅业', supc: 'V03', brand: '竹园',
    settle: 16400, retail: 23800, child: 21600, single: 5200, size: 12,
    themes: ['雪山', '火车', '蜜月'], tags: ['头等舱观景火车', '含瑞士通票', '四星酒店'],
    hl: ['少女峰欧洲之巅', '马特洪峰冰川天堂', '黄金列车观景段', '卢塞恩湖游船'],
    imgk: '少女峰' },
  { code: 'U387566', title: '【星月之国】土耳其 8 晚 9 天 深度全景', sub: '热气球 · 洞穴酒店 · 爱琴海',
    tt: '境外游', pt: '跟团游', gm: '满人成团', country: '土耳其', city: '伊斯坦布尔', region: '中东非',
    from: '北京', days: 9, nights: 8, sup: '环球精选资源池', supc: 'V06', brand: '优耐德',
    settle: 9860, retail: 14800, child: 13200, single: 3200, size: 16,
    themes: ['热气球', '人文古迹', '摄影'], tags: ['洞穴酒店两晚', '含热气球', '一价全含'],
    hl: ['卡帕多奇亚热气球', '棉花堡温泉台地', '以弗所古城', '博斯普鲁斯海峡游船'],
    imgk: '摩洛哥马拉喀什' },
  { code: 'U388003', title: '【意式浪漫】意大利 罗马·佛罗伦萨·威尼斯 10 天 8 晚', sub: '一价全含 · 酒庄午宴',
    tt: '境外游', pt: '跟团游', gm: '保证成团', country: '意大利', city: '罗马', region: '欧洲',
    from: '北京', days: 10, nights: 8, sup: '欧睿地接 · 南欧中心', supc: 'V01', brand: '竹园',
    settle: 13200, retail: 19600, child: 17800, single: 4200, size: 14,
    themes: ['人文古迹', '美食', '酒庄'], tags: ['托斯卡纳酒庄', '含贡多拉', '四星以上'],
    hl: ['梵蒂冈博物馆免排队', '佛罗伦萨乌菲兹美术馆', '威尼斯贡多拉游船', '托斯卡纳酒庄午宴'],
    imgk: '意大利威尼斯' },
  { code: 'U388274', title: '【希腊海岛】雅典·圣托里尼·米克诺斯 9 天 7 晚', sub: '悬崖酒店两晚 · 跳岛专线',
    tt: '境外游', pt: '半自助', gm: '保证成团', country: '希腊', city: '圣托里尼', region: '欧洲',
    from: '上海', days: 9, nights: 7, sup: '欧睿地接 · 南欧中心', supc: 'V01', brand: '奇迹',
    settle: 15600, retail: 22800, child: 20600, single: 5600, size: 10,
    themes: ['海岛', '蜜月', '摄影'], tags: ['悬崖酒店', '含跳岛船票', '日落帆船'],
    hl: ['伊亚日落与帆船晚宴', '雅典卫城深度讲解', '米克诺斯风车小镇', '爱琴海悬崖酒店两晚'],
    imgk: '希腊圣托里尼' },
  { code: 'U388591', title: '【英伦全景】伦敦·湖区·爱丁堡 9 天 7 晚', sub: '城际火车头等舱 · 苏格兰高地',
    tt: '境外游', pt: '跟团游', gm: '满人成团', country: '英国', city: '伦敦', region: '欧洲',
    from: '北京', days: 9, nights: 7, sup: '不列颠深度游', supc: 'V04', brand: '竹园',
    settle: 14800, retail: 21600, child: 19400, single: 4800, size: 14,
    themes: ['人文古迹', '自然风光'], tags: ['火车头等舱', '含大英博物馆讲解'],
    hl: ['大英博物馆中文讲解', '温德米尔湖区住一晚', '爱丁堡城堡与皇家英里', '苏格兰高地一日'],
    imgk: '英国伦敦' },
  { code: 'U389040', title: '【法式风情】巴黎·普罗旺斯·尼斯 12 天 10 晚', sub: '薰衣草花期专线 · 蔚蓝海岸',
    tt: '境外游', pt: '跟团游', gm: '保证成团', country: '法国', city: '巴黎', region: '欧洲',
    from: '北京', days: 12, nights: 10, sup: '欧睿地接 · 南欧中心', supc: 'V01', brand: '奇迹',
    settle: 17600, retail: 25800, child: 23200, single: 6200, size: 12,
    themes: ['花期', '蜜月', '美食'], tags: ['薰衣草花期', '含卢浮宫讲解', '蔚蓝海岸'],
    hl: ['瓦朗索勒薰衣草高原', '卢浮宫免排队中文讲解', '尼斯与埃兹小镇', '普罗旺斯集市'],
    imgk: '法国普罗旺斯薰衣草' },
  { code: 'U389318', title: '【国内精选】西北大环线 青海湖·茶卡·敦煌 8 天 7 晚', sub: '越野专车 · 沿途不进店',
    tt: '境内游', pt: '私家团', gm: '保证成团', country: '中国', city: '西宁', region: '国内',
    from: '北京', days: 8, nights: 7, sup: '环球精选资源池', supc: 'V06', brand: '优耐德',
    settle: 4980, retail: 7680, child: 6800, single: 1800, size: 6,
    themes: ['自驾', '自然风光', '摄影'], tags: ['4 人成团', '越野专车', '不进店'],
    hl: ['青海湖二郎剑环湖', '茶卡盐湖天空之镜', '莫高窟数字展 + 实体窟', '鸣沙山月牙泉日落'],
    imgk: '冰岛冰川湖' },
  { code: 'U389702', title: '【北欧四国】挪威峡湾·斯德哥尔摩·哥本哈根 11 天 9 晚', sub: '海达路德沿岸航线一段',
    tt: '境外游', pt: '跟团游', gm: '满人成团', country: '挪威', city: '卑尔根', region: '欧洲',
    from: '北京', days: 11, nights: 9, sup: '北欧极光 DMC', supc: 'V02', brand: '竹园',
    settle: 18900, retail: 27600, child: 24800, single: 6400, size: 16,
    themes: ['峡湾', '邮轮', '自然风光'], tags: ['含峡湾游船', '弗洛姆高山铁路'],
    hl: ['松恩峡湾游船', '弗洛姆高山铁路', '老鹰之路与精灵之路', '哥本哈根新港漫步'],
    imgk: '挪威峡湾' },
];

const J = v => JSON.stringify(v);
function cals(base, days) {
  const out = [];
  const d0 = new Date();
  for (let i = 1; i <= 6; i++) {
    const d = new Date(d0.getTime() + (i * 21 + 30) * 864e5);
    out.push({
      date: d.toISOString().slice(0, 10),
      price: base + (i % 3) * 600,
      stock: 4 + (i * 3) % 12,
    });
  }
  return out;
}
function run() {
  const st = db.prepare(`INSERT OR REPLACE INTO zx_product
    (code,title,sub,travel_type,product_type,group_mode,dest_country,dest_city,region,depart_city,
     days,nights,supplier,supplier_code,brand,settle_price,retail_price,child_price,single_room,
     group_size,cals,themes,tags,highlights,itinerary,cover,gallery)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  P.forEach(x => {
    const itin = [];
    for (let d = 1; d <= x.days; d++) {
      itin.push({
        d, title: d === 1 ? `${x.from} ✈ ${x.city}` : d === x.days ? `${x.city} ✈ ${x.from}` : `${x.city} 深度游览`,
        city: d === 1 ? x.from : x.city,
        items: d === 1 ? ['集合出发，搭乘国际航班', '抵达后专车接机，入住酒店']
          : d === x.days ? ['酒店早餐后送机', '返回温暖的家']
          : [x.hl[(d - 2) % x.hl.length], '午餐后自由活动或延伸游览'],
        hotel: d === x.days ? '—' : '当地四星或同级',
        meals: d === 1 ? '晚餐' : d === x.days ? '早餐' : '早餐 · 午餐',
      });
    }
    st.run(x.code, x.title, x.sub, x.tt, x.pt, x.gm, x.country, x.city, x.region, x.from,
      x.days, x.nights, x.sup, x.supc, x.brand, x.settle, x.retail, x.child, x.single,
      x.size, J(cals(x.retail, x.days)), J(x.themes), J(x.tags), J(x.hl), J(itin),
      img(x.imgk, 0), J([img(x.imgk, 0), img(x.imgk, 1), img(x.imgk, 2)].filter(Boolean)));
  });
  console.log('✓ 众信产品库镜像：', P.length, '条');
}
run();
