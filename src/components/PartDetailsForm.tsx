"use client";

import { useActionState } from "react";
import { updatePartDetails, type PartResult } from "@/lib/part-actions";
import { btnPrimary, input } from "@/components/ui";
import { PartAlternates, type AlternateRow } from "@/components/PartAlternates";

/**
 * The Details editor. Alternates sit above Notes, in their own forms, so the two
 * saves never share a submit. `display: contents` lets that block land between
 * the descriptive fields and Notes without nesting a form inside this one.
 */
export function PartDetailsForm({
  item,
  alternates,
  suppliers,
}: {
  item: {
    id: string;
    name: string;
    value: string | null;
    footprint: string | null;
    manufacturer: string | null;
    mpn: string | null;
    uom: string;
    notes: string | null;
  };
  alternates: AlternateRow[];
  suppliers: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<PartResult | null, FormData>(updatePartDetails, null);

  return (
    <div className="grid gap-3 p-4">
      <form action={formAction} className="contents">
        <div className="order-1 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input type="hidden" name="itemId" value={item.id} className="hidden" />
          <Field label="Description">
            {/* Keyed so an admin description edit (which refreshes this page) lands in
                the field rather than leaving the text this input mounted with. */}
            <input key={item.name} className={input} name="name" defaultValue={item.name} required />
          </Field>
          <Field label="Value / comment">
            <input className={input} name="value" defaultValue={item.value ?? ""} />
          </Field>
          <Field label="Footprint">
            <input className={input} name="footprint" defaultValue={item.footprint ?? ""} />
          </Field>
          <Field label="Manufacturer">
            <input className={input} name="manufacturer" defaultValue={item.manufacturer ?? ""} />
          </Field>
          <Field label="Manufacturer part no.">
            <input className={input} name="mpn" defaultValue={item.mpn ?? ""} />
          </Field>
          <Field label="Unit">
            <input className={input} name="uom" defaultValue={item.uom} />
          </Field>
        </div>
        <div className="order-3 space-y-3">
          <Field label="Notes">
            <input className={input} name="notes" defaultValue={item.notes ?? ""} />
          </Field>
          <p className="text-xs text-muted">
            Description, value, footprint, manufacturer and MPN come from the BOM sheets and are refreshed whenever a
            BOM carrying this part is imported. Unit, notes and alternates are app-only and always stay.
          </p>
          {state && state.ok === false && <p className="text-sm text-critical">{state.error}</p>}
          {state && state.ok === true && <p className="text-sm text-good">{state.message ?? "Done."}</p>}
          <button className={btnPrimary} disabled={pending}>
            {pending ? "Working…" : "Save details"}
          </button>
        </div>
      </form>
      <div className="order-2">
        <PartAlternates itemId={item.id} alternates={alternates} suppliers={suppliers} canEdit />
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
