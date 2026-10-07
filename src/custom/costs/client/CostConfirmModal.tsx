import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { formatEur } from "@/custom/costs/shared";

/**
 * Asks before running an action that costs real money. Shown only when the
 * estimate is above the threshold set in Costes (default 0,50 €). Reuses the
 * project's own ConfirmDialog, so it looks like every other confirmation.
 */
export function CostConfirmModal({
  title,
  estimateEur,
  details,
  confirmLabel = "Continuar",
  onConfirm,
  onCancel,
}: {
  title: string;
  estimateEur: number;
  details?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      title={title}
      confirmLabel={confirmLabel}
      onConfirm={onConfirm}
      onClose={onCancel}
    >
      Esta acción consumirá saldo de DataForSEO:{" "}
      <span className="font-semibold text-foreground">
        ≈ {formatEur(estimateEur)}
      </span>
      .{details ? <> {details}</> : null}
    </ConfirmDialog>
  );
}
