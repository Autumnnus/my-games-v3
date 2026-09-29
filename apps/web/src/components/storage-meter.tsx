import { cn } from "cn";
import { formatBytes } from "@/lib/format";
import type { StorageUsage } from "@/lib/queries";
import { m } from "@/paraglide/messages";

/** Kota çubuğu. `adding`: yüklenmek üzere olan byte'lar (çubukta ayrı renkte gösterilir). */
export function StorageMeter(props: { usage: StorageUsage; adding?: number; className?: string }) {
  const { usedBytes, quotaBytes } = props.usage;
  const adding = props.adding ?? 0;
  const percent = (bytes: number) =>
    quotaBytes > 0 ? Math.min(100, (bytes / quotaBytes) * 100) : 100;
  const over = usedBytes + adding > quotaBytes;

  return (
    <div className={cn("grid gap-1.5", props.className)}>
      {/* Çubuk görsel; aynı bilgi altındaki metinde. */}
      <div className="bg-muted relative h-2 overflow-hidden rounded-full" aria-hidden>
        <div
          className="bg-primary absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${percent(usedBytes)}%` }}
        />
        {adding > 0 && (
          <div
            className={cn(
              "absolute inset-y-0 rounded-full opacity-60",
              over ? "bg-destructive" : "bg-primary",
            )}
            style={{
              left: `${percent(usedBytes)}%`,
              width: `${Math.max(0, percent(usedBytes + adding) - percent(usedBytes))}%`,
            }}
          />
        )}
      </div>
      <div className="text-muted-foreground flex flex-wrap justify-between gap-x-3 text-xs">
        <span>
          {m.storage_used({ used: formatBytes(usedBytes), quota: formatBytes(quotaBytes) })}
        </span>
        {adding > 0 && (
          <span className={cn(over && "text-destructive font-medium")}>
            {m.storage_this_upload({ size: formatBytes(adding) })}
          </span>
        )}
      </div>
    </div>
  );
}
