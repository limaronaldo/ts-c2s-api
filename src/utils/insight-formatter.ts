/**
 * Insight Formatter - Formata insights para mensagens C2S
 *
 * Gera mensagens formatadas com emojis e estrutura clara
 * para vendedores identificarem leads prioritários.
 */

export interface LeadInsight {
  type:
    | "business_owner"
    | "family_connection"
    | "high_income"
    | "rare_surname"
    | "international"
    | "notable_family"
    | "multiple_properties"
    | "concatenated_name";
  confidence: number; // 0-100
  title: string;
  details: string[];
  sources?: string[];
  recommendation?: string;
}

export interface InsightContext {
  leadName: string;
  enrichedName?: string;
  income?: number;
  propertyCount?: number;
  addresses?: Array<{
    street?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
  }>;
  phone?: string;
  tier?: "platinum" | "gold" | "silver" | "bronze";
}

/**
 * Emoji por tipo de insight
 */
const INSIGHT_EMOJIS: Record<LeadInsight["type"], string> = {
  business_owner: "🏢",
  family_connection: "👨‍👩‍👧‍👦",
  high_income: "💰",
  rare_surname: "🔍",
  international: "🌍",
  notable_family: "👑",
  multiple_properties: "🏠",
  concatenated_name: "📝",
};

/**
 * Emoji por tier
 */
const TIER_EMOJIS: Record<string, string> = {
  platinum: "💎",
  gold: "🥇",
  silver: "🥈",
  bronze: "🥉",
};

/**
 * Formata valor monetário em Real brasileiro
 */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Formata um único insight
 */
function formatSingleInsight(insight: LeadInsight): string {
  const emoji = INSIGHT_EMOJIS[insight.type] || "📌";
  const lines: string[] = [];

  lines.push(`${emoji} ${insight.title}`);

  for (const detail of insight.details) {
    lines.push(`   • ${detail}`);
  }

  // Não mostra mais "Fonte: Google Search" - removido por request

  return lines.join("\n");
}

/**
 * Formata múltiplos insights em mensagem C2S
 */
export function formatInsightMessage(
  insights: LeadInsight[],
  context: InsightContext,
): string {
  if (insights.length === 0) {
    return "";
  }

  const lines: string[] = [];

  // Insights agrupados (sem header/título)
  for (const insight of insights) {
    lines.push(formatSingleInsight(insight));
    lines.push("");
  }

  // Indicadores removidos - renda/endereço já aparecem na mensagem de enrichment
  // Apenas mostra imóveis se houver múltiplos (informação extra)
  if (context.propertyCount && context.propertyCount > 1) {
    lines.push(`🏠 ${context.propertyCount} imóveis registrados`);
    lines.push("");
  }

  // Classificação do lead baseada nos insights encontrados
  const tierInfo = calculateInsightTier(insights, context);
  if (tierInfo.tier !== "none") {
    lines.push(tierInfo.label);
    if (tierInfo.reason) {
      lines.push(`   ${tierInfo.reason}`);
    }
    lines.push("");
  }

  // Observação sobre análise experimental
  lines.push(
    "*Análise Experimental realizada por IA, confira antes de prosseguir o atendimento.",
  );

  return lines.join("\n");
}

/**
 * Calcula o tier do lead baseado nos insights encontrados
 */
