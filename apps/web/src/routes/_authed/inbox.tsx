import { syncActions } from "@my-games/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import * as z from "zod/mini";
import { CoachMark } from "@/components/onboarding/coach-mark";
import {
  isBulkable,
  ProposalCard,
  proposalKindLabel,
  sourceLabels,
} from "@/components/proposal-card";
import { ProposalDeck } from "@/components/proposal-deck";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, unwrap } from "@/lib/api";
import { apiErrorText } from "@/lib/errors";
import { errorMessage } from "@/lib/format";
import { proposalsQuery, syncIgnoresQuery, syncRulesQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed/inbox")({
  validateSearch: z.object({
    tab: z.optional(z.enum(["pending", "resolved", "rules"])),
    view: z.optional(z.enum(["deck", "list"])),
  }),
  loaderDeps: ({ search }) => ({ tab: search.tab ?? "pending" }),
  loader: ({ context, deps }) =>
    deps.tab === "rules"
      ? Promise.all([
          context.queryClient.prefetchQuery(syncRulesQuery),
          context.queryClient.prefetchQuery(syncIgnoresQuery),
        ])
      : context.queryClient.prefetchQuery(proposalsQuery(deps.tab)),
  head: () => ({ meta: [{ title: `${m.inbox_title()} · ${m.app_name()}` }] }),
  component: InboxPage,
});

function InboxPage() {
  const { tab = "pending", view = "deck" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <div className="grid gap-6 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1.5">
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {m.inbox_title()}
          </h1>
          <p className="text-foreground/70 max-w-xl text-[15px]">{m.inbox_description()}</p>
        </div>
        {tab === "pending" && (
          <fieldset className="glass flex gap-1 rounded-full border border-white/10 p-1">
            <legend className="sr-only">{m.inbox_tab_pending()}</legend>
            {(["deck", "list"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => navigate({ search: (previous) => ({ ...previous, view: option }) })}
                className={`h-9 rounded-full px-4 text-sm font-bold transition-colors ${
                  view === option ? "bg-foreground text-background" : "text-foreground/75"
                }`}
              >
                {option === "deck" ? m.inbox_view_deck() : m.inbox_view_list()}
              </button>
            ))}
          </fieldset>
        )}
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) =>
          navigate({ search: (previous) => ({ ...previous, tab: value as typeof tab }) })
        }
      >
        <TabsList>
          <TabsTrigger value="pending">{m.inbox_tab_pending()}</TabsTrigger>
          <TabsTrigger value="resolved">{m.inbox_tab_resolved()}</TabsTrigger>
          <TabsTrigger value="rules">{m.inbox_tab_rules()}</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "rules" ? (
        <Rules />
      ) : (
        <ProposalList status={tab} deck={tab === "pending" && view === "deck"} />
      )}
    </div>
  );
}

function ProposalList({ status, deck }: { status: "pending" | "resolved"; deck: boolean }) {
  const { data } = useQuery(proposalsQuery(status));
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["proposals"] }),
      queryClient.invalidateQueries({ queryKey: ["library"] }),
      queryClient.invalidateQueries({ queryKey: ["entry"] }),
      queryClient.invalidateQueries({ queryKey: ["history"] }),
      queryClient.invalidateQueries({ queryKey: ["profile"] }),
    ]);

  const resolve = useMutation({
    mutationFn: (input: {
      id: string;
      action: "approve" | "reject";
      options?: { choice?: string; ignore?: boolean };
    }) =>
      unwrap(
        api.proposals[":id"][":action{approve|reject}"].$post({
          param: { id: input.id, action: input.action },
          json: input.options ?? {},
        }),
      ),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });

  const bulk = useMutation({
    mutationFn: (action: "approve" | "reject") =>
      unwrap(api.proposals.bulk.$post({ json: { ids: [...selected], action } })),
    onSuccess: async ({ results }) => {
      const failed = results.filter((result) => !result.ok);
      if (failed.length) toast.error(apiErrorText(failed[0]?.error, failed[0]?.reason));
      else toast.success(m.inbox_done());
      setSelected(new Set());
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const proposals = data?.proposals ?? [];
  const bulkable = proposals.filter(isBulkable);

  if (deck && data) {
    return (
      <div data-tour="inbox-deck">
        <CoachMark tip="inbox_deck" anchor="inbox-deck" when={proposals.length > 0} side="top" />
        <ProposalDeck
          proposals={proposals}
          onResolve={(proposal, action, options) =>
            resolve.mutateAsync({ id: proposal.id, action, options })
          }
        />
      </div>
    );
  }

  if (data && proposals.length === 0) {
    return <p className="text-muted-foreground py-12 text-center">{m.inbox_empty()}</p>;
  }

  return (
    <div className="grid gap-3">
      {status === "pending" && bulkable.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setSelected(
                selected.size === bulkable.length
                  ? new Set()
                  : new Set(bulkable.map((item) => item.id)),
              )
            }
          >
            {m.inbox_select_all()}
          </Button>
          <Button
            size="sm"
            disabled={selected.size === 0 || bulk.isPending}
            onClick={() => bulk.mutate("approve")}
          >
            {m.inbox_approve_selected()} ({selected.size})
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={selected.size === 0 || bulk.isPending}
            onClick={() => bulk.mutate("reject")}
          >
            {m.inbox_reject_selected()}
          </Button>
        </div>
      )}
      {proposals.map((proposal) => (
        <ProposalCard
          key={proposal.id}
          proposal={proposal}
          pending={resolve.isPending}
          selected={selected.has(proposal.id)}
          onSelect={(value) => {
            const next = new Set(selected);
            if (value) next.add(proposal.id);
            else next.delete(proposal.id);
            setSelected(next);
          }}
          onResolve={(action, options) => resolve.mutate({ id: proposal.id, action, options })}
        />
      ))}
    </div>
  );
}

