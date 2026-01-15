/**
 * Script para análise completa dos últimos 25 leads
 * Usa o novo sistema de pontuação e detecção de high-value
 */

import { getConfig } from "../src/config";
import { detectHighValueLead } from "../src/utils/high-value-detector";
import { analyzeSurname, extractSurnames } from "../src/utils/surname-analyzer";
import { isNobleNeighborhood } from "../src/utils/neighborhoods";

const config = getConfig();

interface C2SLead {
  id: string;
  attributes: {
    description?: string;
    customer: {
      name: string;
      email?: string;
      phone?: string;
    };
    log?: Array<{ body: string; created_at: string }>;
    created_at?: string;
  };
}

async function fetchLeads(): Promise<C2SLead[]> {
  const response = await fetch(`${config.C2S_URL}/integration/leads?limit=25`, {
    headers: {
      Authorization: `Bearer ${config.C2S_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch leads: ${response.status}`);
  }

  const data = await response.json();
  return data.data || [];
}

function parseDescriptionForData(description: string): {
  income?: number;
  presumedIncome?: number;
  neighborhood?: string;
  cpf?: string;
  enrichedName?: string;
} {
  const result: {
    income?: number;
    presumedIncome?: number;
    neighborhood?: string;
    cpf?: string;
    enrichedName?: string;
  } = {};

  // Extract income (multiple patterns)
  const incomePatterns = [
    /Renda comprovada[^:]*:\s*R\$\s*([\d.,]+)/i,
    /Renda[^:]*:\s*R\$\s*([\d.,]+)/i,
  ];

  for (const pattern of incomePatterns) {
    const match = description.match(pattern);
    if (match) {
      const incomeStr = match[1].replace(/\./g, "").replace(",", ".");
      result.income = parseFloat(incomeStr);
      break;
    }
  }

  // Extract presumed income
  const presumedMatch = description.match(/Renda Presumida[^:]*:\s*R\$\s*([\d.,]+)/i);
  if (presumedMatch) {
    const incomeStr = presumedMatch[1].replace(/\./g, "").replace(",", ".");
    result.presumedIncome = parseFloat(incomeStr);
  }

  // Extract neighborhood
  const neighborhoodPatterns = [
    /Bairro[:\s]+([^\n-]+)/i,
    /📍[^\n]*\n[^\n]*\n\s*([^-\n]+)\s*-/,
    /^\s*([A-Za-záàâãéèêíïóôõöúçñ\s]+)\s*-\s*\d+\s*a\s*\d+/im,
  ];

  for (const pattern of neighborhoodPatterns) {
    const match = description.match(pattern);
    if (match) {
      result.neighborhood = match[1].trim();
      break;
    }
  }

  // Extract CPF
  const cpfMatch = description.match(/CPF[:\s]+(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i);
  if (cpfMatch) {
    result.cpf = cpfMatch[1];
  }

  // Extract enriched name (Nome: XXX)
  const nameMatch = description.match(/Nome[:\s]+([A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s]+)/i);
  if (nameMatch) {
    result.enrichedName = nameMatch[1].trim();
  }

  return result;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

async function main() {
  console.log("🔍 Buscando últimos 25 leads do C2S...\n");

  const leads = await fetchLeads();
  console.log(`📊 ${leads.length} leads encontrados\n`);

  console.log("=".repeat(100));
  console.log("📋 ANÁLISE COMPLETA DOS LEADS (Sistema Atualizado - 15/01/2026)");
  console.log("=".repeat(100));
  console.log("");

  const tierEmoji: Record<string, string> = {
    platinum: "💎",
    gold: "🥇",
    silver: "🥈",
    none: "⚪",
  };

  const tierCounts = { platinum: 0, gold: 0, silver: 0, none: 0 };
  const alertLeads: string[] = [];

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const name = lead.attributes?.customer?.name || "Desconhecido";
    const email = lead.attributes?.customer?.email;
    const phone = lead.attributes?.customer?.phone;

    // Combine description with log messages
    let fullDescription = lead.attributes?.description || "";
    if (lead.attributes?.log) {
      for (const log of lead.attributes.log) {
        fullDescription += "\n" + log.body;
      }
    }

    const parsedData = parseDescriptionForData(fullDescription);

    // Analyze surnames
    const nameToAnalyze = parsedData.enrichedName || name;
    const surnames = extractSurnames(nameToAnalyze);
    const surnameAnalyses = surnames.map(analyzeSurname);

    // Check for notable family
    const notableFamily = surnameAnalyses.find(s => s.isNotableFamily);
    const rareSurname = surnameAnalyses.find(s => s.isRare && !s.isNotableFamily);

    // Check neighborhood
    const isNoble = parsedData.neighborhood ? isNobleNeighborhood(parsedData.neighborhood) : false;

    // High-value detection
    const hvResult = detectHighValueLead({
      leadName: name,
      enrichedName: parsedData.enrichedName,
      income: parsedData.income,
      presumedIncome: parsedData.presumedIncome,
      neighborhood: parsedData.neighborhood,
      addresses: parsedData.neighborhood ? [{ neighborhood: parsedData.neighborhood }] : undefined,
    });

    tierCounts[hvResult.tier as keyof typeof tierCounts]++;
    if (hvResult.isHighValue) {
      alertLeads.push(name);
    }

    // Print lead info
    console.log(`${"─".repeat(100)}`);
    console.log(`${tierEmoji[hvResult.tier]} #${i + 1} | ${hvResult.tier.toUpperCase()} | Score: ${hvResult.score} pts ${hvResult.isHighValue ? "🔔 ALERTA" : ""}`);
    console.log(`${"─".repeat(100)}`);
    console.log(`   Nome do Lead:     ${name}`);

    if (parsedData.enrichedName && parsedData.enrichedName !== name) {
      console.log(`   Nome Enriquecido: ${parsedData.enrichedName} (CPF de outra pessoa)`);
    }

    if (parsedData.cpf) {
      console.log(`   CPF:              ${parsedData.cpf}`);
    }

    if (email) {
      console.log(`   Email:            ${email}`);
    }

    if (phone) {
      console.log(`   Telefone:         ${phone}`);
    }

    console.log("");

    // Financial info
    if (parsedData.income || parsedData.presumedIncome) {
      console.log(`   💰 FINANCEIRO:`);
      if (parsedData.income) {
        const incomeLevel = parsedData.income >= 20000 ? "(MUITO ALTA)" :
                           parsedData.income >= 15000 ? "(ALTA)" :
                           parsedData.income >= 10000 ? "(MODERADA)" : "(BAIXA)";
        console.log(`      Renda: ${formatCurrency(parsedData.income)}/mês ${incomeLevel}`);
      }
      if (parsedData.presumedIncome) {
        console.log(`      Renda Presumida: ${formatCurrency(parsedData.presumedIncome)}/mês`);
      }
      console.log("");
    }

    // Location info
    if (parsedData.neighborhood) {
      console.log(`   📍 LOCALIZAÇÃO:`);
      console.log(`      Bairro: ${parsedData.neighborhood} ${isNoble ? "✓ NOBRE" : ""}`);
      console.log("");
    }

    // Surname analysis
    if (surnameAnalyses.length > 0) {
      console.log(`   👤 ANÁLISE DE SOBRENOMES:`);
      for (const analysis of surnameAnalyses) {
        const status = analysis.isNotableFamily ? "🏆 FAMÍLIA NOTÁVEL" :
                      analysis.isRare ? "⭐ RARO" : "comum";
        console.log(`      ${analysis.surname}: ${status}${analysis.familyContext ? ` - ${analysis.familyContext}` : ""}`);
      }
      console.log("");
    }

    // High-value reasons
    if (hvResult.reasons.length > 0) {
      console.log(`   ✓ CRITÉRIOS ATENDIDOS:`);
      for (const reason of hvResult.reasons) {
        console.log(`      • ${reason}`);
      }
      console.log("");
    }

    // Why NOT high-value
    if (!hvResult.isHighValue && hvResult.score > 0) {
      console.log(`   ✗ POR QUE NÃO É HIGH-VALUE:`);
      console.log(`      Score ${hvResult.score} pts < 50 pts (threshold)`);
      if (hvResult.score < 50) {
        const needed = 50 - hvResult.score;
        console.log(`      Precisa de mais ${needed} pts para disparar alerta`);
      }
      console.log("");
    }
  }

  // Summary
  console.log("");
  console.log("=".repeat(100));
  console.log("📊 RESUMO FINAL");
  console.log("=".repeat(100));
  console.log("");
  console.log(`   💎 Platinum (60+ pts):  ${tierCounts.platinum} leads`);
  console.log(`   🥇 Gold (50-59 pts):    ${tierCounts.gold} leads`);
  console.log(`   🥈 Silver (25-49 pts):  ${tierCounts.silver} leads`);
  console.log(`   ⚪ None (< 25 pts):     ${tierCounts.none} leads`);
  console.log("");
  console.log(`   🔔 Alertas que seriam enviados: ${tierCounts.platinum + tierCounts.gold}`);

  if (alertLeads.length > 0) {
    console.log("");
    console.log(`   Leads com alerta:`);
    for (const lead of alertLeads) {
      console.log(`      • ${lead}`);
    }
  }

  console.log("");
  console.log("=".repeat(100));
  console.log("📝 CRITÉRIOS DE PONTUAÇÃO (Atualizado 15/01/2026)");
  console.log("=".repeat(100));
  console.log("");
  console.log("   | Critério                    | Pontos | Resultado                    |");
  console.log("   |-----------------------------|--------|------------------------------|");
  console.log("   | Renda >= R$20k/mês          | 50 pts | 🔔 Alerta sozinho            |");
  console.log("   | Renda >= R$15k/mês          | 36 pts | Precisa de +14 pts           |");
  console.log("   | Renda >= R$10k/mês          | 10 pts | Fator de apoio               |");
  console.log("   | Família notável (Safra,etc) | 50 pts | 🔔 Alerta sozinho            |");
  console.log("   | Bairro nobre                | 15 pts | Fator de apoio               |");
  console.log("   | 3+ empresas                 | 20 pts | Fator de apoio               |");
  console.log("   | Sobrenome raro              | 10 pts | Fator de apoio               |");
  console.log("");
  console.log("   Sobrenomes REMOVIDOS de família notável (muito comuns):");
  console.log("   Camargo, Andrade, Batista, Diniz, Moreira, Bueno, Klein, Trajano, etc.");
  console.log("");
}

main().catch(console.error);
