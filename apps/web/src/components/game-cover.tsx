import { cn } from "cn";
import { GamepadIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** 3:4 oyun kapağı; görsel yoksa ya da yüklenemezse sade bir yer tutucu gösterir. */
export function GameCover(props: {
  url: string | null | undefined;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const image = useRef<HTMLImageElement>(null);

  // SSR ile gelen görsel React yüklenmeden hata verebilir; o durumda onError hiç tetiklenmez.
  useEffect(() => {
    const element = image.current;
    if (element?.complete && element.naturalWidth === 0) setFailed(true);
  }, []);
  return (
    <div
      className={cn(
        "bg-muted relative aspect-[3/4] w-full overflow-hidden rounded-md border",
        props.className,
      )}
    >
      {props.url && !failed ? (
        <img
          ref={image}
          src={props.url}
          alt={props.name}
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailed(true)}
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
