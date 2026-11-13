"use client";

import { useActionState } from "react";
import { addAlternate, removeAlternate, updateAlternate, type PartResult } from "@/lib/part-actions";
import { btnPrimary, input } from "@/components/ui";

export interface AlternateRow {
  id: string;
  mpn: string;
  manufacturer: string | null;
  supplierId: string | null;
  supplierName: string | null;
  note: string | null;
}

/**
 * Substitute part numbers for one part. Sits in the Details section, above Notes.
 * Its forms are separate from the details form so saving a description does not
 * submit an alternate, and the other way around.
 */
export function PartAlternates({
  itemId,
  alternates,
  suppliers,
  canEdit,
}: {
  itemId: string;
  alternates: AlternateRow[];
  suppliers: { id: string; name: string }[];
  canEdit: boolean;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-ink-2">Alternates</div>
      <p className="mb-2 text-xs text-muted">
        Substitute manufacturer part numbers. A BOM import leaves this list alone.
      </p>
      {alternates.length === 0 && !canEdit && <p className="text-sm text-muted">No alternates.</p>}
      <ul className="space-y-3">
        {alternates.map((alt) =>
          canEdit ? (
            <li key={`${alt.id}:${alt.mpn}:${alt.manufacturer ?? ""}:${alt.supplierId ?? ""}:${alt.note ?? ""}`}>
              <AlternateEditor itemId={itemId} alt={alt} suppliers={suppliers} />
            </li>
          ) : (
            <li key={alt.id} className="text-sm">
              <div className="font-medium text-ink">{alt.mpn}</div>
              <div className="text-ink-2">
                {[alt.manufacturer, alt.supplierName].filter(Boolean).join(" · ") || "—"}
              </div>
              {alt.note && <div className="text-xs text-muted">{alt.note}</div>}
            </li>
          ),
        )}
      </ul>
      {canEdit && <AddAlternate itemId={itemId} suppliers={suppliers} hasRows={alternates.length > 0} />}
    </div>
  );
}

function AlternateEditor({
  itemId,
  alt,
  suppliers,
}: {
  itemId: string;
  alt: AlternateRow;
  suppliers: { id: string; name: string }[];
}) {
  const [saved, save, saving] = useActionState<PartResult | null, FormData>(updateAlternate, null);
  const [removed, remove, removing] = useActionState<PartResult | null, FormData>(removeAlternate, null);
  const state = removed ?? saved;

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <form action={save} className="grid gap-2 sm:grid-cols-2">
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="alternateId" value={alt.id} />
        <Field label="Part number">
          <input className={input} name="mpn" defaultValue={alt.mpn} required />
        </Field>
        <Field label="Manufacturer">
          <input className={input} name="manufacturer" defaultValue={alt.manufacturer ?? ""} />
        </Field>
        <Field label="Supplier">
          <SupplierSelect suppliers={suppliers} defaultValue={alt.supplierId ?? ""} />
        </Field>
        <Field label="Note">
          <input className={input} name="note" defaultValue={alt.note ?? ""} />
        </Field>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button className={btnPrimary} disabled={saving || removing}>
            {saving ? "Working…" : "Save alternate"}
          </button>
        </div>
      </form>
      <form
        action={remove}
        onSubmit={(e) => {
          if (!confirm(`Remove alternate ${alt.mpn}?`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="alternateId" value={alt.id} />
        <button className="text-xs text-muted hover:text-critical" disabled={saving || removing}>
          {removing ? "Working…" : "Remove"}
        </button>
      </form>
      {state && state.ok === false && <p className="text-sm text-critical">{state.error}</p>}
      {state && state.ok === true && <p className="text-sm text-good">{state.message ?? "Done."}</p>}
    </div>
  );
}

function AddAlternate({
  itemId,
  suppliers,
  hasRows,
}: {
  itemId: string;
  suppliers: { id: string; name: string }[];
  hasRows: boolean;
}) {
  const [state, action, pending] = useActionState<PartResult | null, FormData>(addAlternate, null);

  return (
    <form action={action} className={`${hasRows ? "mt-3" : ""} grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-2`}>
      <input type="hidden" name="itemId" value={itemId} />
      <Field label="Part number">
        <input className={input} name="mpn" placeholder="0805N101J102CT" required />
      </Field>
      <Field label="Manufacturer">
        <input className={input} name="manufacturer" placeholder="Walsin" />
      </Field>
      <Field label="Supplier">
        <SupplierSelect suppliers={suppliers} defaultValue="" />
      </Field>
      <Field label="Note">
        <input className={input} name="note" placeholder="Where this substitute came from" />
      </Field>
      <div className="sm:col-span-2">
        <button className={btnPrimary} disabled={pending}>
          {pending ? "Working…" : "Add alternate"}
        </button>
      </div>
      {state && state.ok === false && <p className="text-sm text-critical sm:col-span-2">{state.error}</p>}
      {state && state.ok === true && <p className="text-sm text-good sm:col-span-2">{state.message ?? "Done."}</p>}
    </form>
  );
}

function SupplierSelect({
  suppliers,
  defaultValue,
}: {
  suppliers: { id: string; name: string }[];
  defaultValue: string;
}) {
  return (
    <select className={input} name="supplierId" defaultValue={defaultValue}>
      <option value="">—</option>
      {suppliers.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
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
