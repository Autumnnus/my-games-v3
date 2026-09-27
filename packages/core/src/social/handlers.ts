import type { OutboxHandlers } from "../outbox";
import {
  onEntryCreated,
  onEntryUpdated,
  onPlaytimeRecorded,
  onScreenshotsAdded,
} from "./activities";
import { onCommentCreated, onProposalsCreated, onReactionCreated } from "./interactions";

/** Akış ve bildirim tüketicileri. Hepsi yalnızca veritabanına yazar (olayın transaction'ında). */
export const socialHandlers: OutboxHandlers = {
  "entry.created": onEntryCreated,
  "entry.updated": onEntryUpdated,
  "playtime.recorded": onPlaytimeRecorded,
  "screenshots.added": onScreenshotsAdded,
  "reaction.created": onReactionCreated,
  "comment.created": onCommentCreated,
  "proposals.created": onProposalsCreated,
};
