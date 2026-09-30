import type {
  EntryStatus,
  EstimateHint,
  EstimateIntensity,
  EstimatePhase,
  EstimatePlan,
} from "@my-games/shared";
import { type DayNumber, dayOf, isoOf, monthRange } from "./days";
import { INTENSITY } from "./synthesize";

/**
 * Bir kaydın takipten önceki geçmişine dair bildiğimiz her şey (saf veri; DB'den `evidence.ts` toplar).
 * Tarihler `YYYY-MM-DD`; yalnızca pencere içindeki kanıtlar tutulur.
 */
export type Evidence = {
  entryId: string;
  name: string;
  /** Dağıtılacak süre (dakika). */
  budgetMin: number;
  window: { from: string; to: string };
  /**
   * Takibin başladığı gün: tahmin (kullanıcının düzeltmesi dahil) bundan önceye yazılır. Yalnızca elle/eski
   * sistemden gelen süre için yok (kullanıcı dönemi dünden önceye kadar seçebilir).
   */
  trackedFrom: string | null;
  status: EntryStatus;
  releaseDate: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  /** Takip başlamadan önceki son oynama. */
  lastPlayedAt: string | null;
  /** Kütüphaneye eklendiği gün (toplu içe aktarım günleri hariç). */
  addedAt: string | null;
  /** IGDB "normal" bitirme süresi (dakika). */
  ttbMin: number | null;
  genres: string[];
  multiplayer: boolean;
  /** Katalogda tanınan bir oyun mu (tanınmayan uzun süreler çoğu zaman araçtır). */
  catalogued: boolean;
  /** [gün, ağırlık]: o gün açılan başarımlar (toplu/geriye dönük açılımlar düşük ağırlıklı). */
  achievements: Array<[string, number]>;
  /** [gün, adet]: o gün çekilen ekran görüntüleri. */
  screenshots: Array<[string, number]>;
};

/** Planın kaynağına göre AI'ya ne zaman sorulacağı: uzun ve belirsiz oyunlar. */
export const AI_MIN_BUDGET_MIN = 5 * 60;
export const AI_MAX_CONFIDENCE = 0.5;

const SAMPLED_MAX_MIN = 3 * 60;
/** Bu kadar günden uzun boşluk, oyuna ayrı bir dönüştür. */
const CLUSTER_GAP_DAYS = 45;
/** Hiçbir alt sınır bilinmiyorsa pencere en fazla bu kadar geriye gider. */
const MAX_SPAN_DAYS = 15 * 365;
const FLOOR_DAY = dayOf("1995-01-01");

/**
 * Tahminin yazılabileceği aralık. Üst sınır takibin başladığı günden (ufuk) öncedir ve biliniyorsa son
 * oynama günüdür; alt sınır çıkış tarihi (kanıt daha eskiyse kanıt: erken erişim) ve başlama tarihidir.
 */
export function computeWindow(input: {
  horizonDay: DayNumber;
  releaseDate: string | null;
  startedAt: string | null;
  lastPlayedAt: string | null;
  evidenceDays: readonly DayNumber[];
}): { from: DayNumber; to: DayNumber } {
  const maxTo = input.horizonDay - 1;
  const evidence = input.evidenceDays.filter((day) => day <= maxTo && day >= FLOOR_DAY);
  const earliest = evidence.length ? Math.min(...evidence) : null;
  const latest = evidence.length ? Math.max(...evidence) : null;

  const lastPlayed = input.lastPlayedAt ? dayOf(input.lastPlayedAt) : null;
  let to = lastPlayed !== null && lastPlayed <= maxTo ? lastPlayed : maxTo;
  if (latest !== null) to = Math.max(to, latest);

  let from = input.releaseDate ? dayOf(input.releaseDate) : null;
  if (from !== null && from > to) from = null; // çıkış tarihi son oynamadan sonra: tarih güvenilmez
  const started = input.startedAt ? dayOf(input.startedAt) : null;
  if (started !== null && started <= to) from = Math.max(from ?? started, started);
  // Kanıt alt sınır değildir (oyuna ondan önce başlanmış olabilir); yalnızca çıkıştan önceyse (erken
  // erişim) çıkış tarihinin yerine geçer.
  if (earliest !== null && from !== null && earliest < from) from = earliest;
  if (from === null) from = to - MAX_SPAN_DAYS;
  from = Math.max(FLOOR_DAY, Math.min(from, to));
  return { from, to };
}

