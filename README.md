# uwillberich Reports Dashboard

A 股盘前、午盘、盘后日报的浏览入口。当前版本是远端 Qwen 改造后的 Node/Express 仪表盘基线，并在此基础上补了更稳的报告索引、详情页和多命名格式兼容。

## 目录结构

```text
uwillberich-reports/
├── public/
│   ├── css/
│   ├── js/
│   ├── reports/
│   ├── index.html
│   └── report-view.html
├── ecosystem.config.cjs
├── nginx.conf
├── package.json
└── server.js
```

## 当前能力

- 按日期聚合日报，并展示盘前 / 午盘 / 盘后三个时段的覆盖情况
- 支持 `public/reports/` 和 `~/.uwillberich/reports/` 双目录扫描
- 兼容 `YYYYMMDD`、`YYYY-MM-DD`、`morning_brief_latest.html` 这类不同命名
- 详情页支持 HTML 原样嵌入，也支持 Markdown 服务端渲染
- 同一天多个候选文件时，优先选择显式日期 + 显式时段 + HTML 版本

## API

- `GET /api/health`
- `GET /api/reports`
- `GET /api/reports/:date`
- `GET /api/report/:date/:session`
- `GET /raw-report/:date/:session`

其中 `session` 取值：

- `pre_market`
- `mid_market`
- `after_market`

## 本地运行

```bash
npm ci
npm run check
npm start
```

默认监听 `3000`，可通过环境变量覆盖：

```bash
PORT=3000 HOST=0.0.0.0 npm start
```

## PM2

```bash
pm2 start ecosystem.config.cjs
pm2 restart uwillberich-reports
pm2 logs uwillberich-reports
```

## 命名约定

系统会根据文件名或文件内容识别日期和时段：

- 盘前：`morning`、`preopen`、`pre-market`、`晨报`、`盘前`
- 午盘：`mid`、`midday`、`noon`、`午盘`
- 盘后：`postclose`、`after-market`、`close`、`daily`、`盘后`、`收盘`

日期支持：

- `20260322`
- `2026-03-22`
- 文件名无日期时，会尝试从正文头部提取
