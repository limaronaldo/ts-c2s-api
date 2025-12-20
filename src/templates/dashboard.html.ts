/**
 * Dashboard HTML Template (RML-639)
 *
 * Generates the HTML for the monitoring dashboard.
 * Features:
 * - Auto-refresh every 30 seconds
 * - Status breakdown with donut chart
 * - Manual retry trigger
 * - CSV/JSON export
 * - Date filtering for leads
 */

export function generateDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>C2S Lead Enrichment Dashboard</title>
  <style>
    :root {
      --primary: #2563eb;
      --success: #16a34a;
      --warning: #d97706;
      --danger: #dc2626;
      --muted: #64748b;
      --bg: #f1f5f9;
      --card: #ffffff;
      --border: #e2e8f0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: #1e293b;
      line-height: 1.5;
    }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
      gap: 12px;
    }
    header h1 { font-size: 1.5rem; font-weight: 600; }
    .header-actions {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }
    .refresh-info { color: var(--muted); font-size: 0.875rem; }
    .refresh-info .dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
      margin-right: 6px;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-primary { background: var(--primary); color: white; }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-primary:disabled { background: #94a3b8; cursor: not-allowed; }
    .btn-secondary { background: #e2e8f0; color: #475569; }
    .btn-secondary:hover { background: #cbd5e1; }
    .btn-success { background: var(--success); color: white; }
    .btn-success:hover { background: #15803d; }
    .dropdown {
      position: relative;
      display: inline-block;
    }
    .dropdown-content {
      display: none;
      position: absolute;
      right: 0;
      top: 100%;
      background: white;
      border: 1px solid var(--border);
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      z-index: 100;
      min-width: 160px;
    }
    .dropdown:hover .dropdown-content { display: block; }
    .dropdown-item {
      display: block;
      padding: 10px 16px;
      color: #1e293b;
      text-decoration: none;
      font-size: 0.875rem;
    }
    .dropdown-item:hover { background: #f8fafc; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .card {
      background: var(--card);
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      border: 1px solid var(--border);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .card-title { font-size: 0.875rem; color: var(--muted); font-weight: 500; }
    .metric { font-size: 2rem; font-weight: 700; }
    .metric.success { color: var(--success); }
    .metric.warning { color: var(--warning); }
    .metric.danger { color: var(--danger); }
    .metric-change { font-size: 0.75rem; color: var(--muted); margin-top: 4px; }
    .section { margin-bottom: 24px; }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .section-title { font-size: 1.125rem; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      text-align: left;
      padding: 12px;
      border-bottom: 1px solid var(--border);
      font-size: 0.875rem;
    }
    th { color: var(--muted); font-weight: 500; background: #f8fafc; }
    tr:hover { background: #f8fafc; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    .badge-completed { background: #dcfce7; color: #166534; }
    .badge-partial { background: #fef3c7; color: #92400e; }
    .badge-unenriched { background: #fee2e2; color: #991b1b; }
    .badge-failed { background: #fecaca; color: #7f1d1d; }
    .badge-pending { background: #e0e7ff; color: #3730a3; }
    .badge-basic { background: #e0f2fe; color: #075985; }
    .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; }
    .status-item {
      display: flex;
      justify-content: space-between;
      padding: 12px;
      background: #f8fafc;
      border-radius: 6px;
    }
    .status-label { color: var(--muted); font-size: 0.875rem; }
    .status-value { font-weight: 600; }
    .service-status {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #f8fafc;
      border-radius: 6px;
    }
    .service-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .service-dot.up { background: var(--success); }
    .service-dot.down { background: var(--danger); }
    .cron-status {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .cron-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }
    .three-col {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 24px;
    }
    @media (max-width: 1024px) {
      .three-col { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 768px) {
      .two-col, .three-col { grid-template-columns: 1fr; }
    }
    .error-list {
      max-height: 300px;
      overflow-y: auto;
    }
    .error-item {
      padding: 8px 12px;
      background: #fef2f2;
      border-radius: 4px;
      margin-bottom: 8px;
      font-size: 0.875rem;
    }
    .error-item .lead-id { font-weight: 600; color: var(--danger); }
    .error-item .error-msg { color: var(--muted); font-size: 0.75rem; margin-top: 4px; }
    .chart-container {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 24px;
      padding: 16px;
    }
    .donut-chart {
      position: relative;
      width: 160px;
      height: 160px;
    }
    .donut-chart svg {
      transform: rotate(-90deg);
    }
    .donut-center {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
    }
    .donut-center .total { font-size: 1.5rem; font-weight: 700; }
    .donut-center .label { font-size: 0.75rem; color: var(--muted); }
    .chart-legend {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.875rem;
    }
    .legend-color {
      width: 12px;
      height: 12px;
      border-radius: 2px;
    }
    .filter-bar {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
      flex-wrap: wrap;
      align-items: center;
    }
    .filter-bar input, .filter-bar select {
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 0.875rem;
    }
    .filter-bar input { min-width: 200px; }
    .toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 8px;
      color: white;
      font-weight: 500;
      opacity: 0;
      transform: translateY(20px);
      transition: all 0.3s;
      z-index: 1000;
    }
    .toast.show {
      opacity: 1;
      transform: translateY(0);
    }
    .toast.success { background: var(--success); }
    .toast.error { background: var(--danger); }
    .retryable-count {
      background: var(--warning);
      color: white;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 0.75rem;
      margin-left: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>C2S Lead Enrichment</h1>
      <div class="header-actions">
        <div class="refresh-info">
          <span class="dot"></span>
          Last updated: <span id="lastUpdate">-</span>
        </div>
        <button class="btn btn-success" id="retryBtn" onclick="triggerRetry()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 4v6h6M23 20v-6h-6"/>
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
          </svg>
          Retry Now <span class="retryable-count" id="retryableCount">0</span>
        </button>
        <div class="dropdown">
          <button class="btn btn-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7,10 12,15 17,10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export
          </button>
          <div class="dropdown-content">
            <a href="/dashboard/export?format=csv" class="dropdown-item">All Leads (CSV)</a>
            <a href="/dashboard/export?status=failed&format=csv" class="dropdown-item">Failed Leads (CSV)</a>
            <a href="/dashboard/export?status=partial&format=csv" class="dropdown-item">Partial Leads (CSV)</a>
            <a href="/dashboard/export?format=json" class="dropdown-item">All Leads (JSON)</a>
          </div>
        </div>
      </div>
    </header>

    <div class="grid" id="metricsGrid">
      <div class="card">
        <div class="card-title">Total Processed</div>
        <div class="metric" id="totalProcessed">-</div>
        <div class="metric-change" id="sessionDuration">-</div>
      </div>
      <div class="card">
        <div class="card-title">Success Rate</div>
        <div class="metric success" id="successRate">-</div>
        <div class="metric-change" id="successDetail">-</div>
      </div>
      <div class="card">
        <div class="card-title">CPF Discovery Rate</div>
        <div class="metric" id="cpfRate">-</div>
        <div class="metric-change" id="cpfDetail">-</div>
      </div>
      <div class="card">
        <div class="card-title">Need Attention</div>
        <div class="metric danger" id="failedCount">-</div>
        <div class="metric-change" id="failedDetail">-</div>
      </div>
    </div>

    <div class="three-col">
      <div class="section">
        <div class="section-title">Lead Status Distribution</div>
        <div class="card">
          <div class="chart-container">
            <div class="donut-chart">
              <svg width="160" height="160" viewBox="0 0 160 160" id="donutChart">
                <!-- Populated by JS -->
              </svg>
              <div class="donut-center">
                <div class="total" id="chartTotal">0</div>
                <div class="label">total</div>
              </div>
            </div>
            <div class="chart-legend" id="chartLegend">
              <!-- Populated by JS -->
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Service Health</div>
        <div class="card">
          <div class="status-grid" id="serviceHealth">
            <!-- Populated by JS -->
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Cron & Retry Status</div>
        <div class="card">
          <div class="cron-status" id="cronStatus">
            <!-- Populated by JS -->
          </div>
        </div>
      </div>
    </div>

    <div class="two-col">
      <div class="section">
        <div class="section-header">
          <div class="section-title">Recent Activity</div>
        </div>
        <div class="filter-bar">
          <input type="text" id="searchFilter" placeholder="Search by name or phone..." oninput="filterLeads()">
          <select id="statusFilter" onchange="filterLeads()">
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="partial">Partial</option>
            <option value="unenriched">Unenriched</option>
            <option value="failed">Failed</option>
            <option value="basic">Basic</option>
          </select>
        </div>
        <div class="card" style="padding: 0; overflow: hidden;">
          <div style="max-height: 400px; overflow-y: auto;">
            <table>
              <thead>
                <tr>
                  <th>Lead ID</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Retries</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody id="recentLeads">
                <!-- Populated by JS -->
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">
          <div class="section-title">Failed Leads</div>
        </div>
        <div class="card">
          <div class="error-list" id="failedLeads">
            <!-- Populated by JS -->
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    let allLeads = [];

    function showToast(message, type = 'success') {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.className = 'toast ' + type + ' show';
      setTimeout(() => toast.classList.remove('show'), 3000);
    }

    async function triggerRetry() {
      const btn = document.getElementById('retryBtn');
      btn.disabled = true;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg> Processing...';

      try {
        const res = await fetch('/dashboard/retry', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          showToast('Retry processing started', 'success');
        } else {
          showToast(data.error || 'Retry failed', 'error');
        }
      } catch (e) {
        showToast('Failed to trigger retry', 'error');
      }

      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg> Retry Now <span class="retryable-count" id="retryableCount">' + (document.getElementById('retryableCount')?.textContent || '0') + '</span>';
        refresh();
      }, 2000);
    }

    function formatDate(dateStr) {
      if (!dateStr) return '-';
      const date = new Date(dateStr);
      return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    function formatDuration(ms) {
      const hours = Math.floor(ms / 3600000);
      const minutes = Math.floor((ms % 3600000) / 60000);
      if (hours > 0) return hours + 'h ' + minutes + 'm';
      return minutes + 'm';
    }

    function getStatusBadge(status) {
      const classes = {
        completed: 'badge-completed',
        partial: 'badge-partial',
        unenriched: 'badge-unenriched',
        failed: 'badge-failed',
        pending: 'badge-pending',
        basic: 'badge-basic'
      };
      return '<span class="badge ' + (classes[status] || 'badge-pending') + '">' + (status || 'unknown') + '</span>';
    }

    const STATUS_COLORS = {
      completed: '#16a34a',
      partial: '#d97706',
      unenriched: '#dc2626',
      failed: '#7f1d1d',
      pending: '#6366f1',
      basic: '#0284c7'
    };

    function drawDonutChart(stats) {
      const svg = document.getElementById('donutChart');
      const legend = document.getElementById('chartLegend');
      const totalEl = document.getElementById('chartTotal');

      const entries = Object.entries(stats).filter(([_, v]) => v > 0);
      const total = entries.reduce((sum, [_, v]) => sum + v, 0);
      totalEl.textContent = total;

      if (total === 0) {
        svg.innerHTML = '<circle cx="80" cy="80" r="60" fill="none" stroke="#e2e8f0" stroke-width="20"/>';
        legend.innerHTML = '<div style="color:var(--muted)">No data</div>';
        return;
      }

      const cx = 80, cy = 80, r = 60;
      const circumference = 2 * Math.PI * r;
      let offset = 0;
      let paths = '';
      let legendHtml = '';

      entries.sort((a, b) => b[1] - a[1]);

      for (const [status, count] of entries) {
        const pct = count / total;
        const length = pct * circumference;
        const color = STATUS_COLORS[status] || '#94a3b8';

        paths += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="20" stroke-dasharray="' + length + ' ' + circumference + '" stroke-dashoffset="-' + offset + '"/>';
        offset += length;

        legendHtml += '<div class="legend-item"><span class="legend-color" style="background:' + color + '"></span><span>' + status + ': ' + count + ' (' + Math.round(pct * 100) + '%)</span></div>';
      }

      svg.innerHTML = paths;
      legend.innerHTML = legendHtml;
    }

    function filterLeads() {
      const search = document.getElementById('searchFilter').value.toLowerCase();
      const status = document.getElementById('statusFilter').value;

      const filtered = allLeads.filter(lead => {
        const matchSearch = !search ||
          (lead.name || '').toLowerCase().includes(search) ||
          (lead.phone || '').includes(search) ||
          (lead.leadId || '').includes(search);
        const matchStatus = !status || lead.enrichmentStatus === status;
        return matchSearch && matchStatus;
      });

      renderLeadsTable(filtered);
    }

    function renderLeadsTable(leads) {
      const el = document.getElementById('recentLeads');
      el.innerHTML = leads.map(lead =>
        '<tr>' +
        '<td style="font-family:monospace;font-size:0.75rem;">' + (lead.leadId || '-').substring(0, 12) + '...</td>' +
        '<td>' + (lead.name || '-') + '</td>' +
        '<td style="font-family:monospace;font-size:0.8rem;">' + (lead.phone || '-') + '</td>' +
        '<td>' + getStatusBadge(lead.enrichmentStatus) + '</td>' +
        '<td>' + (lead.retryCount || 0) + '</td>' +
        '<td>' + formatDate(lead.createdAt) + '</td>' +
        '</tr>'
      ).join('');
    }

    async function fetchData() {
      try {
        const res = await fetch('/dashboard/data');
        return await res.json();
      } catch (e) {
        console.error('Failed to fetch data:', e);
        return null;
      }
    }

    async function fetchRetryableCount() {
      try {
        const res = await fetch('/dashboard/retryable');
        const data = await res.json();
        return data.success ? data.data.count : 0;
      } catch (e) {
        return 0;
      }
    }

    async function updateDashboard(data) {
      if (!data || !data.success) return;

      const { metrics, stats, recentLeads, failedLeads, cronStatus, serviceHealth, errorRate } = data.data;

      // Update timestamp
      document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString('pt-BR');

      // Update metrics
      document.getElementById('totalProcessed').textContent = metrics.totalLeadsProcessed || 0;
      const sessionDuration = Date.now() - new Date(metrics.sessionStartTime).getTime();
      document.getElementById('sessionDuration').textContent = 'Session: ' + formatDuration(sessionDuration);

      const successRate = metrics.enrichmentSuccessRate || 0;
      document.getElementById('successRate').textContent = successRate.toFixed(1) + '%';
      document.getElementById('successDetail').textContent =
        (metrics.fullyEnriched || 0) + ' full, ' + (metrics.partiallyEnriched || 0) + ' partial';

      document.getElementById('cpfRate').textContent = (metrics.cpfDiscoveryRate || 0).toFixed(1) + '%';
      document.getElementById('cpfDetail').textContent =
        (metrics.cpfDiscovered || 0) + ' found, ' + (metrics.cpfNotFound || 0) + ' not found';

      const failed = (stats.failed || 0) + (stats.unenriched || 0);
      document.getElementById('failedCount').textContent = failed;
      document.getElementById('failedDetail').textContent =
        (stats.failed || 0) + ' failed, ' + (stats.unenriched || 0) + ' unenriched';

      // Draw donut chart
      drawDonutChart(stats);

      // Update service health
      const serviceHealthEl = document.getElementById('serviceHealth');
      serviceHealthEl.innerHTML = Object.entries(serviceHealth).map(([service, info]) =>
        '<div class="service-status"><span class="service-dot ' + (info.isUp ? 'up' : 'down') + '"></span>' +
        '<span>' + service + '</span>' +
        (info.downSinceMinutes ? '<span style="color:var(--danger);font-size:0.75rem;">(' + info.downSinceMinutes + 'm)</span>' : '') +
        '</div>'
      ).join('');

      // Update cron status
      const cronEl = document.getElementById('cronStatus');
      cronEl.innerHTML =
        '<div class="cron-item"><span class="service-dot ' + (cronStatus.running ? 'up' : 'down') + '"></span>' +
        '<span>Cron: ' + (cronStatus.running ? 'Running' : 'Stopped') + '</span></div>' +
        '<div class="cron-item"><span>Processing: ' + (cronStatus.isProcessing ? 'Yes' : 'No') + '</span></div>' +
        '<div class="cron-item"><span>Next run: ' + (cronStatus.nextRun ? formatDate(cronStatus.nextRun) : '-') + '</span></div>' +
        '<div class="cron-item"><span>Error rate: ' + (errorRate.errorRate || 0).toFixed(1) + '% (' + errorRate.failures + '/' + errorRate.totalAttempts + ')</span></div>';

      // Store leads for filtering
      allLeads = recentLeads;
      filterLeads();

      // Update failed leads
      const failedEl = document.getElementById('failedLeads');
      if (failedLeads.length === 0) {
        failedEl.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px;">No failed leads</div>';
      } else {
        failedEl.innerHTML = failedLeads.map(lead =>
          '<div class="error-item">' +
          '<div class="lead-id">' + (lead.name || lead.leadId) + '</div>' +
          '<div class="error-msg">' + (lead.lastError || 'Unknown error') + '</div>' +
          '<div class="error-msg">Retries: ' + (lead.retryCount || 0) + ' | ' + formatDate(lead.lastRetryAt) + '</div>' +
          '</div>'
        ).join('');
      }

      // Update retryable count
      const retryableCount = await fetchRetryableCount();
      const countEl = document.getElementById('retryableCount');
      if (countEl) countEl.textContent = retryableCount;
    }

    async function refresh() {
      const data = await fetchData();
      if (data) await updateDashboard(data);
    }

    // Initial load
    refresh();

    // Auto-refresh every 30 seconds
    setInterval(refresh, 30000);
  </script>
</body>
</html>`;
}
