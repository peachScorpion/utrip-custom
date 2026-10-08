const db = require('./index');
const { plan, DEST, BANK } = require('../planner');
const J = o => JSON.stringify(o);
const pickImg = k => (BANK[k] || Object.values(BANK)[0])[0];
const img = (k, i = 0) => { const a = BANK[k] || Object.values(BANK)[0]; return a[i % a.length]; };

function clear() {
  ['channel','sales','supplier','product','home_config','template','rule','consult','plan','day','quote','feedback','log','chat','torder']
    .forEach(t => db.prepare(`DELETE FROM ${t}`).run());
}

function seedBase() {
  db.prepare('INSERT INTO channel VALUES (?,?,?,?)').run('C001', '优定制 · 望京旗舰店', '北京众信悠哉国际旅行社有限公司', '北京');
  const sales = [
    ['S001', '李晴', '13811177285', 'C001'],
    ['S002', '屈辰', '13811177286', 'C001'],
    ['S003', '万敏君', '13811177287', 'C001'],
  ];
  sales.forEach(s => db.prepare('INSERT INTO sales VALUES (?,?,?,?,?)').run(...s, ''));

  const sups = [
    ['V01', '欧睿地接 · 南欧中心', '欧睿', ['意大利','法国','西班牙','希腊'], 4.8, 126],
    ['V02', '北欧极光 DMC', '北欧极光', ['冰岛','挪威'], 4.9, 88],
    ['V03', '阿尔卑斯旅业', '阿尔卑斯', ['瑞士','法国','意大利'], 4.7, 152],
    ['V04', '不列颠深度游', '不列颠', ['英国'], 4.6, 74],
    ['V05', '和风（东瀛）', '和风', ['日本'], 4.8, 203],
    ['V06', '环球精选资源池', '环球精选', ['意大利','法国','西班牙','英国','日本','希腊','冰岛','瑞士'], 4.5, 311],
  ];
  sups.forEach(s => db.prepare('INSERT INTO supplier VALUES (?,?,?,?,?,?,?,1)')
    .run(s[0], s[1], s[2], J(s[3]), J(['C001']), s[4], s[5]));

  db.prepare('INSERT INTO rule VALUES (?,?,?,?,?,?)').run(
    'R001', 'C001', 'auto', 3,
    J(['国际机票', '境外医疗保险', '签证服务']),
    J(['V01','V02','V03','V04','V05','V06'])
  );

  const tpls = [
    ['T001', '高端深度定制 · 默认模板', 1, { cover:'封面用目的地代表性大景，压深色蒙层出标题', overview:'3–4 句讲清这条线的取舍与节奏，不堆形容词', daily:'每天 3–5 条，动词开头，写清在哪、做什么、多久', exp:'每天挑 1 个不可替代的体验，写出为什么只有这里有', hotel:'写清酒店定位与房型，附一句"为什么选它"', food:'每天 1–2 道当地菜，写出时令与做法' }, '平台默认，门店可在此基础上另存'],
    ['T002', '亲子家庭 · 节奏放缓', 0, { cover:'用有孩子出现的场景图', overview:'强调节奏、卫生、儿童友好', daily:'每天不超过 3 条，午后留白', exp:'优先可参与型体验', hotel:'家庭房/连通房优先', food:'标注儿童餐可选' }, ''],
    ['T003', '蜜月浪漫 · 双人私享', 0, { cover:'黄昏色调，画面里最多两个人', overview:'强调私密与仪式感', daily:'每天 3 条，安排 1 次日落场景', exp:'私人包船/包车/包场', hotel:'海景或城景套房，布置惊喜', food:'至少 2 顿米其林或景观餐厅' }, ''],
  ];
  tpls.forEach(t => db.prepare('INSERT INTO template (id,name,is_def,modules,note) VALUES (?,?,?,?,?)').run(t[0], t[1], t[2], J(t[3]), t[4]));
}


