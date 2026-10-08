import React from 'react';
import { useParams } from 'react-router-dom';
import TripView from './TripView.jsx';
import '../mini/mini.css';

/* 客人从分享链接打开：PC 上也套一层手机壳，保证和小程序里看到的是同一个东西 */
export default function Trip() {
  const { token } = useParams();
  return (
    <div className="mi-stage">
      <div className="mi-wrap">
        <div className="mi-note">
          <div className="tk" style={{ color: 'var(--accent-3)' }}>SHARED ITINERARY</div>
          <h2 className="serif" style={{ color: '#fff', fontSize: 26, fontWeight: 400, margin: '10px 0 12px' }}>你的专属行程</h2>
          <p style={{ fontSize: 13, lineHeight: 1.85, margin: 0 }}>
            这是顾问转发给客人的行程页。客人可以逐天翻看，对住宿、餐食、体验逐条提意见，
            意见会实时回到门店工作台。
          </p>
        </div>
        <div className="mi-phone"><div className="mi-screen">
          <div className="mi-app"><TripView token={token} /></div>
        </div></div>
      </div>
    </div>
  );
}
