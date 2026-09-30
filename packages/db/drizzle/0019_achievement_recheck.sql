-- Başarım çekimi geçici bir hatayla (istek sınırı) başarısız olunca başlık yine de "kontrol edildi" işaretleniyordu;
-- Steam başarım sayısını önceden bildirmediği için bu başlıklar bir daha hiç denenmiyordu. Hiç başarım gelmemiş
-- Steam başlıkları yeniden denenir (başarımı olmayanlar da bir kez daha kontrol edilir, zararsız).
UPDATE "platform_snapshots" SET "achievements_checked_at" = NULL
WHERE "provider" = 'steam' AND "achievements_unlocked" IS NULL;
