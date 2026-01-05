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
  'benetton',
  'agnelli',
  'beretta',
  'lavazza',
  'barilla',
  'fendi',
  'gucci',
  'prada',
  'zegna',

  // Alemães raros
  'rosenbauer',
  'schwarzenegger',
  'steinhoff',
  'rothschild',
  'krupp',
  'siemens',
  'bosch',
  'porsche',
  'quandt',
  'würth',
  'henkel',
  'merck',

  // Árabes/Libaneses raros
  'azar',
  'khoury',
  'haddad',
  'mansour',
  'sabbagh',
  'jafet',
  'maluf',
  'kassab',
  'temer',
  'skaf',
  'gebara',
  'mattar',
  'zeitune',
  'bittar',

  // Portugueses raros
  'figueiredo',
  'mascarenhas',
  'vasconcellos',
  'bragança',
  'orleans',

  // Holandeses/Africanos
  'roos',
  'botha',
  'van der berg',
  'de klerk',
  'mandela',

  // Japoneses raros
  'tidi',
  'yamazaki',
  'nakashima',
  'watanabe',
  'takahashi',
  'tanaka',
  'yamamoto',
  'kobayashi',
  'matsumoto',
  'fujimori',

  // Coreanos
  'kim',
  'park',
  'lee',
  'choi',
  'jung',
  'kang',
  'yoon',
  'jang',
  'han',
  'shin',
  'kwon',
  'hwang',

  // Chineses
  'wang',
  'zhang',
  'chen',
  'liu',
  'huang',
  'zhou',
  'wu',
  'xu',
  'sun',
  'ma',
  'zhu',
  'lin',
  'chang',
  'wong',
  'lam',
  'chan',
  'tang',
  'fong',

  // Indianos
  'patel',
  'sharma',
  'singh',
  'kumar',
  'gupta',
  'modi',
  'gandhi',
  'ambani',
  'tata',
  'birla',
  'mittal',
  'bajaj',
  'mahindra',
  'godrej',

  // Judeus/Israelenses
  'cohen',
  'levy',
  'levi',
  'goldberg',
  'rosenberg',
  'steinberg',
  'weinberg',
  'blumenfeld',
  'friedman',
  'klabin',
  'lafer',
  'mindlin',
  'horn',
  'feffer',

  // Espanhóis raros
  'botín',
  'ortega',
  'florentino',

  // Outros raros
  'rabello',
  'botelho',
  'leal',
  'penteado',
  'alvim',
  'arruda',
  'peixoto',
  'buarque',
]);

// Famílias notáveis do Brasil com contexto
const NOTABLE_FAMILIES: Record<
  string,
  { context: string; relatedPeople: string[]; sector: string }
