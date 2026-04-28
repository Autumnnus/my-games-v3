import { createFileRoute, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Mail, Lock, User, Gamepad2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { steamApi } from "@/api/steam.api";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassInput } from "@/components/ui/GlassInput";
import { GlassButton } from "@/components/ui/GlassButton";
import { useRegister } from "@/hooks/useAuth";
import { pageTransition } from "@/lib/motion";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
});

const schema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name is too long"),
  email: z.string().email("Enter a valid email"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(100, "Password is too long"),
});
type FormData = z.infer<typeof schema>;

function RegisterPage() {
  const { t } = useTranslation();
  const register_ = useRegister();
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
        <div className="flex flex-col items-center gap-3 mb-8">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #a855f7, #3b82f6)" }}
          >
            <Gamepad2 size={24} className="text-white" />
          </div>
          <div className="text-center">
            <h1
              className="text-2xl font-bold"
              style={{ color: "rgba(255,255,255,0.95)" }}
            >
              {t('register.title')}
            </h1>
            <p
              className="text-sm mt-1"
              style={{ color: "rgba(255,255,255,0.5)" }}
            >
              {t('register.subtitle')}
            </p>
          </div>
        </div>

        <GlassCard className="p-6">
          <form
            onSubmit={handleSubmit((data) => register_.mutate(data))}
            className="flex flex-col gap-4"
          >
            <GlassInput
              label={t('common.labels.name')}
              type="text"
              placeholder={t('auth.namePlaceholder')}
              leftIcon={<User size={15} />}
              error={errors.name?.message}
              {...register("name")}
            />
            <GlassInput
              label={t('common.labels.email')}
              type="email"
              placeholder={t('auth.emailPlaceholder')}
              leftIcon={<Mail size={15} />}
              error={errors.email?.message}
              {...register("email")}
            />
            <GlassInput
              label={t('auth.password')}
              type="password"
              placeholder={t('auth.passwordPlaceholder')}
              leftIcon={<Lock size={15} />}
              error={errors.password?.message}
              {...register("password")}
            />
            <GlassButton
              type="submit"
              loading={register_.isPending}
              className="w-full"
            >
              {t('register.createButton')}
            </GlassButton>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" style={{ borderColor: "rgba(255,255,255,0.1)" }} />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="px-2" style={{ color: "rgba(255,255,255,0.3)" }}>
                  {t('auth.or')}
                </span>
              </div>
            </div>
            <GlassButton
              variant="default"
              className="w-full flex items-center justify-center gap-2"
              onClick={() => window.location.href = steamApi.getLoginUrl()}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <path d="M11.979 0C5.678 0 .511 4.853.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.029 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.393 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.628 20.307 6.409 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.627.264-1.22.041-1.766-.062-.15-.152-.31-.252-.48-.443-.775-1.298-1.241-2.21-1.241-.35 0-.69.079-1.005.228-.315.148-.59.356-.81.614l1.063 3.38zm4.944-2.11c.556 0 1.006.45 1.006 1.006 0 .557-.45 1.007-1.006 1.007-.556 0-1.006-.45-1.006-1.007 0-.556.45-1.006 1.006-1.006zm4.016-5.072v-.003c-.003-.004-.006-.008-.009-.01.004.002.006.005.01.013zm-3.48 5.08c-.88 0-1.678.41-2.187 1.03-.12-.044-.244-.076-.37-.097l-.83-1.234c-.17.253-.27.548-.28.864l-.007.112c0 1.107.896 2.005 2.004 2.005h.003c.552 0 1-.447 1-1s-.448-1-1-1c-.35 0-.664.18-.848.457l-.65-.967c.472-.527 1.123-.849 1.834-.849.553 0 1 .447 1 1s-.447 1-1 1z" />
              </svg>
              {t('common.buttons.signUpWithSteam')}
            </GlassButton>
            <p
              className="text-center text-xs"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              {t('register.alreadyHaveAccount')}{" "}
              <Link
                to="/login"
                className="underline hover:opacity-80 transition-opacity"
                style={{ color: "#a855f7" }}
              >
                {t('register.logIn')}
              </Link>
            </p>
          </form>
        </GlassCard>
      </div>
    </motion.div>
  );
}