function calculateInsightTier(
  insights: LeadInsight[],
  context: InsightContext,
): { tier: string; label: string; reason?: string } {
  const hasLinkedIn = insights.some((i) =>
    i.details.some((d) => d.toLowerCase().includes("linkedin")),
  );
  const hasCompanies = insights.some((i) =>
    i.details.some((d) => d.includes("🏢")),
  );
  const companyCount = insights.reduce(
    (count, i) => count + i.details.filter((d) => d.includes("🏢")).length,
    0,
  );
  const hasLegalRecords = insights.some((i) =>
    i.details.some((d) => d.includes("📋")),
  );
  const isNotableFamily = insights.some((i) => i.type === "notable_family");
  const isHighIncome = (context.income || 0) >= 15000;
  const isVeryHighIncome = (context.income || 0) >= 20000;

  // PLATINUM: Família notável OU renda muito alta + empresas
  if (isNotableFamily || (isVeryHighIncome && companyCount >= 2)) {
    return {
      tier: "platinum",
      label: "⭐⭐⭐ LEAD PLATINUM",
      reason: isNotableFamily
        ? "Família de alto perfil"
        : `Renda alta + ${companyCount} empresas`,
    };
  }

  // GOLD: Renda alta OU múltiplas empresas
  if (isHighIncome || companyCount >= 2) {
    return {
      tier: "gold",
      label: "⭐⭐ LEAD GOLD",
      reason:
        companyCount >= 2
          ? `Empresário com ${companyCount} empresas`
          : "Renda elevada",
    };
  }

  // SILVER: LinkedIn OU 1 empresa OU registros públicos
  if (hasLinkedIn || hasCompanies || hasLegalRecords) {
    return {
      tier: "silver",
      label: "⭐ LEAD SILVER",
      reason: hasLinkedIn
        ? "Perfil profissional encontrado"
        : hasCompanies
          ? "Empresa vinculada"
          : "Registros públicos encontrados",
    };
  }

  // Sem classificação especial
  return { tier: "none", label: "" };
}

/**
 * Cria insight de empresário/dono de negócio
 */
export function createBusinessOwnerInsight(
  name: string,
  companies: Array<{ name: string; role?: string; capital?: number }>,
): LeadInsight {
  const details = companies.map((c) => {
    let line = c.name;
    if (c.role) line += ` (${c.role})`;
    if (c.capital) line += ` - Capital: ${formatCurrency(c.capital)}`;
    return line;
  });

  const totalCapital = companies.reduce((sum, c) => sum + (c.capital || 0), 0);

  return {
    type: "business_owner",
    confidence: 90,
    title: `Empresário - ${companies.length} empresa(s)`,
    details,
    recommendation:
      totalCapital > 500000
        ? "Alto poder aquisitivo confirmado. Priorizar atendimento."
        : "Perfil empresarial. Verificar capacidade de investimento.",
  };
}

/**
 * Cria insight de conexão familiar
 */
export function createFamilyConnectionInsight(
  leadName: string,
  enrichedName: string,
  relationship: string,
  sharedSurname: string,
): LeadInsight {
  return {
    type: "family_connection",
    confidence: 85,
    title: "Conexão Familiar Detectada",
    details: [
      `Lead: ${leadName}`,
      `CPF encontrado: ${enrichedName}`,
      `Relação: ${relationship}`,
      `Sobrenome em comum: ${sharedSurname}`,
    ],
    recommendation:
      "Nome diferente do lead pode indicar cônjuge ou familiar. Confirmar na abordagem.",
  };
}

/**
 * Cria insight de alta renda
 */
export function createHighIncomeInsight(
  income: number,
  presumedIncome?: number,
): LeadInsight {
  const details = [`Renda comprovada: ${formatCurrency(income)}/mês`];

  if (presumedIncome && presumedIncome > income) {
    details.push(`Renda presumida: ${formatCurrency(presumedIncome)}/mês`);
  }

  let tier = "";
  if (income >= 50000) tier = "Ultra-alto padrão";
  else if (income >= 20000) tier = "Alto padrão";
  else if (income >= 10000) tier = "Médio-alto padrão";

  if (tier) {
    details.push(`Perfil: ${tier}`);
  }

  return {
    type: "high_income",
    confidence: 95,
    title: "Alta Renda Comprovada",
    details,
    recommendation:
      income >= 20000 ? "Lead prioritário. Atendimento VIP." : undefined,
  };
}

/**
 * Cria insight de sobrenome raro
 */
export function createRareSurnameInsight(
  surname: string,
  context?: string,
): LeadInsight {
  const details = [`Sobrenome "${surname}" é incomum no Brasil`];

  if (context) {
    details.push(context);
  }

  return {
    type: "rare_surname",
    confidence: 70,
    title: "Sobrenome Incomum",
    details,
    recommendation:
      "Sobrenome raro pode indicar família tradicional ou estrangeira. Pesquisar mais.",
  };
}

/**
 * Cria insight de família notável
 */
