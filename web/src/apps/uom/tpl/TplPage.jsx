import React, { useState, useEffect, useMemo } from 'react';
import { get, post, del } from '../../../shared/api.js';
import { Icon, useToast, useData } from '../../../shared/ui.jsx';
import { usePage } from '../../../shared/route.js';

/* ============ 行程规划模板 ============
   对齐 OPC 有米 UOM 的「定制配置 · 模板列表」：一份模板管三件事——
   什么单子用它（主题 + 适用目的地）、行程出哪些模块（可开关/改标题/排序/加自定义）、
   客人手机上长什么样（配色 / 封面样式 / 密度 / 圆角）。界面按我们自己这套 UI 重做。 */

const GRID = 'minmax(0,1.6fr) minmax(0,1.15fr) minmax(0,1.5fr) minmax(0,1.15fr) minmax(0,0.6fr)';
const COLS = ['模板信息', '适用范围', '行程模块', '客人端外观', '状态'];
/* 主题与小程序 AI 行程师的偏好选项一致，咨询单的 theme 也在这套口径里 */
const THEMES = ['亲子旅行', '蜜月浪漫', '自然风光', '小众秘境', '休闲度假', '美食探店', '人文古迹', '摄影出片', '高端奢享'];
const COVER_CN = { video: '视频封面', photo: '图片封面', gradient: '渐变封面' };
const DENS_CN = { normal: '标准密度', compact: '紧凑密度' };
const RAD_CN = { round: '圆角', square: '直角' };

export default function TplPage() {
  const { arg, setArg } = usePage('/uom', 'tpl');
  if (arg === 'new') return <TplEditor id={null} onBack={() => setArg(null)} />;
  if (arg) return <TplEditor id={arg} onBack={() => setArg(null)} />;
  return <TplList go={setArg} />;
}

/* 一个迷你的客人端行程页示意：配色、封面样式、密度、圆角改了立刻看得到 */
export function SkinPreview({ skin, mods, name }) {
  const s = skin || {};
  const soft = mix(s.hl || '#1f6f74', .9);
  const dark = darken(s.hl || '#1f6f74', .42);
  const r = s.radius === 'square' ? 3 : 10;
  const cp = s.density === 'compact';
  const on = (mods || []).filter(m => m.on);
  return (<div className="sk-pv" style={{ borderRadius: r + 2 }}>
    <div className="sk-cover" style={{
      borderRadius: `${r}px ${r}px 0 0`, height: cp ? 82 : 100,
      background: s.cover === 'gradient' ? `linear-gradient(135deg, ${dark}, ${s.hl})`
        : `linear-gradient(135deg, ${dark}dd, ${s.hl}cc), repeating-linear-gradient(45deg, #d8ded9 0 8px, #ccd4ce 8px 16px)`,
    }}>
      {s.cover === 'video' && <span className="sk-vid"><Icon n="send" s={10} c="#fff" />视频</span>}
      <div className="sk-ct" style={{ fontSize: cp ? 13 : 15 }}>{name || '模板预览'}</div>
      <div className="sk-cs">定制行程 · 客人手机上的样子</div>
    </div>
    <div className="sk-body" style={{ padding: cp ? '9px 10px' : '12px 13px' }}>
      <div className="sk-facts">
        {['交通', '住宿', '含餐'].map(f => <span key={f} style={{ borderRadius: r - 4, background: soft, color: s.hl }}>{f}</span>)}
      </div>
      {on.slice(0, 4).map(m => (
        <div key={m.key} className="sk-sec" style={{ marginTop: cp ? 8 : 11 }}>
          <div className="sk-h" style={{ color: s.hl, fontSize: cp ? 11.5 : 12.5 }}>
            <i style={{ background: s.hl, borderRadius: r - 8 }} />{m.name}</div>
          <div className="sk-l" style={{ background: soft, borderRadius: r - 5, height: cp ? 6 : 7 }} />
          <div className="sk-l" style={{ background: soft, borderRadius: r - 5, width: '72%', height: cp ? 6 : 7 }} />
        </div>
      ))}
      <div className="sk-tip" style={{ background: hexa(s.warm || '#b4762a', .1), color: s.warm, borderRadius: r - 4,
        marginTop: cp ? 8 : 11, fontSize: cp ? 10 : 10.8 }}>贴士 · 暖色用在提示、评分与客人意见</div>
    </div>
  </div>);
}
function mix(hex, p) { const [r, g, b] = rgb(hex); const f = v => Math.round(v + (255 - v) * p); return `rgb(${f(r)},${f(g)},${f(b)})`; }
function darken(hex, p) { const [r, g, b] = rgb(hex); const f = v => Math.round(v * (1 - p)); return `rgb(${f(r)},${f(g)},${f(b)})`; }
function hexa(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }
function rgb(hex) { const h = /^#([0-9a-f]{6})$/i.test(hex || '') ? hex.slice(1) : '1f6f74';
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }

