/**
 * Bir sağlayıcının API anahtar havuzu. Sağlayıcıdan bağımsızdır: hangi hatanın ne anlama geldiğine
 * sağlayıcı adaptörü karar verir (`FailureVerdict`), havuz yalnızca anahtarların durumunu tutar.
 *
 * - Bekleme model başınadır: Gemini gibi sağlayıcılarda kota proje × model başına işler; bir anahtar
 *   ana modelde dolmuşken yedek modelde hâlâ kullanılabilir.
 * - Kimlik hatası (geçersiz/iptal edilmiş anahtar) anahtarı tüm modellerde uzun süre devre dışı bırakır.
 * - Durum bellekte tutulur (süreç başına); yeniden başlatınca bütün anahtarlar yeniden denenir.
 */

export type FailureKind =
  /** Hız ya da kota sınırı (429). Anahtar bu modelde bir süre dinlenir. */
  | "rate_limit"
  /** Anahtar geçersiz, iptal edilmiş ya da yetkisiz. */
  | "auth"
  /** Sağlayıcı tarafında geçici sorun (5xx, aşırı yük, ağ). */
  | "server"
  /** İsteğin kendisiyle ilgili hata (ör. geçersiz istek); başka anahtarla denemek anlamsız. */
  | "fatal";

export type FailureVerdict = {
  kind: FailureKind;
  /** Sağlayıcının önerdiği bekleme (Retry-After, RetryInfo). */
  retryAfterMs?: number;
  /** Günlük kota bitti: ertesi kota gününe kadar beklenir. */
  daily?: boolean;
  message?: string;
};

export type KeyStrategy = "round_robin" | "failover";

/** Havuza giren anahtar. `ref` yönetim ekranının satırla eşleştirdiği kimlik (`db:<id>`, `env:<n>`). */
export type PoolKey = { key: string; label?: string; ref?: string };

type Slot = {
  index: number;
  key: string;
  ref: string;
  /** Loglarda ve yönetim ekranında görünen, anahtarı açık etmeyen ad. */
  label: string;
  /** Model → bu zamana kadar dinlenir (ms). */
  cooling: Map<string, number>;
  disabledUntil: number;
  /** Art arda başarısızlık (bekleme süresi bununla büyür). */
  streak: number;
  ok: number;
  failed: number;
  lastUsedAt: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
};

export type KeySnapshot = {
  ref: string;
  label: string;
  state: "ready" | "cooling" | "disabled";
  /** Dinlenen/devre dışı kalan anahtarın yeniden deneneceği an. */
  until: string | null;
  coolingModels: Array<{ model: string; until: string }>;
  ok: number;
  failed: number;
  lastUsedAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
};

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/** Anahtar geçersizse bu kadar süre hiç denenmez (panelden silip yeniden eklemek ya da yeniden başlatmak sıfırlar). */
const AUTH_DISABLE_MS = 6 * HOUR;
const MAX_RATE_LIMIT_MS = 30 * MINUTE;

/** Anahtarın ilk 4 ve son 4 karakteri; aynı anahtarlar ayırt edilsin ama sızmasın. */
export function maskKey(key: string) {
  if (key.length <= 10) return "…";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/**
 * Pasifik saatiyle bir sonraki gece yarısı. Gemini'nin günlük kotaları bu saatte sıfırlanır; diğer
 * sağlayıcılar için de makul bir üst sınırdır.
 */
export function nextQuotaReset(now: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(now));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const elapsed = ((value("hour") % 24) * 3600 + value("minute") * 60 + value("second")) * SECOND;
  // Birkaç dakika pay: sıfırlama anında ilk istekler hâlâ reddedilebiliyor.
  return now + (24 * HOUR - elapsed) + 5 * MINUTE;
}

export class KeyPool {
  readonly provider: string;
  readonly strategy: KeyStrategy;
  private readonly slots: Slot[];
  private readonly now: () => number;
  private cursor = 0;

  constructor(
    provider: string,
    keys: Array<string | PoolKey>,
    options: { strategy?: KeyStrategy; now?: () => number } = {},
  ) {
    this.provider = provider;
    this.strategy = options.strategy ?? "round_robin";
    this.now = options.now ?? Date.now;
    this.slots = keys.map((entry, index) => {
      const { key, label, ref } = typeof entry === "string" ? { key: entry } : entry;
      return {
        index,
        key,
        ref: ref ?? `#${index + 1}`,
        label: label ?? `#${index + 1} ${maskKey(key)}`,
        cooling: new Map(),
        disabledUntil: 0,
        streak: 0,
        ok: 0,
        failed: 0,
        lastUsedAt: null,
        lastError: null,
        lastErrorAt: null,
      };
    });
  }

