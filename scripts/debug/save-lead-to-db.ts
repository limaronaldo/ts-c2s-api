/**
 * Script para salvar lead enriquecido no PostgreSQL
 * Uso: bun run scripts/debug/save-lead-to-db.ts <cpf>
 */

import { getConfig } from "../../src/config";
import { container } from "../../src/container";

const cpf = process.argv[2] || "40375209824";
const config = getConfig();

console.log(`\n🔍 Buscando dados do CPF: ${cpf}\n`);

// Fetch from Work API
const url = `https://completa.workbuscas.com/api?token=${config.WORK_API}&modulo=cpf&consulta=${cpf}`;
const res = await fetch(url);
const data = await res.json();

if (!data.DadosBasicos) {
  console.log("❌ CPF não encontrado na Work API");
  process.exit(1);
}

const db = data.DadosBasicos;
const de = data.DadosEconomicos || {};

console.log(`✅ Encontrado: ${db.nome}`);
console.log(`   Nascimento: ${db.dataNascimento}`);
console.log(`   Mãe: ${db.nomeMae || "N/A"}`);

// Parse birth date
let birthDate: Date | undefined;
if (db.dataNascimento) {
  const [day, month, year] = db.dataNascimento.split("/");
  if (day && month && year) {
    birthDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
}

// Calculate income with multiplier
const rawIncome = de.renda ? parseFloat(String(de.renda).replace(",", ".")) : undefined;
const income = rawIncome ? rawIncome * 1.9 : undefined;

// Upsert party
console.log("\n📝 Salvando no PostgreSQL...");

const party = await container.dbStorage.upsertParty({
  type: "person",
  cpfCnpj: cpf,
  name: db.nome,
  birthDate,
  gender: db.sexo?.startsWith("F") ? "female" : db.sexo?.startsWith("M") ? "male" : undefined,
  motherName: db.nomeMae,
  income: income?.toString(),
});

console.log(`   ✅ Party salvo: ${party.id}`);

// Save contacts - phones
if (data.telefones?.length) {
  console.log(`\n📱 Salvando ${data.telefones.length} telefones...`);
  for (const tel of data.telefones) {
    if (tel.telefone) {
      try {
        await container.dbStorage.upsertContact({
          partyId: party.id,
          type: "phone",
          value: tel.telefone,
          isPrimary: false,
        });
        console.log(`   ✅ ${tel.telefone}`);
      } catch (e: unknown) {
        // Ignore duplicates
        const error = e as Error;
        if (!error.message?.includes("duplicate")) {
          console.log(`   ⚠️ ${tel.telefone}: ${error.message}`);
        }
      }
    }
  }
}

// Save contacts - emails
if (data.emails?.length) {
  console.log(`\n📧 Salvando ${data.emails.length} emails...`);
  for (const email of data.emails) {
    if (email.email) {
      try {
        await container.dbStorage.upsertContact({
          partyId: party.id,
          type: "email",
          value: email.email.toLowerCase(),
          isPrimary: false,
        });
        console.log(`   ✅ ${email.email}`);
      } catch (e: unknown) {
        // Ignore duplicates
        const error = e as Error;
        if (!error.message?.includes("duplicate")) {
          console.log(`   ⚠️ ${email.email}: ${error.message}`);
        }
      }
    }
  }
}

// Save addresses
if (data.enderecos?.length) {
  console.log(`\n📍 Salvando ${data.enderecos.length} endereços...`);
  for (const addr of data.enderecos) {
    try {
      await container.dbStorage.upsertAddress({
        partyId: party.id,
        street: addr.logradouro,
        number: addr.numero || "S/N",
        complement: addr.complemento,
        neighborhood: addr.bairro,
        city: addr.cidade,
        state: addr.uf,
        zipCode: addr.cep,
      });
      console.log(`   ✅ ${addr.logradouro}, ${addr.numero || "S/N"} - ${addr.bairro}`);
    } catch (e: unknown) {
      // Ignore duplicates
      const error = e as Error;
      if (!error.message?.includes("duplicate")) {
        console.log(`   ⚠️ ${addr.logradouro}: ${error.message}`);
      }
    }
  }
}

console.log(`
${"=".repeat(60)}
✅ Lead salvo com sucesso!

  ID: ${party.id}
  Nome: ${party.name}
  CPF: ${party.cpfCnpj}
${"=".repeat(60)}
`);

process.exit(0);
