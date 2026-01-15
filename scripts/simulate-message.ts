/**
 * Simula a mensagem que um lead receberia com todas as mudanças
 */

import { detectFamilyConnection } from "../src/utils/surname-analyzer";
import { formatInsightMessage, createFamilyConnectionInsight, createWebSearchInsight, type InsightContext, type LeadInsight } from "../src/utils/insight-formatter";

// Dados do lead Ana Maria Pereira Ribeiro (do screenshot)
const leadName = "Ana Maria Pereira Ribeiro";
const enrichedName = "ANA MARIA PEREIRA RIBEIRO";
const income = 2643;
const addresses = [
  { neighborhood: "Centro", city: "Santos", state: "SP" }
];

console.log("=" .repeat(80));
console.log("SIMULAÇÃO DE MENSAGEM - Ana Maria Pereira Ribeiro");
console.log("=" .repeat(80));
console.log("");

// 1. Verificar detecção de família
console.log("1️⃣  DETECÇÃO DE CONEXÃO FAMILIAR:");
console.log("-".repeat(40));
const familyConnection = detectFamilyConnection(leadName, enrichedName);
console.log(`   Lead: ${leadName}`);
console.log(`   CPF encontrado: ${enrichedName}`);
console.log(`   Tipo: ${familyConnection.type}`);
console.log(`   Explicação: ${familyConnection.explanation}`);
console.log("");

// 2. Gerar insights (se houver)
console.log("2️⃣  INSIGHTS GERADOS:");
console.log("-".repeat(40));

const insights: LeadInsight[] = [];

// Só adiciona insight de família se NÃO for a mesma pessoa
if (familyConnection.type !== "none" && familyConnection.sharedSurname) {
  const familyInsight = createFamilyConnectionInsight(
    leadName,
    enrichedName,
    familyConnection.type === "spouse" ? "Cônjuge" : "Familiar",
    familyConnection.sharedSurname
  );
  insights.push(familyInsight);
  console.log("   ✅ Insight de família adicionado");
} else {
  console.log("   ❌ Sem insight de família (mesma pessoa)");
}

// Simular pesquisa web (do screenshot tinha LinkedIn e empresas)
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
  console.log("   ✅ Insight de pesquisa web adicionado");
}

console.log("");

// 3. Formatar mensagem final
console.log("3️⃣  MENSAGEM FINAL QUE SERIA ENVIADA:");
console.log("-".repeat(40));

if (insights.length > 0) {
  const context: InsightContext = {
    leadName,
    enrichedName,
    income,
    addresses,
    tier: "bronze"
  };

  const message = formatInsightMessage(insights, context);
  console.log("");
  console.log(message);
} else {
  console.log("   (Nenhum insight significativo - mensagem não seria enviada)");
}

console.log("");
console.log("=" .repeat(80));
console.log("COMPARAÇÃO: ANTES vs DEPOIS");
console.log("=" .repeat(80));
console.log("");

console.log("❌ ANTES (mensagem antiga do screenshot):");
console.log("-".repeat(40));
console.log(`
🔍 INSIGHT AUTOMÁTICO

📊 Perfil Descoberto:
👨‍👩‍👧‍👦 Conexão Familiar Detectada
   • Lead: Ana Maria Pereira Ribeiro
   • CPF encontrado: ANA MARIA PEREIRA RIBEIRO
   • Relação: Familiar
   • Sobrenome em comum: maria

🏢 Pesquisa Web
   • LinkedIn: https://br.linkedin.com/in/anamariaagronoma
   • Empresas mencionadas: Geane Maria dos
   • 📋 2 registro(s) público(s) encontrado(s)
   📎 Fonte: Google Search

💰 Indicadores:
   • Renda: R$ 2.643/mês
   • Endereços: 1 encontrados

🎯 Recomendação:
   Nome diferente do lead pode indicar cônjuge ou familiar.
   Confirmar na abordagem.

⚡ Confiança: 80%
`);

console.log("");
console.log("✅ DEPOIS (nova mensagem):");
console.log("-".repeat(40));
if (insights.length > 0) {
  const context: InsightContext = {
    leadName,
    enrichedName,
    income,
    addresses,
    tier: "bronze"
  };
  const message = formatInsightMessage(insights, context);
  console.log("");
  console.log(message);
} else {
  console.log("   (Sem mensagem de insight - só receberia a mensagem de enrichment)");
}

console.log("");
console.log("=" .repeat(80));
console.log("MUDANÇAS APLICADAS:");
console.log("=" .repeat(80));
console.log(`
✅ Removido: "INSIGHT AUTOMÁTICO" (título)
✅ Removido: "Conexão Familiar" (mesma pessoa não é família)
✅ Removido: "Fonte: Google Search"
✅ Removido: "Confiança: 80%"
✅ Removido: "Endereços: 1 encontrados" → Mostra endereço real
✅ Removido: "2 registro(s) público(s)" → Mostra registros reais
✅ Empresas mostradas individualmente com 🏢
`);