type Anchor = {
  day: DayNumber;
  weight: number;
  /** Ekran görüntüsü ya da başarım: güveni artırır. */
  strong: boolean;
  /** Oynandığı kesin gün (eklenme günü hariç her kanıt); her plan bu günleri kapsamalı. */
  certain: boolean;
};

/** Oynandığı bilinen günler; aynı günün kanıtları toplanır. */
export function anchorsOf(evidence: Evidence): Anchor[] {
  const from = dayOf(evidence.window.from);
  const to = dayOf(evidence.window.to);
  const byDay = new Map<DayNumber, Anchor>();
  const add = (iso: string | null, weight: number, strong: boolean, certain = true) => {
    if (!iso) return;
    const day = dayOf(iso);
    if (day < from || day > to) return;
    const current = byDay.get(day);
    if (current) {
      current.weight += weight;
      current.strong ||= strong;
      current.certain ||= certain;
    } else byDay.set(day, { day, weight, strong, certain });
  };
  for (const [day, count] of evidence.screenshots) {
    add(day, Math.min(3, 1 + 0.25 * (count - 1)), true);
  }
  for (const [day, weight] of evidence.achievements) add(day, Math.min(3, weight), true);
  add(evidence.finishedAt, 2, false);
  add(evidence.lastPlayedAt, 0.6, false);
  // Kütüphaneye eklendiği gün oynamış olması muhtemel ama kesin değil.
  add(evidence.addedAt, 0.5, false, false);
  return [...byDay.values()].sort((a, b) => a.day - b.day);
}

export function anchorMap(evidence: Evidence) {
  return new Map(anchorsOf(evidence).map((anchor) => [anchor.day, anchor.weight]));
}

/** Oynandığı kesin bilinen günler (eklenme günü hariç her kanıt). */
export function certainDays(evidence: Evidence) {
  return new Set(
    anchorsOf(evidence)
      .filter((anchor) => anchor.certain)
      .map((anchor) => anchor.day),
  );
}

/** Oyunun yıllara yayılan bir oyun olup olmadığı (çok oyunculu, strateji, süre bitirme süresinin katları). */
export function isLongRunning(evidence: Evidence) {
  const hours = evidence.budgetMin / 60;
  if (evidence.ttbMin) {
    const ttbHours = evidence.ttbMin / 60;
    return (
      hours > Math.max(3 * ttbHours, 60) ||
      (evidence.multiplayer && hours > Math.max(2 * ttbHours, 40))
    );
  }
  return evidence.multiplayer ? hours > 40 : hours > 120;
}

type Cluster = { from: DayNumber; to: DayNumber; weight: number; finished: boolean };

function clusterAnchors(anchors: readonly Anchor[], finishedDay: DayNumber | null): Cluster[] {
  const clusters: Cluster[] = [];
  for (const anchor of anchors) {
    const last = clusters.at(-1);
    if (last && anchor.day - last.to <= CLUSTER_GAP_DAYS) {
      last.to = anchor.day;
      last.weight += anchor.weight;
      last.finished ||= anchor.day === finishedDay;
    } else {
      clusters.push({
        from: anchor.day,
        to: anchor.day,
        weight: anchor.weight,
        finished: anchor.day === finishedDay,
      });
    }
  }
  return clusters;
}

/** Bir süreyi verilen yoğunlukla oynamak için gereken takvim günü. */
const daysFor = (minutes: number, intensity: EstimateIntensity) =>
  Math.max(1, Math.ceil(minutes / (INTENSITY[intensity].daily * INTENSITY[intensity].ratio)));

/** `[from, to]`'yu pencere içinde `length` güne genişletir; biri sınıra dayanırsa diğer yöne uzar. */
function widen(
  range: { from: DayNumber; to: DayNumber },
  length: number,
  bounds: { from: DayNumber; to: DayNumber },
  backwardShare = 0.75,
) {
  const missing = length - (range.to - range.from + 1);
  if (missing <= 0) return { from: range.from, to: range.to };
  let from = range.from - Math.ceil(missing * backwardShare);
  let to = range.to + Math.floor(missing * (1 - backwardShare));
  if (from < bounds.from) {
    to = Math.min(bounds.to, to + (bounds.from - from));
    from = bounds.from;
  }
  if (to > bounds.to) {
    from = Math.max(bounds.from, from - (to - bounds.to));
    to = bounds.to;
  }
  return { from, to };
}

