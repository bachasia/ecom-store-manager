/*
  Warnings:

  - Made the column `campaignName` on table `AdsCost` required. This step will fail if there are existing NULL values in that column.
  - Made the column `adsetName` on table `AdsCost` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "AdsCost" ALTER COLUMN "campaignName" SET NOT NULL,
ALTER COLUMN "campaignName" SET DEFAULT '',
ALTER COLUMN "adsetName" SET NOT NULL,
ALTER COLUMN "adsetName" SET DEFAULT '';
