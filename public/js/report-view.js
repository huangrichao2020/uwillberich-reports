document.addEventListener('DOMContentLoaded', () => {
    const backLink = document.getElementById('backLink');
    if (backLink) {
        backLink.href = appUrl('/');
    }

    loadReport();
});

function appBasePath() {
    return window.APP_BASE_PATH || '';
}

function appUrl(path) {
    const base = appBasePath();
    if (!path) return base || '/';
    if (/^https?:\/\//.test(path)) return path;
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function stripBasePath(pathname) {
    const base = appBasePath();
    return base && pathname.startsWith(base) ? pathname.slice(base.length) || '/' : pathname;
}

async function loadReport() {
    const logicalPath = stripBasePath(window.location.pathname);
    const segments = logicalPath.split('/').filter(Boolean);
    let date, session;

    // Support both /:date/:slug (new) and /report/:date/:session (legacy)
    if (segments.length === 2 && /^\d{8}$/.test(segments[0])) {
        [date, session] = segments;
    } else if (segments[0] === 'report' && segments.length === 3) {
        [, date, session] = segments;
    }

    if (!date || !session) {
        showError('无效的报告链接');
        return;
    }

    try {
        const [reportResponse, dateResponse] = await Promise.all([
            fetch(appUrl(`/api/report/${date}/${session}`)),
            fetch(appUrl(`/api/reports/${date}`))
        ]);

        if (!reportResponse.ok) {
            throw new Error('Report not found');
        }

        const report = await reportResponse.json();
        const dateMeta = dateResponse.ok ? await dateResponse.json() : null;

        renderReport(report, dateMeta);
    } catch (error) {
        console.error('Error loading report:', error);
        showError('报告加载失败');
    }
}

function renderReport(report, dateMeta) {
    document.title = `${report.sessionLabel} - ${report.dateLabel} - uwillberich`;

    renderMeta(report);
    renderSwitcher(dateMeta, report.session);
    renderContent(report);
}

function renderMeta(report) {
    const metaContainer = document.getElementById('reportMeta');
    metaContainer.innerHTML = `
        <div class="report-title">
            <span>${report.sessionIcon}</span>
            <span>${report.sessionLabel}</span>
        </div>
        <div class="report-badge ${report.session}">${report.dateLabel}</div>
        <div class="report-submeta">
            <span class="meta-pill">${report.format === 'html' ? 'HTML' : report.format === 'markdown' ? 'Markdown' : 'Text'}</span>
            <span class="meta-pill">${report.updatedLabel || '时间未知'}</span>
            <span class="meta-pill">${report.file}</span>
            <span class="meta-pill">${report.sourceLabel}</span>
            <a class="meta-pill link-pill" href="${appUrl(report.rawUrl)}" target="_blank" rel="noopener noreferrer">打开原文件</a>
        </div>
    `;
}

function renderSwitcher(dateMeta, currentSession) {
    const switcher = document.getElementById('reportSwitcher');
    if (!dateMeta || !dateMeta.sessions) {
        switcher.innerHTML = '';
        return;
    }

    switcher.innerHTML = Object.values(dateMeta.sessions)
        .map((session) => {
            if (!session.available) {
                return `<span class="switcher-chip disabled">${session.icon} ${session.title}</span>`;
            }

            const activeClass = session.key === currentSession ? 'active' : '';
            return `<a class="switcher-chip ${activeClass}" href="${appUrl(session.viewUrl)}">${session.icon} ${session.title}</a>`;
        })
        .join('');
}

function renderContent(report) {
    const contentContainer = document.getElementById('reportContent');

    if (report.isHtml) {
        const iframe = document.createElement('iframe');
        iframe.className = 'report-iframe';
        iframe.src = appUrl(report.rawUrl);
        iframe.loading = 'lazy';
        iframe.setAttribute('sandbox', 'allow-same-origin');

        const wrapper = document.createElement('div');
        wrapper.className = 'html-report-container';
        wrapper.appendChild(iframe);

        contentContainer.innerHTML = '';
        contentContainer.appendChild(wrapper);
        return;
    }

    if (report.isMarkdown) {
        contentContainer.innerHTML = `
            <article class="report-body markdown-body">
                ${report.renderedHtml || `<pre class="raw-markdown">${escapeHtml(report.content)}</pre>`}
            </article>
        `;
        return;
    }

    contentContainer.innerHTML = `
        <div class="report-body">
            <pre class="raw-markdown">${escapeHtml(report.content)}</pre>
        </div>
    `;
}

function showError(message) {
    const contentContainer = document.getElementById('reportContent');
    contentContainer.innerHTML = `
        <div class="error-state">
            <p class="error-title">${message}</p>
            <a href="${appUrl('/')}" class="back-link" style="display: inline-flex;">返回首页</a>
        </div>
    `;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
