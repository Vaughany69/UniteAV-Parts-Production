import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOnOrderSourcesForItem, getPartRow, getSettings } from "@/lib/metrics";
import { currentUser } from "@/lib/rbac";
import { roleAtLeast } from "@/lib/constants";
import { updatePart, receiveStock } from "@/lib/actions";
import { ActionForm } from "@/components/ActionForm";
import { PartAlternates } from "@/components/PartAlternates";
import { PartDetailsForm } from "@/components/PartDetailsForm";
import { Card, StatTile, StatusBadge, Badge, EmptyState, input } from "@/components/ui";
import { BackLink } from "@/components/ListMemory";
import { DeleteItemButton } from "@/components/DeleteItemButton";
import { RenamePartForm } from "@/components/RenamePartForm";
import { PartPlanningFields } from "@/components/PartPlanningFields";
import { fmtNum, fmtCost, fmtDate } from "@/lib/format";
import { supplierLabel } from "@/lib/price-supplier";

export default async function PartDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [p, settings, user, suppliers, onOrderFrom, item, priceHistory] = await Promise.all([
    getPartRow(id),
    getSettings(),
    currentUser(),
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
    getOnOrderSourcesForItem(id),
    prisma.item.findUnique({
      where: { id },
      include: {
        bomChildren: { include: { parent: { select: { id: true, name: true, partNumber: true } } } },
        invTxns: { orderBy: { createdAt: "desc" }, take: 12 },
        alternates: {
          orderBy: { mpn: "asc" },
          include: { supplier: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.priceHistory.findMany({
      where: { itemId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        user: { select: { name: true, email: true } },
        supplier: { select: { name: true } },
      },
    }),
  ]);
  if (!item) notFound();
  const alternates = item.alternates.map((alt) => ({
    id: alt.id,
    mpn: alt.mpn,
    manufacturer: alt.manufacturer,
    supplierId: alt.supplierId,
    supplierName: alt.supplier?.name ?? null,
    note: alt.note,
  }));
  const canEdit = roleAtLeast(user?.role, "MANAGER");
  const canReceive = roleAtLeast(user?.role, "OPERATOR");
  const canDelete = roleAtLeast(user?.role, "ADMIN");
  const canRename = roleAtLeast(user?.role, "ADMIN");

  return (
    <div className="space-y-6">
      <header>
        <BackLink href="/parts" className="text-xs text-muted hover:text-brand">
          ← Parts
        </BackLink>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-xl font-semibold text-ink">{item.partNumber}</h1>
          {p && <StatusBadge status={p.reorder.status} />}
          {!item.active && <Badge className="text-serious">Archived</Badge>}
          {canDelete && (
            <span className="no-print ml-auto">
              <DeleteItemButton
                itemId={item.id}
                label="Delete part"
                currency={settings.currency}
                redirectTo="/parts"
              />
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-ink-2">{item.name}</p>
        {canRename && (
          <RenamePartForm itemId={item.id} partNumber={item.partNumber} name={item.name} />
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.category && <Badge>{item.category}</Badge>}
          {item.value && <Badge>{item.value}</Badge>}
          {item.footprint && <Badge>{item.footprint}</Badge>}
          {item.mpn && <Badge>{item.manufacturer ? `${item.manufacturer} · ` : ""}{item.mpn}</Badge>}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatTile
          label="On hand"
          value={fmtNum(item.onHand)}
          tone={p && p.reorder.status !== "OK" && p.reorder.status !== "ON_ORDER" ? "bad" : "default"}
          hint={p && p.onOrderQty > 0 ? `+${fmtNum(p.onOrderQty)} on order` : undefined}
        />
        <StatTile
          label="Reorder point"
          value={p ? fmtNum(p.reorder.rop, 1) : "—"}
          hint="avg daily use × lead + safety"
          title="Reorder point = avg daily use × lead time + safety stock. Reorder when on-hand drops to this."
        />
        <StatTile
          label="Avg daily use"
          value={p && p.adu > 0 ? fmtNum(p.adu, 2) : "—"}
          hint={`${settings.usageWindowDays}-day avg`}
          title="Average daily use — parts consumed by builds over the usage window ÷ days."
        />
        <StatTile
          label="Suggested order"
          value={p ? fmtNum(p.reorder.suggestedOrderQty) : "—"}
          tone={p && p.reorder.suggestedOrderQty > 0 ? "warn" : "default"}
        />
        <StatTile
          label="On order"
          value={p ? fmtNum(p.onOrderQty) : "—"}
          hint="ordered − received"
          title="Outstanding quantity on sent purchase orders (ordered or partial): quantity ordered minus quantity already received. Drafts, fully received orders, and cancelled orders are not included."
        />
      </div>

      <Card title="On order from">
        {onOrderFrom.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">Nothing on order.</p>
        ) : (
          <ul className="divide-y">
            {onOrderFrom.map((source) => (
              <li key={source.poId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                <span className="font-medium text-ink">{source.supplierName}</span>
                <span className="text-muted">
                  <Link href={`/purchase-orders/${source.poId}`} className="font-medium text-ink hover:text-brand">
                    {source.poNumber}
                  </Link>
                  <span className="tnum"> · {fmtNum(source.qty)} outstanding</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Details" className={canEdit ? "no-print" : ""}>
        {canEdit ? (
          <PartDetailsForm
            key={item.id}
            item={{
              id: item.id,
              name: item.name,
              value: item.value,
              footprint: item.footprint,
              manufacturer: item.manufacturer,
              mpn: item.mpn,
              uom: item.uom,
              notes: item.notes,
            }}
            alternates={alternates}
            suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
          />
        ) : (
          <div className="grid gap-4 p-4">
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Info label="Description" value={item.name} />
              <Info label="Value / comment" value={item.value ?? "—"} />
              <Info label="Footprint" value={item.footprint ?? "—"} />
              <Info label="Manufacturer" value={item.manufacturer ?? "—"} />
              <Info label="Manufacturer part no." value={item.mpn ?? "—"} />
              <Info label="Unit" value={item.uom} />
            </dl>
            <PartAlternates itemId={item.id} alternates={alternates} suppliers={[]} canEdit={false} />
            <div>
              <div className="text-xs font-medium text-ink-2">Notes</div>
              <p className="mt-1 text-sm text-ink">{item.notes ?? "—"}</p>
            </div>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Planning fields */}
        <Card title="Planning">
          {canEdit ? (
            <ActionForm action={updatePart} submitLabel="Save planning" className="space-y-3 p-4">
              <input type="hidden" name="itemId" value={item.id} />
              {/* Keyed so a save remounts the fields on the stored cost and supplier. */}
              <PartPlanningFields
                key={`${item.unitCost ?? ""}:${item.supplierId ?? ""}:${item.leadTimeDays ?? ""}:${item.safetyStock}:${item.minPackQty}`}
                leadTimeDays={item.leadTimeDays}
                safetyStock={item.safetyStock}
                minPackQty={item.minPackQty}
                unitCost={item.unitCost}
                supplierId={item.supplierId}
                suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
              />
            </ActionForm>
          ) : (
            <dl className="grid grid-cols-2 gap-3 p-4 text-sm">
              <Info label="Lead time" value={item.leadTimeDays == null ? "—" : `${item.leadTimeDays} days`} />
              <Info label="Safety stock" value={fmtNum(item.safetyStock)} />
              <Info label="Pack / MOQ" value={fmtNum(item.minPackQty)} />
              <Info label="Unit cost" value={item.unitCost == null ? "—" : fmtCost(item.unitCost, settings.currency)} />
              <Info label="Supplier" value={p?.supplierName ?? "—"} />
            </dl>
          )}
        </Card>

        {/* Stock movement */}
        <Card title="Adjust stock">
          {canReceive ? (
            <ActionForm action={receiveStock} submitLabel="Apply" className="space-y-3 p-4">
              <input type="hidden" name="itemId" value={item.id} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Action">
                  <select className={input} name="mode" defaultValue="RECEIPT">
                    <option value="RECEIPT">Receive (add)</option>
                    <option value="ADJUSTMENT">Adjust (+/−)</option>
                    <option value="COUNT">Set count to…</option>
                  </select>
                </Field>
                <Field label="Quantity">
                  <input className={input} name="qty" type="number" step="any" defaultValue={0} />
                </Field>
              </div>
              <Field label="Note (optional)">
                <input className={input} name="note" placeholder="PO #, count reason…" />
              </Field>
            </ActionForm>
          ) : (
            <EmptyState title="View only" hint="Operator role or higher can adjust stock." />
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Used in ${item.bomChildren.length} product(s)`}>
          {item.bomChildren.length === 0 ? (
            <EmptyState title="Not used on any BOM." />
          ) : (
            <ul className="divide-y">
              {item.bomChildren.map((bl) => (
                <li key={bl.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <Link href={`/products/${bl.parent.id}`} className="text-ink hover:text-brand">
                    {bl.parent.name}
                  </Link>
                  <span className="tnum text-muted">{fmtNum(bl.qtyPer)} / unit</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Price history">
          {priceHistory.length === 0 ? (
            <EmptyState
              title="No price changes recorded yet."
              hint="Prices update here from PO pricing, part edits, and BOM imports."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 text-right font-medium">Price</th>
                    <th className="px-4 py-2 text-right font-medium">Change</th>
                    <th className="px-4 py-2 font-medium">Source</th>
                    <th className="px-4 py-2 font-medium">Supplier</th>
                  </tr>
                </thead>
                <tbody>
                  {priceHistory.map((h) => {
                    const delta = h.previousCost == null ? null : h.unitCost - h.previousCost;
                    const pct =
                      h.previousCost != null && h.previousCost > 0
                        ? ((h.unitCost - h.previousCost) / h.previousCost) * 100
                        : null;
                    return (
                      <tr key={h.id} className="border-b last:border-0">
                        <td className="px-4 py-2 text-xs text-muted">{fmtDate(h.createdAt)}</td>
                        <td className="px-4 py-2 text-right tnum font-medium">
                          {fmtCost(h.unitCost, settings.currency)}
                        </td>
                        <td
                          className={`px-4 py-2 text-right tnum ${
                            delta == null || delta === 0 ? "text-muted" : delta > 0 ? "text-critical" : "text-good"
                          }`}
                        >
                          {delta == null
                            ? "first price"
                            : `${delta > 0 ? "▲" : "▼"} ${fmtCost(Math.abs(delta), settings.currency)}${
                                pct != null ? ` (${pct > 0 ? "+" : ""}${pct.toFixed(0)}%)` : ""
                              }`}
                        </td>
                        <td className="px-4 py-2 text-ink-2">
                          {h.note ?? "—"}
                          {h.user && <span className="text-xs text-muted"> · {h.user.name ?? h.user.email}</span>}
                        </td>
                        <td className="px-4 py-2 text-ink-2">{supplierLabel(h.supplier?.name)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Recent movements">
          {item.invTxns.length === 0 ? (
            <EmptyState title="No inventory movements yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {item.invTxns.map((t) => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="px-4 py-2 text-xs text-muted">{fmtDate(t.createdAt)}</td>
                      <td className="px-4 py-2 text-ink-2">{t.type.replace("_", " ").toLowerCase()}</td>
                      <td className={`px-4 py-2 text-right tnum font-medium ${t.qtyDelta < 0 ? "text-critical" : "text-good"}`}>
                        {t.qtyDelta > 0 ? "+" : ""}
                        {fmtNum(t.qtyDelta)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-2">{label}</span>
      {children}
    </label>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
