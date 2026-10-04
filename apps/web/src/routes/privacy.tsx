import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { privacyPolicy } from "@/lib/legal";
import { metaQuery } from "@/lib/meta";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

export const Route = createFileRoute("/privacy")({
  loader: ({ context }) => context.queryClient.ensureQueryData(metaQuery),
  head: () => ({ meta: [{ title: `${m.legal_privacy()} · ${m.app_name()}` }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const { data } = useSuspenseQuery(metaQuery);
  return (
    <LegalPage doc={privacyPolicy(getLocale(), data.contactEmail)} email={data.contactEmail} />
  );
}
