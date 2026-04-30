import { PageContainer } from "@/components/layout/PageContainer";
import { ScreenshotCard } from "@/components/screenshots/ScreenshotCard";
import { ScreenshotLightbox } from "@/components/screenshots/ScreenshotLightbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useUserScreenshots } from "@/hooks/useScreenshots";
import { pageTransition, staggerContainer } from "@/lib/motion";
import { useAuthStore } from "@/store/auth.store";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Image } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/screenshots")({
  component: ScreenshotsPage,
});

function ScreenshotsPage() {
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.user?._id ?? "");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const { data: screenshots = [], isLoading } = useUserScreenshots(userId);

  return (
    <motion.div
      variants={pageTransition}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <PageContainer>
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-text-primary">
              {t("translation:pages.screenshots.title")}
            </h1>
            {!isLoading && (
              <span
                className="text-sm px-2 py-0.5 rounded-full"
                style={{
                  background: "var(--theme-surface-strong)",
                  color: "var(--theme-text-secondary)",
                }}
              >
                {t("translation:pages.screenshots.count", {
                  count: screenshots.length,
                })}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="columns-2 sm:columns-3 lg:columns-4 gap-3">
              {Array.from({ length: 12 }, (_, i) => (
                <div key={i} className="break-inside-avoid mb-3">
                  <Skeleton
                    className="w-full rounded-xl"
                    height={Math.random() > 0.5 ? 160 : 220}
                  />
                </div>
              ))}
            </div>
          ) : screenshots.length === 0 ? (
            <EmptyState
              icon={<Image size={28} />}
              title={t("translation:pages.screenshots.emptyTitle")}
              description={t("translation:pages.screenshots.emptyDesc")}
            />
          ) : (
            <motion.div
              className="columns-2 sm:columns-3 lg:columns-4 gap-3"
              variants={staggerContainer}
              initial="initial"
              animate="animate"
            >
              {screenshots.map((ss, i) => (
                <div key={ss._id} className="break-inside-avoid mb-3">
                  <ScreenshotCard
                    screenshot={ss}
                    onClick={() => setLightboxIndex(i)}
                  />
                </div>
              ))}
            </motion.div>
          )}
        </div>
      </PageContainer>

      <ScreenshotLightbox
        screenshots={screenshots}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={setLightboxIndex}
      />
    </motion.div>
  );
}