/* ---------- 列表 ---------- */
function TplList({ go }) {
  const toast = useToast();
  const { d: list, reload } = useData(() => get('/api/uom/templates'), [], []);
  const [busy, setBusy] = useState(false);
  const rows = list || [];
  const setDef = async t => {
    if (t.is_def) return;
    if (!window.confirm(`把「${t.name}」设为默认模板吗？匹配不到专属模板的单子都会用它。`)) return;
    setBusy(1); await post('/api/uom/templates', { ...t, dest: t.destList, is_def: 1 });
    toast('已设为默认模板'); setBusy(0); reload();
  };
  const copy = async t => { const x = await post(`/api/uom/templates/${t.id}/copy`, {}); toast(`已复制为 ${x.id}`); reload(); };
  const remove = async t => {
    if (!window.confirm(`确认删除模板「${t.name}」吗？`)) return;
    try { await del('/api/uom/templates/' + t.id); toast('已删除'); reload(); }
    catch (e) { toast(e.message); }
  };
  const STAT = [
    ['模板', rows.length + ' 套'],
    ['默认', (rows.find(t => t.is_def) || {}).name || '未设置', 'g'],
    ['按主题', rows.filter(t => t.type).length + ' 套'],
    ['指定目的地', rows.filter(t => t.dest_mode === 'some').length + ' 套'],
  ];
  return (<div className="op">
    <section className="mod">
      <div className="mod-h"><h3>行程规划模板</h3><span className="en">Templates</span>
        <div className="mod-stat">{STAT.map(([k, v, c]) => <i key={k}>{k}：<b className={c || ''}>{v}</b></i>)}</div>
      </div>
      <div className="op-tool">
        <button className="tb" onClick={() => go('new')}>+ 新建模板</button>
        <button className="tb" onClick={reload}>刷新</button>
        <span className="cnt">出方案时按「目的地 + 主题」自动挑模板，挑不到用默认模板</span>
      </div>
      <div className="ol-head" style={{ gridTemplateColumns: GRID }}>{COLS.map(c => <span key={c}>{c}</span>)}</div>
      {!rows.length ? <div className="op-empty">还没有模板</div> : rows.map(t => {
        const on = t.modules.filter(m => m.on);
        return (<div className="ol-row" key={t.id}>
          <div className="ol-sub">
            <span className="f">模板编号 <b className="mono">{t.id}</b></span>
            <span className="f">主题 <b>{t.type || '通用（不限主题）'}</b></span>
            <span className="f">更新 <b className="mu">{(t.updated_at || '').slice(0, 10)}</b></span>
            {t.is_def && <span className="tag ok">默认模板</span>}
            <a className="more" onClick={() => go(t.id)}>编辑模板 ›</a>
          </div>
          <div className="ol-cells" style={{ gridTemplateColumns: GRID }}>
            <div className="c">
              <div className="oc-p"><span className="ph" style={{ background: t.skin.hl }}>
                <Icon n="grid" s={15} c="#fff" /></span>
                <div className="tx"><div className="nm" onClick={() => go(t.id)}>{t.name}</div>
                  <div className="oc-s">{t.note || '—'}</div></div></div>
            </div>
            <div className="c">
              <div className="oc-r"><i>主题</i><b>{t.type || '通用'}</b></div>
              <div className="oc-r"><i>目的地</i><b className={t.dest_mode === 'some' ? '' : 'mu'}>
                {t.dest_mode === 'some' ? (t.destList.join('、') || '未指定') : '全部目的地'}</b></div>
            </div>
            <div className="c">
              <div className="oc-r"><i>已开</i><b className={on.length ? '' : 'r'}>{on.length} / {t.modules.length} 块</b></div>
              <div className="tpl-ms">{t.modules.map(m => (
                <em key={m.key} className={m.on ? '' : 'off'}>{m.name}{m.cust ? '＋' : ''}</em>))}</div>
            </div>
            <div className="c">
              <div className="oc-r2">
                <span className="sk-dot" style={{ background: t.skin.hl }} />
                <span className="sk-dot" style={{ background: t.skin.warm }} />
                <span className="t2" style={{ marginTop: 0 }}>{t.skin.color === 'custom' ? '自定义配色' : t.skin.hl}</span>
              </div>
              <div className="oc-r"><i>封面</i><b className="mu">{COVER_CN[t.skin.cover]}</b></div>
              <div className="oc-r"><i>版式</i><b className="mu">{DENS_CN[t.skin.density]} · {RAD_CN[t.skin.radius]}</b></div>
            </div>
            <div className="c">
              {t.is_def ? <span className="tag ok">默认</span> : <span className="tag plain">备选</span>}
            </div>
          </div>
          <div className="ol-ops">
            {!t.is_def && <button className="ob" disabled={busy} onClick={() => setDef(t)}>设为默认</button>}
            <button className="ob" onClick={() => copy(t)}>复制</button>
            <button className="ob r" disabled={t.is_def} title={t.is_def ? '默认模板不能删除，只能改' : ''}
              onClick={() => remove(t)}>删除</button>
            <button className="ob p" onClick={() => go(t.id)}>编辑</button>
          </div>
        </div>);
      })}
      <div className="op-ft">模块的「写作要求」现在只对接入 AI 文案后生效；模块开关、标题、顺序与外观是立刻生效的。</div>
    </section>
  </div>);
}

