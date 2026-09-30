import { schema } from "@my-games/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../src/db";
import {
  GENERATOR_VERSION,
  rebuildPlayEstimates,
  usersNeedingEstimates,
} from "../src/estimates/build";
import { apportion, dayOf, isoOf } from "../src/estimates/days";
import {
  answerPlayHistory,
  entryPlayHistory,
  estimateQuestions,
  resetEntryPlayHistory,
  setEntryPlayHistory,
} from "../src/estimates/entry";
import { rhythmOf } from "../src/estimates/evidence";
import {
  computeWindow,
  type Evidence,
  heuristicPlan,
  needsAi,
  planFromAnswer,
  planFromHint,
  userPlan,
} from "../src/estimates/planner";
import { DEFAULT_RHYTHM, reconcile, synthesize } from "../src/estimates/synthesize";
import { addEntry, deleteEntry } from "../src/library";
import { activityHeatmap, heatmapYears, wrapped, wrappedYears } from "../src/stats";
import { createGame, createUser } from "./factories";

const sum = (days: Map<number, number>) => [...days.values()].reduce((a, b) => a + b, 0);
function totalsOf(entries: ReadonlyArray<{ days: Map<number, number> }>) {
  const totals = new Map<number, number>();
  for (const entry of entries) {
    for (const [day, minutes] of entry.days) totals.set(day, (totals.get(day) ?? 0) + minutes);
  }
  return totals;
}

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    entryId: "00000000-0000-0000-0000-000000000001",
    name: "Test Game",
    budgetMin: 60 * 60,
    window: { from: "2019-01-01", to: "2023-06-30" },
    trackedFrom: null,
    status: "completed",
    releaseDate: "2019-01-01",
    startedAt: null,
    finishedAt: null,
    lastPlayedAt: null,
    addedAt: null,
    ttbMin: 50 * 60,
    genres: ["Role-playing (RPG)"],
    multiplayer: false,
    catalogued: true,
    achievements: [],
    screenshots: [],
    ...overrides,
  };
}

