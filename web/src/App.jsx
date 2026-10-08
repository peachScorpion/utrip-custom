import React from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import Share from './apps/share/Share.jsx';
import { ToastHost, Icon } from './shared/ui.jsx';
import Mini from './apps/mini/Mini.jsx';
import Csp from './apps/csp/Csp.jsx';
import Uom from './apps/uom/Uom.jsx';
import Ubk from './apps/ubk/Ubk.jsx';
import Trip from './apps/trip/Trip.jsx';
import StoryPage from './apps/trip/StoryPage.jsx';

const ENTRIES = [
  { to: '/mini', sys: 'C 端小程序', who: '客人 / 潜在客户', name: '优定制', en: 'U-DESIGN · GUEST MINI-APP', ic: 'compass',
    desc: '客人浏览灵感之旅与臻品团，AI 定制一分钟出方案，提交需求直达门店。',
    pts: ['首页 · 目的地 · 臻品团 · 我的', 'AI 定制（结构化出行程）', '需求表单直落咨询单'] },
  { to: '/csp', sys: '门店端', who: '门店店长 / 定制销售', name: '定制咨询工作台', en: 'STORE CONSOLE', ic: 'grid',
    desc: '咨询单看板、全链路状态流转、定制师对话建单、供应商派单与 AI 比价。',
    pts: ['看板指标 · 三项金额对照', '接单→确认→派单→报价→成交', '定制师对话 · 行程改版留痕'] },
  { to: '/uom', sys: '总部端', who: '总部运营 / 产品经理', name: '运营配置中心', en: 'OPERATION ADMIN', ic: 'cog',
    desc: '录入定制内容产品、可视化配置小程序首页、维护内容与供应商接单规则。',
    pts: ['定制产品维护 · 内容管理', '小程序首页可视化配置', '行程模板 · 定制规则 · 订单总览'] },
  { to: '/ubk', sys: '供应商端', who: '地接供应商 / 资源方', name: '供应商报价台', en: 'SUPPLIER DESK', ic: 'box',
    desc: '接收门店派来的定制单，逐天标注资源，出结算报价回传门店。',
    pts: ['流转单接单', '逐天资源标注', '分项报价（平台自供自动排除）'] },
];

function Portal() {
  const nav = useNavigate();
  return (
    <div style={{ minHeight: '100%', background: 'var(--ink)', color: '#fff', overflow: 'auto' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '54px 28px 70px' }}>
        <div className="fade-in">
          <div className="tk" style={{ color: 'var(--gold-2)' }}>ZHONGXIN · CUSTOM TRAVEL PLATFORM</div>
          <h1 className="serif" style={{ fontSize: 'clamp(30px,5vw,50px)', fontWeight: 400, margin: '14px 0 10px', letterSpacing: '.01em', lineHeight: 1.18 }}>
            U-DESIGN 优定制<span style={{ color: 'var(--gold-2)' }}>.</span>
          </h1>
          <p style={{ color: '#9fada8', maxWidth: 600, margin: 0, fontSize: 14.5, lineHeight: 1.8 }}>
            定制旅游前后端一体化平台。从总部配置产品、客人自助规划，到门店接单出方案、供应商报价成交——
            四端同一套数据，一条链路走通。
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
            {['真实数据库贯通', '四端实时同步', 'AI 行程编排', '全流程状态机'].map(t =>
              <span key={t} style={{ fontSize: 11.5, padding: '5px 13px', borderRadius: 999, border: '1px solid rgba(255,255,255,.16)', color: '#c8d2ce' }}>{t}</span>)}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(272px,1fr))', gap: 16, marginTop: 40 }}>
          {ENTRIES.map((e, i) => (
            <div key={e.to} className="fade-in" style={{ animationDelay: (i * 70) + 'ms' }}>
              <div onClick={() => nav(e.to)} style={{
                background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 18,
                padding: '24px 22px 20px', cursor: 'pointer', height: '100%', transition: '.22s', display: 'flex', flexDirection: 'column',
              }}
                onMouseEnter={ev => { ev.currentTarget.style.background = 'rgba(255,255,255,.085)'; ev.currentTarget.style.borderColor = 'var(--gold)'; ev.currentTarget.style.transform = 'translateY(-3px)'; }}
                onMouseLeave={ev => { ev.currentTarget.style.background = 'rgba(255,255,255,.045)'; ev.currentTarget.style.borderColor = 'rgba(255,255,255,.1)'; ev.currentTarget.style.transform = 'none'; }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(207,174,116,.16)', display: 'grid', placeItems: 'center', marginBottom: 16 }}>
                  <Icon n={e.ic} s={19} c="var(--gold-2)" />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', background: 'rgba(207,174,116,.22)',
                    border: '1px solid rgba(207,174,116,.45)', padding: '3px 10px', borderRadius: 3, letterSpacing: '.02em' }}>{e.sys}</span>
                </div>
                <div style={{ fontSize: 9.5, letterSpacing: '.2em', color: 'var(--gold-2)', textTransform: 'uppercase' }}>{e.en}</div>
                <div className="serif" style={{ fontSize: 20, margin: '5px 0 6px' }}>{e.name}</div>
                <div style={{ fontSize: 11.5, color: '#9aa7a3', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon n="user" s={12} c="#7f8d89" />使用角色：{e.who}</div>
                <p style={{ fontSize: 13, color: '#a9b5b1', lineHeight: 1.75, margin: '0 0 14px' }}>{e.desc}</p>
                <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 12 }}>
                  {e.pts.map(p => <div key={p} style={{ fontSize: 12, color: '#8e9c97', display: 'flex', gap: 7, marginBottom: 4 }}>
                    <span style={{ color: 'var(--gold)' }}>—</span>{p}</div>)}
                </div>
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--gold-2)', fontSize: 13, fontWeight: 600 }}>
                  进入 <Icon n="arrow" s={15} c="var(--gold-2)" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 44, padding: '20px 22px', border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, background: 'rgba(255,255,255,.03)' }}>
          <div className="tk" style={{ color: 'var(--gold-2)' }}>DEMO ROUTE · 推荐演示动线</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, alignItems: 'center' }}>
            {['运营后台建产品 · 配首页', '小程序浏览 · AI 出行程', '提交需求 → 落咨询单', '门店接单 · 确认方案', '派单给供应商', '供应商标资源 · 出报价', 'AI 比价 · 选定成交'].map((s, i, a) => (
              <React.Fragment key={s}>
                <span style={{ fontSize: 12.5, padding: '6px 13px', borderRadius: 8, background: 'rgba(255,255,255,.07)', color: '#c5cfcb' }}>
                  <b style={{ color: 'var(--gold-2)', marginRight: 6 }}>{i + 1}</b>{s}</span>
                {i < a.length - 1 && <Icon n="arrow" s={13} c="#5d6b67" />}
              </React.Fragment>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 26, fontSize: 11.5, color: '#66736f' }}>
          众信旅游 · 优定制 · 演示环境（数据可写，操作真实落库）
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastHost>
      <Routes>
        <Route path="/" element={<Portal />} />
        <Route path="/mini/*" element={<Mini />} />
        <Route path="/csp/*" element={<Csp />} />
        <Route path="/uom/*" element={<Uom />} />
        <Route path="/ubk/*" element={<Ubk />} />
        <Route path="/trip/:token" element={<Trip />} />
        {/* 销售分享给客人的产品行程页：比 TOC 版多了进度、总价与每日吃住行 */}
        <Route path="/share/:id" element={<Share />} />
        <Route path="/story/:token" element={<StoryPage />} />
      </Routes>
    </ToastHost>
  );
}
