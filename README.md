# UTRIP 优定制 · 定制旅游一体化平台

一套代码跑五个端，共用一个 Node + SQLite 后端。

| 端 | 路径 | 给谁用 |
|---|---|---|
| 小程序（客人端） | `/#/mini` | 客人浏览产品、AI 排行程、提交定制需求、看订单与会员 |
| 销售分享页 | `/#/share/:产品ID` | 销售发给客人的行程方案页（带进度、总价、每日吃住行） |
| 行程分享页 | `/#/trip/:token` | 顾问发给客人的定制行程，客人可逐天提意见 |
| CSP 门店工作台 | `/#/csp` | 门店销售：接单、改需求、改行程、派单比价、成交建单 |
| UOM 运营后台 | `/#/uom` | 总部：产品、内容、会员、订单、资源库、公共配置 |
| UBK 供应商后台 | `/#/ubk` | 地接社：接单、核资源、报价 |

## 跑起来

```bash
npm install
npm run seed      # 可选：灌一批演示数据（已有 utrip.db 时不要执行，会覆盖）
npm start         # 后端 + 静态站，默认 8930
```

浏览器打开 `http://localhost:8930/utrip/`。

前端改完要重新构建：

```bash
npx vite build --config web/vite.config.js
```

开发时也可以前后端分开跑：`npm run dev:server` + `npm run dev:web`。

## 目录

```
server/            后端（Express 5 + better-sqlite3）
  index.js         绝大部分接口、静态托管、SPA 回退
  member.js        会员体系：定级、权益、等级权益配置
  planner.js       AI 行程师的行程编排（纯代码，不调模型）
  quote.js         报价与费用
  tpl.js           行程模板
  db/index.js      建表与历次字段迁移（addCol）
  db/destinations.js  目的地与每日行程素材库
  db/coords.js     城市坐标（算跨城参考车程用）
web/src/
  apps/mini/       小程序端
  apps/csp/        门店工作台
  apps/uom/        运营后台
  apps/ubk/        供应商后台
  apps/trip/       行程分享页
  apps/share/      销售分享页
  shared/          跨端共用：接口封装、UI 组件、富文本、图片压缩、订单模块
web/public/        静态素材
web/dist/          构建产物（服务端直接托管这里）
utrip.db           SQLite 数据库
design/            设计稿与参考
audit/             走查报告
```

## 几件要知道的事

- **数据库是 SQLite 单文件** `utrip.db`，直接拷走就是全量数据。字段变更一律写在
  `server/db/index.js` 末尾的 `addCol(...)` 里，启动时自动补列，不需要手写迁移脚本。
- **样式表是打进同一个 bundle 的**，`apps/mini`、`apps/uom`、`shared/orders.css` 之间
  类名会互相覆盖。新页面请像 `apps/share/share.css` 那样整表限定作用域（`.sh-wrap xxx`），
  否则 `.op`、`.items` 这类通用名一定会撞。
- **前端有版本自检**：页面每 2 分钟、以及每次重新可见时比对服务端入口文件名，
  发现发了新版就自己刷新（正在填写的页面不打断）。所以发版后不用让客人清缓存。
- **咨询单对客户的可见性**由 `consult.guest_visible` 控制：客人提交后默认 0，
  顾问在 CSP 核对确认后发布才变 1，客人端才查得到这张单与完整行程。
- 行程方案存 `plan` + `day` 两张表，`is_cur=1` 是当前版本。CSP 里改行程改的就是这一份，
  客户端读的也是它，所以保存即同步。
