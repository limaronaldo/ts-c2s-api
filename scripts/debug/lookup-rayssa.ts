import { container } from "../../src/container";

async function main() {
  const phone = "33991802488";
  const name = "Rayssa";
  
  console.log("=== Consultando Rayssa ===\n");
  console.log(`Telefone: ${phone}`);
  console.log(`Nome: ${name}\n`);
  
  // 1. CPF Discovery
  console.log("--- 1. CPF Discovery (4-tier) ---");
  try {
    const cpfResult = await container.cpfDiscovery.findCpf(phone, name);
    if (cpfResult.cpf) {
      console.log(`CPF encontrado: ${cpfResult.cpf}`);
      console.log(`Fonte: ${cpfResult.source}`);
      if (cpfResult.name) console.log(`Nome CPF: ${cpfResult.name}`);
      if (cpfResult.matchScore) console.log(`Match Score: ${cpfResult.matchScore}`);
      
      // 2. Work API enrichment
      console.log("\n--- 2. Enriquecimento Work API ---");
      const enrichData = await container.workApi.fetchByCpf(cpfResult.cpf);
      if (enrichData) {
        console.log(`Nome completo: ${enrichData.nome}`);
        console.log(`Nascimento: ${enrichData.nascimento}`);
        console.log(`Sexo: ${enrichData.sexo}`);
        console.log(`Mãe: ${enrichData.mae}`);
        if (enrichData.renda) console.log(`Renda: R$ ${(enrichData.renda * 1.9).toLocaleString('pt-BR')}`);
        
        if (enrichData.enderecos?.length > 0) {
          console.log(`\nEndereços (${enrichData.enderecos.length}):`);
          for (const end of enrichData.enderecos.slice(0, 3)) {
            console.log(`  - ${end.logradouro || ''} ${end.numero || ''} ${end.complemento || ''}`);
            console.log(`    ${end.bairro || ''} - ${end.cidade || ''}/${end.uf || ''} - CEP ${end.cep || ''}`);
          }
        }
        
        if (enrichData.telefones?.length > 0) {
          console.log(`\nTelefones (${enrichData.telefones.length}):`);
          for (const tel of enrichData.telefones.slice(0, 5)) {
            console.log(`  - ${tel.ddd} ${tel.numero}`);
          }
        }
        
        if (enrichData.emails?.length > 0) {
          console.log(`\nEmails (${enrichData.emails.length}):`);
          for (const email of enrichData.emails.slice(0, 3)) {
            console.log(`  - ${email.email}`);
          }
        }
        
        // 3. Quality Score
        console.log("\n--- 3. Quality Score ---");
        const qualityScore = container.leadQuality.scoreQuality({
          cpf: cpfResult.cpf,
          name: enrichData.nome,
          phone,
          income: enrichData.renda ? enrichData.renda * 1.9 : undefined,
          neighborhood: enrichData.enderecos?.[0]?.bairro,
        });
        console.log(`Score: ${qualityScore.score}/100`);
        console.log(`Grade: ${qualityScore.grade}`);
        console.log(`Categoria: ${qualityScore.category}`);
        
        // 4. Tier Calculation
        console.log("\n--- 4. Tier Classification ---");
        const tierResult = container.tierCalculator.calculate(
          enrichData.nome,
          phone,
          enrichData.emails?.[0]?.email,
          {
            income: enrichData.renda ? enrichData.renda * 1.9 : undefined,
            addresses: enrichData.enderecos?.map((e: any) => ({
              neighborhood: e.bairro,
              city: e.cidade,
              state: e.uf,
            })),
          }
        );
        console.log(`Tier: ${tierResult.tier.toUpperCase()}`);
        console.log(`Score: ${tierResult.score}`);
        console.log(`Highlights: ${tierResult.highlights.join(', ') || 'Nenhum'}`);
        console.log(`Recomendação: ${tierResult.recommendation.title}`);
        console.log(`Ação: ${tierResult.recommendation.description}`);
        
      } else {
        console.log("Work API não retornou dados");
      }
    } else {
      console.log("CPF não encontrado");
    }
  } catch (error) {
    console.error("Erro:", error);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
