# 新闻采集系统上线 + 定时任务配置

**日期**: 2026-03-23

## 架构变更

动态版 (`/reports/`) 从"日报展示"扩展为"日报 + 实时新闻"。

```
                    ┌──────────────┐
                    │   crontab    │
                    └──┬───┬───┬──┘
          每5分钟     │   │   │   定时生成日报
        ┌─────────────┘   │   └─────────────────┐
        ▼                 ▼                     ▼
  news_collector.py   session_report.py   build.py (静态化)
        │                 │                     │
        ▼                 ▼                     ▼
  /public/news/      /public/reports/     chaochao 静态站
  latest_news.json   *_methodology.md     /apps/chaochao/
```

## 新增文件

### news_collector.py
国内新闻聚合器，3 个数据源 + 1 个可选源：

| 数据源 | 类型 | 每次采集量 | 说明 |
|--------|------|-----------|------|
| 东方财富快讯 | JSONP API | ~50 条 | 实时财经快讯 |
| 财联社电报 | JSON API | ~30 条 | 专业财经电报 |
| 新浪 7x24 | JSON API | ~30 条 | 滚动资讯 |
| 百度 AI 搜索 | POST API | 2 条摘要 | 可选，较慢 |

- SQLite 持久化去重
- 输出 Markdown + JSON
- 支持 `--loop` 持续运行模式
- 工作时间：09:00-21:00

### cron.sh
统一的 cron 调度入口：
- `cron.sh news` — 采集新闻
- `cron.sh pq` — 生成盘前日报 + 重建静态站
- `cron.sh pz` — 生成盘中日报 + 重建静态站
- `cron.sh ph` — 生成盘后日报 + 重建静态站

### server.js 变更
新增 `GET /api/news` 接口，读取 `public/news/latest_news.json`。

## 定时任务 (crontab)

| 任务 | 时间 | 周期 |
|------|------|------|
| 新闻采集 | 09:00-20:55 每5分钟 | 周一至周五 |
| 盘前日报 | 09:28 | 周一至周五 |
| 盘中日报 | 11:35 | 周一至周五 |
| 盘后日报 | 15:05 | 周一至周五 |
| 盘后日报(晚间) | 21:05 | 周一至周五 |

## 远程服务器环境

- Python: 3.11.13 (venv at /root/uwillberich/.venv)
- 零第三方依赖（全部用标准库）
- API Keys: EM_API_KEY + BAIDU_API_KEY (in ~/.uwillberich/runtime.env)
- 日志: ~/.uwillberich/logs/

## 验证结果

| 测试项 | 状态 |
|--------|------|
| 东方财富采集 | ✅ 50 条 |
| 财联社采集 | ✅ 30 条 |
| 新浪采集 | ✅ 30 条 |
| 百度 AI 搜索 | ⚠️ 部分超时，已降级为 2 个查询 |
| /api/news 接口 | ✅ 114 条 |
| crontab 配置 | ✅ |
