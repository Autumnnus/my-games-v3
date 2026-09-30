import { type ErrorComponentProps, Link, useRouter } from "@tanstack/react-router";
import { CloudOffIcon, RotateCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";
import { m } from "@/paraglide/messages";

/**
 * Sayfa verisi yüklenemediğinde (ağ, sunucu hatası) gösterilir; router'ın varsayılan İngilizce hata ekranı ve
 * yığın izi kullanıcıya hiç görünmez. "Tekrar dene" yükleyicileri yeniden çalıştırır.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div className="animate-rise mx-auto grid max-w-md justify-items-center gap-4 py-20 text-center">
      <span className="glass flex size-14 items-center justify-center rounded-full border border-white/12">
        <CloudOffIcon className="text-foreground/80 size-6" />
      </span>
      <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
        {m.error_page_title()}
      </h1>
      <p className="text-foreground/70 text-[15px]">{errorMessage(error)}</p>
      <div className="flex flex-wrap justify-center gap-2 pt-2">
        <Button
          onClick={() => {
            reset();
            void router.invalidate();
          }}
        >
          <RotateCwIcon />
          {m.error_retry()}
        </Button>
        <Button asChild variant="glass">
          <Link to="/">{m.not_found_back()}</Link>
        </Button>
      </div>
    </div>
  );
}