// 臻品团的产品详情内容：视频 / 特色景点 / 逐日行程 / 定制流程 / 背书
const GROUP_DETAIL = {
  G01: { video: 'https://uux-public.oss-cn-beijing.aliyuncs.com/travel/guide/video/蓝色清真寺2.mp4',
    spots: [['蓝色清真寺','伊斯坦布尔','六座宣礼塔与两万片蓝色伊兹尼克瓷砖'],
            ['卡帕多奇亚热气球','内夫谢希尔','日出前起飞，俯瞰仙人烟囱群'],
            ['棉花堡','代尼兹利','钙化梯田与古罗马温泉池叠在一起'],
            ['以弗所古城','塞尔丘克','保存最完整的古罗马城市之一']] },
  G02: { video: 'https://uux-public.oss-cn-beijing.aliyuncs.com/travel/guide/video/布拉格古城3.mp4',
    spots: [['布拉格城堡','布拉格','世界最大的古城堡建筑群'],
            ['哈尔施塔特','奥地利','湖光山色里的盐矿小镇'],
            ['渔人堡','布达佩斯','看多瑙河与国会大厦最好的位置'],
            ['CK 小镇','捷克','被伏尔塔瓦河环抱的中世纪古城']] },
  G03: { video: 'https://uux-public.oss-cn-beijing.aliyuncs.com/travel/guide/video/努斯峡湾2.mp4',
    spots: [['盖朗厄尔峡湾','挪威','联合国遗产，七姐妹瀑布从千米崖壁跌落'],
            ['杰古沙龙冰河湖','冰岛','浮冰漂进大西洋'],
            ['极光观测营地','冰岛南岸','远离路灯的农场旅馆'],
            ['精灵峡湾','冰岛','黑色沙滩与玄武岩柱']] },
  G04: { video: 'https://uux-public.oss-cn-beijing.aliyuncs.com/travel/guide/video/葡萄牙广场.mp4',
    spots: [['圣家堂','巴塞罗那','高迪未完成的一百年'],
            ['贝伦塔','里斯本','大航海时代的起点'],
            ['塞维利亚王宫','塞维利亚','权游多恩王国取景地'],
            ['辛特拉佩纳宫','辛特拉','彩色城堡立在山巅']] },
  G05: { video: 'https://uux-public.oss-cn-beijing.aliyuncs.com/travel/guide/video/安博塞利国家保护区.mp4',
    spots: [['马赛马拉','肯尼亚','大迁徙渡河，7–10 月最盛'],
            ['安博塞利','肯尼亚','以乞力马扎罗为背景的象群'],
            ['纳库鲁湖','肯尼亚','火烈鸟与白犀牛'],
            ['热气球早餐','马赛马拉','日出升空，降落后草原香槟早餐']] },
  G06: { video: 'https://uux-public.oss-cn-beijing.aliyuncs.com/travel/guide/pexels_video/pexels_video_5525673.mp4',
    spots: [['露易丝湖','班夫','冰川融水的蒂芙尼蓝'],
            ['哥伦比亚冰原','贾斯珀','雪车开上阿萨巴斯卡冰川'],
            ['梦莲湖','班夫','十峰环抱，旧版加币背面的景'],
            ['冰原大道','班夫–贾斯珀','全球最美公路之一，230 公里']] },
};
const PROCESS = [
  ['01', '提交定制需求', '在线填写需求表或联系专属顾问，明确出行时间、人数与预算'],
  ['02', '顾问定制方案', '1 个工作日内提供含真实资源与明细报价的定制行程'],
  ['03', '方案沟通调整', '可在行程页逐条批注修改意见，方案调整过程全程留痕'],
  ['04', '签约与支付', '线上签署电子旅游合同，支持定金与尾款分期支付'],
  ['05', '行前服务', '提供签证办理、保险投保、行前说明与专属行程手册'],
  ['06', '全程保障', '提供 7×24 小时中文应急支持，目的地配备专属联系人'],
];
const ENDORSE = [
  ['深交所上市', '众信旅游 002707'],
  ['成立于 1992 年', '30 余年出境游经验'],
  ['全球直采', '60+ 目的地一手资源'],
  ['7×24 应急', '全程中文支持'],
];

function seedProducts() {
  const P = [
    ['P01','冰岛环岛 · 追光者','极光、冰川、黑沙滩，一次走完北纬 64 度','冰岛','欧洲',9,32800,'冰岛极光',['极光','冰川','自然'],['极光酒店唤醒服务','蓝冰洞限定季','杰古沙龙冰河湖船'],'inspire'],
    ['P02','瑞士阿尔卑斯 · 雪山慢游','少女峰、马特洪峰，两座雪山与一条铁路','瑞士','欧洲',8,36800,'瑞士雪山小镇',['雪山','火车','亲子'],['少女峰齿轮火车头等舱','无车小镇采尔马特','日出金顶专属观景'],'inspire'],
    ['P03','意大利经典三城','罗马、佛罗伦萨、威尼斯，文艺复兴一条线','意大利','欧洲',10,29800,'意大利威尼斯',['艺术','美食','经典'],['梵蒂冈开门前入场','私人酒庄主人接待','私人贡多拉'],'inspire'],
    ['P04','法国 · 巴黎与南法','卢浮宫、凡尔赛、薰衣草与蔚蓝海岸','法国','欧洲',12,42800,'法国巴黎埃菲尔铁塔',['艺术','浪漫','蜜月'],['卢浮宫中文艺术顾问','凡尔赛早享通道','蔚蓝海岸敞篷车'],'inspire'],
    ['P05','西班牙 · 阳光与弗拉门戈','巴塞罗那、塞维利亚、马德里','西班牙','欧洲',10,26800,'西班牙巴塞罗那',['高迪','美食','人文'],['圣家堂开门前入场','弗拉门戈前排席','主厨市场采买课'],'inspire'],
    ['P06','英国 · 从伦敦到爱丁堡','西敏的钟声，走到皇家一英里','英国','欧洲',9,31800,'英国伦敦',['人文','城堡','学院'],['大英博物馆专家私导','学院在读生撑篙','单一麦芽品鉴课'],'inspire'],
    ['P07','日本 · 东京箱根京都','都市、温泉、古都，四季各有一套','日本','亚洲',7,23800,'日本京都',['温泉','亲子','四季'],['主厨面前 Omakase','客房私汤怀石','艺伎座敷体验'],'inspire'],
    ['P08','希腊 · 蓝白跳岛','雅典、圣托里尼、米克诺斯','希腊','欧洲',9,28800,'希腊圣托里尼',['海岛','蜜月','日落'],['卫城日落时段入场','私人帆船日落航行','悬崖泳池套房'],'inspire'],
  ];
  P.forEach((p, i) => {
    const d = DEST[Object.keys(DEST).find(k => DEST[k].name === p[3])] || DEST.italy;
    const outline = d.cities.slice(0, 4).map((c, ci) => ({ city: c.name, note: c.days[0].title.replace(/^抵达[^·]*·\s*/, '') }));
    const gal = (BANK[p[7]] || []).slice(0, 4);
    db.prepare(`INSERT INTO product (id,title,subtitle,dest,region,days,price_from,cover,gallery,tags,highlights,outline,theme,type,sort)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      p[0], p[1], p[2], p[3], p[4], p[5], p[6], pickImg(p[7]), J(gal), J(p[8]), J(p[9]), J(outline), d.tagline, 'inspire', 100 - i);
  });

  const G = [
    ['G01','【星月之国】土耳其 8 晚 9 天','纵览三海，穿越千年','土耳其','中东非',9,22800,'埃及金字塔',8,'09月30日'],
    ['G02','【东欧旧梦】奥地利+捷克+匈牙利 10 天','奥捷匈三国，探索东欧秘境','捷克','欧洲',10,22500,'捷克布拉格',20,'10月01日'],
    ['G03','【慢行北欧】冰岛+挪威 11 天','先赏秋色，再追极光','冰岛','欧洲',11,36900,'挪威峡湾',12,'10月15日'],
    ['G04','【南欧盛宴】西班牙+葡萄牙 12 天','伊比利亚半岛，阳光与海风','西班牙','欧洲',12,25900,'葡萄牙里斯本',16,'10月20日'],
    ['G05','【天河之渡】肯尼亚动物大迁徙 8 日','眺望乞力马扎罗','肯尼亚','中东非',8,33800,'肯尼亚野生动物',9,'11月06日'],
    ['G06','【落基秘境】加拿大西部 10 日','雪山、冰原、湖泊','加拿大','美洲',10,34500,'加拿大落基山',14,'11月12日'],
  ];
  G.forEach((g, i) => {
    const gal = (BANK[g[7]] || []).slice(0, 5);
    const det = GROUP_DETAIL[g[0]] || {};
    const d = DEST[Object.keys(DEST).find(k => DEST[k].name === g[3])];
    const itin = d ? plan({ dest: g[3], days: g[5], adults: 2, fromCity: '北京' }).days
      : Array.from({ length: g[5] }, (_, k) => ({
          d: k + 1, city: g[3], title: k === 0 ? '抵达' + g[3] : g[3] + ' · 第 ' + (k + 1) + ' 天',
          items: ['按当日行程安排游览', '全程专业中文陪同'], hotel: '全程特色酒店', meals: '早餐：酒店',
          exp: '品质纯玩不进店', food: '当地风味', pic: gal[k % Math.max(1, gal.length)] }));
    db.prepare(`INSERT INTO product (id,title,subtitle,dest,region,days,price_from,cover,gallery,tags,highlights,outline,theme,type,depart,sort,video,poster,spots,itinerary,process,endorse)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      g[0], g[1], g[2], g[3], g[4], g[5], g[6], pickImg(g[7]), J(gal),
      J(['臻品团', g[8] + ' 人成团', '品质纯玩', '特色酒店']),
      J(['品质纯玩不进店，不推自费', '全程 4–5 星特色酒店', '专业中文领队 + 当地向导', g[8] + ' 人小团，说走就走不等人']),
      J([]), '', 'smallgroup', J({ date: g[9], size: g[8], price: g[6] }), 100 - i,
      det.video || '', pickImg(g[7]),
      J((det.spots || []).map(x => ({ n: x[0], c: x[1], d: x[2] }))),
      J(itin.map(x => ({ ...x, items: Array.isArray(x.items) ? x.items : [] }))),
      J(PROCESS.map(x => ({ no: x[0], t: x[1], d: x[2] }))),
      J(ENDORSE.map(x => ({ t: x[0], d: x[1] }))));
  });
}

