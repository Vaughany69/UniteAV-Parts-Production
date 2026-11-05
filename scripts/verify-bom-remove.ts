/**
 * Check that a BOM-line removal is refused unless it is exactly one line on the
 * named parent.
 *
 * Imports the guard the action uses, rather than restating it. No database and no
 * signed-in user: the admin role is enforced in the server action (`requireRole("ADMIN")`),
 * and the delete itself only removes that BomLine row. This script is the part that is
 * easy to get quietly wrong — deleting a shared part's line on a different product.
 *
 *   npx tsx scripts/verify-bom-remove.ts
 */
import { bomLineRemovalError, type BomLineRef } from "@/lib/bom/remove-line";

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`}`);
}

const onAmp: BomLineRef = { id: "line-amp", parentItemId: "product-amp" };
const onDecoder: BomLineRef = { id: "line-dec", parentItemId: "product-decoder" };

console.log("\nA line comes off only the product that owns it");
check("the line on this product may go", bomLineRemovalError(onAmp, "line-amp", "product-amp"), null);
check(
  "the same part's line on another product is refused",
  bomLineRemovalError(onDecoder, "line-dec", "product-amp"),
  "That line is not on this product.",
);
check(
  "asking for a line id we did not load is refused",
  bomLineRemovalError(onAmp, "line-dec", "product-amp"),
  "BOM line not found.",
);
check("a missing row is refused", bomLineRemovalError(null, "line-amp", "product-amp"), "BOM line not found.");

console.log("\nEmpty ids are refused before any delete");
check("no line id", bomLineRemovalError(onAmp, "  ", "product-amp"), "Missing BOM line.");
check("no product id", bomLineRemovalError(onAmp, "line-amp", ""), "Missing product.");
check("neither id", bomLineRemovalError(null, "", ""), "Missing BOM line.");

console.log("\nSurrounding whitespace does not open a second product");
check("ids are trimmed", bomLineRemovalError(onAmp, "  line-amp  ", "  product-amp  "), null);
check(
  "a trimmed id still has to be this product's line",
  bomLineRemovalError(onDecoder, " line-dec ", " product-amp "),
  "That line is not on this product.",
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
