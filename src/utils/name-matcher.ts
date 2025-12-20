/**
 * Smart Name Matching Utility
 *
 * Implements fuzzy name matching with:
 * - Levenshtein distance calculation
 * - Name normalization (uppercase, remove accents, expand abbreviations)
 * - Configurable similarity threshold
 *
 * Linear Issue: RML-595
 */

/**
 * Remove accents and diacritics from a string
 */
function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Expand common Brazilian name abbreviations
 */
function expandAbbreviations(name: string): string {
  const abbreviations: Record<string, string> = {
    "MA.": "MARIA",
    "M.": "MARIA",
    "JO.": "JOSE",
    "J.": "JOSE",
    "ANT.": "ANTONIO",
    "A.": "ANTONIO",
    "FCO.": "FRANCISCO",
    "F.": "FRANCISCO",
    "DR.": "DOUTOR",
    "DRA.": "DOUTORA",
    "SR.": "SENHOR",
    "SRA.": "SENHORA",
    "PE.": "PADRE",
    "S.": "SANTOS",
    "STO.": "SANTO",
    "STA.": "SANTA",
  };

  let result = name;
  for (const [abbr, full] of Object.entries(abbreviations)) {
    // Match abbreviation at word boundary
    const regex = new RegExp(`\\b${abbr.replace(".", "\\.")}`, "gi");
    result = result.replace(regex, full);
  }

  return result;
}

/**
 * Normalize a name for comparison:
 * - Convert to uppercase
 * - Remove accents
 * - Expand abbreviations
 * - Remove extra whitespace
 * - Remove common suffixes (JR, FILHO, NETO, etc.)
 */
