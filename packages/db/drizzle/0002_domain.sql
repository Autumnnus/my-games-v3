CREATE TYPE "public"."activity_verb" AS ENUM('entry_added', 'status_changed', 'rated', 'reviewed', 'played', 'playtime_milestone', 'achievements_completed', 'screenshots_added');--> statement-breakpoint
CREATE TYPE "public"."entry_status" AS ENUM('playing', 'completed', 'paused', 'dropped', 'backlog', 'wishlist', 'endless');--> statement-breakpoint
CREATE TYPE "public"."game_source" AS ENUM('igdb', 'steam', 'custom', 'legacy');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('reaction', 'comment', 'reply', 'mention', 'proposals', 'system');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('pc', 'playstation', 'xbox', 'nintendo', 'mobile', 'other');--> statement-breakpoint
CREATE TYPE "public"."play_session_source" AS ENUM('steam_delta', 'steam_presence', 'desktop', 'manual');--> statement-breakpoint
CREATE TYPE "public"."proposal_source" AS ENUM('steam', 'igdb', 'migration', 'ai', 'system');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('pending', 'approved', 'rejected', 'auto_applied', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."screenshot_kind" AS ENUM('upload', 'external', 'steam');--> statement-breakpoint
CREATE TYPE "public"."social_target" AS ENUM('activity', 'entry', 'screenshot');--> statement-breakpoint
CREATE TYPE "public"."store" AS ENUM('steam', 'epic', 'gog', 'ubisoft', 'ea', 'battlenet', 'xbox', 'playstation', 'nintendo', 'itch', 'physical', 'torrent', 'other');--> statement-breakpoint
CREATE TYPE "public"."sync_action" AS ENUM('auto', 'ask', 'ignore');--> statement-breakpoint
CREATE TYPE "public"."term_kind" AS ENUM('genre', 'theme', 'game_mode', 'player_perspective', 'company');--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" uuid,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"steps" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" text NOT NULL,
	"parts" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_threads" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_terms" (
	"game_id" uuid NOT NULL,
	"term_id" integer NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	CONSTRAINT "game_terms_game_id_term_id_role_pk" PRIMARY KEY("game_id","term_id","role")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"source" "game_source" NOT NULL,
	"igdb_id" integer,
	"steam_app_id" integer,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"summary" text,
	"storyline" text,
	"cover_image_id" text,
	"cover_url" text,
	"release_date" date,
	"game_type" text,
	"rating" real,
	"rating_count" integer,
	"time_to_beat_hastily" integer,
	"time_to_beat_normally" integer,
	"time_to_beat_completely" integer,
	"created_by_id" text,
	"metadata_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terms" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "terms_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" "term_kind" NOT NULL,
	"igdb_id" integer,
	"name" text NOT NULL,
	"slug" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_entries" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"game_id" uuid NOT NULL,
	"status" "entry_status" NOT NULL,
	"rating" smallint,
	"review" text,
	"platform" "platform",
	"store" "store",
	"playtime_manual_min" integer DEFAULT 0 NOT NULL,
	"playtime_steam_min" integer,
	"started_at" date,
	"finished_at" date,
	"last_played_at" timestamp with time zone,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"achievements_unlocked" integer,
	"achievements_total" integer,
	"legacy_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screenshots" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"entry_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"game_id" uuid NOT NULL,
	"kind" "screenshot_kind" NOT NULL,
	"url" text,
	"storage_key" text,
	"thumb_key" text,
	"width" integer,
	"height" integer,
	"size_bytes" integer,
	"caption" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"actor_id" text NOT NULL,
	"verb" "activity_verb" NOT NULL,
	"game_id" uuid,
	"entry_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"group_key" text,
	"day" date DEFAULT current_date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"target_type" "social_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"parent_id" uuid,
	"body" text NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"in_app" text DEFAULT 'on' NOT NULL,
	"push" text DEFAULT 'on' NOT NULL,
	CONSTRAINT "notification_preferences_user_id_type_pk" PRIMARY KEY("user_id","type")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"recipient_id" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"group_key" text NOT NULL,
	"actor_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"target_type" "social_target",
	"target_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"user_id" text NOT NULL,
	"target_type" "social_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reactions_user_id_target_type_target_id_pk" PRIMARY KEY("user_id","target_type","target_id")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"reporter_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by_id" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_proposals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"entry_id" uuid,
	"game_id" uuid,
	"source" "proposal_source" NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text,
	"confidence" real,
	"status" "proposal_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "entry_history" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"entry_id" uuid,
	"game_id" uuid,
	"action" text NOT NULL,
	"source" text NOT NULL,
	"changes" jsonb NOT NULL,
	"snapshot" jsonb,
	"proposal_id" uuid,
	"reverted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "play_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"game_id" uuid NOT NULL,
	"entry_id" uuid,
	"source" "play_session_source" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"duration_min" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "steam_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"steam_id" text NOT NULL,
	"persona_name" text,
	"avatar_url" text,
	"profile_url" text,
	"visibility" integer,
	"sync_enabled" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_sync_error" text,
	"current_app_id" integer,
	"current_game_name" text,
	"current_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_ignores" (
	"user_id" text NOT NULL,
	"source" "proposal_source" NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_ignores_user_id_source_external_id_pk" PRIMARY KEY("user_id","source","external_id")
);
--> statement-breakpoint
CREATE TABLE "sync_rules" (
	"user_id" text NOT NULL,
	"source" "proposal_source" NOT NULL,
	"kind" text NOT NULL,
	"action" "sync_action" NOT NULL,
	CONSTRAINT "sync_rules_user_id_source_kind_pk" PRIMARY KEY("user_id","source","kind")
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text,
	"source" "proposal_source" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"stats" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "app_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "outbox_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_terms" ADD CONSTRAINT "game_terms_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_terms" ADD CONSTRAINT "game_terms_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_entries" ADD CONSTRAINT "library_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_entries" ADD CONSTRAINT "library_entries_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_entry_id_library_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."library_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_entry_id_library_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."library_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_id_user_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_proposals" ADD CONSTRAINT "change_proposals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_proposals" ADD CONSTRAINT "change_proposals_entry_id_library_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."library_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_proposals" ADD CONSTRAINT "change_proposals_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_history" ADD CONSTRAINT "entry_history_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_history" ADD CONSTRAINT "entry_history_entry_id_library_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."library_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_history" ADD CONSTRAINT "entry_history_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_history" ADD CONSTRAINT "entry_history_proposal_id_change_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."change_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_entry_id_library_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."library_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "steam_accounts" ADD CONSTRAINT "steam_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_ignores" ADD CONSTRAINT "sync_ignores_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_rules" ADD CONSTRAINT "sync_rules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_user_id_created_at_index" ON "ai_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_thread_id_created_at_index" ON "chat_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_threads_user_id_updated_at_index" ON "chat_threads" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "game_terms_term_id_index" ON "game_terms" USING btree ("term_id");--> statement-breakpoint
CREATE UNIQUE INDEX "games_slug_index" ON "games" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "games_igdb_id_index" ON "games" USING btree ("igdb_id") WHERE "games"."igdb_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "games_steam_app_id_index" ON "games" USING btree ("steam_app_id") WHERE "games"."steam_app_id" is not null;--> statement-breakpoint
CREATE INDEX "games_name_trgm_idx" ON "games" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "terms_kind_slug_index" ON "terms" USING btree ("kind","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "terms_kind_igdb_id_index" ON "terms" USING btree ("kind","igdb_id");--> statement-breakpoint
CREATE UNIQUE INDEX "library_entries_user_id_game_id_index" ON "library_entries" USING btree ("user_id","game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "library_entries_legacy_ref_index" ON "library_entries" USING btree ("legacy_ref") WHERE "library_entries"."legacy_ref" is not null;--> statement-breakpoint
CREATE INDEX "library_entries_user_id_status_index" ON "library_entries" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "library_entries_game_id_index" ON "library_entries" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "screenshots_entry_id_created_at_index" ON "screenshots" USING btree ("entry_id","created_at");--> statement-breakpoint
CREATE INDEX "screenshots_game_id_index" ON "screenshots" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "screenshots_user_id_index" ON "screenshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activities_updated_at_index" ON "activities" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "activities_actor_id_updated_at_index" ON "activities" USING btree ("actor_id","updated_at");--> statement-breakpoint
CREATE INDEX "activities_game_id_updated_at_index" ON "activities" USING btree ("game_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "activities_group_key_index" ON "activities" USING btree ("group_key") WHERE "activities"."group_key" is not null;--> statement-breakpoint
CREATE INDEX "comments_target_type_target_id_created_at_index" ON "comments" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_parent_id_index" ON "comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "notifications_recipient_id_updated_at_index" ON "notifications" USING btree ("recipient_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_recipient_id_group_key_index" ON "notifications" USING btree ("recipient_id","group_key") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_index" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_id_index" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reactions_target_type_target_id_index" ON "reactions" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "reports_status_created_at_index" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "change_proposals_user_id_status_created_at_index" ON "change_proposals" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "change_proposals_user_id_dedupe_key_index" ON "change_proposals" USING btree ("user_id","dedupe_key") WHERE "change_proposals"."status" = 'pending' and "change_proposals"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "entry_history_user_id_created_at_index" ON "entry_history" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "entry_history_entry_id_created_at_index" ON "entry_history" USING btree ("entry_id","created_at");--> statement-breakpoint
CREATE INDEX "play_sessions_user_id_ended_at_index" ON "play_sessions" USING btree ("user_id","ended_at");--> statement-breakpoint
CREATE INDEX "play_sessions_game_id_index" ON "play_sessions" USING btree ("game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "steam_accounts_steam_id_index" ON "steam_accounts" USING btree ("steam_id");--> statement-breakpoint
CREATE INDEX "sync_runs_user_id_started_at_index" ON "sync_runs" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox" USING btree ("available_at") WHERE "outbox"."processed_at" is null;