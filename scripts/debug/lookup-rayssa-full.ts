import { container } from "../../src/container";

async function main() {
  const cpf = "13528409606";
  const name = "RAYSSA REIS DORNELAS NEVES";
  
  console.log("=== Consulta Completa - Rayssa ===\n");
  
  // 1. Dados completos do Work API
  console.log("--- 1. Dados Completos Work API ---");
  const enrichData = await container.workApi.fetchByCpf(cpf);
  
  if (enrichData) {
    console.log(`Nome: ${enrichData.nome}`);
    console.log(`CPF: ${cpf}`);
    console.log(`Sexo: ${enrichData.sexo}`);
    console.log(`Nascimento: ${enrichData.nascimento || 'Não informado'}`);
    console.log(`Mãe: ${enrichData.mae || 'Não informado'}`);
    console.log(`Pai: ${enrichData.pai || 'Não informado'}`);
    
    // Mostrar raw data para ver estrutura completa
    console.log("\n--- Raw DadosBasicos ---");
    const rawData = (enrichData as any)._raw;
    if (rawData?.DadosBasicos) {
      const db = rawData.DadosBasicos;
      console.log(`Nome: ${db.Nome}`);
      console.log(`CPF: ${db.Cpf}`);
      console.log(`Nascimento: ${db.DataNascimento}`);
      console.log(`Idade: ${db.Idade}`);
      console.log(`Sexo: ${db.Sexo}`);
      console.log(`Mãe: ${db.NomeMae}`);
      console.log(`Pai: ${db.NomePai}`);
      console.log(`Signo: ${db.Signo}`);
      console.log(`Situação CPF: ${db.SituacaoCpf}`);
      console.log(`Óbito: ${db.Obito}`);
    }
  }
  
  // 2. Buscar empresas pelo nome
  console.log("\n--- 2. Empresas (CNPJ Lookup) ---");
  try {
    const empresas = await container.cnpjLookup.searchCompaniesByName(name);
    if (empresas.success && empresas.companies.length > 0) {
      console.log(`Encontradas ${empresas.companies.length} empresa(s):`);
      for (const emp of empresas.companies) {
        console.log(`\n  Empresa: ${emp.nomeFantasia || emp.razaoSocial}`);
        console.log(`  CNPJ: ${emp.cnpj}`);
        console.log(`  Situação: ${emp.situacao}`);
        console.log(`  Capital: R$ ${emp.capitalSocial?.toLocaleString('pt-BR') || 'N/A'}`);
        console.log(`  Atividade: ${emp.atividadePrincipal}`);
        console.log(`  Local: ${emp.municipio}/${emp.uf}`);
      }
    } else {
      console.log("Nenhuma empresa encontrada para este nome");
    }
  } catch (e) {
    console.log("Erro ao buscar empresas:", e);
  }
  
  // 3. Buscar família - pesquisar pelo sobrenome na mesma região
  console.log("\n--- 3. Análise de Sobrenome ---");
  const { analyzeFullName, extractSurnames } = await import("../../src/utils/surname-analyzer");
  const surnames = extractSurnames(name);
  console.log(`Sobrenomes: ${surnames.join(', ')}`);
  
  const surnameAnalysis = analyzeFullName(name);
  for (const analysis of surnameAnalysis) {
    console.log(`\n  ${analysis.surname}:`);
    console.log(`    Raro: ${analysis.isRare ? 'Sim' : 'Não'}`);
    console.log(`    Família notável: ${analysis.isNotableFamily ? 'Sim' : 'Não'}`);
    if (analysis.familyContext) {
      console.log(`    Contexto: ${analysis.familyContext}`);
    }
    console.log(`    Confiança: ${analysis.confidence}%`);
  }
  
  // 4. Buscar mãe se tivermos o nome
  console.log("\n--- 4. Busca da Mãe ---");
  // Vamos fazer uma chamada raw para pegar o nome da mãe
  const rawResponse = await fetch('https://completa.workbuscas.com/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Chave: process.env.WORK_API,
      Modulo: 'cpf',
      Cpf: cpf
    })
  });
  const rawJson = await rawResponse.json();
  
  if (rawJson.DadosBasicos?.NomeMae) {
    const nomeMae = rawJson.DadosBasicos.NomeMae;
    console.log(`Nome da Mãe: ${nomeMae}`);
    
    // Tentar descobrir CPF da mãe pelo nome
    console.log("\nBuscando CPF da mãe...");
    try {
      // Usar CPF Lookup para buscar por nome
      const maeResult = await container.cpfLookup.searchByName(nomeMae);
      if (maeResult.results && maeResult.results.length > 0) {
        console.log(`\nResultados encontrados para "${nomeMae}":`);
        for (const result of maeResult.results.slice(0, 5)) {
          console.log(`  - ${result.nome} | CPF: ${result.cpf} | Score: ${result.score}`);
        }
        
        // Pegar o melhor match e enriquecer
        const bestMatch = maeResult.results[0];
        if (bestMatch.score >= 0.8) {
          console.log(`\nEnriquecendo melhor match: ${bestMatch.nome}`);
          const maeData = await container.workApi.fetchByCpf(bestMatch.cpf);
          if (maeData) {
            console.log(`\n  === Dados da Mãe ===`);
            console.log(`  Nome: ${maeData.nome}`);
            console.log(`  CPF: ${bestMatch.cpf}`);
            console.log(`  Sexo: ${maeData.sexo}`);
            if (maeData.renda) console.log(`  Renda: R$ ${(maeData.renda * 1.9).toLocaleString('pt-BR')}`);
            if (maeData.enderecos?.length > 0) {
              const end = maeData.enderecos[0];
              console.log(`  Endereço: ${end.bairro} - ${end.cidade}/${end.uf}`);
            }
          }
        }
      } else {
        console.log("Nenhum resultado encontrado para o nome da mãe");
      }
    } catch (e: any) {
      console.log("Erro ao buscar mãe:", e.message);
    }
  }
  
  // 5. Mostrar dados do pai se disponível
  if (rawJson.DadosBasicos?.NomePai) {
    console.log(`\n--- 5. Dados do Pai ---`);
    console.log(`Nome do Pai: ${rawJson.DadosBasicos.NomePai}`);
  }
  
  // 6. Mostrar todos os dados brutos relevantes
  console.log("\n--- 6. Dados Econômicos ---");
  if (rawJson.DadosEconomicos) {
    const de = rawJson.DadosEconomicos;
    console.log(`Renda Presumida: R$ ${de.RendaPresumida?.toLocaleString('pt-BR') || 'N/A'}`);
    console.log(`Classe Social: ${de.ClasseSocial || 'N/A'}`);
    console.log(`Poder Aquisitivo: ${de.PoderAquisitivo || 'N/A'}`);
  }
  
  console.log("\n--- 7. Empregos ---");
  if (rawJson.empregos && rawJson.empregos.length > 0) {
    for (const emp of rawJson.empregos) {
      console.log(`  - ${emp.Empresa || emp.empresa}: ${emp.Cargo || emp.cargo}`);
      console.log(`    Admissão: ${emp.DataAdmissao || emp.dataAdmissao}`);
    }
  } else {
    console.log("Nenhum emprego registrado");
  }
  
  console.log("\n--- 8. Empresas (QSA) ---");
  if (rawJson.empresas && rawJson.empresas.length > 0) {
    for (const emp of rawJson.empresas) {
      console.log(`  - ${emp.RazaoSocial || emp.razaoSocial}`);
      console.log(`    CNPJ: ${emp.Cnpj || emp.cnpj}`);
      console.log(`    Participação: ${emp.Participacao || emp.participacao}`);
    }
  } else {
    console.log("Nenhuma participação em empresas");
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
