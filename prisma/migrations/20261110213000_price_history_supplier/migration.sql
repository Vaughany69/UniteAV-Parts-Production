-- Additive, nullable supplier on price history.
-- Existing rows stay blank (supplierId NULL) and keep loading.
-- Apply with `npx prisma migrate deploy` (or run this file) against a database you own.
-- Do not run it against a database you do not own. Production is applied at deploy time,
-- not by this change.

-- AlterTable
ALTER TABLE "PriceHistory" ADD COLUMN "supplierId" TEXT;

-- CreateIndex
CREATE INDEX "PriceHistory_supplierId_idx" ON "PriceHistory"("supplierId");

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
