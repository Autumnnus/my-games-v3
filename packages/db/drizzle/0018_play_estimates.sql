CREATE TABLE "play_estimate_builds" (
	"user_id" text PRIMARY KEY NOT NULL,
	"built_at" timestamp with time zone NOT NULL,
	"generator_version" integer NOT NULL,
	"hash" text NOT NULL,
	"stats" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "play_estimate_days" (
	"entry_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"minutes" integer NOT NULL,
	CONSTRAINT "play_estimate_days_entry_id_day_pk" PRIMARY KEY("entry_id","day")
);
--> statement-breakpoint
CREATE TABLE "play_estimate_plans" (
	"entry_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"budget_min" integer NOT NULL,
	"window_from" date NOT NULL,
	"window_to" date NOT NULL,
	"pattern" text NOT NULL,
	"plan" jsonb NOT NULL,
	"confidence" real NOT NULL,
	"planner" text NOT NULL,
	"needs_ai" boolean DEFAULT false NOT NULL,
	"model" text,
	"evidence_hash" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"generator_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_snapshots" ADD COLUMN "baseline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_snapshots" ADD COLUMN "baseline_last_played_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "play_estimate_builds" ADD CONSTRAINT "play_estimate_builds_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_estimate_days" ADD CONSTRAINT "play_estimate_days_entry_id_library_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."library_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_estimate_days" ADD CONSTRAINT "play_estimate_days_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_estimate_plans" ADD CONSTRAINT "play_estimate_plans_entry_id_library_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."library_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_estimate_plans" ADD CONSTRAINT "play_estimate_plans_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "play_estimate_days_user_id_day_index" ON "play_estimate_days" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "play_estimate_plans_user_id_index" ON "play_estimate_plans" USING btree ("user_id");--> statement-breakpoint
-- Mevcut gözlemler: ilk gözlem anı bilinmiyor, son güncelleme üst sınırdır. O arada oynanan süre zaten
-- oturum olarak yazıldığından tahmin ufku ilk oturumla da sınırlanır (bkz. core/estimates/evidence).
UPDATE "platform_snapshots" SET "baseline_at" = "updated_at" WHERE "playtime_min" IS NOT NULL;
