"use client";

import { useActionState } from "react";
import { updatePartDetails, type PartResult } from "@/lib/part-actions";
import { btnPrimary, input } from "@/components/ui";
import { PartAlternates, type AlternateRow } from "@/components/PartAlternates";

/**
 * The part's own details. Alternates are a sibling, not fields of this form:
 * a `display: contents` form let the browser treat both sets of `manufacturer`
 * and `mpn` inputs as one group and paint the substitute into these boxes.
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
  const formId = `part-details-${item.id}`;

  return (
    <div className="space-y-3 p-4">
      <form id={formId} action={formAction} autoComplete="off" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <input type="hidden" name="itemId" value={item.id} />
        <Field label="Description">
          <input
            key={`${item.id}:name:${item.name}`}
            className={input}
            name="name"
            defaultValue={item.name}
            autoComplete="off"
            required
          />
        </Field>
        <Field label="Value / comment">
          <input key={`${item.id}:value`} className={input} name="value" defaultValue={item.value ?? ""} autoComplete="off" />
        </Field>
        <Field label="Footprint">
          <input
            key={`${item.id}:footprint`}
            className={input}
            name="footprint"
            defaultValue={item.footprint ?? ""}
            autoComplete="off"
          />
        </Field>
        <Field label="Manufacturer">
          <input
            key={`${item.id}:manufacturer:${item.manufacturer ?? ""}`}
            id={`${formId}-manufacturer`}
            className={input}
            name="manufacturer"
            defaultValue={item.manufacturer ?? ""}
            autoComplete="off"
          />
        </Field>
        <Field label="Manufacturer part no.">
          <input
            key={`${item.id}:mpn:${item.mpn ?? ""}`}
            id={`${formId}-mpn`}
            className={input}
            name="mpn"
            defaultValue={item.mpn ?? ""}
            autoComplete="off"
          />
        </Field>
        <Field label="Unit">
          <input key={`${item.id}:uom`} className={input} name="uom" defaultValue={item.uom} autoComplete="off" />
        </Field>
      </form>

      <PartAlternates itemId={item.id} alternates={alternates} suppliers={suppliers} canEdit />

      <div className="space-y-3">
        <Field label="Notes">
          <input
            key={`${item.id}:notes`}
            className={input}
            name="notes"
            form={formId}
            defaultValue={item.notes ?? ""}
            autoComplete="off"
          />
        </Field>
        <p className="text-xs text-muted">
          Description, value, footprint, manufacturer and MPN come from the BOM sheets and are refreshed whenever a BOM
          carrying this part is imported. Unit, notes and alternates are app-only and always stay.
        </p>
        {state && state.ok === false && <p className="text-sm text-critical">{state.error}</p>}
        {state && state.ok === true && <p className="text-sm text-good">{state.message ?? "Done."}</p>}
        <button form={formId} className={btnPrimary} disabled={pending}>
          {pending ? "Working…" : "Save details"}
        </button>
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
