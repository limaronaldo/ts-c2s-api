import type { WorkApiPerson } from "../services/work-api.service";
import { formatCpf, normalizeIncome } from "./normalize";
import { formatPhone } from "./phone";
import { getConfig } from "../config";

/**
 * Format currency in Brazilian Real
 * RML-597: Rich formatting for C2S messages
 */
function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Get income multiplier from config
 */
function getIncomeMultiplier(): number {
  try {
    return getConfig().INCOME_MULTIPLIER;
  } catch {
    return 1.9; // Default
  }
}

/**
 * Build C2S customer description from enriched data
 * Simplified format without headers and separators
 */
export function buildDescription(
  person: WorkApiPerson,
  campaignName?: string,
): string {
  const lines: string[] = [];

  // Personal info
  if (person.cpf) {
    lines.push(`CPF: ${formatCpf(person.cpf)}`);
  }
  if (person.nome) {
    lines.push(`Nome: ${person.nome}`);
  }
  if (person.dataNascimento) {
    lines.push(`Nascimento: ${person.dataNascimento}`);
  }
  if (person.sexo) {
    const sexo = person.sexo.startsWith("M")
      ? "Masculino"
      : person.sexo.startsWith("F")
        ? "Feminino"
        : person.sexo;
    lines.push(`Sexo: ${sexo}`);
  }
  if (person.nomeMae) {
    lines.push(`Mãe: ${person.nomeMae}`);
  }

  // Financial info (renda removed, only renda presumida and patrimônio kept)
  const multiplier = getIncomeMultiplier();
  const adjustedRendaPresumida = person.rendaPresumida
    ? normalizeIncome(person.rendaPresumida, multiplier)
    : null;

  if (adjustedRendaPresumida || person.patrimonio) {
    lines.push("");
    if (adjustedRendaPresumida) {
      lines.push(
        `Renda Presumida: R$ ${formatCurrency(adjustedRendaPresumida)}`,
      );
    }
    if (person.patrimonio) {
      lines.push(`Patrimônio: R$ ${formatCurrency(person.patrimonio)}`);
    }
  }

  // Professional info
  if (person.profissao || person.escolaridade || person.estadoCivil) {
    lines.push("");
    if (person.profissao) {
      lines.push(`Profissão: ${person.profissao}`);
    }
    if (person.escolaridade) {
      lines.push(`Escolaridade: ${person.escolaridade}`);
    }
    if (person.estadoCivil) {
      lines.push(`Estado Civil: ${person.estadoCivil}`);
    }
  }

  // Contact info
  if (
    (person.telefones && person.telefones.length > 0) ||
    (person.emails && person.emails.length > 0)
  ) {
    lines.push("");

    if (person.telefones && person.telefones.length > 0) {
      for (const tel of person.telefones.slice(0, 3)) {
        const tipo = tel.tipo ? ` (${tel.tipo})` : "";
        lines.push(`📱 ${formatPhone(tel.numero)}${tipo}`);
      }
      if (person.telefones.length > 3) {
        lines.push(`   +${person.telefones.length - 3} telefone(s)`);
      }
    }

    if (person.emails && person.emails.length > 0) {
      for (const email of person.emails.slice(0, 2)) {
        lines.push(`✉️ ${email.email}`);
      }
      if (person.emails.length > 2) {
        lines.push(`   +${person.emails.length - 2} email(s)`);
      }
    }
  }

  // Address info
  if (person.enderecos && person.enderecos.length > 0) {
    lines.push("");
    for (const addr of person.enderecos.slice(0, 2)) {
      const street = [addr.logradouro, addr.numero].filter(Boolean).join(", ");
      const location = [addr.bairro, addr.cidade, addr.uf]
        .filter(Boolean)
        .join(" - ");
      if (street) lines.push(`📍 ${street}`);
      if (addr.complemento) lines.push(`   ${addr.complemento}`);
      if (location) lines.push(`   ${location}`);
      if (addr.cep) lines.push(`   CEP: ${addr.cep}`);
      // Add separator between addresses
      const isLastShown =
        person.enderecos.indexOf(addr) ===
        Math.min(1, person.enderecos.length - 1);
      if (person.enderecos.length > 1 && !isLastShown) {
        lines.push("");
      }
    }
    if (person.enderecos.length > 2) {
      lines.push(`   +${person.enderecos.length - 2} endereço(s)`);
    }
  }

  // Campaign info
  if (campaignName) {
    lines.push("");
    lines.push(`🎯 Campanha: ${campaignName}`);
  }

  return lines.join("\n");
}

/**
 * Build a simple description when no enrichment data is available
 * Simplified format without headers
 */
export function buildSimpleDescription(
  name: string,
  phone?: string,
  email?: string,
  campaignName?: string,
): string {
  const lines: string[] = [];

  lines.push(`Nome: ${name}`);

  if (phone) {
    lines.push(`📱 ${formatPhone(phone)}`);
  }
  if (email) {
    lines.push(`✉️ ${email}`);
  }

  if (campaignName) {
    lines.push("");
    lines.push(`🎯 Campanha: ${campaignName}`);
  }

  return lines.join("\n");
}

/**
 * Build a partial enrichment description when Work API times out
 * CPF was found but enrichment data couldn't be retrieved in time
 * Simplified format without headers
 */
export function buildPartialEnrichmentDescription(
  name: string,
  cpf: string,
  phone?: string,
  email?: string,
  campaignName?: string,
): string {
  const lines: string[] = [];

  lines.push(`CPF: ${formatCpf(cpf)}`);
  lines.push(`Nome: ${name}`);

  if (phone) {
    lines.push(`📱 ${formatPhone(phone)}`);
  }
  if (email) {
    lines.push(`✉️ ${email}`);
  }

  if (campaignName) {
    lines.push("");
    lines.push(`🎯 Campanha: ${campaignName}`);
  }

  return lines.join("\n");
}
