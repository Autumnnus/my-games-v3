import type { EstimateIntensity, EstimatePhase } from "@my-games/shared";
import {
  apportion,
  createRandom,
  type DayNumber,
  dayOf,
  hashSeed,
  monthOf,
  monthRange,
  type Random,
  weekdayOf,
} from "./days";

/** Kullanıcının oynama ritmi: gerçek oturumlardan çıkarılır, veri azsa varsayılan kullanılır. */
export type Rhythm = {
  /** Haftanın günlerine göre ağırlık (0 = Pazar), ortalaması 1. */
  weekday: number[];
  /** Bir günde (tüm oyunlar toplamı) makul üst sınır, dakika. */
  dailyCapMin: number;
};

export const DEFAULT_RHYTHM: Rhythm = {
  weekday: [1.3, 0.85, 0.85, 0.85, 0.9, 1.0, 1.25],
  dailyCapMin: 600,
};

/**
 * Yoğunluk parametreleri. `daily`: aktif bir günde tipik süre; `ratio`: fazın günlerinin ne kadarında
 * oynandığı (planlayıcı faz uzunluğunu bununla hesaplar); `stay`: oynanan günün ertesi gün de oynanma
 * olasılığı (seriler: binge ≈ 5 gün, casual ≈ 1–2 gün).
 */
export const INTENSITY: Record<EstimateIntensity, { daily: number; ratio: number; stay: number }> =
  {
    binge: { daily: 170, ratio: 0.7, stay: 0.8 },
    regular: { daily: 110, ratio: 0.35, stay: 0.6 },
    casual: { daily: 75, ratio: 0.12, stay: 0.4 },
  };

/** Bundan kısa günler yazılmaz (süresi diğer günlere dağılır). */
const MIN_DAY_MIN = 10;

export type SynthesisInput = {
  budgetMin: number;
  window: { from: string; to: string };
  phases: readonly EstimatePhase[];
  /** Oynandığı bilinen günler → ağırlık; bu günler mutlaka aktif olur. */
  anchors: ReadonlyMap<DayNumber, number>;
  rhythm: Rhythm;
  seed: number;
};

/**
 * Planı günlük dakikalara çevirir. Saf ve deterministiktir (aynı girdi → aynı çıktı) ve toplam her zaman
 * tam `budgetMin`'dir. Adımlar: faz payları → Markov zinciriyle seri halinde aktif günler (çapa günleri
 * zorunlu) → uzun fazlarda aylık dalga → haftalık ritim × gürültü ağırlıkları → tavanlı dağıtım.
 */
export function synthesize(input: SynthesisInput): Map<DayNumber, number> {
  const result = new Map<DayNumber, number>();
  if (input.budgetMin <= 0) return result;
  const from = dayOf(input.window.from);
  const to = dayOf(input.window.to);
  const random = createRandom(input.seed);

  const phases = input.phases
    .map((phase) => ({
      from: Math.max(from, dayOf(phase.from)),
      to: Math.min(to, dayOf(phase.to)),
      share: Math.max(0, phase.share),
      intensity: phase.intensity,
    }))
    .filter((phase) => phase.from <= phase.to && phase.share > 0);
  // Plan pencereye hiç düşmüyorsa (onarılamamış plan) süre pencerenin sonuna yığılmasın diye yayılır.
  if (phases.length === 0) {
    phases.push({ from, to, share: 1, intensity: "regular" as const });
  }

  const budgets = apportion(
    input.budgetMin,
    phases.map((phase) => phase.share),
  );
  phases.forEach((phase, index) => {
    const minutes = budgets[index] ?? 0;
    if (minutes <= 0) return;
    for (const [day, value] of synthesizePhase(phase, minutes, input, random)) {
      result.set(day, (result.get(day) ?? 0) + value);
    }
  });
  return result;
}

