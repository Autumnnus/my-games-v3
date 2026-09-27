import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { HeartIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, unwrap } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { m } from "@/paraglide/messages";

type Target = { targetType: "activity" | "entry" | "screenshot"; targetId: string };

/** İyimser (optimistic) beğeni: sayaç hemen değişir, hata olursa geri alınır. */
export function LikeButton(props: Target & { count: number; liked: boolean }) {
  const { user } = useRouteContext({ from: "__root__" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [state, setState] = useState({ count: props.count, liked: props.liked });

  const toggle = useMutation({
    mutationFn: (like: boolean) => {
      const json = { targetType: props.targetType, targetId: props.targetId };
      return like ? unwrap(api.reactions.$post({ json })) : unwrap(api.reactions.$delete({ json }));
    },
    onMutate: (like) => {
      const previous = state;
      setState({ liked: like, count: Math.max(0, state.count + (like ? 1 : -1)) });
      return previous;
    },
    onSuccess: (summary) => {
      setState({ count: summary.count, liked: summary.viewerReacted });
      void queryClient.invalidateQueries({
        queryKey: ["reactions", props.targetType, props.targetId],
      });
    },
    onError: (error, _like, previous) => {
      if (previous) setState(previous);
      toast.error(errorMessage(error));
    },
  });

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-pressed={state.liked}
      aria-label={m.like()}
      onClick={() => {
        if (!user) {
          void navigate({ to: "/login" });
          return;
        }
        toggle.mutate(!state.liked);
      }}
      className={state.liked ? "text-rose-500" : undefined}
    >
      <HeartIcon className={state.liked ? "fill-current" : undefined} />
      {state.count > 0 && state.count}
    </Button>
  );
}
