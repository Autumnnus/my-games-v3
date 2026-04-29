import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useIGDBSearch } from "@/hooks/useIGDB";
import { formatCoverUrl } from "@/lib/formatters";
import type { IGDBSearchResult } from "@/api/types";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface IGDBSearchComboboxProps {
  onSelect: (game: IGDBSearchResult) => void;
  placeholder?: string;
}

function useDebounce<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function IGDBSearchCombobox({
  onSelect,
  placeholder = "IGDB'de oyun ara...",
}: IGDBSearchComboboxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const { data, isFetching } = useIGDBSearch(debouncedQuery);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative flex items-center">
        <Search
          size={15}
          className="absolute left-3"
          style={{ color: "var(--theme-text-muted)" }}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="glass-input w-full pl-9 pr-8 py-2.5 text-sm"
        />
        {isFetching ? (
          <LoadingSpinner size="sm" className="absolute right-3" />
        ) : query ? (
          <button
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
            className="absolute right-3"
            style={{ color: "var(--theme-text-muted)" }}
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      <AnimatePresence>
        {open && data && data.length > 0 && (
          <motion.div
            className="absolute top-full left-0 right-0 mt-1 glass-card glass-dropdown-menu p-1 z-[120] max-h-[min(55vh,26rem)] overflow-y-auto"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
          >
            {data.map((game) => {
              const cover = game.cover?.url
                ? formatCoverUrl(game.cover.url, "thumb")
                : null;
              const year = game.first_release_date
                ? new Date(game.first_release_date * 1000).getFullYear()
                : null;
              return (
                <button
                  key={game.id}
                  onClick={() => {
                    onSelect(game);
                    setQuery(game.name);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-white/6 transition-colors"
                >
                  {cover ? (
                    <img
                      src={cover}
                      alt={game.name}
                      className="w-8 h-10 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-10 rounded-lg shrink-0 glass-card-sm flex items-center justify-center text-xs">
                      🎮
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: "var(--theme-text-primary)" }}
                    >
                      {game.name}
                    </p>
                    {year && (
                      <p
                        className="text-xs"
                        style={{ color: "var(--theme-text-muted)" }}
                      >
                        {year}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