function synthesizePhase(
  phase: { from: DayNumber; to: DayNumber; intensity: EstimateIntensity },
  minutes: number,
  input: SynthesisInput,
  random: Random,
): Map<DayNumber, number> {
  const length = phase.to - phase.from + 1;
  const params = INTENSITY[phase.intensity];
  // Tek bir oyun için günlük tavan: tipik günün üç katı (binge ≈ 8,5 saat), kullanıcı tavanını aşmadan.
  const cap = Math.min(input.rhythm.dailyCapMin, params.daily * 3);
  const season = seasonFactors(length, random);

  // Kaç gün oynandı: tipik günlük süreden; tavanı aşmayacak kadar, fazdan uzun olmayacak kadar.
  const minimum = Math.min(length, Math.max(1, Math.ceil(minutes / cap)));
  const target = Math.min(
    length,
    Math.max(minimum, Math.round(minutes / params.daily)),
    Math.max(1, Math.floor(minutes / MIN_DAY_MIN)),
  );

  const anchorDays = new Set<number>();
  for (const day of input.anchors.keys()) {
    if (day >= phase.from && day <= phase.to) anchorDays.add(day - phase.from);
  }

  // İki durumlu Markov zinciri: durağan oran hedef orana eşitlenir, `stay` seri uzunluğunu belirler.
  const ratio = Math.min(0.95, Math.max(0.01, target / length));
  const stay = Math.max(params.stay, ratio);
  const start = stay >= 1 ? 1 : Math.min(0.95, (ratio * (1 - stay)) / (1 - ratio));
  const active = new Uint8Array(length);
  let playing = random.next() < ratio;
  for (let index = 0; index < length; index++) {
    const factor = season[index] ?? 1;
    playing = random.next() < (playing ? stay : Math.min(0.95, start * factor));
    if (playing || anchorDays.has(index)) active[index] = 1;
  }
  adjustActiveDays(active, target, anchorDays, random);

  const indexes: number[] = [];
  for (let index = 0; index < length; index++) if (active[index]) indexes.push(index);
  const weightOf = (index: number) => {
    const day = phase.from + index;
    const anchor = input.anchors.get(day);
    const boost = anchor === undefined ? 1 : 1.2 + 0.15 * Math.min(anchor, 3);
    return (
      (input.rhythm.weekday[weekdayOf(day)] ?? 1) *
      (season[index] ?? 1) *
      boost *
      Math.exp(0.4 * random.normal())
    );
  };
  let weights = indexes.map(weightOf);
  let amounts = fillWithCap(minutes, weights, cap);
  // Çok kısa kalan (çapa olmayan) günler bırakılır, süreleri kalan günlere dağılır.
  const kept = indexes
    .map((index, position) => ({ index, position }))
    .filter(
      ({ index, position }) => (amounts[position] ?? 0) >= MIN_DAY_MIN || anchorDays.has(index),
    );
  if (kept.length > 0 && kept.length < indexes.length) {
    weights = kept.map(({ position }) => weights[position] ?? 1);
    amounts = fillWithCap(minutes, weights, cap);
    indexes.splice(0, indexes.length, ...kept.map(({ index }) => index));
  }

  const rounded = apportion(minutes, amounts);
  const days = new Map<DayNumber, number>();
  indexes.forEach((index, position) => {
    const value = rounded[position] ?? 0;
    if (value > 0) days.set(phase.from + index, value);
  });
  return days;
}

/**
 * Uzun fazlarda aylar eşit geçmez: biri hızlı (≈ ay), biri yavaş (≈ mevsim) değişen iki AR(1) bileşeninden
 * gün başına çarpan. 90 günden kısa fazlar düz kalır.
 */
function seasonFactors(length: number, random: Random): Float64Array {
  const factors = new Float64Array(length).fill(1);
  if (length <= 90) return factors;
  let fast = random.normal();
  let slow = random.normal();
  for (let block = 0; block * 30 < length; block++) {
    if (block > 0) {
      fast = 0.6 * fast + 0.8 * random.normal();
      slow = 0.92 * slow + 0.39 * random.normal();
    }
    const factor = Math.exp(0.35 * fast + 0.5 * slow);
    for (let index = block * 30; index < Math.min(length, (block + 1) * 30); index++) {
      factors[index] = factor;
    }
  }
  return factors;
}

