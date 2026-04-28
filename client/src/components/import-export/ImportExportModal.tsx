import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Download,
  Upload,
} from "lucide-react";
import { GlassModal } from "@/components/ui/GlassModal";
import { GlassButton } from "@/components/ui/GlassButton";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { GlassSwitch } from "@/components/ui/GlassSwitch";
import { StepIndicator } from "./StepIndicator";
import { FileDropper } from "./FileDropper";
import { ColumnMappingTable } from "./ColumnMappingTable";
import { ImportPreviewTable } from "./ImportPreviewTable";
import { ConflictResolver } from "./ConflictResolver";
import { ImportProgress } from "./ImportProgress";
import { ImportResult } from "./ImportResult";
import { ExportOptions } from "./ExportOptions";
import { useImportExport } from "@/hooks/useImportExport";
import { scaleIn } from "@/lib/motion";
import type { ImportStep, ConflictResolution } from "@/hooks/useImportExport";
import type { ImportRunResult } from "@/api/importExport";

interface ImportExportModalProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: "import" | "export";
}

const IMPORT_STEPS = [
  "Dosya Yükle",
  "Sütun Eşleştir",
  "Önizleme",
  "Çakışmalar",
  "Sonuç",
];
const EXPORT_STEPS = ["Format Seç", "Seçenekler", "İndir"];

