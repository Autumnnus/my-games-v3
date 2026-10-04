import { cn } from "cn";

/** Mor kumanda ve kütüphane sembolü; erişilebilir ad yanındaki yazıdan veya bağlantıdan gelir. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/icon-192-purple.png"
      alt=""
      width={192}
      height={192}
      decoding="async"
      className={cn("size-9 shrink-0 rounded-[10px]", className)}
    />
  );
}
