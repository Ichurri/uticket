import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
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

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
