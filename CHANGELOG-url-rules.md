# URL 规则适配改动记录

**日期**: 2026-03-23
**改动范围**: uwillberich-reports (server.js, report-view.js) + uwillberich (session_report.py)

## 新 URL 规则

```
/                     → 首页
/{YYYYMMDD}/          → 日期汇总
/{YYYYMMDD}/pq        → 盘前日报
/{YYYYMMDD}/pz        → 盘中日报
/{YYYYMMDD}/ph        → 盘后日报
```

公网路径（经 nginx 代理）：
- 动态版: `http://120.26.32.59/reports/{YYYYMMDD}/pq`
- 静态版: `http://120.26.32.59/apps/chaochao/{YYYYMMDD}/pq`

## 改动明细

### server.js

1. **新增 slug 映射表**
   - `SLUG_TO_SESSION`: `{ pq: 'pre_market', pz: 'mid_market', ph: 'after_market' }`
   - `SESSION_TO_SLUG`: 反向映射
   - `resolveSessionKey()`: 统一解析，API 同时接受 `pq` 和 `pre_market`

2. **SESSION_CONFIG 添加 slug 字段**
   - 每个 session 配置新增 `slug` 属性

3. **新增路由**
   - `GET /:date` → 301 到 `/:date/`
   - `GET /:date/` → 日期汇总页（复用 index.html）
   - `GET /:date/:slug` → 报告详情页（复用 report-view.html）

4. **旧路由兼容**
   - `GET /report/:date/:session` → 301 重定向到 `/:date/:slug`

5. **API 输出变更**
   - `viewUrl`: `/report/20260322/pre_market` → `/20260322/pq`
   - `rawUrl`: `/raw-report/20260322/pre_market` → `/raw-report/20260322/pq`
   - 新增 `slug` 字段

6. **getReportByParams()** 支持 slug 和 session key 双入参

### public/js/report-view.js

- `loadReport()` 解析逻辑兼容两种 URL:
  - `/:date/:slug` (新)
  - `/report/:date/:session` (旧)

### session_report.py

1. **新增 `SESSION_SLUG` 常量**: `pre_market→pq, mid_market→pz, after_market→ph`
2. **新增 `--rebuild-static` 参数**: 发布报告后自动调用 static-report-site build.py 重建静态站
3. **新增 `rebuild_static_site()` 函数**: 自动查找 build.py，生成临时 config，构建 zip

## 验证结果

| 测试项 | 状态 |
|--------|------|
| `/api/reports` viewUrl 返回新 slug | ✅ |
| `/api/report/:date/pq` 正常响应 | ✅ |
| `/20260322/` 日期页可访问 | ✅ |
| `/20260322/pq` 报告页可访问 | ✅ |
| `/report/20260322/pre_market` 301 到 `/20260322/pq` | ✅ |
| chaochao 静态站同步更新 | ✅ |
