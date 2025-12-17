import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { dbLogger } from "../utils/logger";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (db) return db;

  const dbUrl = process.env.DB_URL;
  if (!dbUrl) {
    throw new Error("DB_URL environment variable is required");
  }

  dbLogger.info("Initializing database connection");

  sql = postgres(dbUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {}, // Suppress notices
    // Set search_path to use analytics schema first (where google_ads_leads lives)
    connection: {
      search_path: "analytics,core,public",
    },
  });

  db = drizzle(sql, { schema });

  dbLogger.info("Database connection established");
  return db;
}

export async function closeDb() {
  if (sql) {
    dbLogger.info("Closing database connection");
    await sql.end();
    sql = null;
    db = null;
  }
}

export { schema };
