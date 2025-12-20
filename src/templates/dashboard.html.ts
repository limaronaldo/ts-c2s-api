/**
 * Dashboard HTML Template (RML-639)
 *
 * Generates the HTML for the monitoring dashboard.
 * Auto-refreshes every 30 seconds via JavaScript.
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
    }
    header h1 { font-size: 1.5rem; font-weight: 600; }
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
    .section-title { font-size: 1.125rem; font-weight: 600; margin-bottom: 12px; }
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
    @media (max-width: 768px) {
      .two-col { grid-template-columns: 1fr; }
    }
    .error-list {
      max-height: 200px;
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
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>C2S Lead Enrichment</h1>
      <div class="refresh-info">
        <span class="dot"></span>
        Last updated: <span id="lastUpdate">-</span>
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
        <div class="card-title">Failed</div>
        <div class="metric danger" id="failedCount">-</div>
        <div class="metric-change" id="failedDetail">-</div>
      </div>
    </div>

    <div class="two-col">
      <div class="section">
        <div class="section-title">Lead Status Breakdown</div>
        <div class="card">
          <div class="status-grid" id="statusGrid">
            <!-- Populated by JS -->
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
    </div>

    <div class="section">
      <div class="section-title">Cron Status</div>
      <div class="card">
        <div class="cron-status" id="cronStatus">
          <!-- Populated by JS -->
        </div>
      </div>
    </div>

    <div class="two-col">
      <div class="section">
        <div class="section-title">Recent Activity (Last 20)</div>
        <div class="card" style="padding: 0; overflow: hidden;">
          <table>
            <thead>
              <tr>
                <th>Lead ID</th>
                <th>Name</th>
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

      <div class="section">
        <div class="section-title">Failed Leads</div>
        <div class="card">
          <div class="error-list" id="failedLeads">
            <!-- Populated by JS -->
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
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

    async function fetchData() {
      try {
        const res = await fetch('/dashboard/data');
        return await res.json();
      } catch (e) {
        console.error('Failed to fetch data:', e);
        return null;
      }
    }

    function updateDashboard(data) {
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

      // Update status grid
      const statusGrid = document.getElementById('statusGrid');
      statusGrid.innerHTML = Object.entries(stats).map(([status, count]) =>
        '<div class="status-item"><span class="status-label">' + status + '</span><span class="status-value">' + count + '</span></div>'
      ).join('');

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

      // Update recent leads
      const recentEl = document.getElementById('recentLeads');
      recentEl.innerHTML = recentLeads.map(lead =>
        '<tr>' +
        '<td style="font-family:monospace;font-size:0.75rem;">' + (lead.leadId || '-').substring(0, 12) + '...</td>' +
        '<td>' + (lead.name || '-') + '</td>' +
        '<td>' + getStatusBadge(lead.enrichmentStatus) + '</td>' +
        '<td>' + (lead.retryCount || 0) + '</td>' +
        '<td>' + formatDate(lead.createdAt) + '</td>' +
        '</tr>'
      ).join('');

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
    }

    async function refresh() {
      const data = await fetchData();
      if (data) updateDashboard(data);
    }

    // Initial load
    refresh();

    // Auto-refresh every 30 seconds
    setInterval(refresh, 30000);
  </script>
</body>
</html>`;
}
