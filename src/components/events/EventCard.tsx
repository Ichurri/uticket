import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { CATEGORY_EMOJIS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils";

export interface EventCardData {
  id: string;
  title: string;
  category: string;
  date: Date;
  time: string;
  coverImage: string | null;
  venueName: string;
  city: string;
  priceFrom: number;
}

export function EventCard({ event }: { event: EventCardData }) {
  return (
    <Link href={`/eventos/${event.id}`} className="group">
      <Card className="h-full overflow-hidden transition-shadow group-hover:shadow-md">
        <div className="relative aspect-video bg-gradient-to-br from-primary/25 via-primary/10 to-accent/20">
          {event.coverImage ? (
            <Image
              src={event.coverImage}
              alt={event.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-5xl">
              {CATEGORY_EMOJIS[event.category] ?? "🎟️"}
            </div>
          )}
          <Badge variant="primary" className="absolute left-3 top-3 bg-card/90">
            {event.category}
          </Badge>
        </div>

        <div className="flex flex-col gap-1 p-4">
          <h3 className="font-semibold leading-snug group-hover:text-primary">
            {event.title}
          </h3>
          <p className="text-sm text-muted-foreground">
            {formatDate(event.date)} · {event.time} hrs
          </p>
          <p className="text-sm text-muted-foreground">
            {event.venueName} · {event.city}
          </p>
          <p className="mt-1 text-sm font-semibold text-primary">
            Desde {formatCurrency(event.priceFrom)}
          </p>
        </div>
      </Card>
    </Link>
  );
}
