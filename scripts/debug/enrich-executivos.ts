/**
 * Enriquecer executivos Ultrapar/Ipiranga via Work API e salvar no banco
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

const WORK_API = process.env.WORK_API;
const WORK_API_URL =
  process.env.WORK_API_URL || "https://completa.workbuscas.com/api";
const DB_URL = process.env.DB_URL;

if (!WORK_API) {
  console.error("WORK_API environment variable not set");
  process.exit(1);
}

if (!DB_URL) {
  console.error("DB_URL environment variable not set");
  process.exit(1);
}

// Conexão com o banco
const client = postgres(DB_URL);
const db = drizzle(client);

const executivos = [
  // Ultrapar (Holding)
  {
    cargo: "CEO",
    nome: "Rodrigo de Almeida Pizzinatto",
    cpf: "27070827830",
    empresa: "Ultrapar",
    desde: "Abril/2025",
  },
  {
    cargo: "Executive Chairman",
    nome: "Marcos Marinho Lutz",
    cpf: "14727417812",
    empresa: "Ultrapar",
    desde: "2025",
  },
  {
    cargo: "CFO",
    nome: "Alexandre Mendes Palhares",
    cpf: "33692918860",
    empresa: "Ultrapar",
    desde: "2024",
  },

  // Ipiranga Produtos de Petroleo S.A.
  {
    cargo: "Administrador",
    nome: "Carlos Frederico Resende",
    cpf: "02346793795",
    empresa: "Ipiranga",
    desde: "22/03/2022",
  },
  {
    cargo: "Diretora",
    nome: "Cristiane Silva Leite",
    cpf: "11470637880",
    empresa: "Ipiranga",
    desde: "23/11/2021",
  },
  {
    cargo: "Diretor/Presidente",
    nome: "Leonardo Remião Linden",
    cpf: "45260150082",
    empresa: "Ipiranga",
    desde: "09/07/2021",
  },
  {
    cargo: "Diretor/CFO",
    nome: "Pedro Guedes Rabelo",
    cpf: "96669586515",
    empresa: "Ipiranga",
    desde: "26/02/2025",
  },
  {
    cargo: "Diretor/VP Comercial",
    nome: "Renato Stefanoni",
    cpf: "27240562808",
    empresa: "Ipiranga",
    desde: "21/03/2025",
  },
  {
    cargo: "Diretor/VP Operações",
    nome: "Sebastião Fernando da Costa Furquim",
    cpf: "26933231852",
    empresa: "Ipiranga",
    desde: "21/03/2025",
  },
];

interface WorkApiResponse {
  DadosBasicos?: {
    nome?: string;
    dataNascimento?: string;
    sexo?: string;
    nomeMae?: string;
    tituloEleitor?: string;
    situacaoCpf?: string;
  };
  DadosEconomicos?: {
    renda?: string;
    rendaPresumida?: string;
    classeEconomica?: string;
    faixaRenda?: string;
  };
  telefones?: Array<{
    telefone?: string;
    tipo?: string;
    operadora?: string;
  }>;
  emails?: Array<{
    email?: string;
  }>;
  enderecos?: Array<{
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    uf?: string;
    cep?: string;
  }>;
  Empresas?: Array<{
    cnpj?: string;
    razaoSocial?: string;
    cargo?: string;
    dataEntrada?: string;
  }>;
  status?: number;
  statusMsg?: string;
  reason?: string;
}

async function fetchWorkApi(cpf: string): Promise<WorkApiResponse | null> {
  const url = `${WORK_API_URL}?token=${WORK_API}&modulo=cpf&consulta=${cpf}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.log(`   ❌ HTTP ${response.status}`);
      return null;
    }

    const data = (await response.json()) as WorkApiResponse;

    if (data.status === 404 || data.status === 403) {
      console.log(`   ❌ ${data.statusMsg}: ${data.reason}`);
      return null;
    }

    return data;
  } catch (error) {
    console.log(
      `   ❌ Erro: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

async function saveToDatabase(
  exec: (typeof executivos)[0],
  data: WorkApiResponse,
) {
  const basicData = data.DadosBasicos || {};
  const econData = data.DadosEconomicos || {};
  const phones = data.telefones || [];
  const emails = data.emails || [];
  const addresses = data.enderecos || [];
  const companies = data.Empresas || [];

  // Parse renda
  const rendaRaw = econData.renda || econData.rendaPresumida || "0";
  const renda =
    parseFloat(rendaRaw.replace(/[^\d.,]/g, "").replace(",", ".")) || 0;

  // Parse birth date para timestamp
  const birthDateStr = basicData.dataNascimento
    ? parseDate(basicData.dataNascimento)
    : null;

  // Estrutura correta da tabela analytics.parties:
  // id (uuid), type, cpf_cnpj, name, trade_name, birth_date (timestamp), gender, mother_name, income, net_worth, occupation, education_level, marital_status, created_at, updated_at

  const partyResult = await db.execute(sql`
    INSERT INTO analytics.parties (
      id,
      type,
      cpf_cnpj,
      name,
      birth_date,
      gender,
      mother_name,
      income,
      occupation,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      'person',
      ${exec.cpf},
      ${basicData.nome || exec.nome},
      ${birthDateStr}::timestamp,
      ${basicData.sexo?.charAt(0) || null},
      ${basicData.nomeMae || null},
      ${renda},
      ${exec.cargo + " - " + exec.empresa},
      NOW(),
      NOW()
    )
    ON CONFLICT (cpf_cnpj) DO UPDATE SET
      name = EXCLUDED.name,
      birth_date = COALESCE(EXCLUDED.birth_date, analytics.parties.birth_date),
      gender = COALESCE(EXCLUDED.gender, analytics.parties.gender),
      mother_name = COALESCE(EXCLUDED.mother_name, analytics.parties.mother_name),
      income = CASE WHEN EXCLUDED.income > 0 THEN EXCLUDED.income ELSE analytics.parties.income END,
      occupation = EXCLUDED.occupation,
      updated_at = NOW()
    RETURNING id
  `);

  const partyId = partyResult[0]?.id;

  if (!partyId) {
    console.log(`   ⚠️  Não conseguiu obter party_id`);
    return;
  }

  // Estrutura correta da tabela analytics.party_contacts:
  // id (uuid), party_id (uuid), type, value, is_primary, is_verified, created_at

  // Inserir telefones
  for (const phone of phones) {
    if (!phone.telefone) continue;

    try {
      await db.execute(sql`
        INSERT INTO analytics.party_contacts (
          id,
          party_id,
          type,
          value,
          is_primary,
          is_verified,
          created_at
        ) VALUES (
          gen_random_uuid(),
          ${partyId}::uuid,
          'phone',
          ${phone.telefone},
          false,
          false,
          NOW()
        )
        ON CONFLICT DO NOTHING
      `);
    } catch (e) {
      // Ignora duplicatas
    }
  }

  // Inserir emails
  for (const email of emails) {
    if (!email.email) continue;

    try {
      await db.execute(sql`
        INSERT INTO analytics.party_contacts (
          id,
          party_id,
          type,
          value,
          is_primary,
          is_verified,
          created_at
        ) VALUES (
          gen_random_uuid(),
          ${partyId}::uuid,
          'email',
          ${email.email},
          false,
          false,
          NOW()
        )
        ON CONFLICT DO NOTHING
      `);
    } catch (e) {
      // Ignora duplicatas
    }
  }

  console.log(`   ✅ Salvo no banco (party_id: ${partyId})`);
  console.log(
    `      📱 ${phones.length} telefone(s), 📧 ${emails.length} email(s)`,
  );
  if (renda > 0) {
    console.log(`      💰 Renda: R$ ${renda.toLocaleString("pt-BR")}`);
  }
  if (addresses.length > 0) {
    const addr = addresses[0];
    console.log(
      `      📍 ${addr.logradouro}, ${addr.numero} - ${addr.bairro}, ${addr.cidade}/${addr.uf}`,
    );
  }
  if (companies.length > 0) {
    console.log(`      🏢 ${companies.length} empresa(s) vinculada(s)`);
  }
}

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;

  // Format: DD/MM/YYYY -> YYYY-MM-DD
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return null;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("🔍 Enriquecendo executivos Ultrapar e Ipiranga via Work API\n");
  console.log("=".repeat(80));

  let successCount = 0;
  let errorCount = 0;

  for (const exec of executivos) {
    console.log(`\n📋 ${exec.cargo} - ${exec.nome}`);
    console.log(`   Empresa: ${exec.empresa} | CPF: ${exec.cpf}`);

    const data = await fetchWorkApi(exec.cpf);

    if (data && data.DadosBasicos) {
      await saveToDatabase(exec, data);
      successCount++;
    } else {
      console.log(`   ⚠️  Sem dados de enriquecimento`);
      errorCount++;
    }

    // Rate limiting: 2 segundos entre requests
    await sleep(2000);
  }

  console.log("\n" + "=".repeat(80));
  console.log(`\n✅ Enriquecimento concluído!`);
  console.log(`   ✓ Sucesso: ${successCount}`);
  console.log(`   ✗ Erro/Sem dados: ${errorCount}`);

  await client.end();
}

main().catch(console.error);
