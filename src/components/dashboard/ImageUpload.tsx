"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Label, FieldError } from "@/components/ui/Input";

export function ImageUpload({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });
    setUploading(false);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "No se pudo subir la imagen");
      return;
    }

    const data = await response.json();
    onChange(data.url);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

      <div className="flex items-center gap-3">
        {value ? (
          <Image
            src={value}
            alt={label}
            width={120}
            height={68}
            className="h-[68px] w-[120px] rounded-md border border-border object-cover"
          />
        ) : (
          <div className="flex h-[68px] w-[120px] items-center justify-center rounded-md border border-dashed border-border text-2xl text-muted-foreground">
            🖼️
          </div>
        )}

        <div className="flex flex-col gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? "Subiendo..." : value ? "Cambiar" : "Subir imagen"}
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-danger"
              onClick={() => onChange(null)}
            >
              Quitar
            </Button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      <FieldError message={error ?? undefined} />
    </div>
  );
}
