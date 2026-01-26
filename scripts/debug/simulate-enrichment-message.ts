/**
 * Simula a mensagem de ENRICHMENT que um lead receberia
 */

import { buildDescription } from "../src/utils/description-builder";

// Dados do lead Ana Maria Pereira Ribeiro
const leadName = "Ana Maria Pereira Ribeiro";

// Dados simulados do Work API (pessoa encontrada)
const personData = {
  cpf: "248.845.388.97",
  nome: "ANA MARIA PEREIRA RIBEIRO",
  dataNascimento: "15/03/1975",
  sexo: "F",
  nomeMae: "MARIA DAS GRACAS PEREIRA",
  renda: 1391, // Valor base antes do multiplicador (1.9x = R$ 2.643)
  rendaPresumida: 2100,
  emails: [{ email: "ana.legiao@gmail.com" }],
  telefones: [
    { numero: "13996940059", tipo: "celular" }
  ],
  enderecos: [
    {
      logradouro: "Rua das Flores",
      numero: "123",
      complemento: "Apto 45",
      bairro: "Centro",
      cidade: "Santos",
      uf: "SP",
      cep: "11010-100"
    }
  ]
};

const campaignName = "Google Ads - Imóveis Santos";

console.log("=" .repeat(80));
console.log("MENSAGEM DE ENRICHMENT - Ana Maria Pereira Ribeiro");
console.log("(Única mensagem que o lead recebe agora)");
console.log("=" .repeat(80));
console.log("");

// Gerar mensagem de enrichment (person, campaignName)
const message = buildDescription(personData, campaignName);

console.log(message);
