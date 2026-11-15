import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

/** Sunucunun bildirdiği yayın sürümü (bkz. `@my-games/core/version`). Yerelde `number` boştur. */
export type AppVersion = {
  number: number | null;
  releasedAt: string | null;
  commit: string | null;
};

function formatReleaseDate(value: string, withTime: boolean) {
  return new Intl.DateTimeFormat(getLocale(), {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {}),
  }).format(new Date(value));
}

/**
 * "v3 · 14 Kas 2026" biçiminde sürüm etiketi; üzerine gelince saat ve commit görünür. `detailed` yönetim
 * panelinde saat ve commit'i de satıra yazar.
 */
export function AppVersionLabel({
  version,
  detailed = false,
}: {
  version: AppVersion | null | undefined;
  detailed?: boolean;
}) {
  if (!version?.number) {
    return <span title={m.app_version_dev()}>dev</span>;
  }
  const date = version.releasedAt ? formatReleaseDate(version.releasedAt, detailed) : null;
  const title = [
    version.releasedAt
      ? m.app_version_title({
          number: version.number,
          date: formatReleaseDate(version.releasedAt, true),
        })
      : `v${version.number}`,
    version.commit,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <span title={title} className="tabular-nums">
      v{version.number}
      {date && ` · ${date}`}
      {detailed && version.commit && (
        <code className="text-foreground/50 ml-1.5 text-xs">{version.commit}</code>
      )}
    </span>
  );
}
