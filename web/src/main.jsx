import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './styles/base.css';   // 先加载基础层，模块样式才能正常覆盖
import App from './App.jsx';
createRoot(document.getElementById('root')).render(
  <HashRouter><App /></HashRouter>
);
