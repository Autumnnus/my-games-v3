CREATE TABLE "ai_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"provider" text NOT NULL,
	"name" text,
	"secret" text NOT NULL,
	"fingerprint" text NOT NULL,
	"hint" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_api_keys" ADD CONSTRAINT "ai_api_keys_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_api_keys_provider_fingerprint_index" ON "ai_api_keys" USING btree ("provider","fingerprint");--> statement-breakpoint
CREATE INDEX "ai_api_keys_provider_position_index" ON "ai_api_keys" USING btree ("provider","position");