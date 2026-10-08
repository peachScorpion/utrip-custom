// AI 行程师 —— 纯代码编排（不调模型：汇报现场要可复现、不会胡说）
const DEST = require('./db/destinations');
const COORDS = require('./db/coords');
const BANK = require('./db/imgbank.json');


// 素材用完时的「延展日」——按城市差异化，避免重复行程
const FILLER = [
  { t: c => `${c} · 自由漫步与私人订制`, items: c => [`上午自由活动，管家可代订当地体验`, `下午 ${c} 城区深度漫步（专属中文向导）`, `晚间自选：米其林餐厅 / 剧场 / 夜游`], exp: '半日自由 + 管家随时待命', food: '主厨推荐时令菜单' },
  { t: c => `${c} 周边 · 小众一日`, items: c => [`前往 ${c} 周边小众村镇，避开团队路线`, `当地手作工坊体验（限 6 人以内）`, `返程途中观景点停留拍摄`], exp: '小众村镇 + 手作工坊', food: '农庄午餐（食材当日采）' },
  { t: c => `${c} · 慢下来的一天`, items: c => [`睡到自然醒，酒店早午餐`, `SPA / 温泉 / 泳池半日`, `黄昏观景台看日落`], exp: '酒店 SPA 半日', food: '轻食与气泡酒' },
];

const pick = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length];
function imgs(keys) {
  const out = [];
  (keys || []).forEach(k => (BANK[k] || []).forEach(u => out.push(u)));
  return out.length ? out : Object.values(BANK)[0];
}
function matchDest(text) {
  const t = String(text || '');
  for (const [k, v] of Object.entries(DEST)) {
    if (t.includes(v.name) || t.toLowerCase().includes(k)) return [k, v];
    if (v.cities.some(c => t.includes(c.name))) return [k, v];
  }
  return ['italy', DEST.italy];
}
const PREF_LABEL = {
  family: '亲子友好', nature: '自然风光', hidden: '小众秘境',
  leisure: '休闲度假', food: '美食探店', culture: '人文古迹',
  honeymoon: '蜜月浪漫', photo: '摄影出片', luxury: '高端奢享',
};

