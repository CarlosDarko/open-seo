import { Coins } from "lucide-react";
import { Modal } from "@/client/components/Modal";
import { formatEur } from "@/custom/costs/shared";

/**
 * Asks before running an action that costs real money. Shown only when the
 * estimate is above the threshold set in Costes (default 0,50 €).
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
    <Modal maxWidth="max-w-md" onClose={onCancel} labelledBy="cost-confirm-title">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Coins className="size-5 text-primary" />
        </div>
        <div>
          <h3 id="cost-confirm-title" className="text-lg font-semibold">
            {title}
          </h3>
          <p className="mt-1 text-sm text-base-content/70">
            Esta acción consumirá saldo de DataForSEO:{" "}
            <span className="font-semibold text-base-content">
              ≈ {formatEur(estimateEur)}
            </span>
            .
          </p>
          {details ? (
            <p className="mt-2 text-xs text-base-content/60">{details}</p>
          ) : null}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
