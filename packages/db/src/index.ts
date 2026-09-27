import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type CreateDbOptions = {
  /** Havuzdaki en fazla bağlantı. Postgres `max_connections` düşük tutulduğu için küçük kalmalı. */
  max?: number;
  /**
   * Oturum saat dilimi. "Gün" hesapları (`current_date`, `date_trunc('day', …)`, yıl sınırları) bu
   * dilime göre yapılır; timestamptz değerleri yine mutlak zamandır.
   */
  timeZone?: string;
};

export function createDb(connectionString: string, options: CreateDbOptions = {}) {
  const pool = new pg.Pool({
    connectionString,
    max: options.max ?? 10,
    ...(options.timeZone ? { options: `-c TimeZone=${options.timeZone}` } : {}),
  });
  const db = drizzle(pool, { schema, casing: "snake_case" });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>["db"];

export { schema };
