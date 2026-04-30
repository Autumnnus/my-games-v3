import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { motion, useScroll, useTransform } from "framer-motion";
import { Gamepad2, Sparkles, Star } from "lucide-react";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { fadeUp, staggerContainer } from "@/lib/motion";

export function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [0, 60]);
  const opacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);

  return (
    <div
      ref={containerRef}
      className="relative min-h-[calc(100dvh-56px)] flex items-center overflow-hidden"
    >
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-20"
          style={{
            background: "radial-gradient(circle, var(--theme-accent), transparent)",
          }}
          animate={{ scale: [1, 1.1, 1], x: [0, 20, 0], y: [0, -15, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full opacity-15"
          style={{
            background: "radial-gradient(circle, var(--theme-accent-2), transparent)",
          }}
          animate={{ scale: [1, 1.15, 1], x: [0, -25, 0], y: [0, 20, 0] }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2,
          }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full opacity-10"
          style={{
            background: "radial-gradient(circle, #ec4899, transparent)",
          }}
          animate={{ scale: [1, 1.3, 1] }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1,
          }}
        />
      </div>

      <motion.div
        style={{ y, opacity }}
        className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20"
      >
        <motion.div
          className="flex flex-col items-center text-center gap-8"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {/* Badge */}
          <motion.div variants={fadeUp}>
            <GlassCard
              size="sm"
              className="inline-flex items-center gap-2 px-4 py-2"
            >
              <Sparkles size={14} className="text-accent" />
              <span
                className="text-sm font-medium text-text-secondary"
              >
                Oyun kütüphaneni yönet
              </span>
            </GlassCard>
          </motion.div>

          {/* Title */}
          <motion.div variants={fadeUp} className="flex flex-col gap-4">
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-none">
              <span className="text-text-primary">Oyun</span>
              <br />
              <span
                style={{
                  background:
                    "linear-gradient(135deg, var(--theme-accent), var(--theme-accent-2), #ec4899)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Kütüphaneni
              </span>
              <br />
              <span className="text-text-secondary">Keşfet</span>
            </h1>
            <p
              className="text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed text-text-muted"
            >
              Tüm oyunlarını tek bir yerde takip et. İlerleme kaydet, puan ver,
              ekran görüntüsü sakla, istatistiklerini keşfet.
            </p>
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            variants={fadeUp}
            className="flex items-center gap-3 flex-wrap justify-center"
          >
            <Link to="/register">
              <GlassButton
                variant="primary"
                size="lg"
                leftIcon={<Gamepad2 size={18} />}
              >
                Ücretsiz Başla
              </GlassButton>
            </Link>
            <Link to="/login">
              <GlassButton size="lg">Giriş Yap</GlassButton>
            </Link>
          </motion.div>

          {/* Feature chips */}
          <motion.div
            variants={fadeUp}
            className="flex items-center gap-2 flex-wrap justify-center"
          >
            {[
              "Steam Entegrasyonu",
              "IGDB Metadata",
              "Ekran Görüntüsü",
              "İstatistikler",
            ].map((feat) => (
              <span
                key={feat}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs glass-card-sm text-text-muted"
              >
                <Star size={10} className="text-accent" />
                {feat}
              </span>
            ))}
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}
