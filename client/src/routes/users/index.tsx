import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Search, Users } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { UserCard } from "@/components/users/UserCard";
import { UserCardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useUsers } from "@/hooks/useUsers";
import { pageTransition, staggerContainer } from "@/lib/motion";

export const Route = createFileRoute("/users/")({
  component: UsersPage,
});

function UsersPage() {
  const { data: users, isLoading } = useUsers();
  const [search, setSearch] = useState("");

  const filtered =
    users?.filter((u) => u.name.toLowerCase().includes(search.toLowerCase())) ??
    [];

  return (
    <motion.div
      variants={pageTransition}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <PageContainer>
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between gap-4">
            <h1
              className="text-2xl font-bold"
              style={{ color: "rgba(255,255,255,0.95)" }}
            >
              Kullanıcılar
            </h1>
            <span
              className="text-sm"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              {users?.length ?? 0} kullanıcı
            </span>
          </div>

          <div className="relative max-w-sm">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: "rgba(255,255,255,0.4)" }}
            />
            <input
              type="text"
              placeholder="İsme göre ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="glass-input w-full pl-9 pr-4 py-2.5 text-sm"
            />
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {Array.from({ length: 10 }, (_, i) => (
                <UserCardSkeleton key={i} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Users size={28} />}
              title="Kullanıcı bulunamadı"
              description={
                search ? "Farklı bir isim dene." : "Henüz kullanıcı yok."
              }
            />
          ) : (
            <motion.div
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3"
              variants={staggerContainer}
              initial="initial"
              animate="animate"
            >
              {filtered.map((user) => (
                <UserCard key={user._id} user={user} />
              ))}
            </motion.div>
          )}
        </div>
      </PageContainer>
    </motion.div>
  );
}