> = {
  // ========== BANCÁRIO/FINANCEIRO ==========
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
  setúbal: {
    context: 'Família bancária, fundadores do Itaú',
    relatedPeople: ['Olavo Setúbal', 'Roberto Setúbal'],
    sector: 'Bancário',
  },
  setubal: {
    context: 'Família bancária, fundadores do Itaú',
    relatedPeople: ['Olavo Setúbal', 'Roberto Setúbal'],
    sector: 'Bancário',
  },
  moreira: {
    context: 'Família com tradição no setor bancário',
    relatedPeople: ['Walther Moreira Salles', 'Banco Itaú'],
    sector: 'Bancário',
  },
  villela: {
    context: 'Família acionista do Itaú Unibanco',
    relatedPeople: ['Alfredo Egydio Arruda Villela'],
    sector: 'Bancário',
  },
  simonsen: {
    context: 'Família de economistas e empresários',
    relatedPeople: ['Mário Henrique Simonsen'],
    sector: 'Economia/Finanças',
  },
  esteves: {
    context: 'Família do BTG Pactual',
    relatedPeople: ['André Esteves', 'BTG Pactual'],
    sector: 'Bancário/Investimentos',
  },

  // ========== INVESTIMENTOS/PRIVATE EQUITY ==========
  lemann: {
    context: 'Família empresarial, sócios da 3G Capital',
    relatedPeople: ['Jorge Paulo Lemann', 'AB InBev', 'Kraft Heinz'],
    sector: 'Investimentos/Bebidas',
  },
  sicupira: {
    context: 'Sócio da 3G Capital',
    relatedPeople: ['Carlos Alberto Sicupira', 'AB InBev'],
    sector: 'Investimentos',
  },
  telles: {
    context: 'Sócio da 3G Capital',
    relatedPeople: ['Marcel Telles', 'AB InBev'],
    sector: 'Investimentos',
  },
  garantia: {
    context: 'Fundadores do Banco Garantia',
    relatedPeople: ['Lemann, Sicupira, Telles'],
    sector: 'Investimentos',
  },

  // ========== MÍDIA/COMUNICAÇÃO ==========
  marinho: {
    context: 'Família proprietária das Organizações Globo',
    relatedPeople: ['Roberto Marinho', 'João Roberto Marinho'],
    sector: 'Mídia/Comunicação',
  },
  civita: {
    context: 'Família fundadora do Grupo Abril',
    relatedPeople: ['Victor Civita', 'Roberto Civita'],
    sector: 'Mídia/Editora',
  },
  frias: {
    context: 'Família controladora do Grupo Folha',
    relatedPeople: ['Octavio Frias de Oliveira', 'Folha de S.Paulo'],
    sector: 'Mídia/Jornalismo',
  },
  mesquita: {
    context: 'Família proprietária do Estadão',
    relatedPeople: ['Julio de Mesquita', 'O Estado de S. Paulo'],
    sector: 'Mídia/Jornalismo',
  },

  // ========== INDUSTRIAL ==========
  ermírio: {
    context: 'Família fundadora do Grupo Votorantim',
    relatedPeople: ['Antônio Ermírio de Moraes', 'Grupo Votorantim'],
    sector: 'Industrial/Mineração',
  },
  votorantim: {
    context: 'Grupo industrial brasileiro',
    relatedPeople: ['Família Ermírio de Moraes'],
    sector: 'Industrial',
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
  camargo: {
    context: 'Família fundadora da Camargo Corrêa',
    relatedPeople: ['Sebastião Camargo', 'Camargo Corrêa'],
    sector: 'Construção/Infraestrutura',
  },
  odebrecht: {
    context: 'Família fundadora da Odebrecht',
    relatedPeople: ['Norberto Odebrecht', 'Marcelo Odebrecht'],
    sector: 'Construção/Infraestrutura',
  },
  andrade: {
    context: 'Família da Andrade Gutierrez',
    relatedPeople: ['Grupo Andrade Gutierrez'],
    sector: 'Construção/Infraestrutura',
  },

  // ========== VAREJO ==========
  diniz: {
    context: 'Família fundadora do Grupo Pão de Açúcar',
    relatedPeople: ['Abilio Diniz', 'Grupo Pão de Açúcar'],
    sector: 'Varejo',
  },
  klein: {
    context: 'Família fundadora das Casas Bahia',
    relatedPeople: ['Samuel Klein', 'Michael Klein', 'Via Varejo'],
    sector: 'Varejo',
  },
  trajano: {
    context: 'Família controladora do Magazine Luiza',
    relatedPeople: ['Luiza Helena Trajano', 'Magazine Luiza'],
    sector: 'Varejo',
  },
  feffer: {
    context: 'Família controladora da Suzano',
    relatedPeople: ['David Feffer', 'Suzano Papel e Celulose'],
    sector: 'Papel e Celulose',
  },

  // ========== ALIMENTOS/AGRO ==========
  batista: {
    context: 'Família fundadora da JBS',
    relatedPeople: ['Joesley Batista', 'Wesley Batista', 'JBS'],
    sector: 'Alimentos/Carnes',
  },
  maggi: {
    context: 'Família do agronegócio',
    relatedPeople: ['Blairo Maggi', 'Grupo Amaggi'],
    sector: 'Agronegócio',
  },
  ometto: {
    context: 'Família do setor sucroalcooleiro',
    relatedPeople: ['Rubens Ometto', 'Cosan', 'Raízen'],
    sector: 'Energia/Açúcar',
  },

  // ========== IMOBILIÁRIO (São Paulo) ==========
  horn: {
    context: 'Família do mercado imobiliário de luxo em SP',
    relatedPeople: ['Adolpho Lindenberg Horn', 'Lindenberg Construtora'],
    sector: 'Imobiliário',
  },
  lindenberg: {
    context: 'Construtora de alto padrão em São Paulo',
    relatedPeople: ['Adolpho Lindenberg', 'Lindenberg Construtora'],
    sector: 'Imobiliário',
  },
  cyrela: {
    context: 'Uma das maiores incorporadoras do Brasil',
    relatedPeople: ['Elie Horn', 'Cyrela Brazil Realty'],
    sector: 'Imobiliário',
  },
  safdie: {
    context: 'Família de incorporadores em SP',
    relatedPeople: ['Alberto Safdie', 'Safdie Construtora'],
    sector: 'Imobiliário',
  },
  trisul: {
    context: 'Incorporadora de São Paulo',
    relatedPeople: ['Jorge Cury', 'Trisul'],
    sector: 'Imobiliário',
  },
  rossi: {
    context: 'Família de incorporadores',
    relatedPeople: ['Rossi Residencial'],
    sector: 'Imobiliário',
  },
  even: {
    context: 'Incorporadora de alto padrão',
    relatedPeople: ['Carlos Terepins', 'Even Construtora'],
    sector: 'Imobiliário',
  },
  eztec: {
    context: 'Incorporadora de São Paulo',
    relatedPeople: ['Ernesto Zarzur', 'EZTEC'],
    sector: 'Imobiliário',
  },
  zarzur: {
    context: 'Família fundadora da EZTEC',
    relatedPeople: ['Ernesto Zarzur', 'EZTEC'],
    sector: 'Imobiliário',
  },
  gafisa: {
    context: 'Incorporadora tradicional',
    relatedPeople: ['Gafisa S.A.'],
    sector: 'Imobiliário',
  },
  tecnisa: {
    context: 'Incorporadora de São Paulo',
    relatedPeople: ['Meyer Nigri', 'Tecnisa'],
    sector: 'Imobiliário',
  },
  nigri: {
    context: 'Família da Tecnisa',
    relatedPeople: ['Meyer Nigri', 'Tecnisa'],
    sector: 'Imobiliário',
  },
  wtorre: {
    context: 'Construtora de grandes empreendimentos',
    relatedPeople: ['Walter Torre Jr', 'WTorre'],
    sector: 'Imobiliário',
  },
  torre: {
    context: 'Construtora de grandes empreendimentos',
    relatedPeople: ['Walter Torre Jr', 'WTorre'],
    sector: 'Imobiliário',
  },
  jhsf: {
    context: 'Incorporadora de alto luxo',
    relatedPeople: ['José Auriemo', 'JHSF', 'Fazenda Boa Vista', 'Shopping Cidade Jardim'],
    sector: 'Imobiliário/Luxo',
  },
  auriemo: {
    context: 'Família fundadora da JHSF',
    relatedPeople: ['José Auriemo Neto', 'JHSF'],
    sector: 'Imobiliário/Luxo',
  },
  yuny: {
    context: 'Incorporadora de São Paulo',
    relatedPeople: ['Yuny Incorporadora'],
    sector: 'Imobiliário',
  },
  stan: {
    context: 'Incorporadora de alto padrão',
    relatedPeople: ['Stan Desenvolvimento Imobiliário'],
    sector: 'Imobiliário',
  },
  tegra: {
    context: 'Incorporadora do Brookfield',
    relatedPeople: ['Tegra Incorporadora'],
    sector: 'Imobiliário',
  },
  kallas: {
    context: 'Incorporadora de São Paulo',
    relatedPeople: ['Kallas Incorporações'],
    sector: 'Imobiliário',
  },
  helbor: {
    context: 'Incorporadora nacional',
    relatedPeople: ['Helbor Empreendimentos'],
    sector: 'Imobiliário',
  },
  ecoville: {
    context: 'Incorporadora de alto padrão',
    relatedPeople: ['Ecoville Urbanismo'],
    sector: 'Imobiliário',
  },

  // ========== AVIAÇÃO/TRANSPORTE ==========
  constantino: {
    context: 'Família fundadora da Gol Linhas Aéreas',
    relatedPeople: ['Constantino de Oliveira Jr', 'Gol'],
    sector: 'Aviação',
  },
  amaro: {
    context: 'Família fundadora da TAM',
    relatedPeople: ['Rolim Amaro', 'TAM Linhas Aéreas'],
    sector: 'Aviação',
  },

  // ========== TECNOLOGIA ==========
  vélez: {
    context: 'Fundador do Nubank',
    relatedPeople: ['David Vélez', 'Nubank'],
    sector: 'Fintech',
  },
  velez: {
    context: 'Fundador do Nubank',
    relatedPeople: ['David Vélez', 'Nubank'],
    sector: 'Fintech',
  },
  krieger: {
    context: 'Fundador do PagSeguro',
    relatedPeople: ['Luiz Frias', 'PagSeguro'],
    sector: 'Fintech',
  },

  // ========== SAÚDE ==========
  bueno: {
    context: 'Família fundadora da Amil',
    relatedPeople: ['Edson Bueno', 'Amil', 'Dasa'],
    sector: 'Saúde',
  },
  moll: {
    context: 'Família fundadora da Rede D\'Or',
    relatedPeople: ['Jorge Moll', 'Rede D\'Or São Luiz'],
    sector: 'Saúde',
  },

  // ========== BEBIDAS ==========
  schincariol: {
    context: 'Família fundadora da Schincariol',
    relatedPeople: ['Adriano Schincariol', 'Cervejaria Schincariol'],
    sector: 'Bebidas',
  },
  johannpeter: {
    context: 'Família controladora da Gerdau',
    relatedPeople: ['Jorge Gerdau Johannpeter'],
    sector: 'Siderurgia',
  },

  // ========== LIBANESES EMPRESÁRIOS ==========
  jafet: {
    context: 'Família tradicional de empresários libaneses',
    relatedPeople: ['Nami Jafet', 'Basílio Jafet'],
    sector: 'Diversificado',
  },
  klabin: {
    context: 'Família da indústria de papel',
    relatedPeople: ['Klabin S.A.'],
    sector: 'Papel e Celulose',
  },
  lafer: {
    context: 'Família de industriais e políticos',
    relatedPeople: ['Celso Lafer', 'Horacio Lafer'],
    sector: 'Industrial/Político',
  },
  mindlin: {
    context: 'Família de empresários e colecionadores',
    relatedPeople: ['José Mindlin', 'Brasilpar'],
    sector: 'Finanças/Cultura',
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