/** Çakışan fazları birleştirir (paylar toplanır; yoğunluk en yoğun olanınki). */
function mergePhases(phases: EstimatePhase[]): EstimatePhase[] {
  const rank: Record<EstimateIntensity, number> = { binge: 2, regular: 1, casual: 0 };
  const sorted = [...phases].sort((a, b) => a.from.localeCompare(b.from));
  const merged: EstimatePhase[] = [];
  for (const phase of sorted) {
    const last = merged.at(-1);
    if (last && last.intensity === phase.intensity && phase.from <= last.to) {
      if (phase.to > last.to) last.to = phase.to;
      last.share += phase.share;
      if (rank[phase.intensity] > rank[last.intensity]) last.intensity = phase.intensity;
    } else merged.push({ ...phase });
  }
  return merged;
}

/**
 * AI'nın oyun bilgisinden gelen ipuçları. AI tarih geometrisi kurmaz: ne tür bir oyun olduğunu, gerçek
 * çıkış tarihini ve saatlerin gittiği dönemleri söyler; fazları yine bu planlayıcı kurar.
 */
export type PlanHints = {
  /** Yıllara yayılan bir oyun mu; verilmezse kurallarla bulunur. */
  longRunning?: boolean;
  /** Katalogda olmayan ya da eksik çıkış tarihi; pencerenin alt sınırını daraltır. */
  releaseDate?: string | null;
  /** Saatlerin çoğunun gittiği dönemler: ana oynanış, büyük eklenti/güncelleme dönüşleri. */
  periods?: ReadonlyArray<{ from: string; to: string }>;
};

/** Bundan uzun kümeler yoğun seri değil, düzenli oynanış sayılır. */
const LONG_CLUSTER_DAYS = 120;

/** Bir AI döneminin ağırlığı: birkaç kanıt günü kadar; çok sayıda ekran görüntüsünün önüne geçmez. */
const HINT_WEIGHT = 3;

/** Birbirine yakın (ya da çakışan) kümeleri birleştirir. */
function mergeClusters(clusters: Cluster[]): Cluster[] {
  const merged: Cluster[] = [];
  for (const cluster of [...clusters].sort((a, b) => a.from - b.from)) {
    const last = merged.at(-1);
    if (last && cluster.from - last.to <= CLUSTER_GAP_DAYS) {
      last.to = Math.max(last.to, cluster.to);
      last.weight += cluster.weight;
      last.finished ||= cluster.finished;
    } else merged.push({ ...cluster });
  }
  return merged;
}

/**
 * Kural tabanlı plan. Kanıt günleri (ve varsa AI'nın dönemleri) kümelenir; her küme bir oynama dönemidir ve
 * süresini taşıyacak kadar (çoğunlukla geriye doğru: ilk ekran görüntüsünden önce de oynanmıştır)
 * genişletilir. Bitirilen oyunda bitirme kümesi en az bitirme süresi kadar pay alır. Yıllara yayılan
 * oyunlarda kümelerin yanında son oynamaya kadar süren düzenli bir arka plan fazı olur.
 */
