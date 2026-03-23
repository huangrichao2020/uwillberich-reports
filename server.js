'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const MarkdownIt = require('markdown-it');

const app = express();
const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
});

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const PUBLIC_REPORTS_DIR = path.join(PUBLIC_DIR, 'reports');
const LEGACY_REPORTS_DIR = path.join(process.env.HOME || '/root', '.uwillberich', 'reports');

const SLUG_TO_SESSION = { pq: 'pre_market', pz: 'mid_market', ph: 'after_market' };
const SESSION_TO_SLUG = { pre_market: 'pq', mid_market: 'pz', after_market: 'ph' };

function resolveSessionKey(param) {
  return SLUG_TO_SESSION[param] || param;
}

const SESSION_CONFIG = {
  pre_market: {
    label: '盘前日报',
    icon: '🌅',
    slug: 'pq',
    datePreference: 'last',
    patterns: [
      /盘前/,
      /晨报/,
      /pre[-_ ]?open/,
      /pre[-_ ]?market/,
      /premarket/,
      /morning/
    ]
  },
  mid_market: {
    label: '午盘日报',
    icon: '☀️',
    slug: 'pz',
    datePreference: 'first',
    patterns: [
      /午盘/,
      /mid[-_ ]?market/,
      /midday/,
      /noon/,
      /lunch/
    ]
  },
  after_market: {
    label: '盘后日报',
    icon: '🌙',
    slug: 'ph',
    datePreference: 'first',
    patterns: [
      /盘后/,
      /收盘/,
      /post[-_ ]?close/,
      /after[-_ ]?market/,
      /(?:^|[^a-z])close(?:[^a-z]|$)/,
      /(?:^|[^a-z])daily(?:[^a-z]|$)/,
      /(?:^|[^a-z])eod(?:[^a-z]|$)/,
      /evening/
    ]
  }
};

const REPORT_DIRS = [
  { dir: PUBLIC_REPORTS_DIR, source: 'dashboard', label: 'Dashboard' },
  { dir: LEGACY_REPORTS_DIR, source: 'legacy', label: 'Legacy' }
];

ensureDir(PUBLIC_REPORTS_DIR);

const PUBLIC_NEWS_DIR = path.join(PUBLIC_DIR, 'news');
ensureDir(PUBLIC_NEWS_DIR);

// Page routes (before static middleware to prevent directory redirect)
app.get('/news', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'news.html'));
});
app.get('/zt', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'zt.html'));
});
app.get('/insights', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'insights.html'));
});

app.use(express.static(PUBLIC_DIR));
app.use(express.json({ limit: '1mb' }));

// --- News API ---
app.get('/api/news', (req, res) => {
  const jsonPath = path.join(PUBLIC_NEWS_DIR, 'latest_news.json');
  if (!fs.existsSync(jsonPath)) {
    return res.json({ ok: true, items: [], updatedAt: null });
  }
  try {
    const items = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const stat = fs.statSync(jsonPath);
    res.json({ ok: true, items, updatedAt: stat.mtime.toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'failed to read news' });
  }
});

// --- Baidu AI Insights API ---
app.get('/api/baidu-insights', (req, res) => {
  const jsonPath = path.join(PUBLIC_NEWS_DIR, 'baidu_insights.json');
  if (!fs.existsSync(jsonPath)) {
    return res.json({ ok: true, items: [] });
  }
  try {
    const items = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const stat = fs.statSync(jsonPath);
    res.json({ ok: true, items, updatedAt: stat.mtime.toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'failed to read baidu insights' });
  }
});

// --- ZT Review API ---
app.get('/api/zt-review', (req, res) => {
  const reportsDir = PUBLIC_REPORTS_DIR;
  const files = fs.readdirSync(reportsDir).filter(f => f.endsWith('_zt_review.md')).sort().reverse();
  if (!files.length) {
    return res.json({ ok: true, date: null, content: '', renderedHtml: '' });
  }
  const latest = files[0];
  const dateMatch = latest.match(/^(\d{8})/);
  const content = fs.readFileSync(path.join(reportsDir, latest), 'utf8');
  res.json({
    ok: true,
    date: dateMatch ? dateMatch[1] : '',
    file: latest,
    content,
    renderedHtml: markdown.render(content)
  });
});

