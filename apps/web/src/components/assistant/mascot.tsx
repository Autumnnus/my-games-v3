import { cn } from "cn";
import { Volume2Icon, VolumeOffIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { m } from "@/paraglide/messages";
import { setSoundEnabled, useSoundEnabled } from "./mascot-sound";
import { type PaddieMood, usePaddieMood } from "./mascot-store";

const INK = "#1d1533";
const SPARK = "M0-6L1.5-1.5L6 0L1.5 1.5L0 6L-1.5 1.5L-6 0L-1.5-1.5Z";

/** Sayfada oyun yoksa arkadaki ışık (marka morunun açığı). */
export const DEFAULT_GLOW = "#a78bfa";

/**
 * Arkadaki ışığın rengi: oyunun tonu korunur, doygunluğu ve parlaklığı yükseltilir. Kapak renkleri çoğu zaman
 * koyu ve soluktur (kahve, lacivert); olduğu gibi kullanılınca karanlık zeminde ışık görünmüyordu. Gri bir
 * renkte (tonu yok) ve okunamayan renkte marka moru.
 */
export function glowColor(hex: string | null | undefined) {
  const value = (hex ?? "").replace("#", "");
  const full = value.length === 3 ? [...value].map((c) => c + c).join("") : value.slice(0, 6);
  const number = Number.parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(number)) return DEFAULT_GLOW;
  const r = ((number >> 16) & 255) / 255;
  const g = ((number >> 8) & 255) / 255;
  const b = (number & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta < 0.04) return DEFAULT_GLOW;
  const hue =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return `hsl(${Math.round((hue * 60 + 360) % 360)} 85% 64%)`;
}

/**
 * Paddie: logodaki mor kumanda canlanmış hâli; yüz düğmeleri gözü, koleksiyon kartları kulağı. Ruh hâline göre
 * hareket eder (animasyonlar `styles.css` `.paddie` altında): boşta süzülür ve göz kırpar, sen yazarken mesaj
 * kutusuna bakar, düşünürken düşünce baloncukları çıkar, araç çalışırken kartlarını karıştırır, cevap yazarken
 * konuşur, onay beklerken başını yana eğer, değişiklik uygulanınca zıplar, hata olunca üzülür.
 *
 * `still`: geçmiş mesajlar ve küçük simgeler gibi yan yana çok sayıda olduğu yerlerde süzülme/göz kırpma yok.
 * `glow`: arkada bulunduğun sayfanın oyun renginde yumuşak bir ışık (bkz. `glowColor`); ruh hâline göre nefes
 * alır, çalışırken hızlanır, sevinince parlar. Küçük boyutta gölge çizilmez ve çerçeve gövdeye daralır.
 */
