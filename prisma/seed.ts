import "dotenv/config";
import bcrypt from "bcryptjs";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import QRCode from "qrcode";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/** Noon UTC keeps the calendar date stable in any nearby timezone. */
function daysFromNow(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(12, 0, 0, 0);
  return date;
}

function numberedSeats(rows: number, seatsPerRow: number) {
  const seats: { row: string; number: number; posX: number; posY: number }[] = [];
  for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
    for (let number = 1; number <= seatsPerRow; number++) {
      seats.push({
        row: String.fromCharCode(65 + rowIndex),
        number,
        posX: 10 + (number - 1) * 28,
        posY: 10 + rowIndex * 28,
      });
    }
  }
  return seats;
}

/** Tables laid out in a grid inside their zone. */
function gridTables(
  count: number,
  seats: number,
  {
    prefix = "M",
    hasChairs = true,
    shape = "ROUND" as "ROUND" | "SQUARE" | "RECT",
    width = 60,
    height = 60,
    perRow = 3,
    pitchX = 80,
    pitchY = 80,
  } = {},
) {
  return Array.from({ length: count }, (_, index) => ({
    label: `${prefix}${index + 1}`,
    seats,
    hasChairs,
    shape,
    width,
    height,
    posX: 20 + (index % perRow) * pitchX,
    posY: 20 + Math.floor(index / perRow) * pitchY,
  }));
}

/**
 * Puts each zone on sale for one event. Tables get an EventTable row eagerly
 * (there are only a handful); numbered seats stay lazy — no row means
 * "available at the zone price".
 */
async function seedEventZones(
  eventId: string,
  zonePrices: Record<string, number>,
) {
  for (const [zoneId, price] of Object.entries(zonePrices)) {
    const zone = await prisma.zone.findUnique({
      where: { id: zoneId },
      select: { id: true, type: true, capacity: true, tables: { select: { id: true } } },
    });
    if (!zone) continue;

    const eventZone = await prisma.eventZone.upsert({
      where: { eventId_zoneId: { eventId, zoneId } },
      update: { price },
      create: {
        eventId,
        zoneId,
        price,
        capacityForSale: zone.type === "GENERAL" ? zone.capacity : null,
        isEnabled: true,
        defaultInclusionType: zone.type === "TABLES" ? "CONSUMPTION_CREDIT" : "NONE",
        defaultInclusionValue: zone.type === "TABLES" ? price / 2 : null,
      },
    });

    if (zone.tables.length > 0) {
      await prisma.eventTable.createMany({
        data: zone.tables.map((table) => ({
          eventZoneId: eventZone.id,
          tableId: table.id,
        })),
        skipDuplicates: true,
      });
    }
  }
}

async function seedUsers() {
  const password = await bcrypt.hash("Password123", 10);

  const users = [
    {
      name: "Admin BoletaVIP",
      email: "admin@boletavip.com",
      role: "ADMIN" as const,
    },
    {
      name: "Carla Organizadora",
      email: "organizador@boletavip.com",
      role: "ORGANIZER" as const,
    },
    {
      name: "Marco Productor",
      email: "organizador2@boletavip.com",
      role: "ORGANIZER" as const,
    },
    {
      name: "Bruno Comprador",
      email: "comprador@boletavip.com",
      role: "BUYER" as const,
    },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { role: user.role, emailVerified: new Date() },
      create: { ...user, password, emailVerified: new Date() },
    });
    console.log(`Seeded user ${user.email} (${user.role})`);
  }
}

async function seedDemoPaymentQr() {
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadsDir, { recursive: true });
  const publicPath = "/uploads/seed-payment-qr.png";
  await QRCode.toFile(
    path.join(uploadsDir, "seed-payment-qr.png"),
    "BoletaVIP demo — transferencia QR de prueba",
    { width: 480, margin: 2 },
  );
  console.log(`Seeded demo payment QR at ${publicPath}`);
  return publicPath;
}

