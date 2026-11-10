"use client";

import { useState } from "react";
import { input } from "@/components/ui";
import { manualFormRecordsHistory } from "@/lib/price-supplier";

/**
 * Planning fields for one part. The supplier select is required only when the unit cost
 * is actually changing — that change is a new price-history row, and the row has to name
 * a supplier. Saving lead time or pack qty on an unassigned part stays as it was.
 */
export function PartPlanningFields({
  leadTimeDays,
  safetyStock,
  minPackQty,
  unitCost,
  supplierId,
  suppliers,
}: {
  leadTimeDays: number | null;
  safetyStock: number;
  minPackQty: number;
  unitCost: number | null;
  supplierId: string | null;
  suppliers: { id: string; name: string }[];
}) {
  const [cost, setCost] = useState(unitCost == null ? "" : String(unitCost));
  const recordsPrice = manualFormRecordsHistory(unitCost, cost);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Lead time (days)">
          <input className={input} name="leadTimeDays" type="number" min="0" defaultValue={leadTimeDays ?? ""} />
        </Field>
        <Field label="Safety stock">
          <input className={input} name="safetyStock" type="number" min="0" step="any" defaultValue={safetyStock} />
        </Field>
        <Field label="Pack / MOQ">
          <input className={input} name="minPackQty" type="number" min="1" step="any" defaultValue={minPackQty} />
        </Field>
        <Field label="Unit cost">
          <input
            className={input}
            name="unitCost"
            type="number"
            min="0"
            step="any"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Supplier">
        <select className={input} name="supplierId" defaultValue={supplierId ?? ""} required={recordsPrice}>
          <option value="">{recordsPrice ? "— Choose a supplier —" : "— Unassigned —"}</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      {recordsPrice && (
        <p className="text-xs text-muted">
          A supplier is required when the unit cost changes. It is stored next to the source on price history.
        </p>
      )}
    </>
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
