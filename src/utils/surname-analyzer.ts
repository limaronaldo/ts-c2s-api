/**
 * Surname Analyzer - Detecta sobrenomes raros e famílias notáveis
 *
 * Funcionalidades:
 * - Identifica sobrenomes incomuns no Brasil
 * - Detecta famílias notáveis (banqueiros, empresários, etc)
 * - Analisa conexões familiares entre lead e CPF encontrado
 * - Detecta nomes concatenados (ex: "Martarabello" = Marta + Rabello)
 */

export interface SurnameAnalysis {
  surname: string;
  isRare: boolean;
  isNotableFamily: boolean;
  familyContext?: string;
  relatedPeople?: string[];
  confidence: number; // 0-100
}

export interface FamilyConnection {
  type: 'spouse' | 'sibling' | 'parent_child' | 'relative' | 'none';
  sharedSurname?: string;
  confidence: number;
  explanation: string;
}

export interface ConcatenatedName {
  detected: boolean;
  firstName?: string;
  lastName?: string;
  confidence: number;
}

// Sobrenomes raros no Brasil (encontrados na análise de leads)
const RARE_SURNAMES = new Set([
  // Italianos raros
  'passafaro',
  'falabella',
  'trussardi',
  'berlusconi',
  'ferragamo',
  'armani',
  'versace',
  'bulgari',

  // Alemães raros
  'rosenbauer',
  'schwarzenegger',
  'steinhoff',
  'rothschild',

  // Árabes/Libaneses raros
  'azar',
  'khoury',
  'haddad',
  'mansour',
  'sabbagh',

  // Portugueses raros
  'figueiredo',
  'mascarenhas',
  'vasconcellos',

  // Holandeses/Africanos
  'roos',
  'botha',
  'van der berg',

  // Japoneses raros
  'tidi',
  'yamazaki',
  'nakashima',

  // Outros raros
  'rabello',
  'botelho',
  'leal',
]);

// Famílias notáveis do Brasil com contexto
const NOTABLE_FAMILIES: Record<
  string,
  { context: string; relatedPeople: string[]; sector: string }
> = {
  rudge: {
    context: 'Família bancária tradicional de São Paulo',
    relatedPeople: ['José Rudge (ex-VP Itaú)', 'Lala Rudge (influenciadora/herdeira)'],
    sector: 'Bancário/Financeiro',
  },
  safra: {
    context: 'Família bancária, uma das mais ricas do Brasil',
    relatedPeople: ['Joseph Safra', 'Banco Safra'],
    sector: 'Bancário',
  },
  lemann: {
    context: 'Família empresarial, sócios da 3G Capital',
    relatedPeople: ['Jorge Paulo Lemann', 'AB InBev', 'Kraft Heinz'],
    sector: 'Investimentos/Bebidas',
  },
  marinho: {
    context: 'Família proprietária das Organizações Globo',
    relatedPeople: ['Roberto Marinho', 'João Roberto Marinho'],
    sector: 'Mídia/Comunicação',
  },
  setúbal: {
    context: 'Família bancária, fundadores do Itaú',
    relatedPeople: ['Olavo Setúbal', 'Roberto Setúbal'],
    sector: 'Bancário',
  },
  moreira: {
    context: 'Família com tradição no setor bancário',
    relatedPeople: ['Walther Moreira Salles', 'Banco Itaú'],
    sector: 'Bancário',
  },
  ermírio: {
    context: 'Família fundadora do Grupo Votorantim',
    relatedPeople: ['Antônio Ermírio de Moraes', 'Grupo Votorantim'],
    sector: 'Industrial/Mineração',
  },
  diniz: {
    context: 'Família fundadora do Grupo Pão de Açúcar',
    relatedPeople: ['Abilio Diniz', 'Grupo Pão de Açúcar'],
    sector: 'Varejo',
  },
  batista: {
    context: 'Família fundadora da JBS',
    relatedPeople: ['Joesley Batista', 'Wesley Batista', 'JBS'],
    sector: 'Alimentos/Carnes',
  },
  steinbruch: {
    context: 'Família controladora da CSN',
    relatedPeople: ['Benjamin Steinbruch', 'CSN'],
    sector: 'Siderurgia',
  },
  gerdau: {
    context: 'Família fundadora do Grupo Gerdau',
    relatedPeople: ['Jorge Gerdau', 'Grupo Gerdau'],
    sector: 'Siderurgia',
  },
  simonsen: {
    context: 'Família de economistas e empresários',
    relatedPeople: ['Mário Henrique Simonsen'],
    sector: 'Economia/Finanças',
  },
  villela: {
    context: 'Família acionista do Itaú Unibanco',
    relatedPeople: ['Alfredo Egydio Arruda Villela'],
    sector: 'Bancário',
  },
};