app.get('/api/health', (req, res) => {
  const index = buildReportsIndex();
  res.json({
    ok: true,
    scannedAt: new Date().toISOString(),
    dates: index.dates.length,
    reports: index.summary.totalReports
  });
});

app.get('/api/reports', (req, res) => {
  const index = buildReportsIndex();
  res.json({
    summary: index.summary,
    dates: index.dates.map(serializeDateEntry),
    scannedAt: new Date().toISOString()
  });
});

app.get('/api/reports/:date', (req, res) => {
  const index = buildReportsIndex();
  const dateKey = normalizeDateDigits(req.params.date);
  const dateEntry = index.byDate.get(dateKey);

  if (!dateEntry) {
    return res.status(404).json({ error: 'date not found' });
  }

  return res.json(serializeDateEntry(dateEntry));
});

app.get('/api/report/:date/:session', (req, res) => {
  const sessionKey = resolveSessionKey(req.params.session);
  const report = getReportByParams(req.params.date, sessionKey);
  if (!report) return res.status(404).json({ error: 'report not found' });

  const slug = SESSION_TO_SLUG[report.session] || report.session;
  const content = fs.readFileSync(report.filePath, 'utf8');
  res.json({
    date: report.date,
    dateLabel: formatDateLabel(report.date),
    session: report.session,
    slug,
    sessionLabel: report.sessionLabel,
    sessionIcon: report.sessionIcon,
    file: report.file,
    source: report.source,
    sourceLabel: report.sourceLabel,
    format: report.format,
    updatedAt: report.generatedAt,
    updatedLabel: report.generatedAtLabel,
    size: report.size,
    content,
    isHtml: report.format === 'html',
    isMarkdown: report.format === 'markdown',
    renderedHtml: report.format === 'markdown' ? markdown.render(content) : '',
    rawUrl: `/raw-report/${report.date}/${slug}`
  });
});

