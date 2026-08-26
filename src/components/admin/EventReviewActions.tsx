"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";

type Action = "approve" | "reject";

export function EventReviewActions({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Action | null>(null);
  const [loading, setLoading] = useState<Action | null>(null);

  async function review(action: Action, reason: string) {
    setLoading(action);
    try {
      const response = await fetch(`/api/admin/events/${eventId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reason ? { action, reason } : { action }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) return data?.error ?? "La acción falló";

      toast.success(
        action === "approve"
          ? "Evento aprobado y publicado."
          : "Evento devuelto a borrador.",
      );
      if (data?.emailSent === false) {
        toast.warning("No se pudo avisarle al organizador por correo.");
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

  return (
    <div className="flex flex-nowrap items-center gap-2">
      <Button size="sm" disabled={busy} onClick={() => setDialog("approve")}>
        {loading === "approve" ? "Aprobando..." : "Aprobar"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => setDialog("reject")}
      >
        {loading === "reject" ? "Rechazando..." : "Rechazar"}
      </Button>

      <ConfirmDialog
        open={dialog === "approve"}
        onClose={() => setDialog(null)}
        title="¿Aprobar este evento?"
        description="Va a aparecer en el catálogo público y el organizador va a poder recibir pedidos. Le avisamos por correo."
        confirmLabel="Aprobar y publicar"
        onConfirm={(reason) => review("approve", reason)}
      />
      <ConfirmDialog
        open={dialog === "reject"}
        onClose={() => setDialog(null)}
        title="¿Devolver este evento a borrador?"
        description="El organizador va a poder corregirlo y reenviarlo. Tu motivo le llega por correo, así que sé concreto sobre qué tiene que cambiar."
        confirmLabel="Devolver a borrador"
        tone="danger"
        reason={{
          label: "Motivo",
          placeholder:
            "Ej: la imagen de portada está cortada y el QR de pago no se lee.",
          required: true,
          maxLength: 300,
        }}
        onConfirm={(reason) => review("reject", reason)}
      />
    </div>
  );
}