// Sobrenomes muito comuns no Brasil (não geram insight)
const COMMON_SURNAMES = new Set([
  'silva',
  'santos',
  'oliveira',
  'souza',
  'sousa',
  'lima',
  'pereira',
  'costa',
  'rodrigues',
  'almeida',
  'nascimento',
  'ferreira',
  'araújo',
  'araujo',
  'carvalho',
  'gomes',
  'martins',
  'rocha',
  'ribeiro',
  'alves',
  'monteiro',
  'mendes',
  'barros',
  'freitas',
  'barbosa',
  'pinto',
  'moura',
  'cavalcanti',
  'dias',
  'castro',
  'campos',
  'cardoso',
  'andrade',
  'vieira',
  'moreira',
  'nunes',
  'lopes',
  'fernandes',
  'ramos',
  'gonçalves',
  'gonzalves',
  'machado',
  'marques',
  'melo',
  'correia',
  'azevedo',
  'teixeira',
  'batista',
]);

/**
 * Extrai todos os sobrenomes de um nome completo
 */
export function extractSurnames(fullName: string): string[] {
  const normalized = fullName.toLowerCase().trim();
  const parts = normalized.split(/\s+/);

  // Remove primeiro nome e preposições
  const prepositions = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  const surnames = parts.slice(1).filter((p) => !prepositions.has(p) && p.length > 2);

  return surnames;
}

/**
 * Analisa um sobrenome específico
 */
export function analyzeSurname(surname: string): SurnameAnalysis {
  const normalized = surname.toLowerCase().trim();

  // Verifica se é família notável
  if (NOTABLE_FAMILIES[normalized]) {
    const family = NOTABLE_FAMILIES[normalized];
    return {
      surname: normalized,
      isRare: true,
      isNotableFamily: true,
      familyContext: family.context,
      relatedPeople: family.relatedPeople,
      confidence: 95,
    };
  }

  // Verifica se é sobrenome raro
  if (RARE_SURNAMES.has(normalized)) {
    return {
      surname: normalized,
      isRare: true,
      isNotableFamily: false,
      confidence: 80,
    };
  }

  // Verifica se é sobrenome comum
  if (COMMON_SURNAMES.has(normalized)) {
    return {
      surname: normalized,
      isRare: false,
      isNotableFamily: false,
      confidence: 100,
    };
  }

  // Sobrenome desconhecido - pode ser raro
  // Heurística: sobrenomes curtos ou muito longos tendem a ser incomuns
  const isLikelyRare = normalized.length > 10 || (normalized.length < 5 && normalized.length > 2);

  return {
    surname: normalized,
    isRare: isLikelyRare,
    isNotableFamily: false,
    confidence: isLikelyRare ? 50 : 30,
  };
}

/**
 * Analisa todos os sobrenomes de um nome completo
 */
export function analyzeFullName(fullName: string): SurnameAnalysis[] {
  const surnames = extractSurnames(fullName);
  return surnames.map(analyzeSurname);
}

/**
 * Detecta conexão familiar entre dois nomes
 */
export function detectFamilyConnection(leadName: string, enrichedName: string): FamilyConnection {
  const leadSurnames = new Set(extractSurnames(leadName));
  const enrichedSurnames = extractSurnames(enrichedName);

  // Encontra sobrenomes em comum
  const sharedSurnames = enrichedSurnames.filter((s) => leadSurnames.has(s));

  if (sharedSurnames.length === 0) {
    return {
      type: 'none',
      confidence: 0,
      explanation: 'Nenhum sobrenome em comum encontrado',
    };
  }

  const sharedSurname = sharedSurnames[0];

  // Extrai primeiro nome para análise
  const leadFirstName = leadName.split(/\s+/)[0].toLowerCase();
  const enrichedFirstName = enrichedName.split(/\s+/)[0].toLowerCase();

  // Heurística para tipo de relação
  // Se mesmo sobrenome e nomes diferentes, provavelmente cônjuge ou parente
  if (leadFirstName !== enrichedFirstName) {
    // Verifica se um é diminutivo do outro
    const isNicknameMatch =
      leadFirstName.startsWith(enrichedFirstName.substring(0, 3)) ||
      enrichedFirstName.startsWith(leadFirstName.substring(0, 3));

    if (isNicknameMatch) {
      return {
        type: 'relative',
        sharedSurname,
        confidence: 70,
        explanation: `Possível variação do mesmo nome com sobrenome ${sharedSurname}`,
      };
    }

    // Alta confiança de ser cônjuge ou familiar direto
    return {
      type: 'spouse',
      sharedSurname,
      confidence: 85,
      explanation: `Provável cônjuge ou familiar - compartilham sobrenome "${sharedSurname}"`,
    };
  }

  return {
    type: 'relative',
    sharedSurname,
    confidence: 60,
    explanation: `Mesmo primeiro nome e sobrenome - possível duplicata ou homônimo`,
  };
}

