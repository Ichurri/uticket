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

export function CartView() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { eventId, eventTitle, items, setZoneQuantity, removeItem, clear } =
    useCartStore();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  const shownItems = hydrated ? items : [];

  async function checkout() {
    if (!eventId) return;
    setCheckoutError(null);
    setCheckingOut(true);

    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId,
        seatIds: items.filter((item) => item.seatId).map((item) => item.seatId),
        zones: items
          .filter((item) => !item.seatId)
          .map((item) => ({ zoneId: item.zoneId, quantity: item.quantity })),
      }),
    });

    if (response.status === 401) {
      router.push("/login?callbackUrl=/carrito");
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
    router.push(`/pedidos/${data.order.id}`);
  }

  if (shownItems.length === 0 || !eventId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
        <span className="text-5xl">🛒</span>
        <p className="font-medium">Tu carrito está vacío</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Explorá los eventos disponibles y elegí tus asientos o zonas.
        </p>
        <Link href="/eventos" className={buttonVariants({ size: "sm" })}>
          Explorar eventos
        </Link>
      </div>
    );
  }

  const total = cartTotal(shownItems);
  const count = cartCount(shownItems);
  const seatItems = shownItems.filter((item) => item.seatId);
  const zoneItems = shownItems.filter((item) => !item.seatId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Resumen del pedido</h1>
          <p className="mt-1 text-muted-foreground">{eventTitle}</p>
        </div>
        <Link
          href={`/eventos/${eventId}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          ← Seguir eligiendo
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Boletos ({count})</CardTitle>
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
                  className="h-8 w-8 p-0 text-base"
                  aria-label={`Quitar boleto de ${item.label}`}
                  onClick={() =>
                    setZoneQuantity(
                      { eventId, eventTitle: eventTitle ?? "" },
                      {
                        zoneId: item.zoneId,
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
                  className="h-8 w-8 p-0 text-base"
                  aria-label={`Agregar boleto de ${item.label}`}
                  disabled={item.quantity >= MAX_PER_ZONE}
                  onClick={() =>
                    setZoneQuantity(
                      { eventId, eventTitle: eventTitle ?? "" },
                      {
                        zoneId: item.zoneId,
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
        </CardContent>
      </Card>

      <div className="flex flex-col items-end gap-2">
        {checkoutError && <p className="text-sm text-danger">{checkoutError}</p>}
        <Button size="lg" onClick={checkout} disabled={checkingOut}>
          {checkingOut ? "Creando pedido..." : "Continuar al pago"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Vas a tener 15 minutos para pagar con QR antes de que el pedido
          expire.
        </p>
      </div>
    </div>
  );
}
