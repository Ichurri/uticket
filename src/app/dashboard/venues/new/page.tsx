import type { Metadata } from "next";
import { VenueForm } from "@/components/dashboard/VenueForm";

export const metadata: Metadata = {
  title: "Nuevo venue",
};

export default function NewVenuePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Nuevo venue</h1>
        <p className="mt-1 text-muted-foreground">
          Definí el lugar y sus zonas. Las zonas con asientos numerados generan
          una grilla de filas y asientos automáticamente.
        </p>
      </div>
      <VenueForm />
    </div>
  );
}
