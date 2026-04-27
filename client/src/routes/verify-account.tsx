import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { motion } from "framer-motion";
import { CheckCircle, XCircle } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { authApi } from "@/api/auth.api";
import { pageTransition } from "@/lib/motion";

export const Route = createFileRoute("/verify-account")({
  validateSearch: z.object({ verificationToken: z.string().optional() }),
  component: VerifyAccountPage,
});

function VerifyAccountPage() {
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
            <p style={{ color: "rgba(255,255,255,0.6)" }}>
              Hesabın doğrulanıyor...
            </p>
          </div>
        )}
        {state === "success" && (
          <div className="flex flex-col items-center gap-4">
            <CheckCircle size={40} style={{ color: "#22c55e" }} />
            <h2
              className="text-lg font-semibold"
              style={{ color: "rgba(255,255,255,0.95)" }}
            >
              Hesabın doğrulandı!
            </h2>
            <Link
              to="/login"
              className="text-sm hover:underline"
              style={{ color: "rgba(168,85,247,0.9)" }}
            >
              Giriş yap
            </Link>
          </div>
        )}
        {state === "error" && (
          <div className="flex flex-col items-center gap-4">
            <XCircle size={40} style={{ color: "#ef4444" }} />
            <h2
              className="text-lg font-semibold"
              style={{ color: "rgba(255,255,255,0.95)" }}
            >
              Doğrulama başarısız
            </h2>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
              Bağlantı geçersiz veya süresi dolmuş.
            </p>
          </div>
        )}
      </GlassCard>
    </motion.div>
  );
}
