-- CreateIndex
CREATE INDEX "Product_storeId_parentExternalId_idx" ON "Product"("storeId", "parentExternalId");

-- CreateIndex
CREATE INDEX "Product_storeId_name_idx" ON "Product"("storeId", "name");

-- CreateIndex
CREATE INDEX "Product_storeId_sku_idx" ON "Product"("storeId", "sku");
