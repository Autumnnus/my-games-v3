import { useSyncExternalStore } from "react";
import { soundForMood } from "./mascot-sound";

/** Pati'nin ruh hâli: animasyonu bu seçer (bkz. `styles.css` `.pati`). */
export type PatiMood =
  | "idle"
  | "listening"
  | "thinking"
  | "working"
  | "talking"
  | "approval"
  | "success"
  | "error";

/**
 * Sitenin her yerindeki Pati'ler (başlık düğmesi, karşılama, son mesaj) aynı ruh hâlini paylaşır. Sohbetten
 * gelen durum (`chat-store` yazar), kullanıcının yazıp yazmadığı (mesaj kutusu yazar) ve kısa süreli bir
 * "başardım" anı birleşir. Modül AI SDK'yı içermez; başlık düğmesi onu yüklemeden okuyabilir.
 */
type State = { chat: PatiMood; typing: boolean; flash: boolean };

let state: State = { chat: "idle", typing: false, flash: false };
const listeners = new Set<() => void>();
let flashTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Gösterilen hâl. Akış hızlıyken (düşünüyor → araç → yazıyor birkaç yüz ms'de) hâller titremesin diye her
 * "meşgul" hâl en az `DWELL` ms ekranda kalır; boşta/dinliyor hâlinden çıkış, hata ve sevinç hemen gelir.
 */
const DWELL = 650;
const SETTLED = new Set<PatiMood>(["idle", "listening"]);
let shown: PatiMood = "idle";
let shownAt = 0;
let dwellTimer: ReturnType<typeof setTimeout> | undefined;

function apply() {
  clearTimeout(dwellTimer);
  const target = mood(state);
  if (target === shown) return;
  const wait = DWELL - (Date.now() - shownAt);
  if (wait > 0 && !SETTLED.has(shown) && target !== "error" && target !== "success") {
    dwellTimer = setTimeout(apply, wait);
    return;
  }
  const previous = shown;
  shown = target;
  shownAt = Date.now();
  soundForMood(previous, target);
  for (const listener of listeners) listener();
}

function update(next: Partial<State>) {
  state = { ...state, ...next };
  apply();
}

export function setChatMood(mood: PatiMood) {
  if (state.chat !== mood) update({ chat: mood });
}

export function setTyping(typing: boolean) {
  if (state.typing !== typing) update({ typing });
}

/** Bir değişiklik uygulandı: Pati bir iki kez zıplar, sonra sohbetin durumuna döner. */
export function flashSuccess(ms = 1900) {
  clearTimeout(flashTimer);
  update({ flash: true });
  flashTimer = setTimeout(() => update({ flash: false }), ms);
}

function mood(current: State): PatiMood {
  if (current.flash) return "success";
  if (current.chat !== "idle") return current.chat;
  return current.typing ? "listening" : "idle";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePatiMood() {
  return useSyncExternalStore(
    subscribe,
    () => shown,
    () => "idle" as const,
  );
}
