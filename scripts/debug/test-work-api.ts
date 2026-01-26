/**
 * Test Work API directly
 * Usage: bun run scripts/test-work-api.ts <cpf>
 */

const cpf = process.argv[2] || "16151388895";

const WORK_API = process.env.WORK_API;
const WORK_API_URL = process.env.WORK_API_URL || "https://completa.workbuscas.com/api";

if (!WORK_API) {
  console.error("WORK_API environment variable not set");
  process.exit(1);
}

console.log(`Testing Work API for CPF: ${cpf}`);
console.log(`URL: ${WORK_API_URL}`);

const url = `${WORK_API_URL}?token=${WORK_API}&modulo=cpf&consulta=${cpf}`;

try {
  const response = await fetch(url);
  console.log(`Status: ${response.status}`);

  const data = await response.json();
  console.log("\nResponse keys:", Object.keys(data));

  if (data.erro) {
    console.log("\nERRO:", data.erro);
  }

  if (data.DadosBasicos) {
    console.log("\n✅ DadosBasicos found:");
    console.log("  Nome:", data.DadosBasicos.nome);
    console.log("  Data Nascimento:", data.DadosBasicos.dataNascimento);
    console.log("  Sexo:", data.DadosBasicos.sexo);
  } else {
    console.log("\n❌ No DadosBasicos in response");
    console.log("\nFull response:");
    console.log(JSON.stringify(data, null, 2).slice(0, 2000));
  }

  if (data.DadosEconomicos) {
    console.log("\n💰 DadosEconomicos found:");
    console.log("  Renda:", data.DadosEconomicos.renda);
    console.log("  Renda Presumida:", data.DadosEconomicos.rendaPresumida);
  }

  if (data.telefones?.length) {
    console.log(`\n📱 ${data.telefones.length} telefone(s)`);
  }

  if (data.enderecos?.length) {
    console.log(`\n📍 ${data.enderecos.length} endereço(s)`);
  }

} catch (error) {
  console.error("Error:", error);
}
