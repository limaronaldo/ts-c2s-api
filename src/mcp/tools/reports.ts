/**
 * Report Generation MCP Tools
 * RML-990: Generate professional reports in MD/HTML/PDF
 *
 * Tools:
 * - generate_profile_report: Generate report from person data
 * - generate_report_from_cpfs: Lookup CPFs and generate report
 * - generate_report_pdf: Generate PDF report (requires md-to-pdf)
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceContainer } from "../../container";
import type { ReportPerson, ReportOptions } from "../../services/profile-report.service";

export const reportTools: Tool[] = [
  {
    name: "generate_profile_report",
    description:
      "Generate a professional profile report in Markdown or HTML format. Includes executive summary, individual profiles with contact info, income, and addresses. Returns the report content directly.",
    inputSchema: {
      type: "object",
      properties: {
        persons: {
          type: "array",
          description: "Array of person data to include in report",
          items: {
            type: "object",
            properties: {
              cpf: { type: "string", description: "CPF number" },
              name: { type: "string", description: "Full name" },
              occupation: { type: "string", description: "Job title/occupation" },
              company: { type: "string", description: "Company name" },
              birthDate: { type: "string", description: "Birth date (DD/MM/YYYY)" },
              gender: { type: "string", description: "M or F" },
              income: { type: "number", description: "Monthly income in R$" },
              phones: {
                type: "array",
                items: { type: "string" },
                description: "List of phone numbers",
              },
              emails: {
                type: "array",
                items: { type: "string" },
                description: "List of email addresses",
              },
              address: {
                type: "object",
                properties: {
                  street: { type: "string" },
                  number: { type: "string" },
                  neighborhood: { type: "string" },
                  city: { type: "string" },
                  state: { type: "string" },
                },
              },
            },
            required: ["cpf", "name"],
          },
        },
        title: {
          type: "string",
          description: "Report title",
        },
        subtitle: {
          type: "string",
          description: "Report subtitle (optional)",
        },
        format: {
          type: "string",
          enum: ["md", "html"],
          description: "Output format: md (Markdown) or html",
        },
        includeContacts: {
          type: "boolean",
          description: "Include phone/email in report (default: true)",
        },
        includeIncome: {
          type: "boolean",
          description: "Include income data in report (default: true)",
        },
      },
      required: ["persons", "title"],
    },
  },
  {
    name: "generate_report_from_cpfs",
    description:
      "Generate a report by looking up CPFs from the database. Fetches saved person data for each CPF and generates a formatted report. Useful when you have CPFs and want to create a summary report.",
    inputSchema: {
      type: "object",
      properties: {
        cpfs: {
          type: "array",
          items: { type: "string" },
          description: "Array of CPF numbers to include",
        },
        title: {
          type: "string",
          description: "Report title",
        },
        subtitle: {
          type: "string",
          description: "Report subtitle (optional)",
        },
        format: {
          type: "string",
          enum: ["md", "html", "pdf"],
          description: "Output format (default: md)",
        },
        includeContacts: {
          type: "boolean",
          description: "Include phone/email (default: true)",
        },
        includeIncome: {
          type: "boolean",
          description: "Include income data (default: true)",
        },
      },
      required: ["cpfs", "title"],
    },
  },
  {
    name: "generate_report_pdf",
    description:
      "Generate a PDF report from person data. Requires md-to-pdf to be available. If PDF generation fails, returns Markdown content as fallback. Saves file to reports/ directory.",
    inputSchema: {
      type: "object",
      properties: {
        persons: {
          type: "array",
          description: "Array of person data",
          items: {
            type: "object",
            properties: {
              cpf: { type: "string" },
              name: { type: "string" },
              occupation: { type: "string" },
              company: { type: "string" },
              birthDate: { type: "string" },
              gender: { type: "string" },
              income: { type: "number" },
              phones: { type: "array", items: { type: "string" } },
              emails: { type: "array", items: { type: "string" } },
              address: {
                type: "object",
                properties: {
                  street: { type: "string" },
                  number: { type: "string" },
                  neighborhood: { type: "string" },
                  city: { type: "string" },
                  state: { type: "string" },
                },
              },
            },
            required: ["cpf", "name"],
          },
        },
        title: {
          type: "string",
          description: "Report title",
        },
        subtitle: {
          type: "string",
          description: "Report subtitle",
        },
        outputDir: {
          type: "string",
          description: "Output directory (default: ./reports)",
        },
      },
      required: ["persons", "title"],
    },
  },
];

export async function handleReportTool(
  name: string,
  args: Record<string, unknown>,
  container: ServiceContainer,
): Promise<unknown> {
  switch (name) {
    case "generate_profile_report": {
      const {
        persons,
        title,
        subtitle,
        format = "md",
        includeContacts = true,
        includeIncome = true,
      } = args as {
        persons: ReportPerson[];
        title: string;
        subtitle?: string;
        format?: "md" | "html";
        includeContacts?: boolean;
        includeIncome?: boolean;
      };

      if (!persons || persons.length === 0) {
        return {
          success: false,
          error: "No persons provided for report",
        };
      }

      // Ensure persons have required arrays
      const normalizedPersons = persons.map((p) => ({
        ...p,
        phones: p.phones || [],
        emails: p.emails || [],
      }));

      const options: ReportOptions = {
        title,
        subtitle,
        includeContacts,
        includeIncome,
      };

      let result;
      if (format === "html") {
        result = await container.profileReport.generateHtml(normalizedPersons, options);
      } else {
        result = await container.profileReport.generateMarkdown(normalizedPersons, options);
      }

      if (!result.success) {
        return {
          success: false,
          error: result.error || "Failed to generate report",
        };
      }

      return {
        success: true,
        format: result.format,
        personCount: persons.length,
        title,
        content: result.content,
        contentLength: result.content?.length || 0,
      };
    }

    case "generate_report_from_cpfs": {
      const {
        cpfs,
        title,
        subtitle,
        format = "md",
        includeContacts = true,
        includeIncome = true,
      } = args as {
        cpfs: string[];
        title: string;
        subtitle?: string;
        format?: "md" | "html" | "pdf";
        includeContacts?: boolean;
        includeIncome?: boolean;
      };

      if (!cpfs || cpfs.length === 0) {
        return {
          success: false,
          error: "No CPFs provided",
        };
      }

      // Normalize CPFs
      const normalizedCpfs = cpfs.map((cpf) => cpf.replace(/\D/g, ""));

      const options = {
        title,
        subtitle,
        format,
        includeContacts,
        includeIncome,
      };

      const result = await container.profileReport.generateFromCpfs(normalizedCpfs, options);

      if (!result.success) {
        return {
          success: false,
          error: result.error || "Failed to generate report from CPFs",
          cpfsRequested: cpfs.length,
        };
      }

      return {
        success: true,
        format: result.format,
        cpfsRequested: cpfs.length,
        title,
        filePath: result.filePath,
        content: result.content,
        contentLength: result.content?.length || 0,
      };
    }

    case "generate_report_pdf": {
      const {
        persons,
        title,
        subtitle,
        outputDir,
      } = args as {
        persons: ReportPerson[];
        title: string;
        subtitle?: string;
        outputDir?: string;
      };

      if (!persons || persons.length === 0) {
        return {
          success: false,
          error: "No persons provided for PDF report",
        };
      }

      // Ensure persons have required arrays
      const normalizedPersons = persons.map((p) => ({
        ...p,
        phones: p.phones || [],
        emails: p.emails || [],
      }));

      const options: ReportOptions = {
        title,
        subtitle,
        outputDir,
        includeContacts: true,
        includeIncome: true,
      };

      const result = await container.profileReport.generatePdf(normalizedPersons, options);

      if (!result.success) {
        return {
          success: false,
          error: result.error || "Failed to generate PDF",
        };
      }

      // PDF might fall back to MD if md-to-pdf not available
      if (result.format === "md") {
        return {
          success: true,
          format: "md",
          note: "PDF generation unavailable, returned Markdown instead",
          filePath: result.filePath,
          content: result.content,
          personCount: persons.length,
        };
      }

      return {
        success: true,
        format: "pdf",
        filePath: result.filePath,
        personCount: persons.length,
        title,
      };
    }

    default:
      throw new Error(`Unknown report tool: ${name}`);
  }
}
