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
  const seats: { row: string; number: number }[] = [];
  for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
    for (let number = 1; number <= seatsPerRow; number++) {
      seats.push({ row: String.fromCharCode(65 + rowIndex), number });
    }
  }
  return seats;
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
      name: "Bruno Comprador",
      email: "comprador@boletavip.com",
      role: "BUYER" as const,
    },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { role: user.role },
      create: { ...user, password },
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
      capacity: 160,
      seatMapType: "BOTH",
      organizerId: organizer.id,
      zones: {
        create: [
          {
            id: "seed-zone-vip",
            name: "VIP",
            capacity: 40,
            priceMultiplier: 1.5,
            rows: 5,
            seatsPerRow: 8,
            seats: { createMany: { data: numberedSeats(5, 8) } },
          },
          {
            id: "seed-zone-general",
            name: "General",
            capacity: 120,
            priceMultiplier: 1,
          },
        ],
      },
    },
  });
  console.log("Seeded venue Teatro Municipal (VIP 5x8 numbered + General 120)");

  const events = [
    {
      id: "seed-event-standup",
      title: "Noche de Stand Up: Reyes de la Risa",
      description:
        "Una noche imperdible con los mejores comediantes del circuito paceño. Dos horas de humor sin filtro, invitados sorpresa y micrófono abierto al final.\n\nLa entrada incluye un cóctel de bienvenida.",
      category: "Comedia",
      date: daysFromNow(14),
      time: "20:30",
      price: 60,
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
      price: 80,
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
      price: 35,
      status: "PENDING" as const,
    },
  ];

  for (const event of events) {
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
    console.log(`Seeded event "${event.title}" (${event.status})`);
  }
}

async function main() {
  await seedUsers();
  await seedVenueAndEvents();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
