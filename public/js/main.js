document.addEventListener('DOMContentLoaded', () => {
    const refreshButton = document.getElementById('refreshButton');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => loadReports({ preserveExpanded: true }));
    }

    setupRulesToggle();
    loadReports();
});

let expandedDate = null;

function appUrl(path) {
    const base = window.APP_BASE_PATH || '';
    if (!path) return base || '/';
    if (/^https?:\/\//.test(path)) return path;
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function setupRulesToggle() {
    const section = document.querySelector('.rules-section');
    const toggleButton = document.getElementById('rulesToggle');
    if (!section || !toggleButton) return;

    const applyState = (collapsed) => {
        section.classList.toggle('collapsed', collapsed);
        toggleButton.setAttribute('aria-expanded', String(!collapsed));
        toggleButton.textContent = collapsed ? '展开规则' : '收起规则';
    };

    applyState(window.innerWidth <= 768);

    toggleButton.addEventListener('click', () => {
        applyState(!section.classList.contains('collapsed'));
    });
}

async function loadReports(options = {}) {
    const container = document.getElementById('datesContainer');
    const summary = document.getElementById('reportsSummary');
    const latestFocus = document.getElementById('latestFocus');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    summary.innerHTML = '';
    latestFocus.innerHTML = '';

    try {
        const response = await fetch(appUrl('/api/reports'));
        if (!response.ok) throw new Error('Failed to load reports');

        const payload = await response.json();
        const dates = payload.dates || [];
        renderSummary(payload.summary || {});
        renderLatestFocus(dates[0] || null);

        container.innerHTML = '';

        if (dates.length === 0) {
            expandedDate = null;
            container.innerHTML = `
                <div class="glass-panel empty-state">
                    <p class="empty-title">暂无历史日报</p>
                    <p class="empty-copy">将报告放入 public/reports 或 ~/.uwillberich/reports 后，这里会自动显示。</p>
                </div>
            `;
            return;
        }

        dates.forEach((dateEntry) => {
            const card = createDateCard(dateEntry);
            container.appendChild(card);
        });

        const nextExpanded = options.preserveExpanded && expandedDate
            ? expandedDate
            : dates[0].date;
        setExpandedDate(nextExpanded);
    } catch (error) {
        console.error('Error loading reports:', error);
        expandedDate = null;
        container.innerHTML = `
            <div class="glass-panel empty-state">
                <p class="empty-title" style="color: var(--accent-red);">加载失败</p>
                <p class="empty-copy">请刷新页面重试。</p>
            </div>
        `;
    }
}

function renderSummary(summary) {
    const summaryEl = document.getElementById('reportsSummary');
    const latestLabel = summary.latestDate ? formatDate(summary.latestDate) : '暂无';

    summaryEl.innerHTML = `
        <div class="summary-card">
            <span class="summary-label">最近日期</span>
            <strong class="summary-value">${latestLabel}</strong>
        </div>
        <div class="summary-card">
            <span class="summary-label">归档天数</span>
            <strong class="summary-value">${summary.totalDates || 0}</strong>
        </div>
        <div class="summary-card">
            <span class="summary-label">已索引日报</span>
            <strong class="summary-value">${summary.totalReports || 0}</strong>
        </div>
        <div class="summary-card">
            <span class="summary-label">可用时段</span>
            <strong class="summary-value">${summary.availableSessions || 0}</strong>
        </div>
    `;
}

function renderLatestFocus(dateEntry) {
    const latestFocus = document.getElementById('latestFocus');
    if (!dateEntry) {
        latestFocus.innerHTML = '';
        return;
    }

    const quickLinks = Object.values(dateEntry.sessions)
        .map((session) => {
            const stateClass = session.available ? 'available' : 'disabled';
            const href = session.available ? appUrl(session.viewUrl) : '#';
            const target = session.available
                ? `<a class="focus-link ${stateClass}" href="${href}">${session.icon} ${session.title}</a>`
                : `<span class="focus-link ${stateClass}">${session.icon} ${session.title}</span>`;
            return target;
        })
        .join('');

    latestFocus.innerHTML = `
        <div class="latest-panel">
            <div class="latest-copy">
                <span class="latest-kicker">Latest</span>
                <h3>${dateEntry.label}</h3>
                <p>${dateEntry.weekday} · 当前可用 ${dateEntry.coverageLabel} 个时段</p>
            </div>
            <div class="latest-actions">
                ${quickLinks}
            </div>
        </div>
    `;
}

function createDateCard(dateEntry) {
    const card = document.createElement('article');
    card.className = 'date-card';
    card.id = `date-${dateEntry.date}`;

    const sessionPills = Object.values(dateEntry.sessions)
        .map((session) => {
            const stateClass = session.available ? 'available' : 'missing';
            return `<span class="session-pill ${stateClass}">${session.icon} ${session.available ? session.title : '缺失'}</span>`;
        })
        .join('');

    const sessionCards = Object.values(dateEntry.sessions)
        .map((session) => createSessionCard(session))
        .join('');

    card.innerHTML = `
        <button class="date-header" type="button" data-date="${dateEntry.date}">
            <div class="date-title">
                <span class="date-icon">📅</span>
                <div>
                    <div>${dateEntry.label}</div>
                    <div class="date-subtitle">${dateEntry.weekday} · 完整度 ${dateEntry.coverageLabel}</div>
                </div>
            </div>
            <div class="date-head-meta">
                <div class="session-pills">${sessionPills}</div>
                <span class="chevron">▼</span>
            </div>
        </button>
        <div class="sessions-grid">
            ${sessionCards}
        </div>
    `;

    card.querySelector('.date-header').addEventListener('click', () => {
        setExpandedDate(expandedDate === dateEntry.date ? null : dateEntry.date);
    });

    return card;
}

function createSessionCard(session) {
    const meta = session.available
        ? `<div class="session-meta"><span>${session.format === 'html' ? 'HTML' : session.format === 'markdown' ? 'Markdown' : 'Text'}</span><span>${session.updatedLabel || '时间未知'}</span></div>`
        : `<div class="session-meta"><span>待生成</span></div>`;

    if (!session.available) {
        return `
            <div class="session-card missing">
                <span class="session-icon">${session.icon}</span>
                <span class="session-name">${session.title}</span>
                ${meta}
                <span class="session-status missing">暂无报告</span>
            </div>
        `;
    }

    return `
        <a class="session-card" href="${appUrl(session.viewUrl)}">
            <span class="session-icon">${session.icon}</span>
            <span class="session-name">${session.title}</span>
            ${meta}
            <span class="session-status available">点击查看</span>
        </a>
    `;
}

function setExpandedDate(date) {
    expandedDate = date;
    document.querySelectorAll('.date-card').forEach((card) => {
        card.classList.toggle('expanded', card.id === `date-${date}`);
    });
}

function formatDate(dateStr) {
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return `${year}年${parseInt(month, 10)}月${parseInt(day, 10)}日`;
}