export function normalizeName(name: string): string {
  if (!name) return "";

  let normalized = name.toUpperCase().trim();

  // Remove accents
  normalized = removeAccents(normalized);

  // Expand abbreviations
  normalized = expandAbbreviations(normalized);

  // Remove common suffixes that might vary
  normalized = normalized
    .replace(/\b(JUNIOR|JR\.?|FILHO|NETO|SOBRINHO|SEGUNDO|II|III)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return normalized;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  // Create distance matrix
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Initialize base cases
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Fill the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Calculate similarity percentage between two strings
 * Returns a value between 0 and 1
 */
export function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(str1, str2);
  return 1 - distance / maxLen;
}

/**
 * Extract first and last name for comparison
 * Sometimes only first/last name matches are reliable
 */
function extractKeyParts(name: string): { first: string; last: string } {
  const parts = name.split(" ").filter((p) => p.length > 0);
  return {
    first: parts[0] || "",
    last: parts[parts.length - 1] || "",
  };
}

/**
 * Check if two names match with smart comparison
 *
 * @param leadName - The name from the lead (user input)
 * @param dbName - The name from the database/API
 * @param threshold - Minimum similarity score (0-1), default 0.75
 * @returns Object with match result and confidence score
 */
export function matchNames(
  leadName: string,
  dbName: string,
  threshold: number = 0.75,
): { matches: boolean; score: number; method: string } {
  const normalizedLead = normalizeName(leadName);
  const normalizedDb = normalizeName(dbName);

  // Exact match after normalization
  if (normalizedLead === normalizedDb) {
    return { matches: true, score: 1.0, method: "exact" };
  }

  // Full name similarity
  const fullSimilarity = calculateSimilarity(normalizedLead, normalizedDb);
  if (fullSimilarity >= threshold) {
    return { matches: true, score: fullSimilarity, method: "fuzzy-full" };
  }

  // Try first + last name comparison (handles middle name variations)
  const leadParts = extractKeyParts(normalizedLead);
  const dbParts = extractKeyParts(normalizedDb);

  // If first names match exactly (common case: "MARIA" matches "MARIA SILVA")
  if (leadParts.first === dbParts.first && leadParts.first.length >= 3) {
    // If lead has only first name, match with any full name starting with it
    if (leadParts.first === leadParts.last) {
      return {
        matches: true,
        score: 0.85,
        method: "first-name-only",
      };
    }
    // First names match, check last names
    const lastSimilarity = calculateSimilarity(leadParts.last, dbParts.last);
    if (lastSimilarity >= 0.6) {
      return {
        matches: true,
        score: (1 + lastSimilarity) / 2,
        method: "first-exact-last-fuzzy",
      };
    }
  }

  // If last names match exactly and first names are similar
  if (leadParts.last === dbParts.last && leadParts.last.length >= 3) {
    const firstSimilarity = calculateSimilarity(leadParts.first, dbParts.first);
    if (firstSimilarity >= 0.6) {
      return {
        matches: true,
        score: (1 + firstSimilarity) / 2,
        method: "last-exact-first-fuzzy",
      };
    }
  }

  // Check if one name contains the other (partial match)
  // This handles cases like "MARIA S" matching "MARIA SILVA"
  if (
    normalizedLead.includes(normalizedDb) ||
    normalizedDb.includes(normalizedLead)
  ) {
    const shorterLen = Math.min(normalizedLead.length, normalizedDb.length);
    const longerLen = Math.max(normalizedLead.length, normalizedDb.length);
    const containScore = shorterLen / longerLen;
    if (containScore >= 0.3) {
      return {
        matches: true,
        score: 0.7 + containScore * 0.3,
        method: "contains",
      };
    }
  }

  // Check if first name of shorter matches first name of longer
  // Handles "MARIA S" vs "MARIA SILVA" where S. is an abbreviation
  if (leadParts.first === dbParts.first) {
    // Check if lead's last is an abbreviation of db's last (or vice versa)
    const leadLast = leadParts.last;
    const dbLast = dbParts.last;
    if (
      (leadLast.length <= 2 && dbLast.startsWith(leadLast)) ||
      (dbLast.length <= 2 && leadLast.startsWith(dbLast))
    ) {
      return {
        matches: true,
        score: 0.8,
        method: "abbreviation-match",
      };
    }
  }

  // Check for initials pattern (e.g., "JP" matches "JOAO PAULO", "MC" matches "MARIA CLARA")
  const dbParts2 = normalizedDb.split(" ").filter((p) => p.length > 0);
  if (
    normalizedLead.length >= 2 &&
    normalizedLead.length <= 3 &&
    normalizedLead === normalizedLead.toUpperCase()
  ) {
    // Check if lead is initials of db name parts
    const initials = dbParts2.map((p) => p[0]).join("");
    if (initials.startsWith(normalizedLead) || normalizedLead === initials) {
      return {
        matches: true,
        score: 0.85,
        method: "initials-match",
      };
    }
  }

  // Check for "INITIALS + LASTNAME" pattern (e.g., "JP Demasi" matches "JOAO PAULO BENEVIDES DEMASI")
  const leadWords = normalizedLead.split(" ").filter((p) => p.length > 0);
  if (leadWords.length >= 2) {
    const possibleInitials = leadWords[0];
    const leadLastName = leadWords[leadWords.length - 1];

    // Check if first word is initials (2-3 uppercase letters)
    if (possibleInitials.length >= 2 && possibleInitials.length <= 3) {
      // Check if initials match first letters of db name
      const dbInitials = dbParts2
        .slice(0, possibleInitials.length)
        .map((p) => p[0])
        .join("");

      // Check if last name matches
      const dbLastName = dbParts2[dbParts2.length - 1];
      const lastNameSimilarity = calculateSimilarity(leadLastName, dbLastName);

      if (dbInitials === possibleInitials && lastNameSimilarity >= 0.7) {
        return {
          matches: true,
          score: 0.9,
          method: "initials-lastname-match",
        };
      }
    }
  }

  return { matches: false, score: fullSimilarity, method: "no-match" };
}

/**
 * Find the best matching name from a list of candidates
 *
 * @param leadName - The name from the lead
 * @param candidates - Array of { name, cpf } objects to compare
 * @param threshold - Minimum similarity score (0-1), default 0.75
 * @returns The best matching candidate or null
 */
export function findBestMatch(
  leadName: string,
  candidates: Array<{ name: string; cpf: string }>,
  threshold: number = 0.75,
): { name: string; cpf: string; score: number; method: string } | null {
  if (!leadName || candidates.length === 0) return null;

  let bestMatch: {
    name: string;
    cpf: string;
    score: number;
    method: string;
  } | null = null;

  for (const candidate of candidates) {
    const result = matchNames(leadName, candidate.name, threshold);
    if (result.matches && (!bestMatch || result.score > bestMatch.score)) {
      bestMatch = {
        name: candidate.name,
        cpf: candidate.cpf,
        score: result.score,
        method: result.method,
      };
    }
  }

  return bestMatch;
}