export function heuristicPlan(evidence: Evidence, hints: PlanHints = {}): EstimatePlan {
  const full = { from: dayOf(evidence.window.from), to: dayOf(evidence.window.to) };
  const budget = evidence.budgetMin;
  const allAnchors = anchorsOf(evidence);
  // Bilinen çıkış tarihi pencereyi daraltır; daha eski bir kesin kanıt varsa kanıt kazanır.
  const firstCertain = allAnchors.find((anchor) => anchor.certain)?.day ?? full.to;
  const release =
    hints.releaseDate && validIso(hints.releaseDate) ? dayOf(hints.releaseDate) : null;
  const window = {
    from:
      release !== null && release > full.from
        ? Math.min(release, firstCertain, full.to)
        : full.from,
    to: full.to,
  };
  const anchors = allAnchors.filter((anchor) => anchor.day >= window.from);
  // Son oynamadan (ya da ondan sonraki son kesin kanıttan) sonra oynanmamıştır.
  const lastPlayed = evidence.lastPlayedAt ? dayOf(evidence.lastPlayedAt) : null;
  const latestCertain = anchors.filter((anchor) => anchor.certain).at(-1)?.day ?? window.from;
  const bounds = {
    from: window.from,
    to: lastPlayed === null ? window.to : Math.min(window.to, Math.max(lastPlayed, latestCertain)),
  };
  const strongDays = anchors.filter((anchor) => anchor.strong).length;
  const finishedDay = evidence.finishedAt ? dayOf(evidence.finishedAt) : null;
  const endKnown = evidence.lastPlayedAt !== null || evidence.finishedAt !== null;
  const end = anchors.at(-1)?.day ?? bounds.to;
  const confidence = scoreConfidence(evidence, strongDays, endKnown);
  const withWindow = (plan: EstimatePlan): EstimatePlan =>
    window.from === full.from
      ? plan
      : { ...plan, window: { from: isoOf(window.from), to: evidence.window.to } };

  if (budget < SAMPLED_MAX_MIN) {
    const length = Math.max(1, Math.ceil(budget / 120));
    const range = widen({ from: end, to: end }, length, bounds, 1);
    return withWindow({
      pattern: "sampled",
      phases: [{ from: isoOf(range.from), to: isoOf(range.to), share: 1, intensity: "binge" }],
      confidence,
    });
  }

  const hinted: Cluster[] = (hints.periods ?? [])
    .filter((period) => validIso(period.from) && validIso(period.to))
    .map((period) => {
      const [start, stop] = [dayOf(period.from), dayOf(period.to)].sort((a, b) => a - b);
      return { from: Math.max(bounds.from, start ?? 0), to: Math.min(bounds.to, stop ?? 0) };
    })
    .filter((period) => period.from <= period.to)
    // Pencerenin neredeyse tamamını kaplayan dönem bir bilgi taşımaz ("hep oynadı").
    .filter(
      (period) =>
        bounds.to - bounds.from < 365 ||
        period.to - period.from + 1 < 0.8 * (bounds.to - bounds.from + 1),
    )
    .map((period) => ({
      ...period,
      weight: HINT_WEIGHT,
      finished: finishedDay !== null && period.from <= finishedDay && finishedDay <= period.to,
    }));
  const longRunning = hints.longRunning ?? isLongRunning(evidence);
  const clusters = mergeClusters([...clusterAnchors(anchors, finishedDay), ...hinted]);
  const clusterShare =
    clusters.length === 0
      ? 0
      : longRunning
        ? Math.min(0.6, (hinted.length > 0 ? 0.45 : 0.15) + 0.05 * strongDays)
        : 1;
  const phases: EstimatePhase[] = [];

  if (clusterShare > 0) {
    const totalWeight = clusters.reduce((sum, cluster) => sum + cluster.weight, 0);
    const shares = clusters.map((cluster) => (clusterShare * cluster.weight) / totalWeight);
    // Bitirme dönemi en az oyunun bitirme süresi kadar sürer (sonraki dönüşler genelde daha kısadır).
    const finishedIndex = clusters.findIndex((cluster) => cluster.finished);
    if (finishedIndex >= 0 && evidence.ttbMin && clusters.length > 1) {
      const wanted = Math.min(0.85 * clusterShare, (evidence.ttbMin * 1.2) / budget);
      const current = shares[finishedIndex] ?? 0;
      if (current < wanted) {
        const scale = (clusterShare - wanted) / (clusterShare - current);
        shares.forEach((share, index) => {
          shares[index] = index === finishedIndex ? wanted : share * scale;
        });
      }
    }
    clusters.forEach((cluster, index) => {
      const share = shares[index] ?? 0;
      // Aylara yayılan bir dönem yoğun bir seri değil, düzenli oynanıştır.
      const intensity: EstimateIntensity =
        cluster.to - cluster.from + 1 > LONG_CLUSTER_DAYS ? "regular" : "binge";
      // Bitirmeyle biten dönem bitirme gününe doğru birikir; diğerleri ilk kanıttan önce başlamıştır.
      const range = widen(
        cluster,
        daysFor(share * budget, intensity),
        bounds,
        cluster.finished ? 1 : 0.75,
      );
      phases.push({ from: isoOf(range.from), to: isoOf(range.to), share, intensity });
    });
  }
  if (clusterShare < 1) {
    const share = 1 - clusterShare;
    const intensity: EstimateIntensity = longRunning ? "regular" : "binge";
    const range = widen({ from: end, to: end }, daysFor(share * budget, intensity), bounds, 1);
    phases.push({ from: isoOf(range.from), to: isoOf(range.to), share, intensity });
  }

  const merged = mergePhases(phases);
  const pattern = longRunning ? "steady" : merged.length > 1 ? "episodic" : "campaign";
  return withWindow({ pattern, phases: merged, confidence });
}

