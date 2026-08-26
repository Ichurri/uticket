"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";

export function DeleteButton({
  url,
  confirmMessage,
  label = "Eliminar",
}: {
  url: string;
  /** Shown as the dialog body — the consequence, not a yes/no question. */
  confirmMessage: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      const response = await fetch(url, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        return data?.error ?? "No se pudo eliminar";
      }
      toast.success("Eliminado.");
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
        {loading ? "Eliminando..." : label}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`¿${label}?`}
        description={confirmMessage}
        confirmLabel={label}
        tone="danger"
        onConfirm={handleDelete}
      />
    </>
  );
}
