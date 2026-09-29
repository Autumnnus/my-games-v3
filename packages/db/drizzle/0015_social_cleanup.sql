CREATE INDEX "notifications_target_type_target_id_index" ON "notifications" USING btree ("target_type","target_id");--> statement-breakpoint
-- Beğeni, yorum ve bildirimler hedeflerine polimorfik bağlı (FK yok). Hedef nereden silinirse silinsin
-- (doğrudan, asset/entry/oyun/kullanıcı cascade'i) altındaki sosyal kayıtlar da gider.
CREATE FUNCTION "cleanup_social_target"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM "reactions" WHERE "target_type" = TG_ARGV[0]::"social_target" AND "target_id" = OLD."id";
  DELETE FROM "comments" WHERE "target_type" = TG_ARGV[0]::"social_target" AND "target_id" = OLD."id";
  DELETE FROM "notifications" WHERE "target_type" = TG_ARGV[0]::"social_target" AND "target_id" = OLD."id";
  RETURN OLD;
END $$;
--> statement-breakpoint
CREATE TRIGGER "activities_cleanup_social" AFTER DELETE ON "activities"
  FOR EACH ROW EXECUTE FUNCTION "cleanup_social_target"('activity');
--> statement-breakpoint
CREATE TRIGGER "library_entries_cleanup_social" AFTER DELETE ON "library_entries"
  FOR EACH ROW EXECUTE FUNCTION "cleanup_social_target"('entry');
--> statement-breakpoint
CREATE TRIGGER "screenshots_cleanup_social" AFTER DELETE ON "screenshots"
  FOR EACH ROW EXECUTE FUNCTION "cleanup_social_target"('screenshot');
--> statement-breakpoint
-- Silinen ekran görüntüsü "ekran görüntüsü ekledi" aktivitesinden çıkar; hiçbiri kalmazsa aktivite silinir.
CREATE FUNCTION "screenshots_prune_activity"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "activities" SET "data" = jsonb_build_object('screenshotIds', pruned.ids, 'count', jsonb_array_length(pruned.ids))
  FROM (
    SELECT a."id", coalesce((
      SELECT jsonb_agg(value) FROM jsonb_array_elements(a."data"->'screenshotIds') AS value
      WHERE value <> to_jsonb(OLD."id"::text)
    ), '[]'::jsonb) AS ids
    FROM "activities" a
    WHERE a."verb" = 'screenshots_added' AND a."entry_id" = OLD."entry_id"
      AND a."data"->'screenshotIds' @> jsonb_build_array(OLD."id"::text)
  ) AS pruned
  WHERE "activities"."id" = pruned."id";
  DELETE FROM "activities"
  WHERE "verb" = 'screenshots_added' AND "entry_id" = OLD."entry_id"
    AND jsonb_array_length(coalesce("data"->'screenshotIds', '[]'::jsonb)) = 0;
  RETURN OLD;
END $$;
--> statement-breakpoint
CREATE TRIGGER "screenshots_prune_activity" AFTER DELETE ON "screenshots"
  FOR EACH ROW EXECUTE FUNCTION "screenshots_prune_activity"();
--> statement-breakpoint
-- "Oyun ekledi" aktivitesi aynı gün eklenen oyunları toplar; silinen oyun listeden çıkar. BEFORE: aktivitenin
-- `entry_id`'si silinen kayda bakıyorsa kalan bir oyuna taşınır, yoksa cascade tüm grubu silerdi.
CREATE FUNCTION "library_entries_prune_activity"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "activities" SET
    "data" = jsonb_build_object('items', remaining.items, 'count', greatest(coalesce(("data"->>'count')::int, 1) - 1, 0)),
    "entry_id" = coalesce((remaining.items->0->>'entryId')::uuid, "entry_id"),
    "game_id" = coalesce((remaining.items->0->>'gameId')::uuid, "game_id")
  FROM (
    SELECT a."id", coalesce((
      SELECT jsonb_agg(item) FROM jsonb_array_elements(a."data"->'items') AS item
      WHERE item->>'entryId' <> OLD."id"::text
    ), '[]'::jsonb) AS items
    FROM "activities" a
    WHERE a."verb" = 'entry_added' AND a."actor_id" = OLD."user_id"
      AND a."data"->'items' @> jsonb_build_array(jsonb_build_object('entryId', OLD."id"::text))
  ) AS remaining
  WHERE "activities"."id" = remaining."id";
  DELETE FROM "activities"
  WHERE "verb" = 'entry_added' AND "actor_id" = OLD."user_id"
    AND jsonb_array_length(coalesce("data"->'items', '[]'::jsonb)) = 0;
  RETURN OLD;
END $$;
--> statement-breakpoint
CREATE TRIGGER "library_entries_prune_activity" BEFORE DELETE ON "library_entries"
  FOR EACH ROW EXECUTE FUNCTION "library_entries_prune_activity"();
--> statement-breakpoint
-- Tetikleyicilerden önce kalan artıklar. Ekran görüntüsü aktiviteleri eskiden yalnızca ilk 8 id'yi tutuyordu;
-- aynı entry'nin bir önceki aktivitesinden bu yana eklenen (hâlâ var olan) görüntülerle yeniden kurulur.
WITH windows AS (
  SELECT "id", "entry_id", "updated_at",
    lag("updated_at") OVER (PARTITION BY "entry_id" ORDER BY "updated_at", "id") AS "after"
  FROM "activities" WHERE "verb" = 'screenshots_added'
), rebuilt AS (
  SELECT w."id", coalesce((
    SELECT jsonb_agg(s."id"::text ORDER BY s."created_at" DESC, s."id" DESC) FROM "screenshots" s
    WHERE s."entry_id" = w."entry_id" AND s."created_at" <= w."updated_at"
      AND (w."after" IS NULL OR s."created_at" > w."after")
  ), '[]'::jsonb) AS ids
  FROM windows w
)
UPDATE "activities" a
SET "data" = jsonb_build_object('screenshotIds', r.ids, 'count', jsonb_array_length(r.ids))
FROM rebuilt r WHERE a."id" = r."id";
--> statement-breakpoint
DELETE FROM "activities"
WHERE "verb" = 'screenshots_added' AND jsonb_array_length(coalesce("data"->'screenshotIds', '[]'::jsonb)) = 0;
--> statement-breakpoint
DELETE FROM "reactions" r WHERE
  (r."target_type" = 'activity' AND NOT EXISTS (SELECT 1 FROM "activities" x WHERE x."id" = r."target_id"))
  OR (r."target_type" = 'entry' AND NOT EXISTS (SELECT 1 FROM "library_entries" x WHERE x."id" = r."target_id"))
  OR (r."target_type" = 'screenshot' AND NOT EXISTS (SELECT 1 FROM "screenshots" x WHERE x."id" = r."target_id"));
--> statement-breakpoint
DELETE FROM "comments" r WHERE
  (r."target_type" = 'activity' AND NOT EXISTS (SELECT 1 FROM "activities" x WHERE x."id" = r."target_id"))
  OR (r."target_type" = 'entry' AND NOT EXISTS (SELECT 1 FROM "library_entries" x WHERE x."id" = r."target_id"))
  OR (r."target_type" = 'screenshot' AND NOT EXISTS (SELECT 1 FROM "screenshots" x WHERE x."id" = r."target_id"));
--> statement-breakpoint
DELETE FROM "notifications" r WHERE
  (r."target_type" = 'activity' AND NOT EXISTS (SELECT 1 FROM "activities" x WHERE x."id" = r."target_id"))
  OR (r."target_type" = 'entry' AND NOT EXISTS (SELECT 1 FROM "library_entries" x WHERE x."id" = r."target_id"))
  OR (r."target_type" = 'screenshot' AND NOT EXISTS (SELECT 1 FROM "screenshots" x WHERE x."id" = r."target_id"));
