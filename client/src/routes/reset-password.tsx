import { createFileRoute, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassInput } from "@/components/ui/GlassInput";
import { GlassButton } from "@/components/ui/GlassButton";
import { useResetPassword } from "@/hooks/useAuth";
import { pageTransition } from "@/lib/motion";

export const Route = createFileRoute("/reset-password")({
  validateSearch: z.object({ resetPasswordToken: z.string().optional() }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useTranslation();
  const { resetPasswordToken } = Route.useSearch();
  const reset = useResetPassword();
  const schema = z
    .object({
      password: z.string().min(6, t('auth.passwordTooShort')),
      confirmPassword: z.string(),
    })
    .refine((d) => d.password === d.confirmPassword, {
      message: t('resetPassword.passwordMismatch'),
      path: ["confirmPassword"],
    });
  type FormData = z.infer<typeof schema>;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  if (!resetPasswordToken) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100dvh-56px)] px-4">
        <GlassCard className="p-6 max-w-sm w-full text-center">
          <p style={{ color: "rgba(239,68,68,0.9)" }}>
            {t('resetPassword.invalidToken')}
          </p>
          <Link
            to="/forgot-password"
            className="text-sm mt-3 block hover:underline"
            style={{ color: "rgba(168,85,247,0.9)" }}
          >
            {t('resetPassword.requestNewLink')}
          </Link>
        </GlassCard>
      </div>
    );
  }

  return (
    <motion.div
      className="min-h-[calc(100dvh-56px)] flex items-center justify-center px-4 py-12"
      variants={pageTransition}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1
            className="text-2xl font-bold"
            style={{ color: "rgba(255,255,255,0.95)" }}
          >
            {t('resetPassword.title')}
          </h1>
          <p
            className="text-sm mt-1"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            {t('resetPassword.hint')}
          </p>
        </div>

        <GlassCard className="p-6">
          <form
            onSubmit={handleSubmit((data) =>
              reset.mutate({
                token: resetPasswordToken,
                password: data.password,
              }),
            )}
            className="flex flex-col gap-4"
          >
            <GlassInput
              label={t('resetPassword.newPassword')}
              type="password"
              placeholder={t('auth.passwordPlaceholder')}
              leftIcon={<Lock size={15} />}
              error={errors.password?.message}
              {...register("password")}
            />
            <GlassInput
              label={t('resetPassword.confirmPassword')}
              type="password"
              placeholder={t('auth.passwordPlaceholder')}
              leftIcon={<Lock size={15} />}
              error={errors.confirmPassword?.message}
              {...register("confirmPassword")}
            />
            <GlassButton
              type="submit"
              variant="primary"
              loading={reset.isPending}
              className="w-full mt-1"
            >
              {t('resetPassword.button')}
            </GlassButton>
          </form>
        </GlassCard>
      </div>
    </motion.div>
  );
}