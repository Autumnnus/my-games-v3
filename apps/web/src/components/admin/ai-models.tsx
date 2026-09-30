import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminApi, settingsQuery } from "@/lib/admin";
import { unwrap } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { m } from "@/paraglide/messages";
import { Panel } from "./ui";

const modelsQuery = {
  queryKey: ["admin", "ai", "models"],
  queryFn: () => unwrap(adminApi.ai.models.$get()),
};

type Models = Awaited<ReturnType<typeof modelsQuery.queryFn>>;

const REF = /^([a-z0-9-]+:)?[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;

/** Model adı: fiyat tablosundaki modellerden seçilir ya da elle yazılır (`sağlayıcı:model` de olur). */
function ModelInput({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <>
      <Input
        id={id}
        list={`${id}-list`}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value.trim())}
        className="font-mono text-[13px]"
        aria-invalid={value !== "" && !REF.test(value)}
      />
      <datalist id={`${id}-list`}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
  );
}

function Editor({ data, options }: { data: Models; options: string[] }) {
  const queryClient = useQueryClient();
  const fieldId = useId();
  const current = data.selected;
  const [model, setModel] = useState(current?.model ?? "");
  const [light, setLight] = useState(current?.lightModel ?? "");
  const [fallbacks, setFallbacks] = useState<string[]>(
    current ? current.fallbackModels : data.env.fallbackModels,
  );
  const [adding, setAdding] = useState("");

  const save = useMutation({
    mutationFn: (json: Models["selected"]) => unwrap(adminApi.ai.models.$put({ json })),
    onSuccess: async (next) => {
      queryClient.setQueryData(modelsQuery.queryKey, next);
      toast.success(m.saved());
      await queryClient.invalidateQueries({ queryKey: ["admin", "ai", "keys"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const envChat = data.env.model ?? data.defaults.chat ?? "—";
  const envLight = data.env.lightModel ?? data.defaults.light ?? "—";
  const valid =
    (model === "" || REF.test(model)) &&
    (light === "" || REF.test(light)) &&
    fallbacks.every((ref) => REF.test(ref));
  const move = (index: number, delta: number) =>
    setFallbacks((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      if (item) next.splice(index + delta, 0, item);
      return next;
    });

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ model: model || null, fallbackModels: fallbacks, lightModel: light || null });
      }}
    >
      <label className="grid gap-1.5 text-sm" htmlFor={`${fieldId}-chat`}>
        <span className="font-semibold">{m.admin_models_chat()}</span>
        <span className="text-foreground/55 text-xs">{m.admin_models_chat_hint()}</span>
        <ModelInput
          id={`${fieldId}-chat`}
          value={model}
          onChange={setModel}
          options={options}
          placeholder={m.admin_models_default({ model: envChat })}
        />
      </label>

      <div className="grid gap-1.5 text-sm">
        <span className="font-semibold">{m.admin_models_fallbacks()}</span>
        <span className="text-foreground/55 text-xs">{m.admin_models_fallbacks_hint()}</span>
        {fallbacks.length > 0 && (
          <ol className="m-0 grid list-none gap-1.5 p-0">
            {fallbacks.map((ref, index) => (
              <li
                key={ref}
                className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-1.5"
              >
                <span className="text-foreground/50 w-4 text-xs tabular-nums">{index + 1}</span>
                <code className="min-w-0 flex-1 truncate text-[13px]">{ref}</code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === 0}
                  aria-label={m.admin_models_up()}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === fallbacks.length - 1}
                  aria-label={m.admin_models_down()}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDownIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={m.admin_prices_remove({ model: ref })}
                  onClick={() => setFallbacks((list) => list.filter((item) => item !== ref))}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ol>
        )}
        {fallbacks.length < 5 && (
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <ModelInput
                id={`${fieldId}-add`}
                value={adding}
                onChange={setAdding}
                options={options.filter((option) => !fallbacks.includes(option))}
                placeholder={m.admin_models_add_placeholder()}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!REF.test(adding) || fallbacks.includes(adding)}
              onClick={() => {
                setFallbacks((list) => [...list, adding]);
                setAdding("");
              }}
            >
              <PlusIcon />
              {m.admin_models_add()}
            </Button>
          </div>
        )}
      </div>

      <label className="grid gap-1.5 text-sm" htmlFor={`${fieldId}-light`}>
        <span className="font-semibold">{m.admin_models_light()}</span>
        <span className="text-foreground/55 text-xs">{m.admin_models_light_hint()}</span>
        <ModelInput
          id={`${fieldId}-light`}
          value={light}
          onChange={setLight}
          options={options}
          placeholder={m.admin_models_default({ model: envLight })}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={!valid || save.isPending}>
          {m.admin_save()}
        </Button>
        {current && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={save.isPending}
            onClick={() => {
              if (!window.confirm(m.admin_models_reset_confirm())) return;
              save.mutate(null, {
                onSuccess: () => {
                  setModel("");
                  setLight("");
                  setFallbacks(data.env.fallbackModels);
                },
              });
            }}
          >
            {m.admin_models_reset()}
          </Button>
        )}
      </div>
    </form>
  );
}

/** Hangi modellerin kullanılacağı (ortam değişkenleri yalnızca başlangıç değeri). */
export function AiModels() {
  const models = useQuery(modelsQuery);
  const settings = useQuery(settingsQuery);
  if (!models.data) return null;
  const options = Object.keys(settings.data?.ai.prices ?? {});
  return (
    <Panel title={m.admin_models_title()} description={m.admin_models_hint()}>
      <Editor key={JSON.stringify(models.data.selected)} data={models.data} options={options} />
    </Panel>
  );
}
