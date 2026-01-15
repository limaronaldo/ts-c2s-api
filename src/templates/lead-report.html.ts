/**
 * Lead Report HTML Template
 * RML-871: Geração automática de relatórios PDF de análise de leads
 */

export interface LeadReportData {
  name: string;
  email?: string;
  phone?: string;
  location?: string;
  tier: "platinum" | "gold" | "silver" | "bronze" | "risk";
  tierLabel: string;
  company?: string;
  role?: string;
  discovered: {
    fullName?: string;
    origin?: string;
    instagram?: string;
    education?: string;
    linkedIn?: string;
  };
  financials?: {
    assets?: Array<{ name: string; value: string }>;
    totalWealth?: string;
    managedCapital?: string;
    income?: string;
  };
  portfolio?: Array<{ company: string; sector: string }>;
  alerts?: string[];
  highlights?: string[];
  recommendation: {
    action: "avoid" | "priority" | "qualify" | "contact";
    title: string;
    description: string;
  };
  sources?: string[];
}

export interface ReportData {
  title: string;
  date: string;
  analyst: string;
  leads: LeadReportData[];
  actionPlan?: Array<{ lead: string; action: string }>;
}

function getTierColor(tier: LeadReportData["tier"]): { bg: string; text: string; gradient: string } {
  switch (tier) {
    case "platinum":
      return { bg: "#f5f3ff", text: "#7c3aed", gradient: "linear-gradient(135deg, #7c3aed, #6d28d9)" };
    case "gold":
      return { bg: "#fffbeb", text: "#d97706", gradient: "linear-gradient(135deg, #d97706, #b45309)" };
    case "silver":
      return { bg: "#f9fafb", text: "#6b7280", gradient: "linear-gradient(135deg, #6b7280, #4b5563)" };
    case "bronze":
      return { bg: "#fef3c7", text: "#92400e", gradient: "linear-gradient(135deg, #92400e, #78350f)" };
    case "risk":
      return { bg: "#fef2f2", text: "#dc2626", gradient: "linear-gradient(135deg, #dc2626, #b91c1c)" };
  }
}

function getRecommendationStyle(action: LeadReportData["recommendation"]["action"]): { bg: string; border: string; title: string } {
  switch (action) {
    case "avoid":
      return { bg: "#fef2f2", border: "#fecaca", title: "#dc2626" };
    case "priority":
      return { bg: "#f0fdf4", border: "#bbf7d0", title: "#059669" };
    case "qualify":
      return { bg: "#fffbeb", border: "#fde68a", title: "#d97706" };
    case "contact":
      return { bg: "#eff6ff", border: "#bfdbfe", title: "#2563eb" };
  }
}

function renderLeadCard(lead: LeadReportData, index: number): string {
  const colors = getTierColor(lead.tier);

  return `
    <div class="summary-card" style="border-top: 4px solid ${colors.text};">
      <div class="card-tier" style="color: ${colors.text};">${lead.tierLabel}</div>
      <div class="card-name">${lead.name}</div>
      <div class="card-company">${lead.company || "—"}</div>
      <div class="card-value">${lead.financials?.totalWealth || lead.financials?.managedCapital || lead.financials?.income || "A qualificar"}</div>
      <div class="card-action" style="color: ${colors.text};">
        ${lead.tier === "risk" ? "✗" : lead.tier === "platinum" ? "★" : "◆"} ${lead.recommendation.title}
      </div>
    </div>
  `;
}

