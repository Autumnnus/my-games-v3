// Metin kontrollerinin (Input, Textarea, SelectTrigger, Input grubu) ortak görünümü; hepsi aynı yüzeyde dursun.

/** Dolgu, ince kenar ve üstte hafif ışık: hem düz kartta hem cam yüzeyde okunur. */
export const controlSurface =
  "rounded-[14px] border border-white/10 bg-white/[0.04] text-foreground shadow-[inset_0_1px_0_0_rgb(255_255_255/0.03)] transition-[color,background-color,border-color,box-shadow,opacity] duration-150 ease-(--ease-salon)"

export const controlHover = "enabled:hover:border-white/[0.16] enabled:hover:bg-white/[0.05]"

export const controlFocus =
  "outline-none focus-visible:border-white/30 focus-visible:bg-white/[0.06] focus-visible:ring-4 focus-visible:ring-white/[0.08]"

export const controlInvalid =
  "aria-invalid:border-destructive/60 aria-invalid:enabled:hover:border-destructive/75 aria-invalid:focus-visible:border-destructive/80 aria-invalid:focus-visible:ring-destructive/15"

export const controlDisabled = "disabled:cursor-not-allowed disabled:opacity-50"

/** Yazı alanı içi: yer tutucu, seçim rengi, koyu yerel parçalar (takvim simgesi, kaydırma çubuğu). */
export const controlText =
  "text-base [color-scheme:dark] selection:bg-white/20 placeholder:text-foreground/35 md:text-sm"

/**
 * Tarayıcı otomatik doldurmasının açık zemini: UA stili `!important` olduğundan ezilemez; geçiş gecikmesi
 * zemini eski hâlinde tutar (hareket azaltma kuralı süreyi kısaltır, gecikmeyi değil).
 */
export const controlAutofill = "autofill:transition-[background-color] autofill:delay-[99999s]"
