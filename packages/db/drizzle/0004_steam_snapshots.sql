CREATE TABLE "steam_snapshots" (
	"user_id" text NOT NULL,
	"app_id" integer NOT NULL,
	"playtime_min" integer NOT NULL,
	"achievements_checked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "steam_snapshots_user_id_app_id_pk" PRIMARY KEY("user_id","app_id")
);
--> statement-breakpoint
ALTER TABLE "steam_snapshots" ADD CONSTRAINT "steam_snapshots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;