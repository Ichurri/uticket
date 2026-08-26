"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";
import type { EventStatus } from "@/generated/prisma/enums";

type Action = "submit" | "cancel" | "delete";

export function EventActions({
  eventId,
  status,
}: {
  eventId: string;
  status: EventStatus;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Exclude<Action, "submit"> | null>(null);
  const [loading, setLoading] = useState<Action | null>(null);

  async function run(action: Action, request: () => Promise<Response>) {
    setLoading(action);
    try {
      const response = await request();
      const data = await response.json().catch(() => null);
      if (!response.ok) return data?.error ?? "La acción falló";

      if (action === "submit") {
        toast.success("Evento enviado a revisión. Te avisamos por correo.");
      } else if (action === "cancel") {
        toast.success(
          data?.notified
            ? `Evento cancelado. Avisamos a ${data.notified} comprador${data.notified === 1 ? "" : "es"}.`
            : "Evento cancelado.",
        );
        if (data?.emailsFailed > 0) {
          toast.warning(
            `${data.emailsFailed} correo${data.emailsFailed === 1 ? "" : "s"} de aviso no se pudo enviar. Contactá a esos compradores.`,
          );
        }
      } else {
        toast.success("Evento eliminado.");
      }
      router.refresh();
      return null;
    } catch {
      return "Sin conexión con el servidor";
    } finally {
      setLoading(null);
    }
  }

  const statusRequest = (action: "submit" | "cancel") => () =>
    fetch(`/api/events/${eventId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

  async function submitForReview() {
    const error = await run("submit", statusRequest("submit"));
    if (error) toast.error(error);
  }

  const busy = loading !== null;

  return (
    <div className="flex flex-nowrap items-center justify-end gap-2">
      {status === "DRAFT" && (
        <Button size="sm" onClick={submitForReview} disabled={busy}>
          {loading === "submit" ? "Enviando..." : "Enviar a revisión"}
        </Button>
      )}
      {(status === "PENDING" || status === "APPROVED") && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDialog("cancel")}
          disabled={busy}
        >
          {loading === "cancel" ? "Cancelando..." : "Cancelar evento"}
        </Button>
      )}
      {status !== "APPROVED" && (
        <Button
          variant="ghost"
          size="sm"
          className="text-danger"
          onClick={() => setDialog("delete")}
          disabled={busy}
        >
          {loading === "delete" ? "Eliminando..." : "Eliminar"}
        </Button>
      )}

      <ConfirmDialog
        open={dialog === "cancel"}
        onClose={() => setDialog(null)}
        title="¿Cancelar este evento?"
        description={
          <>
            Esto no se puede deshacer:
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
              <li>Se cancelan los pedidos que todavía no pagaste ni revisaste.</li>
              <li>Los boletos ya emitidos dejan de servir en la puerta.</li>
              <li>Se le avisa por correo a cada comprador.</li>
              <li>
                Los pagos ya recibidos los tenés que devolver vos, por
                transferencia.
              </li>
            </ul>
          </>
        }
        confirmLabel="Sí, cancelar el evento"
        cancelLabel="No, volver"
        tone="danger"
        onConfirm={() => run("cancel", statusRequest("cancel"))}
      />

      <ConfirmDialog
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        title="¿Eliminar este evento?"
        description="Se borra del panel y no se puede recuperar."
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={() =>
          run("delete", () =>
            fetch(`/api/events/${eventId}`, { method: "DELETE" }),
          )
        }
      />
    </div>
  );
}
