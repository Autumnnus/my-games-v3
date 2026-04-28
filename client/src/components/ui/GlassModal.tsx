import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { modalOverlay, modalContent } from "@/lib/motion";
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const maxWidth = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-2xl",
  }[size];

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4 p-0">
          <motion.div
            className="glass-overlay absolute inset-0"
            variants={modalOverlay}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
          />
          <motion.div
            className={`glass-card relative w-full ${maxWidth} p-6 z-10 flex flex-col ${allowOverflow ? "overflow-visible" : "overflow-hidden"}`}
            style={{ maxHeight: "calc(100dvh - 32px)" }}
            variants={modalContent}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {(title || !hideClose) && (
              <div className="flex items-center justify-between mb-5 shrink-0">
                {title && (
                  <h2
                    className="text-lg font-semibold"
                    style={{ color: "var(--theme-text-primary)" }}
                  >
                    {title}
                  </h2>
                )}
                {!hideClose && (
                  <GlassButton
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    className="ml-auto p-1.5 rounded-lg"
                    aria-label={t('common.aria.close')}
                  >
                    <X size={16} />
                  </GlassButton>
                )}
              </div>
            )}
            <div
              className={`min-h-0 flex-1 ${allowOverflow ? "overflow-visible" : "overflow-hidden"}`}
            >
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
