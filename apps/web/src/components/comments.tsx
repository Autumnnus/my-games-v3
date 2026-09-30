import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import { ArrowUpIcon, ReplyIcon, Trash2Icon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { ReportButton } from "@/components/report-dialog";
import { RelativeTime } from "@/components/time";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, unwrap } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { avatarThumb } from "@/lib/media/urls";
import { type CommentItem, commentsQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";

type Target = { targetType: "activity" | "entry" | "screenshot"; targetId: string };

/** `@kullanıcı` bahsetmelerini profil linkine çevirir. */
function renderBody(body: string) {
  return body.split(/(@[a-z0-9_.]{3,30})/gi).map((part, index) =>
    part.startsWith("@") ? (
      <Link
        // biome-ignore lint/suspicious/noArrayIndexKey: metin parçalarının sabit kimliği yok
        key={index}
        to="/u/$username"
        params={{ username: part.slice(1).replace(/\.+$/, "") }}
        className="text-primary hover:underline"
      >
        {part}
      </Link>
    ) : (
      part
    ),
  );
}

function Composer(props: Target & { parentId?: string; onDone?: () => void; autoFocus?: boolean }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const send = useMutation({
    mutationFn: () =>
      unwrap(
        api.comments.$post({
          json: {
            targetType: props.targetType,
            targetId: props.targetId,
            body,
            parentId: props.parentId ?? null,
          },
        }),
      ),
    onSuccess: async () => {
      setBody("");
      props.onDone?.();
      await queryClient.invalidateQueries({
        queryKey: ["comments", props.targetType, props.targetId],
      });
      await queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (body.trim()) send.mutate();
  }

  return (
    // Gönder düğmesi alanın içinde, sağ altta: metin uzadıkça alan büyür, düğme yerinde kalır.
    <form className="relative" onSubmit={onSubmit}>
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={m.comment_placeholder()}
        aria-label={m.comment_placeholder()}
        rows={1}
        maxLength={2000}
        autoFocus={props.autoFocus}
        className="max-h-72 min-h-11 resize-none py-[10px] pr-12 leading-[22px]"
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
            event.currentTarget.form?.requestSubmit();
        }}
      />
      <Button
        type="submit"
        size="icon-sm"
        aria-label={m.comment_submit()}
        title={m.comment_submit()}
        disabled={send.isPending || !body.trim()}
        className="absolute right-1.5 bottom-1.5 disabled:opacity-30"
      >
        <ArrowUpIcon strokeWidth={2.5} />
      </Button>
    </form>
  );
}

function CommentRow(props: Target & { comment: CommentItem; replies?: CommentItem[] }) {
  const { user } = useRouteContext({ from: "__root__" });
  const queryClient = useQueryClient();
  const [replying, setReplying] = useState(false);
  const { comment } = props;

  const remove = useMutation({
    mutationFn: () => unwrap(api.comments[":id"].$delete({ param: { id: comment.id } })),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["comments", props.targetType, props.targetId] }),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const canDelete = user && (user.id === comment.author.id || user.role === "admin");

  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <Avatar className="size-7">
          {comment.author.image && <AvatarImage src={avatarThumb(comment.author.image)} alt="" />}
          <AvatarFallback className="text-xs">
            {comment.author.name.charAt(0) || "?"}
          </AvatarFallback>
        </Avatar>
        <div className="grid min-w-0 flex-1 gap-1">
          {comment.deletedAt ? (
            <p className="text-muted-foreground text-sm italic">{m.comment_deleted()}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Link
                  to="/u/$username"
                  params={{ username: comment.author.username ?? "" }}
                  className="font-medium hover:underline"
                >
                  {comment.author.name}
                </Link>
                <RelativeTime value={comment.createdAt} className="text-muted-foreground" />
                {comment.editedAt && (
                  <span className="text-muted-foreground">· {m.comment_edited()}</span>
                )}
              </div>
              <p className="text-sm break-words whitespace-pre-line">{renderBody(comment.body)}</p>
              <div className="-ml-2 flex">
                {user && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => setReplying(!replying)}
                  >
                    <ReplyIcon />
                    {m.comment_reply()}
                  </Button>
                )}
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate()}
                  >
                    <Trash2Icon />
                  </Button>
                )}
                {user && user.id !== comment.author.id && (
                  <ReportButton targetType="comment" targetId={comment.id} size="icon" />
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {(props.replies?.length || replying) && (
        <div className="ml-9 grid gap-3 border-l pl-3">
          {props.replies?.map((reply) => (
            <CommentRow key={reply.id} {...props} comment={reply} replies={undefined} />
          ))}
          {replying && (
            <Composer
              targetType={props.targetType}
              targetId={props.targetId}
              parentId={comment.id}
              autoFocus
              onDone={() => setReplying(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function CommentThread(props: Target & { showTitle?: boolean }) {
  const { user } = useRouteContext({ from: "__root__" });
  const { data } = useQuery(commentsQuery(props.targetType, props.targetId));
  const comments = data?.comments ?? [];
  const roots = comments.filter((comment) => !comment.parentId);
  const repliesOf = (id: string) => comments.filter((comment) => comment.parentId === id);

  return (
    <div className="grid gap-3">
      {props.showTitle && <h2 className="text-lg font-bold">{m.comments_title()}</h2>}
      {data && roots.length === 0 && (
        <p className="text-muted-foreground text-sm">{m.comments_empty()}</p>
      )}
      {roots.map((comment) => (
        <CommentRow key={comment.id} {...props} comment={comment} replies={repliesOf(comment.id)} />
      ))}
      {user ? (
        <Composer targetType={props.targetType} targetId={props.targetId} />
      ) : (
        <p className="text-muted-foreground text-sm">
          <Link to="/login" className="underline">
            {m.comment_sign_in()}
          </Link>
        </p>
      )}
    </div>
  );
}
