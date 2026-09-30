import { useMutation } from "@tanstack/react-query";
import { FlagIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api, unwrap } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { m } from "@/paraglide/messages";

export function ReportButton(props: {
  targetType: "comment" | "entry" | "screenshot" | "user";
  targetId: string;
  size?: "sm" | "icon";
}) {
  const [open, setOpen] = useState(false);
  const report = useMutation({
    mutationFn: (reason: string) =>
      unwrap(
        api.reports.$post({
          json: { targetType: props.targetType, targetId: props.targetId, reason },
        }),
      ),
    onSuccess: () => {
      setOpen(false);
      toast.success(m.report_sent());
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
    if (reason) report.mutate(reason);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground" aria-label={m.report()}>
          <FlagIcon />
          {props.size !== "icon" && m.report()}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.report_title()}</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <Textarea
            name="reason"
            rows={4}
            maxLength={1000}
            placeholder={m.report_reason()}
            aria-label={m.report_reason()}
            required
            showCount
            className="min-h-32"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {m.action_cancel()}
            </Button>
            <Button type="submit" disabled={report.isPending}>
              {m.report_submit()}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
