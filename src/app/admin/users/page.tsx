import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { UserSuspendButton } from "@/components/admin/UserSuspendButton";
import type { Role } from "@/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Gestión de usuarios",
};

const roleFilters: { value: Role | ""; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "BUYER", label: "Compradores" },
  { value: "ORGANIZER", label: "Organizadores" },
  { value: "ADMIN", label: "Admins" },
];

const roleLabels: Record<Role, { label: string; variant: "default" | "primary" | "warning" }> = {
  BUYER: { label: "Comprador", variant: "default" },
  ORGANIZER: { label: "Organizador", variant: "primary" },
  ADMIN: { label: "Admin", variant: "warning" },
};

const dateFormatter = new Intl.DateTimeFormat("es-BO", { dateStyle: "medium" });

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ rol?: string }>;
}) {
  const session = await auth();
  const { rol } = await searchParams;
  const roleFilter = ["BUYER", "ORGANIZER", "ADMIN"].includes(rol ?? "")
    ? (rol as Role)
    : undefined;

  const users = await prisma.user.findMany({
    where: roleFilter ? { role: roleFilter } : undefined,
    include: {
      _count: { select: { events: true, orders: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Usuarios ({users.length})</h1>
        <p className="mt-1 text-muted-foreground">
          Gestioná las cuentas de la plataforma.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {roleFilters.map((filter) => {
          const active = (roleFilter ?? "") === filter.value;
          return (
            <Link
              key={filter.label}
              href={filter.value ? `/admin/users?rol=${filter.value}` : "/admin/users"}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                active
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        {users.map((user) => {
          const roleInfo = roleLabels[user.role];
          return (
            <Card key={user.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{user.name ?? "Sin nombre"}</p>
                    <Badge variant={roleInfo.variant}>{roleInfo.label}</Badge>
                    {user.suspended && (
                      <Badge variant="danger">Suspendido</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {user.email} · registrado{" "}
                    {dateFormatter.format(user.createdAt)}
                    {user.role === "ORGANIZER" &&
                      ` · ${user._count.events} evento${user._count.events === 1 ? "" : "s"}`}
                    {user.role === "BUYER" &&
                      ` · ${user._count.orders} pedido${user._count.orders === 1 ? "" : "s"}`}
                  </p>
                </div>
                {user.role !== "ADMIN" && user.id !== session!.user.id && (
                  <UserSuspendButton
                    userId={user.id}
                    suspended={user.suspended}
                  />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
