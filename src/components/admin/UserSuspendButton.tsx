"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function UserSuspendButton({
  userId,
  suspended,
}: {
  userId: string;
  suspended: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const message = suspended
      ? "¿Reactivar esta cuenta? El usuario podrá volver a iniciar sesión."
      : "¿Suspender esta cuenta? El usuario no podrá iniciar sesión ni operar.";
    if (!window.confirm(message)) return;

    setError(null);
    setLoading(true);
    const response = await fetch(`/api/admin/users/${userId}/suspend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suspended: !suspended }),
    });
    setLoading(false);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "La acción falló");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant={suspended ? "outline" : "ghost"}
        size="sm"
        className={suspended ? undefined : "text-danger"}
        onClick={toggle}
        disabled={loading}
      >
        {loading ? "Guardando..." : suspended ? "Reactivar" : "Suspender"}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
