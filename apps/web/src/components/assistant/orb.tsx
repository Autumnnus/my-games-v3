import { cn } from "cn";

/** Sayfanın oyunu yoksa asistanın rengi (Salon'un mavisinin açığı). */
export const DEFAULT_ORB = "#8fa8e8";

function parse(hex: string) {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? [...value].map((c) => c + c).join("") : value;
  const number = Number.parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(number)) return null;
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255] as const;
}

function mix(hex: string, target: readonly [number, number, number], amount: number) {
  const rgb = parse(hex) ?? parse(DEFAULT_ORB) ?? ([143, 168, 232] as const);
  const channel = (index: 0 | 1 | 2) =>
    Math.round(rgb[index] + (target[index] - rgb[index]) * amount);
  return `rgb(${channel(0)} ${channel(1)} ${channel(2)})`;
}

/** Kürenin üç tonu: parlak çekirdek, ana renk, gölge. Kapak rengi çok koyu/açık olsa da okunur kalır. */
export function orbColors(color: string | null | undefined) {
  const base = color ?? DEFAULT_ORB;
  return {
    "--orb-0": mix(base, [255, 255, 255], 0.82),
    "--orb-1": mix(base, [255, 255, 255], 0.28),
    "--orb-2": mix(base, [8, 9, 12], 0.72),
  } as React.CSSProperties;
}

/**
 * My games AI'ın işareti: rengini bulunduğun sayfanın oyunundan alan küçük bir küre. Büyük hâlinde etrafında
 * dönen küçük bir uydu vardır (sen ve oyunun).
 */
export function Orb({
  color,
  size = 28,
  satellite = false,
  className,
}: {
  color?: string | null;
  size?: number;
  satellite?: boolean;
  className?: string;
}) {
  const style = { ...orbColors(color), width: size, height: size };
  if (!satellite) {
    return (
      <span
        aria-hidden
        className={cn("orb inline-block shrink-0 rounded-full", className)}
        style={style}
      />
    );
  }
  const moon = Math.max(10, Math.round(size * 0.24));
  return (
    <span
      aria-hidden
      className={cn("animate-float relative inline-block shrink-0", className)}
      style={{ width: size * 1.4, height: size * 1.25 }}
    >
      <span
        className="absolute rounded-full opacity-45 blur-2xl"
        style={{ ...orbColors(color), inset: "10%", backgroundColor: "var(--orb-1)" }}
      />
      <span
        className="orb absolute rounded-full"
        style={{ ...style, left: size * 0.2, top: size * 0.12 }}
      />
      <span
        className="animate-orbit absolute"
        style={{ width: size, height: size, left: size * 0.2, top: size * 0.12 }}
      >
        <span
          className="orb absolute rounded-full"
          style={{
            ...orbColors("#e2c88f"),
            width: moon,
            height: moon,
            left: size * 0.82,
            top: -moon * 0.2,
          }}
        />
      </span>
    </span>
  );
}
