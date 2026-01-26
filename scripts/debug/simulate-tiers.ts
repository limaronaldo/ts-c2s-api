/**
 * Simula mensagens de insight para diferentes tiers
 */

import { formatInsightMessage, createWebSearchInsight, createNotableFamilyInsight, type InsightContext, type LeadInsight } from "../src/utils/insight-formatter";

console.log("=" .repeat(80));
console.log("EXEMPLO 1: LEAD SILVER (Ana Maria)");
console.log("=" .repeat(80));
console.log("");

const silverInsights: LeadInsight[] = [];
const silverWeb = createWebSearchInsight(
  "https://br.linkedin.com/in/anamariaagronoma",
  ["Geane Maria dos Santos LTDA"],
  undefined,
  [
    { title: "Processo nº 1234567 - TJSP", link: "" },
    { title: "Registro de imóvel", link: "" }
  ]
);
if (silverWeb) silverInsights.push(silverWeb);

const silverContext: InsightContext = {
  leadName: "Ana Maria",
  income: 2643,
};
console.log(formatInsightMessage(silverInsights, silverContext));

console.log("");
console.log("=" .repeat(80));
console.log("EXEMPLO 2: LEAD GOLD (Empresário com 3 empresas)");
console.log("=" .repeat(80));
console.log("");

const goldInsights: LeadInsight[] = [];
const goldWeb = createWebSearchInsight(
  "https://br.linkedin.com/in/marcelosilva",
  ["Silva Participações LTDA", "MS Investimentos S/A", "Silva & Filhos Comércio"],
  undefined,
  [{ title: "Sócio em 3 empresas ativas", link: "" }]
);
if (goldWeb) goldInsights.push(goldWeb);

const goldContext: InsightContext = {
  leadName: "Marcelo Silva",
  income: 12000,
};
console.log(formatInsightMessage(goldInsights, goldContext));

console.log("");
console.log("=" .repeat(80));
console.log("EXEMPLO 3: LEAD PLATINUM (Família Rudge)");
console.log("=" .repeat(80));
console.log("");

const platinumInsights: LeadInsight[] = [];
platinumInsights.push(createNotableFamilyInsight(
  "Rudge",
  "Família bancária tradicional de São Paulo",
  ["José Rudge (ex-VP Itaú)", "Lala Rudge"]
));
const platinumWeb = createWebSearchInsight(
  "https://br.linkedin.com/in/luciarudge",
  ["Rudge Participações", "Itaú Unibanco"],
  [{ title: "Família Rudge na alta sociedade", source: "Veja SP", link: "" }]
);
if (platinumWeb) platinumInsights.push(platinumWeb);

const platinumContext: InsightContext = {
  leadName: "Lucia Rudge",
  income: 45000,
};
console.log(formatInsightMessage(platinumInsights, platinumContext));
