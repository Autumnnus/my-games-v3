import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { credentialsSecret } from "./config";

/**
 * Platform token'larını (PSN/Xbox yenileme token'ı) AES-256-GCM ile şifreler. Anahtar, sunucu sırrından
 * HKDF ile türetilir; veritabanı sızsa bile token'lar okunamaz.
 */
const VERSION = "v1";

function key() {
  return Buffer.from(
    hkdfSync("sha256", credentialsSecret(), "my-games", "platform-credentials", 32),
  );
}

export function encryptCredentials(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
}

export function decryptCredentials<T>(payload: string): T {
  const [version, encoded] = payload.split(":");
  if (version !== VERSION || !encoded) throw new Error("Bilinmeyen kimlik bilgisi biçimi");
  const raw = Buffer.from(encoded, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString(
    "utf8",
  );
  return JSON.parse(text) as T;
}
