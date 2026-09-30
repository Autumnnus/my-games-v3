import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * Sunucuda ve ilk (hydration) çiziminde `false`, sonrasında `true`. Saate ya da tarayıcının saat dilimine
 * bağlı metinler ("12 dk önce", "Günaydın") ilk karede sabit bir değerle çizilir; yoksa sunucu ile tarayıcı
 * farklı metin üretir, React de uyuşmazlıkta bütün sayfayı (başlık dahil) baştan kurar.
 */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
