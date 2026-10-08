/* ============ 旅途故事的文案生成 ============
   喂给模型的不是一堆裸照片，而是「这次出行的真实行程」+「每天传了多少张、拍摄时间跨度」
   +「客人自己写的一句话」。我们有定制行程的逐日明细，所以模型知道第 3 天人在圣托里尼、
   当天安排是伊亚看日落、住悬崖景观房——写出来的东西是有细节的，不是空话。

   走本机 claude CLI，禁掉全部工具纯出 JSON；超时或解析失败就回落到模板版，
   保证客人点了「生成」一定有结果，不会卡在转圈。 */
const { execFile } = require('child_process');
const path = require('path');

const CLI = process.env.CLAUDE_BIN || (process.env.HOME || '/home/ec2-user') + '/.local/bin/claude';
const TIMEOUT = 240000;
const NO_TOOLS = ['Bash', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Task', 'Skill', 'Read', 'Glob', 'Grep'];

function ask(prompt, { model = 'sonnet', timeout = TIMEOUT } = {}) {
  return new Promise((resolve, reject) => {
    execFile(CLI, ['-p', prompt, '--output-format', 'text', '--model', model,
      '--disallowedTools', NO_TOOLS.join(',')],
      { timeout, cwd: '/tmp', maxBuffer: 8 * 1024 * 1024, env: process.env },
      (err, stdout, stderr) => {
        if (err) return reject(new Error((stderr || err.message || '').slice(0, 300)));
        resolve(String(stdout || '').trim());
      });
  });
}

/* 模型偶尔会在 JSON 外面裹一层解释或 ```json，容错一下再解析 */
function grabJson(s) {
  const t = String(s || '').replace(/```json|```/g, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('模型没给出 JSON');
  return JSON.parse(t.slice(a, b + 1));
}

/* 把这次出行整理成一段模型能读懂的事实清单——写故事只准用这里的事实 */
function brief({ story, plan, days, media }) {
  const L = [];
  L.push(`客人：${story.customer || '客人'}｜目的地：${story.dest}｜${story.days} 天｜出发日：${story.go_date || '未填'}`);
  if (plan) {
    L.push(`路线：${plan.route || ''}`);
    if (plan.tagline) L.push(`这条线的定位：${plan.tagline}`);
    if ((plan.highlights || []).length) L.push(`行程亮点：${plan.highlights.join('、')}`);
  }
  L.push('');
  L.push('逐日行程与客人这天传的素材：');
  days.forEach(d => {
    const ms = media.filter(m => m.day === d.d);
    const pn = ms.filter(m => m.kind === 'photo').length, vn = ms.filter(m => m.kind === 'video').length;
    const times = ms.map(m => (m.shot_at || '').slice(11, 16)).filter(Boolean).sort();
    L.push(`· 第 ${d.d} 天｜${d.city || ''}｜${d.title || ''}`);
    if ((d.items || []).length) L.push(`  当天安排：${d.items.join('；')}`);
    if (d.hotel) L.push(`  住：${d.hotel}`);
    if (d.meals) L.push(`  餐：${d.meals}`);
    if (d.exp) L.push(`  体验：${d.exp}`);
    if (d.food) L.push(`  当地美食：${d.food}`);
    L.push(`  客人素材：照片 ${pn} 张${vn ? `、视频 ${vn} 段` : ''}${times.length ? `，拍摄时段 ${times[0]}–${times[times.length - 1]}` : '（这天没传素材）'}`);
    const caps = ms.map(m => m.caption).filter(Boolean);
    if (caps.length) L.push(`  客人给照片写的说明：${caps.join('｜')}`);
    if (d.note) L.push(`  ★ 客人这天想说的话：${d.note}`);
  });
  return L.join('\n');
}

/* 生成整篇：标题 + 开篇 + 每天一段 + 结语 */
async function writeStory(ctx) {
  const { story, days } = ctx;
  const prompt = `你在替一位刚旅行回来的客人写一篇「旅途故事」，给他自己和家人朋友看，也会放在数字相框上循环播放。

下面是这次出行的真实资料：
${brief(ctx)}

要求：
1. 用第二人称「你/你们」写，像旅行顾问在替客人回忆这趟旅程，温度要有，别煽情，别用「此生难忘」「人间天堂」这类空话。
2. **只能写资料里出现过的事实**（城市、安排、住宿、餐食、体验）。没有的细节不要编，尤其不要编照片里有什么、不要编天气、不要编对话。
3. 每天一段，60–110 字，落在这天真实做过的事上。客人这天传的照片多、或者写了想说的话，就多写一点、把他的话揉进去；这天没传素材的，写短一点，一句话带过节奏即可。
4. 标题 14 字以内，不要书名号。开篇 60 字以内，结语 50 字以内。
5. 全篇中文，不要 emoji，不要 markdown 标记。

只输出 JSON，不要任何解释：
{"title":"","intro":"","days":[{"d":1,"title":"不超过10字的小标题","text":""}],"outro":""}
days 必须正好 ${days.length} 项，d 用真实天序 ${days.map(d => d.d).join(',')}。`;

  const raw = await ask(prompt, { model: 'sonnet' });
  const j = grabJson(raw);
  if (!j.title || !Array.isArray(j.days) || !j.days.length) throw new Error('模型返回内容不完整');
  return {
    title: String(j.title).slice(0, 40),
    intro: String(j.intro || '').slice(0, 300),
    outro: String(j.outro || '').slice(0, 300),
    days: days.map(d => {
      const hit = j.days.find(x => +x.d === d.d) || {};
      return { d: d.d, city: d.city || '', title: String(hit.title || d.title || '').slice(0, 30),
        text: String(hit.text || '').slice(0, 600) };
    }),
  };
}

/* 模型不可用时的兜底：拿行程事实拼一篇，读着通顺、不假 */
function templateStory(ctx) {
  const { story, plan, days, media } = ctx;
  const cities = [...new Set(days.map(d => d.city).filter(Boolean))];
  const pn = media.filter(m => m.kind === 'photo').length;
  const vn = media.filter(m => m.kind === 'video').length;
  return {
    title: `${story.dest.split(/[\s·]/)[0]}${story.days} 天`,
    intro: `${story.go_date || ''}出发，${story.days} 天走过 ${cities.join('、') || story.dest}。`
      + `这一路你留下 ${pn} 张照片${vn ? `和 ${vn} 段视频` : ''}，按行程排在下面。`,
    outro: `${cities[0] || story.dest}的这几天就记到这里。想补几句感受，点每天的「写一句」加上去。`,
    days: days.map(d => {
      const ms = media.filter(m => m.day === d.d);
      const bits = [];
      if (d.city) bits.push(`这天在${d.city}`);
      if ((d.items || []).length) bits.push(d.items.slice(0, 2).join('，'));
      if (d.exp) bits.push(`安排了${d.exp}`);
      if (d.hotel) bits.push(`住${d.hotel}`);
      if (d.note) bits.push(`你写道：${d.note}`);
      bits.push(ms.length ? `留下 ${ms.length} 份素材` : '这天没有传素材');
      return { d: d.d, city: d.city || '', title: d.title || `第 ${d.d} 天`, text: bits.join('。') + '。' };
    }),
  };
}

module.exports = { writeStory, templateStory, ask, grabJson };
