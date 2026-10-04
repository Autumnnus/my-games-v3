import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext, useRouterState } from "@tanstack/react-router";
import {
  createContext,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  type OnboardingState,
  type OnboardingTip,
  onboardingApi,
  onboardingQuery,
} from "@/lib/onboarding";
import { m } from "@/paraglide/messages";

const loadWelcomeDialog = () => import("./welcome-dialog");
const WelcomeDialog = lazy(() =>
  loadWelcomeDialog().then((module) => ({ default: module.WelcomeDialog })),
);

/** Bir oturumda (sekme) en fazla bir ipucu gösterilir; yeni üye ipuçlarıyla boğulmasın. */
const TIP_SLOT = "mg.onboarding.tip";

type DialogMode = "welcome" | "platforms";

type OnboardingContextValue = {
  /** Etkin rehber; yeni üye değilse, süresi dolduysa ya da bittiyse `null`. */
  state: OnboardingState | null;
  openPlatforms: () => void;
  dismiss: () => void;
  restore: () => void;
  /** İpucu şimdi gösterilebilir mi? Gösterilecekse oturumdaki tek yeri ayırır. */
  claimTip: (tip: OnboardingTip) => boolean;
  /** İpucu gösterildi: bir daha gösterilmez. */
  markTip: (tip: OnboardingTip) => void;
};

const Context = createContext<OnboardingContextValue>({
  state: null,
  openPlatforms: () => {},
  dismiss: () => {},
  restore: () => {},
  claimTip: () => false,
  markTip: () => {},
});

export function useOnboarding() {
  return useContext(Context);
}

function readSlot() {
  try {
    return window.sessionStorage.getItem(TIP_SLOT);
  } catch {
    return null;
  }
}

function writeSlot(tip: string) {
  try {
    window.sessionStorage.setItem(TIP_SLOT, tip);
  } catch {
    // Hatırlanamazsa bu oturumda başka bir ipucu da çıkabilir; zararsız.
  }
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user } = useRouteContext({ from: "__root__" });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const queryClient = useQueryClient();
  const query = useQuery({ ...onboardingQuery, enabled: !!user });
  const state = user ? (query.data ?? null) : null;
  const [dialog, setDialog] = useState<DialogMode | null>(null);

  const patch = useCallback(
    (update: (previous: OnboardingState) => OnboardingState) =>
      queryClient.setQueryData(onboardingQuery.queryKey, (previous) =>
        previous ? update(previous) : previous,
      ),
    [queryClient],
  );

  const welcome = useMutation({
    mutationKey: ["onboarding", "welcome"],
    mutationFn: onboardingApi.welcome,
    onMutate: () => patch((previous) => ({ ...previous, welcomed: true })),
    meta: { errorToast: false },
  });
  const dismissMutation = useMutation({
    mutationKey: ["onboarding", "dismiss"],
    mutationFn: onboardingApi.dismiss,
    onMutate: () => patch((previous) => ({ ...previous, dismissed: true, welcomed: true })),
  });
  const restoreMutation = useMutation({
    mutationKey: ["onboarding", "restore"],
    mutationFn: onboardingApi.restore,
    onMutate: () => patch((previous) => ({ ...previous, dismissed: false })),
  });
  const tipMutation = useMutation({
    mutationKey: ["onboarding", "tip"],
    mutationFn: onboardingApi.tip,
    onMutate: (tip) =>
      patch((previous) => ({ ...previous, seenTips: [...previous.seenTips, tip] })),
    meta: { errorToast: false },
  });

  // Hoş geldin yalnızca ana sayfada ve bir kez açılır (kapatmak da "görüldü" sayılır).
  const autoOpened = useRef(false);
  useEffect(() => {
    if (!state || state.welcomed || autoOpened.current || pathname !== "/") return;
    autoOpened.current = true;
    setDialog("welcome");
  }, [state, pathname]);

  // Rehberi olan üyede diyalog (platform seçimi) tıklanınca beklemeden açılsın.
  const hasGuide = !!state;
  useEffect(() => {
    if (hasGuide) void loadWelcomeDialog();
  }, [hasGuide]);

  // Adımlar veriden hesaplanır; sayfa değiştikçe (oyun ekledi, sohbet açtı…) tazelenir. Rehber yoksa sorulmaz.
  // biome-ignore lint/correctness/useExhaustiveDependencies: yalnızca sayfa değişince tazelenir
  useEffect(() => {
    if (hasGuide) void queryClient.invalidateQueries({ queryKey: onboardingQuery.queryKey });
  }, [pathname]);

  // Son adım bittiğinde sunucu bunu bir kez bildirir; kutlama da bir kez.
  const celebrated = useRef(false);
  useEffect(() => {
    if (!state?.justCompleted || celebrated.current) return;
    celebrated.current = true;
    toast.success(m.onboarding_done_title(), { description: m.onboarding_done_body() });
    queryClient.setQueryData(onboardingQuery.queryKey, null);
  }, [state?.justCompleted, queryClient]);

  const welcomed = state?.welcomed ?? true;
  const { mutateAsync: markWelcomed } = welcome;
  /** Hoş geldin kapanınca ya da bir seçim yapılınca bir kez "görüldü" yazılır. */
  const acknowledge = useCallback(
    () => (dialog === "welcome" && !welcomed ? markWelcomed() : Promise.resolve()),
    [dialog, welcomed, markWelcomed],
  );
  const closeDialog = useCallback(() => {
    void acknowledge().catch(() => {});
    setDialog(null);
  }, [acknowledge]);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      state: state?.justCompleted ? null : state,
      openPlatforms: () => setDialog("platforms"),
      dismiss: () => {
        dismissMutation.mutate();
        toast(m.onboarding_hidden_toast());
      },
      restore: () => restoreMutation.mutate(),
      claimTip: (tip) => {
        if (!state?.welcomed || state.dismissed || dialog) return false;
        if (state.seenTips.includes(tip)) return false;
        const slot = readSlot();
        if (slot && slot !== tip) return false;
        writeSlot(tip);
        return true;
      },
      markTip: (tip) => {
        if (!state?.seenTips.includes(tip)) tipMutation.mutate(tip);
      },
    }),
    [state, dialog, dismissMutation, restoreMutation, tipMutation],
  );

  return (
    <Context.Provider value={value}>
      {children}
      {state && dialog && (
        <Suspense fallback={null}>
          <WelcomeDialog mode={dialog} onClose={closeDialog} onChoose={acknowledge} />
        </Suspense>
      )}
    </Context.Provider>
  );
}
