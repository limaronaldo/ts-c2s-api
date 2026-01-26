import { DBaseService } from "./dbase.service";
import { DiretrixService } from "./diretrix.service";
import { CpfLookupService } from "./cpf-lookup.service";
import { contactToCpfCache } from "../utils/cache";
import { enrichmentLogger } from "../utils/logger";
import { getConfig } from "../config";
import { matchNames, normalizeName } from "../utils/name-matcher";

/**
 * Result from CPF discovery including name match info
 */
export interface CpfDiscoveryResult {
  cpf: string;
  foundName: string; // Name found in database
  nameMatches: boolean; // Whether lead name matches found name
  matchScore: number;
  matchMethod: string;
  source: string; // Which tier found the CPF
}

/**
 * CPF Discovery Service with 3-tier fallback:
 * 1. DBase (fastest, cheapest - requires IP whitelisting)
 * 2. Diretrix (most comprehensive - direct API calls)
 * 3. Work API (fallback - uses phone module)
 *
 * Note: Mimir was removed - we now call Diretrix directly which is more reliable
 */
export class CpfDiscoveryService {
  private dbaseService: DBaseService;
  private diretrixService: DiretrixService;
  private cpfLookupService: CpfLookupService;
  private workApiKey: string;
  private workApiUrl: string;

  constructor() {
    this.dbaseService = new DBaseService();
    this.diretrixService = new DiretrixService();
    this.cpfLookupService = new CpfLookupService();
    const config = getConfig();
    this.workApiKey = config.WORK_API;
    this.workApiUrl = config.WORK_API_URL;
  }

  async findCpfByPhone(
    phone: string,
    leadName?: string,
  ): Promise<CpfDiscoveryResult | null> {
    const cacheKey = `phone:${phone}`;

    enrichmentLogger.info(
      { phone, leadName },
      "Starting 3-tier CPF discovery by phone",
    );

    // Helper to build result with name match info
    const buildResult = (
      result: { cpf: string; name: string } | null,
      tier: number,
      source: string,
    ): CpfDiscoveryResult | null => {
      if (!result) return null;

      const match = leadName
        ? matchNames(leadName, result.name)
        : { matches: true, score: 1, method: "no-validation" };

      enrichmentLogger.info(
        {
          phone,
          cpf: result.cpf,
          tier,
          source,
          leadName,
          dbName: result.name,
          matchScore: match.score.toFixed(2),
          matchMethod: match.method,
          nameMatches: match.matches,
        },
        match.matches
          ? "CPF found with name match"
          : "CPF found with name MISMATCH - will enrich with warning",
      );

      return {
        cpf: result.cpf,
        foundName: result.name,
        nameMatches: match.matches,
        matchScore: match.score,
        matchMethod: match.method,
        source,
      };
    };

    // Tier 1: DBase
    try {
      const result = await this.dbaseService.findCpfByPhone(phone);
      const discoveryResult = buildResult(result, 1, "dbase");
      if (discoveryResult) {
        contactToCpfCache.set(cacheKey, discoveryResult.cpf);
        return discoveryResult;
      }
    } catch (error) {
      enrichmentLogger.warn(
        { phone, error },
        "DBase lookup failed, trying next tier",
      );
    }

    // Tier 2: Diretrix (direct API call - more reliable than Mimir)
    try {
      const result = await this.diretrixService.findCpfByPhone(phone);
      const discoveryResult = buildResult(result, 2, "diretrix");
      if (discoveryResult) {
        contactToCpfCache.set(cacheKey, discoveryResult.cpf);
        return discoveryResult;
      }
    } catch (error) {
      enrichmentLogger.warn(
        { phone, error },
        "Diretrix lookup failed, trying next tier",
      );
    }

    // Tier 3: Work API (fallback - uses phone module)
    try {
      const workApiResult = await this.findCpfByPhoneWorkApiWithName(phone);
      if (workApiResult) {
        const discoveryResult = buildResult(workApiResult, 3, "work-api");
        if (discoveryResult) {
          contactToCpfCache.set(cacheKey, discoveryResult.cpf);
          return discoveryResult;
        }
      }
    } catch (error) {
      enrichmentLogger.warn({ phone, error }, "Work API phone lookup failed");
    }

    // Tier 4: CPF Lookup by name (DuckDB 223M records) - only if we have a name
    if (leadName && leadName.length >= 5) {
      try {
        enrichmentLogger.info(
          { phone, leadName },
          "Trying CPF Lookup by name as fallback",
        );
        const cpfLookupResult =
          await this.cpfLookupService.findBestMatch(leadName);
        if (cpfLookupResult) {
          const match = matchNames(leadName, cpfLookupResult.nome_completo);

          // Only accept if name match is strong (>= 0.7)
          if (match.matches && match.score >= 0.7) {
            enrichmentLogger.info(
              {
                phone,
                leadName,
                foundCpf: cpfLookupResult.cpf,
                foundName: cpfLookupResult.nome_completo,
                matchScore: match.score.toFixed(2),
              },
              "CPF found via name lookup (DuckDB fallback)",
            );

            const discoveryResult: CpfDiscoveryResult = {
              cpf: cpfLookupResult.cpf,
              foundName: cpfLookupResult.nome_completo,
              nameMatches: true,
              matchScore: match.score,
              matchMethod: match.method,
              source: "cpf-lookup-223m-name",
            };

            contactToCpfCache.set(cacheKey, discoveryResult.cpf);
            return discoveryResult;
          } else {
            enrichmentLogger.info(
              {
                phone,
                leadName,
                foundName: cpfLookupResult.nome_completo,
                matchScore: match.score.toFixed(2),
              },
              "CPF Lookup found result but name match too weak, skipping",
            );
          }
        }
      } catch (error) {
        enrichmentLogger.warn(
          { phone, leadName, error },
          "CPF Lookup by name failed",
        );
      }
    }

    enrichmentLogger.info({ phone, leadName }, "CPF not found in any tier");
    return null;
  }

