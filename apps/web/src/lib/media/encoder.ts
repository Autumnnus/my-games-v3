import type { MediaPurpose, MediaVariantName, UploadQuality } from "@my-games/shared";

export type EncodeRequest = {
  id: number;
  file: Blob;
  purpose: MediaPurpose;
  quality: UploadQuality;
};

export type EncodedVariant = {
  name: MediaVariantName;
  blob: Blob;
  contentType: string;
  width: number;
  height: number;
};

export type EncodedImage = { variants: EncodedVariant[]; width: number; height: number };

export type EncodeResponse =
  | ({ id: number; ok: true } & EncodedImage)
  | { id: number; ok: false; error: string };

/**
 * Worker havuzu. AVIF kodlaması tek çekirdekte görsel başına ~1 sn (hızlı masaüstü) sürer; birkaç worker
 * paralel çalışır. Worker'lar ve kodlayıcı WASM'ı (~3,5 MB) ilk görselde yüklenir, boşta kalınca kapanır.
 */
const IDLE_MS = 60_000;

type Slot = { worker: Worker; busy: boolean };
type Job = {
  request: EncodeRequest;
  resolve: (image: EncodedImage) => void;
  reject: (error: Error) => void;
};

let slots: Slot[] = [];
const queue: Job[] = [];
const running = new Map<number, Job>();
let nextId = 1;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

function poolSize() {
  const cores = typeof navigator !== "undefined" ? (navigator.hardwareConcurrency ?? 2) : 2;
  return Math.min(3, Math.max(1, cores - 1));
}

function ensurePool() {
  if (slots.length > 0) return;
  slots = Array.from({ length: poolSize() }, () => {
    const worker = new Worker(new URL("./encoder.worker.ts", import.meta.url), { type: "module" });
    const slot: Slot = { worker, busy: false };
    worker.onmessage = (event: MessageEvent<EncodeResponse>) => {
      const job = running.get(event.data.id);
      running.delete(event.data.id);
      slot.busy = false;
      if (job) {
        if (event.data.ok) {
          const { id: _id, ok: _ok, ...image } = event.data;
          job.resolve(image);
        } else {
          job.reject(new Error(event.data.error));
        }
      }
      pump();
    };
    worker.onerror = (event) => {
      // Worker çöktüyse (ör. bellek) üzerindeki işi başarısız say, havuzu baştan kur.
      for (const job of running.values()) job.reject(new Error(event.message || "encoder crashed"));
      running.clear();
      shutdown();
      pump();
    };
    return slot;
  });
}

function shutdown() {
  for (const slot of slots) slot.worker.terminate();
  slots = [];
}

function pump() {
  if (idleTimer) clearTimeout(idleTimer);
  if (queue.length > 0) ensurePool();
  for (const slot of slots) {
    const job = !slot.busy ? queue.shift() : undefined;
    if (!job) continue;
    slot.busy = true;
    running.set(job.request.id, job);
    slot.worker.postMessage(job.request);
  }
  if (queue.length === 0 && running.size === 0) idleTimer = setTimeout(shutdown, IDLE_MS);
}

/** Görselin yüklenecek varyantlarını üretir (optimize: AVIF; orijinal: dosyanın kendisi + kopyalar). */
export function encodeImage(file: Blob, purpose: MediaPurpose, quality: UploadQuality) {
  return new Promise<EncodedImage>((resolve, reject) => {
    queue.push({ request: { id: nextId++, file, purpose, quality }, resolve, reject });
    pump();
  });
}
