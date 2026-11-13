-- First substitute, applied by hand after sql/2026-11-14-item-alternates.sql.
--
-- CAPS-00230 (main MPN AVX 0805AA101KAT1A) -> Walsin 0805N101J102CT,
-- offered by the supplier whose name starts with "Chips Pulse".
--
-- Inserts nothing if that part or supplier is missing. Running it again does not
-- add a second row. Does not change the part's own MPN.

INSERT INTO "ItemAlternate" (
    "id",
    "itemId",
    "mpn",
    "manufacturer",
    "supplierId",
    "note",
    "createdAt",
    "updatedAt"
)
SELECT
    'alt_caps00230_0805N101J102CT',
    (SELECT "id" FROM "Item" WHERE "partNumber" = 'CAPS-00230'),
    '0805N101J102CT',
    'Walsin',
    (SELECT "id" FROM "Supplier" WHERE "name" ILIKE 'Chips Pulse%' ORDER BY "name" LIMIT 1),
    'Substitute for AVX 0805AA101KAT1A, offered by Chips Pulse (quote 29 Oct 2026)',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "Item" WHERE "partNumber" = 'CAPS-00230')
  AND EXISTS (SELECT 1 FROM "Supplier" WHERE "name" ILIKE 'Chips Pulse%')
ON CONFLICT ("itemId", "mpn") DO NOTHING;
