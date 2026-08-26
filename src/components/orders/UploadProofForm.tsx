"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { UploadIcon } from "@/components/ui/icons";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { toast } from "@/components/ui/Toast";

type Status = "idle" | "attached" | "uploading" | "error";

export function UploadProofForm({
  orderId,
  replacing = false,
}: {
  orderId: string;
  replacing?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function pickFile(next: File | null) {
    if (next && next.size > MAX_UPLOAD_BYTES) {
      const message = "La imagen no puede superar los 5 MB";
      setError(message);
      // The inline error can land below the fold on a phone; the toast is
      // what actually tells the buyer why nothing happened.
      toast.error(message);
      setFile(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setStatus("idle");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setError(null);
    setFile(next);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return next ? URL.createObjectURL(next) : null;
    });
    setStatus(next ? "attached" : "idle");
  }

  function clearFile() {
    pickFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function upload() {
    if (!file) return;
    setError(null);
    setStatus("uploading");
    setProgress(0);

    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        clearFile();
        router.refresh();
        return;
      }
      setStatus("error");
      try {
        const data = JSON.parse(xhr.responseText);
        setError(data?.error ?? "No se pudo subir el comprobante");
      } catch {
        setError("No se pudo subir el comprobante");
      }
    };
    xhr.onerror = () => {
      setStatus("error");
      setError("No se pudo subir el comprobante");
    };
    xhr.open("POST", `/api/orders/${orderId}/proof`);
    xhr.send(formData);
  }

  const uploading = status === "uploading";

  return (
    <div className="flex w-full flex-col gap-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          if (!uploading) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (uploading) return;
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) pickFile(dropped);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
          dragOver
            ? "border-primary bg-primary-soft"
            : "border-primary/45 bg-primary/[0.06]",
          uploading && "pointer-events-none opacity-70",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          disabled={uploading}
          className="sr-only"
        />
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob: preview, next/image can't optimize it
          <img
            src={previewUrl}
            alt="Vista previa del comprobante"
            className="h-24 w-24 rounded-lg border border-border object-cover"
          />
        ) : (
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-primary">
            <UploadIcon className="h-5 w-5" />
          </span>
        )}
        <span className="text-sm font-medium">
          {file ? file.name : "Arrastrá tu comprobante o hacé clic para elegirlo"}
        </span>
        <span className="text-xs text-muted-foreground">
          JPG, PNG o WEBP · hasta 5 MB
        </span>
      </label>

      {uploading && (
        <div
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="flex gap-2">
        {file && !uploading && (
          <Button type="button" variant="ghost" size="md" onClick={clearFile}>
            Quitar
          </Button>
        )}
        <Button
          type="button"
          onClick={upload}
          disabled={!file || uploading}
          className="flex-1"
        >
          {uploading
            ? `Subiendo… ${progress}%`
            : replacing
              ? "Reemplazar comprobante"
              : "Subir comprobante de pago"}
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
