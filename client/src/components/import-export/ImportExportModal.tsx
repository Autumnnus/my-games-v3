import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
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

const IMPORT_STEPS_KEYS = [
  "import.uploadFile",
  "import.step2",
  "import.step3",
  "import.checkConflicts",
  "import.success",
] as const;
const EXPORT_STEPS_KEYS = [
  "export.selectFormat",
  "export.formatLabel",
  "export.exportComplete",
] as const;

export function ImportExportModal({
  open,
  onClose,
  defaultTab = "import",
}: ImportExportModalProps) {
  const { t } = useTranslation();
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

  const {
    importState,
    exportState,
    parse,
    runImport,
    setFile,
    setColumnMapping,
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

  useEffect(() => {
    if (importState.parseResult && importState.rows.length > 0) {
      setConflicts([]);
    }
  }, [importState.parseResult, importState.rows, setConflicts]);

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
    importState.rows.length,
  ]);

  useEffect(() => {
    if (parseMutation.isSuccess) {
      setImportStep(2);
      parseMutation.reset();
    }
  }, [parseMutation.isSuccess, parseMutation]);

  function handleImportNext() {
    if (importStep === 1) {
      if (!importState.file) return;
      parse(importState.file);
      return;
    }
    if (importStep === 2) {
      const hasName = Object.values(importState.columnMapping).includes("name");
      if (!hasName) return;
      setImportStep(3);
      return;
    }
    if (importStep === 3) {
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
    if (importStep === 2) { setImportStep(1); return; }
    if (importStep === 3) { setImportStep(2); return; }
    if (importStep === 4) { setImportStep(3); return; }
  }

  function handleExportNext() {
    if (exportStep === 1) { setExportStep(2); return; }
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
  const detectedConflicts = importState.conflicts;

  const currentSteps = activeTab === "import"
    ? IMPORT_STEPS_KEYS.map((k) => t(k))
    : EXPORT_STEPS_KEYS.map((k) => t(k));
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
            {t("import.titleImportExport")}
          </h2>
          <div
            className="flex gap-1 p-1 rounded-xl"
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            <TabBtn
              active={activeTab === "import"}
              onClick={() => setActiveTab("import")}
            >
              <Upload size={14} /> {t("import.import")}
            </TabBtn>
            <TabBtn
              active={activeTab === "export"}
              onClick={() => setActiveTab("export")}
            >
              <Download size={14} /> {t("import.export")}
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
            {activeTab === "import" && (
              <motion.div
                key={`import-${importStep}`}
                variants={scaleIn}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {importStep === 1 && (
                  <div className="flex flex-col gap-4">
                    <p
                      className="text-sm"
                      style={{ color: "rgba(255,255,255,0.5)" }}
                    >
                      {t("import.step1Hint")}
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
                          {t("import.fileProcessing")}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {importStep === 2 && importState.parseResult && (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <p
                        className="text-sm"
                        style={{ color: "rgba(255,255,255,0.5)" }}
                      >
                        {t("import.matchColumns")}
                      </p>
                      <div
                        className="flex items-center gap-3 text-xs"
                        style={{ color: "rgba(255,255,255,0.35)" }}
                      >
                        <span>{importState.parseResult.totalRows} {t("import.rows")}</span>
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

                {importStep === 3 && (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <p
                        className="text-sm"
                        style={{ color: "rgba(255,255,255,0.5)" }}
                      >
                        {t("import.checkData")}
                      </p>
                      <div className="flex items-center gap-3">
                        <span
                          className="text-xs"
                          style={{ color: "rgba(255,255,255,0.35)" }}
                        >
                          {t("import.importScreenshots")}
                        </span>
                        <GlassSwitch
                          checked={importState.importScreenshots}
                          onChange={(checked) =>
                            setImportScreenshots(checked)
                          }
                        />
                      </div>
                    </div>
                    <ImportPreviewTable
                      rows={importState.rows}
                      mapping={importState.columnMapping}
                      onRowEdit={(rowIdx, field, value) => {
                        const updated = [...importState.rows];
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

                {importStep === 4 && (
                  <ConflictResolver
                    conflicts={detectedConflicts}
                    defaultStrategy={importState.conflictStrategy}
                    onResolve={(newResolutions) => {
                      setResolutions(newResolutions);
                    }}
                  />
                )}

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

                {importStep < 5 && runImportMutation.isPending && (
                  <ImportProgress
                    total={progressTotal}
                    current={progressCurrent}
                    currentItem=""
                    status={progressStatus}
                  />
                )}
              </motion.div>
            )}

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
                      {t("export.ready")} {t("export.formatLabel")}:{" "}
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
                        label={t("export.formatLabel")}
                        value={exportState.format.toUpperCase()}
                      />
                      <SummaryRow
                        label={t("export.includeScreenshots")}
                        value={
                          exportState.filters.includeScreenshots
                            ? t("export.yes")
                            : t("export.no")
                        }
                      />
                      <SummaryRow
                        label={t("export.statusFilter")}
                        value={
                          exportState.filters.status?.length
                            ? exportState.filters.status.join(", ")
                            : t("export.all")
                        }
                      />
                      <SummaryRow
                        label={t("export.platformFilter")}
                        value={
                          exportState.filters.platforms?.length
                            ? exportState.filters.platforms.join(", ")
                            : t("export.all")
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
                          {t("export.exporting")}
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
                          {t("export.exportComplete")}
                        </p>
                        <p
                          className="text-xs"
                          style={{ color: "rgba(255,255,255,0.35)" }}
                        >
                          {t("export.fileDownloaded")}
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
                {t("import.back")}
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
                  ? t("export.startImport")
                  : importStep === 3
                    ? t("export.checkConflicts")
                    : t("import.continue")}
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
              {t("import.back")}
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
              {exportStep === 2 ? t("export.exportButton") : t("import.continue")}
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
