import Link from "next/link";
import { buttonVariants } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";

const features = [
  {
    icon: "🎭",
    title: "Eventos únicos",
    description:
      "Shows de comedia, conciertos y experiencias en vivo, todo en un solo lugar.",
  },
  {
    icon: "📱",
    title: "Pago con QR",
    description:
      "Paga con una transferencia QR desde tu banco y confirma tu compra sin complicaciones.",
  },
  {
    icon: "🎟️",
    title: "Boleto digital",
    description:
      "Recibe tu entrada con código QR único, lista para mostrar desde tu celular.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/15 via-transparent to-transparent" />
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-24 text-center sm:py-32">
          <span className="rounded-full border border-border bg-card px-4 py-1 text-sm text-muted-foreground">
            🇧🇴 La boletería digital de Bolivia
          </span>
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
            Los mejores eventos, a un{" "}
            <span className="text-primary">QR</span> de distancia
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Descubre shows de comedia y eventos en vivo, elige tu asiento y
            recibe tu boleto digital al instante.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/eventos" className={buttonVariants({ size: "lg" })}>
              Explorar eventos
            </Link>
            <Link
              href="/register"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              Quiero organizar un evento
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-24">
        <div className="grid gap-4 sm:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title}>
              <CardContent className="flex flex-col gap-2 p-6">
                <span className="text-3xl">{feature.icon}</span>
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}
