-- Kullanıcı adı değişikliğinde display_username eski adda kalmıştı; profil linkleri bu alanla kurulur.
UPDATE "user" SET "display_username" = "username"
WHERE "username" IS NOT NULL
  AND ("display_username" IS NULL OR lower("display_username") <> "username");
