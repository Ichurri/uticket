"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function OrderActions({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function run(action: "confirm" | "cancel", confirmMessage: string) {
    if (!window.confirm(confirmMessage)) return;
    setError(null);
    setLoading(action);
    const response = await fetch(`/api/orders/${orderId}/${action}`, {
      method: "POST",
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
          onClick={() =>
            run(
              "confirm",
              "¿Confirmar que recibiste el pago? Se generarán los boletos.",
            )
          }
        >
          {loading === "confirm" ? "Confirmando..." : "Confirmar pago"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={loading !== null}
          onClick={() =>
            run(
              "cancel",
              "¿Rechazar este pedido? Se liberarán los asientos reservados.",
            )
          }
        >
          {loading === "cancel" ? "Rechazando..." : "Rechazar"}
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