function seedHome() {
  const set = (k, v) => db.prepare('INSERT OR REPLACE INTO home_config (k,v) VALUES (?,?)').run(k, J(v));
  set('brand', { name: 'U-DESIGN 优定制', slogan: '您的旅行，由您定义', en: 'YOUR JOURNEY, YOUR RULES' });
  set('banners', [
    { title: '慢行北欧', sub: '一起先赏秋色，再追极光', img: img('冰岛极光', 1), link: 'dest:冰岛' },
    { title: '2026 欧洲深度游', sub: '沉浸式体验欧洲的古典与浪漫', img: img('意大利托斯卡纳', 0), link: 'dest:意大利' },
    { title: '阿尔卑斯的清晨', sub: '两座雪山，一条铁路', img: img('瑞士雪山小镇', 0), link: 'dest:瑞士' },
  ]);
  set('quick', [
    { icon: 'sparkle', label: 'AI 行程师', sub: '一分钟出方案', link: 'ai' },
    { icon: 'compass', label: '灵感之旅', sub: '顾问精选路线', link: 'inspire' },
    { icon: 'users', label: '臻品团', sub: '8–20 人精致团', link: 'group' },
    { icon: 'chat', label: '专属顾问', sub: '一对一定制', link: 'consult' },
  ]);
  set('themes', [
    { label: '亲子', key: 'family' }, { label: '蜜月', key: 'honeymoon' }, { label: '父母', key: 'elder' },
    { label: '团建', key: 'team' }, { label: '此生必去', key: 'must' },
  ]);
  set('regions', ['欧洲', '亚洲', '中东非', '美洲', '大洋洲', '海岛']);
  set('counter', { base: 763873, label: '人已咨询定制行程' });
  set('advisor', { name: '李晴', title: '首席定制顾问 · 从业 12 年', phone: '13811177285' });

  // 金刚位分类（2 排 × 5）
  // 首页模块编排（顺序 + 开关）——后台可视化配置的基础
  set('modules', [
    { k: 'search',  t: '搜索条',      on: 1, fixed: 1 },
    { k: 'cats',    t: '金刚位分类',   on: 1, fixed: 1 },
    { k: 'banner',  t: '运营轮播',     on: 1 },
    { k: 'entries', t: '三入口',       on: 1 },
    { k: 'ranking', t: '榜单与推荐',   on: 1 },
    { k: 'content', t: '内容瀑布流',   on: 1 },
    { k: 'footer',  t: '品牌页脚',     on: 1 },
  ]);
  set('cats', [
    { k: 'outbound', t: '出境游',  ic: 'map' },
    { k: 'domestic', t: '国内游',  ic: 'home' },
    { k: 'island',   t: '海岛',    ic: 'sun' },
    { k: 'family',   t: '亲子',    ic: 'users' },
    { k: 'parents',  t: '父母',    ic: 'heart' },
    { k: 'honeymoon',t: '蜜月',    ic: 'star' },
    { k: 'group',    t: '臻品团', ic: 'ticket' },
    { k: 'cruise',   t: '邮轮',    ic: 'compass' },
    { k: 'visafree', t: '免签',    ic: 'shield' },
    { k: 'must',     t: '此生必去', ic: 'sparkle' },
  ]);
  // 三入口
  set('entries', [
    { k: 'ai',    t: '问 AI',      s: '一分钟出行程', ic: 'sparkle' },
    { k: 'guide', t: '查攻略玩法',  s: '目的地怎么玩', ic: 'file' },
    { k: 'expert',t: '找定制师',    s: '一对一聊需求', ic: 'chat' },
  ]);
  // 内容型瀑布流（运营内容，非产品）
  set('ctabs', [
    { k: 'all',   t: '推荐' },
    { k: 'guide', t: '目的地攻略' },
    { k: 'play',  t: '玩法灵感' },
    { k: 'note',  t: '客人游记' },
    { k: 'ready', t: '行前指南' },
  ]);
  set('articles', [
    { id:'A1', tab:'note',  t:'冰岛追光 9 天，我们避开了所有旅行团', k:'客人游记', img: img('冰岛极光', 2), read:'2.4万', by:'定制顾问 李晴', dest:'冰岛',
      lead:'11 月的冰岛，团队车一多，极光就成了隔着人头拍的绿雾。我们把住宿全部换到环岛线的东南段，代价是多开两小时车，换来的是三个晚上只有我们一台车的观测点。',
      secs:[{h:'为什么把大团路线整个推翻',p:'常规 9 天环岛多以雷克雅未克为大本营，每天放射状出行，看着省事，实际每天在同一段路上来回。我们改成单向推进，住宿跟着行程走，每天净省 2–3 小时车程，这些时间全部留给了黄昏和夜里。'},{h:'极光不是碰运气，是选点',p:'向导会看云图和 KP 值，但真正决定成败的是光污染。我们提前锁了三处没有路灯的农场旅馆，其中一处的老板会在极光起来时挨个敲门——这件事写不进任何行程单，是顾问和他谈下来的。'},{h:'这趟花了多少',p:'2 大 1 小，9 天，人均 3.28 万，含四星以上住宿、专车专导、冰川徒步与蓝冰洞。机票另计。'}] },
    { id:'A2', tab:'guide', t:'瑞士少女峰头等舱，到底值不值这个价', k:'目的地攻略', img: img('少女峰', 1),  read:'1.8万', by:'定制顾问 屈辰', dest:'瑞士',
      lead:'齿轮火车头等舱比二等贵将近一倍。是否值得，取决于出行月份、发车时间，以及同行者中是否有长者与儿童。',
      secs:[{h:'旺季差的不是座位，是站着还是坐着',p:'7–8 月和圣诞新年这两段，二等舱常常满员，从因特拉肯到山顶将近两小时，站一路的体验会毁掉一整天。头等舱这时买的不是舒适，是确定性。'},{h:'淡季可以省',p:'4–5 月、10 月中下旬，二等舱空得很，视野也一样。这两段我们通常建议省下来，把钱加到山顶餐厅的靠窗位上。'},{h:'带老人一定升舱',p:'头等车厢离出站口更近，上下车不用挤，这一条比风景重要。'}] },
    { id:'A3', tab:'play',  t:'带 4 岁孩子去意大利，这 3 件事最重要', k:'玩法灵感', img: img('意大利威尼斯', 2), read:'3.1万', by:'定制顾问 万敏君', dest:'意大利',
      lead:'不是景点少一点就叫亲子行程。四岁孩子的一天，节奏、午睡和厕所，比乌菲兹的哪幅画更决定这趟旅行的成败。',
      secs:[{h:'一天只排一个「硬景点」',p:'上午梵蒂冈，下午就必须是公园或酒店泳池。硬塞两个博物馆，最后是大人孩子一起崩溃。'},{h:'住的位置比酒店星级重要',p:'我们优先选可以步行回酒店午睡的位置，哪怕降半个星级。中午能回去睡一小时，下午孩子才是好脾气。'},{h:'提前谈好「可以不去」',p:'行程单上标了三个可放弃项，临场孩子状态不好就跳过，不影响后面。这一条写进行程，家长才敢真的放弃。'}] },
    { id:'A4', tab:'ready', t:'普罗旺斯的薰衣草，几月去才是对的', k:'行前指南', img: img('法国普罗旺斯薰衣草', 1), read:'9678', by:'定制顾问 李晴', dest:'法国',
      lead:'网上说 6–8 月，太笼统。不同产区花期差两三周，来早了是绿的，来晚了已经收割。',
      secs:[{h:'瓦朗索勒高原：6 月下旬 – 7 月中',p:'最出片的一段，也是人最多的一段。想拍没有人的照片，只能日出前到。'},{h:'索村（Sault）：7 月中 – 8 月上旬',p:'海拔高，花期整体晚两周。七月底其它产区收完了，这里正好。'},{h:'收割这件事没有预告',p:'农场按天气决定哪天开割，谁也提前说不准。我们的做法是行程留一天弹性，到了当地由司机现场确认哪片还在。'}] },
    { id:'A5', tab:'play',  t:'圣托里尼日落，除了伊亚还有三个机位', k:'玩法灵感', img: img('希腊圣托里尼', 2), read:'1.2万', by:'定制顾问 屈辰', dest:'希腊',
      lead:'伊亚城堡的日落每天挤几千人，要提前两小时占位。其实岛上还有三个地方，日落一样好，人只有那儿的十分之一。',
      secs:[{h:'Imerovigli 的悬崖步道',p:'离费拉步行 25 分钟，正对火山口，视野比伊亚更开阔。'},{h:'Skaros Rock',p:'需要走一段土路，日落时几乎只有本地人。不适合老人和高跟鞋。'},{h:'包一条帆船',p:'最省事也最贵的方案：从海上看太阳落进火山口，船上吃晚饭，回程正好是星空。'}] },
    { id:'A6', tab:'ready', t:'京都住哪儿？町屋、旅馆和五星的取舍', k:'行前指南', img: img('日本京都', 1), read:'2.0万', by:'定制顾问 万敏君', dest:'日本',
      lead:'三种住法对应三种旅行方式，没有谁更好，只有合不合适。',
      secs:[{h:'町屋：最像住在京都',p:'一整栋独门独院，适合一家人。缺点是没有前台，行李要自己搬，夜里安静得能听见邻居。'},{h:'传统旅馆：为了那一顿怀石',p:'房价里一半是晚餐。第一次来建议住一晚体验，住三晚会腻。'},{h:'五星酒店：动线最省力',p:'带老人或行程紧的，优先选四条或京都站附近，每天省下来的通勤时间比什么都值。'}] },
    { id:'A7', tab:'guide', t:'从伦敦到爱丁堡，火车还是自驾', k:'目的地攻略', img: img('苏格兰爱丁堡城堡', 1), read:'7421', by:'定制顾问 李晴', dest:'英国',
      lead:'四个半小时的火车，还是两天的自驾，取决于是否要把沿途的湖区一并走完。',
      secs:[{h:'只想到达：火车',p:'伦敦国王十字直达爱丁堡，4 小时 20 分，头等舱含餐。市中心到市中心，不用管停车。'},{h:'想看湖区：自驾',p:'中途在温德米尔住一晚，第二天再北上。多花一天，多一个国家公园。'},{h:'别在爱丁堡市区开车',p:'老城单行道多、停车贵，我们通常安排在城外还车。'}] },
    { id:'A8', tab:'note',  t:'巴塞罗那的米其林，人均 800 就能吃到', k:'客人游记', img: img('西班牙巴塞罗那', 2), read:'1.5万', by:'定制顾问 屈辰', dest:'西班牙',
      lead:'米其林在西班牙的性价比，比法国和意大利都高。关键是吃午市套餐。',
      secs:[{h:'午市比晚市便宜一半',p:'同一家店、同一个厨房，午市 menu del dia 常常是晚市价格的 40–50%，菜品少两道而已。'},{h:'一星就够了',p:'二星三星的差别更多在服务和酒单。想吃菜本身，一星的厨房已经很能打。'},{h:'要提前多久订',p:'热门一星提前两周，三星提前两个月。我们通常在出发前 45 天就把餐厅一起订掉。'}] },
    { id:'A9', tab:'guide', t:'挪威峡湾：邮轮、火车与自驾的三种走法', k:'目的地攻略', img: img('挪威峡湾', 0), read:'1.1万', by:'定制顾问 屈辰', dest:'挪威',
      lead:'峡湾区没有一条“最优路线”，只有与出行天数、同行人构成相匹配的走法。以下为三种成熟方案的适用边界。',
      secs:[{h:'邮轮：适合 7 天以内、同行有长者',p:'海达路德沿岸航线一次覆盖多个峡湾口，行李只需整理一次，船上医疗与餐食均有保障，是长者同行时最稳妥的选择。'},{h:'火车：适合摄影与亲子',p:'卑尔根铁路与弗洛姆支线的车窗视野完整，无需驾驶，儿童可自由活动；缺点是班次固定，沿途停留时间不可调整。'},{h:'自驾：适合 10 天以上、追求自由度',p:'老鹰之路与精灵之路的观景台需自行掌握光线时间，建议预留两天弹性。冬季部分山路封闭，须以当季路况为准。'}] },
    { id:'A10', tab:'play', t:'撒哈拉一夜：营地等级与真实体验的差别', k:'玩法灵感', img: img('摩洛哥沙漠', 0), read:'1.4万', by:'定制顾问 万敏君', dest:'摩洛哥',
      lead:'沙漠营地按设施可分为三档，价差可达四倍。差别不在帐篷外观，而在供电、独立卫浴与营地所处的沙丘深度。',
      secs:[{h:'标准营地',p:'公共卫浴、柴油发电机定时供电，位于沙丘边缘，车程约 40 分钟。适合行程紧凑、以体验为主的客人。'},{h:'豪华营地',p:'帐内独立卫浴与恒温设备，位于沙丘深处，需换乘四驱车约 1.5 小时。星空观测条件明显优于边缘营地。'},{h:'包营方案',p:'整营独立使用，含私人厨师与柏柏尔乐队。适合家庭出行与纪念日行程，建议提前 30 天确认。'}] },
    { id:'A11', tab:'ready', t:'申根签证：材料清单与递签节奏', k:'行前指南', img: img('法国巴黎埃菲尔铁塔', 0), read:'2.7万', by:'定制顾问 李晴', dest:'法国',
      lead:'申根签证的审理周期随季节波动较大。以下为众信定制顾问在旺季与淡季分别采用的递签节奏。',
      secs:[{h:'材料准备',p:'在职证明、银行流水、机酒预订单与保险为四项核心材料。流水建议覆盖近六个月，余额与行程预算相匹配。'},{h:'递签时间',p:'旺季（6–8 月、春节）建议出发前 60 天预约，淡季 35 天即可。多国行程按停留时间最长的国家送签。'},{h:'常见退回原因',p:'行程单与机酒预订信息不一致、保险保额不足 3 万欧元为两项高频退回原因，我方在提交前会统一复核。'}] },
    { id:'A12', tab:'note', t:'肯尼亚动物大迁徙：一位客人的 8 天记录', k:'客人游记', img: img('肯尼亚野生动物', 0), read:'1.9万', by:'定制顾问 屈辰', dest:'肯尼亚',
      lead:'7 月底的马赛马拉，渡河并非每日可见。这趟行程将住宿全部安排在保护区内，以换取清晨与黄昏两个黄金观测时段。',
      secs:[{h:'住在区内与区外的差别',p:'区外营地每日往返需两小时以上，往往错过日出。区内营地可在开园前抵达河岸，这是能否拍到渡河的关键。'},{h:'车与向导',p:'全程使用敞篷越野车与持证向导，车内配备无线电，各车之间共享兽群位置，观测效率明显提高。'},{h:'费用构成',p:'2 人 8 天，人均 4.6 万元，含区内营地、专车专导、园区门票与国内段小飞机。'}] },
    { id:'A13', tab:'guide', t:'托斯卡纳酒庄：如何挑选值得住一晚的那一家', k:'目的地攻略', img: img('意大利托斯卡纳', 1), read:'1.3万', by:'定制顾问 万敏君', dest:'意大利',
      lead:'开放参观的酒庄超过两百家，可接待住宿的不足三成。筛选标准并非知名度，而是接待规模与品鉴形式。',
      secs:[{h:'优先选自有葡萄园的庄园',p:'自有园区的庄园通常可安排田间讲解与采收体验，外购葡萄的酒庄仅能提供品鉴环节。'},{h:'控制同场人数',p:'建议选择单场接待不超过 12 人的酒庄，酿酒师本人出面讲解的概率明显更高。'},{h:'住一晚的价值',p:'庄园住宿可参与晚间配餐品鉴，这一环节不对外开放，是与日间参观最主要的差别。'}] },
    { id:'A14', tab:'play', t:'落基山直升机冰川降落：天气窗口与备选方案', k:'玩法灵感', img: img('直升机观光', 0), read:'8932', by:'定制顾问 李晴', dest:'加拿大',
      lead:'冰川降落受云底高度限制，取消率在全年约为三成。行程设计时须同时准备地面备选。',
      secs:[{h:'时段选择',p:'上午 9–11 时气流最稳定，取消概率最低。下午班次虽价格较低，但返程受山谷风影响较大。'},{h:'备选安排',p:'我方通常将冰川雪车与峡谷徒步排在同一天下午，一旦飞行取消可即时切换，不影响整体行程。'},{h:'费用与退改',p:'因天气取消全额退款，须在出发前 24 小时完成人数与体重申报，逾期不予改期。'}] },
    { id:'A15', tab:'ready', t:'陪父母出远门：长线行程的节奏控制', k:'行前指南', img: img('老年夫妇旅行', 0), read:'3.4万', by:'定制顾问 万敏君', dest:'欧洲',
      lead:'长者同行的行程，决定体验的并非景点数量，而是每日步行距离、换酒店频次与用餐安排三项指标。',
      secs:[{h:'每日步行控制在 6 公里以内',p:'超过该距离，次日精力将明显下降。我方会在行程单中标注每日步行里程与台阶数量。'},{h:'减少换店',p:'12 天行程建议不超过四家酒店。每次换店的收拾与适应成本，对长者而言高于一个景点的收益。'},{h:'用餐与用药',p:'提前向餐厅报备饮食禁忌，行程单附带随行药品清单与当地药房位置，由领队统一保管备份。'}] },
    { id:'A16', tab:'note', t:'布拉格与维也纳：一次以音乐为线索的旅行', k:'客人游记', img: img('捷克布拉格', 0), read:'1.0万', by:'定制顾问 屈辰', dest:'捷克',
      lead:'这条线路以演出日程倒推行程：先锁定音乐会与歌剧票，再安排城市间的移动与住宿。',
      secs:[{h:'先定演出，再定行程',p:'国家歌剧院与金色大厅的热门场次需提前三个月出票，行程日期须服从票务日期，而非相反。'},{h:'着装与入场',p:'正式场次建议着正装，剧院设有寄存与更衣区域。我方在行前提供着装说明与入场时间建议。'},{h:'城市间移动',p:'布拉格至维也纳的城际列车约 4 小时，头等舱含餐，较飞行方案更省时，且可直达市中心车站。'}] },
  ]);

  // 热门目的地排行榜
  set('ranking', [
    { r:1, name:'冰岛',   hot:'9.8万人想去', trend:'up' },
    { r:2, name:'瑞士',   hot:'8.6万人想去', trend:'up' },
    { r:3, name:'日本',   hot:'7.9万人想去', trend:'flat' },
    { r:4, name:'意大利', hot:'6.4万人想去', trend:'up' },
    { r:5, name:'希腊',   hot:'5.2万人想去', trend:'down' },
  ]);

}

