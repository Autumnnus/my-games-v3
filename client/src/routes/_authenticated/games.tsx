import type { GameListItem as GameType } from "@/api/types";
import { AddGameModal } from "@/components/games/AddGameModal";
import { DeleteGameConfirm } from "@/components/games/DeleteGameConfirm";
import { EditGameModal } from "@/components/games/EditGameModal";
import { GameCard } from "@/components/games/GameCard";
import { GameFiltersBar } from "@/components/games/GameFiltersBar";
import { GameListItem } from "@/components/games/GameListItem";
import { ImportExportModal } from "@/components/import-export/ImportExportModal";
import { PageContainer } from "@/components/layout/PageContainer";
import { SteamImportModal } from "@/components/steam/SteamImportModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassButton } from "@/components/ui/GlassButton";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { GameCardSkeleton } from "@/components/ui/Skeleton";
import { useUserGames } from "@/hooks/useGames";
import { pageTransition, staggerContainer } from "@/lib/motion";
import { useUIStore } from "@/store/ui.store";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowUpDown, Gamepad2, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

const searchSchema = z.object({
  status: z
    .enum(["completed", "abandoned", "toBeCompleted", "activePlaying"])
    .optional(),
  platform: z
    .enum([
      "steam",
      "epicGames",
      "ubisoft",
      "xboxPc",
      "eaGames",
      "torrent",
      "playstation",
      "xboxSeries",
      "nintendo",
      "mobile",
      "otherPlatforms",
    ])
    .optional(),
  sortBy: z.string().optional(),
  order: z.enum(["asc", "desc"]).optional(),
  search: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/games")({
  validateSearch: searchSchema,
  component: GamesPage,
});

function useDebounce<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function GamesPage() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { gamesViewMode } = useUIStore();
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [ieOpen, setIeOpen] = useState(false);
  const [editGame, setEditGame] = useState<GameType | null>(null);
  const [deleteGame, setDeleteGame] = useState<GameType | null>(null);
  const [localSearch, setLocalSearch] = useState(search.search ?? "");
  const debouncedSearch = useDebounce(localSearch, 300);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const filters = {
    status: search.status,
    platform: search.platform,
    sortBy: search.sortBy,
    order: search.order,
    search: debouncedSearch || undefined,
  };
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useUserGames(filters);

  const allGames = data?.pages.flatMap((p) => p.items) ?? [];

  useEffect(() => {
    navigate({
      search: (prev) => ({ ...prev, search: debouncedSearch || undefined }),
      replace: true,
    });
  }, [debouncedSearch]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage)
          fetchNextPage();
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const totalGames = data?.pages[0]?.total ?? 0;

  return (
    <motion.div
      variants={pageTransition}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <PageContainer>
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1
                className="text-2xl font-bold"
                style={{ color: "var(--theme-text-primary)" }}
              >
                {t("pages.games.title")}
              </h1>
              {totalGames > 0 && (
                <p
                  className="text-sm mt-0.5"
                  style={{ color: "var(--theme-text-muted)" }}
                >
                  {t("games.gamesCount", { count: totalGames })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <GlassButton
                variant="ghost"
                leftIcon={<ArrowUpDown size={14} />}
                onClick={() => setIeOpen(true)}
                className="hidden sm:flex"
              >
                {t("games.importExport")}
              </GlassButton>
              <GlassButton
                variant="primary"
                leftIcon={<Plus size={15} />}
                onClick={() => setAddOpen(true)}
              >
                {t("games.addGame")}
              </GlassButton>
            </div>
          </div>

          {/* Filters */}
          <GameFiltersBar
            status={search.status}
            platform={search.platform}
            sortBy={search.sortBy}
            order={search.order}
            search={localSearch}
            onStatusChange={(v) =>
              navigate({ search: (p) => ({ ...p, status: v }), replace: true })
            }
            onPlatformChange={(v) =>
              navigate({
                search: (p) => ({ ...p, platform: v }),
                replace: true,
              })
            }
            onSortChange={(sortBy, order) =>
              navigate({
                search: (p) => ({ ...p, sortBy, order }),
                replace: true,
              })
            }
            onSearchChange={setLocalSearch}
          />

          {/* Content */}
          {isLoading ? (
            <div
              className={`grid gap-3 ${gamesViewMode === "grid" ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" : "grid-cols-1"}`}
            >
              {Array.from({ length: 10 }, (_, i) => (
                <GameCardSkeleton key={i} />
              ))}
            </div>
          ) : allGames.length === 0 ? (
            <EmptyState
              icon={<Gamepad2 size={28} />}
              title={t("pages.games.emptyTitle")}
              description={t("pages.games.emptyDesc")}
              action={{ label: t("games.addGame"), onClick: () => setAddOpen(true) }}
            />
          ) : gamesViewMode === "grid" ? (
            <motion.div
              className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
              variants={staggerContainer}
              initial="initial"
              animate="animate"
            >
              {allGames.map((game) => (
                <GameCard
                  key={game._id}
                  game={game}
                  onEdit={setEditGame}
                  onDelete={setDeleteGame}
                />
              ))}
            </motion.div>
          ) : (
            <motion.div
              className="flex flex-col gap-2"
              variants={staggerContainer}
              initial="initial"
              animate="animate"
            >
              {allGames.map((game) => (
                <GameListItem
                  key={game._id}
                  game={game}
                  onEdit={setEditGame}
                  onDelete={setDeleteGame}
                />
              ))}
            </motion.div>
          )}

          {/* Infinite scroll trigger */}
          <div ref={loadMoreRef} className="flex justify-center py-4">
            {isFetchingNextPage && <LoadingSpinner />}
          </div>
        </div>
      </PageContainer>

      <AddGameModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onOpenSteamImport={() => setImportOpen(true)}
      />
      <SteamImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
      />
      <ImportExportModal open={ieOpen} onClose={() => setIeOpen(false)} />
      <EditGameModal game={editGame} onClose={() => setEditGame(null)} />
      <DeleteGameConfirm
        game={deleteGame}
        onClose={() => setDeleteGame(null)}
      />

      {/* FAB for mobile */}
      <button
        onClick={() => setAddOpen(true)}
        className="fixed bottom-6 right-6 md:hidden w-14 h-14 rounded-full flex items-center justify-center glass-btn-primary glow-purple z-30"
        aria-label={t("common.aria.addGame")}
      >
        <Plus size={22} />
      </button>
    </motion.div>
  );
}
