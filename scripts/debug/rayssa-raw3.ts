import { getConfig } from "../../src/config";

async function main() {
  const config = getConfig();
  const cpf = "13528409606";
  
  console.log("=== Dados Brutos Work API - Rayssa ===\n");
  console.log(`URL: ${config.WORK_API_URL}`);
  console.log("Aguardando 3s para rate limit...\n");
  await new Promise(r => setTimeout(r, 3000));
  
  // Usar formato GET com query params
  const url = `${config.WORK_API_URL}?token=${config.WORK_API}&modulo=cpf&consulta=${cpf}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.erro || data.error) {
    console.log("Erro:", data.erro || data.error || data.message);
    return;
  }
  
  // Mostrar estrutura completa
  console.log("=== DadosBasicos ===");
  if (data.DadosBasicos) {
    const db = data.DadosBasicos;
    console.log(`Nome: ${db.Nome}`);
    console.log(`CPF: ${db.Cpf}`);
    console.log(`Nascimento: ${db.DataNascimento}`);
    console.log(`Idade: ${db.Idade}`);
    console.log(`Sexo: ${db.Sexo}`);
    console.log(`Nome da Mãe: ${db.NomeMae || 'Não informado'}`);
    console.log(`Nome do Pai: ${db.NomePai || 'Não informado'}`);
    console.log(`Situação CPF: ${db.SituacaoCpf}`);
    console.log(`Óbito: ${db.Obito}`);
  } else {
    console.log("DadosBasicos não disponível");
    console.log("Chaves:", Object.keys(data));
  }
  
  console.log("\n=== DadosEconomicos ===");
  if (data.DadosEconomicos) {
    const de = data.DadosEconomicos;
    console.log(`Renda Presumida: R$ ${de.RendaPresumida?.toLocaleString('pt-BR') || 'N/A'}`);
    console.log(`Classe Social: ${de.ClasseSocial || 'N/A'}`);
    console.log(`Poder Aquisitivo: ${de.PoderAquisitivo || 'N/A'}`);
  }
  
  console.log("\n=== Endereços ===");
  if (data.enderecos && data.enderecos.length > 0) {
    for (const end of data.enderecos) {
      console.log(`  - ${end.Logradouro || end.logradouro}, ${end.Numero || end.numero}`);
      console.log(`    ${end.Bairro || end.bairro} - ${end.Cidade || end.cidade}/${end.Uf || end.uf}`);
      console.log(`    CEP: ${end.Cep || end.cep}`);
    }
  }
  
  console.log("\n=== Empregos ===");
  if (data.empregos && data.empregos.length > 0) {
    for (const emp of data.empregos) {
      console.log(`  - ${emp.Empresa || emp.empresa}`);
      console.log(`    Cargo: ${emp.Cargo || emp.cargo}`);
    }
  } else {
    console.log("Nenhum");
  }
  
  console.log("\n=== Empresas ===");
  if (data.empresas && data.empresas.length > 0) {
    for (const emp of data.empresas) {
      console.log(`  - ${emp.RazaoSocial || emp.razaoSocial}`);
      console.log(`    CNPJ: ${emp.Cnpj || emp.cnpj}`);
    }
  } else {
    console.log("Nenhuma");
  }
  
  // Parentes
  console.log("\n=== Parentes ===");
  const parentesKeys = ['parentes', 'familiares', 'Parentes', 'Familiares', 'vinculos', 'Vinculos'];
  let foundParentes = false;
  for (const key of parentesKeys) {
    if (data[key] && data[key].length > 0) {
      foundParentes = true;
      console.log(`Encontrado em: ${key}`);
      for (const p of data[key]) {
        console.log(`  - ${JSON.stringify(p)}`);
      }
    }
  }
  if (!foundParentes) {
    console.log("Não disponível");
  }
  
  // Todas as chaves
  console.log("\n=== Chaves ===");
  console.log(Object.keys(data).join(', '));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