const clampConfidence = (value: number) => Math.min(0.95, Math.max(0.05, Number(value) || 0.5));

/** AI ipucundan plan: araçların süresi dağıtılmaz; diğerleri ipuçlarıyla kural tabanlı planlayıcıdan geçer. */
export function planFromHint(evidence: Evidence, hint: EstimateHint): EstimatePlan {
  const confidence = clampConfidence(hint.confidence);
  const note = hint.note?.trim() || null;
  if (hint.kind === "tool") return { pattern: "excluded", phases: [], confidence, note, hint };
  const plan = heuristicPlan(evidence, {
    longRunning: hint.kind === "long_running",
    releaseDate: hint.releaseDate,
    periods: hint.periods,
  });
  return { ...plan, confidence, note, hint };
}

function scoreConfidence(evidence: Evidence, strongDays: number, endKnown: boolean) {
  let score = 0.3;
  if (endKnown) score += 0.2;
  score += Math.min(0.4, 0.05 * strongDays);
  if (isLongRunning(evidence) && strongDays < 5) score -= 0.15;
  if (!evidence.catalogued) score -= 0.1;
  if (evidence.budgetMin < AI_MIN_BUDGET_MIN) score = Math.max(score, 0.6);
  return Math.round(Math.min(0.95, Math.max(0.05, score)) * 100) / 100;
}

