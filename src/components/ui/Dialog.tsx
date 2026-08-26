"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button, type ButtonStyleProps } from "@/components/ui/Button";
import { Label, Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

/**
 * Built on the native <dialog>: focus trapping, Esc-to-close, inert
 * background and top-layer stacking come from the platform, so there is no
 * library and nothing to get subtly wrong. Replaces window.confirm/prompt,
 * which were being used for the highest-stakes actions in the product
 * (verifying a payment, rejecting one with a written reason).
 */
export function Dialog({
  open,
  onClose,
  labelledBy,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Backstop for a close the platform performed on its own, so `open` in the
  // parent can't drift out of sync with the element (which would leave the
  // trigger button doing nothing on the next click).
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        // Esc: cancel the platform's own close and route it through React
        // instead, so state is always what decides whether we're open.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // The backdrop is part of the <dialog> box, so a click that lands on
        // the element itself (never on its content) is a click outside.
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[calc(100vw-2rem)] max-w-md rounded-2xl border border-border bg-card p-0 text-card-foreground shadow-card-hover",
        "backdrop:bg-black/60 backdrop:backdrop-blur-[2px]",
        "open:animate-dialog-in motion-reduce:open:animate-none",
        className,
      )}
    >
      {children}
    </dialog>
  );
}

export interface ReasonFieldProps {
  label: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
}

/**
 * Confirmation with an optional written reason. `onConfirm` returns an error
 * message to show inline, or null when it worked — the dialog owns the
 * pending state so no caller has to reimplement it.
 */
interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: NonNullable<ButtonStyleProps["variant"]>;
  reason?: ReasonFieldProps;
  onConfirm: (reason: string) => Promise<string | null>;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const titleId = useId();
  return (
    <Dialog open={props.open} onClose={props.onClose} labelledBy={titleId}>
      {/* Mounted only while open, so a half-typed reason or a stale error
          can never survive into the next opening. */}
      {props.open && <ConfirmDialogBody {...props} titleId={titleId} />}
    </Dialog>
  );
}

function ConfirmDialogBody({
  onClose,
  title,
  titleId,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  tone = "primary",
  reason,
  onConfirm,
}: ConfirmDialogProps & { titleId: string }) {
  const reasonId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const missingReason = Boolean(reason?.required) && value.trim().length === 0;

  async function confirm() {
    if (pending) return;
    if (missingReason) {
      setError("Escribí el motivo para continuar.");
      return;
    }
    setPending(true);
    setError(null);
    const failure = await onConfirm(value.trim());
    if (failure) {
      setPending(false);
      setError(failure);
      return;
    }
    onClose();
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1.5">
        <h2 id={titleId} className="text-lg font-bold leading-snug">
          {title}
        </h2>
        {description && (
          <div className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </div>
        )}
      </div>

      {reason && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={reasonId}>
            {reason.label}
            {reason.required && <span className="text-danger"> *</span>}
          </Label>
          <Textarea
            id={reasonId}
            value={value}
            maxLength={reason.maxLength ?? 300}
            placeholder={reason.placeholder}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError(null);
            }}
            className="min-h-24"
          />
          <span className="self-end text-xs text-muted-foreground tabular-nums">
            {value.length}/{reason.maxLength ?? 300}
          </span>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={onClose}
        >
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={tone}
          size="sm"
          disabled={pending}
          onClick={confirm}
        >
          {pending ? "Procesando..." : confirmLabel}
        </Button>
      </div>
    </div>
  );
}
