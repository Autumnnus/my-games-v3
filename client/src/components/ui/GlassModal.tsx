import { cn } from "@/lib/cn";
import { modalContent, modalOverlay } from "@/lib/motion";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GlassButton } from "./GlassButton";

interface GlassModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  hideClose?: boolean;
  allowOverflow?: boolean;
}

const sizeClass = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
} as const;

export function GlassModal({
  open,
  onClose,
  title,
  children,
  size = "md",
  hideClose = false,
  allowOverflow = false,
}: GlassModalProps) {
  const { t } = useTranslation();

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <AnimatePresence>
          {open && (
            <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4 p-0">
              <Dialog.Overlay asChild>
                <motion.div
                  className="glass-overlay absolute inset-0"
                  variants={modalOverlay}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                />
              </Dialog.Overlay>

              <Dialog.Content
                asChild
                onEscapeKeyDown={onClose}
                onPointerDownOutside={(e) => {
                  // Don't close when clicking inside a Radix portal (e.g. Popover, Select dropdown)
                  const target = e.target as HTMLElement;
                  if (target.closest("[data-radix-popper-content-wrapper]"))
                    return;
                  onClose();
                }}
              >
                <motion.div
                  className={cn(
                    "glass-card relative w-full z-10 flex flex-col p-6",
                    sizeClass[size],
                    allowOverflow ? "overflow-visible" : "overflow-hidden",
                  )}
                  style={{ maxHeight: "calc(100dvh - 32px)" }}
                  variants={modalContent}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  {(title || !hideClose) && (
                    <div className="flex items-center justify-between mb-5 shrink-0">
                      {title && (
                        <Dialog.Title className="text-lg font-semibold text-text-primary">
                          {title}
                        </Dialog.Title>
                      )}
                      {!hideClose && (
                        <Dialog.Close asChild>
                          <GlassButton
                            variant="ghost"
                            size="sm"
                            onClick={onClose}
                            className="ml-auto p-1.5 rounded-lg"
                            aria-label={t("translation:common.aria.close")}
                          >
                            <X size={16} />
                          </GlassButton>
                        </Dialog.Close>
                      )}
                    </div>
                  )}
                  <div
                    className={cn(
                      "min-h-0 flex-1",
                      allowOverflow ? "overflow-visible" : "overflow-hidden",
                    )}
                  >
                    {children}
                  </div>
                </motion.div>
              </Dialog.Content>
            </div>
          )}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
