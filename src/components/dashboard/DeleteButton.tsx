"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function DeleteButton({
  url,
  confirmMessage,
  label = "Eliminar",
}: {
  url: string;
  confirmMessage: string;
  label?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!window.confirm(confirmMessage)) return;
    setError(null);
    setLoading(true);
    const response = await fetch(url, { method: "DELETE" });
    setLoading(false);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "No se pudo eliminar");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-danger"
        onClick={handleDelete}
        disabled={loading}
      >
        {loading ? "Eliminando..." : label}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
