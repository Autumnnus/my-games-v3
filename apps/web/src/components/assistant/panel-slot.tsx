import { lazy, Suspense, useEffect, useState } from "react";
import { useOptionalAssistant } from "./provider";

const AssistantPanel = lazy(() =>
  import("./panel").then((module) => ({ default: module.AssistantPanel })),
);

/**
 * Panel ve AI SDK ilk açılışta yüklenir; asistanı hiç açmayan sayfa ziyaretleri o kodu indirmez. Bir kez
 * açıldıktan sonra kapansa da yerinde kalır (açılıp kapanma animasyonu ve akış kesilmesin).
 */
export function AssistantPanelSlot() {
  const assistant = useOptionalAssistant();
  const [loaded, setLoaded] = useState(false);
  const open = !!assistant?.enabled && assistant.open;
  useEffect(() => {
    if (open) setLoaded(true);
  }, [open]);
  if (!loaded && !open) return null;
  return (
    <Suspense fallback={null}>
      <AssistantPanel />
    </Suspense>
  );
}
