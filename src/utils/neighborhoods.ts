/**
 * Noble/Premium Neighborhoods Database (RML-810)
 *
 * List of premium neighborhoods in São Paulo for high-value lead detection.
 */

// Premium neighborhoods in São Paulo
export const SP_NOBLE_NEIGHBORHOODS = new Set([
  // Jardins region
  "jardim europa",
  "jardim america",
  "jardim paulista",
  "jardim paulistano",
  "jardins",

  // Itaim / Vila Nova
  "itaim bibi",
  "itaim",
  "vila nova conceicao",
  "vila nova conceição",

  // Moema / Vila Olímpia
  "moema",
  "vila olimpia",
  "vila olímpia",

  // Pinheiros region
  "pinheiros",
  "alto de pinheiros",
  "alto pinheiros",

  // Higienópolis / Perdizes
  "higienopolis",
  "higienópolis",
  "perdizes",
  "pacaembu",

  // Morumbi region
  "morumbi",
  "cidade jardim",
  "real parque",

  // Other premium areas
  "brooklin",
  "brooklin novo",
  "campo belo",
  "vila mariana",
  "paraiso",
  "paraíso",
  "consolacao",
  "consolação",
  "cerqueira cesar",
  "cerqueira césar",
  "bela vista",

  // Alto padrão zona oeste
  "cidade jardim",
  "butanta",
  "butantã",

  // Alphaville (Barueri/Santana de Parnaíba)
  "alphaville",
  "tambore",
  "tamboré",
]);

// Premium neighborhoods in Rio de Janeiro
export const RJ_NOBLE_NEIGHBORHOODS = new Set([
  "leblon",
  "ipanema",
  "gavea",
  "gávea",
  "jardim botanico",
  "jardim botânico",
  "lagoa",
  "humaita",
  "humaitá",
  "botafogo",
  "flamengo",
  "laranjeiras",
  "cosme velho",
  "urca",
  "copacabana",
  "leme",
  "barra da tijuca",
  "sao conrado",
  "são conrado",
  "joatinga",
]);

// All noble neighborhoods combined
export const ALL_NOBLE_NEIGHBORHOODS = new Set([
  ...SP_NOBLE_NEIGHBORHOODS,
  ...RJ_NOBLE_NEIGHBORHOODS,
]);

/**
 * Check if a neighborhood is considered noble/premium
 */
export function isNobleNeighborhood(neighborhood: string): boolean {
  if (!neighborhood) return false;
  const normalized = neighborhood.toLowerCase().trim();
  return ALL_NOBLE_NEIGHBORHOODS.has(normalized);
}

/**
 * Check if an address contains a noble neighborhood
 */
export function hasNobleNeighborhood(address: string): boolean {
  if (!address) return false;
  const normalized = address.toLowerCase();

  for (const neighborhood of ALL_NOBLE_NEIGHBORHOODS) {
    if (normalized.includes(neighborhood)) {
      return true;
    }
  }
  return false;
}

/**
 * Extract and identify noble neighborhood from address
 */
export function findNobleNeighborhood(address: string): string | null {
  if (!address) return null;
  const normalized = address.toLowerCase();

  for (const neighborhood of ALL_NOBLE_NEIGHBORHOODS) {
    if (normalized.includes(neighborhood)) {
      return neighborhood;
    }
  }
  return null;
}