// —— 历史咨询单（让看板一进去就是活的）——
function seedConsults() {
  const rows = [
    ['DZ26091801','mini_ai','won','王学仁','13641015639','北京','日本 东京·箱根·京都','亚洲','2026-10-25',7,2,2,0,60000,'亲子',['family','food'],'S002','屈辰'],
    ['DZ26091802','mini_form','quoted','李女士','13910152675','北京','瑞士 少女峰·采尔马特','欧洲','2026-11-08',8,2,1,0,120000,'亲子',['family','nature'],'S001','李晴'],
    ['DZ26091903','csp_agent','quoting','张先生','13736099859','上海','法国 巴黎·南法','欧洲','2026-12-01',12,2,0,0,180000,'蜜月',['honeymoon','luxury'],'S001','李晴'],
    ['DZ26091904','mini_ai','confirmed','陈太太','13098572345','北京','意大利 罗马·佛罗伦萨·威尼斯','欧洲','2027-03-15',10,4,0,2,200000,'摄影',['photo','culture'],'S003','万敏君'],
    ['DZ26091905','mini_form','taken','刘先生','13465783036','广州','冰岛 环岛追光','欧洲','2026-11-20',9,2,0,0,90000,'摄影',['photo','nature'],'S002','屈辰'],
    ['DZ26092006','mini_ai','pending','微信用户','13621086890','北京','西班牙 巴塞罗那·塞维利亚','欧洲','2027-04-10',10,2,0,0,80000,'美食',['food','culture'],null,null],
    ['DZ26092007','mini_form','pending','赵女士','13501234567','北京','希腊 圣托里尼跳岛','欧洲','2027-05-01',9,2,0,0,110000,'蜜月',['honeymoon'],null,null],
    ['DZ26092008','csp_agent','lost','孙先生','13600001234','北京','英国 伦敦·爱丁堡','欧洲','2026-10-10',9,3,0,0,70000,'人文',['culture'],'S003','万敏君'],
    ['DZ26092009','mini_ai','won','周女士','13712345678','上海','冰岛 极光专线','欧洲','2026-12-20',8,2,0,2,150000,'摄影',['photo','luxury'],'S001','李晴'],
    ['DZ26092110','mini_form','taken','吴先生','13899990000','北京','日本 关西深度','亚洲','2027-01-15',6,2,1,0,55000,'亲子',['family'],'S002','屈辰'],
    ['DZ26092111','csp_manual','quoted','郑先生','13511112222','北京','意大利 托斯卡纳酒庄','欧洲','2027-06-01',8,6,0,0,260000,'美食',['food','luxury'],'S001','李晴'],
    ['DZ26092212','mini_ai','pending','微信用户','13755556666','成都','瑞士 阿尔卑斯','欧洲','2027-02-08',8,2,2,0,130000,'亲子',['family','nature'],null,null],
  ];
  const insC = db.prepare(`INSERT INTO consult (no,source,status,customer,phone,from_city,dest,region,go_date,days,adults,children,elders,budget,theme,prefs,sales_id,sales_name,channel_id,shop,quote,intent,share_token,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insP = db.prepare(`INSERT INTO plan (consult_no,ver,name,route,tagline,highlights,total,quote_note,cover,geo,is_cur,kind) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insD = db.prepare(`INSERT INTO day (plan_id,d,title,city,items,hotel,meals,pic,exp,food) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const insL = db.prepare(`INSERT INTO log (consult_no,who,act,detail,created_at) VALUES (?,?,?,?,?)`);
  const insQ = db.prepare(`INSERT INTO quote (consult_no,supplier_id,supplier_name,state,total,per_person,items,memo,quoted_at) VALUES (?,?,?,?,?,?,?,?,?)`);
  const insF = db.prepare(`INSERT INTO feedback (consult_no,round,d,target,text) VALUES (?,?,?,?,?)`);

  const ST_CN = { pending:'待接单', taken:'已接单', confirmed:'方案已确认', quoting:'供应商报价中', quoted:'供应商已报价', won:'已成交', lost:'已流失' };
  const dayAgo = n => { const d = new Date(Date.now() - n * 86400000); return d.toISOString().slice(0,10) + ' ' + ['09:12','10:38','14:05','16:41','20:19'][n % 5]; };

  rows.forEach((r, i) => {
    const [no, source, status, customer, phone, fromCity, dest, region, goDate, days, adults, children, elders, budget, theme, prefs, sid, sname] = r;
    const p = plan({ dest, days, adults, children, elders, prefs, fromCity });
    const token = 'sh' + Math.random().toString(36).slice(2, 10);
    insC.run(no, source, status, customer, phone, fromCity, dest, region, goDate, days, adults, children, elders,
      budget, theme, J(prefs), sid, sname, 'C001', '优定制 · 望京旗舰店', p.total, ['won','quoted'].includes(status) ? 'high' : (status==='lost'?'low':'mid'),
      token, dayAgo(rows.length - i));
    const pid = insP.run(no, 1, p.name, p.route, p.tagline, J(p.highlights), p.total, p.quoteNote, p.cover, J(p.geo), 1, 'ai').lastInsertRowid;
    p.days.forEach(d => insD.run(pid, d.d, d.title, d.city, J(d.items), d.hotel, d.meals, d.pic, d.exp, d.food));
    insL.run(no, '定制师', '生成行程', `${source.startsWith('mini') ? '小程序' : '门店端'}录入需求 · 已出 ${p.days.length} 天行程与报价`, dayAgo(rows.length - i));
    if (sname) insL.run(no, sname, '接单', '状态从「待接单」变为「已接单」', dayAgo(rows.length - i - 0.5 | 0));
    if (status !== 'pending') insL.run(no, sname || '系统', '状态流转', `当前状态：${ST_CN[status]}`, dayAgo(Math.max(0, rows.length - i - 1)));

    // 供应商报价
    if (['quoting','quoted','won'].includes(status)) {
      const vend = [['V01','欧睿地接 · 南欧中心'],['V03','阿尔卑斯旅业'],['V06','环球精选资源池']];
      db.prepare('UPDATE consult SET sup_state=?, sup_mode=?, sup_vendors=? WHERE no=?')
        .run(status === 'quoting' ? 'pending' : (status === 'won' ? 'won' : 'quoted'), 'auto', J(vend.map(v => v[0])), no);
      vend.forEach((v, vi) => {
        if (status === 'quoting' && vi > 0) { insQ.run(no, v[0], v[1], vi === 1 ? 'taken' : 'pending', null, null, null, null, null); return; }
        const t = Math.round(p.total * (0.66 + vi * 0.05));
        insQ.run(no, v[0], v[1], 'quoted', t, Math.round(t / Math.max(1, adults + children + elders)),
          J([{ n:'地接车导', v: Math.round(t*0.32) }, { n:'酒店', v: Math.round(t*0.41) }, { n:'门票与体验', v: Math.round(t*0.18) }, { n:'餐食', v: Math.round(t*0.09) }]),
          vi === 0 ? '可锁 4 星以上，10 月前定金 30%' : '资源充足，含全程中文导游', dayAgo(2));
      });
      if (status === 'won') {
        db.prepare('UPDATE consult SET sup_pick=?, sup_quote=?, order_no=? WHERE no=?')
          .run('V01', Math.round(p.total * 0.66), 'DD' + String(Date.now()).slice(-10), no);
        db.prepare("UPDATE quote SET state='won' WHERE consult_no=? AND supplier_id='V01'").run(no);
      }
    }
    // 客人反馈
    if (['confirmed','quoted','won'].includes(status)) {
      insF.run(no, 1, 2, '住宿', '第二晚这家酒店能不能换成带泳池的？孩子想游泳');
      insF.run(no, 1, 4, '行程', '这天节奏有点满，想留半天自由活动');
      if (status === 'won') insF.run(no, 2, 6, '餐食', '第二版很好，就按这个定');
      db.prepare("UPDATE consult SET last_seen_at=? WHERE no=?").run(dayAgo(1), no);
    }
  });
}


// 已成交的咨询单补订单，并让订单处在不同阶段，三端看板才有东西
function seedOrders() {
  const O_ST = ['created', 'deposit', 'paid', 'contracted', 'traveling', 'done'];
  const won = db.prepare("SELECT * FROM consult WHERE status='won'").all();
  won.forEach((c, i) => {
    const q = c.sup_pick ? db.prepare('SELECT * FROM quote WHERE consult_no=? AND supplier_id=?').get(c.no, c.sup_pick) : null;
    const st = O_ST[(i + 3) % O_ST.length];
    const amount = c.quote || c.budget || 0;
    const paid = st === 'created' ? 0 : st === 'deposit' ? Math.round(amount * 0.3) : amount;
    db.prepare(`INSERT OR REPLACE INTO torder (no,consult_no,customer,phone,dest,days,pax,go_date,channel_id,shop,sales_name,amount,cost,supplier_id,supplier_name,status,paid,contract_no)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      c.order_no || ('DD' + String(Date.now() + i).slice(-10)), c.no, c.customer, c.phone, c.dest, c.days,
      (c.adults || 0) + (c.children || 0) + (c.elders || 0), c.go_date, c.channel_id, c.shop, c.sales_name,
      amount, c.sup_quote || (q && q.total) || Math.round(amount * 0.68), c.sup_pick || 'V01',
      q ? q.supplier_name : '欧睿地接 · 南欧中心', st, paid,
      ['contracted', 'traveling', 'done'].includes(st) ? 'HT' + String(Date.now() + i).slice(-8) : null);
  });
  // 再补几张不同门店/销售的订单，让总部看板有量
  const extra = [
    ['王女士', '13800001111', '法国 巴黎·南法', 12, 2, '2026-12-01', 178000, 118000, 'V01', '欧睿地接 · 南欧中心', '李晴', 'traveling'],
    ['陈先生', '13800002222', '日本 关西深度', 6, 3, '2027-01-15', 62000, 41000, 'V05', '和风（东瀛）', '屈辰', 'done'],
    ['刘女士', '13800003333', '希腊 圣托里尼跳岛', 9, 2, '2027-05-01', 108000, 71000, 'V01', '欧睿地接 · 南欧中心', '万敏君', 'paid'],
    ['赵先生', '13800004444', '英国 伦敦·爱丁堡', 9, 4, '2027-03-20', 132000, 89000, 'V04', '不列颠深度游', '李晴', 'deposit'],
  ];
  extra.forEach((e, i) => {
    const no = 'DD' + String(Date.now() + 100 + i).slice(-10);
    const paid = e[11] === 'deposit' ? Math.round(e[6] * 0.3) : e[11] === 'created' ? 0 : e[6];
    db.prepare(`INSERT INTO torder (no,consult_no,customer,phone,dest,days,pax,go_date,channel_id,shop,sales_name,amount,cost,supplier_id,supplier_name,status,paid,contract_no)
      VALUES (?,?,?,?,?,?,?,?,'C001','优定制 · 望京旗舰店',?,?,?,?,?,?,?,?)`).run(
      no, null, e[0], e[1], e[2], e[3], e[4], e[5], e[10], e[6], e[7], e[8], e[9], e[11], paid,
      ['contracted', 'traveling', 'done'].includes(e[11]) ? 'HT' + String(Date.now() + 200 + i).slice(-8) : null);
  });
}

['traveler','orderlog','payment','fee'].forEach(t => { try { db.prepare('DELETE FROM ' + t).run(); } catch (e) {} });
clear();
seedBase();
seedProducts();
seedHome();
seedConsults();
seedOrders();
const n = t => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
require('./seed_zx.js');            // 众信产品库镜像
require('./seed_prod_biz.js');      // 产品经营字段（价格信息 / 团期）
require('./seed_extra.js')();       // 产品补充说明（费用包含/不含、出行人要求、退改约定）
require('./seed_pcode.js')();       // 产品编号 D+6 位与创建/操作留痕
require('./seed_bind_zx.js');       // 绑定众信产品编码
require('./seed_order_detail.js');   // 订单明细：出行人 / 流水 / 日志 / 费用
require('./seed_res.js');           // 资源确认明细
require('./seed_content.js');       // 内容埋点 / 收藏 / 内容来源咨询
console.log('✓ seed 完成：产品', n('product'), '咨询单', n('consult'), '订单', n('torder'), '方案', n('plan'), '逐日', n('day'), '报价', n('quote'), '反馈', n('feedback'), '日志', n('log'));
