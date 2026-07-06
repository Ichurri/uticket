import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { Button, buttonVariants } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { CartButton } from "@/components/layout/CartButton";

export async function Navbar() {
  const session = await auth();
  const user = session?.user;
  const isOrganizer = user?.role === "ORGANIZER" || user?.role === "ADMIN";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-xl font-bold tracking-tight">
            🎟️ Boleta<span className="text-primary">VIP</span>
          </Link>
          <div className="hidden items-center gap-4 text-sm text-muted-foreground sm:flex">
            <Link href="/eventos" className="transition-colors hover:text-foreground">
              Eventos
            </Link>
            {isOrganizer && (
              <Link
                href="/dashboard"
                className="transition-colors hover:text-foreground"
              >
                Mi panel
              </Link>
            )}
            {user?.role === "ADMIN" && (
              <Link
                href="/admin"
                className="transition-colors hover:text-foreground"
              >
                Admin
              </Link>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <CartButton />
          <ThemeToggle />
          {user ? (
            <>
              <span className="hidden max-w-40 truncate text-sm text-muted-foreground md:inline">
                {user.name ?? user.email}
              </span>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <Button type="submit" variant="outline" size="sm">
                  Cerrar sesión
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Iniciar sesión
              </Link>
              <Link
                href="/register"
                className={buttonVariants({ variant: "primary", size: "sm" })}
              >
                Registrarse
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
