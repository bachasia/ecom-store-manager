-- AlterTable: Add vendorRefundAmount to Order
ALTER TABLE "Order" ADD COLUMN "vendorRefundAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
