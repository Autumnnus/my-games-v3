ALTER TYPE "public"."activity_verb" ADD VALUE 'achievements_unlocked' BEFORE 'screenshots_added';--> statement-breakpoint
ALTER TYPE "public"."game_source" ADD VALUE 'psn';--> statement-breakpoint
ALTER TYPE "public"."game_source" ADD VALUE 'xbox';--> statement-breakpoint
ALTER TYPE "public"."play_session_source" ADD VALUE 'psn_delta' BEFORE 'desktop';--> statement-breakpoint
ALTER TYPE "public"."play_session_source" ADD VALUE 'xbox_delta' BEFORE 'desktop';--> statement-breakpoint
ALTER TYPE "public"."proposal_source" ADD VALUE 'psn' BEFORE 'igdb';--> statement-breakpoint
ALTER TYPE "public"."proposal_source" ADD VALUE 'xbox' BEFORE 'igdb';--> statement-breakpoint
CREATE TABLE "game_external_ids" (
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"game_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_external_ids_provider_external_id_pk" PRIMARY KEY("provider","external_id")
);
--> statement-breakpoint
CREATE TABLE "achievement_sets" (
	"provider" text NOT NULL,
	"game_key" text NOT NULL,
	"total" integer NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "achievement_sets_provider_game_key_pk" PRIMARY KEY("provider","game_key")
);
--> statement-breakpoint
CREATE TABLE "achievements" (
	"provider" text NOT NULL,
	"game_key" text NOT NULL,
	"api_name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"localized" jsonb,
	"icon_url" text,
	"icon_locked_url" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"rarity" real,
	"grade" text,
	CONSTRAINT "achievements_provider_game_key_api_name_pk" PRIMARY KEY("provider","game_key","api_name")
);
--> statement-breakpoint
CREATE TABLE "platform_accounts" (
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"credentials" text NOT NULL,
	"credentials_expire_at" timestamp with time zone,
	"needs_reauth" boolean DEFAULT false NOT NULL,
	"sync_enabled" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_accounts_user_id_provider_pk" PRIMARY KEY("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "platform_snapshots" (
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"playtime_min" integer,
	"achievements_unlocked" integer,
	"achievements_checked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_snapshots_user_id_provider_external_id_pk" PRIMARY KEY("user_id","provider","external_id")
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"game_key" text NOT NULL,
	"api_name" text NOT NULL,
	"unlocked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_achievements_user_id_provider_game_key_api_name_pk" PRIMARY KEY("user_id","provider","game_key","api_name")
);
--> statement-breakpoint
ALTER TABLE "library_entries" ADD COLUMN "playtime_psn_min" integer;--> statement-breakpoint
ALTER TABLE "library_entries" ADD COLUMN "playtime_xbox_min" integer;--> statement-breakpoint
ALTER TABLE "screenshots" ADD COLUMN "thumb_url" text;--> statement-breakpoint
ALTER TABLE "screenshots" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "screenshots" ADD COLUMN "taken_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "steam_accounts" ADD COLUMN "screenshots_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "game_external_ids" ADD CONSTRAINT "game_external_ids_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_accounts" ADD CONSTRAINT "platform_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_snapshots" ADD CONSTRAINT "platform_snapshots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_external_ids_game_id_index" ON "game_external_ids" USING btree ("game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_accounts_provider_external_id_index" ON "platform_accounts" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "user_achievements_user_id_unlocked_at_index" ON "user_achievements" USING btree ("user_id","unlocked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "screenshots_user_id_external_id_index" ON "screenshots" USING btree ("user_id","external_id") WHERE "screenshots"."external_id" is not null;