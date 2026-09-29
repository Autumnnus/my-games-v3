CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"target_id" uuid,
	"purpose" text NOT NULL,
	"quality" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"variants" jsonb NOT NULL,
	"total_bytes" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_storage" (
	"user_id" text PRIMARY KEY NOT NULL,
	"quota_bytes" bigint,
	"quota_note" text,
	"quota_set_by" text,
	"quota_updated_at" timestamp with time zone,
	"upload_quality" text DEFAULT 'optimized' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_storage" ADD CONSTRAINT "user_storage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_assets_user_id_purpose_index" ON "media_assets" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "media_assets_status_created_at_index" ON "media_assets" USING btree ("status","created_at");--> statement-breakpoint
-- Eski anahtar düzenindeki yüklemeler taşınmaz (sadece yerel MinIO test verisi vardı; prod'da yok).
DELETE FROM "screenshots" WHERE "kind" = 'upload';--> statement-breakpoint
ALTER TABLE "screenshots" DROP COLUMN "storage_key";--> statement-breakpoint
ALTER TABLE "screenshots" DROP COLUMN "thumb_key";--> statement-breakpoint
ALTER TABLE "screenshots" DROP COLUMN "size_bytes";