export function ImportExportModal({
  open,
  onClose,
  defaultTab = "import",
}: ImportExportModalProps) {
  const [activeTab, setActiveTab] = useState<"import" | "export">(defaultTab);
  const [importStep, setImportStep] = useState<ImportStep>(1);
  const [exportStep, setExportStep] = useState<1 | 2 | 3>(1);
  const [resolutions, setResolutions] = useState<ConflictResolution[]>([]);
  const [importResult, setImportResult] = useState<ImportRunResult | null>(
    null,
  );
  const [progressStatus, setProgressStatus] = useState<
    | "parsing"
    | "mapping"
    | "uploading_screenshots"
    | "importing"
    | "done"
    | "error"
  >("parsing");
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [progressItem, setProgressItem] = useState("");

  const {
    importState,
    exportState,
    parse,
    runImport,
    setFile,
    setColumnMapping,
    setConflictStrategy,
    setImportScreenshots,
    setRows,
    setConflicts,
    setExportFormat,
    setExportFilters,
    resetImport,
    parseMutation,
    runImportMutation,
    exportMutation,
  } = useImportExport();

  // Sync defaultTab when modal opens
  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab);
      setImportStep(1);
      setExportStep(1);
      setImportResult(null);
      setProgressStatus("parsing");
      resetImport();
      setResolutions([]);
    }
  }, [open, defaultTab, resetImport]);

  // Detect conflicts after parse
  useEffect(() => {
    if (importState.parseResult && importState.rows.length > 0) {
      // In a real implementation, this would call an API to detect conflicts.
      // For now we leave conflicts empty and skip to preview.
      setConflicts([]);
    }
  }, [importState.parseResult, importState.rows]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track import progress
  useEffect(() => {
    if (runImportMutation.isPending) {
      setProgressStatus("importing");
      setProgressCurrent(importState.rows.length);
      setProgressTotal(importState.rows.length);
    }
    if (runImportMutation.isSuccess) {
      setProgressStatus("done");
      setImportResult(runImportMutation.data ?? null);
      setImportStep(5);
    }
    if (runImportMutation.isError) {
      setProgressStatus("error");
    }
  }, [
    runImportMutation.isPending,
    runImportMutation.isSuccess,
    runImportMutation.isError,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  // Transition from step 1 to step 2 after successful parse
  useEffect(() => {
    if (parseMutation.isSuccess) {
      setImportStep(2);
      parseMutation.reset();
    }
  }, [parseMutation.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleImportNext() {
    if (importStep === 1) {
      if (!importState.file) return;
      parse(importState.file);
      return;
    }
    if (importStep === 2) {
      // Validate name mapping exists
      const hasName = Object.values(importState.columnMapping).includes("name");
      if (!hasName) return;
      setImportStep(3);
      return;
    }
    if (importStep === 3) {
      // If conflicts exist, go to step 4; otherwise start import
      if (importState.conflicts.length > 0) {
        setImportStep(4);
      } else {
        setProgressStatus("importing");
        setProgressTotal(importState.rows.length);
        setProgressCurrent(0);
        runImport(importState.rows, []);
      }
      return;
    }
    if (importStep === 4) {
      setProgressStatus("importing");
      setProgressTotal(importState.rows.length);
      setProgressCurrent(0);
      runImport(importState.rows, resolutions);
    }
  }

  function handleImportBack() {
    if (importStep === 1) return;
    if (importStep === 2) {
      setImportStep(1);
      return;
    }
    if (importStep === 3) {
      setImportStep(2);
      return;
    }
    if (importStep === 4) {
      setImportStep(3);
      return;
    }
  }

  function handleExportNext() {
    if (exportStep === 1) {
      setExportStep(2);
      return;
    }
    if (exportStep === 2) {
      setExportStep(3);
      exportMutation.mutate();
      return;
    }
  }

  function handleExportBack() {
    if (exportStep === 1) return;
    if (exportStep === 2) setExportStep(1);
  }

  function handleFileSelected(file: File) {
    setFile(file);
  }

  function handleClose() {
    onClose();
  }

  const isImportLoading = parseMutation.isPending;
  const isExportLoading = exportMutation.isPending;

  // Derive conflicts from rows (mock — in real impl, this comes from API)
  const detectedConflicts = importState.conflicts;

  const currentSteps = activeTab === "import" ? IMPORT_STEPS : EXPORT_STEPS;
  const currentStep = activeTab === "import" ? importStep : exportStep;

  return (
    <GlassModal
      open={open}
      onClose={handleClose}
      title=""
      size="xl"
      allowOverflow
    >
      <div className="flex flex-col gap-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2
            className="text-lg font-semibold"
            style={{ color: "rgba(255,255,255,0.95)" }}
          >
            İçe / Dışa Aktar
          </h2>
          <div
            className="flex gap-1 p-1 rounded-xl"
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            <TabBtn
              active={activeTab === "import"}
              onClick={() => setActiveTab("import")}
            >
              <Upload size={14} /> İçe Aktar
            </TabBtn>
            <TabBtn
              active={activeTab === "export"}
              onClick={() => setActiveTab("export")}
            >
              <Download size={14} /> Dışa Aktar
            </TabBtn>
          </div>
        </div>

        {/* Step indicator */}
        <StepIndicator steps={currentSteps} currentStep={currentStep} />

        {/* Content */}
        <div
          className="min-h-64 max-h-96 overflow-y-auto pr-1"
          style={{ color: "rgba(255,255,255,0.8)" }}
        >
          <AnimatePresence mode="wait">
            {/* ── IMPORT ── */}
            {activeTab === "import" && (
              <motion.div
                key={`import-${importStep}`}
                variants={scaleIn}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {/* Step 1: File upload */}
                {importStep === 1 && (
                  <div className="flex flex-col gap-4">
                    <p
                      className="text-sm"
                      style={{ color: "rgba(255,255,255,0.5)" }}
                    >
                      Steam, PlayStation, Excel veya manuel olarak hazırlanmış
                      dosyayı yükle.
                    </p>
                    <FileDropper
                      onFileSelected={handleFileSelected}
                      maxSizeMB={10}
                    />
                    {isImportLoading && (
                      <div className="flex items-center gap-2 justify-center py-4">
                        <LoadingSpinner size="sm" />
                        <span
                          className="text-xs"
                          style={{ color: "rgba(255,255,255,0.4)" }}
                        >
                          Dosya işleniyor...
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 2: Column mapping */}
                {importStep === 2 && importState.parseResult && (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <p
                        className="text-sm"
                        style={{ color: "rgba(255,255,255,0.5)" }}
                      >
                        Kaynak sütunları kütüphane alanlarıyla eşleştir.
                      </p>
                      <div
                        className="flex items-center gap-3 text-xs"
                        style={{ color: "rgba(255,255,255,0.35)" }}
                      >
                        <span>{importState.parseResult.totalRows} satır</span>
                        <span>•</span>
                        <span>
                          {importState.parseResult.format.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <ColumnMappingTable
                      detectedColumns={importState.parseResult.columns}
                      mapping={importState.columnMapping}
                      onMappingChange={setColumnMapping}
                      detectedPreset={
                        importState.parseResult.presets[0] ?? null
                      }
                    />
                  </div>
                )}

                {/* Step 3: Preview */}
                {importStep === 3 && (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <p
                        className="text-sm"
                        style={{ color: "rgba(255,255,255,0.5)" }}
                      >
                        Verileri kontrol et ve düzenle.
                      </p>
                      <div className="flex items-center gap-3">
                        <span
                          className="text-xs"
                          style={{ color: "rgba(255,255,255,0.35)" }}
                        >
                          Ekran görüntülerini içe aktar
                        </span>
                        <GlassSwitch
                          checked={importState.importScreenshots}
                          onChange={(e) =>
                            setImportScreenshots(e.target.checked)
                          }
                        />
                      </div>
                    </div>
                    <ImportPreviewTable
                      rows={importState.rows}
                      mapping={importState.columnMapping}
                      onRowEdit={(rowIdx, field, value) => {
                        const updated = [...importState.rows];
                        // Update mapped value back to raw row
                        const sourceCol = Object.entries(
                          importState.columnMapping,
                        ).find(([, f]) => f === field)?.[0];
                        if (sourceCol) {
                          updated[rowIdx] = {
                            ...updated[rowIdx],
                            [sourceCol]: value,
                          };
                          setRows(updated);
                        }
                      }}
                    />
                  </div>
                )}

                {/* Step 4: Conflicts */}
                {importStep === 4 && (
                  <ConflictResolver
                    conflicts={detectedConflicts}
                    defaultStrategy={importState.conflictStrategy}
                    onResolve={(newResolutions) => {
                      setResolutions(newResolutions);
                    }}
                  />
                )}

                {/* Step 5: Result */}
                {importStep === 5 && importResult && (
                  <ImportResult
                    result={importResult}
                    onClose={handleClose}
                    onViewLibrary={() => {
                      handleClose();
                      window.location.href = "/games";
                    }}
                  />
                )}

                {/* Progress (shown during import) */}
                {importStep < 5 && runImportMutation.isPending && (
                  <ImportProgress
                    total={progressTotal}
                    current={progressCurrent}
                    currentItem={progressItem}
                    status={progressStatus}
                  />
                )}
              </motion.div>
            )}

            {/* ── EXPORT ── */}
            {activeTab === "export" && (
              <motion.div
                key={`export-${exportStep}`}
                variants={scaleIn}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {exportStep === 1 && (
                  <ExportOptions
                    format={exportState.format}
                    onFormatChange={setExportFormat}
                    includeScreenshots={
                      exportState.filters.includeScreenshots ?? true
                    }
                    onIncludeScreenshotsChange={(v) =>
                      setExportFilters({
                        ...exportState.filters,
                        includeScreenshots: v,
                      })
                    }
                    filters={exportState.filters}
                    onFiltersChange={setExportFilters}
                  />
                )}
                {exportStep === 2 && (
                  <div className="flex flex-col gap-4">
                    <p
                      className="text-sm"
                      style={{ color: "rgba(255,255,255,0.5)" }}
                    >
                      Dışa aktarma hazır. Dosya formatı:{" "}
                      <strong style={{ color: "rgba(255,255,255,0.8)" }}>
                        {exportState.format.toUpperCase()}
                      </strong>
                    </p>
                    <div
                      className="rounded-xl p-4 flex flex-col gap-2"
                      style={{
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.02)",
                      }}
                    >
                      <SummaryRow
                        label="Format"
                        value={exportState.format.toUpperCase()}
                      />
                      <SummaryRow
                        label="Ekran görüntüleri"
                        value={
                          exportState.filters.includeScreenshots
                            ? "Evet"
                            : "Hayır"
                        }
                      />
                      <SummaryRow
                        label="Durum filtresi"
                        value={
                          exportState.filters.status?.length
                            ? exportState.filters.status.join(", ")
                            : "Tümü"
                        }
                      />
                      <SummaryRow
                        label="Platform filtresi"
                        value={
                          exportState.filters.platforms?.length
                            ? exportState.filters.platforms.join(", ")
                            : "Tümü"
                        }
                      />
                    </div>
                  </div>
                )}
                {exportStep === 3 && (
                  <div className="flex flex-col items-center justify-center gap-4 py-8">
                    {isExportLoading ? (
                      <>
                        <LoadingSpinner size="lg" />
                        <p
                          className="text-sm"
                          style={{ color: "rgba(255,255,255,0.4)" }}
                        >
                          Dışa aktarılıyor...
                        </p>
                      </>
                    ) : (
                      <>
                        <div
                          className="w-14 h-14 rounded-full flex items-center justify-center"
                          style={{ background: "rgba(34,197,94,0.12)" }}
                        >
                          <Download
                            size={24}
                            style={{ color: "rgba(34,197,94,0.8)" }}
                          />
                        </div>
                        <p
                          className="text-sm font-medium"
                          style={{ color: "rgba(255,255,255,0.8)" }}
                        >
                          Dışa aktarma tamamlandı!
                        </p>
                        <p
                          className="text-xs"
                          style={{ color: "rgba(255,255,255,0.35)" }}
                        >
                          Dosyan indirildi.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer navigation */}
        {activeTab === "import" &&
          importStep < 5 &&
          !runImportMutation.isPending && (
            <div
              className="flex items-center justify-between mt-6 pt-4"
              style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
            >
              <GlassButton
                variant="ghost"
                onClick={handleImportBack}
                disabled={importStep === 1}
                leftIcon={<ChevronLeft size={15} />}
              >
                Geri
              </GlassButton>
              <GlassButton
                variant="primary"
                onClick={handleImportNext}
                disabled={
                  (importStep === 1 && !importState.file) ||
                  (importStep === 2 &&
                    !Object.values(importState.columnMapping).includes(
                      "name",
                    )) ||
                  (importStep === 3 && importState.rows.length === 0)
                }
                rightIcon={
                  importStep < 4 ? <ChevronRight size={15} /> : undefined
                }
                loading={isImportLoading || runImportMutation.isPending}
              >
                {importStep === 4
                  ? "İçe Aktarı Başlat"
                  : importStep === 3
                    ? "Çakışma Kontrolü"
                    : "Devam"}
              </GlassButton>
            </div>
          )}

        {activeTab === "export" && exportStep < 3 && (
          <div
            className="flex items-center justify-between mt-6 pt-4"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
          >
            <GlassButton
              variant="ghost"
              onClick={handleExportBack}
              disabled={exportStep === 1}
              leftIcon={<ChevronLeft size={15} />}
            >
              Geri
            </GlassButton>
            <GlassButton
              variant="primary"
              onClick={handleExportNext}
              rightIcon={
                exportStep === 2 ? (
                  <Download size={15} />
                ) : (
                  <ChevronRight size={15} />
                )
              }
              loading={isExportLoading}
            >
              {exportStep === 2 ? "Dışa Aktar" : "Devam"}
            </GlassButton>
          </div>
        )}
      </div>
    </GlassModal>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
      style={{
        background: active ? "rgba(255,255,255,0.1)" : "transparent",
        color: active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
      }}
    >
      {children}
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span style={{ color: "rgba(255,255,255,0.4)" }}>{label}</span>
      <span style={{ color: "rgba(255,255,255,0.75)" }}>{value}</span>
    </div>
  );
}