/** Aktif gün sayısını hedefe çeker: fazlaysa rastgele (çapa olmayan) günler, eksikse serilerin komşuları. */
function adjustActiveDays(
  active: Uint8Array,
  target: number,
  anchors: ReadonlySet<number>,
  random: Random,
) {
  let count = active.reduce((sum, value) => sum + value, 0);
  if (count > target) {
    const removable: number[] = [];
    for (let index = 0; index < active.length; index++) {
      if (active[index] && !anchors.has(index)) removable.push(index);
    }
    shuffle(removable, random);
    for (const index of removable) {
      if (count <= target) break;
      active[index] = 0;
      count--;
    }
    return;
  }
  while (count < target) {
    const candidates: number[] = [];
    for (let index = 0; index < active.length; index++) {
      if (active[index]) continue;
      if (active[index - 1] || active[index + 1]) candidates.push(index);
    }
    if (candidates.length === 0) {
      // Hiç aktif gün yoksa rastgele bir günden başlanır.
      const index = Math.floor(random.next() * active.length);
      active[index] = 1;
      count++;
      continue;
    }
    shuffle(candidates, random);
    // Her turda adayların bir kısmı açılır; seriler büyür ama tek yöne kaymaz.
    const take = Math.min(target - count, Math.max(1, Math.ceil(candidates.length / 2)));
    for (const index of candidates.slice(0, take)) active[index] = 1;
    count += take;
  }
}

function shuffle(items: number[], random: Random) {
  for (let index = items.length - 1; index > 0; index--) {
    const other = Math.floor(random.next() * (index + 1));
    const value = items[index] ?? 0;
    items[index] = items[other] ?? 0;
    items[other] = value;
  }
}

/**
 * Ağırlıklı dağıtım, gün tavanıyla: tavanı aşan günler tavanda kalır, fazlası diğer günlere ağırlıklarıyla
 * geçer. Toplam tavanlara sığmıyorsa artan kısım tüm günlere eşit eklenir (sonuç yine tam `total`).
 */
export function fillWithCap(total: number, weights: readonly number[], cap: number): number[] {
  const result = new Array<number>(weights.length).fill(0);
  const order = weights
    .map((_, index) => index)
    .sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0) || a - b);
  let rest = total;
  let restWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let position = 0;
  for (; position < order.length; position++) {
    const index = order[position] ?? 0;
    const share = restWeight > 0 ? (rest * (weights[index] ?? 0)) / restWeight : 0;
    if (share <= cap) break;
    result[index] = cap;
    rest -= cap;
    restWeight -= weights[index] ?? 0;
  }
  if (position === order.length) {
    const extra = weights.length > 0 ? rest / weights.length : 0;
    return result.map((value) => value + extra);
  }
  for (; position < order.length; position++) {
    const index = order[position] ?? 0;
    result[index] = restWeight > 0 ? (rest * (weights[index] ?? 0)) / restWeight : 0;
  }
  return result;
}

export type EntryDays = {
  entryId: string;
  days: Map<DayNumber, number>;
  /** Günlük taşımada önce denenen aralıklar (planın fazları). */
  ranges: ReadonlyArray<readonly [DayNumber, DayNumber]>;
  /** Sürenin asla çıkamayacağı aralık (tahmin penceresi). */
  window: readonly [DayNumber, DayNumber];
  /** Kesin oynanan günler (ekran görüntüsü, başarım, bitirme…); taşımalarda boşaltılmaz. */
  fixed: ReadonlySet<DayNumber>;
  /**
   * Taşımada öncelik: yüksek olan önce taşınır. Zamanı zaten belirsiz olan (yıllara yayılan) oyunlar önce
   * kayar; bitirme tarihine bağlı kampanyalar yerinde kalır.
   */
  flexibility?: number;
};

/**
 * Bir ayın toplam yük sınırı: günlük tavanın ortalama %45'i (varsayılanla günde ~4,5 saat). Günlük tavan tek
 * bir günün, bu bir dönemin sınırıdır: aynı aylara sıkışan kampanyalar (ör. aynı yıl bitirilmiş onlarca
 * oyun) daha erken başlamış ve daha sakin oynanmış sayılır.
 */
export const monthlyCapOf = (rhythm: Rhythm) => Math.round(rhythm.dailyCapMin * 30 * 0.45);

/** Kesin bir günde, taşımalardan sonra en az bu kadar kalır. */
const KEEP_ON_FIXED_MIN = 30;

