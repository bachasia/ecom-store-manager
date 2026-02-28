-- AddColumn autoSyncEnabled
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AddColumn autoSyncInterval (minutes, default 60)
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "autoSyncInterval" INTEGER NOT NULL DEFAULT 60;

-- AddColumn lastOrderAutoSyncAt
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "lastOrderAutoSyncAt" TIMESTAMP(3);

-- AddColumn lastProductAutoSyncAt
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "lastProductAutoSyncAt" TIMESTAMP(3);