/** Yok sayma anahtarı `<tür>:<hedef>` biçimindedir (ör. `new_game:620`). */
function ignoreKindLabel(source: string, key: string) {
  return proposalKindLabel(source, key.split(":")[0] ?? "");
}

const actionLabels = {
  auto: m.rule_action_auto,
  ask: m.rule_action_ask,
  ignore: m.rule_action_ignore,
} as const;

function Rules() {
  const queryClient = useQueryClient();
  const rules = useQuery(syncRulesQuery);
  const ignores = useQuery(syncIgnoresQuery);

  const update = useMutation({
    mutationFn: (rule: { source: string; kind: string; action: (typeof syncActions)[number] }) =>
      unwrap(
        api.sync.rules.$put({ json: rule as Parameters<typeof api.sync.rules.$put>[0]["json"] }),
      ),
    onSuccess: (data) => queryClient.setQueryData(syncRulesQuery.queryKey, data),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const removeIgnore = useMutation({
    mutationFn: (input: { source: string; externalId: string }) =>
      unwrap(
        api.sync.ignores.$delete({
          json: input as Parameters<typeof api.sync.ignores.$delete>[0]["json"],
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: syncIgnoresQuery.queryKey }),
  });

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h2 className="text-lg font-bold">{m.rules_title()}</h2>
        <p className="text-muted-foreground text-sm">{m.rules_description()}</p>
        <div className="divide-y rounded-lg border">
          {rules.data?.rules.map((rule) => (
            <div
              key={`${rule.source}:${rule.kind}`}
              className="flex flex-wrap items-center gap-3 p-3"
            >
              <div className="flex-1 text-sm">
                <span className="font-medium">
                  {(sourceLabels[rule.source] ?? (() => rule.source))()}
                </span>
                {" · "}
                {proposalKindLabel(rule.source, rule.kind)}
              </div>
              <Select
                value={rule.action}
                onValueChange={(action) =>
                  update.mutate({
                    source: rule.source,
                    kind: rule.kind,
                    action: action as (typeof syncActions)[number],
                  })
                }
              >
                <SelectTrigger size="sm" className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {syncActions.map((action) => (
                    <SelectItem key={action} value={action}>
                      {actionLabels[action]()}
                      {rule.default === action ? ` (${m.rule_default()})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </section>
      <section className="grid gap-2">
        <h2 className="text-lg font-bold">{m.ignores_title()}</h2>
        {ignores.data?.ignores.length ? (
          <ul className="divide-y rounded-lg border text-sm">
            {ignores.data.ignores.map((item) => (
              <li key={`${item.source}:${item.externalId}`} className="flex items-center gap-3 p-3">
                <span className="flex-1">
                  {item.label ?? item.externalId}
                  <span className="text-muted-foreground">
                    {" · "}
                    {(sourceLabels[item.source] ?? (() => item.source))()}
                    {" · "}
                    {ignoreKindLabel(item.source, item.externalId)}
                  </span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => removeIgnore.mutate(item)}>
                  {m.ignores_remove()}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">{m.ignores_empty()}</p>
        )}
      </section>
    </div>
  );
}