export function Paddie({
  mood = "idle",
  size = 28,
  still = false,
  glow,
  className,
}: {
  mood?: PaddieMood;
  size?: number;
  still?: boolean;
  /** Işığın oyun rengi; `null` sayfada oyun yok (marka moru), `undefined` ışık yok. */
  glow?: string | null;
  className?: string;
}) {
  const compact = size < 40;
  const glowId = `paddie-glow-${useId().replace(/[^\w-]/g, "")}`;
  return (
    <svg
      aria-hidden
      viewBox={compact ? "8 9 104 94" : "0 0 120 120"}
      width={size}
      height={size}
      data-mood={mood}
      data-still={still || undefined}
      className={cn("paddie shrink-0 overflow-visible", className)}
    >
      {glow !== undefined && (
        <>
          <defs>
            <radialGradient id={glowId}>
              <stop offset="0" stopColor={glowColor(glow)} stopOpacity=".9" />
              <stop offset=".5" stopColor={glowColor(glow)} stopOpacity=".5" />
              <stop offset=".75" stopColor={glowColor(glow)} stopOpacity=".16" />
              <stop offset="1" stopColor={glowColor(glow)} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle
            className="p-glow"
            cx="60"
            cy="64"
            r={compact ? 58 : 72}
            fill={`url(#${glowId})`}
          />
        </>
      )}
      {!compact && (
        <ellipse className="p-shadow" cx="60" cy="110" rx="26" ry="3.5" fill="#000" opacity=".45" />
      )}
      <g className="p-bob">
        <g className="p-c1">
          <rect
            x="32"
            y="16"
            width="30"
            height="36"
            rx="6"
            fill="#8b6ff0"
            transform="rotate(-12 47 34)"
          />
        </g>
        <g className="p-c2">
          <rect
            x="58"
            y="14"
            width="28"
            height="34"
            rx="6"
            fill="#6f52dc"
            transform="rotate(11 72 31)"
          />
        </g>
        <path
          d="M60 42C72 42 80 40 88 42C100 45 106 58 108 74C110 90 106 100 98 100C91 100 87 94 82 88C78 84 72 82 60 82C48 82 42 84 38 88C33 94 29 100 22 100C14 100 10 90 12 74C14 58 20 45 32 42C40 40 48 42 60 42Z"
          fill="#a78bfa"
        />
        <path
          d="M28 49C36 46 44 46 50 46"
          stroke="#cbbcff"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          opacity=".7"
        />
        <path d="M20.5 83h8M24.5 79v8" stroke="#7e62e6" strokeWidth="2.6" strokeLinecap="round" />
        <circle className="p-btn" cx="94" cy="81" r="2" fill="#7e62e6" />
        <circle className="p-btn" cx="99" cy="85.5" r="2" fill="#7e62e6" />
        <ellipse cx="37" cy="70" rx="5" ry="2.6" fill="#f472b6" opacity=".45" />
        <ellipse cx="83" cy="70" rx="5" ry="2.6" fill="#f472b6" opacity=".45" />
        <g className="p-look">
          <g className="p-eyes">
            <ellipse cx="47" cy="61" rx="5" ry="6.4" fill={INK} />
            <ellipse cx="73" cy="61" rx="5" ry="6.4" fill={INK} />
            <circle cx="49" cy="58.5" r="1.7" fill="#fff" />
            <circle cx="75" cy="58.5" r="1.7" fill="#fff" />
          </g>
        </g>
        <path
          className="p-alt p-happy"
          d="M42 62q5-6 10 0M68 62q5-6 10 0"
          stroke={INK}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        <path
          className="p-alt p-sad"
          d="M43 57l7 4-7 4M77 57l-7 4 7 4"
          stroke={INK}
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          className="p-mouth"
          d="M56.5 70q3.5 3.2 7 0"
          stroke={INK}
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
        />
        <path
          className="p-alt p-frown"
          d="M56.5 73q3.5-3 7 0"
          stroke={INK}
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
        />
        <ellipse className="p-alt p-talk" cx="60" cy="71" rx="3" ry="2.6" fill={INK} />
        <path className="p-fx p-sweat" d="M95 44q4 6 0 8.5q-4-2.5 0-8.5z" fill="#8fc5ff" />
      </g>
      <g className="p-fx p-dots" fill="#cbbcff">
        <circle cx="97" cy="32" r="2.4" />
        <circle cx="104" cy="23" r="3" />
        <circle cx="112" cy="13" r="3.6" />
      </g>
      <g className="p-fx p-ask">
        <circle cx="102" cy="26" r="10" fill="#f2c77a" />
        <path
          d="M98.6 23.2q.4-3.6 3.6-3.6q3.6 0 3.6 3.2q0 2-2.4 3q-1.2.6-1.2 2"
          stroke="#3a2a08"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="102.2" cy="31.6" r="1.3" fill="#3a2a08" />
      </g>
      <g className="p-fx p-spark" fill="#f2c77a">
        <g transform="translate(16 34)">
          <path d={SPARK} />
        </g>
        <g transform="translate(104 30) scale(1.15)">
          <path d={SPARK} />
        </g>
        <g transform="translate(110 70) scale(.85)">
          <path d={SPARK} />
        </g>
      </g>
    </svg>
  );
}

/** Sohbetin ortak ruh hâliyle hareket eden Paddie (başlık düğmesi, karşılama, çalışma sahnesi). */
export function LivePaddie(props: { size?: number; glow?: string | null; className?: string }) {
  const mood = usePaddieMood();
  return <Paddie mood={mood} {...props} />;
}

/** Paddie'nin seslerini aç/kapat (panel ve tam ekran başlığında). */
export function PaddieSoundToggle({ className }: { className?: string }) {
  const on = useSoundEnabled();
  return (
    <button
      type="button"
      aria-label={on ? m.ai_sound_off() : m.ai_sound_on()}
      title={on ? m.ai_sound_off() : m.ai_sound_on()}
      aria-pressed={!on}
      onClick={() => setSoundEnabled(!on)}
      className={className}
    >
      {on ? <Volume2Icon className="size-[18px]" /> : <VolumeOffIcon className="size-[18px]" />}
    </button>
  );
}

/**
 * Kısa bir an (ör. Paddie'ye dokununca sevinmesi): `pulse` 0'dan başlar, her artışta `ms` boyunca `true` döner.
 */
export function useFlash(pulse: number, ms = 1300) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (pulse === 0) return;
    setOn(true);
    const timer = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(timer);
  }, [pulse, ms]);
  return on;
}
