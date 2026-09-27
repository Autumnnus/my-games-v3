import { useRouteContext } from "@tanstack/react-router";
import { LanguagesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";
import { getLocale, type Locale, locales, setLocale } from "@/paraglide/runtime";

const labels: Record<Locale, string> = { en: "English", tr: "Türkçe" };

export function LocaleSwitcher() {
  const { user } = useRouteContext({ from: "__root__" });

  async function change(locale: Locale) {
    // Push/e-posta bildirimleri de bu dilde gelsin.
    if (user) {
      await authClient
        .updateUser({ locale } as Parameters<typeof authClient.updateUser>[0])
        .catch(() => {});
    }
    setLocale(locale);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={m.language()}>
          <LanguagesIcon />
          {getLocale().toUpperCase()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={getLocale()}
          onValueChange={(value) => void change(value as Locale)}
        >
          {locales.map((locale) => (
            <DropdownMenuRadioItem key={locale} value={locale}>
              {labels[locale]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
