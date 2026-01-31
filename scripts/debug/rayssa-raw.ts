async function main() {
  const cpf = "13528409606";
  
  console.log("=== Dados Brutos Work API - Rayssa ===\n");
  
  const response = await fetch('https://completa.workbuscas.com/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Chave: process.env.WORK_API,
      Modulo: 'cpf',
      Cpf: cpf
    })
  });
  
  const data = await response.json();
  
  // Mostrar estrutura completa
  console.log("=== DadosBasicos ===");
  console.log(JSON.stringify(data.DadosBasicos, null, 2));
  
  console.log("\n=== DadosEconomicos ===");
  console.log(JSON.stringify(data.DadosEconomicos, null, 2));
  
  console.log("\n=== Empregos ===");
  console.log(JSON.stringify(data.empregos, null, 2));
  
  console.log("\n=== Empresas ===");
  console.log(JSON.stringify(data.empresas, null, 2));
  
  console.log("\n=== Endereços ===");
  console.log(JSON.stringify(data.enderecos, null, 2));
  
  console.log("\n=== Profissão ===");
  console.log(JSON.stringify(data.profissao, null, 2));
  
  // Verificar se há dados de parentes
  if (data.parentes) {
    console.log("\n=== Parentes ===");
    console.log(JSON.stringify(data.parentes, null, 2));
  }
  
  if (data.familiares) {
    console.log("\n=== Familiares ===");
    console.log(JSON.stringify(data.familiares, null, 2));
  }
  
  // Mostrar todas as chaves disponíveis
  console.log("\n=== Todas as Chaves ===");
  console.log(Object.keys(data));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
