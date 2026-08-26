"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function cancel() {
    setLoading(true);
    try {
      const response = await fetch(`/api/orders/${orderId}/cancel`, {
        method: "POST",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        return data?.error ?? "No se pudo cancelar el pedido";
      }
      toast.success("Pedido cancelado. Los lugares quedaron libres.");
      router.refresh();
      return null;
    } catch {
      return "Sin conexión con el servidor";
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-danger"
        onClick={() => setOpen(true)}
        disabled={loading}
      >
        {loading ? "Cancelando..." : "Cancelar pedido"}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="¿Cancelar este pedido?"
        description="Se liberan los lugares que estabas reservando. Si ya transferiste, no lo canceles: subí el comprobante y esperá la revisión."
        confirmLabel="Sí, cancelar"
        cancelLabel="No, volver"
        tone="danger"
        onConfirm={cancel}
      />
    </>
  );
}
