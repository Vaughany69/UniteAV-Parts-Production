"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { explodeProduct } from "@/lib/bom/explode";
import { productsAbove } from "@/lib/item-removal";
import { createPartRecord, partInputFromForm } from "@/lib/part-create";
import { bomLineRemovalError } from "@/lib/bom/remove-line";

/**
 * Hand-editing BOM lines. Anything changed here is subject to the same pruning an import
 * does: re-importing a board's BOM rebuilds it from the sheet and drops lines the sheet
 * doesn't carry. The UI says so where you edit.
 */
export type BomResult = { ok: true; message: string } | { ok: false; error: string };

function num(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

/** Products whose exploded requirements change when `itemId`'s own BOM changes. */
async function rebuildAbove(itemId: string): Promise<string[]> {
  const above = await productsAbove(itemId);
  const self = await prisma.item.findUnique({ where: { id: itemId }, select: { type: true, name: true } });
  const targets = self?.type === "PRODUCT" ? [{ id: itemId, name: self.name }, ...above] : above;
  for (const t of targets) await explodeProduct(t.id);
  return targets.map((t) => t.name);
}

function revalidateBom(parentId: string) {
  revalidatePath(`/products/${parentId}`);
  for (const p of ["/products", "/parts", "/to-order", "/production", "/"]) revalidatePath(p);
}

/** Would adding `childId` under `parentId` create a loop? */
async function wouldCycle(parentId: string, childId: string): Promise<boolean> {
  if (parentId === childId) return true;
  const edges = await prisma.bomLine.findMany({ select: { parentItemId: true, childItemId: true } });
  const childrenOf = new Map<string, string[]>();
  for (const e of edges) {
    const arr = childrenOf.get(e.parentItemId);
    if (arr) arr.push(e.childItemId);
    else childrenOf.set(e.parentItemId, [e.childItemId]);
  }
  // Walk down from the prospective child: reaching the parent means a loop.
  const seen = new Set<string>();
  const queue = [childId];
  while (queue.length) {
    const cur = queue.pop()!;
    if (cur === parentId) return true;
    for (const next of childrenOf.get(cur) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return false;
}

/**
 * Put a part or board onto a product's or board's BOM.
 *
 * If the item number isn't in the catalogue yet and a description came with it, the part is
 * created here and joins the BOM in one step — it then appears in Parts & Inventory like
 * any other, at zero stock until it is received or counted. Without a description the form
 * refuses rather than inventing a nameless part.
 */
export async function addBomLine(_prev: BomResult | null, formData: FormData): Promise<BomResult> {
  try {
    const user = await requireRole("MANAGER");
    const parentItemId = String(formData.get("parentItemId") ?? "");
    const partNumber = String(formData.get("partNumber") ?? "").trim();
    const qtyPer = num(formData.get("qtyPer"));
    const reference = String(formData.get("reference") ?? "").trim() || null;

    if (!partNumber) return { ok: false, error: "Enter an item number." };
    if (qtyPer <= 0) return { ok: false, error: "Quantity must be greater than 0." };

    const parent = await prisma.item.findUnique({ where: { id: parentItemId }, select: { id: true, type: true } });
    if (!parent) return { ok: false, error: "Parent not found." };
    if (parent.type !== "PRODUCT" && parent.type !== "ASSEMBLY")
      return { ok: false, error: "Only a product or board can have a BOM." };

    let child = await prisma.item.findUnique({ where: { partNumber } });
    let created = false;
    if (!child) {
      const name = String(formData.get("name") ?? "").trim();
      if (!name)
        return {
          ok: false,
          error: `"${partNumber}" isn't in the catalogue. Give it a description to create it here.`,
        };
      const res = await createPartRecord({ ...partInputFromForm(formData), partNumber, name }, user.id);
      if (!res.ok) return { ok: false, error: res.error };
      child = await prisma.item.findUniqueOrThrow({ where: { id: res.id } });
      created = true;
    }
    if (!child.active) return { ok: false, error: `${partNumber} is archived — restore it before adding it to a BOM.` };

    const existing = await prisma.bomLine.findUnique({
      where: { parentItemId_childItemId: { parentItemId, childItemId: child.id } },
    });
    if (existing) return { ok: false, error: `${partNumber} is already on this BOM at ×${existing.qtyPer}.` };

    if (await wouldCycle(parentItemId, child.id))
      return { ok: false, error: `That would make the BOM contain itself through ${partNumber}.` };

    await prisma.bomLine.create({ data: { parentItemId, childItemId: child.id, qtyPer, reference } });
    const rebuilt = await rebuildAbove(parentItemId);
    revalidateBom(parentItemId);
    revalidatePath("/count");
    return {
      ok: true,
      message:
        (created ? `Created ${partNumber} and added it ×${qtyPer}.` : `Added ${partNumber} ×${qtyPer}.`) +
        (rebuilt.length ? ` Rebuilt ${rebuilt.join(", ")}.` : "") +
        (created ? " It's in Parts & Inventory at zero stock — receive or count it in." : ""),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not add the line." };
  }
}

/**
 * Drop one line from a product's or board's BOM. The part stays in the catalogue —
 * only this BomLine row is deleted. Cost, stock, and every other product's lines are
 * left as they are. A part shared by several products (MECH-00028, for instance) loses
 * its place on this parent only.
 *
 * `parentItemId` is the product or board the page is editing. The line is deleted only
 * when it actually belongs to that parent, so a request cannot remove a different
 * product's line. Admin only — a manager can add a line, not remove one.
 *
 * Afterwards the exploded-requirement cache (ExplodedBom) for this product, and for
 * products built from this board, is recomputed from the BOM lines that remain. That
 * cache is what a build consumes. It is not a re-import: no spreadsheet is read, and
 * no other BomLine row is written. Re-importing that board's or product's BOM sheet
 * puts the line back if the sheet still lists the part.
 */
export async function removeBomLine(bomLineId: string, parentItemId: string): Promise<BomResult> {
  try {
    await requireRole("ADMIN");
    const id = String(bomLineId ?? "").trim();
    const parentId = String(parentItemId ?? "").trim();

    const line = id
      ? await prisma.bomLine.findUnique({
          where: { id },
          select: {
            id: true,
            parentItemId: true,
            child: { select: { partNumber: true } },
            parent: { select: { name: true } },
          },
        })
      : null;
    const error = bomLineRemovalError(line, id, parentId);
    if (error) return { ok: false, error };
    if (!line) return { ok: false, error: "BOM line not found." };

    // The id is unique. Pairing it with the parent means a mismatched row is a no-op
    // rather than a delete, even if the check above were skipped.
    const deleted = await prisma.bomLine.deleteMany({
      where: { id: line.id, parentItemId: line.parentItemId },
    });
    if (deleted.count !== 1) return { ok: false, error: "BOM line not found." };

    const rebuilt = await rebuildAbove(line.parentItemId);
    revalidateBom(line.parentItemId);
    return {
      ok: true,
      message:
        `Removed ${line.child.partNumber} from ${line.parent.name}.` +
        (rebuilt.length ? ` Build requirements updated for ${rebuilt.join(", ")}.` : ""),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not remove the line." };
  }
}

