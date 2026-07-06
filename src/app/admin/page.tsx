import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "Administración",
};

export default async function AdminPage() {
  const session = await auth();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-bold">Panel de administración</h1>
      <p className="mt-1 text-muted-foreground">
        Sesión de {session?.user?.email} (rol: {session?.user?.role})
      </p>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>🚧 En construcción</CardTitle>
          <CardDescription>
            La gestión de usuarios, aprobación de eventos y métricas globales
            llega en la Fase 5.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
