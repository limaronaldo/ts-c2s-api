/**
 * Simula AMBAS as mensagens que um lead receberia
 */

import { buildDescription } from "../src/utils/description-builder";
import { formatInsightMessage, createWebSearchInsight, createFamilyConnectionInsight, type InsightContext, type LeadInsight } from "../src/utils/insight-formatter";
import { detectFamilyConnection } from "../src/utils/surname-analyzer";

// Dados do lead Ana Maria Pereira Ribeiro
const leadName = "Ana Maria Pereira Ribeiro";
const enrichedName = "ANA MARIA PEREIRA RIBEIRO";

// Dados simulados do Work API
const personData = {
  cpf: "248.845.388.97",
  nome: "ANA MARIA PEREIRA RIBEIRO",
  dataNascimento: "15/03/1975",
  sexo: "F",
  nomeMae: "MARIA DAS GRACAS PEREIRA",
  renda: 1391,
  rendaPresumida: 2100,
  emails: [{ email: "ana.legiao@gmail.com" }],
  telefones: [
    { numero: "13996940059", tipo: "celular" }
  ],
  enderecos: [
    {
      logradouro: "Rua das Flores",
      numero: "123",
      complemento: "Apto 45",
      bairro: "Centro",
      cidade: "Santos",
      uf: "SP",
      cep: "11010-100"
    }
  ]
};

const campaignName = "Google Ads - Apartamentos SP";

console.log("=" .repeat(80));
console.log("MENSAGEM 1: ENRICHMENT");
console.log("=" .repeat(80));
console.log("");

const enrichmentMessage = buildDescription(personData, campaignName);
console.log(enrichmentMessage);

console.log("");
console.log("=" .repeat(80));
console.log("MENSAGEM 2: INSIGHT (se houver dados relevantes)");
console.log("=" .repeat(80));
console.log("");

// Verificar conexão familiar
const familyConnection = detectFamilyConnection(leadName, enrichedName);
const insights: LeadInsight[] = [];

// Só adiciona insight de família se NÃO for a mesma pessoa
if (familyConnection.type !== "none" && familyConnection.sharedSurname) {
  insights.push(createFamilyConnectionInsight(
    leadName,
    enrichedName,
    familyConnection.type === "spouse" ? "Cônjuge" : "Familiar",
    familyConnection.sharedSurname
  ));
}

// Simular pesquisa web
const webInsight = createWebSearchInsight(
  "https://br.linkedin.com/in/anamariaagronoma",
  ["Geane Maria dos Santos LTDA"],
  undefined,
  [
    { title: "Processo nº 1234567-00.2020 - TJSP", link: "https://..." },
    { title: "Registro de imóvel - Cartório 3º", link: "https://..." }
  ]
);

if (webInsight) {
  insights.push(webInsight);
}

if (insights.length > 0) {
  const context: InsightContext = {
    leadName,
    enrichedName,
    income: personData.renda * 1.9, // com multiplicador
    addresses: personData.enderecos.map(e => ({
      neighborhood: e.bairro,
      city: e.cidade,
      state: e.uf
    })),
    tier: "bronze"
  };

  const insightMessage = formatInsightMessage(insights, context);
  console.log(insightMessage);
} else {
  console.log("(Nenhum insight relevante encontrado)");
}
