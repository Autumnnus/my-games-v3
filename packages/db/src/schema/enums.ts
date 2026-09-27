import {
  activityVerbs,
  entryStatuses,
  gameSources,
  notificationTypes,
  platforms,
  playSessionSources,
  proposalSources,
  proposalStatuses,
  screenshotKinds,
  socialTargets,
  stores,
  syncActions,
  termKinds,
} from "@my-games/shared";
import { pgEnum } from "drizzle-orm/pg-core";

export const entryStatusEnum = pgEnum("entry_status", entryStatuses);
export const platformEnum = pgEnum("platform", platforms);
export const storeEnum = pgEnum("store", stores);
export const gameSourceEnum = pgEnum("game_source", gameSources);
export const termKindEnum = pgEnum("term_kind", termKinds);
export const proposalSourceEnum = pgEnum("proposal_source", proposalSources);
export const proposalStatusEnum = pgEnum("proposal_status", proposalStatuses);
export const syncActionEnum = pgEnum("sync_action", syncActions);
export const playSessionSourceEnum = pgEnum("play_session_source", playSessionSources);
export const screenshotKindEnum = pgEnum("screenshot_kind", screenshotKinds);
export const socialTargetEnum = pgEnum("social_target", socialTargets);
export const notificationTypeEnum = pgEnum("notification_type", notificationTypes);
export const activityVerbEnum = pgEnum("activity_verb", activityVerbs);
