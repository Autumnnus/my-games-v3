import { useRouteContext } from "@tanstack/react-router";
import { cn } from "cn";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Toaster as Sonner } from "sonner";

const tones = {
  success: "bg-live/14 text-live",
  error: "bg-destructive/16 text-destructive",
  warning: "bg-amber-400/15 text-amber-300",
  info: "bg-sky-400/15 text-sky-300",
  loading: "bg-white/10 text-foreground/80",
} as const;

function ToastIcon({ tone, children }: { tone: keyof typeof tones; children: ReactNode }) {
  return (
    <span
      className={cn(
        "flex size-9 items-center justify-center rounded-full [&_svg]:size-[18px]",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/**
 * Salon temasına uygun bildirimler: koyu cam kart, türüne göre renkli simge, hap biçimli eylem düğmesi.
 * Altta ortada durur (üstte başlık menüsünün önünü kapatıyordu); telefonda alt sekme çubuğunun üstüne çıkar.
 * Yığılma/kaydırma davranışı sonner'ın; görünüm tamamen buradaki sınıflardan gelir (`unstyled`).
 */
export function Toaster() {
  const { user } = useRouteContext({ from: "__root__" });
  return (
    <Sonner
      theme="dark"
      position="bottom-center"
      gap={10}
      visibleToasts={4}
      offset={{ bottom: 28 }}
      mobileOffset={{ bottom: user ? 104 : 16, left: 12, right: 12 }}
      style={{ "--width": "400px" } as CSSProperties}
      icons={{
        success: (
          <ToastIcon tone="success">
            <CircleCheckIcon />
          </ToastIcon>
        ),
        error: (
          <ToastIcon tone="error">
            <CircleAlertIcon />
          </ToastIcon>
        ),
        warning: (
          <ToastIcon tone="warning">
            <TriangleAlertIcon />
          </ToastIcon>
        ),
        info: (
          <ToastIcon tone="info">
            <InfoIcon />
          </ToastIcon>
        ),
        loading: (
          <ToastIcon tone="loading">
            <LoaderCircleIcon className="animate-spin" />
          </ToastIcon>
        ),
      }}
      toastOptions={{
        unstyled: true,
        duration: 5000,
        classNames: {
          toast:
            "font-sans text-foreground pointer-events-auto flex w-full items-center gap-3 rounded-[22px] border border-white/10 bg-[rgb(23_24_31/0.92)] py-2.5 pr-2.5 pl-2.5 text-sm not-has-[[data-icon]]:pl-5 shadow-[0_24px_60px_-18px_rgb(0_0_0/0.95),inset_0_1px_0_rgb(255_255_255/0.07)] backdrop-blur-xl backdrop-saturate-150",
          icon: "shrink-0",
          content: "grid min-w-0 flex-1 gap-0.5 py-1.5 pr-1.5",
          title: "leading-snug font-semibold",
          description: "text-foreground/65 text-[13px] leading-snug",
          actionButton:
            "bg-foreground text-background hover:bg-foreground/88 h-9 shrink-0 cursor-pointer rounded-full px-4 text-[13px] font-bold transition-colors",
          cancelButton:
            "text-foreground/70 hover:text-foreground h-9 shrink-0 cursor-pointer rounded-full px-3 text-[13px] font-semibold transition-colors hover:bg-white/10",
          error: "border-destructive/25",
          success: "border-live/15",
        },
      }}
    />
  );
}
