-- Steam'e bağlanmış ama IGDB kapağı olmayan oyunlara Steam kapağı yazılır. Eski sistemden gelen kapaklar
-- (elle bulunmuş web adresleri) da Steam kapağıyla değiştirilir.
UPDATE "games"
SET "cover_url" = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/' || "steam_app_id" || '/library_600x900.jpg'
WHERE "steam_app_id" IS NOT NULL
  AND "cover_image_id" IS NULL
  AND ("cover_url" IS NULL OR "source" = 'legacy');
