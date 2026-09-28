import { cn } from "cn";
import { useCallback, useEffect, useRef, useState } from "react";

/** Logo tonu bir kez ölçülür; aynı adres tekrar gösterildiğinde yeniden hesaplanmaz. */
const tones = new Map<string, "dark" | "light">();

/** Opak piksellerin ortalama parlaklığı düşükse logo koyudur (koyu zeminde beyaza çevrilir). */
function measure(image: HTMLImageElement) {
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = Math.max(1, Math.round((size * image.naturalHeight) / image.naturalWidth));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return "light";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) < 128) continue;
    sum += 0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0);
    count++;
  }
  return count && sum / count / 255 < 0.28 ? "dark" : "light";
}

/**
 * Oyunun şeffaf logosu (Steam). Yüklenemezse `onFail` çağrılır, çağıran adı yazıyla gösterir. Koyu logolar
 * (ör. Crusader Kings III) koyu sahnede kaybolmasın diye beyaza çevrilir.
 */
export function GameLogo(props: {
  src: string;
  alt: string;
  className?: string;
  onFail: () => void;
}) {
  const { src, onFail } = props;
  const [tone, setTone] = useState(() => tones.get(src));
  const image = useRef<HTMLImageElement>(null);

  const settle = useCallback(
    (element: HTMLImageElement) => {
      const known = tones.get(src);
      if (known) return setTone(known);
      let measured: "dark" | "light" = "light";
      try {
        measured = measure(element);
      } catch {
        // CORS ya da canvas hatası: logo olduğu gibi gösterilir.
      }
      tones.set(src, measured);
      setTone(measured);
    },
    [src],
  );

  // SSR'da gelen görsel React bağlanmadan yüklenmiş olabilir; o zaman onLoad/onError hiç tetiklenmez.
  useEffect(() => {
    const element = image.current;
    if (!element?.complete) return;
    if (element.naturalWidth === 0) onFail();
    else settle(element);
  }, [settle, onFail]);

  return (
    <img
      ref={image}
      src={src}
      alt={props.alt}
      crossOrigin="anonymous"
      decoding="async"
      onError={onFail}
      onLoad={(event) => settle(event.currentTarget)}
      className={cn(
        "drop-shadow-[0_6px_24px_rgba(0,0,0,0.6)] transition-opacity duration-300",
        tone === undefined && "opacity-0",
        tone === "dark" && "brightness-0 invert",
        props.className,
      )}
    />
  );
}
