import type { WorkApiPerson } from "../services/work-api.service";
import { formatCpf } from "./normalize";
import { formatPhone } from "./phone";

/**
 * Build C2S customer description from enriched data
 * Format matches the Rust implementation for consistency
 */
export function buildDescription(
  person: WorkApiPerson,
  campaignName?: string,
): string {
  const lines: string[] = [];

  // Header
  lines.push("=== DADOS ENRIQUECIDOS ===");
  lines.push("");

  // Basic info
  if (person.cpf) {
    lines.push(`CPF: ${formatCpf(person.cpf)}`);
  }
  if (person.nome) {
    lines.push(`Nome: ${person.nome}`);
  }
  if (person.dataNascimento) {
    lines.push(`Data de Nascimento: ${person.dataNascimento}`);
  }
  if (person.sexo) {
    lines.push(`Sexo: ${person.sexo}`);
  }
  if (person.nomeMae) {
    lines.push(`Nome da Mãe: ${person.nomeMae}`);
  }

  lines.push("");

  // Financial info
  if (person.renda || person.rendaPresumida) {
    lines.push("--- Informações Financeiras ---");
    if (person.renda) {
      lines.push(
        `Renda: R$ ${person.renda.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      );
    }
    if (person.rendaPresumida) {
      lines.push(
        `Renda Presumida: R$ ${person.rendaPresumida.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      );
    }
    if (person.patrimonio) {
      lines.push(
        `Patrimônio: R$ ${person.patrimonio.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      );
    }
    lines.push("");
  }

  // Professional info
  if (person.profissao || person.escolaridade || person.estadoCivil) {
    lines.push("--- Informações Profissionais ---");
    if (person.profissao) {
      lines.push(`Profissão: ${person.profissao}`);
    }
    if (person.escolaridade) {
      lines.push(`Escolaridade: ${person.escolaridade}`);
    }
    if (person.estadoCivil) {
      lines.push(`Estado Civil: ${person.estadoCivil}`);
    }
    lines.push("");
  }

  // Contact info
  if (person.telefones && person.telefones.length > 0) {
    lines.push("--- Telefones ---");
    for (const tel of person.telefones.slice(0, 5)) {
      const tipo = tel.tipo ? ` (${tel.tipo})` : "";
      lines.push(`${formatPhone(tel.numero)}${tipo}`);
    }
    lines.push("");
  }

  if (person.emails && person.emails.length > 0) {
    lines.push("--- Emails ---");
    for (const email of person.emails.slice(0, 3)) {
      lines.push(email.email);
    }
    lines.push("");
  }

  // Address info
  if (person.enderecos && person.enderecos.length > 0) {
    lines.push("--- Endereços ---");
    for (const addr of person.enderecos.slice(0, 2)) {
      const parts = [
        addr.logradouro,
        addr.numero,
        addr.complemento,
        addr.bairro,
        addr.cidade,
        addr.uf,
        addr.cep,
      ].filter(Boolean);
      lines.push(parts.join(", "));
    }
    lines.push("");
  }

  // Campaign info
  if (campaignName) {
    lines.push("--- Origem ---");
    lines.push(`Campanha: ${campaignName}`);
    lines.push("");
  }

  lines.push("=== FIM DOS DADOS ===");

  return lines.join("\n");
}

/**
 * Build a simple description when no enrichment data is available
 */
export function buildSimpleDescription(
  name: string,
  phone?: string,
  email?: string,
  campaignName?: string,
): string {
  const lines: string[] = [];

  lines.push("=== LEAD NÃO ENRIQUECIDO ===");
  lines.push("");
  lines.push(`Nome: ${name}`);

  if (phone) {
    lines.push(`Telefone: ${formatPhone(phone)}`);
  }
  if (email) {
    lines.push(`Email: ${email}`);
  }

  if (campaignName) {
    lines.push("");
    lines.push("--- Origem ---");
    lines.push(`Campanha: ${campaignName}`);
  }

  lines.push("");
  lines.push("=== FIM DOS DADOS ===");

  return lines.join("\n");
}

/**
 * Build a partial enrichment description when Work API times out
 * CPF was found but enrichment data couldn't be retrieved in time
 * Reference: Lead Operations Guide - "15-second timeout for Work API with partial fallback"
 */
export function buildPartialEnrichmentDescription(
  name: string,
  cpf: string,
  phone?: string,
  email?: string,
  campaignName?: string,
): string {
  const lines: string[] = [];

  lines.push("=== ENRIQUECIMENTO PARCIAL ===");
  lines.push("");
  lines.push(
    "⚠️ CPF identificado, mas dados adicionais indisponíveis no momento.",
  );
  lines.push(
    "   Os dados serão atualizados automaticamente quando disponíveis.",
  );
  lines.push("");
  lines.push(`CPF: ${formatCpf(cpf)}`);
  lines.push(`Nome: ${name}`);

  if (phone) {
    lines.push(`Telefone: ${formatPhone(phone)}`);
  }
  if (email) {
    lines.push(`Email: ${email}`);
  }

  if (campaignName) {
    lines.push("");
    lines.push("--- Origem ---");
    lines.push(`Campanha: ${campaignName}`);
  }

  lines.push("");
  lines.push("--- Status ---");
  lines.push("Motivo: Timeout na consulta de dados (Work API)");
  lines.push("Ação: Dados serão re-enriquecidos em próxima execução");
  lines.push("");
  lines.push("=== FIM DOS DADOS ===");

  return lines.join("\n");
}