export function createNotableFamilyInsight(
  surname: string,
  familyContext: string,
  relatedPeople: string[],
): LeadInsight {
  return {
    type: "notable_family",
    confidence: 95,
    title: `Família ${surname.charAt(0).toUpperCase() + surname.slice(1)}`,
    details: [familyContext, `Membros conhecidos: ${relatedPeople.join(", ")}`],
    recommendation:
      "LEAD PRIORITÁRIO! Família de alto perfil. Atendimento especial.",
  };
}

/**
 * Cria insight de lead internacional
 */
export function createInternationalInsight(
  country: string,
  phone: string,
): LeadInsight {
  return {
    type: "international",
    confidence: 90,
    title: `Lead Internacional - ${country}`,
    details: [`Telefone: ${phone}`, `País de origem: ${country}`],
    recommendation:
      "Lead internacional. Pode ter interesse em investimento no Brasil. Atendimento diferenciado.",
  };
}

/**
 * Cria insight de múltiplas propriedades
 */
export function createMultiplePropertiesInsight(
  count: number,
  locations?: string[],
): LeadInsight {
  const details = [`${count} imóveis registrados no CPF`];

  if (locations && locations.length > 0) {
    details.push(
      `Localizações: ${locations.slice(0, 3).join(", ")}${locations.length > 3 ? "..." : ""}`,
    );
  }

  return {
    type: "multiple_properties",
    confidence: 95,
    title: "Múltiplos Imóveis",
    details,
    recommendation:
      count >= 5
        ? "Investidor imobiliário. Alto potencial de compra."
        : "Possui outros imóveis. Verificar interesse em expansão.",
  };
}

/**
 * Cria insight de nome concatenado
 */
export function createConcatenatedNameInsight(
  originalName: string,
  firstName: string,
  lastName: string,
): LeadInsight {
  return {
    type: "concatenated_name",
    confidence: 75,
    title: "Nome Possivelmente Concatenado",
    details: [
      `Nome recebido: ${originalName}`,
      `Interpretação: ${firstName} ${lastName}`,
      "Nome pode ter sido digitado sem espaço no formulário",
    ],
    recommendation: "Verificar nome correto na abordagem.",
  };
}

/**
 * Gera header resumido para mensagens curtas
 */
export function formatShortInsightHeader(context: InsightContext): string {
  const tierEmoji = context.tier ? TIER_EMOJIS[context.tier] : "";
  const parts: string[] = [];

  if (tierEmoji) {
    parts.push(tierEmoji);
  }

  if (context.tier === "platinum") {
    parts.push("LEAD PLATINUM");
  } else if (context.tier === "gold") {
    parts.push("LEAD OURO");
  }

  if (context.income && context.income >= 20000) {
    parts.push(`Renda: ${formatCurrency(context.income)}`);
  }

  return parts.join(" | ");
}

/**
 * Cria insight de pesquisa web (Google Search)
 */
export function createWebSearchInsight(
  linkedinProfile?: string,
  companies?: string[],
  newsArticles?: Array<{ title: string; source: string; link: string }>,
  legalMentions?: Array<{ title: string; link: string }>,
  summary?: string,
): LeadInsight | null {
  const details: string[] = [];

  if (linkedinProfile) {
    details.push(`LinkedIn: ${linkedinProfile}`);
  }

  if (companies && companies.length > 0) {
    // Mostra cada empresa em linha separada para melhor legibilidade
    for (const company of companies.slice(0, 3)) {
      details.push(`🏢 ${company}`);
    }
    if (companies.length > 3) {
      details.push(`   +${companies.length - 3} outras empresas`);
    }
  }

  if (newsArticles && newsArticles.length > 0) {
    for (const article of newsArticles.slice(0, 2)) {
      details.push(
        `📰 ${article.source}: ${article.title.substring(0, 60)}...`,
      );
    }
  }

  if (legalMentions && legalMentions.length > 0) {
    // Mostra cada registro público individualmente
    for (const mention of legalMentions.slice(0, 3)) {
      details.push(`📋 ${mention.title}`);
    }
    if (legalMentions.length > 3) {
      details.push(`   +${legalMentions.length - 3} outros registros`);
    }
  }

  if (details.length === 0) {
    return null;
  }

  return {
    type: "business_owner", // Reusa o tipo, mas com contexto diferente
    confidence: 75,
    title: "Pesquisa Web",
    details,
    recommendation: summary, // Só mostra se tiver algo específico
  };
}
