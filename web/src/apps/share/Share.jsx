import React from 'react';
import ShareTrip from './ShareTrip.jsx';
import '../mini/mini.css';

/* 客人从销售发来的链接打开：PC 上套一层手机壳，和客人手机上看到的是同一个东西，
   销售自己预览时也能确认客人那边的版面。 */
export default function Share() {
  return (
    <div className="mi-stage">
      <div className="mi-wrap">
        <div className="mi-note">
          <div className="tk" style={{ color: 'var(--accent-3)' }}>SHARED PROPOSAL</div>
          <h2 className="serif" style={{ color: '#fff', fontSize: 26, fontWeight: 400, margin: '10px 0 12px' }}>给客人的行程方案</h2>
          <p style={{ fontSize: 13, lineHeight: 1.85, margin: 0 }}>
            顾问转发给客人的版本：顶部是这单走到哪一步，中间是按人数算好的总价，
            每天的三餐、交通与酒店逐条列清楚。链接可直接发微信。
          </p>
        </div>
        <div className="mi-phone"><div className="mi-screen">
          <div className="mi-app"><ShareTrip /></div>
        </div></div>
      </div>
    </div>
  );
}
