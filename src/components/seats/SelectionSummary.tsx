"use client";

import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { useCartStore, cartTotal, cartCount } from "@/stores/cart-store";
import { useHydrated } from "@/lib/use-hydrated";

export function SelectionSummary({ eventId }: { eventId: string }) {
  const hydrated = useHydrated();
  const items = useCartStore((state) =>
    state.eventId === eventId ? state.items : [],
  );

  const shownItems = hydrated ? items : [];
  const total = cartTotal(shownItems);
  const count = cartCount(shownItems);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tu selección</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {shownItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Elegí tus asientos o la cantidad de boletos por zona.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-2 text-sm">
              {shownItems.map((item) => (
                <li key={item.key} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">
                    {item.label}
                    {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(item.unitPrice * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex justify-between border-t border-border pt-3 font-semibold">
              <span>
                Total ({count} boleto{count === 1 ? "" : "s"})
              </span>
              <span className="tabular-nums">{formatCurrency(total)}</span>
            </div>

            <Link href="/carrito" className={buttonVariants({ className: "w-full" })}>
              Ver resumen del pedido
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