/* ---------- 编辑 ---------- */
const L = ({ label, req, tip, children }) => (
  <div className="pe-line"><span className="lb">{req && <b>*</b>}{label}</span>
    <div className="in">{children}{tip && <div className="t2">{tip}</div>}</div></div>
);

function TplEditor({ id, onBack }) {
  const toast = useToast();
  const { d: meta } = useData(() => get('/api/uom/templates/meta'), [], {});
  const { d: dests } = useData(() => get('/api/meta').then(m => m.dests || []), [], []);
  const { d: list } = useData(() => get('/api/uom/templates'), [], []);
  const [t, setT] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!list) return;
    if (id) { const hit = list.find(x => x.id === id); if (hit) setT(JSON.parse(JSON.stringify(hit))); }
    else if (meta.skinDefault) setT({
      name: '', type: '', dest_mode: 'all', destList: [], is_def: 0, note: '', sort: 50,
      skin: { ...meta.skinDefault },
      modules: (meta.builtin || []).map((b, i) => ({ key: b.key, name: b.name, on: 1, tip: b.tip, sort: i, cust: 0 })),
    });
  }, [id, list, meta]);
  if (!t) return <div className="empty">载入中…</div>;

  const P = meta.palette || {};
  const set = (k, v) => setT(o => ({ ...o, [k]: v }));
  const setSkin = (k, v) => setT(o => ({ ...o, skin: { ...o.skin, [k]: v } }));
  const pickColor = c => setT(o => ({ ...o, skin: { ...o.skin, color: c, ...(P[c] ? { hl: P[c].hl, warm: P[c].warm } : {}) } }));
  const setMod = (i, k, v) => setT(o => { const m = [...o.modules]; m[i] = { ...m[i], [k]: v }; return { ...o, modules: m }; });
  const moveMod = (i, d) => setT(o => {
    const m = [...o.modules], j = i + d; if (j < 0 || j >= m.length) return o;
    [m[i], m[j]] = [m[j], m[i]]; return { ...o, modules: m.map((x, k) => ({ ...x, sort: k })) };
  });
  const addCust = () => setT(o => ({ ...o, modules: [...o.modules, {
    key: 'cust' + Date.now().toString(36).slice(-4), name: '自定义模块', on: 1, tip: '', cust: 1, sort: o.modules.length }] }));
  const delCust = i => setT(o => ({ ...o, modules: o.modules.filter((_, j) => j !== i) }));
  const toggleDest = d => setT(o => ({ ...o, destList: o.destList.includes(d) ? o.destList.filter(x => x !== d) : [...o.destList, d] }));

  const save = async () => {
    if (!t.name.trim()) return toast('模板名称必填');
    if (t.dest_mode === 'some' && !t.destList.length) return toast('选了「指定目的地」就要至少挑一个目的地');
    if (!t.modules.some(m => m.on)) return toast('至少要开一个模块，不然行程出不来');
    setBusy(true);
    try { const r = await post('/api/uom/templates', { ...t, dest: t.destList }); toast(`已保存（${r.id}）`); onBack(); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  };

  const onMods = t.modules.filter(m => m.on);
  return (<>
    <div className="pe-top">
      <button className="btn btn-o btn-s" onClick={onBack}><Icon n="back" s={14} />返回列表</button>
      <h3>{id ? '编辑行程模板' : '新建行程模板'}</h3>
      {id && <span className="tag mono">{t.id}</span>}
      {t.is_def ? <span className="tag ok">默认模板</span> : null}
      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
        出方案时按「目的地 + 主题」匹配，匹配不到用默认模板</span>
    </div>

    <div className="pe-sec">
      <div className="hd"><i /><b>什么单子用这套模板</b><span>匹配规则：先按主题找指定目的地的，再退通用的，都没有就用默认模板</span></div>
      <L label="模板名称" req><input className="inp" value={t.name} onChange={e => set('name', e.target.value)}
        placeholder="如 蜜月浪漫 · 双人私享" /></L>
      <div className="pe-grid2">
        <L label="主题类型" tip="咨询单的主题命中这里就套这套模板；留空＝不限主题的通用模板">
          <input className="inp" list="tpl-themes" value={t.type} onChange={e => set('type', e.target.value)}
            placeholder="留空＝通用模板" />
          <datalist id="tpl-themes">{THEMES.map(x => <option key={x} value={x} />)}</datalist></L>
        <L label="适用目的地">
          <select className="inp" value={t.dest_mode} onChange={e => set('dest_mode', e.target.value)}>
            <option value="all">全部目的地</option><option value="some">指定目的地</option></select></L>
      </div>
      {t.dest_mode === 'some' && <L label="选目的地" req tip="咨询单的目的地命中其中任意一个就算匹配">
        <div className="chips">{(dests || []).map(d => (
          <div key={d.key} className={'chip gold' + (t.destList.includes(d.name) ? ' on' : '')}
            onClick={() => toggleDest(d.name)}>{d.name}</div>))}</div></L>}
      <div className="pe-grid2">
        <L label="设为默认模板" tip="默认模板只能有一套，不能删除">
          <select className="inp" value={t.is_def ? 1 : 0} onChange={e => set('is_def', +e.target.value)}>
            <option value={0}>否</option><option value={1}>是（匹配不到时用它）</option></select></L>
        <L label="排序"><input className="inp" type="number" value={t.sort} onChange={e => set('sort', +e.target.value)} /></L>
      </div>
      <L label="备注"><input className="inp" value={t.note} onChange={e => set('note', e.target.value)}
        placeholder="给自己人看的说明，比如这套模板适合什么客群" /></L>
    </div>

    <div className="pe-sec">
      <div className="hd"><i /><b>行程出哪些模块</b>
        <span>关掉的模块不出现在方案与客人端；标题就是客人手机上看到的小标题</span></div>
      <div className="tm-head">
        <span>启用</span><span>模块标题</span><span>写作要求（给 AI 的说明）</span><span>排序</span><span /></div>
      {t.modules.map((m, i) => (
        <div className={'tm-row' + (m.on ? '' : ' off')} key={m.key}>
          <label className="tm-sw"><input type="checkbox" checked={!!m.on} onChange={e => setMod(i, 'on', e.target.checked ? 1 : 0)} /></label>
          <div className="tm-n">
            <input className="inp" value={m.name} onChange={e => setMod(i, 'name', e.target.value)} />
            <span className="mono">{m.key}{m.cust ? ' · 自定义' : ''}</span>
          </div>
          <textarea className="inp" rows={2} value={m.tip} onChange={e => setMod(i, 'tip', e.target.value)}
            placeholder="这一块要写成什么样，越具体越好" />
          <div className="tm-mv">
            <span onClick={() => moveMod(i, -1)}><Icon n="up" s={13} /></span>
            <span onClick={() => moveMod(i, 1)}><Icon n="down" s={13} /></span>
          </div>
          <span className="tm-x">{m.cust ? <i onClick={() => delCust(i)}><Icon n="trash" s={13} /></i> : null}</span>
        </div>
      ))}
      <button className="mc-add" onClick={addCust}>+ 添加自定义模块</button>
      <div className="t2" style={{ marginTop: 8 }}>
        六个内置模块不能删，不用就关掉。自定义模块用来加「购物指南」「签证提醒」这类这条线特有的内容。
      </div>
    </div>

    <div className="pe-sec">
      <div className="hd"><i /><b>客人端外观</b><span>客人手机上打开这份行程时的配色与版式，右边是实时预览</span></div>
      <div className="tpl-skin">
        <div className="tpl-skin-l">
          <L label="配色方案">
            <div className="chips">
              {Object.entries(P).map(([k, v]) => (
                <div key={k} className={'chip sk-chip' + (t.skin.color === k ? ' on' : '')} onClick={() => pickColor(k)}>
                  <i style={{ background: v.hl }} /><i style={{ background: v.warm }} />{v.cn}</div>))}
              <div className={'chip sk-chip' + (t.skin.color === 'custom' ? ' on' : '')} onClick={() => pickColor('custom')}>
                <i style={{ background: t.skin.hl }} /><i style={{ background: t.skin.warm }} />自定义</div>
            </div>
          </L>
          {t.skin.color === 'custom' && <div className="pe-grid2">
            <L label="主色"><div className="sk-in"><input type="color" value={t.skin.hl} onChange={e => setSkin('hl', e.target.value)} />
              <input className="inp mono" value={t.skin.hl} onChange={e => setSkin('hl', e.target.value)} /></div></L>
            <L label="暖色"><div className="sk-in"><input type="color" value={t.skin.warm} onChange={e => setSkin('warm', e.target.value)} />
              <input className="inp mono" value={t.skin.warm} onChange={e => setSkin('warm', e.target.value)} /></div></L>
          </div>}
          <L label="封面样式" tip="视频封面会去视频库找片子，没有片子时自动退回图片">
            <div className="chips">{Object.entries(COVER_CN).map(([k, v]) => (
              <div key={k} className={'chip gold' + (t.skin.cover === k ? ' on' : '')} onClick={() => setSkin('cover', k)}>{v}</div>))}</div></L>
          <div className="pe-grid2">
            <L label="信息密度"><div className="chips">{Object.entries(DENS_CN).map(([k, v]) => (
              <div key={k} className={'chip gold' + (t.skin.density === k ? ' on' : '')} onClick={() => setSkin('density', k)}>{v}</div>))}</div></L>
            <L label="圆角"><div className="chips">{Object.entries(RAD_CN).map(([k, v]) => (
              <div key={k} className={'chip gold' + (t.skin.radius === k ? ' on' : '')} onClick={() => setSkin('radius', k)}>{v}</div>))}</div></L>
          </div>
        </div>
        <div className="tpl-skin-r">
          <div className="tk" style={{ marginBottom: 8 }}>实时预览 · 客人手机端</div>
          <SkinPreview skin={t.skin} mods={onMods} name={t.name || '模板预览'} />
          <div className="t2" style={{ marginTop: 8 }}>预览里的小标题取自上面开启的模块，顺序也跟着走。</div>
        </div>
      </div>
    </div>

    <div className="pe-bar">
      <button className="btn btn-o" onClick={onBack}>取消</button>
      <button className="btn btn-p" disabled={busy} onClick={save}>{busy ? '保存中…' : '保存模板'}</button>
    </div>
  </>);
}
