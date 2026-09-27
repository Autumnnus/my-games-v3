ALTER TABLE "achievement_sets" ADD COLUMN "game_id" uuid;--> statement-breakpoint
ALTER TABLE "achievement_sets" ADD CONSTRAINT "achievement_sets_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "achievement_sets_game_id_index" ON "achievement_sets" USING btree ("game_id");