-- DropIndex
DROP INDEX "AdsCost_storeId_date_platform_campaignName_adsetName_key";

-- AlterTable
ALTER TABLE "AdsCost" ADD COLUMN     "accountName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "costPerPurchase" DECIMAL(10,6),
ADD COLUMN     "cpc" DECIMAL(10,8),
ADD COLUMN     "cpm" DECIMAL(10,6),
ADD COLUMN     "ctr" DECIMAL(12,8),
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "exchangeRate" DECIMAL(12,6),
ADD COLUMN     "originalSpend" DECIMAL(10,2),
ADD COLUMN     "purchaseValue" DECIMAL(10,2),
ADD COLUMN     "purchases" INTEGER;

-- CreateTable
CREATE TABLE "AdsAccountMapping" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'facebook',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdsAccountMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdsAccountMapping_storeId_idx" ON "AdsAccountMapping"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "AdsAccountMapping_platform_accountName_key" ON "AdsAccountMapping"("platform", "accountName");

-- CreateIndex
CREATE INDEX "AdsCost_storeId_date_idx" ON "AdsCost"("storeId", "date");

-- CreateIndex
CREATE INDEX "AdsCost_accountName_idx" ON "AdsCost"("accountName");

-- CreateIndex
CREATE UNIQUE INDEX "AdsCost_storeId_date_platform_accountName_campaignName_adse_key" ON "AdsCost"("storeId", "date", "platform", "accountName", "campaignName", "adsetName");

-- AddForeignKey
ALTER TABLE "AdsAccountMapping" ADD CONSTRAINT "AdsAccountMapping_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
