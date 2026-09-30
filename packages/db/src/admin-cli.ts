import pg from "pg";

/**
 * Admin yetkisi yalnızca sunucudan, bu komutla verilir ve alınır. Web arayüzünde rol değiştirme yok: bir admin
 * oturumu ele geçirilse bile yeni admin yaratılamaz.
 *
 *   node db/dist/admin.mjs grant <e-posta|kullanıcı adı>    (production imajında)
 *   pnpm admin grant <e-posta|kullanıcı adı>                (yerelde)
 *   … revoke <e-posta|kullanıcı adı>
 *   … list
 */
const [command, target] = process.argv.slice(2).filter((arg) => arg !== "--");

function usage(): never {
  console.error("Kullanım: admin <grant|revoke> <e-posta|kullanıcı adı>  |  admin list");
  process.exit(1);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL tanımlı değil");
  if (command !== "list" && command !== "grant" && command !== "revoke") usage();
  if (command !== "list" && !target) usage();

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    if (command === "list") {
      const { rows } = await client.query(
        `select email, display_username, email_verified, banned from "user" where role = 'admin' order by created_at`,
      );
      if (rows.length === 0) console.log("Admin yok.");
      for (const row of rows) {
        console.log(
          `${row.email}  @${row.display_username ?? "-"}${row.email_verified ? "" : "  (e-posta doğrulanmamış)"}${row.banned ? "  (banlı)" : ""}`,
        );
      }
      return;
    }

    const lookup = String(target).replace(/^@/, "").toLowerCase();
    const { rows } = await client.query(
      `select id, email, display_username, role, email_verified from "user"
       where lower(email) = $1 or lower(username) = $1`,
      [lookup],
    );
    if (rows.length === 0) throw new Error(`Kullanıcı bulunamadı: ${target}`);
    if (rows.length > 1)
      throw new Error(`Birden fazla eşleşme var, e-posta ile deneyin: ${target}`);
    const user = rows[0];
    if (command === "grant" && !user.email_verified) {
      throw new Error("E-postası doğrulanmamış hesaba admin yetkisi verilmez.");
    }

    const role = command === "grant" ? "admin" : "user";
    await client.query("begin");
    await client.query(`update "user" set role = $2, updated_at = now() where id = $1`, [
      user.id,
      role,
    ]);
    await client.query(
      `insert into admin_audit (admin_name, action, target_type, target_id, target_label)
       values ('cli', $1, 'user', $2, $3)`,
      [
        command === "grant" ? "role.grant" : "role.revoke",
        user.id,
        user.display_username ? `@${user.display_username}` : user.email,
      ],
    );
    await client.query("commit");
    console.log(
      command === "grant"
        ? `${user.email} artık admin. Panel: /admin (açık oturumda en geç 5 dakika içinde görünür).`
        : `${user.email} admin değil. Yönetim API'si erişimi hemen kapandı.`,
    );
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`[admin] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
