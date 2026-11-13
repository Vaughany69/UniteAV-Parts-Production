import { prisma } from "@/lib/prisma";

/**
 * Resolve a manufacturer part number to the item it belongs to.
 *
 * The part's own MPN wins. Substitutes stored on ItemAlternate are checked only
 * when nothing carries that number as its primary MPN. Comparison ignores case
 * and surrounding whitespace. When several rows share a number, an active item
 * with the lowest item number is the one returned.
 */
export async function findItemByMpn(mpn: string) {
  const key = mpn.trim();
  if (!key) return null;

  const primary = await prisma.item.findFirst({
    where: { mpn: { equals: key, mode: "insensitive" } },
    orderBy: [{ active: "desc" }, { partNumber: "asc" }],
  });
  if (primary) return primary;

  const alternate = await prisma.itemAlternate.findFirst({
    where: { mpn: { equals: key, mode: "insensitive" } },
    orderBy: [{ item: { active: "desc" } }, { item: { partNumber: "asc" } }],
    include: { item: true },
  });
  return alternate?.item ?? null;
}