function plan(req) {
  const days = Math.max(3, Math.min(21, parseInt(req.days) || 8));
  const adults = parseInt(req.adults) || 2, children = parseInt(req.children) || 0, elders = parseInt(req.elders) || 0;
  const pax = Math.max(1, adults + children + elders);
  const [key, D] = matchDest(req.dest);
  const variant = parseInt(req.variant) || 0;

  // 城市链：按天数决定走几城；B 版换序（避开 A 版走法）
  let cities = D.cities.slice();
  const nCity = Math.max(1, Math.min(cities.length, Math.max(1, Math.floor(days / 2))));
  cities = cities.slice(0, nCity);
  if (variant === 1 && cities.length > 1) cities = [cities[0], ...cities.slice(1).reverse()];

  // 天数分配：首城多一天（落地缓冲），其余平均
  const cap = cities.map(c => c.days.length + 3);
  const per = Array(cities.length).fill(0);
  let rest = days;
  // 先按素材数铺满（每城先给到素材天数），再把剩余天数轮流补成延展日
  for (let i = 0; i < cities.length && rest > 0; i++) {
    const give = Math.min(cities[i].days.length, rest); per[i] = give; rest -= give;
  }
  for (let i = 0; rest > 0; i = (i + 1) % cities.length) {
    if (per[i] < cap[i]) { per[i]++; rest--; } else if (per.every((v, j) => v >= cap[j])) { per[0] += rest; rest = 0; }
  }

  const gallery = imgs(D.img);
  const out = [], geoLegs = [];
  let dn = 0, gi = 0;
  cities.forEach((c, ci) => {
    for (let k = 0; k < per[ci]; k++) {
      dn++;
      let src, title, items, hotel, meals, exp, food;
      const idx = variant ? (c.days.length - 1 - k + c.days.length) % c.days.length : k;
      if (k < c.days.length) {
        src = c.days[idx];
        title = dn === 1 ? src.title : src.title.replace(/^抵达[^·]*·\s*/, '');
        items = src.items.slice(); hotel = src.hotel; meals = src.meals; exp = src.exp; food = src.food;
      } else {
        const f = FILLER[(k - c.days.length) % FILLER.length];
        const anchor = c.days[c.days.length - 1];
        title = f.t(c.name); items = f.items(c.name);
        hotel = anchor.hotel; meals = '早餐：酒店 / 午晚餐：自选'; exp = f.exp; food = f.food;
      }
      /* 参考车程：跨城那天给一个估算，定制客人最在意每天要坐多久车。
         坐标是自绘地图那份，直线距离 ×1.25 估公路里程，按 75km/h 折算时间。 */
      const prev = out[out.length - 1];
      let drive = null;
      if (prev && prev.city && prev.city !== c.name) {
        const a = COORDS[prev.city], b2 = COORDS[c.name];
        if (a && b2) {
          const dx = (a[0] - b2[0]) * 85, dy = (a[1] - b2[1]) * 111;
          const km = Math.round(Math.sqrt(dx * dx + dy * dy) * 1.25 / 10) * 10;
          if (km >= 30) {
            const hr = Math.round((km / 75) * 2) / 2;
            drive = `${prev.city} → ${c.name}，约 ${km} 公里 / ${hr} 小时`;
          }
        }
      }
      out.push({ d: dn, city: c.name, title, items, hotel, meals, exp, food, drive, pic: gallery[gi++ % gallery.length] });
      geoLegs.push(ci);
    }
  });

  // 偏好加料
  const prefs = Array.isArray(req.prefs) ? req.prefs : String(req.prefs || '').split(',').filter(Boolean);
  if (prefs.includes('family') && out[1]) out[1].items.push('全程安排儿童座椅与亲子向导');
  if (prefs.includes('food') && out[0]) out[0].items.push('本地主厨带逛市集（含食材采买）');
  if (prefs.includes('photo')) out.forEach((x, i) => i % 3 === 1 && x.items.push('随行跟拍摄影师 2 小时'));
  if (elders > 0 && out[0]) out[0].items.push('全程缓步节奏，每日步行不超过 6 千步');
  const must = String(req.mustSee || '').split(/[,，、\s]+/).filter(Boolean);
  must.forEach((m, i) => { const t = out[i % out.length]; if (t && !t.items.join().includes(m)) t.items.push(`必玩加入：${m}`); });

  // 报价：基准人均日价 × 天数 × 人数系数 × 偏好系数
  let per1 = D.base * days;
  if (prefs.includes('luxury') || prefs.includes('honeymoon')) per1 *= 1.25;
  if (prefs.includes('leisure')) per1 *= 0.95;
  if (children > 0) per1 *= 0.97;
  per1 = Math.round(per1 / 100) * 100;
  const total = per1 * adults + Math.round(per1 * 0.75) * children + per1 * elders;

  const route = cities.map(c => c.name).join(' → ');
  const highlights = [];
  out.forEach(x => { if (x.exp && !highlights.includes(x.exp)) highlights.push(x.exp); });
  prefs.forEach(p => PREF_LABEL[p] && highlights.push(PREF_LABEL[p]));

  return {
    destKey: key, destName: D.name, region: D.region,
    name: variant === 1 ? '方案B · 逆序慢游' : '方案A · 经典深度',
    route, tagline: D.tagline,
    highlights: highlights.slice(0, 6),
    total, perPerson: per1, quoteNote: `含${pax}人 · ${days}天 · 四星以上酒店 · 专车专导`,
    cover: gallery[0], days: out,
    geo: geo(cities.map(c => c.name), req.fromCity || '北京', geoLegs),
  };
}

function geo(cityNames, fromCity, legs) {
  const names = [fromCity, ...cityNames];
  const points = names.map(n => ({ name: n, lon: (COORDS[n] || [0, 0])[0], lat: (COORDS[n] || [0, 0])[1] }));
  return { points, legs };
}

module.exports = { plan, matchDest, DEST, BANK, imgs };
