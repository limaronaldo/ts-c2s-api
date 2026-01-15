/**
 * Report Service
 * RML-871: Geração automática de relatórios PDF de análise de leads
 */

import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { logger } from "../utils/logger";
import { generateLeadReportHtml, type ReportData, type LeadReportData } from "../templates/lead-report.html";

const execAsync = promisify(exec);

export class ReportService {
  private tempDir: string;
  private chromePath: string;

  constructor() {
    this.tempDir = "/tmp/c2s-reports";
    // Chrome paths for different OS
    this.chromePath = this.detectChromePath();
  }

  private detectChromePath(): string {
    const paths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", // macOS
      "/usr/bin/google-chrome", // Linux
      "/usr/bin/chromium-browser", // Linux Chromium
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", // Windows
    ];

    for (const p of paths) {
      if (existsSync(p)) {
        return p;
      }
    }

    // Default to hoping it's in PATH
    return "google-chrome";
  }

  /**
   * Generate PDF report from lead data
   */
  async generatePdf(data: ReportData): Promise<Buffer> {
    const log = logger.child({ module: "report", action: "generatePdf" });

    try {
      // Ensure temp directory exists
      if (!existsSync(this.tempDir)) {
        await mkdir(this.tempDir, { recursive: true });
      }

      const timestamp = Date.now();
      const htmlPath = path.join(this.tempDir, `report-${timestamp}.html`);
      const pdfPath = path.join(this.tempDir, `report-${timestamp}.pdf`);

      // Generate HTML
      const html = generateLeadReportHtml(data);
      await writeFile(htmlPath, html, "utf-8");

      log.info({ htmlPath }, "HTML report generated");

      // Convert to PDF using Chrome headless
      const command = `"${this.chromePath}" --headless --disable-gpu --no-sandbox --print-to-pdf="${pdfPath}" "${htmlPath}"`;

      await execAsync(command, { timeout: 30000 });

      log.info({ pdfPath }, "PDF report generated");

      // Read PDF into buffer
      const pdfBuffer = await Bun.file(pdfPath).arrayBuffer();

      // Cleanup temp files
      await Promise.all([
        unlink(htmlPath).catch(() => {}),
        unlink(pdfPath).catch(() => {}),
      ]);

      return Buffer.from(pdfBuffer);
    } catch (error) {
      log.error({ error }, "Failed to generate PDF report");
      throw error;
    }
  }

  /**
   * Generate HTML report (for preview or when PDF generation fails)
   */
  generateHtml(data: ReportData): string {
    return generateLeadReportHtml(data);
  }

  /**
   * Convert database lead to report format
   */
  static formatLeadForReport(
    lead: {
      id: string;
      name?: string | null;
      email?: string | null;
      phone?: string | null;
      enrichment_status?: string | null;
      user_latitude?: string | null;
      user_longitude?: string | null;
    },
    analysis?: {
      tier?: LeadReportData["tier"];
      tierLabel?: string;
      company?: string;
      role?: string;
      fullName?: string;
      origin?: string;
      education?: string;
      instagram?: string;
      linkedIn?: string;
      assets?: Array<{ name: string; value: string }>;
      totalWealth?: string;
      managedCapital?: string;
      income?: string;
      portfolio?: Array<{ company: string; sector: string }>;
      alerts?: string[];
      highlights?: string[];
      recommendation?: {
        action: LeadReportData["recommendation"]["action"];
        title: string;
        description: string;
      };
      sources?: string[];
    }
  ): LeadReportData {
    const tier = analysis?.tier || "bronze";
    const tierLabels: Record<LeadReportData["tier"], string> = {
      platinum: "Platinum",
      gold: "Gold",
      silver: "Silver",
      bronze: "Bronze",
      risk: "Alto Risco",
    };

    const defaultRecommendations: Record<LeadReportData["tier"], LeadReportData["recommendation"]> = {
      platinum: {
        action: "priority",
        title: "Prioridade Máxima",
        description: "Lead de altíssimo valor. Abordagem premium e personalizada recomendada.",
      },
      gold: {
        action: "priority",
        title: "Alta Prioridade",
        description: "Lead de alto valor. Contato prioritário recomendado.",
      },
      silver: {
        action: "qualify",
        title: "Qualificar",
        description: "Lead com potencial. Necessário qualificar interesse antes de prosseguir.",
      },
      bronze: {
        action: "contact",
        title: "Contatar",
        description: "Lead padrão. Seguir processo normal de contato.",
      },
      risk: {
        action: "avoid",
        title: "Evitar",
        description: "Lead com alto risco. Não recomendado prosseguir.",
      },
    };

    let location: string | undefined;
    if (lead.user_latitude && lead.user_longitude) {
      location = `${lead.user_latitude}, ${lead.user_longitude}`;
    }

    return {
      name: lead.name || "Não informado",
      email: lead.email || undefined,
      phone: lead.phone || undefined,
      location,
      tier,
      tierLabel: analysis?.tierLabel || tierLabels[tier],
      company: analysis?.company,
      role: analysis?.role,
      discovered: {
        fullName: analysis?.fullName,
        origin: analysis?.origin,
        education: analysis?.education,
        instagram: analysis?.instagram,
        linkedIn: analysis?.linkedIn,
      },
      financials: {
        assets: analysis?.assets,
        totalWealth: analysis?.totalWealth,
        managedCapital: analysis?.managedCapital,
        income: analysis?.income,
      },
      portfolio: analysis?.portfolio,
      alerts: analysis?.alerts,
      highlights: analysis?.highlights,
      recommendation: analysis?.recommendation || defaultRecommendations[tier],
      sources: analysis?.sources,
    };
  }

  /**
   * Create report data structure
   */
  static createReportData(
    leads: LeadReportData[],
    options?: {
      title?: string;
      analyst?: string;
    }
  ): ReportData {
    const now = new Date();
    const dateStr = now.toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    // Generate action plan based on leads
    const actionPlan = leads
      .filter((l) => l.tier !== "risk")
      .sort((a, b) => {
        const tierOrder = { platinum: 0, gold: 1, silver: 2, bronze: 3, risk: 4 };
        return tierOrder[a.tier] - tierOrder[b.tier];
      })
      .map((lead) => ({
        lead: lead.name,
        action: lead.recommendation.description,
      }));

    // Add risk leads at the end with "avoid" action
    leads
      .filter((l) => l.tier === "risk")
      .forEach((lead) => {
        actionPlan.push({
          lead: `${lead.name} - Não prosseguir`,
          action: "Marcar como 'Não prosseguir' no CRM. Risco reputacional alto.",
        });
      });

    return {
      title: options?.title || "Relatório de Análise de Leads",
      date: dateStr,
      analyst: options?.analyst || "Sistema C2S + Claude AI",
      leads,
      actionPlan,
    };
  }
}
