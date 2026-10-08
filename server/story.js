/* ============ 旅途故事 ============
   一次出行（一张订单）一个故事。客人在路上传照片视频，回来一键生成按天的图文故事，
   可以分享，也可以推到数字相框。

   素材归日：优先用照片自带的拍摄时间与出发日相减；取不到拍摄时间就落到「待归类」，
   客人可以手动挪。这样即使客人关了定位、或用相册里的旧图，也不会错乱。

   上传走分片：手机拍的视频动辄上百 MB，一个请求塞不下（网关也拦），
   前端切片逐个 POST，后端按 uploadId 拼回去。 */
const db = require('./db');
const fs = require('fs');
const path = require('path');
const { writeStory, templateStory } = require('./story_ai.js');

const J = o => JSON.stringify(o == null ? null : o);
const P = (s, d) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch { return d; } };
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const UP = path.join(__dirname, '..', 'web', 'public', 'uploads', 'story');
const TMP = path.join(__dirname, '..', 'web', 'public', 'uploads', '.part');
fs.mkdirSync(UP, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const token = () => 'st' + Math.random().toString(36).slice(2, 10);
const sid = no => 'ST' + String(no || '').replace(/\D/g, '').slice(-8);

/* 故事绑在订单上：订单里有出发日、天数、目的地，行程方案挂在对应的咨询单上 */
function ensureStory(orderNo, phone) {
  const o = db.prepare('SELECT * FROM torder WHERE no=?').get(orderNo);
  if (!o) return null;
  if (phone && o.phone && o.phone !== phone) return null;      // 只能看自己的单
  const id = sid(orderNo);
  let s = db.prepare('SELECT * FROM story WHERE id=?').get(id);
  if (!s) {
    db.prepare(`INSERT INTO story (id,order_no,consult_no,phone,dest,days,go_date,title,share_token)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(id, orderNo, o.consult_no || '', o.phone || phone || '',
      o.dest || '', o.days || 0, o.go_date || '', '', token());
    s = db.prepare('SELECT * FROM story WHERE id=?').get(id);
  }
  return s;
}

/* 行程的逐日安排：故事按它排版，也是喂给模型的事实来源 */
function planDays(consultNo) {
  if (!consultNo) return [];
  const p = db.prepare('SELECT * FROM plan WHERE consult_no=? AND is_cur=1').get(consultNo)
    || db.prepare('SELECT * FROM plan WHERE consult_no=? ORDER BY ver DESC LIMIT 1').get(consultNo);
  if (!p) return [];
  return db.prepare('SELECT * FROM day WHERE plan_id=? ORDER BY d').all(p.id)
    .map(d => ({ ...d, items: P(d.items, []) }));
}
function curPlan(consultNo) {
  if (!consultNo) return null;
  const p = db.prepare('SELECT * FROM plan WHERE consult_no=? AND is_cur=1').get(consultNo)
    || db.prepare('SELECT * FROM plan WHERE consult_no=? ORDER BY ver DESC LIMIT 1').get(consultNo);
  return p ? { ...p, highlights: P(p.highlights, []) } : null;
}

const mediaOf = id => db.prepare('SELECT * FROM story_media WHERE story_id=? ORDER BY day, sort, id').all(id);

function shape(s, { withMedia = true } = {}) {
  if (!s) return null;
  const o = db.prepare('SELECT customer,trip_state,status,sales_name,shop FROM torder WHERE no=?').get(s.order_no) || {};
  const media = withMedia ? mediaOf(s.id) : [];
  const texts = db.prepare('SELECT * FROM story_day WHERE story_id=? ORDER BY d').all(s.id);
  /* 排版骨架优先用行程方案的逐日安排；老订单没关联咨询单（没有方案）时，
     退回按已写过的故事段落、再退回按天数造空架子——不能因为没方案就让故事显示成 0 天。 */
  let dys = planDays(s.consult_no);
  if (!dys.length) {
    const n = Math.max(texts.length, +s.days || 0, [...new Set(media.map(m => m.day))].filter(Boolean).length);
    dys = [...Array(n)].map((_, i) => {
      const t = texts.find(x => x.d === i + 1) || {};
      return { d: i + 1, city: t.city || '', title: '', items: [], hotel: '', meals: '', exp: '', food: '', pic: '' };
    });
  }
  return {
    ...s,
    nDays: s.days,            // s.days 是天数；下面的 days 是逐日数组，别混
    customer: o.customer || '', trip_state: o.trip_state || '', sales_name: o.sales_name || '', shop: o.shop || '',
    media, nPhoto: media.filter(m => m.kind === 'photo').length,
    nVideo: media.filter(m => m.kind === 'video').length,
    unsorted: media.filter(m => !m.day).length,
    plan: curPlan(s.consult_no),
    days: dys.map(d => {
      const t = texts.find(x => x.d === d.d) || {};
      return { d: d.d, city: d.city, planTitle: d.title, items: d.items, hotel: d.hotel, meals: d.meals,
        exp: d.exp, food: d.food, pic: d.pic,
        title: t.title || '', text: t.text || '', note: t.note || '',
        media: media.filter(m => m.day === d.d) };
    }),
  };
}

/* 拍摄时间 → 第几天：出发日当天算第 1 天 */
function dayOf(shotAt, goDate, maxDays) {
  if (!shotAt || !goDate) return 0;
  const a = new Date(String(goDate).slice(0, 10) + 'T00:00:00');
  const b = new Date(String(shotAt).replace(' ', 'T'));
  if (isNaN(a) || isNaN(b)) return 0;
  const d = Math.floor((b - a) / 864e5) + 1;
  return d >= 1 && d <= (maxDays || 99) ? d : 0;
}

module.exports = function mount(app) {
  /* ---- 客人端 ---- */
  /* 我的 → 旅途故事：按出行状态排，出行中的排最前 */
  app.get('/api/mini/stories', (req, res) => {
    const phone = req.query.phone;
    if (!phone) return res.json([]);
    const orders = db.prepare(`SELECT * FROM torder WHERE phone=? ORDER BY go_date DESC`).all(phone);
    const out = orders.map(o => {
      const s = db.prepare('SELECT * FROM story WHERE id=?').get(sid(o.no));
      const media = s ? mediaOf(s.id) : [];
      return {
        order_no: o.no, dest: o.dest, days: o.days, go_date: o.go_date, trip_state: o.trip_state,
        pax: o.pax, id: s ? s.id : sid(o.no), title: s ? s.title : '', cover: s ? s.cover : '',
        state: s ? s.state : 'draft', share_token: s ? s.share_token : '',
        nPhoto: media.filter(m => m.kind === 'photo').length,
        nVideo: media.filter(m => m.kind === 'video').length,
        // 封面兜底：客人选的 → 第一张照片 → 行程封面
        pic: (s && s.cover) || (media.find(m => m.kind === 'photo') || {}).thumb
          || (media.find(m => m.kind === 'photo') || {}).url || null,
      };
    });
    const rank = { '出行中': 0, '未出行': 1, '已回团': 2 };
    out.sort((a, b) => (rank[a.trip_state] ?? 3) - (rank[b.trip_state] ?? 3));
    res.json(out);
  });

  app.get('/api/mini/story/:orderNo', (req, res) => {
    const s = ensureStory(req.params.orderNo, req.query.phone);
    if (!s) return res.status(404).json({ err: '找不到这次出行' });
    res.json(shape(s));
  });

  /* 分片上传：前端把文件切成若干片，最后一片带 done=1，后端拼好落盘 */
  app.post('/api/mini/story/:orderNo/upload', (req, res) => {
    const s = ensureStory(req.params.orderNo, req.body && req.body.phone);
    if (!s) return res.status(404).json({ err: '找不到这次出行' });
    const b = req.body || {};
    const { uploadId, idx, total, data, name, kind } = b;
    if (!uploadId || !/^[a-z0-9]{6,40}$/i.test(uploadId)) return res.status(400).json({ err: '上传标识不合法' });
    const isVid = kind === 'video';
    const ext = isVid ? 'mp4' : (String(name || '').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4);
    if (!isVid && !['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif'].includes(ext))
      return res.status(400).json({ err: '图片只支持 jpg / png / webp / heic / gif' });
    const buf = Buffer.from(String(data || '').split(',').pop(), 'base64');
    const part = path.join(TMP, `${uploadId}.part`);
    fs.appendFileSync(part, buf);
    const size = fs.statSync(part).size;
    const MAX = isVid ? 300 * 1024 * 1024 : 20 * 1024 * 1024;
    if (size > MAX) { fs.unlinkSync(part); return res.status(413).json({ err: isVid ? '视频不要超过 300MB' : '图片不要超过 20MB' }); }
    if (!b.done) return res.json({ ok: 1, received: +idx + 1, of: +total, size });

    const fn = Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + '.' + ext;
    fs.renameSync(part, path.join(UP, fn));
    const url = '/utrip/uploads/story/' + fn;
    const shot = b.shot_at || null;
    const day = dayOf(shot, s.go_date, s.days);
    const n = db.prepare(`INSERT INTO story_media (story_id,kind,url,thumb,name,size,w,h,dur,shot_at,lat,lon,day,city,sort)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(s.id, isVid ? 'video' : 'photo', url, b.thumb || '',
      String(name || '').slice(0, 120), size, +b.w || 0, +b.h || 0, +b.dur || 0, shot,
      b.lat || null, b.lon || null, day,
      (planDays(s.consult_no).find(d => d.d === day) || {}).city || '',
      Date.now() % 100000).lastInsertRowid;
    db.prepare('UPDATE story SET updated_at=? WHERE id=?').run(now(), s.id);
    res.json({ ok: 1, id: n, url, day, size });
  });

  /* 素材：改归属天 / 写说明 / 设封面 / 删除 */
  app.put('/api/mini/story/:orderNo/media/:id', (req, res) => {
    const s = ensureStory(req.params.orderNo, (req.body || {}).phone);
    if (!s) return res.status(404).json({ err: '找不到这次出行' });
    const b = req.body || {};
    const m = db.prepare('SELECT * FROM story_media WHERE id=? AND story_id=?').get(req.params.id, s.id);
    if (!m) return res.status(404).json({ err: '素材不存在' });
    if (b.day !== undefined) {
      const d = Math.max(0, Math.min(+b.day || 0, s.days || 99));
      db.prepare('UPDATE story_media SET day=?, city=? WHERE id=?').run(d,
        (planDays(s.consult_no).find(x => x.d === d) || {}).city || '', m.id);
    }
    if (b.caption !== undefined) db.prepare('UPDATE story_media SET caption=? WHERE id=?').run(String(b.caption).slice(0, 200), m.id);
    if (b.cover) {
      db.prepare('UPDATE story_media SET is_cover=0 WHERE story_id=?').run(s.id);
      db.prepare('UPDATE story_media SET is_cover=1 WHERE id=?').run(m.id);
      db.prepare('UPDATE story SET cover=?, updated_at=? WHERE id=?').run(m.url, now(), s.id);
    }
    res.json({ ok: 1 });
  });
  app.delete('/api/mini/story/:orderNo/media/:id', (req, res) => {
    const s = ensureStory(req.params.orderNo, req.query.phone);
    if (!s) return res.status(404).json({ err: '找不到这次出行' });
    const m = db.prepare('SELECT * FROM story_media WHERE id=? AND story_id=?').get(req.params.id, s.id);
    if (m) {
      try { fs.unlinkSync(path.join(UP, path.basename(m.url))); } catch {}
      db.prepare('DELETE FROM story_media WHERE id=?').run(m.id);
      if (m.is_cover) db.prepare("UPDATE story SET cover='' WHERE id=?").run(s.id);
    }
    res.json({ ok: 1 });
  });

  /* 客人给某天写一句话——生成时会揉进那天的正文 */
  app.put('/api/mini/story/:orderNo/day/:d', (req, res) => {
    const s = ensureStory(req.params.orderNo, (req.body || {}).phone);
    if (!s) return res.status(404).json({ err: '找不到这次出行' });
    const d = +req.params.d, b = req.body || {};
    const ex = db.prepare('SELECT * FROM story_day WHERE story_id=? AND d=?').get(s.id, d);
    const f = { note: b.note !== undefined ? String(b.note).slice(0, 300) : (ex ? ex.note : ''),
      text: b.text !== undefined ? String(b.text).slice(0, 800) : (ex ? ex.text : ''),
      title: b.title !== undefined ? String(b.title).slice(0, 40) : (ex ? ex.title : '') };
    if (ex) db.prepare('UPDATE story_day SET note=?, text=?, title=?, updated_at=? WHERE id=?')
      .run(f.note, f.text, f.title, now(), ex.id);
    else db.prepare('INSERT INTO story_day (story_id,d,city,title,text,note) VALUES (?,?,?,?,?,?)')
      .run(s.id, d, (planDays(s.consult_no).find(x => x.d === d) || {}).city || '', f.title, f.text, f.note);
    db.prepare('UPDATE story SET updated_at=? WHERE id=?').run(now(), s.id);
    res.json({ ok: 1 });
  });

  /* 改故事本身：标题、开篇、结语、授权开关 */
  app.put('/api/mini/story/:orderNo', (req, res) => {
    const s = ensureStory(req.params.orderNo, (req.body || {}).phone);
    if (!s) return res.status(404).json({ err: '找不到这次出行' });
    const b = req.body || {};
    const set = [], val = [];
    ['title', 'intro', 'outro'].forEach(k => { if (b[k] !== undefined) { set.push(k + '=?'); val.push(String(b[k]).slice(0, 400)); } });
    if (b.authorized !== undefined) { set.push('authorized=?'); val.push(b.authorized ? 1 : 0); }
    if (set.length) db.prepare(`UPDATE story SET ${set.join(',')}, updated_at=? WHERE id=?`).run(...val, now(), s.id);
    res.json({ ok: 1 });
  });

  /* 生成故事：有素材才让生成；模型失败自动回落模板，不让客人卡在转圈 */
  app.post('/api/mini/story/:orderNo/generate', async (req, res) => {
    const s = ensureStory(req.params.orderNo, (req.body || {}).phone);
    if (!s) return res.status(404).json({ err: '找不到这次出行' });
    const media = mediaOf(s.id);
    if (!media.length) return res.status(400).json({ err: '先传几张照片，再让 AI 写故事' });
    const o = db.prepare('SELECT customer FROM torder WHERE no=?').get(s.order_no) || {};
    const dys = planDays(s.consult_no);
    const notes = db.prepare('SELECT * FROM story_day WHERE story_id=?').all(s.id);
    const days = (dys.length ? dys : [...Array(s.days || 1)].map((_, i) => ({ d: i + 1, city: '', title: '', items: [] })))
      .map(d => ({ ...d, note: (notes.find(x => x.d === d.d) || {}).note || '' }));
    const ctx = { story: { ...s, customer: o.customer }, plan: curPlan(s.consult_no), days, media };

    let out, by = 'ai', err = '';
    try { out = await writeStory(ctx); }
    catch (e) { err = e.message || String(e); by = 'template'; out = templateStory(ctx); }

    db.prepare('UPDATE story SET title=?, intro=?, outro=?, state=?, gen_by=?, gen_at=?, gen_err=?, updated_at=? WHERE id=?')
      .run(out.title, out.intro, out.outro, 'ready', by, now(), err.slice(0, 300), now(), s.id);
    out.days.forEach(d => {
      const ex = db.prepare('SELECT id FROM story_day WHERE story_id=? AND d=?').get(s.id, d.d);
      if (ex) db.prepare('UPDATE story_day SET city=?, title=?, text=?, updated_at=? WHERE id=?')
        .run(d.city, d.title, d.text, now(), ex.id);
      else db.prepare('INSERT INTO story_day (story_id,d,city,title,text) VALUES (?,?,?,?,?)')
        .run(s.id, d.d, d.city, d.title, d.text);
    });
    if (!s.cover) {
      const c = media.find(m => m.is_cover) || media.find(m => m.kind === 'photo');
      if (c) db.prepare('UPDATE story SET cover=? WHERE id=?').run(c.url, s.id);
    }
    res.json({ ok: 1, by, err: err ? '模型这次没写出来，先按行程给你拼了一版（可以再点一次重写）' : '' });
  });

  /* ---- 分享页（不用登录，凭 token） ---- */
  app.get('/api/story/share/:token', (req, res) => {
    const s = db.prepare('SELECT * FROM story WHERE share_token=?').get(req.params.token);
    if (!s) return res.status(404).json({ err: '链接已失效' });
    if (s.state !== 'ready') return res.status(404).json({ err: '这篇故事还没生成' });
    db.prepare('UPDATE story SET views=views+1 WHERE id=?').run(s.id);
    const f = shape(s);
    res.json({ title: f.title, intro: f.intro, outro: f.outro, cover: f.cover, dest: f.dest, nDays: f.nDays,
      days: f.days.map(d => ({ d: d.d, city: d.city, title: d.title, text: d.text,
        media: d.media.map(m => ({ kind: m.kind, url: m.url, thumb: m.thumb, caption: m.caption }) ) })),
      go_date: f.go_date, nPhoto: f.nPhoto, nVideo: f.nVideo, shop: f.shop, sales_name: f.sales_name,
      views: s.views + 1 });
  });

  /* ---- 相框 ---- */
  /* 硬件对接方式还没定，先给一份标准导出包：一个清单 JSON + 全部素材的直链，
     相框那边不管走厂商云、App 还是本地导入，照着清单取文件就行。 */
  app.get('/api/mini/story/:orderNo/frame-package', (req, res) => {
    const s = ensureStory(req.params.orderNo, req.query.phone);
    if (!s) return res.status(404).json({ err: '找不到这次出行' });
    const f = shape(s);
    /* 相框那边要的是能直接取的绝对地址；经 nginx 进来时用转发头，本地调试就用实际 host */
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const proto = req.headers['x-forwarded-proto'] || (/^(127\.|localhost)/.test(host) ? 'http' : 'https');
    const base = proto + '://' + host;
    res.json({
      story: { id: s.id, title: f.title || f.dest, dest: f.dest, days: f.nDays || f.days.length, go_date: f.go_date,
        intro: f.intro, outro: f.outro, cover: s.cover ? base + s.cover : '' },
      items: f.days.flatMap(d => d.media.map(m => ({
        day: d.d, city: d.city, kind: m.kind, url: base + m.url,
        caption: m.caption || d.title || '', text: d.text || '', shot_at: m.shot_at }))),
      total: { photo: f.nPhoto, video: f.nVideo },
      hint: '按 items 顺序循环播放；每张图配 caption，整天配 text。',
    });
  });
  app.post('/api/mini/story/:orderNo/frame-push', (req, res) => {
    const s = ensureStory(req.params.orderNo, (req.body || {}).phone);
    if (!s) return res.status(404).json({ err: '找不到这次出行' });
    const f = shape(s);
    const b = req.body || {};
    db.prepare(`INSERT INTO frame_push (story_id,device,way,n_photo,n_video,state,memo)
      VALUES (?,?,?,?,?,?,?)`).run(s.id, b.device || '未指定相框', b.way || 'package',
      f.nPhoto, f.nVideo, 'queued', '硬件对接方式待定，先记录一次推送请求');
    db.prepare('UPDATE story SET frame_at=? WHERE id=?').run(now(), s.id);
    res.json({ ok: 1, queued: 1, n: f.nPhoto + f.nVideo });
  });

  /* ---- 总部/门店侧：看客人传了什么、哪些授权可用作素材 ---- */
  app.get('/api/uom/stories', (req, res) => {
    res.json(db.prepare('SELECT * FROM story ORDER BY updated_at DESC').all().map(s => {
      const f = shape(s, { withMedia: true });
      return { id: s.id, order_no: s.order_no, customer: f.customer, dest: s.dest, days: s.days,
        go_date: s.go_date, trip_state: f.trip_state, state: s.state, gen_by: s.gen_by, gen_at: s.gen_at,
        title: s.title, cover: s.cover, nPhoto: f.nPhoto, nVideo: f.nVideo, views: s.views,
        authorized: s.authorized, share_token: s.share_token, shop: f.shop, sales_name: f.sales_name };
    }));
  });
};
