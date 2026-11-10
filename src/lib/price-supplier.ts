/**
 * Rules for which supplier a new price-history row records.
 *
 * The column is nullable so older rows still load. Anything a person enters or edits
 * in the app, and any price flowed from a purchase order, has to name a supplier.
 * These helpers are pure so the forms, the server actions, and the checks agree.
 */

export const PRICE_SUPPLIER_REQUIRED =
  "Choose a supplier. A price change is recorded against one.";

export const PO_SUPPLIER_REQUIRED =
  "Assign a supplier to this purchase order before changing a price. Price history records which supplier it came from.";

export const SUPPLIER_GONE = "That supplier no longer exists.";

export const INVALID_COST = "Enter a valid unit cost.";

export class PriceSupplierRequiredError extends Error {
  constructor(message = PRICE_SUPPLIER_REQUIRED) {
    super(message);
    this.name = "PriceSupplierRequiredError";
  }
}

/** Blank and the bulk-edit "unassign" sentinel are both "no supplier". */
export function normalizeSupplierId(raw: string | null | undefined): string | null {
  const id = (raw ?? "").trim();
  if (id === "" || id === "__none__") return null;
  return id;
}

/**
 * True when setItemCost would append a row.
 * Zero and below mean "unknown" and never overwrite a known cost.
 */
export function costChangeRecordsHistory(previous: number | null | undefined, next: number | null): boolean {
  if (previous === undefined) return false;
  if (next == null || !Number.isFinite(next) || next <= 0) return false;
  return previous !== next;
}

/**
 * True when a manual or bulk cost edit would append a row.
 * Unlike a purchase-order price, typing 0 is a real change and is recorded.
 */
export function manualCostRecordsHistory(previous: number | null, next: number | null): boolean {
  if (next == null || !Number.isFinite(next)) return false;
  return previous !== next;
}

export function parseNonNegativeCost(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return "invalid";
  return Math.max(0, n);
}

/** Whether the part-planning form must require a supplier for this typed cost. */
export function manualFormRecordsHistory(previous: number | null, raw: string): boolean {
  const next = parseNonNegativeCost(raw);
  if (next === "invalid" || next == null) return false;
  return manualCostRecordsHistory(previous, next);
}

/** A hand-created part only opens a price-history row when the cost is above zero. */
export function createFormNeedsSupplier(raw: string): boolean {
  const next = parseNonNegativeCost(raw);
  return next !== "invalid" && next != null && next > 0;
}

export function resolveRecordedSupplier(
  supplierId: string | null | undefined,
  requireSupplier: boolean,
  error = PRICE_SUPPLIER_REQUIRED,
): { ok: true; supplierId: string | null } | { ok: false; error: string } {
  const id = normalizeSupplierId(supplierId);
  if (requireSupplier && !id) return { ok: false, error };
  return { ok: true, supplierId: id };
}

/** The supplier select on a part's planning form. The value submitted is the one recorded. */
export function historySupplierForManual(explicitSupplierId: string | null):
  | { ok: true; supplierId: string }
  | { ok: false; error: string } {
  const resolved = resolveRecordedSupplier(explicitSupplierId, true);
  if (!resolved.ok || !resolved.supplierId) return { ok: false, error: PRICE_SUPPLIER_REQUIRED };
  return { ok: true, supplierId: resolved.supplierId };
}

export function historySupplierForPo(supplierId: string | null | undefined):
  | { ok: true; supplierId: string }
  | { ok: false; error: string } {
  const resolved = resolveRecordedSupplier(supplierId, true, PO_SUPPLIER_REQUIRED);
  if (!resolved.ok || !resolved.supplierId) return { ok: false, error: PO_SUPPLIER_REQUIRED };
  return { ok: true, supplierId: resolved.supplierId };
}

export interface BulkPricePart {
  id: string;
  supplierId: string | null;
  unitCost: number | null;
}

/**
 * Supplier for each part whose cost actually changes in a bulk edit.
 *
 * An explicit supplier applies to every row. "Unchanged" keeps each part's own supplier.
 * Unassigning while also setting a cost is refused — the new row would have nobody to name.
 */
export function historySuppliersForBulk(input: {
  formSupplierId: string;
  parts: BulkPricePart[];
  nextCost: number;
}):
  | { ok: true; rows: { id: string; supplierId: string; previousCost: number | null }[] }
  | { ok: false; error: string } {
  const changed = input.parts.filter((p) => p.unitCost !== input.nextCost);
  if (changed.length === 0) return { ok: true, rows: [] };
  if (input.formSupplierId.trim() === "__none__") return { ok: false, error: PRICE_SUPPLIER_REQUIRED };

  const explicit = normalizeSupplierId(input.formSupplierId);
  const rows: { id: string; supplierId: string; previousCost: number | null }[] = [];
  for (const part of changed) {
    const supplierId = explicit ?? normalizeSupplierId(part.supplierId);
    if (!supplierId) return { ok: false, error: PRICE_SUPPLIER_REQUIRED };
    rows.push({ id: part.id, supplierId, previousCost: part.unitCost });
  }
  return { ok: true, rows };
}

/** Message for the bulk-edit form, or "" when the selection is allowed. */
export function bulkFormSupplierError(
  formSupplierRaw: string,
  parts: BulkPricePart[],
  costRaw: string,
): string {
  const next = parseNonNegativeCost(costRaw);
  if (next === "invalid") return INVALID_COST;
  if (next == null) return "";
  const decision = historySuppliersForBulk({ formSupplierId: formSupplierRaw, parts, nextCost: next });
  return decision.ok ? "" : decision.error;
}

/** What the Price History table shows when a row has no supplier. */
export function supplierLabel(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? "";
  return trimmed === "" ? "—" : trimmed;
}

/**
 * Match a free-text supplier note from a spreadsheet to an existing supplier.
 * Exact name only — a loose match would pin a price to the wrong vendor.
 */
export function matchSupplierByNote(
  note: string | null | undefined,
  suppliers: { id: string; name: string }[],
): string | null {
  const key = note?.trim().toLowerCase() ?? "";
  if (!key) return null;
  return suppliers.find((s) => s.name.trim().toLowerCase() === key)?.id ?? null;
}
