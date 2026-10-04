import { useSyncExternalStore } from "react";
import type { PaddieMood } from "./mascot-store";

/**
 * Paddie'nin sesleri. Dosya yok: hepsi Web Audio ile o an üretilen çok kısa, kısık tonlar (indirme ve lisans
 * derdi yok, birkaç yüz bayt kod). Tarayıcı ses çalmayı ancak bir dokunuş/tuşa basıştan sonra açar; ondan
 * önce gelen olaylar sessiz geçer. Kapatma tercihi tarayıcıda (`mg.ai.sound`).
 */
export type PaddieSound = "send" | "shuffle" | "ask" | "success" | "error" | "boop";

const STORAGE = "mg.ai.sound";
const VOLUME = 0.14;

let context: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let unlocked = false;
let enabled = true;
const listeners = new Set<() => void>();
const lastPlayed = new Map<PaddieSound, number>();

if (typeof window !== "undefined") {
  try {
    enabled = window.localStorage.getItem(STORAGE) !== "off";
  } catch {
    // Okunamazsa açık kalır.
  }
  const unlock = () => {
    unlocked = true;
    if (context?.state === "suspended") void context.resume();
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
}

function audio() {
  if (!unlocked || !enabled || typeof window === "undefined") return null;
  if (!context) {
    const Context =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return null;
    context = new Context();
    master = context.createGain();
    master.gain.value = VOLUME;
    master.connect(context.destination);
  }
  if (context.state === "suspended") void context.resume();
  return context;
}

/** Tek bir ton: hızlı açılır, üstel söner; `to` verilirse perde kayar. */
function tone(
  ctx: AudioContext,
  at: number,
  {
    from,
    to,
    duration,
    type = "sine",
    gain = 1,
  }: { from: number; to?: number; duration: number; type?: OscillatorType; gain?: number },
) {
  if (!master) return;
  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, at);
  if (to) oscillator.frequency.exponentialRampToValueAtTime(to, at + duration);
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(envelope).connect(master);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.02);
}

/** Kart çevirme hışırtısı: süzülmüş çok kısa bir gürültü. */
function flick(ctx: AudioContext, at: number, pitch: number) {
  if (!master) return;
  if (!noise) {
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const envelope = ctx.createGain();
  source.buffer = noise;
  filter.type = "bandpass";
  filter.frequency.value = pitch;
  filter.Q.value = 1.2;
  envelope.gain.setValueAtTime(0.5, at);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
  source.connect(filter).connect(envelope).connect(master);
  source.start(at);
  source.stop(at + 0.05);
}

const SOUNDS: Record<PaddieSound, (ctx: AudioContext, now: number) => void> = {
  // Mesaj gitti: yukarı kayan yumuşak bir "blup".
  send: (ctx, now) => tone(ctx, now, { from: 520, to: 860, duration: 0.14, gain: 0.7 }),
  // Araç çalışıyor: üç kart çevrilir.
  shuffle: (ctx, now) => {
    for (const [index, pitch] of [2600, 3200, 2900].entries())
      flick(ctx, now + index * 0.07, pitch);
  },
  // Onay bekliyor: soran iki nota.
  ask: (ctx, now) => {
    tone(ctx, now, { from: 587, duration: 0.12, type: "triangle", gain: 0.8 });
    tone(ctx, now + 0.12, { from: 880, duration: 0.2, type: "triangle", gain: 0.8 });
  },
  // Uygulandı: oyun jetonu gibi kısa bir arpej.
  success: (ctx, now) => {
    for (const [index, note] of [523, 659, 784, 1047].entries())
      tone(ctx, now + index * 0.07, { from: note, duration: 0.16, type: "triangle", gain: 0.75 });
  },
  // Hata: aşağı inen üzgün iki nota.
  error: (ctx, now) => {
    tone(ctx, now, { from: 392, to: 370, duration: 0.18, gain: 0.8 });
    tone(ctx, now + 0.18, { from: 330, to: 247, duration: 0.32, gain: 0.8 });
  },
  // Dokununca: minik bir cıyaklama.
  boop: (ctx, now) => tone(ctx, now, { from: 900, to: 1500, duration: 0.09, gain: 0.6 }),
};

export function playSound(sound: PaddieSound) {
  const ctx = audio();
  if (!ctx) return;
  // Aynı ses art arda (ör. çok araçlı bir turda her araçta) üst üste binmesin.
  const now = performance.now();
  if (now - (lastPlayed.get(sound) ?? 0) < 900) return;
  lastPlayed.set(sound, now);
  SOUNDS[sound](ctx, ctx.currentTime + 0.01);
}

/** Ruh hâli değişince çalan ses (`mascot-store` çağırır). Konuşurken ve boştayken ses yok. */
export function soundForMood(previous: PaddieMood, next: PaddieMood) {
  if (next === "thinking" && (previous === "idle" || previous === "listening")) playSound("send");
  else if (next === "working") playSound("shuffle");
  else if (next === "approval") playSound("ask");
  else if (next === "success") playSound("success");
  else if (next === "error") playSound("error");
}

export function setSoundEnabled(next: boolean) {
  enabled = next;
  try {
    if (next) window.localStorage.removeItem(STORAGE);
    else window.localStorage.setItem(STORAGE, "off");
  } catch {
    // Hatırlanamazsa yalnızca bu sekmede geçerli.
  }
  for (const listener of listeners) listener();
  if (next) {
    unlocked = true;
    playSound("boop");
  }
}

export function useSoundEnabled() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => enabled,
    () => true,
  );
}
