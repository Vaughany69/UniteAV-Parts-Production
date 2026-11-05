/**
 * Whether one BOM line may be removed from one parent.
 *
 * A removal is allowed to touch exactly one BomLine row: the edge between this product
 * (or board) and one child. The part itself, its cost and stock, and every other
 * product's lines are out of scope. The action that calls this still has to be an
 * admin, load the row, and delete only that row.
 *
 * The decision is pure so it can be checked without a database or a signed-in user.
 * The ids come from the client, so they are untrusted until they match a row that
 * actually sits on the parent the page named.
 */
export interface BomLineRef {
  id: string;
  parentItemId: string;
}

export function bomLineRemovalError(
  line: BomLineRef | null,
  bomLineId: string,
  parentItemId: string,
): string | null {
  const id = String(bomLineId ?? "").trim();
  const parentId = String(parentItemId ?? "").trim();
  if (!id) return "Missing BOM line.";
  if (!parentId) return "Missing product.";
  if (!line || line.id !== id) return "BOM line not found.";
  if (line.parentItemId !== parentId) return "That line is not on this product.";
  return null;
}
