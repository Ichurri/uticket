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
import {
  useCartStore,
  cartTotal,
  cartCount,
  type CartItem,
} from "@/stores/cart-store";
import { useHydrated } from "@/lib/use-hydrated";

const NO_ITEMS: CartItem[] = [];

export function SelectionSummary({ eventId }: { eventId: string }) {
  const hydrated = useHydrated();
  // Selectors must return stable references (no fresh arrays) for
  // useSyncExternalStore; derive the event filter outside the selector
  const cartEventId = useCartStore((state) => state.eventId);
  const cartItems = useCartStore((state) => state.items);
  const items = cartEventId === eventId ? cartItems : NO_ITEMS;

  const shownItems = hydrated ? items : NO_ITEMS;
  const total = cartTotal(shownItems);
  const count = cartCount(shownItems);
  // Remounting this span (via `key`) each time the selection's contents
  // change replays its CSS flash animation — no effect/setState needed.
  const selectionSignature = shownItems
    .map((item) => `${item.key}:${item.quantity}`)
    .join(",");

  return (
    <Card className="relative">
      <span
        key={selectionSignature}
        aria-hidden
        className="animate-selection-flash pointer-events-none absolute inset-0 rounded-2xl"
      />
      <CardHeader>
        <CardTitle>Tu selección</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {shownItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Elegí tus asientos, una mesa o la cantidad de boletos por zona.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-2 text-sm">
              {shownItems.map((item) => (
                <li key={item.key} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">
                    {item.label}
                    {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                    {item.admits
                      ? ` · ${item.admits} entrada${item.admits === 1 ? "" : "s"}`
                      : ""}
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

            <Link href="/cart" className={buttonVariants({ className: "w-full" })}>
              Ver resumen del pedido
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
