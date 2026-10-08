import React from 'react';
import { useParams } from 'react-router-dom';
import { StoryShare } from '../mini/Story.jsx';
import '../mini/mini.css';

/* 客人把旅途故事分享给家人朋友：链接直接打开这一页。
   PC 上套手机壳，和客人在小程序里看到的是同一个东西。 */
export default function StoryPage() {
  const { token } = useParams();
  return (
    <div className="mi-stage">
      <div className="mi-wrap">
        <div className="mi-note">
          <div className="tk" style={{ color: 'var(--accent-3)' }}>TRAVEL STORY</div>
          <h2 className="serif" style={{ color: '#fff', fontSize: 26, fontWeight: 400, margin: '10px 0 12px' }}>一篇旅途故事</h2>
          <p style={{ fontSize: 13, lineHeight: 1.85, margin: 0 }}>
            客人把这趟行程里拍的照片和视频传进小程序，AI 照着他真实走过的行程按天写成故事。
            链接可以转发给家人朋友，也能推到家里的数字相框循环播放。
          </p>
        </div>
        <div className="mi-phone"><div className="mi-screen">
          <div className="mi-app"><StoryShare token={token} /></div>
        </div></div>
      </div>
    </div>
  );
}