app.get('/raw-report/:date/:session', (req, res) => {
  const sessionKey = resolveSessionKey(req.params.session);
  const report = getReportByParams(req.params.date, sessionKey);
  if (!report) return res.status(404).send('Report not found');

  if (report.format === 'html') {
    return res.type('html').send(fs.readFileSync(report.filePath, 'utf8'));
  }

  return res.type('txt').send(fs.readFileSync(report.filePath, 'utf8'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// New: /:date → redirect to /:date/
app.get(/^\/(\d{8})$/, (req, res) => {
  res.redirect(301, `/${req.params[0]}/`);
});

// New: /:date/ → date summary page
app.get(/^\/(\d{8})\/$/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// New: /:date/:slug → report view (pq/pz/ph)
app.get(/^\/(\d{8})\/(pq|pz|ph)$/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'report-view.html'));
});

// Legacy: /report/:date/:session (backward compatible)
app.get('/report/:date/:session', (req, res) => {
  const slug = SESSION_TO_SLUG[req.params.session] || req.params.session;
  const date = normalizeDateDigits(req.params.date);
  res.redirect(301, `/${date}/${slug}`);
});

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function normalizeDateDigits(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 8);
}

function formatDateLabel(dateDigits) {
  if (!/^\d{8}$/.test(dateDigits)) return dateDigits;
  const year = Number(dateDigits.slice(0, 4));
  const month = Number(dateDigits.slice(4, 6));
  const day = Number(dateDigits.slice(6, 8));
  return `${year}年${month}月${day}日`;
}

function getWeekdayLabel(dateDigits) {
  if (!/^\d{8}$/.test(dateDigits)) return '';
  const year = Number(dateDigits.slice(0, 4));
  const month = Number(dateDigits.slice(4, 6)) - 1;
  const day = Number(dateDigits.slice(6, 8));
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return weekdays[new Date(year, month, day).getDay()];
}

function formatDateTimeLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function safeReadPreview(filePath, limit = 5000) {
  try {
    return fs.readFileSync(filePath, 'utf8').slice(0, limit);
  } catch {
    return '';
  }
}

function extractDateCandidates(text) {
  const candidates = [];
  const seen = new Set();

  for (const match of String(text || '').matchAll(/(?<!\d)\d{4}[-_/]?\d{2}[-_/]?\d{2}(?!\d)/g)) {
    const digits = normalizeDateDigits(match[0]);
    if (digits.length !== 8 || seen.has(digits)) continue;
    seen.add(digits);
    candidates.push({ digits, index: match.index || 0, raw: match[0] });
  }

  return candidates;
}

function detectSessionKey(text) {
  const normalized = String(text || '').toLowerCase();
  for (const [sessionKey, config] of Object.entries(SESSION_CONFIG)) {
    if (config.patterns.some((pattern) => pattern.test(normalized))) {
      return sessionKey;
    }
  }
  return null;
}

function chooseDateForSession(dateCandidates, sessionKey) {
  if (!dateCandidates.length) return null;
  if (dateCandidates.length === 1) return dateCandidates[0].digits;

  const preference = SESSION_CONFIG[sessionKey]?.datePreference || 'first';
  return preference === 'last'
    ? dateCandidates[dateCandidates.length - 1].digits
    : dateCandidates[0].digits;
}

function extractGeneratedAt(fileName, preview, stat) {
  const fileMatch = fileName.match(/(\d{8})[_-](\d{6})/);
  if (fileMatch) {
    return timestampDigitsToIso(fileMatch[1], fileMatch[2]);
  }

  const previewMatch = String(preview || '').match(/(20\d{2})[-/](\d{2})[-/](\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (previewMatch) {
    const [, year, month, day, hour, minute, second = '00'] = previewMatch;
    return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  }

  return stat.mtime.toISOString();
}

function timestampDigitsToIso(dateDigits, timeDigits) {
  const year = dateDigits.slice(0, 4);
  const month = dateDigits.slice(4, 6);
  const day = dateDigits.slice(6, 8);
  const hour = timeDigits.slice(0, 2);
  const minute = timeDigits.slice(2, 4);
  const second = timeDigits.slice(4, 6);
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

function extractPreviewText(preview) {
  return String(preview || '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#') && !line.startsWith('---')) || '';
}

function buildReportEntries() {
  const entries = [];
  const seenFiles = new Set();

  for (const { dir, source, label } of REPORT_DIRS) {
    if (!fs.existsSync(dir)) continue;

    for (const fileName of fs.readdirSync(dir).sort()) {
      const filePath = path.join(dir, fileName);
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;

      const ext = path.extname(fileName).toLowerCase();
      if (!['.html', '.md', '.txt'].includes(ext)) continue;

      const dedupeKey = fileName.toLowerCase();
      if (seenFiles.has(dedupeKey)) continue;
      seenFiles.add(dedupeKey);

      const fileStem = fileName.slice(0, ext.length ? -ext.length : undefined);
      const preview = safeReadPreview(filePath);
      const fileDateCandidates = extractDateCandidates(fileStem);
      const sessionFromFile = detectSessionKey(fileStem);
      const sessionFromPreview = detectSessionKey(preview);
      const sessionKey = sessionFromFile || sessionFromPreview;
      if (!sessionKey) continue;

      const dateCandidates = fileDateCandidates.length ? fileDateCandidates : extractDateCandidates(preview);
      const date = chooseDateForSession(dateCandidates, sessionKey);
      if (!date) continue;

      const generatedAt = extractGeneratedAt(fileStem, preview, stat);
      const format = ext === '.html' ? 'html' : ext === '.md' ? 'markdown' : 'text';
      const hasExplicitDate = fileDateCandidates.length > 0;
      const hasExplicitSession = Boolean(sessionFromFile);
      const isLatestAlias = /latest/.test(fileStem.toLowerCase());
      const isMethodologyReport =
        /methodology|session[_-]?report|desk/.test(fileStem.toLowerCase()) ||
        /三层框架|市场状态分类|明日三路径|午后三路径|今日三路径/.test(preview);

      entries.push({
        date,
        session: sessionKey,
        sessionLabel: SESSION_CONFIG[sessionKey].label,
        sessionIcon: SESSION_CONFIG[sessionKey].icon,
        file: fileName,
        filePath,
        format,
        source,
        sourceLabel: label,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        generatedAt,
        generatedAtMs: new Date(generatedAt).getTime() || stat.mtimeMs,
        generatedAtLabel: formatDateTimeLabel(generatedAt),
        preview: format === 'markdown' ? extractPreviewText(preview) : '',
        hasExplicitDate,
        hasExplicitSession,
        isLatestAlias,
        isMethodologyReport,
        score:
          (isMethodologyReport ? 120 : 0) +
          (hasExplicitDate ? 100 : 0) +
          (hasExplicitSession ? 40 : 0) +
          (format === 'html' ? 20 : format === 'markdown' ? 10 : 0) +
          (isLatestAlias ? 0 : 5)
      });
    }
  }

  return entries;
}

function compareEntries(a, b) {
  if (a.score !== b.score) return b.score - a.score;
  if (a.generatedAtMs !== b.generatedAtMs) return b.generatedAtMs - a.generatedAtMs;
  if (a.mtimeMs !== b.mtimeMs) return b.mtimeMs - a.mtimeMs;
  return a.file.localeCompare(b.file);
}

function buildReportsIndex() {
  const entries = buildReportEntries();
  const byDate = new Map();

  for (const entry of entries) {
    if (!byDate.has(entry.date)) {
      byDate.set(entry.date, {
        date: entry.date,
        sessions: {
          pre_market: [],
          mid_market: [],
          after_market: []
        }
      });
    }

    byDate.get(entry.date).sessions[entry.session].push(entry);
  }

  const dates = Array.from(byDate.values())
    .map((entry) => {
      const sessions = {};
      let availableCount = 0;

      for (const sessionKey of Object.keys(SESSION_CONFIG)) {
        const alternatives = (entry.sessions[sessionKey] || []).sort(compareEntries);
        sessions[sessionKey] = alternatives[0] || null;
        if (sessions[sessionKey]) availableCount += 1;
      }

      return {
        date: entry.date,
        label: formatDateLabel(entry.date),
        weekday: getWeekdayLabel(entry.date),
        availableCount,
        totalCount: Object.keys(SESSION_CONFIG).length,
        sessions
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    dates,
    byDate: new Map(dates.map((entry) => [entry.date, entry])),
    summary: {
      latestDate: dates[0]?.date || '',
      totalDates: dates.length,
      totalReports: entries.length,
      availableSessions: dates.reduce((sum, entry) => sum + entry.availableCount, 0)
    }
  };
}

function serializeSessionEntry(date, sessionKey, report) {
  const config = SESSION_CONFIG[sessionKey];
  if (!report) {
    return {
      key: sessionKey,
      available: false,
      title: config.label,
      icon: config.icon
    };
  }

  return {
    key: sessionKey,
    available: true,
    title: report.sessionLabel,
    icon: report.sessionIcon,
    file: report.file,
    source: report.source,
    sourceLabel: report.sourceLabel,
    format: report.format,
    size: report.size,
    updatedAt: report.generatedAt,
    updatedLabel: report.generatedAtLabel,
    preview: report.preview,
    viewUrl: `/${date}/${SESSION_TO_SLUG[sessionKey] || sessionKey}`,
    rawUrl: `/raw-report/${date}/${SESSION_TO_SLUG[sessionKey] || sessionKey}`
  };
}

function serializeDateEntry(entry) {
  return {
    date: entry.date,
    label: entry.label,
    weekday: entry.weekday,
    availableCount: entry.availableCount,
    totalCount: entry.totalCount,
    coverageLabel: `${entry.availableCount}/${entry.totalCount}`,
    sessions: Object.fromEntries(
      Object.keys(SESSION_CONFIG).map((sessionKey) => [
        sessionKey,
        serializeSessionEntry(entry.date, sessionKey, entry.sessions[sessionKey])
      ])
    )
  };
}

function getReportByParams(date, sessionParam) {
  const sessionKey = resolveSessionKey(sessionParam);
  const index = buildReportsIndex();
  const normalizedDate = normalizeDateDigits(date);
  const dateEntry = index.byDate.get(normalizedDate);
  if (!dateEntry) return null;
  if (!Object.prototype.hasOwnProperty.call(SESSION_CONFIG, sessionKey)) return null;
  return dateEntry.sessions[sessionKey] || null;
}

const server = app.listen(PORT, HOST, () => {
  const address = server.address();
  const actualPort = address && typeof address === 'object' ? address.port : PORT;
  const index = buildReportsIndex();
  console.log(`📈 uwillberich Reports Dashboard running at http://${HOST}:${actualPort}`);
  console.log(`   Report days: ${index.summary.totalDates}`);
  console.log(`   Indexed reports: ${index.summary.totalReports}`);
});
