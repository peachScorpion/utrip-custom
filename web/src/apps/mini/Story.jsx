import React, { useState, useEffect, useRef, useMemo } from 'react';
import { get, post, put, del } from '../../shared/api.js';
import { Icon, useToast, useData } from '../../shared/ui.jsx';

/* ============ 旅途故事 ============
   一次出行一本：路上传照片视频 → 按行程天自动归档 → 一键让 AI 写成按天的图文故事
   → 分享给家人朋友，或推到数字相框。

   照片归哪一天，靠读照片自带的拍摄时间（EXIF）跟出发日相减算出来，不靠客人手点；
   读不到就落到「待归类」，客人自己挪一下。境外网络差，上传切片逐片传，断了能接着来。 */

/* ---------- 前端读 EXIF：只取拍摄时间与 GPS，够用就行，不引三方库 ---------- */
function readExif(file) {
  return new Promise(resolve => {
    const fallback = () => resolve({ shot_at: fmt(new Date(file.lastModified || Date.now())) });
    if (!/^image\/jpe?g$/i.test(file.type)) return fallback();
    const fr = new FileReader();
    fr.onerror = fallback;
    fr.onload = () => {
      try {
        const v = new DataView(fr.result);
        if (v.getUint16(0) !== 0xFFD8) return fallback();
        let off = 2, app1 = -1;
        while (off < v.byteLength - 4) {
          if (v.getUint16(off) === 0xFFE1) { app1 = off + 4; break; }
          if ((v.getUint16(off) & 0xFF00) !== 0xFF00) break;
          off += 2 + v.getUint16(off + 2);
        }
        if (app1 < 0) return fallback();
        if (v.getUint32(app1) !== 0x45786966) return fallback();       // "Exif"
        const tiff = app1 + 6;
        const le = v.getUint16(tiff) === 0x4949;                        // 字节序
        const u16 = p => v.getUint16(p, le), u32 = p => v.getUint32(p, le);
        const ifd0 = tiff + u32(tiff + 4);
        let exifIFD = 0, gpsIFD = 0, dt = '';
        const readAscii = (p, n) => { let s = ''; for (let i = 0; i < n - 1; i++) s += String.fromCharCode(v.getUint8(p + i)); return s; };
        const walk = (base, cb) => {
          const n = u16(base);
          for (let i = 0; i < n; i++) {
            const e = base + 2 + i * 12;
            cb(u16(e), u16(e + 2), u32(e + 4), e + 8);
          }
        };
        walk(ifd0, (tag, type, cnt, valP) => {
          if (tag === 0x8769) exifIFD = tiff + u32(valP);
          if (tag === 0x8825) gpsIFD = tiff + u32(valP);
          if (tag === 0x0132 && !dt) dt = readAscii(tiff + u32(valP), cnt);
        });
        if (exifIFD) walk(exifIFD, (tag, type, cnt, valP) => {
          if (tag === 0x9003 || tag === 0x9004) { const s = readAscii(tiff + u32(valP), cnt); if (s) dt = s; }
        });
        let lat = null, lon = null;
        if (gpsIFD) {
          const rat = p => u32(p) / (u32(p + 4) || 1);
          const dms = p => rat(p) + rat(p + 8) / 60 + rat(p + 16) / 3600;
          let latRef = 'N', lonRef = 'E', latP = 0, lonP = 0;
          walk(gpsIFD, (tag, type, cnt, valP) => {
            if (tag === 1) latRef = String.fromCharCode(v.getUint8(valP));
            if (tag === 2) latP = tiff + u32(valP);
            if (tag === 3) lonRef = String.fromCharCode(v.getUint8(valP));
            if (tag === 4) lonP = tiff + u32(valP);
          });
          if (latP) { lat = dms(latP) * (latRef === 'S' ? -1 : 1); }
          if (lonP) { lon = dms(lonP) * (lonRef === 'W' ? -1 : 1); }
        }
        const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(dt || '');
        resolve({
          shot_at: m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}` : fmt(new Date(file.lastModified || Date.now())),
          lat, lon,
        });
      } catch { fallback(); }
    };
    fr.readAsArrayBuffer(file.slice(0, 256 * 1024));      // EXIF 在文件头，读前 256KB 就够
  });
}
const p2 = n => String(n).padStart(2, '0');
const fmt = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;

/* 图片压一版再传：手机原图动辄 5–8MB，长边 1600 够看且快很多（原图尺寸一并记下来） */
function shrink(file, max = 1440, q = 0.82) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve({ data: c.toDataURL('image/jpeg', q), w: img.width, h: img.height });
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
/* 视频抽第一帧做封面，顺便拿到时长 */
function videoPoster(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata'; v.muted = true; v.src = url;
    let done = false;
    const fin = r => { if (done) return; done = true; URL.revokeObjectURL(url); resolve(r); };
    v.onloadeddata = () => {
      v.currentTime = Math.min(1, (v.duration || 2) / 3);
      v.onseeked = () => {
        try {
          const c = document.createElement('canvas');
          const s = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
          c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s);
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          fin({ thumb: c.toDataURL('image/jpeg', 0.8), dur: v.duration || 0, w: v.videoWidth, h: v.videoHeight });
        } catch { fin({ dur: v.duration || 0 }); }
      };
    };
    v.onerror = () => fin(null);
    setTimeout(() => fin(null), 8000);
  });
}

const CHUNK = 3 * 1024 * 1024;     // 3MB 一片：base64 后约 4MB，稳过网关
const rid = () => Math.random().toString(36).slice(2, 12);
const readAsDataURL = blob => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });

/* ---------- 我的 → 旅途故事：一次出行一本 ---------- */
export function StoryList({ guest, back, onOpen }) {
  const phone = guest && guest.phone;
  const { d: list, loading } = useData(() => phone ? get('/api/mini/stories?phone=' + phone) : Promise.resolve([]), [phone], []);
  const rows = list || [];
  const ST = { 出行中: ['正在路上', 'ing'], 未出行: ['还没出发', 'pre'], 已回团: ['已回来', 'back'] };
  return (<div className="sub-pg">
    <div className="sub-hd"><div className="bk" onClick={back}><Icon n="back" s={15} /></div><b>旅途故事</b></div>
    <div className="sub-bd">
      <div className="sy-lead">
        <b>把这趟路留下来</b>
        <span>出行路上随手传照片和视频，回来一键生成属于你的旅途故事，可以分享，也能放进家里的数字相框。</span>
      </div>
      {loading ? <div className="nm-empty">正在找你的行程…</div>
        : !rows.length ? <div className="nm-empty">还没有出行记录
          <div><button onClick={back}>先去看看行程</button></div></div>
        : rows.map(r => {
          const st = ST[r.trip_state] || ['', ''];
          return (<div className="sy-card" key={r.order_no} onClick={() => onOpen(r.order_no)}>
            <div className="pic">{r.pic ? <img src={r.pic} alt="" /> : <span className="ph"><Icon n="img" s={20} c="#b9c2bd" /></span>}
              {r.state === 'ready' && <em className="rdy">故事已生成</em>}</div>
            <div className="tx">
              <div className="t"><b>{r.title || r.dest}</b><span className={'st ' + st[1]}>{st[0]}</span></div>
              <div className="s">{r.dest} · {r.days} 天 · {r.go_date || '日期待定'}</div>
              <div className="n">
                {r.nPhoto || r.nVideo
                  ? <>已传 {r.nPhoto} 张照片{r.nVideo ? ` · ${r.nVideo} 段视频` : ''}</>
                  : <em>还没传素材，点进去传几张</em>}
              </div>
            </div>
            <div className="ar" />
          </div>);
        })}
    </div>
  </div>);
}

/* ---------- 一本故事：相册 + 生成 + 阅读 ---------- */
export function StoryBook({ guest, orderNo, back }) {
  const toast = useToast();
  const phone = guest && guest.phone;
  const { d, loading, reload } = useData(() => get(`/api/mini/story/${orderNo}?phone=${phone || ''}`), [orderNo, phone]);
  const [tab, setTab] = useState('album');        // album 相册 / story 故事
  const [up, setUp] = useState(null);             // 上传进度
  const [pend, setPend] = useState([]);          // 正在上传的本地预览
  const [gen, setGen] = useState(false);
  const [big, setBig] = useState(null);           // 看大图
  const [noteOn, setNoteOn] = useState(null);     // 正在给哪天写一句
  const [noteTx, setNoteTx] = useState('');
  const fileRef = useRef(null);
  useEffect(() => { if (d && d.state === 'ready') setTab('story'); }, [d && d.state]);
  if (loading || !d) return <div className="sub-pg"><div className="sub-hd">
    <div className="bk" onClick={back}><Icon n="back" s={15} /></div><b>旅途故事</b></div>
    <div className="sub-bd"><div className="nm-empty">正在打开…</div></div></div>;

  const days = d.days || [];
  const unsorted = (d.media || []).filter(m => !m.day);

  const pick = async e => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    /* 先把选中的图摆出来（本地预览 + 上传中遮罩），别让客人对着空页面等 */
    const queue = files.map((f, i) => ({ key: rid() + i, name: f.name,
      url: /^image\//.test(f.type) ? URL.createObjectURL(f) : '', vid: /^video\//.test(f.type) }));
    setPend(queue);
    let ok = 0, fail = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const key = queue[i].key;
      const isVid = /^video\//.test(f.type);
      setUp({ i: i + 1, n: files.length, name: f.name, pct: 0, step: isVid ? '正在读取视频' : '正在处理' });
      try {
        const meta = isVid ? { shot_at: fmt(new Date(f.lastModified || Date.now())) } : await readExif(f);
        let body = { phone, kind: isVid ? 'video' : 'photo', name: f.name, ...meta };
        if (isVid) {
          const vp = await videoPoster(f);
          if (vp) Object.assign(body, { thumb: vp.thumb, dur: vp.dur, w: vp.w, h: vp.h });
          /* 视频原样切片传，不在手机上转码 */
          const uploadId = rid();
          const total = Math.ceil(f.size / CHUNK);
          for (let c = 0; c < total; c++) {
            const part = await readAsDataURL(f.slice(c * CHUNK, (c + 1) * CHUNK));
            const last = c === total - 1;
            const r = await post(`/api/mini/story/${orderNo}/upload`,
              { ...body, uploadId, idx: c, total, data: part, done: last ? 1 : 0 });
            setUp({ i: i + 1, n: files.length, name: f.name, step: '正在上传视频',
              pct: Math.round((c + 1) / total * 100) });
            if (last && !r.ok) throw new Error('上传失败');
          }
        } else {
          setUp({ i: i + 1, n: files.length, name: f.name, pct: 0, step: '正在压缩' });
          const sm = await shrink(f);
          if (!sm) throw new Error('这张图读不出来');
          Object.assign(body, { w: sm.w, h: sm.h });
          /* 压完的 dataURL 也切片传：单张照片上传也有真实进度，
             不然客人对着一个不动的 0% 干等，以为功能坏了 */
          const b64 = sm.data;
          const total = Math.max(1, Math.ceil(b64.length / (CHUNK * 1.34)));
          const step = Math.ceil(b64.length / total);
          const uploadId = rid();
          for (let c = 0; c < total; c++) {
            const last = c === total - 1;
            await post(`/api/mini/story/${orderNo}/upload`, { ...body, uploadId, idx: c, total,
              data: b64.slice(c * step, (c + 1) * step), done: last ? 1 : 0 });
            setUp({ i: i + 1, n: files.length, name: f.name, step: '正在上传',
              pct: Math.round((c + 1) / total * 100) });
          }
        }
        ok++;
        setPend(a => a.filter(x => x.key !== key));
      } catch (err) {
        fail++;
        setPend(a => a.map(x => x.key === key ? { ...x, err: 1 } : x));
      }
    }
    setUp(null);
    setTimeout(() => setPend([]), 1200);
    const r = await reload();
    /* 读不到拍摄时间的会落进「待归类」，这件事要说清楚，不然客人以为没传上 */
    const un = ((r && r.media) || []).filter(m => !m.day).length;
    toast(fail ? `传上 ${ok} 个，${fail} 个没成功`
      : un ? `${ok} 个已上传，其中 ${un} 个读不到拍摄时间，放在「待归类」了` : `${ok} 个素材已按行程归档`);
  };

  const setDay = async (m, day) => { await put(`/api/mini/story/${orderNo}/media/${m.id}`, { phone, day }); reload(); };
  /* 待归类的照片按上传顺序平均分到各天——总比全堆在「待归类」强，分完客人再挪 */
  const spread = async () => {
    const n = days.length || d.nDays || 1;
    if (!unsorted.length) return;
    if (!window.confirm(`把 ${unsorted.length} 张平均分到 ${n} 天里？分完还可以单独挪。`)) return;
    const per = Math.ceil(unsorted.length / n);
    for (let i = 0; i < unsorted.length; i++) {
      await put(`/api/mini/story/${orderNo}/media/${unsorted[i].id}`,
        { phone, day: Math.min(n, Math.floor(i / per) + 1) });
    }
    toast('分好了，点开单张还能改'); reload();
  };
  const setCover = async m => { await put(`/api/mini/story/${orderNo}/media/${m.id}`, { phone, cover: 1 }); toast('已设为封面'); reload(); };
  const remove = async m => {
    if (!window.confirm('删掉这个素材？')) return;
    await del(`/api/mini/story/${orderNo}/media/${m.id}?phone=${phone || ''}`); setBig(null); reload();
  };
  const saveNote = async () => {
    await put(`/api/mini/story/${orderNo}/day/${noteOn}`, { phone, note: noteTx });
    toast('记下了，生成故事时会用上'); setNoteOn(null); reload();
  };
  const generate = async () => {
    if (!(d.media || []).length) return toast('先传几张照片');
    setGen(true);
    try {
      const r = await post(`/api/mini/story/${orderNo}/generate`, { phone });
      toast(r.err || 'AI 写好了'); setTab('story'); reload();
    } catch (e) { toast(e.message || '生成失败，过一会儿再试'); } finally { setGen(false); }
  };
  const share = () => {
    const url = `${location.origin}${location.pathname}#/story/${d.share_token}`;
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast('分享链接已复制，发给家人朋友就能看'));
    else toast(url);
  };
  const toFrame = async () => {
    if (d.state !== 'ready') return toast('先生成故事再推到相框');
    await post(`/api/mini/story/${orderNo}/frame-push`, { phone, way: 'package' });
    toast('已排进相框推送队列（硬件对接完成后自动送达）'); reload();
  };

  return (<div className="sub-pg has-bar">
    <div className="sub-hd"><div className="bk" onClick={back}><Icon n="back" s={15} /></div>
      <b>{d.title || '旅途故事'}</b>
      {d.state === 'ready' && <span className="sub-op" onClick={share}>分享</span>}</div>
    <div className="sub-bd">
      <div className="sy-hero">
        {d.cover ? <img src={d.cover} alt="" /> : <div className="ph"><Icon n="img" s={26} c="#fff" /></div>}
        <div className="ov">
          <b>{d.title || d.dest}</b>
          <span>{d.dest} · {d.nDays} 天 · {d.go_date || ''}　{d.trip_state}</span>
          <span className="n">照片 {d.nPhoto} 张{d.nVideo ? ` · 视频 ${d.nVideo} 段` : ''}
            {d.views ? ` · 被看过 ${d.views} 次` : ''}</span>
        </div>
      </div>

      <div className="sy-tabs">
        <a className={tab === 'album' ? 'on' : ''} onClick={() => setTab('album')}>相册</a>
        <a className={tab === 'story' ? 'on' : ''} onClick={() => setTab('story')}>
          故事{d.state === 'ready' ? '' : ' · 未生成'}</a>
      </div>

      {tab === 'album' && (<>
        {!!pend.length && (<div className="sy-day">
          <div className="dh"><b>正在上传</b><span>{pend.length} 个</span></div>
          <div className="sy-grid">{pend.map(x => (
            <div className="sy-th up" key={x.key}>
              {x.url ? <img src={x.url} alt="" /> : <span className="ph"><Icon n="send" s={14} c="#b9c2bd" /></span>}
              <em className="upi">{x.err ? '失败' : '上传中'}</em>
            </div>))}</div>
        </div>)}

        {!!unsorted.length && (<div className="sy-day">
          <div className="dh"><b>待归类</b>
            <span>{unsorted.length} 个 · 这些照片没带拍摄时间，系统不知道是第几天</span></div>
          <div className="dtip">
            微信或截图保存过的照片会丢掉拍摄时间。点开任意一张可以选是第几天；
            也可以<a onClick={spread}>按顺序平均分到各天</a>，再自己微调。
          </div>
          <div className="sy-grid">{unsorted.map(m => <Thumb key={m.id} m={m} onClick={() => setBig(m)} />)}</div>
        </div>)}
        {days.map(dy => (
          <div className="sy-day" key={dy.d}>
            <div className="dh">
              <b>D{dy.d}</b><span>{dy.city}{dy.planTitle ? ' · ' + dy.planTitle : ''}</span>
              <em onClick={() => { setNoteOn(dy.d); setNoteTx(dy.note || ''); }}>
                {dy.note ? '改一句' : '写一句'}</em>
            </div>
            {dy.note && <div className="dn">{dy.note}</div>}
            {dy.media.length ? <div className="sy-grid">
              {dy.media.map(m => <Thumb key={m.id} m={m} onClick={() => setBig(m)} />)}
            </div> : <div className="dz">这天还没有素材</div>}
          </div>
        ))}
        {!days.length && <div className="nm-empty">这次出行还没有行程表，素材会先放在「待归类」</div>}
      </>)}

      {tab === 'story' && (d.state !== 'ready'
        ? <div className="sy-empty">
          <Icon n="sparkle" s={26} c="var(--gold)" />
          <b>还没有生成故事</b>
          <span>传完照片后点下面的「生成旅途故事」，AI 会照着你的行程和照片，按天写成一篇故事。</span>
        </div>
        : <div className="sy-read">
          {d.intro && <p className="lead">{d.intro}</p>}
          {days.filter(x => x.text || x.media.length).map(dy => (
            <div className="sec" key={dy.d}>
              <div className="sh"><i>D{dy.d}</i><b>{dy.title || dy.planTitle}</b>
                {dy.city && <span>{dy.city}</span>}</div>
              {dy.text && <p>{dy.text}</p>}
              {!!dy.media.length && <div className="pics">
                {dy.media.map(m => (m.kind === 'video'
                  ? <video key={m.id} src={m.url} poster={m.thumb} controls playsInline preload="none" />
                  : <img key={m.id} src={m.url} alt="" onClick={() => setBig(m)} />))}
              </div>}
            </div>
          ))}
          {d.outro && <p className="tail">{d.outro}</p>}
          <div className="sy-sign">
            <span>{d.shop || '优定制'}{d.sales_name ? ` · 顾问 ${d.sales_name}` : ''}</span>
            <em>{d.gen_by === 'template' ? '本篇按行程自动排版' : 'AI 依据你的行程与素材撰写'}</em>
          </div>
          <label className="sy-auth">
            <input type="checkbox" checked={!!d.authorized} onChange={async e => {
              await put(`/api/mini/story/${orderNo}`, { phone, authorized: e.target.checked ? 1 : 0 });
              toast(e.target.checked ? '谢谢，我们可能会在产品页展示（会打码人脸）' : '已取消授权'); reload();
            }} />
            <span>同意众信把这次的照片用于产品展示</span>
          </label>
        </div>)}
    </div>

    {/* 吸底操作条 */}
    <div className="sy-bar">
      <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={pick} />
      <button className="o" disabled={!!up} onClick={() => fileRef.current && fileRef.current.click()}>
        <Icon n="plus" s={15} />{up ? `上传中 ${up.i}/${up.n}` : '传照片 / 视频'}</button>
      {d.state === 'ready'
        ? <button className="p" onClick={toFrame}><Icon n="send" s={15} c="#fff" />推到相框</button>
        : <button className="p" disabled={gen || !(d.media || []).length} onClick={generate}>
          {gen ? 'AI 正在写…' : '生成旅途故事'}</button>}
      {d.state === 'ready' && <button className="o sm" disabled={gen} onClick={generate}>{gen ? '写…' : '重写'}</button>}
    </div>

    {up && <div className="sy-up"><div className="bar"><i style={{ width: up.pct + '%' }} /></div>
      <span>{up.step || '正在上传'} {up.i}/{up.n}{up.pct ? ` · ${up.pct}%` : '…'}
        <em>{(up.name || '').slice(0, 18)}</em></span></div>}

    {big && <div className="sy-big" onClick={() => setBig(null)}>
      <div className="bd" onClick={e => e.stopPropagation()}>
        {big.kind === 'video' ? <video src={big.url} poster={big.thumb} controls autoPlay playsInline />
          : <img src={big.url} alt="" />}
        <div className="ops">
          <select value={big.day || 0} onChange={e => { setDay(big, +e.target.value); setBig({ ...big, day: +e.target.value }); }}>
            <option value={0}>待归类</option>
            {days.map(x => <option key={x.d} value={x.d}>D{x.d} {x.city}</option>)}
          </select>
          {big.kind === 'photo' && <button onClick={() => setCover(big)}>设为封面</button>}
          <button className="r" onClick={() => remove(big)}>删除</button>
          <button onClick={() => setBig(null)}>关闭</button>
        </div>
        {big.shot_at && <div className="meta">拍摄于 {big.shot_at}</div>}
      </div>
    </div>}

    {noteOn !== null && <div className="sy-big" onClick={() => setNoteOn(null)}>
      <div className="bd note" onClick={e => e.stopPropagation()}>
        <b>第 {noteOn} 天，想说点什么？</b>
        <span>写一句就行，生成故事时 AI 会把它揉进这一天。</span>
        <textarea rows={4} value={noteTx} onChange={e => setNoteTx(e.target.value)}
          placeholder="例：这天下了雨，反而把人都挡在外面，我们在教堂里坐了一下午" />
        <div className="ops"><button onClick={() => setNoteOn(null)}>取消</button>
          <button className="p" onClick={saveNote}>记下</button></div>
      </div>
    </div>}
  </div>);
}

function Thumb({ m, onClick }) {
  return (<div className="sy-th" onClick={onClick}>
    {m.kind === 'video'
      ? <>{m.thumb ? <img src={m.thumb} alt="" /> : <span className="ph"><Icon n="send" s={14} c="#b9c2bd" /></span>}
        <em className="v">{m.dur ? Math.round(m.dur) + '″' : '视频'}</em></>
      : <img src={m.url} alt="" loading="lazy" />}
    {m.is_cover ? <em className="c">封面</em> : null}
  </div>);
}

/* ---------- 公开分享页：不用登录，家人朋友点开就能看 ---------- */
export function StoryShare({ token, onBack }) {
  const { d, loading } = useData(() => get('/api/story/share/' + token), [token]);
  if (loading) return <div className="empty" style={{ paddingTop: 160 }}>正在打开这篇旅途故事…</div>;
  if (!d || d.err) return <div className="empty" style={{ paddingTop: 160 }}>
    <div className="ic">◎</div>链接已失效，或故事还没生成</div>;
  return (<div className="sy-share">
    <div className="hero">
      {d.cover ? <img src={d.cover} alt="" /> : null}
      <div className="ov">
        <div className="tk">旅途故事</div>
        <h1>{d.title}</h1>
        <p>{d.dest} · {d.go_date || ''} · 照片 {d.nPhoto} 张{d.nVideo ? ` · 视频 ${d.nVideo} 段` : ''}</p>
      </div>
    </div>
    <div className="bd">
      {d.intro && <p className="lead">{d.intro}</p>}
      {d.days.filter(x => x.text || x.media.length).map(dy => (
        <div className="sec" key={dy.d}>
          <div className="sh"><i>D{dy.d}</i><b>{dy.title}</b>{dy.city && <span>{dy.city}</span>}</div>
          {dy.text && <p>{dy.text}</p>}
          {!!dy.media.length && <div className="pics">
            {dy.media.map((m, i) => (m.kind === 'video'
              ? <video key={i} src={m.url} poster={m.thumb} controls playsInline preload="none" />
              : <figure key={i}><img src={m.url} alt="" loading="lazy" />
                {m.caption && <figcaption>{m.caption}</figcaption>}</figure>))}
          </div>}
        </div>
      ))}
      {d.outro && <p className="tail">{d.outro}</p>}
      <div className="sign">
        <b>{d.shop || '众信旅游 · 优定制'}</b>
        {d.sales_name && <span>旅行顾问 {d.sales_name}</span>}
        <em>这趟行程由众信旅游定制 · 想要一条属于你的路线？找我们聊聊</em>
      </div>
      {onBack && <button className="bk" onClick={onBack}>返回</button>}
    </div>
  </div>);
}
