import React, { useRef, useState } from 'react';
import { img as oimg } from './img.js';
import { post } from './api.js';
import { Icon, useToast } from './ui.jsx';

/* 图片上传：选文件 → 转 base64 → 后端落盘 → 回传 URL（多图 / 单图通用） */
export function ImgUpload({ value, onChange, multiple = false, tip }) {
  const toast = useToast();
  const ref = useRef();
  const [busy, setBusy] = useState(false);
  const list = multiple ? (Array.isArray(value) ? value : []) : (value ? [value] : []);
  const pick = async e => {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    setBusy(true);
    const out = [];
    for (const f of files) {
      if (f.size > 10 * 1024 * 1024) { toast(f.name + ' 超过 10MB，已跳过'); continue; }
      const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
      try { const r = await post('/api/upload', { data, name: f.name }); out.push(r.url); }
      catch (err) { toast(err.message); }
    }
    setBusy(false);
    if (!out.length) return;
    onChange(multiple ? [...list, ...out] : out[0]);
    toast('已上传 ' + out.length + ' 张');
    if (ref.current) ref.current.value = '';
  };
  const del = i => onChange(multiple ? list.filter((_, j) => j !== i) : '');
  return (<>
    <div className="up-box">
      {list.map((u, i) => (
        <div className="up-one" key={i}>
          <img src={oimg(u, 300)} alt="" />
          <span className="x" onClick={() => del(i)}>✕</span>
        </div>))}
      {(multiple || !list.length) && (
        <div className="up-btn" onClick={() => ref.current && ref.current.click()}>
          {busy ? <span>上传中…</span> : <><Icon n="plus" s={17} />上传图片</>}
        </div>)}
    </div>
    <input ref={ref} type="file" accept="image/*" multiple={multiple} hidden onChange={pick} />
    {tip && <div className="up-tip">{tip}</div>}
  </>);
}


/* 行内触发式上传：卡片行 / 小封面位用，只有一个文字触发器 */
export function ImgPick({ value, onChange, text, className = 'up' }) {
  const toast = useToast();
  const ref = useRef();
  const [busy, setBusy] = useState(false);
  const pick = async e => {
    const f = (e.target.files || [])[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast('图片不要超过 10MB'); return; }
    setBusy(true);
    try {
      const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
      const r = await post('/api/upload', { data, name: f.name });
      onChange(r.url); toast('已上传');
    } catch (err) { toast(err.message); }
    setBusy(false);
    if (ref.current) ref.current.value = '';
  };
  return (<>
    <span className={className} onClick={() => ref.current && ref.current.click()}>
      {busy ? '上传中…' : (text || (value ? '更换图片' : '上传图片'))}
    </span>
    <input ref={ref} type="file" accept="image/*" hidden onChange={pick} />
  </>);
}

/* 视频上传：上传 mp4，或直接粘贴已有的视频地址 */
export function VideoUpload({ value, onChange, tip }) {
  const toast = useToast();
  const ref = useRef();
  const [busy, setBusy] = useState(false);
  const pick = async e => {
    const f = (e.target.files || [])[0];
    if (!f) return;
    if (f.size > 40 * 1024 * 1024) { toast('视频不要超过 40MB，建议先压缩或用已有的视频地址'); return; }
    setBusy(true);
    try {
      const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
      const r = await post('/api/upload', { data, name: f.name });
      onChange(r.url); toast('视频已上传');
    } catch (err) { toast(err.message); }
    setBusy(false);
    if (ref.current) ref.current.value = '';
  };
  return (<>
    <div className="vd-row">
      {value ? <video className="vd-pv" src={value} muted playsInline preload="metadata" /> : <div className="vd-pv ph"><Icon n="img" s={20} c="var(--muted-2)" /></div>}
      <div className="vd-op">
        <div className="up-btn sm" onClick={() => ref.current && ref.current.click()}>
          {busy ? <span>上传中…</span> : <><Icon n="plus" s={15} />{value ? '更换视频' : '上传视频'}</>}
        </div>
        {value && <span className="vd-del" onClick={() => onChange('')}>移除</span>}
      </div>
    </div>
    <input ref={ref} type="file" accept="video/mp4" hidden onChange={pick} />
    <input className="inp" style={{ marginTop: 8 }} value={value || ''} onChange={e => onChange(e.target.value)}
      placeholder="也可直接粘贴已有的视频地址（mp4）" />
    {tip && <div className="up-tip">{tip}</div>}
  </>);
}
