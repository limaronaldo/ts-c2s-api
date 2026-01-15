/**
 * Script para classificar os últimos 25 leads usando o novo sistema de pontuação
 */

import { getConfig } from "../src/config";
import { detectHighValueLead } from "../src/utils/high-value-detector";

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
  neighborhood?: string;
  cpf?: string;
} {
  const result: { income?: number; neighborhood?: string; cpf?: string } = {};

  // Extract income (Renda: R$ X.XXX,XX or Renda comprovada: R$ X.XXX)
  const incomePatterns = [
    /Renda comprovada[^:]*:\s*R\$\s*([\d.,]+)/i,
    /Renda[^:]*:\s*R\$\s*([\d.,]+)/i,
    /Renda Presumida[^:]*:\s*R\$\s*([\d.,]+)/i,
  ];

  for (const pattern of incomePatterns) {
    const match = description.match(pattern);
    if (match) {
      const incomeStr = match[1].replace(/\./g, "").replace(",", ".");
      result.income = parseFloat(incomeStr);
      break;
    }
  }

  // Extract neighborhood from various formats
  const neighborhoodPatterns = [
    /Bairro[:\s]+([^\n-]+)/i,
    /📍[^\n]*\n[^\n]*\n\s*([^-\n]+)\s*-/,
    /^\s*([A-Za-záàâãéèêíïóôõöúçñ\s]+)\s*-\s*\d+\s*a\s*\d+/im, // "Jardim Europa - 500 a 800"
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

  return result;
}

async function main() {
  console.log("🔍 Buscando últimos 25 leads do C2S...\n");

  const leads = await fetchLeads();
  console.log(`📊 ${leads.length} leads encontrados\n`);

  const results: Array<{
    name: string;
    tier: string;
    score: number;
    reasons: string[];
    income?: number;
    neighborhood?: string;
    wouldAlert: boolean;
  }> = [];

  for (const lead of leads) {
    const name = lead.attributes?.customer?.name || "Desconhecido";
    
    // Combine description with log messages for full context
    let fullDescription = lead.attributes?.description || "";
    if (lead.attributes?.log) {
      for (const log of lead.attributes.log) {
        fullDescription += "\n" + log.body;
      }
    }

    const parsedData = parseDescriptionForData(fullDescription);

    const result = detectHighValueLead({
      leadName: name,
      enrichedName: name,
      income: parsedData.income,
      neighborhood: parsedData.neighborhood,
      addresses: parsedData.neighborhood
        ? [{ neighborhood: parsedData.neighborhood }]
        : undefined,
    });

    results.push({
      name,
      tier: result.tier,
      score: result.score,
      reasons: result.reasons,
      income: parsedData.income,
      neighborhood: parsedData.neighborhood,
      wouldAlert: result.isHighValue,
    });
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // Print results
  console.log("=".repeat(80));
  console.log("📋 CLASSIFICAÇÃO DOS LEADS (Novo Sistema de Pontuação)");
  console.log("=".repeat(80));
  console.log("");

  const tierEmoji: Record<string, string> = {
    platinum: "💎",
    gold: "🥇",
    silver: "🥈",
    none: "⚪",
  };

  const tierCounts = { platinum: 0, gold: 0, silver: 0, none: 0 };

  for (const r of results) {
    tierCounts[r.tier as keyof typeof tierCounts]++;

    const emoji = tierEmoji[r.tier] || "⚪";
    const tierLabel = r.tier.toUpperCase().padEnd(8);
    const scoreStr = `${r.score} pts`.padStart(7);
    const alertFlag = r.wouldAlert ? " 🔔" : "";

    console.log(`${emoji} ${tierLabel} | ${scoreStr} | ${r.name}${alertFlag}`);

    if (r.income) {
      const incomeFormatted = new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(r.income);
      console.log(`   └─ Renda: ${incomeFormatted}/mês`);
    }

    if (r.neighborhood) {
      console.log(`   └─ Bairro: ${r.neighborhood}`);
    }

    if (r.reasons.length > 0) {
      for (const reason of r.reasons) {
        console.log(`   └─ ✓ ${reason}`);
      }
    }

    console.log("");
  }

  // Summary
  console.log("=".repeat(80));
  console.log("📊 RESUMO");
  console.log("=".repeat(80));
  console.log(`💎 Platinum (60+ pts, ALERTA): ${tierCounts.platinum}`);
  console.log(`🥇 Gold (50-59 pts, ALERTA):   ${tierCounts.gold}`);
  console.log(`🥈 Silver (25-49 pts):         ${tierCounts.silver}`);
  console.log(`⚪ None (< 25 pts):            ${tierCounts.none}`);
  console.log("");
  console.log(`🔔 Total de alertas que seriam enviados: ${tierCounts.platinum + tierCounts.gold}`);
}

main().catch(console.error);
