import { schema } from "@my-games/db";
import { eq } from "drizzle-orm";
import { db } from "../db";

/**
 * Yetkinin tek kaynağı veritabanı. Oturum çerezi rolü 5 dakikaya kadar önbelleklediği için admin işlemlerinde
 * rol her istekte buradan okunur: yetki sunucudan kaldırılınca (ya da hesap banlanınca) anında düşer.
 */
export async function isAdmin(userId: string) {
  const [row] = await db
    .select({ role: schema.user.role, banned: schema.user.banned })
    .from(schema.user)
    .where(eq(schema.user.id, userId));
  return row?.role === "admin" && row.banned !== true;
}
