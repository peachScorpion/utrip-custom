const B = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
async function j(url, opt) {
  const r = await fetch(B + url, { headers: { 'Content-Type': 'application/json' }, ...opt });
  const t = await r.text();
  let d; try { d = JSON.parse(t); } catch { d = t; }
  if (!r.ok) throw new Error((d && d.err) || ('HTTP ' + r.status));
  return d;
}
export const get = u => j(u);
export const post = (u, b) => j(u, { method: 'POST', body: JSON.stringify(b || {}) });
export const put = (u, b) => j(u, { method: 'PUT', body: JSON.stringify(b || {}) });
export const del = u => j(u, { method: 'DELETE' });
export const money = n => '¥' + Number(n || 0).toLocaleString('zh-CN');
export const money0 = n => Number(n || 0).toLocaleString('zh-CN');
export const ST_CN = { pending:'待接单', taken:'已接单', following:'跟进中', quoting:'报价中', won:'已成交', lost:'已流失' };
export const SRC_CN = { mini_form:'小程序·需求表单', mini_ai:'小程序·AI行程师', csp_agent:'门店·定制师对话', csp_manual:'门店·手工建单', share_page:'销售分享页·客户下单' };
