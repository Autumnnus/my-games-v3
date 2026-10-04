import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { termsOfService } from "@/lib/legal";
import { metaQuery } from "@/lib/meta";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

export const Route = createFileRoute("/terms")({
  loader: ({ context }) => context.queryClient.ensureQueryData(metaQuery),
  head: () => ({ meta: [{ title: `${m.legal_terms()} · ${m.app_name()}` }] }),
  component: TermsPage,
});

function TermsPage() {
  const { data } = useSuspenseQuery(metaQuery);
  return (
    <LegalPage doc={termsOfService(getLocale(), data.contactEmail)} email={data.contactEmail} />
  );
}