/** Kural tabanlı planı AI'nın iyileştirmesi gereken kayıtlar: uzun ve güveni düşük. */
export function needsAi(evidence: Evidence, plan: EstimatePlan) {
  return evidence.budgetMin >= AI_MIN_BUDGET_MIN && plan.confidence < AI_MAX_CONFIDENCE;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const validIso = (value: string) => ISO_DATE.test(value) && !Number.isNaN(dayOf(value));

/** Kullanıcının "ne zaman oynadım" cevabı: dönemler ve yoğunlukları, ya da "bu bir oyun değil". */
export type UserPeriods = {
  excluded: boolean;
  periods: ReadonlyArray<{ from: string; to: string; intensity: EstimateIntensity }>;
};

export const MAX_USER_PERIODS = 6;

/** Kullanıcının seçebileceği tarihler: takip başlamadan (elle girilmiş sürede bugünden) önceki günler. */
export function userLimits(evidence: Evidence, today: string) {
  const to = (evidence.trackedFrom ? dayOf(evidence.trackedFrom) : dayOf(today)) - 1;
  return { from: isoOf(FLOOR_DAY), to: isoOf(Math.max(FLOOR_DAY, to)) };
}

/**
 * Kullanıcının bilgisinden plan. Kullanıcı yüzde vermez: her dönemin payı uzunluğu × yoğunluğun tipik günlük
 * süresiyle orantılıdır (üreticiyle aynı parametreler). Kanıt penceresi (ör. katalogdaki çıkış tarihi)
 * kullanıcıyı bağlamaz; yalnızca takip başladıktan sonrası kapalıdır. Varsa AI ipucu korunur ("tahmine dön"
 * dendiğinde plan AI'ya yeniden sorulmadan kurulur). Kullanılabilir dönem yoksa `null`.
 */
export function userPlan(
  evidence: Evidence,
  input: UserPeriods,
  today: string,
  previous?: EstimatePlan,
): EstimatePlan | null {
  const base = { confidence: 0.95, note: null, ...(previous?.hint ? { hint: previous.hint } : {}) };
  if (input.excluded) return { pattern: "excluded", phases: [], ...base };
  const limits = userLimits(evidence, today);
  const periods = input.periods
    .filter((period) => validIso(period.from) && validIso(period.to))
    .map((period) =>
      period.from <= period.to ? period : { ...period, from: period.to, to: period.from },
    )
    .filter((period) => period.to >= limits.from && period.from <= limits.to)
    .slice(0, MAX_USER_PERIODS)
    .map((period) => ({
      from: period.from < limits.from ? limits.from : period.from,
      to: period.to > limits.to ? limits.to : period.to,
      intensity: period.intensity,
    }));
  if (periods.length === 0) return null;
  const weights = periods.map(
    (period) =>
      (dayOf(period.to) - dayOf(period.from) + 1) *
      INTENSITY[period.intensity].daily *
      INTENSITY[period.intensity].ratio,
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const phases: EstimatePhase[] = periods.map((period, index) => ({
    from: period.from,
    to: period.to,
    share: Math.round(((weights[index] ?? 0) / total) * 1000) / 1000,
    intensity: period.intensity,
  }));
  const from = phases.reduce((min, phase) => (phase.from < min ? phase.from : min), limits.to);
  const to = phases.reduce((max, phase) => (phase.to > max ? phase.to : max), limits.from);
  const pattern =
    phases.length > 1 ? "episodic" : dayOf(to) - dayOf(from) > 365 ? "steady" : "campaign";
  return { pattern, phases, window: { from, to }, ...base };
}

/** Hızlı soru destesinin cevapları (ayrıntılı dönem girişi için `UserPeriods`). */
export type EstimateAnswer =
  /** Tek bir dönemde oynandı: yıl, biliniyorsa ay (1–12). */
  | { kind: "once"; year: number; month?: number | null }
  /** Yıllara yayıldı: oynandığı yıllar. */
  | { kind: "years"; years: number[] }
  /** Oyun değil (arka plan aracı). */
  | { kind: "tool" }
  /** Mevcut tahmin doğru: olduğu gibi kullanıcının bilgisi olarak kilitlenir. */
  | { kind: "confirm" };

/**
 * Cevabı kullanıcı planına çevirir; geometri yine kodda. "Bir kerede, 2012 Temmuz" → süreyi taşıyacak kadar
 * yoğun bir dönem, ayın çevresinde; yalnızca yıl verildiyse o yıla düzenli yayılır. "Yıllara yayarak" →
 * ardışık yıllar tek dönem, düzenli. Takip sonrasına taşan kısım `userPlan` tarafından kırpılır.
 */
export function planFromAnswer(
  evidence: Evidence,
  answer: EstimateAnswer,
  today: string,
  current: EstimatePlan,
): EstimatePlan | null {
  if (answer.kind === "tool")
    return userPlan(evidence, { excluded: true, periods: [] }, today, current);
  if (answer.kind === "confirm") {
    return userPlan(
      evidence,
      { excluded: current.pattern === "excluded", periods: current.phases },
      today,
      current,
    );
  }
  const limits = userLimits(evidence, today);
  const bounds = { from: dayOf(limits.from), to: dayOf(limits.to) };
  if (answer.kind === "once") {
    if (!answer.month) {
      const periods = [
        { from: `${answer.year}-01-01`, to: `${answer.year}-12-31`, intensity: "regular" as const },
      ];
      return userPlan(evidence, { excluded: false, periods }, today, current);
    }
    const [start, end] = monthRange(answer.year * 12 + answer.month - 1);
    const range = widen(
      { from: start, to: end },
      daysFor(evidence.budgetMin, "binge"),
      bounds,
      0.5,
    );
    const periods = [{ from: isoOf(range.from), to: isoOf(range.to), intensity: "binge" as const }];
    return userPlan(evidence, { excluded: false, periods }, today, current);
  }
  const years = [...new Set(answer.years)].sort((a, b) => a - b);
  const periods: Array<{ from: string; to: string; intensity: EstimateIntensity }> = [];
  for (const year of years) {
    const last = periods.at(-1);
    if (last && Number(last.to.slice(0, 4)) === year - 1) last.to = `${year}-12-31`;
    else periods.push({ from: `${year}-01-01`, to: `${year}-12-31`, intensity: "regular" });
  }
  return userPlan(
    evidence,
    { excluded: false, periods: periods.slice(0, MAX_USER_PERIODS) },
    today,
    current,
  );
}
