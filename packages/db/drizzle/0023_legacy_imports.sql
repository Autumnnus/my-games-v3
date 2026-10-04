CREATE TABLE "legacy_imports" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"created_by" text,
	"file_name" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"total" integer NOT NULL,
	"processed" integer DEFAULT 0 NOT NULL,
	"records" jsonb,
	"report" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "legacy_imports" ADD CONSTRAINT "legacy_imports_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_imports" ADD CONSTRAINT "legacy_imports_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legacy_imports_user_id_created_at_index" ON "legacy_imports" USING btree ("user_id","created_at");