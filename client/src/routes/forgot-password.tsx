import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, CheckCircle, ArrowLeft } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassInput } from "@/components/ui/GlassInput";
import { GlassButton } from "@/components/ui/GlassButton";
import { useForgotPassword } from "@/hooks/useAuth";
import { pageTransition, scaleIn } from "@/lib/motion";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

const schema = z.object({ email: z.string().email("Geçerli bir e-posta gir") });
type FormData = z.infer<typeof schema>;

function ForgotPasswordPage() {
  const forgot = useForgotPassword();
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  return (
    <motion.div
      className="min-h-[calc(100dvh-56px)] flex items-center justify-center px-4 py-12"
      variants={pageTransition}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="w-full max-w-md">
        <GlassCard className="p-6">
          <AnimatePresence mode="wait">
            {!sent ? (
              <motion.div
                key="form"
                variants={scaleIn}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex flex-col gap-5"
              >
                <div>
                  <h1
                    className="text-xl font-bold"
                    style={{ color: "rgba(255,255,255,0.95)" }}
                  >
                    Şifreni mi unuttun?
                  </h1>
                  <p
                    className="text-sm mt-1"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    E-posta adresine sıfırlama bağlantısı göndereceğiz.
                  </p>
                </div>
                <form
                  onSubmit={handleSubmit((data) =>
                    forgot.mutate(data, { onSuccess: () => setSent(true) }),
                  )}
                  className="flex flex-col gap-4"
                >
                  <GlassInput
                    label="E-posta"
                    type="email"
                    placeholder="sen@example.com"
                    leftIcon={<Mail size={15} />}
                    error={errors.email?.message}
                    {...register("email")}
                  />
                  <GlassButton
                    type="submit"
                    variant="primary"
                    loading={forgot.isPending}
                    className="w-full"
                  >
                    Sıfırlama Bağlantısı Gönder
                  </GlassButton>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="success"
                variants={scaleIn}
                initial="initial"
                animate="animate"
                className="flex flex-col items-center gap-4 py-4 text-center"
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{
                    background: "rgba(34,197,94,0.15)",
                    border: "1px solid rgba(34,197,94,0.3)",
                  }}
                >
                  <CheckCircle size={28} style={{ color: "#22c55e" }} />
                </div>
                <div>
                  <h2
                    className="text-lg font-semibold"
                    style={{ color: "rgba(255,255,255,0.95)" }}
                  >
                    E-posta gönderildi
                  </h2>
                  <p
                    className="text-sm mt-1"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    Gelen kutunu kontrol et ve şifreni sıfırla.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </GlassCard>

        <div className="flex justify-center mt-5">
          <Link
            to="/login"
            className="flex items-center gap-1.5 text-sm hover:underline"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            <ArrowLeft size={14} /> Giriş sayfasına dön
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
