import { getConfig } from "../../src/config";

async function main() {
  const config = getConfig();
  const cpf = "13528409606";
  
  console.log("=== Dados Brutos Work API - Rayssa ===\n");
  console.log("Aguardando 3s para respeitar rate limit...\n");
  await new Promise(r => setTimeout(r, 3000));
  
  const response = await fetch('https://completa.workbuscas.com/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Chave: config.WORK_API,
      Modulo: 'cpf',
      Cpf: cpf
    })
  });
  
  const data = await response.json();
  
  if (data.error || data.statusCode) {
    console.log("Erro:", data.message || data.error);
    console.log("Status:", data.statusCode);
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
    console.log(`Signo: ${db.Signo}`);
  } else {
    console.log("Não disponível");
  }
  
  console.log("\n=== DadosEconomicos ===");
  if (data.DadosEconomicos) {
    const de = data.DadosEconomicos;
    console.log(`Renda Presumida: R$ ${de.RendaPresumida?.toLocaleString('pt-BR') || 'N/A'}`);
    console.log(`Classe Social: ${de.ClasseSocial || 'N/A'}`);
    console.log(`Poder Aquisitivo: ${de.PoderAquisitivo || 'N/A'}`);
    console.log(`Faixa Renda: ${de.FaixaRenda || 'N/A'}`);
  } else {
    console.log("Não disponível");
  }
  
  console.log("\n=== Endereços ===");
  if (data.enderecos && data.enderecos.length > 0) {
    for (const end of data.enderecos) {
      console.log(`  - ${end.Logradouro || end.logradouro} ${end.Numero || end.numero}`);
      console.log(`    ${end.Bairro || end.bairro} - ${end.Cidade || end.cidade}/${end.Uf || end.uf}`);
      console.log(`    CEP: ${end.Cep || end.cep}`);
    }
  } else {
    console.log("Não disponível");
  }
  
  console.log("\n=== Empregos ===");
  if (data.empregos && data.empregos.length > 0) {
    for (const emp of data.empregos) {
      console.log(`  - Empresa: ${emp.Empresa || emp.empresa || emp.RazaoSocial}`);
      console.log(`    Cargo: ${emp.Cargo || emp.cargo}`);
      console.log(`    Admissão: ${emp.DataAdmissao || emp.dataAdmissao}`);
      console.log(`    Salário: R$ ${emp.Salario || emp.salario || 'N/A'}`);
    }
  } else {
    console.log("Nenhum emprego registrado");
  }
  
  console.log("\n=== Empresas (Participações) ===");
  if (data.empresas && data.empresas.length > 0) {
    for (const emp of data.empresas) {
      console.log(`  - ${emp.RazaoSocial || emp.razaoSocial}`);
      console.log(`    CNPJ: ${emp.Cnpj || emp.cnpj}`);
      console.log(`    Participação: ${emp.Participacao || emp.participacao || emp.Qualificacao}%`);
      console.log(`    Situação: ${emp.Situacao || emp.situacao}`);
    }
  } else {
    console.log("Nenhuma participação em empresas");
  }
  
  // Verificar parentes
  console.log("\n=== Parentes/Familiares ===");
  if (data.parentes && data.parentes.length > 0) {
    for (const par of data.parentes) {
      console.log(`  - ${par.Nome || par.nome}: ${par.Parentesco || par.parentesco || par.Vinculo}`);
      if (par.Cpf || par.cpf) console.log(`    CPF: ${par.Cpf || par.cpf}`);
    }
  } else if (data.familiares && data.familiares.length > 0) {
    for (const fam of data.familiares) {
      console.log(`  - ${fam.Nome || fam.nome}: ${fam.Parentesco || fam.parentesco || fam.Vinculo}`);
    }
  } else {
    console.log("Não disponível na API");
  }
  
  // Mostrar todas as chaves
  console.log("\n=== Todas as Chaves Disponíveis ===");
  console.log(Object.keys(data).join(', '));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
