/* 富文本编辑器（Quill 2）：行程详情、预订须知、退改政策这类要排版的长文用它。
   存的是 HTML，前端渲染直接用 dangerouslySetInnerHTML（内容由运营录入，不接受外部输入）。 */
import React, { useEffect, useRef } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import './rich.css';

const TOOLBAR = [
  [{ header: [2, 3, false] }],
  ['bold', 'italic', 'underline'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  [{ color: [] }],
  ['blockquote', 'link'],
  ['clean'],
];

export function Rich({ value, onChange, placeholder, minH = 160 }) {
  const box = useRef(null);
  const q = useRef(null);
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    if (q.current || !box.current) return;
    const el = document.createElement('div');
    box.current.appendChild(el);
    q.current = new Quill(el, {
      theme: 'snow',
      placeholder: placeholder || '在这里输入内容…',
      modules: { toolbar: TOOLBAR },
    });
    if (value) q.current.clipboard.dangerouslyPasteHTML(value);
    q.current.on('text-change', () => {
      const html = q.current.root.innerHTML;
      cb.current(html === '<p><br></p>' ? '' : html);
    });
  }, []);
  // 外部换了内容（比如从众信导入）时同步进来
  useEffect(() => {
    if (!q.current) return;
    const cur = q.current.root.innerHTML;
    const next = value || '';
    if (cur === next || (cur === '<p><br></p>' && !next)) return;
    const sel = q.current.getSelection();
    q.current.clipboard.dangerouslyPasteHTML(next);
    if (sel) { try { q.current.setSelection(sel); } catch (e) { /* 忽略越界 */ } }
  }, [value]);
  return <div className="rich" style={{ '--minh': minH + 'px' }} ref={box} />;
}

/* 只读渲染 */
export function RichView({ html, className }) {
  if (!html) return <span className="od-na">—</span>;
  return <div className={'rich-view ' + (className || '')} dangerouslySetInnerHTML={{ __html: html }} />;
}
