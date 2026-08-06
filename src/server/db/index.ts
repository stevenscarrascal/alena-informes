import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

import * as schema from "./schema";

export * from "./schema";

function connectionUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    throw new Error(
      "Falta la variable de entorno DATABASE_URL. Copia .env.example a .env y ajústala.",
    );
  }
  return url;
}

/**
 * Pool compartido entre peticiones. Vite recarga los módulos en desarrollo, así
 * que se guarda en globalThis para no abrir un pool nuevo en cada HMR.
 */
const globalForDb = globalThis as unknown as {
  __alenaPool?: mysql.Pool;
};

function pool(): mysql.Pool {
  if (!globalForDb.__alenaPool) {
    globalForDb.__alenaPool = mysql.createPool({
      uri: connectionUrl(),
      connectionLimit: 10,
      // Guardamos y leemos siempre en UTC: la capa de consultas serializa las
      // fechas a ISO 8601 para el cliente, igual que hacía PostgREST.
      timezone: "Z",
      // Evita que mysql2 devuelva BIGINT como string y rompa las sumas de bytes.
      supportBigNumbers: true,
      bigNumberStrings: false,
      charset: "utf8mb4_unicode_ci",
    });
  }
  return globalForDb.__alenaPool;
}

export const db = drizzle(pool(), { schema, mode: "default" });

export type Database = typeof db;

/** Fecha → ISO 8601 UTC, el formato que el frontend ya esperaba de Postgres. */
export function iso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** Escapa los comodines de LIKE para que la búsqueda del usuario sea literal. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function newId(): string {
  return crypto.randomUUID();
}