async function seedVenueAndEvents() {
  const organizer = await prisma.user.findUniqueOrThrow({
    where: { email: "organizador@boletavip.com" },
  });

  const paymentQrImage = await seedDemoPaymentQr();

  await prisma.venue.upsert({
    where: { id: "seed-venue-teatro" },
    update: {},
    create: {
      id: "seed-venue-teatro",
      name: "Teatro Municipal Alberto Saavedra Pérez",
      address: "Calle Genaro Sanjinés 629",
      city: "La Paz",
      ownerId: organizer.id,
      floors: {
        create: [
          {
            id: "seed-floor-teatro",
            name: "Planta baja",
            order: 0,
            zones: {
              create: [
                {
                  id: "seed-zone-vip",
                  name: "VIP",
                  type: "SEATED",
                  color: "#8b5cf6",
                  order: 0,
                  posX: 0,
                  posY: 0,
                  width: 244,
                  height: 160,
                  seats: { createMany: { data: numberedSeats(5, 8) } },
                },
                {
                  id: "seed-zone-general",
                  name: "General",
                  type: "GENERAL",
                  color: "#6366f1",
                  order: 1,
                  capacity: 120,
                  posX: 264,
                  posY: 0,
                },
              ],
            },
          },
        ],
      },
    },
  });
  console.log("Seeded venue Teatro Municipal (VIP 5x8 asientos + General 120)");

  const events = [
    {
      id: "seed-event-standup",
      title: "Noche de Stand Up: Reyes de la Risa",
      description:
        "Una noche imperdible con los mejores comediantes del circuito paceño. Dos horas de humor sin filtro, invitados sorpresa y micrófono abierto al final.\n\nLa entrada incluye un cóctel de bienvenida.",
      category: "Comedia",
      date: daysFromNow(14),
      time: "20:30",
      zonePrices: { "seed-zone-vip": 90, "seed-zone-general": 60 },
      status: "APPROVED" as const,
    },
    {
      id: "seed-event-festival",
      title: "Festival de Comedia Paceña",
      description:
        "El festival anual que reúne a más de 10 comediantes nacionales e internacionales en un solo escenario. Tres bloques de shows, feria gastronómica en el foyer y after oficial.",
      category: "Comedia",
      date: daysFromNow(30),
      time: "19:00",
      zonePrices: { "seed-zone-vip": 120, "seed-zone-general": 80 },
      status: "APPROVED" as const,
    },
    {
      id: "seed-event-impro",
      title: "Impro Night: Sin Guión",
      description:
        "Comedia de improvisación total: el público propone, los actores ejecutan. Cada función es única e irrepetible. Apto para mayores de 16 años.",
      category: "Comedia",
      date: daysFromNow(45),
      time: "21:00",
      zonePrices: { "seed-zone-vip": 52.5, "seed-zone-general": 35 },
      status: "PENDING" as const,
    },
  ];

  for (const { zonePrices, ...event } of events) {
    await prisma.event.upsert({
      where: { id: event.id },
      update: { status: event.status },
      create: {
        ...event,
        venueId: "seed-venue-teatro",
        organizerId: organizer.id,
        paymentQrImage,
      },
    });
    // Prices live on EventZone now: one row per zone this event sells
    await seedEventZones(event.id, zonePrices);
    console.log(`Seeded event "${event.title}" (${event.status})`);
  }
}

async function seedSecondOrganizer(paymentQrImage: string) {
  const organizer = await prisma.user.findUniqueOrThrow({
    where: { email: "organizador2@boletavip.com" },
  });

  await prisma.venue.upsert({
    where: { id: "seed-venue-casateatro" },
    update: {},
    create: {
      id: "seed-venue-casateatro",
      name: "Casa Teatro Santa Cruz",
      address: "Av. Monseñor Rivero 415",
      city: "Santa Cruz",
      ownerId: organizer.id,
      floors: {
        create: [
          {
            id: "seed-floor-casateatro-baja",
            name: "Planta baja",
            order: 0,
            zones: {
              create: [
                {
                  id: "seed-zone-preferencial",
                  name: "Preferencial",
                  type: "GENERAL",
                  color: "#6366f1",
                  order: 0,
                  capacity: 60,
                  posX: 0,
                  posY: 0,
                },
                {
                  id: "seed-zone-popular",
                  name: "Popular",
                  type: "GENERAL",
                  color: "#22c55e",
                  order: 1,
                  capacity: 140,
                  posX: 220,
                  posY: 0,
                },
              ],
            },
          },
          {
            // A second floor so the multi-floor UI has something to show
            id: "seed-floor-casateatro-alta",
            name: "Planta alta",
            order: 1,
            zones: {
              create: [
                {
                  id: "seed-zone-lounges",
                  name: "Lounges VIP",
                  type: "TABLES",
                  color: "#f59e0b",
                  order: 0,
                  posX: 0,
                  posY: 0,
                  width: 420,
                  height: 340,
                  // Sofas with a headcount, not seven chairs each: this is
                  // what `hasChairs: false` is for.
                  tables: {
                    createMany: {
                      data: gridTables(4, 7, {
                        prefix: "Lounge ",
                        hasChairs: false,
                        shape: "RECT",
                        width: 150,
                        height: 80,
                        perRow: 2,
                        pitchX: 190,
                        pitchY: 150,
                      }),
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
  });
  console.log(
    "Seeded venue Casa Teatro Santa Cruz (2 pisos: General + 4 mesas VIP)",
  );

  const events = [
    {
      id: "seed-event-acustico",
      title: "Noche Acústica: Voces del Oriente",
      description:
        "Un recorrido íntimo por la música boliviana contemporánea con artistas cruceños en formato acústico. Ambiente de café concert, capacidad limitada.",
      category: "Música",
      date: daysFromNow(21),
      time: "20:00",
      zonePrices: {
        "seed-zone-preferencial": 91,
        "seed-zone-popular": 70,
        "seed-zone-lounges": 1120,
      },
      status: "APPROVED" as const,
    },
    {
      id: "seed-event-obra",
      title: "La Casa de los Espejos — Obra de Teatro",
      description:
        "Un drama familiar que explora la memoria y la identidad, dirigido por el colectivo Teatro del Sur. Funciones limitadas, elenco invitado internacional.",
      category: "Teatro",
      date: daysFromNow(35),
      time: "19:30",
      zonePrices: {
        "seed-zone-preferencial": 71.5,
        "seed-zone-popular": 55,
        "seed-zone-lounges": 880,
      },
      status: "APPROVED" as const,
    },
  ];

  for (const { zonePrices, ...event } of events) {
    await prisma.event.upsert({
      where: { id: event.id },
      update: { status: event.status },
      create: {
        ...event,
        venueId: "seed-venue-casateatro",
        organizerId: organizer.id,
        paymentQrImage,
      },
    });
    // Prices live on EventZone now: one row per zone this event sells
    await seedEventZones(event.id, zonePrices);
    console.log(`Seeded event "${event.title}" (${event.status})`);
  }
}

async function main() {
  await seedUsers();
  await seedVenueAndEvents();
  await seedSecondOrganizer("/uploads/seed-payment-qr.png");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
