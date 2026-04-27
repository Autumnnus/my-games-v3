import { createFileRoute, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Mail, Lock, User, Gamepad2 } from "lucide-react";
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
    .min(2, "İsim en az 2 karakter")
    .max(50, "İsim en fazla 50 karakter"),
  email: z.string().email("Geçerli bir e-posta gir"),
  password: z
    .string()
    .min(6, "Şifre en az 6 karakter")
    .max(100, "Şifre çok uzun"),
});
type FormData = z.infer<typeof schema>;

function RegisterPage() {
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
              Hesap oluştur
            </h1>
            <p
              className="text-sm mt-1"
              style={{ color: "rgba(255,255,255,0.5)" }}
            >
              Oyun kütüphaneni oluşturmaya başla
            </p>
          </div>
        </div>

        <GlassCard className="p-6">
          <form
            onSubmit={handleSubmit((data) => register_.mutate(data))}
            className="flex flex-col gap-4"
          >
            <GlassInput
              label="İsim"
              type="text"
              placeholder="Adın"
              leftIcon={<User size={15} />}
              error={errors.name?.message}
              {...register("name")}
            />
            <GlassInput
              label="E-posta"
              type="email"
              placeholder="sen@example.com"
              leftIcon={<Mail size={15} />}
              error={errors.email?.message}
              {...register("email")}
            />
            <GlassInput
              label="Şifre"
              type="password"
              placeholder="En az 6 karakter"
              leftIcon={<Lock size={15} />}
              error={errors.password?.message}
              {...register("password")}
            />

            <GlassButton
              type="submit"
              variant="primary"
              loading={register_.isPending}
              className="w-full mt-1"
            >
              Kayıt Ol
            </GlassButton>
          </form>

          <div className="flex items-center gap-3 my-4">
            <div
              className="flex-1 h-px"
              style={{ background: "rgba(255,255,255,0.1)" }}
            />
            <span
              className="text-xs"
              style={{ color: "rgba(255,255,255,0.3)" }}
            >
              veya
            </span>
            <div
              className="flex-1 h-px"
              style={{ background: "rgba(255,255,255,0.1)" }}
            />
          </div>

          <a
            href={steamApi.getLoginUrl()}
            className="flex items-center justify-center gap-2.5 w-full py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{
              background: "rgba(23,46,69,0.8)",
              border: "1px solid rgba(102,192,244,0.25)",
              color: "rgba(102,192,244,0.9)",
            }}
          >
            <img
              src="https://store.steampowered.com/favicon.ico"
              alt="Steam"
              className="w-4 h-4"
            />
            Steam ile Kayıt Ol / Giriş Yap
          </a>
        </GlassCard>

        <p
          className="text-center text-sm mt-5"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          Zaten hesabın var mı?{" "}
          <Link
            to="/login"
            className="font-medium hover:underline"
            style={{ color: "rgba(168,85,247,0.9)" }}
          >
            Giriş yap
          </Link>
        </p>
      </div>
    </motion.div>
  );
}
