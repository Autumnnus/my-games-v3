import type { ImportRunResult } from "@/api/importExport";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassModal } from "@/components/ui/GlassModal";
import { GlassSwitch } from "@/components/ui/GlassSwitch";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { ConflictResolution, ImportStep } from "@/hooks/useImportExport";
import { useImportExport } from "@/hooks/useImportExport";
import { cn } from "@/lib/cn";
import { scaleIn } from "@/lib/motion";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Download, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ColumnMappingTable } from "./ColumnMappingTable";
import { ConflictResolver } from "./ConflictResolver";
import { ExportOptions } from "./ExportOptions";
import { FileDropper } from "./FileDropper";
import { ImportPreviewTable } from "./ImportPreviewTable";
import { ImportProgress } from "./ImportProgress";
import { ImportResult } from "./ImportResult";
import { StepIndicator } from "./StepIndicator";

interface ImportExportModalProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: "import" | "export";
}

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
      if (!Object.values(importState.columnMapping).includes("name")) return;
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
    if (importStep === 2) setImportStep(1);
    else if (importStep === 3) setImportStep(2);
    else if (importStep === 4) setImportStep(3);
  }

  function handleExportNext() {
    if (exportStep === 1) {
      setExportStep(2);
      return;
    }
    if (exportStep === 2) {
      setExportStep(3);
      exportMutation.mutate();
    }
  }

  function handleExportBack() {
    if (exportStep === 2) setExportStep(1);
  }

  const IMPORT_STEPS = [
    t("translation:import.uploadFile"),
    t("translation:import.step2"),
    t("translation:import.step3"),
    t("translation:import.checkConflicts"),
    t("translation:import.success"),
  ];
  const EXPORT_STEPS = [
    t("translation:export.selectFormat"),
    t("translation:export.formatLabel"),
    t("translation:export.exportComplete"),
  ];

  const currentSteps = activeTab === "import" ? IMPORT_STEPS : EXPORT_STEPS;
  const currentStep = activeTab === "import" ? importStep : exportStep;
  const isImportLoading = parseMutation.isPending;
  const isExportLoading = exportMutation.isPending;

  return (
    <GlassModal open={open} onClose={onClose} title="" size="xl" allowOverflow>
      <div className="flex flex-col gap-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-text-primary">
            {t("translation:import.titleImportExport")}
          </h2>
          <div className="flex gap-1 p-1 rounded-xl bg-surface-subtle">
            <TabBtn
              active={activeTab === "import"}
              onClick={() => setActiveTab("import")}
            >
              <Upload size={14} /> {t("translation:import.import")}
            </TabBtn>
            <TabBtn
              active={activeTab === "export"}
              onClick={() => setActiveTab("export")}
            >
              <Download size={14} /> {t("translation:import.export")}
            </TabBtn>
          </div>
        </div>

        {/* Step indicator */}
        <StepIndicator steps={currentSteps} currentStep={currentStep} />

        {/* Content */}
        <div className="min-h-64 max-h-96 overflow-y-auto pr-1 mt-4 text-text-secondary">
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
                    <p className="text-sm text-text-muted">
                      {t("translation:import.step1Hint")}
                    </p>
                    <FileDropper onFileSelected={setFile} maxSizeMB={10} />
                    {isImportLoading && (
                      <div className="flex items-center gap-2 justify-center py-4">
                        <LoadingSpinner size="sm" />
                        <span className="text-xs text-text-muted">
                          {t("translation:import.fileProcessing")}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {importStep === 2 && importState.parseResult && (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-text-muted">
                        {t("translation:import.matchColumns")}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-text-muted">
                        <span>
                          {importState.parseResult.totalRows}{" "}
                          {t("translation:import.rows")}
                        </span>
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
                      <p className="text-sm text-text-muted">
                        {t("translation:import.checkData")}
                      </p>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-text-muted">
                          {t("translation:import.importScreenshots")}
                        </span>
                        <GlassSwitch
                          checked={importState.importScreenshots}
                          onChange={setImportScreenshots}
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
                    conflicts={importState.conflicts}
                    defaultStrategy={importState.conflictStrategy}
                    onResolve={setResolutions}
                  />
                )}

                {importStep === 5 && importResult && (
                  <ImportResult
                    result={importResult}
                    onClose={onClose}
                    onViewLibrary={() => {
                      onClose();
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
                    <p className="text-sm text-text-muted">
                      {t("translation:export.ready")}{" "}
                      {t("translation:export.formatLabel")}:{" "}
                      <strong className="text-text-secondary">
                        {exportState.format.toUpperCase()}
                      </strong>
                    </p>
                    <div className="rounded-xl p-4 flex flex-col gap-2 border border-glass-border bg-surface-subtle">
                      <SummaryRow
                        label={t("translation:export.formatLabel")}
                        value={exportState.format.toUpperCase()}
                      />
                      <SummaryRow
                        label={t("translation:export.includeScreenshots")}
                        value={
                          exportState.filters.includeScreenshots
                            ? t("translation:export.yes")
                            : t("translation:export.no")
                        }
                      />
                      <SummaryRow
                        label={t("translation:export.statusFilter")}
                        value={
                          exportState.filters.status?.length
                            ? exportState.filters.status
                                .map((s) => t(`games.status.${s}`))
                                .join(", ")
                            : t("translation:export.all")
                        }
                      />
                      <SummaryRow
                        label={t("translation:export.platformFilter")}
                        value={
                          exportState.filters.platforms?.length
                            ? exportState.filters.platforms
                                .map((p) => t(`games.platform.${p}`))
                                .join(", ")
                            : t("translation:export.all")
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
                        <p className="text-sm text-text-muted">
                          {t("translation:export.exporting")}
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="w-14 h-14 rounded-full flex items-center justify-center bg-success-soft">
                          <Download size={24} className="text-success" />
                        </div>
                        <p className="text-sm font-medium text-text-secondary">
                          {t("translation:export.exportComplete")}
                        </p>
                        <p className="text-xs text-text-muted">
                          {t("translation:export.fileDownloaded")}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer — Import */}
        {activeTab === "import" &&
          importStep < 5 &&
          !runImportMutation.isPending && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-glass-border">
              <GlassButton
                variant="ghost"
                onClick={handleImportBack}
                disabled={importStep === 1}
                leftIcon={<ChevronLeft size={15} />}
              >
                {t("translation:import.back")}
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
                  ? t("translation:export.startImport")
                  : importStep === 3
                    ? t("translation:export.checkConflicts")
                    : t("translation:import.continue")}
              </GlassButton>
            </div>
          )}

        {/* Footer — Export */}
        {activeTab === "export" && exportStep < 3 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-glass-border">
            <GlassButton
              variant="ghost"
              onClick={handleExportBack}
              disabled={exportStep === 1}
              leftIcon={<ChevronLeft size={15} />}
            >
              {t("translation:import.back")}
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
              {exportStep === 2
                ? t("translation:export.exportButton")
                : t("translation:import.continue")}
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
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
        active
          ? "bg-glass-border text-text-primary"
          : "text-text-muted hover:text-text-secondary",
      )}
    >
      {children}
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="text-text-secondary">{value}</span>
    </div>
  );
}