  /**
   * Tier 4: Work API phone lookup - returns CPF and name
   */
  private async findCpfByPhoneWorkApiWithName(
    phone: string,
  ): Promise<{ cpf: string; name: string } | null> {
    try {
      const url = `${this.workApiUrl}?token=${this.workApiKey}&modulo=phone&consulta=${phone}`;
      const response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();

      if (data.msg && Array.isArray(data.msg) && data.msg.length > 0) {
        const first = data.msg[0];
        let cpf = first.cpf_cnpj;
        const name = first.nome || "";

        // Work API returns CPF with leading zeros (14 chars), normalize to 11
        if (cpf && cpf.length === 14) {
          cpf = cpf.slice(-11); // Take last 11 digits
        }

        if (cpf && cpf.length === 11) {
          return { cpf, name };
        }
      }

      return null;
    } catch (error) {
      enrichmentLogger.warn({ phone, error }, "Work API phone lookup failed");
      return null;
    }
  }

  async findCpfByEmail(
    email: string,
    leadName?: string,
  ): Promise<CpfDiscoveryResult | null> {
    const cacheKey = `email:${email}`;

    enrichmentLogger.info({ email, leadName }, "Looking up CPF by email");

    // Helper to build result with name match info
    const buildResult = (
      result: { cpf: string; name: string } | null,
      tier: number,
      source: string,
    ): CpfDiscoveryResult | null => {
      if (!result) return null;

      const match = leadName
        ? matchNames(leadName, result.name)
        : { matches: true, score: 1, method: "no-validation" };

      enrichmentLogger.info(
        {
          email,
          cpf: result.cpf,
          tier,
          source,
          leadName,
          dbName: result.name,
          matchScore: match.score.toFixed(2),
          matchMethod: match.method,
          nameMatches: match.matches,
        },
        match.matches
          ? "CPF found by email with name match"
          : "CPF found by email with name MISMATCH - will enrich with warning",
      );

      return {
        cpf: result.cpf,
        foundName: result.name,
        nameMatches: match.matches,
        matchScore: match.score,
        matchMethod: match.method,
        source,
      };
    };

    // Tier 1: Diretrix (direct API call - more reliable than Mimir)
    try {
      const result = await this.diretrixService.findCpfByEmailWithName(email);
      const discoveryResult = buildResult(result, 1, "diretrix");
      if (discoveryResult) {
        contactToCpfCache.set(cacheKey, discoveryResult.cpf);
        return discoveryResult;
      }
    } catch (error) {
      enrichmentLogger.warn({ email, error }, "Diretrix email lookup failed");
    }

    return null;
  }

