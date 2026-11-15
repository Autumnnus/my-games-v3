/**
 * Yayın sürümü. CI her başarılı main deploy'unda bir artan tam sayı üretir (son `vN` etiketi + 1, ilk sürüm 1),
 * imaja `APP_VERSION`/`APP_RELEASED_AT`/`APP_COMMIT` olarak yazar ve deploy'dan sonra `vN` etiketini atar.
 * Yerel geliştirmede değişkenler yoktur; sürüm `null` döner (arayüz "dev" gösterir).
 */
export type AppVersion = {
  number: number | null;
  releasedAt: string | null;
  commit: string | null;
};

export function appVersion(): AppVersion {
  const number = Number(process.env.APP_VERSION?.trim());
  const releasedAt = process.env.APP_RELEASED_AT?.trim();
  const commit = process.env.APP_COMMIT?.trim();
  return {
    number: Number.isInteger(number) && number > 0 ? number : null,
    releasedAt: releasedAt && !Number.isNaN(Date.parse(releasedAt)) ? releasedAt : null,
    commit: commit ? commit.slice(0, 7) : null,
  };
}
