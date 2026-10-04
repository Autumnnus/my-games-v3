import { useQuery } from "@tanstack/react-query";
import { Link, useRouteContext, useRouterState } from "@tanstack/react-router";
import { cn } from "cn";
import { BrandMark } from "@/components/brand-mark";
import { metaQuery } from "@/lib/meta";
import { m } from "@/paraglide/messages";

/** Yasal bağlantılar ve iletişim. Telefonda giriş yapmışken alt sekme çubuğunun altında kalmasın diye boşluk bırakır. */
export function SiteFooter() {
  const { user } = useRouteContext({ from: "__root__" });
  const meta = useQuery(metaQuery);
  // Asistanın tam görünümü ekran yüksekliğine oturur; altına footer girmesin.
  const fullScreen = useRouterState({ select: (state) => state.location.pathname === "/ai" });
  const contact = meta.data?.contactEmail;
  if (fullScreen) return null;
  const link = "hover:text-foreground transition-colors";
  return (
    <footer
      className={cn(
        "text-muted-foreground mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/8 px-4 pt-6 text-xs sm:px-6 lg:px-8",
        user ? "pb-32 md:pb-8" : "pb-8",
      )}
    >
      <span className="flex items-center gap-2">
        <BrandMark className="size-6 rounded-md" />
        <span>
          © {new Date().getFullYear()} {m.app_name()}
        </span>
      </span>
      <Link to="/privacy" className={link}>
        {m.legal_privacy()}
      </Link>
      <Link to="/terms" className={link}>
        {m.legal_terms()}
      </Link>
      {contact && (
        <a href={`mailto:${contact}`} className={link}>
          {m.legal_contact()}
        </a>
      )}
    </footer>
  );
}
