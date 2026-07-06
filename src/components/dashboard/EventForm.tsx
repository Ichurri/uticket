"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import {
  Input,
  Label,
  Select,
  Textarea,
  FieldError,
} from "@/components/ui/Input";
import { ImageUpload } from "@/components/dashboard/ImageUpload";
import { eventSchema } from "@/lib/validations/event";
import { EVENT_CATEGORIES } from "@/lib/constants";

export interface VenueOption {
  id: string;
  name: string;
  city: string;
}

export interface EventFormInitial {
  id: string;
  title: string;
  description: string;
  category: string;
  date: string;
  time: string;
  venueId: string;
  price: string;
  coverImage: string | null;
  paymentQrImage: string | null;
}

export function EventForm({
  venues,
  initial,
}: {
  venues: VenueOption[];
  initial?: EventFormInitial;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState(initial?.category ?? EVENT_CATEGORIES[0]);
  const [date, setDate] = useState(initial?.date ?? "");
  const [time, setTime] = useState(initial?.time ?? "20:00");
  const [venueId, setVenueId] = useState(initial?.venueId ?? venues[0]?.id ?? "");
  const [price, setPrice] = useState(initial?.price ?? "");
  const [coverImage, setCoverImage] = useState<string | null>(
    initial?.coverImage ?? null,
  );
  const [paymentQrImage, setPaymentQrImage] = useState<string | null>(
    initial?.paymentQrImage ?? null,
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const payload = {
      title,
      description,
      category,
      date,
      time,
      venueId,
      price,
      coverImage,
      paymentQrImage,
    };

    const parsed = eventSchema.safeParse(payload);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Revisá los datos del formulario");
      return;
    }

    setLoading(true);
    const response = await fetch(
      initial ? `/api/events/${initial.id}` : "/api/events",
      {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    setLoading(false);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setFormError(data?.error ?? "No se pudo guardar el evento");
      return;
    }

    router.push("/dashboard/events");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <Card>
        <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="event-title">Título</Label>
            <Input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Noche de Stand Up"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="event-description">Descripción</Label>
            <Textarea
              id="event-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Contá de qué trata el evento, quiénes se presentan, qué incluye la entrada..."
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-category">Categoría</Label>
            <Select
              id="event-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {EVENT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-venue">Venue</Label>
            <Select
              id="event-venue"
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
            >
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name} ({venue.city})
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-date">Fecha</Label>
            <Input
              id="event-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-time">Hora</Label>
            <Input
              id="event-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-price">Precio base (Bs)</Label>
            <Input
              id="event-price"
              type="number"
              min="1"
              step="0.5"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="50"
              required
            />
            <p className="text-xs text-muted-foreground">
              El precio por zona se calcula multiplicando este precio por el
              multiplicador de cada zona.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-6 p-6 sm:grid-cols-2">
          <ImageUpload
            label="Imagen de portada"
            hint="Se muestra en el catálogo y la página del evento (JPG, PNG o WebP, máx. 5 MB)"
            value={coverImage}
            onChange={setCoverImage}
          />
          <ImageUpload
            label="QR de pago"
            hint="El QR de tu cuenta bancaria que verán los compradores al pagar. Obligatorio para enviar a revisión."
            value={paymentQrImage}
            onChange={setPaymentQrImage}
          />
        </CardContent>
      </Card>

      <FieldError message={formError ?? undefined} />

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading
            ? "Guardando..."
            : initial
              ? "Guardar cambios"
              : "Crear evento (borrador)"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/dashboard/events")}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