/**
 * Detecta se um nome está concatenado (ex: "Martarabello" = "Marta Rabello")
 */
export function detectConcatenatedName(name: string): ConcatenatedName {
  const normalized = name.toLowerCase().trim();

  // Se já tem espaço, não está concatenado
  if (normalized.includes(' ')) {
    return { detected: false, confidence: 100 };
  }

  // Tenta encontrar padrões de concatenação
  // Procura por letras maiúsculas no meio (ex: "MartaRabello")
  const camelCaseMatch = name.match(/^([A-Z][a-z]+)([A-Z][a-z]+)$/);
  if (camelCaseMatch) {
    return {
      detected: true,
      firstName: camelCaseMatch[1],
      lastName: camelCaseMatch[2],
      confidence: 95,
    };
  }

  // Procura por sobrenomes conhecidos no final
  for (const surname of [...RARE_SURNAMES, ...COMMON_SURNAMES]) {
    if (normalized.endsWith(surname) && normalized.length > surname.length + 2) {
      const firstName = normalized.substring(0, normalized.length - surname.length);
      // Verifica se o firstName parece um nome válido (3-10 chars)
      if (firstName.length >= 3 && firstName.length <= 10) {
        return {
          detected: true,
          firstName: firstName.charAt(0).toUpperCase() + firstName.slice(1),
          lastName: surname.charAt(0).toUpperCase() + surname.slice(1),
          confidence: 75,
        };
      }
    }
  }

  // Se nome é muito longo sem espaço, pode estar concatenado
  if (normalized.length > 12) {
    return {
      detected: true,
      confidence: 40,
    };
  }

  return { detected: false, confidence: 100 };
}

/**
 * Verifica se é telefone internacional
 */
export function isInternationalPhone(phone: string): { isInternational: boolean; country?: string } {
  const cleaned = phone.replace(/\D/g, '');

  // Mapeamento de códigos de país
  const countryCodes: Record<string, string> = {
    '27': 'África do Sul',
    '1': 'Estados Unidos/Canadá',
    '44': 'Reino Unido',
    '351': 'Portugal',
    '34': 'Espanha',
    '33': 'França',
    '49': 'Alemanha',
    '39': 'Itália',
    '81': 'Japão',
    '86': 'China',
    '971': 'Emirados Árabes',
    '972': 'Israel',
    '41': 'Suíça',
    '43': 'Áustria',
    '598': 'Uruguai',
    '595': 'Paraguai',
    '54': 'Argentina',
    '56': 'Chile',
    '57': 'Colômbia',
    '51': 'Peru',
  };

  // Se começa com 55, é Brasil
  if (cleaned.startsWith('55')) {
    return { isInternational: false };
  }

  // Verifica outros códigos de país
  for (const [code, country] of Object.entries(countryCodes)) {
    if (cleaned.startsWith(code)) {
      return { isInternational: true, country };
    }
  }

  // Se tem mais de 13 dígitos ou menos de 10, pode ser internacional
  if (cleaned.length > 13 || cleaned.length < 10) {
    return { isInternational: true };
  }

  return { isInternational: false };
}

/**
 * Gera score de qualidade baseado em múltiplos fatores
 */
export function calculateLeadScore(analysis: {
  hasRareSurname: boolean;
  isNotableFamily: boolean;
  hasFamilyConnection: boolean;
  isInternational: boolean;
  income?: number;
  propertyCount?: number;
}): { score: number; tier: 'platinum' | 'gold' | 'silver' | 'bronze' } {
  let score = 0;

  // Família notável: +40 pontos
  if (analysis.isNotableFamily) score += 40;

  // Sobrenome raro: +15 pontos
  if (analysis.hasRareSurname) score += 15;

  // Conexão familiar detectada: +20 pontos
  if (analysis.hasFamilyConnection) score += 20;

  // Internacional: +15 pontos
  if (analysis.isInternational) score += 15;

  // Alta renda (>R$10k): +20 pontos
  if (analysis.income && analysis.income > 10000) score += 20;

  // Múltiplas propriedades: +10 pontos por propriedade (max 30)
  if (analysis.propertyCount) {
    score += Math.min(analysis.propertyCount * 10, 30);
  }

  // Determina tier
  let tier: 'platinum' | 'gold' | 'silver' | 'bronze';
  if (score >= 70) tier = 'platinum';
  else if (score >= 50) tier = 'gold';
  else if (score >= 30) tier = 'silver';
  else tier = 'bronze';

  return { score, tier };
}
