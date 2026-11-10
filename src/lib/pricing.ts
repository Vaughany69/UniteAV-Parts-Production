import { prisma } from "@/lib/prisma";
import { PriceSupplierRequiredError, resolveRecordedSupplier, SUPPLIER_GONE } from "@/lib/price-supplier";

export { PriceSupplierRequiredError } from "@/lib/price-supplier";

async function supplierExists(supplierId: string): Promise<boolean> {
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true } });
  return supplier != null;
}

/**
 * Set a part's unit cost and append a PriceHistory entry when it actually
 * changes. Zero/invalid means "unknown" and never overwrites a known cost.
 *
 * A row written from the app or a purchase order must name a supplier.
 * Pass `requireSupplier: false` only for a sheet import that has no supplier record;
 * the column stays null and the history table shows a blank.
 */
export async function setItemCost(
  itemId: string,
  cost: number,
  note?: string | null,
  userId?: string | null,
  supplierId?: string | null,
  requireSupplier = true,
): Promise<void> {
  if (!Number.isFinite(cost) || cost <= 0) return;
  const item = await prisma.item.findUnique({ where: { id: itemId }, select: { unitCost: true } });
  if (!item || item.unitCost === cost) return;

  const resolved = resolveRecordedSupplier(supplierId, requireSupplier);
  if (!resolved.ok) throw new PriceSupplierRequiredError(resolved.error);
  if (resolved.supplierId && !(await supplierExists(resolved.supplierId))) {
    throw new PriceSupplierRequiredError(SUPPLIER_GONE);
  }

  await prisma.$transaction([
    prisma.item.update({ where: { id: itemId }, data: { unitCost: cost } }),
    prisma.priceHistory.create({
      data: {
        itemId,
        unitCost: cost,
        previousCost: item.unitCost,
        note: note ?? null,
        userId: userId ?? null,
        supplierId: resolved.supplierId,
      },
    }),
  ]);
}

/** Log a price change that was already applied to the item elsewhere. */
export async function logPriceChange(
  itemId: string,
  unitCost: number,
  previousCost: number | null,
  note: string | null | undefined,
  userId: string | null | undefined,
  supplierId: string,
): Promise<void> {
  const resolved = resolveRecordedSupplier(supplierId, true);
  if (!resolved.ok || !resolved.supplierId) {
    throw new PriceSupplierRequiredError(resolved.ok ? undefined : resolved.error);
  }
  if (!(await supplierExists(resolved.supplierId))) throw new PriceSupplierRequiredError(SUPPLIER_GONE);

  await prisma.priceHistory.create({
    data: {
      itemId,
      unitCost,
      previousCost,
      note: note ?? null,
      userId: userId ?? null,
      supplierId: resolved.supplierId,
    },
  });
}
