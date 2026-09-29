import { cn } from "cn";
import { GamepadIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const STEAM_CAPSULE = /\/library_600x900\.jpg$/;
/** Steam'in yatay başlık görseli; 3:4 kutuda kırpılmasın diye ortalanır. */
const LANDSCAPE = /\/header\.jpg(\?|$)/;

/** Bazı Steam oyunlarının dikey kapağı yok; o zaman yatay başlık görseli denenir. */
function fallbackOf(url: string) {
  return STEAM_CAPSULE.test(url) ? url.replace(STEAM_CAPSULE, "/header.jpg") : null;
}

/** 3:4 oyun kapağı; görsel yoksa ya da yüklenemezse sade bir yer tutucu gösterir. */
export function GameCover(props: {
  url: string | null | undefined;
  name: string;
  className?: string;
  /** `view-transition-name`: aynı adı taşıyan kapak sayfa geçişinde yerinde uçar. */
  transitionName?: string;
  /** Görsel yüklenene kadar görünen zemin (kapak rengi). */
  color?: string | null;
}) {
  // 0: asıl görsel, 1: yedek görsel, 2: yer tutucu. Adres değişirse (ör. IGDB eşleşmesi) baştan denenir.
  const [state, setState] = useState({ url: props.url, attempt: 0 });
  const attempt = state.url === props.url ? state.attempt : 0;
  const image = useRef<HTMLImageElement>(null);
  const fallback = props.url ? fallbackOf(props.url) : null;
  const src = attempt === 0 ? props.url : attempt === 1 ? fallback : null;
  const fail = useCallback(
    () => setState({ url: props.url, attempt: attempt === 0 && fallback ? 1 : 2 }),
    [props.url, attempt, fallback],
  );

  // SSR ile gelen görsel React yüklenmeden hata verebilir; o durumda onError hiç tetiklenmez.
  useEffect(() => {
    const element = image.current;
    if (src && element?.complete && element.naturalWidth === 0) fail();
  }, [src, fail]);
  return (
    <div
      data-cover
      className={cn(
        "bg-muted relative aspect-[2/3] w-full overflow-hidden rounded-xl ring-1 ring-white/6",
        props.className,
      )}
      style={{
        viewTransitionName: props.transitionName,
        backgroundColor: props.color ?? undefined,
      }}
    >
      {src ? (
        <img
          key={src}
          ref={image}
          src={src}
          alt={props.name}
          loading="lazy"
          className={cn("size-full", LANDSCAPE.test(src) ? "object-contain" : "object-cover")}
          onError={fail}
        />
      ) : (
        <div className="text-muted-foreground flex size-full flex-col items-center justify-center gap-2 p-2 text-center text-xs">
          <GamepadIcon className="size-6" />
          <span className="line-clamp-3">{props.name}</span>
        </div>
      )}
    </div>
  );
}
