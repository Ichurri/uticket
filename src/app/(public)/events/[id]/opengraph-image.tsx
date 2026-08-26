import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatWeekdayDate } from "@/lib/utils";

/**
 * The share card for an event link — the thing people actually see when an
 * organizer drops the URL in a WhatsApp group.
 *
 * Deliberately drawn from scratch instead of reusing the organizer's cover
 * photo: covers are uploaded at any aspect ratio and any quality, while this
 * always lands on brand, always fits 1200×630, and always states the three
 * facts that decide a click (what, when, from how much). No remote fetches,
 * so it can't fail halfway and serve a broken preview.
 */
export const alt = "Evento en Üticket";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id, status: "APPROVED" },
    select: {
      title: true,
      category: true,
      date: true,
      time: true,
      price: true,
      venue: {
        select: {
          name: true,
          city: true,
          zones: { select: { priceMultiplier: true } },
        },
      },
    },
  });

  const title = event?.title ?? "Üticket";
  const multipliers = event?.venue.zones.map((zone) => Number(zone.priceMultiplier)) ?? [];
  const priceFrom = event
    ? Number(event.price) * (multipliers.length ? Math.min(...multipliers) : 1)
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(150deg, #1c1230 0%, #0f0b1c 70%)",
          color: "#f5f5f7",
          fontFamily: "sans-serif",
        }}
      >
        {/* Gold marquee brackets, same motif as the site hero */}
        <div
          style={{
            position: "absolute",
            top: 40,
            left: 40,
            width: 64,
            height: 64,
            borderLeft: "5px solid #cda349",
            borderTop: "5px solid #cda349",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 40,
            right: 40,
            width: 64,
            height: 64,
            borderRight: "5px solid #cda349",
            borderTop: "5px solid #cda349",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1 }}>
            <span style={{ color: "#8e5cff" }}>Ü</span>ticket
          </span>
          {event && (
            <span
              style={{
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: 3,
                textTransform: "uppercase",
                color: "#e9ce8b",
                border: "2px solid rgba(233,206,139,0.45)",
                borderRadius: 999,
                padding: "6px 20px",
              }}
            >
              {event.category}
            </span>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <span
            style={{
              fontSize: title.length > 42 ? 62 : 78,
              fontWeight: 800,
              letterSpacing: -2,
              lineHeight: 1.05,
              // Long titles get clamped instead of pushing the meta line off
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {title}
          </span>
          {event && (
            <span style={{ fontSize: 32, color: "#a9a3bc" }}>
              {formatWeekdayDate(event.date)} · {event.time} hrs ·{" "}
              {event.venue.name}, {event.venue.city}
            </span>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {priceFrom !== null ? (
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 10,
                fontSize: 30,
                color: "#a9a3bc",
              }}
            >
              <span>Desde</span>
              <span style={{ color: "#8e5cff", fontWeight: 800 }}>
                {formatCurrency(priceFrom)}
              </span>
            </div>
          ) : (
            <span style={{ fontSize: 30, color: "#a9a3bc" }}>
              Tu entrada en un clic.
            </span>
          )}
          <span
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: "#0f0b1c",
              background: "#8e5cff",
              borderRadius: 999,
              padding: "16px 36px",
            }}
          >
            Comprar boleto
          </span>
        </div>
      </div>
    ),
    size,
  );
}
