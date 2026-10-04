import type { EntryStatus } from "@my-games/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UploadIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { RelativeTime } from "@/components/time";
import { Button } from "@/components/ui/button";
import { type AdminUserDetail, adminApi, formatNumber } from "@/lib/admin";
import { unwrap } from "@/lib/api";
import { errorMessage, statusLabel } from "@/lib/format";
import { m } from "@/paraglide/messages";
import { Fact, Meter, Panel, Pill } from "./ui";

const endpoint = () => adminApi.users[":id"]["legacy-imports"];
type Body = Parameters<ReturnType<typeof endpoint>["$post"]>[0]["json"];
type Preview = Awaited<ReturnType<typeof previewFile>>;
type ImportRow = Awaited<ReturnType<typeof listImports>>[number];

const listImports = (id: string) => unwrap(endpoint().$get({ param: { id } }));
const previewFile = (id: string, json: Body) =>
  unwrap(endpoint().preview.$post({ param: { id }, json }));

const statusTone = {
  queued: "muted",
  running: "info",
  done: "ok",
  failed: "danger",
} as const;
const statusText = {
  queued: m.admin_legacy_status_queued,
  running: m.admin_legacy_status_running,
  done: m.admin_legacy_status_done,
  failed: m.admin_legacy_status_failed,
};
const isActive = (row: ImportRow) => row.status === "queued" || row.status === "running";

/**
 * Eski sistemin (my-games-old) dışa aktarım dosyasını bu kullanıcıya aktarır: dosya seçilir, sunucu önizler,
 * onaylanınca worker aktarır. İlerleme buradan izlenir.
 */
