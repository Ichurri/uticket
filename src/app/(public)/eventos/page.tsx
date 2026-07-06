import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Eventos",
};

export default function EventsPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-1 flex-col items-center justify-center gap-3 px-4 py-24 text-center">
      <span className="text-5xl">🎭</span>
      <h1 className="text-2xl font-bold">Catálogo de eventos</h1>
      <p className="max-w-md text-muted-foreground">
        Muy pronto vas a poder explorar todos los eventos disponibles aquí. El
        catálogo llega en la Fase 2.
      </p>
    </div>
  );
}
