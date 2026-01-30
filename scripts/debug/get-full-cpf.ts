import { getConfig } from "../../src/config";

const cpf = process.argv[2] || "40375209824";
const config = getConfig();
const url = `https://completa.workbuscas.com/api?token=${config.WORK_API}&modulo=cpf&consulta=${cpf}`;

const res = await fetch(url);
const data = await res.json();

const cpfFormatted = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

console.log(`\n${"=".repeat(60)}`);
console.log(`  ${data.DadosBasicos?.nome || "N/A"}`);
console.log(`${"=".repeat(60)}\n`);

// Dados básicos
const db = data.DadosBasicos;
if (db) {
  console.log("📋 DADOS BÁSICOS");
  console.log(`  Nome: ${db.nome}`);
  console.log(`  CPF: ${cpfFormatted}`);
  console.log(`  Nascimento: ${db.dataNascimento} (${db.idade} anos)`);
  console.log(`  Sexo: ${db.sexo}`);
  console.log(`  Nome da Mãe: ${db.nomeMae || "N/A"}`);
  if (db.signo) console.log(`  Signo: ${db.signo}`);
}

// Econômicos
console.log("\n💰 DADOS ECONÔMICOS");
const de = data.DadosEconomicos;
if (de) {
  if (de.renda) {
    const rendaAjustada = parseFloat(de.renda) * 1.9;
    console.log(`  Renda: R$ ${rendaAjustada.toLocaleString("pt-BR")}`);
  } else {
    console.log("  Renda: N/A");
  }
  if (de.rendaPresumida) console.log(`  Renda Presumida: R$ ${parseFloat(de.rendaPresumida).toLocaleString("pt-BR")}`);
  if (de.patrimonio) console.log(`  Patrimônio: R$ ${parseFloat(de.patrimonio).toLocaleString("pt-BR")}`);
} else {
  console.log("  Dados não disponíveis");
}

// Telefones
console.log("\n📱 TELEFONES");
if (data.telefones?.length) {
  data.telefones.forEach((t: { telefone: string; operadora?: string; whatsapp?: boolean }, i: number) => {
    console.log(`  ${i + 1}. ${t.telefone} (${t.operadora || "N/A"}) - WhatsApp: ${t.whatsapp ? "Sim" : "Não"}`);
  });
} else {
  console.log("  Nenhum telefone encontrado");
}

// Emails
console.log("\n📧 EMAILS");
if (data.emails?.length) {
  data.emails.forEach((e: { email: string }, i: number) => {
    console.log(`  ${i + 1}. ${e.email}`);
  });
} else {
  console.log("  Nenhum email encontrado");
}

// Endereços
console.log("\n📍 ENDEREÇOS");
if (data.enderecos?.length) {
  data.enderecos.forEach((a: { logradouro?: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; uf?: string; cep?: string }, i: number) => {
    console.log(`  ${i + 1}. ${a.logradouro || ""}, ${a.numero || "S/N"}${a.complemento ? " - " + a.complemento : ""}`);
    console.log(`     ${a.bairro || ""} - ${a.cidade || ""}/${a.uf || ""} - CEP ${a.cep || ""}`);
  });
} else {
  console.log("  Nenhum endereço encontrado");
}

// Empresas
console.log("\n🏢 PARTICIPAÇÕES EM EMPRESAS");
if (data.empresas?.length) {
  data.empresas.forEach((e: { nomeEmpresa?: string; razaoSocial?: string; cnpj?: string; participacao?: string; cargo?: string }, i: number) => {
    console.log(`  ${i + 1}. ${e.nomeEmpresa || e.razaoSocial}`);
    console.log(`     CNPJ: ${e.cnpj} - ${e.participacao || e.cargo || "N/A"}`);
  });
} else {
  console.log("  Nenhuma empresa encontrada");
}

// Empregos
console.log("\n💼 EMPREGOS");
if (data.empregos?.length) {
  data.empregos.forEach((e: { empresa?: string; cargo?: string; dataAdmissao?: string }, i: number) => {
    console.log(`  ${i + 1}. ${e.empresa}`);
    console.log(`     Cargo: ${e.cargo} - Admissão: ${e.dataAdmissao}`);
  });
} else {
  console.log("  Nenhum emprego encontrado");
}

// Parentes
console.log("\n👨‍👩‍👧 PARENTES");
if (data.parentes?.length) {
  data.parentes.slice(0, 10).forEach((p: { nome?: string; parentesco?: string; cpf?: string }, i: number) => {
    console.log(`  ${i + 1}. ${p.nome} (${p.parentesco})`);
  });
  if (data.parentes.length > 10) console.log(`  ... e mais ${data.parentes.length - 10}`);
} else {
  console.log("  Nenhum parente encontrado");
}

console.log("\n" + "=".repeat(60) + "\n");