export function LegacyImportPanel({ detail }: { detail: AdminUserDetail }) {
  const userId = detail.user.id;
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [file, setFile] = useState<Body | null>(null);

  const imports = useQuery({
    queryKey: ["admin", "user", userId, "legacy-imports"],
    queryFn: () => listImports(userId),
    refetchInterval: (query) => (query.state.data?.some(isActive) ? 2000 : false),
  });

  // Aktarım bitince kullanıcının sayıları (kayıt, ekran görüntüsü) tazelenir.
  const active = imports.data?.some(isActive) ?? false;
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active) {
      void queryClient.invalidateQueries({ queryKey: ["admin", "user", userId] });
    }
    wasActive.current = active;
  }, [active, queryClient, userId]);

  const preview = useMutation({
    mutationFn: (body: Body) => previewFile(userId, body),
    onError: (failure) => {
      setFile(null);
      toast.error(errorMessage(failure));
    },
  });
  const start = useMutation({
    mutationFn: (body: Body) => unwrap(endpoint().$post({ param: { id: userId }, json: body })),
    onSuccess: async () => {
      toast.success(m.admin_legacy_started());
      reset();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "user", userId, "legacy-imports"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "audit"] }),
      ]);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });

  function reset() {
    setFile(null);
    preview.reset();
    if (inputRef.current) inputRef.current.value = "";
  }

  async function pick(selected: File | undefined) {
    if (!selected) return;
    let records: unknown;
    try {
      records = JSON.parse(await selected.text());
    } catch {
      records = null;
    }
    if (!Array.isArray(records) || records.length === 0) {
      reset();
      toast.error(m.admin_legacy_bad_file());
      return;
    }
    const body = { fileName: selected.name, records: records as Body["records"] };
    setFile(body);
    preview.mutate(body);
  }

  const target = detail.user.username ? `@${detail.user.username}` : detail.user.email;

  return (
    <Panel title={m.admin_legacy_title()} description={m.admin_legacy_hint()}>
      {!file && (
        <div>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            disabled={active}
            onChange={(event) => void pick(event.target.files?.[0])}
          />
          <Button variant="outline" size="sm" disabled={active} asChild>
            <label htmlFor={inputId} className={active ? "" : "cursor-pointer"}>
              <UploadIcon />
              {m.admin_legacy_pick()}
            </label>
          </Button>
        </div>
      )}

      {file && preview.isPending && (
        <p className="text-foreground/60 m-0 text-sm">{m.admin_legacy_reading()}</p>
      )}

      {file && preview.data && (
        <PreviewView
          fileName={file.fileName}
          data={preview.data}
          pending={start.isPending}
          onCancel={reset}
          onStart={() => {
            if (
              window.confirm(m.admin_legacy_confirm({ count: preview.data.toImport, user: target }))
            )
              start.mutate(file);
          }}
        />
      )}

      {imports.data && imports.data.length > 0 && (
        <div className="grid gap-2">
          <h3 className="text-foreground/60 m-0 text-xs font-semibold">
            {m.admin_legacy_history()}
          </h3>
          {imports.data.map((row) => (
            <ImportItem key={row.id} row={row} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function PreviewView({
  fileName,
  data,
  pending,
  onCancel,
  onStart,
}: {
  fileName: string;
  data: Preview;
  pending: boolean;
  onCancel: () => void;
  onStart: () => void;
}) {
  const statuses = Object.entries(data.statuses)
    .map(([status, count]) => `${statusLabel(status as EntryStatus)} ${formatNumber(count ?? 0)}`)
    .join(" · ");
  return (
    <div className="grid gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
      <h3 className="m-0 truncate text-sm font-semibold">
        {m.admin_legacy_preview_title({ file: fileName })}
      </h3>
      <dl className="m-0">
        <Fact label={m.admin_legacy_total()}>{formatNumber(data.total)}</Fact>
        <Fact label={m.admin_legacy_to_import()}>
          <strong>{formatNumber(data.toImport)}</strong>
        </Fact>
        {data.alreadyImported > 0 && (
          <Fact label={m.admin_legacy_already()}>{formatNumber(data.alreadyImported)}</Fact>
        )}
        {data.importedElsewhere > 0 && (
          <Fact label={m.admin_legacy_elsewhere()}>{formatNumber(data.importedElsewhere)}</Fact>
        )}
        {data.inLibraryCount > 0 && (
          <Fact label={m.admin_legacy_in_library()}>{formatNumber(data.inLibraryCount)}</Fact>
        )}
        {statuses && <Fact label={m.admin_legacy_statuses()}>{statuses}</Fact>}
        <Fact label={m.admin_legacy_screenshots()}>{formatNumber(data.screenshots)}</Fact>
        {data.warningCount > 0 && (
          <Fact label={m.admin_legacy_warnings()}>{formatNumber(data.warningCount)}</Fact>
        )}
      </dl>

      {data.importedElsewhere > 0 && (
        <p className="m-0 rounded-xl bg-amber-300/10 px-3 py-2 text-xs text-amber-200">
          {m.admin_legacy_elsewhere_warn({ count: data.importedElsewhere })}
        </p>
      )}
      {data.inLibraryCount > 0 && (
        <p className="text-foreground/60 m-0 text-xs">
          {m.admin_legacy_in_library_hint({ names: data.inLibrary.slice(0, 10).join(", ") })}
        </p>
      )}
      {data.sample.length > 0 && (
        <p className="text-foreground/60 m-0 text-xs">
          {m.admin_legacy_sample({ names: data.sample.join(", ") })}
        </p>
      )}
      {data.warnings.length > 0 && (
        <details className="text-xs">
          <summary className="text-foreground/70 cursor-pointer">
            {m.admin_legacy_warnings_show({ count: data.warningCount })}
          </summary>
          <ul className="text-foreground/60 m-0 mt-2 grid gap-1 pl-4">
            {data.warnings.map((item) => (
              <li key={item.name}>
                <span className="text-foreground/80">{item.name}</span>: {item.warnings.join("; ")}
              </li>
            ))}
          </ul>
        </details>
      )}

      {data.toImport === 0 && (
        <p className="text-foreground/60 m-0 text-sm">{m.admin_legacy_nothing()}</p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          {m.admin_cancel()}
        </Button>
        <Button size="sm" onClick={onStart} disabled={pending || data.toImport === 0}>
          {m.admin_legacy_start()}
        </Button>
      </div>
    </div>
  );
}

function ImportItem({ row }: { row: ImportRow }) {
  const report = row.report;
  return (
    <div className="grid gap-2 rounded-2xl border border-white/8 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 truncate">
          {m.admin_legacy_by({
            file: row.fileName,
            who: row.createdBy ? `@${row.createdBy}` : "—",
          })}
        </span>
        <span className="flex items-center gap-2">
          <Pill tone={statusTone[row.status]}>{statusText[row.status]()}</Pill>
          <span className="text-foreground/55 text-xs">
            <RelativeTime value={row.createdAt} />
          </span>
        </span>
      </div>
      {isActive(row) && (
        <>
          <Meter
            value={row.processed}
            max={row.total}
            label={m.admin_legacy_progress({ processed: row.processed, total: row.total })}
          />
          <span className="text-foreground/60 text-xs">
            {row.status === "queued"
              ? m.admin_legacy_queued_hint()
              : m.admin_legacy_progress({
                  processed: formatNumber(row.processed),
                  total: formatNumber(row.total),
                })}
          </span>
        </>
      )}
      {report && (
        <span className="text-foreground/70 text-xs">
          {m.admin_legacy_report({
            imported: formatNumber(report.imported),
            merged: formatNumber(report.merged ?? 0),
            auto: formatNumber(report.autoMatched),
            pending: formatNumber(report.pendingMatches),
            unmatched: formatNumber(report.unmatched),
            skipped: formatNumber(report.skippedExisting + report.duplicates.length),
          })}
        </span>
      )}
      {report && report.duplicates.length > 0 && (
        <span className="text-foreground/55 text-xs">
          {m.admin_legacy_duplicates({ names: report.duplicates.join(", ") })}
        </span>
      )}
      {row.status === "failed" && row.error && (
        <span className="text-destructive text-xs break-words">{row.error}</span>
      )}
    </div>
  );
}
