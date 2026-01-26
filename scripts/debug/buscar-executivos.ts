/**
 * Buscar CPF de executivos Ultrapar e Ipiranga
 */

const WORK_API = process.env.WORK_API;
const WORK_API_URL = process.env.WORK_API_URL || "https://completa.workbuscas.com/api";

if (!WORK_API) {
  console.error("WORK_API environment variable not set");
  process.exit(1);
}

const executivos = [
  // Ultrapar (Holding)
  { cargo: "CEO", nome: "Rodrigo de Almeida Pizzinatto", empresa: "Ultrapar", desde: "Abril/2025" },
  { cargo: "Executive Chairman", nome: "Marcos Marinho Lutz", empresa: "Ultrapar", desde: "2025" },
  { cargo: "CFO", nome: "Alexandre Palhares", empresa: "Ultrapar", desde: "2024" },

  // Ipiranga Produtos de Petroleo S.A.
  { cargo: "Administrador", nome: "Carlos Frederico Resende", empresa: "Ipiranga", desde: "22/03/2022" },
  { cargo: "Diretor", nome: "Cristiane Silva Leite", empresa: "Ipiranga", desde: "23/11/2021" },
  { cargo: "Diretor", nome: "Leonardo Remião Linden", empresa: "Ipiranga", desde: "09/07/2021" },
  { cargo: "Diretor", nome: "Pedro Guedes Rabelo", empresa: "Ipiranga", desde: "26/02/2025" },
  { cargo: "Diretor", nome: "Renato Stefanoni", empresa: "Ipiranga", desde: "21/03/2025" },
  { cargo: "Diretor", nome: "Sebastião Fernando da Costa Furquim", empresa: "Ipiranga", desde: "21/03/2025" },
];

async function buscarCPF(nome: string) {
  const url = `${WORK_API_URL}?token=${WORK_API}&modulo=cpf&consulta=${encodeURIComponent(nome)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { erro: `HTTP ${response.status}` };
    }

    const data = await response.json();

    if (data.erro) {
      return { erro: data.erro };
    }

    // Tentar extrair CPF da resposta
    const cpf = data.DadosBasicos?.cpf || data.cpf || null;
    const nomeEncontrado = data.DadosBasicos?.nome || null;
    const dataNascimento = data.DadosBasicos?.dataNascimento || null;
    const renda = data.DadosEconomicos?.renda || data.DadosEconomicos?.rendaPresumida || null;

    return { cpf, nome: nomeEncontrado, dataNascimento, renda };
  } catch (error) {
    return { erro: error instanceof Error ? error.message : String(error) };
  }
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log("🔍 Buscando CPF de executivos Ultrapar e Ipiranga\n");
console.log("=" .repeat(80));

for (const exec of executivos) {
  console.log(`\n📋 ${exec.cargo} - ${exec.nome}`);
  console.log(`   Empresa: ${exec.empresa} (desde ${exec.desde})`);

  const resultado = await buscarCPF(exec.nome);

  if (resultado.erro) {
    console.log(`   ❌ Erro: ${resultado.erro}`);
  } else if (resultado.cpf) {
    console.log(`   ✅ CPF: ${resultado.cpf}`);
    if (resultado.dataNascimento) console.log(`   📅 Nascimento: ${resultado.dataNascimento}`);
    if (resultado.renda) console.log(`   💰 Renda: ${resultado.renda}`);
  } else {
    console.log(`   ⚠️  CPF não encontrado`);
  }

  // Rate limiting: 2 segundos entre requests
  await sleep(2000);
}

console.log("\n" + "=".repeat(80));
console.log("✅ Busca concluída!");
