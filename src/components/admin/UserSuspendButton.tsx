"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";

export function UserSuspendButton({
  userId,
  suspended,
}: {
  userId: string;
  suspended: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}/suspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspended: !suspended }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        return data?.error ?? "La acción falló";
      }
      toast.success(suspended ? "Cuenta reactivada." : "Cuenta suspendida.");
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
        variant={suspended ? "outline" : "ghost"}
        size="sm"
        className={suspended ? undefined : "text-danger"}
        onClick={() => setOpen(true)}
        disabled={loading}
      >
        {loading ? "Guardando..." : suspended ? "Reactivar" : "Suspender"}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={suspended ? "¿Reactivar esta cuenta?" : "¿Suspender esta cuenta?"}
        description={
          suspended
            ? "El usuario va a poder volver a iniciar sesión y operar normalmente."
            : "El usuario no va a poder iniciar sesión ni operar. Sus eventos y pedidos quedan como están."
        }
        confirmLabel={suspended ? "Reactivar" : "Suspender"}
        tone={suspended ? "primary" : "danger"}
        onConfirm={toggle}
      />
    </>
  );
}
