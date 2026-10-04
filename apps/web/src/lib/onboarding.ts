import type { OnboardingStep, OnboardingTip } from "@my-games/shared";
import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "./api";

export const onboardingQuery = queryOptions({
  queryKey: ["onboarding"],
  queryFn: async () => (await unwrap(api.me.onboarding.$get())).onboarding,
  staleTime: 15_000,
});

export type OnboardingState = NonNullable<
  Awaited<ReturnType<NonNullable<(typeof onboardingQuery)["queryFn"]>>>
>;

export const onboardingApi = {
  welcome: () => unwrap(api.me.onboarding.welcome.$post()),
  dismiss: () => unwrap(api.me.onboarding.dismiss.$post()),
  restore: () => unwrap(api.me.onboarding.restore.$post()),
  tip: (tip: OnboardingTip) => unwrap(api.me.onboarding.tips[":tip"].$post({ param: { tip } })),
};

export type { OnboardingStep, OnboardingTip };
