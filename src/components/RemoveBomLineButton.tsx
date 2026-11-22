"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { removeBomLine } from "@/lib/bom-actions";
import { btn, btnGhost, Badge } from "@/components/ui";

/**
 * Remove one row from a BOM. Confirms first, naming the part and the product (or board)
 * it comes off. The part stays in the catalogue, other products keep their own lines,
 * and re-importing the sheet puts the line back if it is still listed.
 *
 * Rendered only for admins. The server action checks the role again.
 */
export function RemoveBomLineButton({
  lineId,
  parentItemId,
  parentName,
  parentPartNumber,
  partNumber,
  partName,
  parentKind,
}: {
  lineId: string;
  parentItemId: string;
  parentName: string;
  parentPartNumber: string;
  partNumber: string;
  partName: string;
  /** Whose sheet a re-import would restore this line from. */
  parentKind: "board" | "product";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const sheet = parentKind === "board" ? "this board's BOM sheet" : "this product's BOM sheet";
  const label = `Remove ${partNumber} from ${parentName}`;
  const titleId = `bom-remove-title-${lineId}`;

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || pending) return;
      setOpen(false);
      setError(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, pending]);

  function confirm() {
    setError(null);
    start(async () => {
      const res = await removeBomLine(lineId, parentItemId);
      if (res.ok) {
        setOpen(false);
        setError(null);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="text-xs font-medium text-ink-2 hover:text-critical"
        title={label}
      >
        Remove
      </button>

      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            autoFocus
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 outline-none sm:items-center"
            onClick={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            <div className="w-full max-w-md rounded-xl border bg-surface shadow-lg">
              <header className="border-b px-4 py-3">
                <h2 id={titleId} className="text-sm font-semibold text-ink">
                  Remove {partNumber} from {parentName}?
                </h2>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                  <Badge>{partNumber}</Badge>
                  <span className="truncate">{partName}</span>
                </p>
                <p className="mt-1 flex items-center gap-2 text-xs text-muted">
                  <span>On</span>
                  <Badge>{parentPartNumber}</Badge>
                  <span className="truncate">{parentName}</span>
                </p>
              </header>

              <div className="space-y-2 px-4 py-3 text-sm text-ink-2">
                <p>
                  This deletes only the line that puts {partNumber} on {parentName}. The part stays in the
                  catalogue, with the same cost and stock, and other products that use it keep their own lines.
                </p>
                <p>
                  Re-importing {sheet} will put {partNumber} back on {parentName} if the sheet still lists it.
                </p>
                {error && <p className="text-xs text-critical">{error}</p>}
              </div>

              <footer className="flex justify-end gap-2 border-t px-4 py-3">
                <button type="button" onClick={close} className={btnGhost} disabled={pending}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={pending}
                  className={`${btn} border-transparent bg-critical text-white hover:opacity-90`}
                >
                  {pending ? "Removing…" : "Remove line"}
                </button>
              </footer>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
