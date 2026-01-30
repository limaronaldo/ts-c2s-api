import { container } from "../../src/container";

const phone = process.argv[2] || "11993579021";
const name = process.argv[3] || "Larissa Rodrigues";

console.log("=== Buscando lead ===");
console.log("Nome:", name);
console.log("Telefone:", phone);
console.log("");

// Tier 1: Work API phone module
console.log("--- Tier 1: Work API Phone Module ---");
try {
  const workResult = await container.workApi.fetchByPhoneWithTimeout(phone);

  if (workResult.data && workResult.data.length > 0) {
    console.log("✅ Encontrado via Work API phone module");
    console.log("Matches:", workResult.data.length);

    // Show all matches first
    console.log("\nTodos os matches:");
    workResult.data.forEach(
      (m: { cpf_cnpj: string; nome: string }, i: number) => {
        let doc = m.cpf_cnpj;
        if (doc.length === 14) doc = doc.slice(-11);
        const isPF =
          doc.length === 11 &&
          !m.nome.includes("LIMITADA") &&
          !m.nome.includes("LTDA");
        console.log(`  ${i + 1}. ${m.nome}`);
        console.log(`     ${isPF ? "CPF" : "CNPJ"}: ${doc}`);
      },
    );

    // Get first match with CPF (pessoa física)
    const match = workResult.data.find(
      (m: { cpf_cnpj: string; nome: string }) => {
        const doc =
          m.cpf_cnpj.length === 14 ? m.cpf_cnpj.slice(-11) : m.cpf_cnpj;
        return (
          doc.length === 11 &&
          !m.nome.includes("LIMITADA") &&
          !m.nome.includes("LTDA") &&
          !m.nome.includes("S/A")
        );
      },
    );

    if (match) {
      let cpf = match.cpf_cnpj;
      // Normalize CPF (14 -> 11 chars)
      if (cpf.length === 14) cpf = cpf.slice(-11);

      console.log("\n>>> Pessoa Física selecionada:");
      console.log("  CPF:", cpf);
      console.log("  Nome:", match.nome);

      // Fetch full data by CPF
      console.log("\n--- Buscando dados completos por CPF ---");
      const fullData = await container.workApi.fetchByCpf(cpf);

      if (fullData) {
        console.log("\n=== DADOS COMPLETOS ===");
        console.log("Nome:", fullData.nome);
        console.log("CPF:", fullData.cpf);
        console.log("Data Nascimento:", fullData.dataNascimento);
        console.log("Sexo:", fullData.sexo);
        console.log("Nome da Mãe:", fullData.nomeMae);

        if (fullData.renda) {
          const displayIncome = fullData.renda * 1.9;
          console.log(
            "Renda (ajustada):",
            `R$ ${displayIncome.toLocaleString("pt-BR")}`,
          );
        }

        if (fullData.telefones?.length) {
          console.log("\nTelefones:", fullData.telefones.length);
          fullData.telefones
            .slice(0, 5)
            .forEach((t: { numero: string; tipo?: string }) => {
              console.log(`  - ${t.numero} (${t.tipo || "N/A"})`);
            });
        }

        if (fullData.emails?.length) {
          console.log("\nEmails:", fullData.emails.length);
          fullData.emails.slice(0, 3).forEach((e: { email: string }) => {
            console.log(`  - ${e.email}`);
          });
        }

        if (fullData.enderecos?.length) {
          console.log("\nEndereços:", fullData.enderecos.length);
          fullData.enderecos
            .slice(0, 3)
            .forEach(
              (a: {
                logradouro?: string;
                numero?: string;
                complemento?: string;
                bairro?: string;
                cidade?: string;
                uf?: string;
                cep?: string;
              }) => {
                console.log(
                  `  - ${a.logradouro}, ${a.numero}${a.complemento ? ` - ${a.complemento}` : ""}`,
                );
                console.log(
                  `    ${a.bairro} - ${a.cidade}/${a.uf} - CEP ${a.cep}`,
                );
              },
            );
        }
      } else {
        console.log("❌ Não encontrado dados completos para CPF:", cpf);
      }
    }
  } else {
    console.log("❌ Não encontrado via Work API phone");
    if (workResult.timedOut) console.log("   (timeout)");
    if (workResult.error) console.log("   Erro:", workResult.error);
  }
} catch (e: unknown) {
  const error = e as Error;
  console.log("Erro Work API:", error.message);
}

process.exit(0);
