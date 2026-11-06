import "server-only";
import { Pool, types } from "pg";

// Tipi restituiti come valori JS comodi per il client:
types.setTypeParser(1082, (v) => v); // date → "yyyy-MM-dd" (niente fusi orari)
types.setTypeParser(1700, (v) => parseFloat(v)); // numeric → number
types.setTypeParser(20, (v) => parseInt(v, 10)); // bigint (count) → number
types.setTypeParser(1184, (v) => new Date(v.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")).toISOString()); // timestamptz → ISO

const globalForPool = globalThis as unknown as { __ftPool?: Pool };

function createPool() {
  // Il Pool non apre connessioni finché non serve: la build funziona anche senza DATABASE_URL
  // (in quel caso il proxy mostra la pagina /setup).
  const connectionString = process.env.DATABASE_URL;
  const local = !connectionString || /localhost|127\.0\.0\.1|\/var\/run/.test(connectionString);
  return new Pool({
    connectionString,
    ssl: local ? undefined : { rejectUnauthorized: true },
    max: 5,
    idleTimeoutMillis: 10_000,
  });
}

/** Pool condiviso (riutilizzato tra le invocazioni serverless e in sviluppo). */
export const pool: Pool = globalForPool.__ftPool ?? (globalForPool.__ftPool = createPool());

export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}
