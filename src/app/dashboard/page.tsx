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
  title: "Mi panel",
};

export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-bold">
        Hola, {session?.user?.name ?? "organizador"} 👋
      </h1>
      <p className="mt-1 text-muted-foreground">
        Este es tu panel de organizador.
      </p>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>🚧 En construcción</CardTitle>
          <CardDescription>
            La gestión de eventos y venues llega en la Fase 2: crear eventos,
            configurar zonas y asientos, y ver tus ventas.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