function renderLeadSection(lead: LeadReportData, index: number): string {
  const colors = getTierColor(lead.tier);
  const recStyle = getRecommendationStyle(lead.recommendation.action);
  const initial = lead.name.charAt(0).toUpperCase();

  return `
    <div class="lead-section">
      <div class="lead-header">
        <div class="lead-avatar" style="background: ${colors.gradient};">${initial}</div>
        <div class="lead-title-area">
          <h2 class="lead-name">${lead.discovered.fullName || lead.name}</h2>
          <p class="lead-subtitle">${lead.role || ""} ${lead.role && lead.company ? "•" : ""} ${lead.company || ""}</p>
        </div>
        <span class="lead-badge" style="background: ${colors.bg}; color: ${colors.text};">${lead.tierLabel}</span>
      </div>
      <div class="lead-content">
        <div class="info-grid">
          <div class="info-card">
            <h4 class="info-card-title">Dados do Lead</h4>
            ${lead.email ? `<div class="info-row"><span class="info-label">Email</span><span class="info-value">${lead.email}</span></div>` : ""}
            ${lead.phone ? `<div class="info-row"><span class="info-label">WhatsApp</span><span class="info-value">${lead.phone}</span></div>` : ""}
            ${lead.location ? `<div class="info-row"><span class="info-label">Localização</span><span class="info-value">${lead.location}</span></div>` : ""}
            ${lead.discovered.origin ? `<div class="info-row"><span class="info-label">Origem</span><span class="info-value">${lead.discovered.origin}</span></div>` : ""}
            ${lead.discovered.education ? `<div class="info-row"><span class="info-label">Educação</span><span class="info-value">${lead.discovered.education}</span></div>` : ""}
          </div>
          ${lead.company ? `
          <div class="info-card">
            <h4 class="info-card-title">${lead.company}</h4>
            ${lead.role ? `<div class="info-row"><span class="info-label">Cargo</span><span class="info-value">${lead.role}</span></div>` : ""}
            ${lead.financials?.managedCapital ? `<div class="info-row"><span class="info-label">Capital sob Gestão</span><span class="info-value"><strong>${lead.financials.managedCapital}</strong></span></div>` : ""}
            ${lead.discovered.instagram ? `<div class="info-row"><span class="info-label">Instagram</span><span class="info-value">${lead.discovered.instagram}</span></div>` : ""}
            ${lead.discovered.linkedIn ? `<div class="info-row"><span class="info-label">LinkedIn</span><span class="info-value">${lead.discovered.linkedIn}</span></div>` : ""}
          </div>
          ` : ""}
        </div>

        ${lead.financials?.assets && lead.financials.assets.length > 0 ? `
        <h4 class="info-card-title">Patrimônio</h4>
        <table class="data-table">
          <thead>
            <tr>
              <th>Bem</th>
              <th>Valor Estimado</th>
            </tr>
          </thead>
          <tbody>
            ${lead.financials.assets.map(asset => `
              <tr>
                <td>${asset.name}</td>
                <td><strong>${asset.value}</strong></td>
              </tr>
            `).join("")}
            ${lead.financials.totalWealth ? `
              <tr>
                <td><strong>Patrimônio Total</strong></td>
                <td><strong>${lead.financials.totalWealth}</strong></td>
              </tr>
            ` : ""}
          </tbody>
        </table>
        ` : ""}

        ${lead.portfolio && lead.portfolio.length > 0 ? `
        <h4 class="info-card-title">Portfólio de Investimentos</h4>
        <table class="data-table">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Setor</th>
            </tr>
          </thead>
          <tbody>
            ${lead.portfolio.map(item => `
              <tr>
                <td>${item.company}</td>
                <td>${item.sector}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        ` : ""}

        ${lead.alerts && lead.alerts.length > 0 ? `
        <div class="alert-box">
          <div class="alert-box-title">⚠️ Alertas e Investigações</div>
          <ul class="alert-list">
            ${lead.alerts.map(alert => `<li>${alert}</li>`).join("")}
          </ul>
        </div>
        ` : ""}

        ${lead.highlights && lead.highlights.length > 0 ? `
        <div class="highlight-box">
          <div class="highlight-title">★ Por Que é Premium</div>
          <ul class="highlight-list">
            ${lead.highlights.map(h => `<li>${h}</li>`).join("")}
          </ul>
        </div>
        ` : ""}

        <div class="recommendation" style="background: ${recStyle.bg}; border-color: ${recStyle.border};">
          <div class="recommendation-title" style="color: ${recStyle.title};">
            ${lead.recommendation.action === "avoid" ? "✗" : lead.recommendation.action === "priority" ? "★" : "◆"}
            Recomendação: ${lead.recommendation.title.toUpperCase()}
          </div>
          <p>${lead.recommendation.description}</p>
        </div>

        ${lead.sources && lead.sources.length > 0 ? `
        <div class="sources">
          <h4 class="info-card-title">Fontes</h4>
          <ol>
            ${lead.sources.map(s => `<li>${s}</li>`).join("")}
          </ol>
        </div>
        ` : ""}
      </div>
    </div>
  `;
}

export function generateLeadReportHtml(data: ReportData): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.title}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f8fafc;
            color: #1e293b;
            line-height: 1.6;
            font-size: 14px;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
            padding: 40px;
        }

        .header {
            background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
            color: white;
            padding: 50px 40px;
            border-radius: 16px;
            margin-bottom: 30px;
            position: relative;
            overflow: hidden;
        }

        .header::before {
            content: '';
            position: absolute;
            top: -50%;
            right: -20%;
            width: 400px;
            height: 400px;
            background: rgba(255,255,255,0.03);
            border-radius: 50%;
        }

        .header h1 {
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 8px;
            letter-spacing: -0.5px;
        }

        .header-subtitle {
            font-size: 16px;
            opacity: 0.8;
            font-weight: 400;
        }

        .header-meta {
            display: flex;
            gap: 30px;
            margin-top: 25px;
            padding-top: 20px;
            border-top: 1px solid rgba(255,255,255,0.1);
        }

        .header-meta-item {
            display: flex;
            flex-direction: column;
        }

        .header-meta-label {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 1px;
            opacity: 0.6;
        }

        .header-meta-value {
            font-size: 15px;
            font-weight: 600;
            margin-top: 4px;
        }

        .summary-section {
            margin-bottom: 40px;
        }

        .section-title {
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: #64748b;
            margin-bottom: 20px;
            font-weight: 600;
        }

        .summary-cards {
            display: grid;
            grid-template-columns: repeat(${Math.min(data.leads.length, 3)}, 1fr);
            gap: 16px;
        }

        .summary-card {
            background: white;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08);
            border: 1px solid #e2e8f0;
        }

        .card-tier {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 700;
            margin-bottom: 8px;
        }

        .card-name {
            font-size: 18px;
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 4px;
        }

        .card-company {
            font-size: 13px;
            color: #64748b;
            margin-bottom: 12px;
        }

        .card-value {
            font-size: 14px;
            font-weight: 600;
            color: #0f172a;
            padding: 8px 12px;
            background: #f1f5f9;
            border-radius: 6px;
            display: inline-block;
        }

        .card-action {
            margin-top: 16px;
            padding-top: 16px;
            border-top: 1px solid #e2e8f0;
            font-size: 12px;
            font-weight: 600;
        }

        .lead-section {
            background: white;
            border-radius: 16px;
            margin-bottom: 30px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08);
            border: 1px solid #e2e8f0;
            overflow: hidden;
            page-break-inside: avoid;
        }

        .lead-header {
            padding: 30px;
            display: flex;
            align-items: center;
            gap: 20px;
            border-bottom: 1px solid #e2e8f0;
        }

        .lead-avatar {
            width: 64px;
            height: 64px;
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            font-weight: 700;
            color: white;
            flex-shrink: 0;
        }

        .lead-title-area {
            flex: 1;
        }

        .lead-name {
            font-size: 24px;
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 4px;
        }

        .lead-subtitle {
            font-size: 14px;
            color: #64748b;
        }

        .lead-badge {
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .lead-content {
            padding: 30px;
        }

        .info-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            margin-bottom: 30px;
        }

        .info-card {
            background: #f8fafc;
            border-radius: 10px;
            padding: 20px;
        }

        .info-card-title {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #64748b;
            margin-bottom: 12px;
            font-weight: 600;
        }

        .info-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e2e8f0;
        }

        .info-row:last-child {
            border-bottom: none;
        }

        .info-label {
            color: #64748b;
            font-size: 13px;
        }

        .info-value {
            color: #0f172a;
            font-weight: 500;
            font-size: 13px;
            text-align: right;
        }

        .alert-box {
            background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
            border: 1px solid #fecaca;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 25px;
        }

        .alert-box-title {
            font-size: 14px;
            font-weight: 700;
            color: #dc2626;
            margin-bottom: 12px;
        }

        .alert-list {
            list-style: none;
        }

        .alert-list li {
            padding: 6px 0;
            font-size: 13px;
            color: #7f1d1d;
            padding-left: 20px;
            position: relative;
        }

        .alert-list li::before {
            content: '!';
            position: absolute;
            left: 0;
            width: 14px;
            height: 14px;
            background: #dc2626;
            color: white;
            border-radius: 50%;
            font-size: 10px;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: center;
            top: 8px;
        }

        .highlight-box {
            background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%);
            border: 1px solid #ddd6fe;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 25px;
        }

        .highlight-title {
            font-size: 14px;
            font-weight: 700;
            color: #6d28d9;
            margin-bottom: 12px;
        }

        .highlight-list {
            list-style: none;
        }

        .highlight-list li {
            padding: 6px 0;
            font-size: 13px;
            color: #4c1d95;
            padding-left: 24px;
            position: relative;
        }

        .highlight-list li::before {
            content: '✓';
            position: absolute;
            left: 0;
            color: #7c3aed;
            font-weight: 700;
        }

        .data-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }

        .data-table th {
            text-align: left;
            padding: 12px 16px;
            background: #f1f5f9;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #64748b;
            font-weight: 600;
        }

        .data-table td {
            padding: 12px 16px;
            border-bottom: 1px solid #e2e8f0;
            font-size: 13px;
        }

        .data-table tr:last-child td {
            border-bottom: none;
        }

        .recommendation {
            border-radius: 12px;
            padding: 20px;
            margin-top: 20px;
            border: 1px solid;
        }

        .recommendation-title {
            font-size: 14px;
            font-weight: 700;
            margin-bottom: 8px;
        }

        .recommendation p {
            font-size: 13px;
            color: #374151;
        }

        .sources {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
        }

        .sources ol {
            padding-left: 20px;
            font-size: 12px;
            color: #64748b;
        }

        .sources li {
            padding: 4px 0;
        }

        .action-plan {
            background: white;
            border-radius: 16px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08);
            border: 1px solid #e2e8f0;
        }

        .action-plan-title {
            font-size: 20px;
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 20px;
        }

        .action-item {
            display: flex;
            align-items: flex-start;
            gap: 16px;
            padding: 16px 0;
            border-bottom: 1px solid #e2e8f0;
        }

        .action-item:last-child {
            border-bottom: none;
        }

        .action-number {
            width: 32px;
            height: 32px;
            background: linear-gradient(135deg, #0f172a, #1e3a5f);
            color: white;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: 700;
            flex-shrink: 0;
        }

        .action-content h4 {
            font-size: 15px;
            font-weight: 600;
            color: #0f172a;
            margin-bottom: 4px;
        }

        .action-content p {
            font-size: 13px;
            color: #64748b;
        }

        .footer {
            text-align: center;
            padding: 30px;
            color: #94a3b8;
            font-size: 12px;
        }

        .footer-logo {
            font-size: 18px;
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 8px;
        }

        @media print {
            .lead-section {
                page-break-inside: avoid;
            }
            body {
                background: white;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${data.title}</h1>
            <p class="header-subtitle">Análise detalhada com pesquisa web e qualificação de potencial</p>
            <div class="header-meta">
                <div class="header-meta-item">
                    <span class="header-meta-label">Data</span>
                    <span class="header-meta-value">${data.date}</span>
                </div>
                <div class="header-meta-item">
                    <span class="header-meta-label">Total de Leads</span>
                    <span class="header-meta-value">${data.leads.length} leads analisados</span>
                </div>
                <div class="header-meta-item">
                    <span class="header-meta-label">Gerado por</span>
                    <span class="header-meta-value">${data.analyst}</span>
                </div>
            </div>
        </div>

        <div class="summary-section">
            <h2 class="section-title">Sumário Executivo</h2>
            <div class="summary-cards">
                ${data.leads.map((lead, i) => renderLeadCard(lead, i)).join("")}
            </div>
        </div>

        ${data.leads.map((lead, i) => renderLeadSection(lead, i)).join("")}

        ${data.actionPlan && data.actionPlan.length > 0 ? `
        <div class="action-plan">
            <h2 class="action-plan-title">Plano de Ação</h2>
            ${data.actionPlan.map((item, i) => `
            <div class="action-item">
                <div class="action-number">${i + 1}</div>
                <div class="action-content">
                    <h4>${item.lead}</h4>
                    <p>${item.action}</p>
                </div>
            </div>
            `).join("")}
        </div>
        ` : ""}

        <div class="footer">
            <div class="footer-logo">C2S Lead Analysis</div>
            <p>Relatório gerado automaticamente • ${data.date} • Versão 1.0</p>
        </div>
    </div>
</body>
</html>`;
}