/**
 * Kullanıcı düzeyinde uzlaştırma. Oyunlar ayrı ayrı üretildiği için aynı aylara/günlere yığılabilirler:
 * 1. Aylık yükü aşan ayların fazlası, oyunun penceresi içinde önce geriye (daha önceki aylara), yer yoksa
 *    ileriye taşınır.
 * 2. Günlük tavanı aşan günlerin fazlası en yakın boş günlere taşınır (önce planın fazları, sonra pencere).
 * Her oyunun toplamı değişmez; sıralar ve tohumlar sabit olduğu için sonuç deterministiktir.
 */
export function reconcile(
  entries: readonly EntryDays[],
  capacity: { dailyCapMin: number; monthlyCapMin: number },
) {
  const dayTotals = new Map<DayNumber, number>();
  const monthTotals = new Map<number, number>();
  const add = (entry: EntryDays, day: DayNumber, delta: number) => {
    if (delta === 0) return;
    const next = (entry.days.get(day) ?? 0) + delta;
    if (next > 0) entry.days.set(day, next);
    else entry.days.delete(day);
    dayTotals.set(day, (dayTotals.get(day) ?? 0) + delta);
    const month = monthOf(day);
    monthTotals.set(month, (monthTotals.get(month) ?? 0) + delta);
  };
  for (const entry of entries) {
    for (const [day, minutes] of entry.days) {
      dayTotals.set(day, (dayTotals.get(day) ?? 0) + minutes);
      const month = monthOf(day);
      monthTotals.set(month, (monthTotals.get(month) ?? 0) + minutes);
    }
  }
  const movableOf = (entry: EntryDays, day: DayNumber, minutes: number) =>
    Math.max(0, minutes - (entry.fixed.has(day) ? Math.min(minutes, KEEP_ON_FIXED_MIN) : 0));
  const byId = (a: EntryDays, b: EntryDays) => a.entryId.localeCompare(b.entryId);
  // Her ayın sınırı ±%15 oynar (deterministik): dolu aylar grafikte dümdüz bir tavan çizmesin.
  const monthCaps = new Map<number, number>();
  const monthCap = (month: number) => {
    let cap = monthCaps.get(month);
    if (cap === undefined) {
      cap = Math.round(
        capacity.monthlyCapMin * (0.85 + 0.3 * createRandom(hashSeed(`cap:${month}`)).next()),
      );
      monthCaps.set(month, cap);
    }
    return cap;
  };
  let moved = 0;

  /** Bir aya `amount` dakika yerleştirir: günlere ~1,5–3 saatlik parçalar, günlük tavanı aşmadan. */
  const placeInMonth = (entry: EntryDays, month: number, amount: number, random: Random) => {
    const [start, end] = monthRange(month);
    const from = Math.max(start, entry.window[0]);
    const to = Math.min(end, entry.window[1]);
    if (from > to) return 0;
    const own: DayNumber[] = [];
    const other: DayNumber[] = [];
    for (let day = from; day <= to; day++) (entry.days.has(day) ? own : other).push(day);
    shuffle(other, random);
    // Önce oyunun o ay zaten oynandığı günler (seriler korunur), sonra diğer günler.
    const order = [...own, ...other];
    let placed = 0;
    for (let pass = 0; pass < 3 && placed < amount; pass++) {
      for (const day of order) {
        if (placed >= amount) break;
        const room = capacity.dailyCapMin - (dayTotals.get(day) ?? 0);
        const chunk = Math.min(amount - placed, room, 90 + Math.floor(random.next() * 90));
        if (chunk < Math.min(15, amount - placed)) continue;
        add(entry, day, chunk);
        placed += chunk;
      }
    }
    return placed;
  };

  const crowdedMonths = [...monthTotals]
    .filter(([month, total]) => total > monthCap(month))
    .map(([month]) => month)
    .sort((a, b) => b - a);
  for (const month of crowdedMonths) {
    let excess = (monthTotals.get(month) ?? 0) - monthCap(month);
    if (excess <= 0) continue;
    const [start, end] = monthRange(month);
    const contributors = entries
      .map((entry) => {
        const days: Array<[DayNumber, number]> = [];
        for (let day = start; day <= end; day++) {
          const minutes = entry.days.get(day);
          if (minutes) days.push([day, minutes]);
        }
        return { entry, days, minutes: days.reduce((sum, [, value]) => sum + value, 0) };
      })
      .filter((item) => item.minutes > 0)
      .sort(
        (a, b) =>
          (b.entry.flexibility ?? 0) - (a.entry.flexibility ?? 0) ||
          b.minutes - a.minutes ||
          byId(a.entry, b.entry),
      );
    for (const { entry, days } of contributors) {
      if (excess <= 0) break;
      const movable = days.map(([day, minutes]) => movableOf(entry, day, minutes));
      const take = Math.min(
        excess,
        movable.reduce((sum, value) => sum + value, 0),
      );
      if (take < 30) continue;
      const removal = apportion(take, movable);
      days.forEach(([day], index) => {
        add(entry, day, -(removal[index] ?? 0));
      });
      const random = createRandom(hashSeed(`${entry.entryId}:${month}`));
      // Hedef aylar: önce planın fazlarına denk gelen aylar (en yakın, eşitlikte önce geçmiş), sonra
      // pencerenin kalanı: önce geriye (oyun daha erken başlamış, daha sakin oynanmış), yer yoksa ileriye.
      const window: number[] = [];
      for (let target = month - 1; target >= monthOf(entry.window[0]); target--)
        window.push(target);
      for (let target = month + 1; target <= monthOf(entry.window[1]); target++)
        window.push(target);
      const inPhases = (target: number) =>
        entry.ranges.some(([from, to]) => monthOf(from) <= target && target <= monthOf(to));
      const targets = [
        ...window
          .filter(inPhases)
          .sort((a, b) => Math.abs(a - month) - Math.abs(b - month) || a - b),
        ...window.filter((target) => !inPhases(target)),
      ];
      let remaining = take;
      for (const target of targets) {
        if (remaining <= 0) break;
        const room = monthCap(target) - (monthTotals.get(target) ?? 0);
        if (room < 60) continue;
        remaining -= placeInMonth(entry, target, Math.min(room, remaining), random);
      }
      // Pencerede yer kalmadıysa kalan kendi ayına geri döner.
      if (remaining > 0) {
        const back = apportion(remaining, removal);
        days.forEach(([day], index) => {
          add(entry, day, back[index] ?? 0);
        });
      }
      excess -= take - remaining;
      moved += take - remaining;
    }
  }

  const contributorsOf = (day: DayNumber) =>
    entries
      .filter((entry) => entry.days.has(day))
      .sort((a, b) => (b.days.get(day) ?? 0) - (a.days.get(day) ?? 0) || byId(a, b));
  const crowdedDays = [...dayTotals]
    .filter(([, total]) => total > capacity.dailyCapMin)
    .map(([day]) => day)
    .sort((a, b) => a - b);
  for (const day of crowdedDays) {
    let excess = (dayTotals.get(day) ?? 0) - capacity.dailyCapMin;
    for (const entry of contributorsOf(day)) {
      if (excess <= 0) break;
      let movable = Math.min(excess, movableOf(entry, day, entry.days.get(day) ?? 0));
      const inRanges = (target: DayNumber) =>
        entry.ranges.some(([start, end]) => target >= start && target <= end);
      // Önce planın fazları içinde, sonra tüm pencerede en yakın boş gün (eşit uzaklıkta geriye öncelik).
      for (const preferRanges of [true, false]) {
        for (let offset = 1; offset <= 400 && movable > 0; offset++) {
          for (const target of [day - offset, day + offset]) {
            if (movable <= 0) break;
            if (target < entry.window[0] || target > entry.window[1]) continue;
            if (preferRanges && !inRanges(target)) continue;
            const room = capacity.dailyCapMin - (dayTotals.get(target) ?? 0);
            // Yeni bir güne birkaç dakikalık kırıntı yazılmaz.
            if (room < Math.min(movable, 15)) continue;
            const amount = Math.min(room, movable);
            add(entry, day, -amount);
            add(entry, target, amount);
            movable -= amount;
            excess -= amount;
            moved += amount;
          }
        }
      }
    }
  }
  return { moved };
}
