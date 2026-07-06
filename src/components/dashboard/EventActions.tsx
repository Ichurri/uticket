"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { EventStatus } from "@/generated/prisma/enums";

export function EventActions({
  eventId,
  status,
}: {
  eventId: string;
  status: EventStatus;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function run(
    action: string,
    request: () => Promise<Response>,
    confirmMessage?: string,
  ) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setError(null);
    setLoading(action);
    const response = await request();
    setLoading(null);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "La acción falló");
      return;
    }
    router.refresh();
  }

  const submitForReview = () =>
    run("submit", () =>
      fetch(`/api/events/${eventId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit" }),
      }),
    );

  const cancelEvent = () =>
    run(
      "cancel",
      () =>
        fetch(`/api/events/${eventId}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cancel" }),
        }),
      "¿Cancelar este evento? Los compradores dejarán de verlo.",
    );

  const deleteEvent = () =>
    run(
      "delete",
      () => fetch(`/api/events/${eventId}`, { method: "DELETE" }),
      "¿Eliminar este evento? Esta acción no se puede deshacer.",
    );

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {status === "DRAFT" && (
          <Button
            size="sm"
            onClick={submitForReview}
            disabled={loading !== null}
          >
            {loading === "submit" ? "Enviando..." : "Enviar a revisión"}
          </Button>
        )}
        {(status === "PENDING" || status === "APPROVED") && (
          <Button
            variant="outline"
            size="sm"
            onClick={cancelEvent}
            disabled={loading !== null}
          >
            {loading === "cancel" ? "Cancelando..." : "Cancelar evento"}
          </Button>
        )}
        {status !== "APPROVED" && (
          <Button
            variant="ghost"
            size="sm"
            className="text-danger"
            onClick={deleteEvent}
            disabled={loading !== null}
          >
            {loading === "delete" ? "Eliminando..." : "Eliminar"}
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
