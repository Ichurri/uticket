import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { TicketScanner } from "@/components/dashboard/TicketScanner";

export const metadata: Metadata = { title: "Control de puerta" };

export default async function ScanPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const event = await prisma.event.findUnique({
    where: { scanCode: code },
    select: { id: true, title: true, date: true, time: true, status: true },
  });
  if (!event || event.status !== "APPROVED") notFound();

  const [inside, upcoming] = await Promise.all([
    prisma.ticket.count({ where: { eventId: event.id, status: "USED" } }),
    prisma.ticket.count({ where: { eventId: event.id, status: "VALID" } }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-bold">Control de puerta</h1>
        <p className="mt-1 text-muted-foreground">
          {event.title} · {formatDate(event.date)} · {event.time} hrs
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Escaneá el QR de cada boleto. Cada uno se acepta una sola vez.
        </p>
      </div>
      <TicketScanner scanCode={code} initialCounts={{ inside, upcoming }} />
    </div>
  );
}
