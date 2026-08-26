import { NextResponse } from "next/server";
import { expireStaleOrders } from "@/lib/orders";

/**
 * Safety net for the lazy expiry. `expireStaleOrders()` normally runs
 * before order reads/writes, which means a quiet event keeps its abandoned
 * holds forever: nobody browses, nothing expires, and the seats look sold.
 * Vercel Cron hits this every 5 minutes so inventory comes back on its own.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET`. Without the secret set
 * the endpoint refuses to run rather than sitting open to the internet.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET no está configurado" },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await expireStaleOrders();
  return NextResponse.json({ ok: true, ranAt: new Date().toISOString() });
}
