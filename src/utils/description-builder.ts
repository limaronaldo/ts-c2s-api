import type { WorkApiPerson } from "../services/work-api.service";
import { formatCpf } from "./normalize";
import { formatPhone } from "./phone";

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
 * Build C2S customer description from enriched data
 * RML-597: Rich formatting with emojis and visual hierarchy
 */
export function buildDescription(
  person: WorkApiPerson,
  campaignName?: string,
): string {
  const lines: string[] = [];

  // Header with visual separator
  lines.push("📋 ENRIQUECIMENTO AUTOMÁTICO");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");

  // Personal info section
  lines.push("👤 DADOS PESSOAIS");
  if (person.cpf) {
    lines.push(`   CPF: ${formatCpf(person.cpf)}`);
  }
  if (person.nome) {
    lines.push(`   Nome: ${person.nome}`);
  }
  if (person.dataNascimento) {
    lines.push(`   Nascimento: ${person.dataNascimento}`);
  }
  if (person.sexo) {
    // Simplify gender display
    const sexo = person.sexo.startsWith("M")
      ? "Masculino"
      : person.sexo.startsWith("F")
        ? "Feminino"
        : person.sexo;
    lines.push(`   Sexo: ${sexo}`);
  }
  if (person.nomeMae) {
    lines.push(`   Mãe: ${person.nomeMae}`);
  }
  lines.push("");

  // Financial info section
  if (person.renda || person.rendaPresumida || person.patrimonio) {
    lines.push("💰 INFORMAÇÕES FINANCEIRAS");
    if (person.renda) {
      lines.push(`   Renda: R$ ${formatCurrency(person.renda)}`);
    }
    if (person.rendaPresumida) {
      lines.push(
        `   Renda Presumida: R$ ${formatCurrency(person.rendaPresumida)}`,
      );
    }
    if (person.patrimonio) {
      lines.push(`   Patrimônio: R$ ${formatCurrency(person.patrimonio)}`);
    }
    lines.push("");
  }

  // Professional info section
  if (person.profissao || person.escolaridade || person.estadoCivil) {
    lines.push("💼 PERFIL PROFISSIONAL");
    if (person.profissao) {
      lines.push(`   Profissão: ${person.profissao}`);
    }
    if (person.escolaridade) {
      lines.push(`   Escolaridade: ${person.escolaridade}`);
    }
    if (person.estadoCivil) {
      lines.push(`   Estado Civil: ${person.estadoCivil}`);
    }
    lines.push("");
  }

  // Contact info section
  if (
    (person.telefones && person.telefones.length > 0) ||
    (person.emails && person.emails.length > 0)
  ) {
    lines.push("📞 CONTATOS");

    if (person.telefones && person.telefones.length > 0) {
      for (const tel of person.telefones.slice(0, 3)) {
        const tipo = tel.tipo ? ` (${tel.tipo})` : "";
        lines.push(`   📱 ${formatPhone(tel.numero)}${tipo}`);
      }
      if (person.telefones.length > 3) {
        lines.push(`   ... +${person.telefones.length - 3} telefone(s)`);
      }
    }

    if (person.emails && person.emails.length > 0) {
      for (const email of person.emails.slice(0, 2)) {
        lines.push(`   ✉️ ${email.email}`);
      }
      if (person.emails.length > 2) {
        lines.push(`   ... +${person.emails.length - 2} email(s)`);
      }
    }
    lines.push("");
  }

  // Address info section
  if (person.enderecos && person.enderecos.length > 0) {
    lines.push("📍 ENDEREÇOS");
    for (const addr of person.enderecos.slice(0, 2)) {
      const street = [addr.logradouro, addr.numero].filter(Boolean).join(", ");
      const location = [addr.bairro, addr.cidade, addr.uf]
        .filter(Boolean)
        .join(" - ");
      if (street) lines.push(`   ${street}`);
      if (addr.complemento) lines.push(`   ${addr.complemento}`);
      if (location) lines.push(`   ${location}`);
      if (addr.cep) lines.push(`   CEP: ${addr.cep}`);
      if (
        person.enderecos.length > 1 &&
        addr !== person.enderecos[person.enderecos.slice(0, 2).pop()!]
      ) {
        lines.push("   ---");
      }
    }
    if (person.enderecos.length > 2) {
      lines.push(`   ... +${person.enderecos.length - 2} endereço(s)`);
    }
    lines.push("");
  }

  // Campaign info
  if (campaignName) {
    lines.push("🎯 ORIGEM");
    lines.push(`   Campanha: ${campaignName}`);
    lines.push("");
  }

  // Footer
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  return lines.join("\n");
}

/**
 * Build a simple description when no enrichment data is available
 * RML-597: Rich formatting with emojis
 */
export function buildSimpleDescription(
  name: string,
  phone?: string,
  email?: string,
  campaignName?: string,
): string {
  const lines: string[] = [];

  lines.push("📋 LEAD REGISTRADO");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");
  lines.push("ℹ️ CPF não localizado - dados básicos");
  lines.push("");
  lines.push("👤 DADOS DO LEAD");
  lines.push(`   Nome: ${name}`);

  if (phone) {
    lines.push(`   📱 ${formatPhone(phone)}`);
  }
  if (email) {
    lines.push(`   ✉️ ${email}`);
  }

  if (campaignName) {
    lines.push("");
    lines.push("🎯 ORIGEM");
    lines.push(`   Campanha: ${campaignName}`);
  }

  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  return lines.join("\n");
}

/**
 * Build a partial enrichment description when Work API times out
 * CPF was found but enrichment data couldn't be retrieved in time
 * RML-597: Rich formatting with emojis
 */
export function buildPartialEnrichmentDescription(
  name: string,
  cpf: string,
  phone?: string,
  email?: string,
  campaignName?: string,
): string {
  const lines: string[] = [];

  lines.push("📋 ENRIQUECIMENTO PARCIAL");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");
  lines.push("⏳ CPF identificado - aguardando dados completos");
  lines.push("");
  lines.push("👤 DADOS IDENTIFICADOS");
  lines.push(`   CPF: ${formatCpf(cpf)}`);
  lines.push(`   Nome: ${name}`);

  if (phone) {
    lines.push(`   📱 ${formatPhone(phone)}`);
  }
  if (email) {
    lines.push(`   ✉️ ${email}`);
  }

  if (campaignName) {
    lines.push("");
    lines.push("🎯 ORIGEM");
    lines.push(`   Campanha: ${campaignName}`);
  }

  lines.push("");
  lines.push("⚠️ STATUS");
  lines.push("   Dados adicionais temporariamente indisponíveis");
  lines.push("   Atualização automática quando disponível");
  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  return lines.join("\n");
}
