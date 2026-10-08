/* 后台页面与地址栏同步：切菜单会改 URL，刷新 / 复制链接都能回到同一页。
   形如 #/uom/order/DD0080999136 —— 第一段是菜单，第二段是详情 id。 */
import { useLocation, useNavigate } from 'react-router-dom';

export function usePage(base, def) {
  const loc = useLocation();
  const nav = useNavigate();
  const rest = loc.pathname.startsWith(base) ? loc.pathname.slice(base.length) : '';
  const seg = rest.replace(/^\/+/, '').split('/').filter(Boolean);
  const page = seg[0] || def;
  const arg = seg[1] ? decodeURIComponent(seg[1]) : null;
  const go = (p, a) => nav(`${base}/${p}${a ? '/' + encodeURIComponent(a) : ''}`);
  const setArg = a => nav(`${base}/${page}${a ? '/' + encodeURIComponent(a) : ''}`,
    { replace: !a });
  return { page, arg, go, setArg };
}