describe("estimates: days", () => {
  it("apportions integers that always add up to the total", () => {
    expect(apportion(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(apportion(7, [0.2, 0.5, 0.3]).reduce((a, b) => a + b, 0)).toBe(7);
    expect(apportion(5, [0, 0])).toEqual([3, 2]);
    expect(isoOf(dayOf("2024-02-29"))).toBe("2024-02-29");
  });
});

describe("estimates: window", () => {
  const horizonDay = dayOf("2026-09-27");

  it("ends at the last play before tracking and starts at release", () => {
    const window = computeWindow({
      horizonDay,
      releaseDate: "2013-08-13",
      startedAt: null,
      lastPlayedAt: "2023-11-28",
      evidenceDays: [],
    });
    expect([isoOf(window.from), isoOf(window.to)]).toEqual(["2013-08-13", "2023-11-28"]);
  });

  it("trusts evidence over dates: early access before release, play after tracking ignored", () => {
    const window = computeWindow({
      horizonDay,
      releaseDate: "2020-05-01",
      startedAt: null,
      // Takipten sonraki son oynama üst sınır değildir.
      lastPlayedAt: "2026-09-29",
      evidenceDays: [dayOf("2019-11-10")],
    });
    expect([isoOf(window.from), isoOf(window.to)]).toEqual(["2019-11-10", "2026-09-26"]);
  });

  it("drops a release date after the last play and never ends after the horizon", () => {
    const window = computeWindow({
      horizonDay,
      releaseDate: "2024-01-01",
      startedAt: null,
      lastPlayedAt: "2022-03-01",
      evidenceDays: [],
    });
    expect(isoOf(window.to)).toBe("2022-03-01");
    expect(window.from).toBeLessThan(dayOf("2022-03-01"));
  });
});

describe("estimates: heuristic planner", () => {
  it("plays a short game in a few days around the last play", () => {
    const plan = heuristicPlan(evidence({ budgetMin: 150, lastPlayedAt: "2021-04-10" }));
    expect(plan.pattern).toBe("sampled");
    expect(plan.phases).toHaveLength(1);
    expect(plan.phases[0]?.to).toBe("2021-04-10");
    expect(needsAi(evidence({ budgetMin: 150 }), plan)).toBe(false);
  });

  it("builds a campaign ending on the finish date, sized to the hours", () => {
    const item = evidence({ finishedAt: "2022-05-20", lastPlayedAt: "2022-05-20" });
    const plan = heuristicPlan(item);
    expect(plan.pattern).toBe("campaign");
    const [phase] = plan.phases;
    expect(phase?.to).toBe("2022-05-20");
    // 60 saat, yoğun tempoda birkaç haftaya yayılır; yıllara değil.
    const length = dayOf(phase?.to ?? "") - dayOf(phase?.from ?? "") + 1;
    expect(length).toBeGreaterThan(14);
    expect(length).toBeLessThan(60);
    expect(plan.confidence).toBeGreaterThanOrEqual(0.5);
    expect(needsAi(item, plan)).toBe(false);
  });

  it("gives screenshot clusters their own periods", () => {
    const plan = heuristicPlan(
      evidence({
        budgetMin: 80 * 60,
        finishedAt: "2020-03-15",
        screenshots: [
          ["2020-03-01", 3],
          ["2020-03-10", 2],
          ["2022-08-01", 4],
          ["2022-08-03", 1],
        ],
      }),
    );
    expect(plan.pattern).toBe("episodic");
    expect(plan.phases.length).toBe(2);
    // Bitirilen dönem, geri dönüşten büyük pay alır (bitirme süresi 50 saat).
    expect(plan.phases[0]?.share).toBeGreaterThan(plan.phases[1]?.share ?? 1);
    expect(plan.confidence).toBeGreaterThan(0.6);
  });

  it("spreads a long-running game over years and flags it for AI when unsure", () => {
    const item = evidence({
      budgetMin: 2486 * 60,
      ttbMin: 170 * 60,
      genres: ["Strategy"],
      multiplayer: true,
      status: "playing",
      window: { from: "2013-08-13", to: "2023-11-28" },
      lastPlayedAt: "2023-11-28",
    });
    const plan = heuristicPlan(item);
    expect(plan.pattern).toBe("steady");
    const earliest = Math.min(...plan.phases.map((phase) => dayOf(phase.from)));
    expect(dayOf("2023-11-28") - earliest).toBeGreaterThan(3 * 365);
    expect(needsAi(item, plan)).toBe(true);
  });
});

describe("estimates: AI hints", () => {
  it("leaves tools out and narrows the window to a known release", () => {
    const legacy = evidence({
      budgetMin: 64 * 60,
      catalogued: false,
      releaseDate: null,
      ttbMin: null,
      genres: [],
      window: { from: "2008-11-22", to: "2023-11-19" },
      finishedAt: "2023-11-19",
      lastPlayedAt: "2023-11-19",
    });
    const hint = {
      releaseDate: "2015-05-19",
      periods: [],
      confidence: 0.7,
      note: " Bir kez. ",
    };
    expect(planFromHint(legacy, { ...hint, kind: "tool" })).toMatchObject({
      pattern: "excluded",
      phases: [],
    });
    const plan = planFromHint(legacy, { ...hint, kind: "campaign" });
    expect(plan.window).toEqual({ from: "2015-05-19", to: "2023-11-19" });
    expect(plan.note).toBe("Bir kez.");
    for (const phase of plan.phases) expect(phase.from >= "2015-05-19").toBe(true);
  });

  it("turns hinted periods into phases of a long-running game", () => {
    const plan = planFromHint(
      evidence({
        budgetMin: 2000 * 60,
        window: { from: "2014-03-25", to: "2026-09-26" },
        lastPlayedAt: null,
        finishedAt: null,
      }),
      {
        kind: "long_running",
        releaseDate: null,
        periods: [
          { from: "2015-01-01", to: "2016-06-30" },
          { from: "2030-01-01", to: "2030-02-01" },
        ],
        confidence: 0.6,
        note: null,
      },
    );
    expect(plan.pattern).toBe("steady");
    const hinted = plan.phases.find(
      (phase) => phase.from <= "2015-01-01" && phase.to >= "2016-06-30",
    );
    expect(hinted?.share).toBeGreaterThanOrEqual(0.4);
    expect(plan.phases.some((phase) => phase.intensity === "regular")).toBe(true);
    expect(plan.phases.every((phase) => phase.to <= "2026-09-26")).toBe(true);
  });
});

describe("estimates: the user's own dates", () => {
  const tracked = evidence({ trackedFrom: "2026-09-27", budgetMin: 100 * 60 });

  it("weights periods by length and intensity and keeps the AI hint", () => {
    const hint = {
      kind: "campaign" as const,
      releaseDate: null,
      periods: [],
      confidence: 0.6,
      note: null,
    };
    const plan = userPlan(
      tracked,
      {
        excluded: false,
        periods: [
          { from: "2016-06-01", to: "2016-08-31", intensity: "binge" },
          { from: "2019-01-01", to: "2021-12-31", intensity: "casual" },
        ],
      },
      "2026-09-30",
      { pattern: "campaign", phases: [], confidence: 0.5, hint },
    );
    expect(plan?.pattern).toBe("episodic");
    expect(plan?.window).toEqual({ from: "2016-06-01", to: "2021-12-31" });
    expect(plan?.hint).toEqual(hint);
    // 92 gün yoğun ≈ 3 yıl ara sıra: kısa ama yoğun yaz dönemi daha büyük pay alır.
    const [summer, later] = plan?.phases ?? [];
    expect(summer?.share).toBeGreaterThan(later?.share ?? 1);
    expect((summer?.share ?? 0) + (later?.share ?? 0)).toBeCloseTo(1, 2);
  });

  it("never writes past the start of tracking, and can leave a tool out", () => {
    const plan = userPlan(
      tracked,
      {
        excluded: false,
        periods: [{ from: "2026-01-01", to: "2026-12-31", intensity: "regular" }],
      },
      "2026-09-30",
    );
    expect(plan?.phases[0]?.to).toBe("2026-09-26");
    expect(
      userPlan(
        tracked,
        {
          excluded: false,
          periods: [{ from: "2027-01-01", to: "2027-02-01", intensity: "binge" }],
        },
        "2026-09-30",
      ),
    ).toBeNull();
    expect(userPlan(tracked, { excluded: true, periods: [] }, "2026-09-30")?.pattern).toBe(
      "excluded",
    );
  });
});

describe("estimates: quick answers", () => {
  const item = evidence({ trackedFrom: "2026-09-27", budgetMin: 60 * 60 });
  const current = heuristicPlan(item);

  it("turns 'once, in July 2012' into one intense run around that month", () => {
    const plan = planFromAnswer(
      item,
      { kind: "once", year: 2012, month: 7 },
      "2026-09-30",
      current,
    );
    expect(plan).toMatchObject({ pattern: "campaign" });
    const [phase] = plan?.phases ?? [];
    expect(phase?.intensity).toBe("binge");
    expect(phase && phase.from <= "2012-07-01" && phase.to >= "2012-07-31").toBe(true);
    // 60 saat yoğun tempoda bir aydan uzun sürer; çevresine yayılır ama yıllara değil.
    expect(dayOf(phase?.to ?? "") - dayOf(phase?.from ?? "")).toBeLessThan(90);
  });

  it("merges consecutive years and keeps the current guess on confirm", () => {
    const plan = planFromAnswer(
      item,
      { kind: "years", years: [2019, 2016, 2017] },
      "2026-09-30",
      current,
    );
    expect(plan?.phases.map((phase) => [phase.from, phase.to])).toEqual([
      ["2016-01-01", "2017-12-31"],
      ["2019-01-01", "2019-12-31"],
    ]);
    const confirmed = planFromAnswer(item, { kind: "confirm" }, "2026-09-30", current);
    expect(confirmed?.phases.map((phase) => phase.from)).toEqual(
      current.phases.map((phase) => phase.from),
    );
    expect(planFromAnswer(item, { kind: "tool" }, "2026-09-30", current)?.pattern).toBe("excluded");
  });
});

describe("estimates: synthesis", () => {
  const base = {
    window: { from: "2018-01-01", to: "2023-12-31" },
    rhythm: DEFAULT_RHYTHM,
    anchors: new Map([[dayOf("2020-06-15"), 2]]),
  };

  it("keeps the exact budget inside the window, deterministically", () => {
    const phases = [
      { from: "2020-05-01", to: "2020-07-01", share: 0.7, intensity: "binge" as const },
      { from: "2018-01-01", to: "2023-12-31", share: 0.3, intensity: "casual" as const },
    ];
    const input = { ...base, budgetMin: 9_137, phases, seed: 42 };
    const days = synthesize(input);
    expect(sum(days)).toBe(9_137);
    for (const [day, minutes] of days) {
      expect(day).toBeGreaterThanOrEqual(dayOf("2018-01-01"));
      expect(day).toBeLessThanOrEqual(dayOf("2023-12-31"));
      expect(minutes).toBeGreaterThan(0);
      expect(minutes).toBeLessThanOrEqual(DEFAULT_RHYTHM.dailyCapMin);
    }
    expect(days.get(dayOf("2020-06-15"))).toBeGreaterThan(0);
    expect([...synthesize(input)]).toEqual([...days]);
    expect([...synthesize({ ...input, seed: 43 })]).not.toEqual([...days]);
  });

  it("plays in streaks rather than scattered single days during a binge", () => {
    const days = synthesize({
      ...base,
      budgetMin: 40 * 60,
      phases: [{ from: "2021-01-01", to: "2021-02-28", share: 1, intensity: "binge" }],
      seed: 7,
    });
    const sorted = [...days.keys()].sort((a, b) => a - b);
    const adjacent = sorted.filter(
      (day, index) => index > 0 && day - (sorted[index - 1] ?? 0) === 1,
    );
    expect(adjacent.length / sorted.length).toBeGreaterThan(0.5);
  });

  it("spreads a decade of play over many months", () => {
    const days = synthesize({
      ...base,
      window: { from: "2014-01-01", to: "2024-01-01" },
      budgetMin: 3000 * 60,
      phases: [{ from: "2014-01-01", to: "2024-01-01", share: 1, intensity: "regular" }],
      seed: 1,
    });
    expect(sum(days)).toBe(3000 * 60);
    const months = new Set([...days.keys()].map((day) => isoOf(day).slice(0, 7)));
    expect(months.size).toBeGreaterThan(100);
  });

  it("reconciles crowded days without changing any game's total", () => {
    const a = new Map([
      [100, 500],
      [101, 100],
    ]);
    const b = new Map([[100, 400]]);
    const entries = [
      {
        entryId: "a",
        days: a,
        ranges: [[90, 110] as const],
        window: [0, 200] as const,
        fixed: new Set([100]),
      },
      {
        entryId: "b",
        days: b,
        ranges: [[95, 105] as const],
        window: [0, 200] as const,
        fixed: new Set<number>(),
      },
    ];
    reconcile(entries, { dailyCapMin: 600, monthlyCapMin: 100_000 });
    expect(sum(a)).toBe(600);
    expect(sum(b)).toBe(400);
    for (const total of totalsOf(entries).values()) expect(total).toBeLessThanOrEqual(600);
    expect(a.get(100)).toBeGreaterThanOrEqual(30);
  });

  it("stretches crowded months backwards inside each game's window", () => {
    const march = dayOf("2023-03-01");
    // Aynı ay bitirilmiş iki uzun oyun: ayın her günü 8 saat.
    const make = (entryId: string) => ({
      entryId,
      days: new Map(
        Array.from({ length: 31 }, (_, index) => [march + index, 240] as [number, number]),
      ),
      ranges: [[march, march + 30] as const],
      window: [dayOf("2021-01-01"), march + 30] as const,
      fixed: new Set([march + 30]),
    });
    const entries = [make("a"), make("b")];
    const monthlyCapMin = 4000;
    reconcile(entries, { dailyCapMin: 600, monthlyCapMin });
    for (const entry of entries) {
      expect(sum(entry.days)).toBe(31 * 240);
      expect(entry.days.get(march + 30)).toBeGreaterThan(0);
      for (const day of entry.days.keys()) expect(day).toBeLessThanOrEqual(march + 30);
    }
    const months = new Map<string, number>();
    for (const [day, total] of totalsOf(entries)) {
      const month = isoOf(day).slice(0, 7);
      months.set(month, (months.get(month) ?? 0) + total);
      expect(total).toBeLessThanOrEqual(600);
    }
    // Aylık sınır ±%15 oynar.
    for (const total of months.values()) expect(total).toBeLessThanOrEqual(monthlyCapMin * 1.15);
    expect(months.has("2023-02")).toBe(true);
  });

  it("derives a weekly rhythm only from enough real days", () => {
    expect(rhythmOf([{ day: "2026-01-01", minutes: 60 }])).toBe(DEFAULT_RHYTHM);
    const days = Array.from({ length: 28 }, (_, index) => ({
      day: isoOf(dayOf("2026-01-04") + index),
      minutes: index % 7 === 6 ? 600 : 60,
    }));
    const rhythm = rhythmOf(days);
    // Cumartesi (6) yoğun.
    expect(rhythm.weekday[6]).toBeGreaterThan(rhythm.weekday[2] ?? 0);
    expect(rhythm.dailyCapMin).toBeGreaterThanOrEqual(360);
  });
});

describe("estimates: build", () => {
  async function setup() {
    const owner = await createUser();
    const now = new Date("2026-09-27T14:00:00Z");
    // Eski sistemden gelen, bitirilmiş bir oyun (yalnızca elle süre).
    const legacyGame = await createGame({
      releaseDate: "2015-05-19",
      timeToBeatNormally: 50 * 3600,
    });
    const legacy = await addEntry(owner.id, {
      gameId: legacyGame.id,
      status: "completed",
      playtimeManualMin: 64 * 60,
      finishedAt: "2023-11-19",
      lastPlayedAt: new Date("2023-11-19T12:00:00Z"),
    });
    // Steam'den gelen, bağlandıktan sonra da oynanmış bir oyun.
    const steamGame = await createGame({ releaseDate: "2014-03-25", steamAppId: 386_360 });
    const steam = await addEntry(owner.id, {
      gameId: steamGame.id,
      status: "playing",
      platform: "pc",
      store: "steam",
    });
    await db
      .update(schema.libraryEntries)
      .set({ playtimeSteamMin: 300 * 60, lastPlayedAt: new Date("2026-09-29T20:00:00Z") })
      .where(eq(schema.libraryEntries.id, steam.id));
    await db.insert(schema.platformSnapshots).values({
      userId: owner.id,
      provider: "steam",
      externalId: "386360",
      playtimeMin: 300 * 60,
      baselineAt: now,
      baselineLastPlayedAt: new Date("2024-02-10T21:00:00Z"),
    });
    await db.insert(schema.playSessions).values({
      userId: owner.id,
      gameId: steamGame.id,
      entryId: steam.id,
      source: "steam_delta",
      startedAt: new Date("2026-09-29T18:00:00Z"),
      endedAt: new Date("2026-09-29T20:00:00Z"),
      durationMin: 120,
    });
    await db.insert(schema.screenshots).values(
      ["2023-11-04", "2023-11-05", "2023-11-12"].map((day) => ({
        entryId: legacy.id,
        userId: owner.id,
        gameId: legacyGame.id,
        kind: "steam" as const,
        url: `https://example.com/${day}.jpg`,
        takenAt: new Date(`${day}T20:00:00Z`),
      })),
    );
    return { owner, now, legacy, steam };
  }

  it("fills the history before tracking with flagged, exact estimates", async () => {
    const { owner, now, legacy, steam } = await setup();
    expect(await usersNeedingEstimates()).toContain(owner.id);

    const stats = await rebuildPlayEstimates(owner.id, { now });
    // Steam oyununun bütçesi = toplam − gerçek oturum (120 dk).
    expect(stats).toMatchObject({ entries: 2, estimatedMin: 64 * 60 + 300 * 60 - 120 });

    const days = await db
      .select()
      .from(schema.playEstimateDays)
      .where(eq(schema.playEstimateDays.userId, owner.id));
    const totalOf = (entryId: string) =>
      days.filter((row) => row.entryId === entryId).reduce((acc, row) => acc + row.minutes, 0);
    expect(totalOf(legacy.id)).toBe(64 * 60);
    expect(totalOf(steam.id)).toBe(300 * 60 - 120);
    for (const row of days) {
      if (row.entryId === steam.id) expect(row.day <= "2024-02-10").toBe(true);
      else expect(row.day <= "2023-11-19").toBe(true);
    }
    // Ekran görüntüsü günleri boş kalmaz.
    for (const day of ["2023-11-04", "2023-11-05", "2023-11-12"]) {
      expect(days.some((row) => row.entryId === legacy.id && row.day === day)).toBe(true);
    }

    const [plan] = await db
      .select()
      .from(schema.playEstimatePlans)
      .where(eq(schema.playEstimatePlans.entryId, legacy.id));
    expect(plan).toMatchObject({ planner: "heuristic", generatorVersion: GENERATOR_VERSION });
    expect(plan?.plan.phases.at(-1)?.to).toBe("2023-11-19");

    // Isı haritası tahmini kısmı ayrıca işaretler; gerçek oturum günü tahmin değildir.
    const year2023 = await activityHeatmap(owner.id, 2023);
    expect(year2023.length).toBeGreaterThan(5);
    for (const day of year2023) expect(day.estimatedMinutes).toBe(day.minutes);
    const year2026 = await activityHeatmap(owner.id, 2026);
    expect(year2026.find((day) => day.day === "2026-09-29")).toEqual({
      day: "2026-09-29",
      minutes: 120,
      estimatedMinutes: 0,
    });
    expect(await heatmapYears(owner.id)).toContain(2023);

    const review = await wrapped(owner.id, 2023);
    expect(review.estimatedMinutes).toBe(review.playedMinutes);
    expect(review.playedMinutes).toBeGreaterThanOrEqual(64 * 60);
    expect(await wrappedYears(owner.id)).toContain(2023);
    expect(await usersNeedingEstimates()).not.toContain(owner.id);
  });

  it("lets the owner correct when a game was played, and undo it", async () => {
    const { owner, now, legacy, steam } = await setup();
    await rebuildPlayEstimates(owner.id, { now });
    const stranger = await createUser();
    const periods = {
      excluded: false,
      periods: [{ from: "2017-03-01", to: "2017-04-30", intensity: "binge" as const }],
    };
    await expect(setEntryPlayHistory(stranger.id, legacy.id, periods)).rejects.toMatchObject({
      code: "forbidden",
    });

    const corrected = await setEntryPlayHistory(owner.id, legacy.id, periods);
    expect(corrected.estimate).toMatchObject({ planner: "user", pattern: "campaign" });
    expect(corrected.months.map((month) => month.month)).toEqual(["2017-03", "2017-04"]);
    expect(corrected.months.reduce((sum, month) => sum + month.estimatedMinutes, 0)).toBe(64 * 60);

    // Sonraki derlemeler (AI dahil) kullanıcının bilgisini değiştirmez.
    await rebuildPlayEstimates(owner.id, { now, force: true });
    expect((await entryPlayHistory(legacy.id)).estimate?.planner).toBe("user");

    // Steam oyununda takip başladıktan sonrası seçilemez.
    await expect(
      setEntryPlayHistory(owner.id, steam.id, {
        excluded: false,
        periods: [{ from: "2026-09-28", to: "2026-09-29", intensity: "binge" }],
      }),
    ).rejects.toMatchObject({ code: "invalid" });

    const reset = await resetEntryPlayHistory(owner.id, legacy.id);
    expect(reset.estimate?.planner).toBe("heuristic");
    expect(reset.months.some((month) => month.month === "2023-11")).toBe(true);
  });

  it("asks about the long, uncertain games and stops once answered", async () => {
    const { owner, now, steam } = await setup();
    await rebuildPlayEstimates(owner.id, { now });
    // Steam oyunu: 300 saat, kanıt yalnızca son oynama → sorulur; ekran görüntülü eski oyun sorulmaz.
    const before = await estimateQuestions(owner.id);
    expect(before.questions.map((question) => question.entryId)).toEqual([steam.id]);
    expect(before.questions[0]).toMatchObject({ years: { from: 2014, to: 2026 } });

    const answered = await answerPlayHistory(owner.id, steam.id, {
      kind: "years",
      years: [2015, 2016],
    });
    expect(answered.estimate?.planner).toBe("user");
    expect(
      answered.months.every(
        (month) =>
          month.month.startsWith("2015") ||
          month.month.startsWith("2016") ||
          month.estimatedMinutes === 0,
      ),
    ).toBe(true);
    expect((await estimateQuestions(owner.id)).total).toBe(0);
  });

  it("is idempotent and follows the library", async () => {
    const { owner, now, legacy } = await setup();
    await rebuildPlayEstimates(owner.id, { now });
    const snapshot = async () =>
      db
        .select()
        .from(schema.playEstimateDays)
        .where(eq(schema.playEstimateDays.userId, owner.id))
        .orderBy(schema.playEstimateDays.entryId, schema.playEstimateDays.day);
    const first = await snapshot();
    await rebuildPlayEstimates(owner.id, { now, force: true });
    expect(await snapshot()).toEqual(first);

    // Silinen kaydın tahmini de gider.
    await deleteEntry(owner.id, legacy.id);
    expect((await snapshot()).some((row) => row.entryId === legacy.id)).toBe(false);
    await rebuildPlayEstimates(owner.id, { now });
    const plans = await db
      .select()
      .from(schema.playEstimatePlans)
      .where(eq(schema.playEstimatePlans.userId, owner.id));
    expect(plans).toHaveLength(1);
  });
});
