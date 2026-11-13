-- Additive table for substitute manufacturer part numbers.
--
-- Apply this by hand to the live database BEFORE the app that reads ItemAlternate
-- is deployed. Production has no _prisma_migrations history, so do not run
-- `prisma migrate deploy` for this change.
--
-- Safe for the app that is deployed today: it only adds a table, foreign keys and
-- indexes. No existing table or column is altered, and the current code never
-- reads ItemAlternate. Running this file again is a no-op.
--
-- Names match what Prisma generates from the ItemAlternate model.

CREATE TABLE IF NOT EXISTS "ItemAlternate" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "mpn" TEXT NOT NULL,
    "manufacturer" TEXT,
    "supplierId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemAlternate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ItemAlternate_itemId_mpn_key" ON "ItemAlternate"("itemId", "mpn");

CREATE INDEX IF NOT EXISTS "ItemAlternate_mpn_idx" ON "ItemAlternate"("mpn");

DO $$ BEGIN
    ALTER TABLE "ItemAlternate"
        ADD CONSTRAINT "ItemAlternate_itemId_fkey"
        FOREIGN KEY ("itemId") REFERENCES "Item"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "ItemAlternate"
        ADD CONSTRAINT "ItemAlternate_supplierId_fkey"
        FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
