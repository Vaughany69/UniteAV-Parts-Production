/**
 * Supplier rules for price history, with no database.
 *   npx tsx scripts/verify-price-supplier.ts
 */
import {
  bulkFormSupplierError,
  costChangeRecordsHistory,
  createFormNeedsSupplier,
  historySupplierForManual,
  historySupplierForPo,
  historySuppliersForBulk,
  manualCostRecordsHistory,
  manualFormRecordsHistory,
  matchSupplierByNote,
  normalizeSupplierId,
  PO_SUPPLIER_REQUIRED,
  PRICE_SUPPLIER_REQUIRED,
  resolveRecordedSupplier,
  supplierLabel,
} from "../src/lib/price-supplier";

function assert(c: boolean, m: string) {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) process.exitCode = 1;
}

const digikey = "sup_digikey";
const mouser = "sup_mouser";

console.log("Blank supplier id");
assert(normalizeSupplierId(null) === null, "null");
assert(normalizeSupplierId("  ") === null, "whitespace");
assert(normalizeSupplierId("__none__") === null, "unassign sentinel");
assert(normalizeSupplierId(`  ${digikey}  `) === digikey, "trimmed id");

console.log("What actually writes a row");
assert(costChangeRecordsHistory(1, 1) === false, "same PO price writes nothing");
assert(costChangeRecordsHistory(1, 2) === true, "changed PO price writes a row");
assert(costChangeRecordsHistory(1, 0) === false, "zero PO price does not overwrite");
assert(costChangeRecordsHistory(null, 2) === true, "first positive price writes a row");
assert(costChangeRecordsHistory(undefined, 2) === false, "missing part writes nothing");
assert(manualCostRecordsHistory(1, 0) === true, "typing 0 on a part is a recorded edit");
assert(manualCostRecordsHistory(1, null) === false, "clearing the cost writes nothing");
assert(manualFormRecordsHistory(1.5, "1.5") === false, "unchanged typed cost");
assert(manualFormRecordsHistory(1.5, "2") === true, "changed typed cost");
assert(manualFormRecordsHistory(1.5, "") === false, "blank cost box");
assert(manualFormRecordsHistory(1.5, "nope") === false, "invalid cost is not a history row");
assert(createFormNeedsSupplier("") === false, "new part with no cost");
assert(createFormNeedsSupplier("0") === false, "new part priced at zero");
assert(createFormNeedsSupplier("0.2") === true, "new part with a price");

console.log("Manual and purchase-order suppliers are required");
const manualMissing = historySupplierForManual(null);
assert(manualMissing.ok === false, "manual edit with no supplier is refused");
const manualSet = historySupplierForManual(digikey);
assert(manualSet.ok === true && manualSet.supplierId === digikey, "manual edit keeps the chosen supplier");
const poMissing = historySupplierForPo(null);
assert(poMissing.ok === false && poMissing.error === PO_SUPPLIER_REQUIRED, "PO price with no supplier is refused");
const poSet = historySupplierForPo(mouser);
assert(poSet.ok === true && poSet.supplierId === mouser, "PO price uses the order's supplier");
const sheetBlank = resolveRecordedSupplier(null, false);
assert(sheetBlank.ok === true && sheetBlank.supplierId === null, "a sheet import may leave the supplier blank");
assert(resolveRecordedSupplier(null, true).ok === false, "an app write may not");

console.log("Bulk edit");
const parts = [
  { id: "a", supplierId: digikey, unitCost: 1 },
  { id: "b", supplierId: null, unitCost: 1 },
  { id: "c", supplierId: mouser, unitCost: 3 },
];
const unchanged = historySuppliersForBulk({ formSupplierId: "", parts, nextCost: 1 });
assert(
  unchanged.ok === true && unchanged.rows.length === 1 && unchanged.rows[0].id === "c" && unchanged.rows[0].supplierId === mouser,
  "unchanged supplier uses the part's own",
);
const missing = historySuppliersForBulk({ formSupplierId: "", parts, nextCost: 4 });
assert(missing.ok === false && missing.error === PRICE_SUPPLIER_REQUIRED, "a part with no supplier blocks the cost change");
const explicit = historySuppliersForBulk({ formSupplierId: digikey, parts, nextCost: 4 });
assert(explicit.ok === true && explicit.rows.every((r) => r.supplierId === digikey), "an explicit supplier covers every changed part");
const unassign = historySuppliersForBulk({ formSupplierId: "__none__", parts, nextCost: 4 });
assert(unassign.ok === false, "unassigning while setting a cost is refused");
const noChange = historySuppliersForBulk({ formSupplierId: "__none__", parts: [parts[0]], nextCost: 1 });
assert(noChange.ok === true && noChange.rows.length === 0, "unassigning without a cost change is allowed");
assert(bulkFormSupplierError("", [parts[1]], "9") === PRICE_SUPPLIER_REQUIRED, "the bulk form says so before submit");
assert(bulkFormSupplierError("", [parts[0]], "") === "", "a blank cost box leaves the supplier optional");
assert(bulkFormSupplierError(digikey, parts, "9") === "", "picking a supplier clears the form error");

console.log("Display and spreadsheet notes");
assert(supplierLabel(null) === "—", "legacy row shows a dash");
assert(supplierLabel("  ") === "—", "blank name shows a dash");
assert(supplierLabel("Digi-Key") === "Digi-Key", "named supplier is shown");
const suppliers = [
  { id: digikey, name: "Digi-Key" },
  { id: mouser, name: "Mouser" },
];
assert(matchSupplierByNote(" digi-key ", suppliers) === digikey, "exact note matches a supplier");
assert(matchSupplierByNote("Digi-Key, 2 weeks", suppliers) === null, "a longer note does not guess");
assert(matchSupplierByNote(null, suppliers) === null, "no note stays blank");

if (process.exitCode) console.log("\nPrice supplier checks failed.");
else console.log("\nPrice supplier checks passed.");