  /**
   * Find CPF by phone or email, returning full discovery result with name match info
   */
  async findCpf(
    phone?: string,
    email?: string,
    leadName?: string,
  ): Promise<CpfDiscoveryResult | null> {
    // Try phone first (4-tier fallback: DBase → Mimir → Diretrix → Work API)
    if (phone) {
      const result = await this.findCpfByPhone(phone, leadName);
      if (result) return result;
    }

    // Fall back to email (2-tier: Mimir → Diretrix)
    if (email) {
      const result = await this.findCpfByEmail(email, leadName);
      if (result) return result;
    }

    return null;
  }

  /**
   * Validate a CPF using the 223M CPF database
   * Returns the official name and validates the CPF exists
   */
  async validateCpf(
    cpf: string,
    leadName?: string,
  ): Promise<CpfDiscoveryResult | null> {
    try {
      const record = await this.cpfLookupService.lookupByCpf(cpf);

      if (!record) {
        enrichmentLogger.info({ cpf }, "CPF not found in 223M database");
        return null;
      }

      const match = leadName
        ? matchNames(leadName, record.nome_completo)
        : { matches: true, score: 1, method: "no-validation" };

      enrichmentLogger.info(
        {
          cpf,
          nome: record.nome_completo,
          leadName,
          matchScore: match.score.toFixed(2),
          nameMatches: match.matches,
        },
        "CPF validated via 223M database",
      );

      return {
        cpf: record.cpf,
        foundName: record.nome_completo,
        nameMatches: match.matches,
        matchScore: match.score,
        matchMethod: match.method,
        source: "cpf-lookup-223m",
      };
    } catch (error) {
      enrichmentLogger.warn({ cpf, error }, "CPF validation failed");
      return null;
    }
  }

  /**
   * Find CPF by masked format (e.g., ***.123.456-**)
   * Uses 6 middle digits to search the 223M database
   */
  async findCpfByMasked(
    maskedCpf: string,
    leadName?: string,
  ): Promise<CpfDiscoveryResult | null> {
    try {
      const result = await this.cpfLookupService.lookupByMasked(maskedCpf);

      if (!result || result.count === 0) {
        enrichmentLogger.info({ maskedCpf }, "No CPF found for masked pattern");
        return null;
      }

      // If we have a lead name, find the best match
      if (leadName && result.count > 1) {
        let bestMatch: CpfDiscoveryResult | null = null;
        let bestScore = 0;

        for (const record of result.results) {
          const match = matchNames(leadName, record.nome_completo);
          if (match.score > bestScore) {
            bestScore = match.score;
            bestMatch = {
              cpf: record.cpf,
              foundName: record.nome_completo,
              nameMatches: match.matches,
              matchScore: match.score,
              matchMethod: match.method,
              source: "cpf-lookup-223m-masked",
            };
          }
        }

        if (bestMatch) {
          enrichmentLogger.info(
            {
              maskedCpf,
              candidates: result.count,
              selectedCpf: bestMatch.cpf,
              selectedName: bestMatch.foundName,
              matchScore: bestMatch.matchScore.toFixed(2),
            },
            "Selected best CPF match from masked search",
          );
          return bestMatch;
        }
      }

      // Return first result if no name matching or single result
      const first = result.results[0];
      const match = leadName
        ? matchNames(leadName, first.nome_completo)
        : { matches: true, score: 1, method: "no-validation" };

      enrichmentLogger.info(
        {
          maskedCpf,
          cpf: first.cpf,
          nome: first.nome_completo,
          candidates: result.count,
        },
        "CPF found via masked search",
      );

      return {
        cpf: first.cpf,
        foundName: first.nome_completo,
        nameMatches: match.matches,
        matchScore: match.score,
        matchMethod: match.method,
        source: "cpf-lookup-223m-masked",
      };
    } catch (error) {
      enrichmentLogger.warn({ maskedCpf, error }, "Masked CPF search failed");
      return null;
    }
  }
}
