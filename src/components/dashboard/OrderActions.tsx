"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";
import { CheckIcon, XIcon } from "@/components/ui/icons";

type Action = "confirm" | "cancel";

export function OrderActions({
  orderId,
  hasProof = false,
  compact = false,
}: {
  orderId: string;
  hasProof?: boolean;
  /** Icon-only 44px buttons for dense rows (dashboard home review queue). */
  compact?: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Action | null>(null);
  const [loading, setLoading] = useState<Action | null>(null);

  /** Returns an error message for the dialog, or null on success. */
  async function run(action: Action, body?: { reason?: string }) {
    setLoading(action);
    try {
      const response = await fetch(`/api/orders/${orderId}/${action}`, {
        method: "POST",
        ...(body
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) return data?.error ?? "La acción falló";

      if (action === "confirm") {
        toast.success(
          `Pago confirmado — se emitieron ${data?.tickets ?? "los"} boleto${data?.tickets === 1 ? "" : "s"}.`,
        );
      } else {
        toast.success("Comprobante rechazado y lugares liberados.");
      }
      // An unsent email is the organizer's problem to solve by other means,
      // so it can't be a silent detail.
      if (data?.emailSent === false) {
        toast.warning(
          "El correo al comprador falló — avisale por WhatsApp o teléfono.",
        );
      }
      router.refresh();
      return null;
    } catch {
      return "Sin conexión con el servidor";
    } finally {
      setLoading(null);
    }
  }

  const busy = loading !== null;

  const dialogs = (
    <>
      <ConfirmDialog
        open={dialog === "confirm"}
        onClose={() => setDialog(null)}
        title={hasProof ? "¿Verificar el comprobante?" : "¿Confirmar el pago?"}
        description={
          hasProof
            ? "Confirmá solo si viste la transferencia acreditada en tu cuenta. Se emiten los boletos y se le avisa al comprador por correo."
            : "Se emiten los boletos y se le avisa al comprador por correo."
        }
        confirmLabel={hasProof ? "Verificar pago" : "Confirmar pago"}
        onConfirm={() => run("confirm")}
      />
      <ConfirmDialog
        open={dialog === "cancel"}
        onClose={() => setDialog(null)}
        title="¿Rechazar este comprobante?"
        description="El pedido se cancela, los lugares se liberan y el comprador recibe tu motivo por correo."
        confirmLabel="Rechazar comprobante"
        tone="danger"
        reason={{
          label: "Motivo del rechazo",
          placeholder:
            "Ej: el monto transferido no coincide con el total del pedido.",
          required: true,
          maxLength: 300,
        }}
        onConfirm={(reason) => run("cancel", { reason })}
      />
    </>
  );

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Button
          size="md"
          className="w-11 px-0"
          disabled={busy}
          onClick={() => setDialog("confirm")}
          aria-label={hasProof ? "Verificar pago" : "Confirmar pago"}
          title={hasProof ? "Verificar pago" : "Confirmar pago"}
        >
          {loading === "confirm" ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <CheckIcon className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="outline"
          size="md"
          className="w-11 px-0"
          disabled={busy}
          onClick={() => setDialog("cancel")}
          aria-label="Rechazar"
          title="Rechazar"
        >
          {loading === "cancel" ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <XIcon className="h-4 w-4" />
          )}
        </Button>
        {dialogs}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button size="sm" disabled={busy} onClick={() => setDialog("confirm")}>
        {loading === "confirm"
          ? "Confirmando..."
          : hasProof
            ? "Verificar pago"
            : "Confirmar pago"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => setDialog("cancel")}
      >
        {loading === "cancel" ? "Rechazando..." : "Rechazar"}
      </Button>
      {dialogs}
    </div>
  );
}
