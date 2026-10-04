import { createFileRoute, redirect } from "@tanstack/react-router";
import * as z from "zod/mini";

/** Eski sohbet sayfası: yer imleri ve eski bağlantılar tam ekran Paddie görünümüne gider. */
export const Route = createFileRoute("/_authed/chat")({
  validateSearch: z.object({ t: z.optional(z.string()) }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/ai", search: search.t ? { t: search.t } : {}, replace: true });
  },
});
