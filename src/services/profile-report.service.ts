/**
 * Profile Report Service - Geração de relatórios de perfis de pessoas/empresas
 *
 * Este serviço permite gerar relatórios de pessoas/empresas enriquecidas
 * em formatos como Markdown, HTML e PDF.
 *
 * Diferente do ReportService (lead-report.html), este foca em perfis de CPF
 * com dados do Work API / CPF Lookup.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { DbStorageService } from "./db-storage.service";

const execAsync = promisify(exec);

// Logger inline
const log = (level: string, msg: string, data?: Record<string, unknown>) => {
  console.log(
    JSON.stringify({
      level,
      module: "report",
      msg,
      ...data,
      timestamp: new Date().toISOString(),
    }),
  );
};

export interface ReportPerson {
  cpf: string;
  name: string;
  occupation?: string;
  company?: string;
  birthDate?: string;
  gender?: string;
  income?: number;
  phones: string[];
  emails: string[];
  address?: {
    street?: string;
    number?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
  };
}

export interface ReportOptions {
  title: string;
  subtitle?: string;
  classification?: string;
  includeContacts?: boolean;
  includeIncome?: boolean;
  outputDir?: string;
}

export interface ReportResult {
  success: boolean;
  format: "md" | "html" | "pdf";
  filePath?: string;
  content?: string;
  error?: string;
}

export class ProfileReportService {
  private readonly dbStorage: DbStorageService;
  private readonly defaultOutputDir: string;

  constructor() {
    this.dbStorage = new DbStorageService();
    this.defaultOutputDir = join(process.cwd(), "reports");
  }

  /**
   * Gera relatório em Markdown
   */
  async generateMarkdown(
    persons: ReportPerson[],
    options: ReportOptions,
  ): Promise<ReportResult> {
    const {
      title,
      subtitle,
      classification = "Confidencial - Uso Interno",
      includeContacts = true,
      includeIncome = true,
    } = options;

    const lines: string[] = [];

    // Header
    lines.push(`# ${title}`);
    lines.push("");
    if (subtitle) {
      lines.push(`**${subtitle}**`);
      lines.push("");
    }
    lines.push(
      `**Data do Relatório:** ${new Date().toLocaleDateString("pt-BR")}`,
    );
    lines.push(`**Classificação:** ${classification}`);
    lines.push(`**Total de Registros:** ${persons.length}`);
    lines.push("");
    lines.push("---");
    lines.push("");

    // Sumário
    lines.push("## Sumário Executivo");
    lines.push("");

    const withIncome = persons.filter((p) => p.income && p.income > 0);
    const avgIncome =
      withIncome.length > 0
        ? withIncome.reduce((sum, p) => sum + (p.income || 0), 0) /
          withIncome.length
        : 0;
    const totalPhones = persons.reduce((sum, p) => sum + p.phones.length, 0);
    const totalEmails = persons.reduce((sum, p) => sum + p.emails.length, 0);

    lines.push("| Métrica | Valor |");
    lines.push("|---------|-------|");
    lines.push(`| Total de Pessoas | ${persons.length} |`);
    lines.push(`| Com Renda Informada | ${withIncome.length} |`);
    if (includeIncome && avgIncome > 0) {
      lines.push(
        `| Renda Média | R$ ${avgIncome.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} |`,
      );
    }
    lines.push(`| Total de Telefones | ${totalPhones} |`);
    lines.push(`| Total de Emails | ${totalEmails} |`);
    lines.push("");
    lines.push("---");
    lines.push("");

    // Perfis individuais
    lines.push("## Perfis Detalhados");
    lines.push("");

    for (let i = 0; i < persons.length; i++) {
      const person = persons[i];

      lines.push(`### ${i + 1}. ${person.name}`);
      if (person.occupation) {
        lines.push(`**Cargo:** ${person.occupation}`);
      }
      if (person.company) {
        lines.push(`**Empresa:** ${person.company}`);
      }
      lines.push("");

      // Dados básicos
      lines.push("| Campo | Valor |");
      lines.push("|-------|-------|");
      lines.push(`| **CPF** | ${this.formatCpf(person.cpf)} |`);
      if (person.birthDate) {
        lines.push(`| **Data de Nascimento** | ${person.birthDate} |`);
      }
      if (person.gender) {
        lines.push(
          `| **Gênero** | ${person.gender === "M" ? "Masculino" : "Feminino"} |`,
        );
      }
      if (includeIncome && person.income) {
        lines.push(
          `| **Renda Estimada** | R$ ${person.income.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês |`,
        );
      }
      lines.push("");

      // Endereço
      if (person.address && person.address.city) {
        const addr = person.address;
        const fullAddress = [
          addr.street,
          addr.number,
          addr.neighborhood,
          `${addr.city}/${addr.state}`,
        ]
          .filter(Boolean)
          .join(", ");

        lines.push(`**Endereço:** ${fullAddress}`);
        lines.push("");
      }

      // Contatos
      if (
        includeContacts &&
        (person.phones.length > 0 || person.emails.length > 0)
      ) {
        lines.push("**Contatos:**");
        lines.push("");
        lines.push("| Tipo | Contato |");
        lines.push("|------|---------|");

        // Limitar a 5 telefones e 3 emails para não poluir
        const topPhones = person.phones.slice(0, 5);
        const topEmails = person.emails.slice(0, 3);

        for (const phone of topPhones) {
          lines.push(`| 📱 Telefone | ${this.formatPhone(phone)} |`);
        }
        for (const email of topEmails) {
          lines.push(`| 📧 Email | ${email} |`);
        }

        if (person.phones.length > 5) {
          lines.push(`| | *+${person.phones.length - 5} telefone(s)* |`);
        }
        if (person.emails.length > 3) {
          lines.push(`| | *+${person.emails.length - 3} email(s)* |`);
        }
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    }

    // Footer
    lines.push("## Informações do Relatório");
    lines.push("");
    lines.push(`- **Gerado em:** ${new Date().toLocaleString("pt-BR")}`);
    lines.push(`- **Sistema:** ts-c2s-api`);
    lines.push(
      `- **Fonte dos dados:** Work API (Completa Buscas) + CPF Lookup API (DuckDB)`,
    );
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(
      "*Este documento contém informações confidenciais protegidas pela LGPD.*",
    );

    const content = lines.join("\n");

    return {
      success: true,
      format: "md",
      content,
    };
  }

  /**
   * Gera relatório em HTML
   */
  async generateHtml(
    persons: ReportPerson[],
    options: ReportOptions,
  ): Promise<ReportResult> {
    // Primeiro gera o Markdown
    const mdResult = await this.generateMarkdown(persons, options);

    if (!mdResult.success || !mdResult.content) {
      return {
        success: false,
        format: "html",
        error: "Failed to generate markdown",
      };
    }

    // Converte Markdown para HTML simples
    const html = this.markdownToHtml(mdResult.content, options.title);

    return {
      success: true,
      format: "html",
      content: html,
    };
  }

  /**
   * Gera relatório em PDF
   */
  async generatePdf(
    persons: ReportPerson[],
    options: ReportOptions,
  ): Promise<ReportResult> {
    const outputDir = options.outputDir || this.defaultOutputDir;

    // Garantir que o diretório existe
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    // Gerar nome do arquivo
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const safeName = options.title.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 50);
    const baseName = `${safeName}_${timestamp}`;
    const mdPath = join(outputDir, `${baseName}.md`);
    const pdfPath = join(outputDir, `${baseName}.pdf`);

    try {
      // Gerar Markdown
      const mdResult = await this.generateMarkdown(persons, options);

      if (!mdResult.success || !mdResult.content) {
        return {
          success: false,
          format: "pdf",
          error: "Failed to generate markdown",
        };
      }

      // Salvar arquivo MD temporário
      await writeFile(mdPath, mdResult.content, "utf-8");

      // Tentar converter para PDF usando md-to-pdf via npx
      try {
        await execAsync(`npx md-to-pdf "${mdPath}" --dest "${pdfPath}"`, {
          timeout: 60000,
        });

        // Verificar se PDF foi criado
        if (existsSync(pdfPath)) {
          log("info", "PDF generated successfully", { path: pdfPath });

          // Remover arquivo MD temporário
          await unlink(mdPath).catch(() => {});

          return {
            success: true,
            format: "pdf",
            filePath: pdfPath,
          };
        }
      } catch (pdfError) {
        log("warn", "md-to-pdf failed, keeping markdown", {
          error: String(pdfError),
        });
      }

      // Se falhou o PDF, retorna o MD
      return {
        success: true,
        format: "md",
        filePath: mdPath,
        content: mdResult.content,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log("error", "Failed to generate PDF", { error: errorMsg });

      return {
        success: false,
        format: "pdf",
        error: errorMsg,
      };
    }
  }

  /**
   * Gera relatório a partir de party IDs do banco
   */
  async generateFromPartyIds(
    partyIds: string[],
    options: ReportOptions & { format?: "md" | "html" | "pdf" },
  ): Promise<ReportResult> {
    const persons: ReportPerson[] = [];

    for (const partyId of partyIds) {
      const party = await this.dbStorage.findPartyById(partyId);
      if (!party) continue;

      const contacts = await this.dbStorage.findContactsByPartyId(partyId);

      persons.push({
        cpf: party.cpfCnpj || "",
        name: party.name || "Desconhecido",
        occupation: party.occupation || undefined,
        birthDate: party.birthDate
          ? new Date(party.birthDate).toLocaleDateString("pt-BR")
          : undefined,
        gender: party.gender || undefined,
        income: party.income ? Number(party.income) : undefined,
        phones: contacts.filter((c) => c.type === "phone").map((c) => c.value),
        emails: contacts.filter((c) => c.type === "email").map((c) => c.value),
      });
    }

    const format = options.format || "md";

    switch (format) {
      case "pdf":
        return this.generatePdf(persons, options);
      case "html":
        return this.generateHtml(persons, options);
      default:
        return this.generateMarkdown(persons, options);
    }
  }

  /**
   * Gera relatório a partir de CPFs
   */
  async generateFromCpfs(
    cpfs: string[],
    options: ReportOptions & { format?: "md" | "html" | "pdf" },
  ): Promise<ReportResult> {
    const partyIds: string[] = [];

    for (const cpf of cpfs) {
      const party = await this.dbStorage.findPartyByCpf(cpf);
      if (party) {
        partyIds.push(party.id);
      }
    }

    if (partyIds.length === 0) {
      return {
        success: false,
        format: options.format || "md",
        error: "Nenhum registro encontrado para os CPFs informados",
      };
    }

    return this.generateFromPartyIds(partyIds, options);
  }

  // === Helpers ===

  private formatCpf(cpf: string): string {
    const clean = cpf.replace(/\D/g, "");
    if (clean.length !== 11) return cpf;
    return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`;
  }

  private formatPhone(phone: string): string {
    const clean = phone.replace(/\D/g, "");
    if (clean.length === 11) {
      return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
    }
    if (clean.length === 10) {
      return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
    }
    return phone;
  }

  private markdownToHtml(markdown: string, title: string): string {
    // Conversão simples de Markdown para HTML
    let html = markdown
      // Headers
      .replace(/^### (.*$)/gm, "<h3>$1</h3>")
      .replace(/^## (.*$)/gm, "<h2>$1</h2>")
      .replace(/^# (.*$)/gm, "<h1>$1</h1>")
      // Bold
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      // Italic
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      // Tables
      .replace(/\|(.+)\|/g, (match) => {
        const cells = match.split("|").filter((c) => c.trim());
        const isHeader = match.includes("---");
        if (isHeader) return "";
        const tag = "td";
        return `<tr>${cells.map((c) => `<${tag}>${c.trim()}</${tag}>`).join("")}</tr>`;
      })
      // Line breaks
      .replace(/---/g, "<hr>")
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g, "<br>");

    // Wrap tables
    html = html.replace(/(<tr>.*?<\/tr>)+/gs, "<table>$&</table>");

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }
    table { border-collapse: collapse; width: 100%; margin: 10px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f4f4f4; }
    hr { margin: 20px 0; border: none; border-top: 1px solid #ddd; }
    h1 { color: #333; }
    h2 { color: #555; border-bottom: 1px solid #eee; padding-bottom: 5px; }
    h3 { color: #666; }
  </style>
</head>
<body>
  <p>${html}</p>
</body>
</html>`;
  }
}
