"use client";

import { useState, type ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/Input";
import { EyeIcon, EyeOffIcon, LockIcon } from "@/components/ui/icons";

/* Password field with a lock icon and a show/hide toggle (spec #9b). */
export function PasswordInput({
  className,
  defaultVisible = false,
  ...props
}: Omit<ComponentProps<"input">, "type" | "leftIcon"> & {
  /** Registration starts visible, to cut down on mistyped passwords
   * (spec #9d) — everywhere else it starts hidden. */
  defaultVisible?: boolean;
}) {
  const [visible, setVisible] = useState(defaultVisible);

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        leftIcon={<LockIcon />}
        className={cn("pr-11", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
      >
        {visible ? (
          <EyeOffIcon className="h-4 w-4" />
        ) : (
          <EyeIcon className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
