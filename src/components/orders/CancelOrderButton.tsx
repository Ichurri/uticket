"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function cancel() {
    if (!window.confirm("¿Cancelar este pedido? Se liberarán los asientos.")) {
      return;
    }
    setError(null);
    setLoading(true);
    const response = await fetch(`/api/orders/${orderId}/cancel`, {
      method: "POST",
    });
    setLoading(false);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "No se pudo cancelar el pedido");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-danger"
        onClick={cancel}
        disabled={loading}
      >
        {loading ? "Cancelando..." : "Cancelar pedido"}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
