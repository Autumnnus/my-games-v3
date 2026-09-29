/**
 * Yüklenen avatarların 128 px'lik kopyası; küçük avatarlarda (akış, yorumlar, menü) 512 px'lik asıl görsel
 * yerine bu indirilir. Adres düzeni sunucuda sabit: `…/users/{id}/avatar/{assetId}/full.{ext}`.
 * Dış adresler (Steam, Google) olduğu gibi döner.
 */
export function avatarThumb(url: string | null | undefined) {
  return url?.replace(/(\/users\/[^/]+\/avatar\/[0-9a-f-]{36}\/)full\.(avif|webp)$/, "$1thumb.$2");
}
