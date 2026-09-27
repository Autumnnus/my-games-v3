CREATE TABLE "steam_app_aliases" (
	"app_id" integer PRIMARY KEY NOT NULL,
	"game_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sync_ignores" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "steam_app_aliases" ADD CONSTRAINT "steam_app_aliases_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "steam_app_aliases_game_id_index" ON "steam_app_aliases" USING btree ("game_id");