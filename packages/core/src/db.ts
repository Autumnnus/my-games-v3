import { createDb, type Db } from "@my-games/db";
import { databaseConfig } from "./config";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

let instance: ReturnType<typeof createDb> | undefined;

function get() {
  if (!instance) {
    const config = databaseConfig();
    instance = createDb(config.url, { max: config.poolMax, timeZone: config.timeZone });
  }
  return instance;
}

/** Tembel oluşturulan tekil bağlantı havuzu (import anında DB'ye bağlanmaz). */
export const db = new Proxy({} as Db, {
  get: (_, property) => {
    const real = get().db;
    const value = Reflect.get(real, property);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export function pool() {
  return get().pool;
}

export async function closeDb() {
  if (instance) {
    await instance.pool.end();
    instance = undefined;
  }
}
