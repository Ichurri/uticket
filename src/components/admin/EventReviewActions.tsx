"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function EventReviewActions({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function review(action: "approve" | "reject") {
    const message =
      action === "approve"
        ? "¿Aprobar este evento? Aparecerá en el catálogo público."
        : "¿Rechazar este evento? Volverá a borrador para que el organizador lo corrija.";
    if (!window.confirm(message)) return;

    setError(null);
    setLoading(action);
    const response = await fetch(`/api/admin/events/${eventId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setLoading(null);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "La acción falló");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={loading !== null}
          onClick={() => review("approve")}
        >
          {loading === "approve" ? "Aprobando..." : "Aprobar"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={loading !== null}
          onClick={() => review("reject")}
        >
          {loading === "reject" ? "Rechazando..." : "Rechazar"}
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
