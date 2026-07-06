"use client";

import Link from "next/link";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { buttonVariants } from "@/components/ui/Button";

interface MobileMenuUser {
  name: string | null;
  email: string | null;
  role: "BUYER" | "ORGANIZER" | "ADMIN";
}

export function MobileMenu({ user }: { user: MobileMenuUser | null }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const linkClass =
    "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
  const isOrganizer = user?.role === "ORGANIZER" || user?.role === "ADMIN";

  return (
    <div className="sm:hidden">
      <button
        type="button"
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        aria-expanded={open}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted"
        onClick={() => setOpen((current) => !current)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="h-4 w-4"
        >
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" />
          ) : (
            <path d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {open && (
        <div className="absolute inset-x-0 top-16 z-50 border-b border-border bg-background shadow-lg">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4">
            <Link href="/eventos" className={linkClass} onClick={close}>
              Eventos
            </Link>
            {user && (
              <Link href="/pedidos" className={linkClass} onClick={close}>
                Mis pedidos
              </Link>
            )}
            {isOrganizer && (
              <Link href="/dashboard" className={linkClass} onClick={close}>
                Mi panel
              </Link>
            )}
            {user?.role === "ADMIN" && (
              <Link href="/admin" className={linkClass} onClick={close}>
                Admin
              </Link>
            )}

            <div className="my-2 h-px bg-border" />

            {user ? (
              <div className="flex items-center justify-between gap-2 px-3">
                <span className="truncate text-sm text-muted-foreground">
                  {user.name ?? user.email}
                </span>
                <button
                  type="button"
                  className="text-sm font-medium text-danger"
                  onClick={() => signOut({ callbackUrl: "/" })}
                >
                  Cerrar sesión
                </button>
              </div>
            ) : (
              <div className="flex gap-2 px-3">
                <Link
                  href="/login"
                  className={buttonVariants({
                    variant: "outline",
                    size: "sm",
                    className: "flex-1",
                  })}
                  onClick={close}
                >
                  Iniciar sesión
                </Link>
                <Link
                  href="/register"
                  className={buttonVariants({ size: "sm", className: "flex-1" })}
                  onClick={close}
                >
                  Registrarse
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
