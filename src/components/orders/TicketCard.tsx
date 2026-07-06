import Image from "next/image";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";

const statusLabels = {
  VALID: { label: "Válido", variant: "success" as const },
  USED: { label: "Usado", variant: "default" as const },
  CANCELLED: { label: "Cancelado", variant: "danger" as const },
};

export interface TicketCardData {
  id: string;
  code: string;
  qrCode: string | null;
  status: keyof typeof statusLabels;
  label: string;
  eventTitle: string;
}

export function TicketCard({ ticket }: { ticket: TicketCardData }) {
  const statusInfo = statusLabels[ticket.status];

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
        {ticket.qrCode ? (
          <Image
            src={ticket.qrCode}
            alt={`QR del boleto ${ticket.label}`}
            width={180}
            height={180}
            unoptimized
            className="rounded-md border border-border bg-white p-1"
          />
        ) : (
          <div className="flex h-[180px] w-[180px] items-center justify-center rounded-md border border-dashed border-border text-4xl">
            🎟️
          </div>
        )}

        <div>
          <p className="font-semibold">{ticket.label}</p>
          <p className="text-xs text-muted-foreground">{ticket.eventTitle}</p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          <code className="text-xs text-muted-foreground">
            {ticket.code.slice(0, 8)}
          </code>
        </div>

        {ticket.qrCode && (
          <a
            href={ticket.qrCode}
            download={`boleto-${ticket.code.slice(0, 8)}.png`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Descargar QR
          </a>
        )}
      </CardContent>
    </Card>
  );
}
