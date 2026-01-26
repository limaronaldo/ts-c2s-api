import { ReportService } from "../src/services/report.service";
import type { LeadReportData } from "../src/templates/lead-report.html";

const leads: LeadReportData[] = [
  {
    name: "Fernando",
    email: "fernando@oig.company",
    phone: "+55 86 9884-50606",
    location: "-23.50, -46.85",
    tier: "risk",
    tierLabel: "Alto Risco",
    company: "One Internet Group (OIG)",
    role: "Fundador e Presidente",
    discovered: {
      fullName: "Fernando Oliveira Lima",
      origin: "Dom Pedro, Maranhão",
      instagram: "@fernandin (~1M seguidores)",
    },
    financials: {
      assets: [
        { name: "Jatinho Gulfstream G650ER", value: "US$ 65 milhões" },
        { name: "Megaiate Azimut 27 Metri", value: "R$ 54 milhões" },
        { name: "Lamborghini Huracán STO", value: "R$ 6,5 milhões" },
      ],
      totalWealth: "R$ 143 milhões",
    },
    alerts: [
      "CPI das Bets (Senado) - Indiciado por lavagem de dinheiro",
      "Apontado como responsável pelo Jogo do Tigrinho",
      "R$ 110 milhões movimentados na XP em 19 dias",
    ],
    recommendation: {
      action: "avoid",
      title: "Evitar",
      description: "Risco reputacional e legal extremamente alto.",
    },
  },
  {
    name: "Matheus Baldi",
    email: "matheus@2bg.com.br",
    phone: "+55 32 9919-72175",
    tier: "platinum",
    tierLabel: "Platinum",
    company: "Allievo Capital",
    role: "Co-Fundador e Managing Partner",
    discovered: {
      fullName: "Matheus Baldi",
      education: "Harvard Business School",
      linkedIn: "linkedin.com/in/matheus-baldi",
    },
    financials: {
      managedCapital: "R$ 300 milhões",
    },
    portfolio: [
      { company: "Mottu", sector: "Logística" },
      { company: "Cognitivo.ai", sector: "IA" },
      { company: "SouSmile", sector: "Healthtech" },
    ],
    highlights: [
      "Capital Disponível: R$ 300M sob gestão",
      "Formação de Elite: Harvard Business School",
      "Track Record: 30 investimentos, 2 exits",
    ],
    recommendation: {
      action: "priority",
      title: "Prioridade Máxima",
      description: "Lead de altíssimo valor. Abordagem premium recomendada.",
    },
  },
  {
    name: "Mara Silva de Campos",
    email: "mara@imobiliariasantiago.com.br",
    phone: "+55 11 9401-83220",
    location: "-23.61, -46.73",
    tier: "silver",
    tierLabel: "Silver",
    company: "Imobiliária Santiago",
    role: "Corretora / Gestora",
    discovered: {
      fullName: "Mara Silva de Campos",
    },
    recommendation: {
      action: "qualify",
      title: "Qualificar",
      description: "Necessário identificar se interesse é pessoal ou profissional.",
    },
  },
];

const reportService = new ReportService();
const reportData = ReportService.createReportData(leads, {
  title: "Relatório de Análise de Leads",
});

console.log("Generating PDF...");
reportService.generatePdf(reportData).then((buffer) => {
  Bun.write("./reports/test-generated-report.pdf", buffer);
  console.log("PDF generated: ./reports/test-generated-report.pdf (" + buffer.length + " bytes)");
}).catch((err) => {
  console.error("Error:", err);
});
