import { authApi } from "@/api/auth.api";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { pageTransition } from "@/lib/motion";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { CheckCircle, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

export const Route = createFileRoute("/verify-account")({
  validateSearch: z.object({ verificationToken: z.string().optional() }),
  component: VerifyAccountPage,
});

function VerifyAccountPage() {
  const { t } = useTranslation();
  const { verificationToken } = Route.useSearch();
  const [state, setState] = useState<"loading" | "success" | "error">(
    "loading",
  );

  useEffect(() => {
    if (!verificationToken) {
      setState("error");
      return;
    }
    authApi
      .verifyAccount(verificationToken)
      .then(() => setState("success"))
      .catch(() => setState("error"));
  }, [verificationToken]);

  return (
    <motion.div
      className="min-h-[calc(100dvh-56px)] flex items-center justify-center px-4"
      variants={pageTransition}
      initial="initial"
      animate="animate"
    >
      <GlassCard className="p-8 max-w-sm w-full text-center">
        {state === "loading" && (
          <div className="flex flex-col items-center gap-3">
            <LoadingSpinner size="lg" />
            <p className="text-text-secondary">
              {t("translation:verifyAccount.loading")}
            </p>
          </div>
        )}
        {state === "success" && (
          <div className="flex flex-col items-center gap-4">
            <CheckCircle size={40} style={{ color: "#22c55e" }} />
            <h2 className="text-lg font-semibold text-text-primary">
              {t("translation:verifyAccount.successTitle")}
            </h2>
            <Link to="/login" className="text-sm hover:underline text-accent">
              {t("translation:verifyAccount.goToLogin")}
            </Link>
          </div>
        )}
        {state === "error" && (
          <div className="flex flex-col items-center gap-4">
            <XCircle size={40} style={{ color: "#ef4444" }} />
            <h2 className="text-lg font-semibold text-text-primary">
              {t("translation:verifyAccount.errorTitle")}
            </h2>
            <p className="text-sm text-text-muted">
              {t("translation:verifyAccount.errorSubtitle")}
            </p>
          </div>
        )}
      </GlassCard>
    </motion.div>
  );
}
