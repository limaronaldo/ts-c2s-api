/**
 * Buscar CPF de executivos usando CPF Lookup API (DuckDB)
 */

const CPF_LOOKUP_URL = process.env.CPF_LOOKUP_API_URL || "https://cpf-lookup-api.fly.dev";

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

async function buscarCPFPorNome(nome: string) {
  const url = `${CPF_LOOKUP_URL}/lookup?name=${encodeURIComponent(nome)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { erro: `HTTP ${response.status}` };
    }

    const data = await response.json();

    if (data.error) {
      return { erro: data.error };
    }

    // Retornar múltiplos resultados se houver
    if (Array.isArray(data.results) && data.results.length > 0) {
      return { results: data.results, count: data.count };
    }

    return { results: [], count: 0 };
  } catch (error) {
    return { erro: error instanceof Error ? error.message : String(error) };
  }
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log("🔍 Buscando CPF de executivos usando CPF Lookup API (DuckDB - 223M registros)\n");
console.log("=" .repeat(80));

for (const exec of executivos) {
  console.log(`\n📋 ${exec.cargo} - ${exec.nome}`);
  console.log(`   Empresa: ${exec.empresa} (desde ${exec.desde})`);

  const resultado = await buscarCPFPorNome(exec.nome);

  if (resultado.erro) {
    console.log(`   ❌ Erro: ${resultado.erro}`);
  } else if (resultado.results && resultado.results.length > 0) {
    console.log(`   ✅ Encontrado(s) ${resultado.count} resultado(s):`);

    for (let i = 0; i < Math.min(3, resultado.results.length); i++) {
      const r = resultado.results[i];
      console.log(`\n   ${i + 1}. CPF: ${r.cpf}`);
      console.log(`      Nome: ${r.nome}`);
      if (r.data_nascimento) console.log(`      Nascimento: ${r.data_nascimento}`);
      if (r.nome_mae) console.log(`      Mãe: ${r.nome_mae}`);
    }

    if (resultado.results.length > 3) {
      console.log(`\n   ... e mais ${resultado.results.length - 3} resultado(s)`);
    }
  } else {
    console.log(`   ⚠️  CPF não encontrado`);
  }

  // Rate limiting
  await sleep(1000);
}

console.log("\n" + "=".repeat(80));
console.log("✅ Busca concluída!");