  /**
   * Anahtar listesi değişince (panelden ekleme/kapatma) yeni havuz kurulur; aynı anahtarların durumu
   * (dinlenme, devre dışı, sayaçlar) eskisinden taşınır ki dolmuş anahtar hemen yeniden denenmesin.
   */
  inherit(previous: KeyPool) {
    const old = new Map(previous.slots.map((slot) => [slot.key, slot]));
    for (const slot of this.slots) {
      const match = old.get(slot.key);
      if (!match) continue;
      slot.cooling = new Map(match.cooling);
      slot.disabledUntil = match.disabledUntil;
      slot.streak = match.streak;
      slot.ok = match.ok;
      slot.failed = match.failed;
      slot.lastUsedAt = match.lastUsedAt;
      slot.lastError = match.lastError;
      slot.lastErrorAt = match.lastErrorAt;
    }
    return this;
  }

  get size() {
    return this.slots.length;
  }

  private available(slot: Slot, model: string, at: number) {
    return slot.disabledUntil <= at && (slot.cooling.get(model) ?? 0) <= at;
  }

  /**
   * Bu model için kullanılabilir bir anahtar verir; `exclude` bu istekte zaten denenmiş olanlardır.
   * `round_robin` sıradaki anahtardan başlar, `failover` her zaman ilk sağlam anahtarı seçer.
   */
  acquire(model: string, exclude: ReadonlySet<number> = new Set()) {
    const at = this.now();
    const count = this.slots.length;
    const start = this.strategy === "round_robin" ? this.cursor : 0;
    for (let offset = 0; offset < count; offset++) {
      const slot = this.slots[(start + offset) % count];
      if (!slot || exclude.has(slot.index) || !this.available(slot, model, at)) continue;
      if (this.strategy === "round_robin") this.cursor = (slot.index + 1) % count;
      slot.lastUsedAt = at;
      return { index: slot.index, key: slot.key, label: slot.label };
    }
    return null;
  }

  /** Durumu değiştirmeden ilk anahtar (anahtardan bağımsız model bilgisi okumak için). */
  peek() {
    const slot = this.slots[0];
    return slot ? { index: slot.index, key: slot.key, label: slot.label } : null;
  }

  succeed(index: number, model: string) {
    const slot = this.slots[index];
    if (!slot) return;
    slot.ok++;
    slot.streak = 0;
    slot.cooling.delete(model);
  }

  /** Başarısızlığı kaydeder ve anahtarın ne kadar dinleneceğini döner (ms). */
  fail(index: number, model: string, verdict: FailureVerdict) {
    const slot = this.slots[index];
    if (!slot) return 0;
    const at = this.now();
    slot.failed++;
    slot.streak++;
    slot.lastError = verdict.message?.slice(0, 300) ?? verdict.kind;
    slot.lastErrorAt = at;

    let wait = 0;
    switch (verdict.kind) {
      case "rate_limit": {
        if (verdict.daily) {
          wait = nextQuotaReset(at) - at;
        } else {
          // Sağlayıcı süre verdiyse ona uyulur; vermediyse art arda dolan anahtar giderek daha uzun dinlenir.
          const suggested = verdict.retryAfterMs ?? MINUTE * 2 ** Math.min(slot.streak - 1, 5);
          wait = Math.min(Math.max(suggested, SECOND), MAX_RATE_LIMIT_MS);
        }
        slot.cooling.set(model, at + wait);
        break;
      }
      case "auth":
        wait = AUTH_DISABLE_MS;
        slot.disabledUntil = at + wait;
        break;
      case "server":
        wait = Math.min(verdict.retryAfterMs ?? 2 * SECOND * slot.streak, 30 * SECOND);
        slot.cooling.set(model, at + wait);
        break;
      case "fatal":
        break;
    }
    return wait;
  }

  /** Bu modelde en erken ne zaman bir anahtar boşalır (hiç anahtar yoksa `null`). */
  nextAvailableAt(model: string) {
    const at = this.now();
    let earliest: number | null = null;
    for (const slot of this.slots) {
      const until = Math.max(slot.disabledUntil, slot.cooling.get(model) ?? 0);
      if (until <= at) return at;
      if (earliest === null || until < earliest) earliest = until;
    }
    return earliest;
  }

  snapshot(): KeySnapshot[] {
    const at = this.now();
    const iso = (value: number | null) => (value ? new Date(value).toISOString() : null);
    return this.slots.map((slot) => {
      const coolingModels = [...slot.cooling.entries()]
        .filter(([, until]) => until > at)
        .map(([model, until]) => ({ model, until: new Date(until).toISOString() }));
      const disabled = slot.disabledUntil > at;
      const coolest = coolingModels.reduce<number | null>((min, item) => {
        const value = Date.parse(item.until);
        return min === null || value < min ? value : min;
      }, null);
      return {
        ref: slot.ref,
        label: slot.label,
        state: disabled ? "disabled" : coolingModels.length > 0 ? "cooling" : "ready",
        until: disabled ? iso(slot.disabledUntil) : iso(coolest),
        coolingModels,
        ok: slot.ok,
        failed: slot.failed,
        lastUsedAt: iso(slot.lastUsedAt),
        lastError: slot.lastError,
        lastErrorAt: iso(slot.lastErrorAt),
      };
    });
  }
}
