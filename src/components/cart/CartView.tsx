"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import {
  useCartStore,
  cartTotal,
  cartCount,
  MAX_PER_ZONE,
} from "@/stores/cart-store";
import { useHydrated } from "@/lib/use-hydrated";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  CheckIcon,
  MailIcon,
  PhoneIcon,
  QrCodeIcon,
  ShoppingCartIcon,
} from "@/components/ui/icons";

export function CartView({
  contact,
}: {
  /** The logged-in buyer's account contact info — read-only here, no new
   * fields collected (the model already has these). */
  contact?: { email: string; phone: string | null } | null;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const { eventId, eventTitle, items, setZoneQuantity, removeItem, clear } =
    useCartStore();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const shownItems = hydrated ? items : [];

  async function checkout() {
    if (!eventId) return;
    if (!termsAccepted) {
      setCheckoutError("Debés aceptar los términos de compra para continuar.");
      return;
    }
    setCheckoutError(null);
    setCheckingOut(true);

    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId,
        seatIds: items.filter((item) => item.seatId).map((item) => item.seatId),
        tables: items
          .filter((item) => item.eventTableId)
          .map((item) => ({
            eventTableId: item.eventTableId,
            ...(item.seats ? { seats: item.seats } : {}),
          })),
        // Only GENERAL lines: seat and table items carry an eventZoneId too
        zones: items
          .filter((item) => !item.seatId && !item.eventTableId)
          .map((item) => ({
            eventZoneId: item.eventZoneId,
            quantity: item.quantity,
          })),
      }),
    });

    if (response.status === 401) {
      router.push("/login?callbackUrl=/cart");
      return;
    }
    if (!response.ok) {
      setCheckingOut(false);
      const data = await response.json().catch(() => null);
      setCheckoutError(data?.error ?? "No se pudo crear el pedido");
      return;
    }

    const data = await response.json();
    clear();
    router.push(`/orders/${data.order.id}`);
  }

  if (shownItems.length === 0 || !eventId) {
    return (
      <EmptyState
        icon={<ShoppingCartIcon />}
        title="Tu carrito está vacío"
        description="Explorá los eventos disponibles y elegí tus asientos, mesas o zonas."
        action={
          <Link href="/events" className={buttonVariants({ size: "sm" })}>
            Explorar eventos
          </Link>
        }
        className="flex-1 py-24"
      />
    );
  }

  const total = cartTotal(shownItems);
  const count = cartCount(shownItems);
  const seatItems = shownItems.filter((item) => item.seatId);
  const tableItems = shownItems.filter((item) => item.eventTableId);
  const zoneItems = shownItems.filter(
    (item) => !item.seatId && !item.eventTableId,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Confirmá tu pedido</h1>
          <p className="mt-1 text-muted-foreground">{eventTitle}</p>
        </div>
        <Link
          href={`/events/${eventId}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          ← Volver al evento
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start lg:gap-8">
        <div className="order-2 flex flex-col gap-6 lg:order-1">
          <Card>
            <CardHeader>
              <CardTitle>¿A dónde enviamos tus boletos?</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="flex h-12 items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 text-sm sm:col-span-2">
                <MailIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">
                  {contact?.email ?? "Sin correo registrado"}
                </span>
              </div>
              {contact?.phone && (
                <div className="flex h-12 items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 text-sm sm:col-span-2">
                  <PhoneIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{contact.phone}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Método de pago</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 rounded-xl border-2 border-primary bg-primary-soft p-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card text-primary">
                  <QrCodeIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Transferencia bancaria</p>
                  <p className="text-sm text-muted-foreground">
                    La única forma de pago disponible hoy. Vas a escanear el
                    QR del organizador desde tu banco y subir el comprobante
                    para confirmar tu compra.
                  </p>
                </div>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
              </div>
            </CardContent>
          </Card>

          <label className="flex items-start gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => {
                setTermsAccepted(e.target.checked);
                if (e.target.checked) setCheckoutError(null);
              }}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-[var(--primary)]"
            />
            <span>
              Acepto los{" "}
              <Link
                href="/terms"
                target="_blank"
                className="font-medium text-primary hover:underline"
              >
                términos de compra
              </Link>{" "}
              y entiendo que tengo 15 minutos para completar el pago una vez
              confirme.
            </span>
          </label>

          {checkoutError && (
            <p className="text-sm text-danger">{checkoutError}</p>
          )}
        </div>

        <div className="order-1 lg:order-2 lg:sticky lg:top-20">
          <Card>
            <CardHeader>
              <CardTitle>Tu pedido ({count})</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {seatItems.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(item.unitPrice)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-danger"
                    onClick={() => removeItem(item.key)}
                  >
                    Quitar
                  </Button>
                </div>
              ))}

              {tableItems.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.seats
                        ? `${formatCurrency(item.unitPrice)} × ${item.seats} lugar${item.seats === 1 ? "" : "es"}`
                        : `${formatCurrency(item.unitPrice)} · incluye ${item.admits} entrada${item.admits === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-danger"
                    onClick={() => removeItem(item.key)}
                  >
                    Quitar
                  </Button>
                </div>
              ))}

              {zoneItems.map((item) => (
                <div
                  key={item.key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(item.unitPrice)} por boleto
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-11 w-11 p-0 text-base sm:h-9 sm:w-9"
                      aria-label={`Quitar boleto de ${item.label}`}
                      onClick={() =>
                        setZoneQuantity(
                          { eventId, eventTitle: eventTitle ?? "" },
                          {
                            eventZoneId: item.eventZoneId,
                            label: item.label,
                            unitPrice: item.unitPrice,
                          },
                          item.quantity - 1,
                        )
                      }
                    >
                      −
                    </Button>
                    <span className="w-6 text-center font-semibold tabular-nums">
                      {item.quantity}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-11 w-11 p-0 text-base sm:h-9 sm:w-9"
                      aria-label={`Agregar boleto de ${item.label}`}
                      disabled={item.quantity >= MAX_PER_ZONE}
                      onClick={() =>
                        setZoneQuantity(
                          { eventId, eventTitle: eventTitle ?? "" },
                          {
                            eventZoneId: item.eventZoneId,
                            label: item.label,
                            unitPrice: item.unitPrice,
                          },
                          item.quantity + 1,
                        )
                      }
                    >
                      +
                    </Button>
                    <span className="w-20 text-right font-medium tabular-nums">
                      {formatCurrency(item.unitPrice * item.quantity)}
                    </span>
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between border-t border-border pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-danger"
                  onClick={clear}
                >
                  Vaciar carrito
                </Button>
                <p className="text-lg font-bold tabular-nums">
                  Total: {formatCurrency(total)}
                </p>
              </div>

              <Button
                size="lg"
                variant={termsAccepted ? "primary" : "secondary"}
                className="w-full"
                onClick={checkout}
                disabled={checkingOut}
              >
                {checkingOut
                  ? "Creando pedido..."
                  : `Confirmar pedido — ${formatCurrency(total)}`}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Vas a tener 15 minutos para pagar con QR antes de que el
                pedido expire.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
