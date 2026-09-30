import { LanguagesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { changeLocale, localeLabels } from "@/lib/locale";
import { m } from "@/paraglide/messages";
import { getLocale, type Locale, locales } from "@/paraglide/runtime";

/**
 * Oturum açmamış ziyaretçiler için başlıktaki dil menüsü. Oturum açıkken dil Ayarlar'dan (ve ⌘K'dan) değişir.
 */
export function LocaleSwitcher() {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={m.language()}>
          <LanguagesIcon />
          {getLocale().toUpperCase()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={getLocale()}
          onValueChange={(value) => void changeLocale(value as Locale, { signedIn: false })}
        >
          {locales.map((locale) => (
            <DropdownMenuRadioItem key={locale} value={locale} lang={locale}>
              {localeLabels[locale]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
