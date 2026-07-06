# 🎟️ BoletaVIP

Event ticketing platform (initially focused on comedy shows, generic for any event type) with a Bolivian-style payment flow: buyers pay via static bank QR and the organizer confirms payments manually.

## Features

- **Buyers**: browse the public catalog with filters (category, city, date, price), pick numbered seats on an interactive seat map or quantities in free-capacity zones, pay via the organizer's static QR within a 15-minute window, and receive digital tickets with unique QR codes.
- **Organizers**: manage venues (zone editor with auto-generated seat grids), create events with cover image and payment QR uploads, submit them for review, confirm/reject payments, and track revenue, tickets sold and per-zone occupancy.
- **Admins**: approve/reject submitted events, manage users (role filters, suspend/reactivate), and see global platform metrics.

## Stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack) + TypeScript
- PostgreSQL + [Prisma 7](https://prisma.io) (driver adapter `@prisma/adapter-pg`)
- [NextAuth v5](https://authjs.dev) — credentials + optional Google OAuth (JWT sessions)
- Tailwind CSS v4 (class-based dark mode via `next-themes`)
- Zustand (persisted cart) · Zod v4 (validation) · `qrcode` (ticket QR generation)

## Getting started

### 1. Database

Requires a local PostgreSQL. One-time setup:

```bash
sudo -u postgres psql -c "CREATE ROLE <your-user> LOGIN CREATEDB PASSWORD '<password>';"
createdb boletavip
```

### 2. Environment

```bash
cp .env.example .env
# Fill DATABASE_URL and AUTH_SECRET (openssl rand -base64 32).
# GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are optional; the Google
# sign-in button only appears when both are set.
```

### 3. Install, migrate, seed, run

```bash
pnpm install
pnpm prisma migrate dev
pnpm db:seed
pnpm dev
```

### Seeded test users (password: `Password123`)

| Role      | Email                       |
| --------- | --------------------------- |
| Admin     | admin@boletavip.com         |
| Organizer | organizador@boletavip.com   |
| Organizer | organizador2@boletavip.com  |
| Buyer     | comprador@boletavip.com     |

The seed also creates two venues (Teatro Municipal in La Paz with a numbered VIP zone, Casa Teatro in Santa Cruz) and five sample events (one pending admin review).

## Scripts

| Script           | Description                          |
| ---------------- | ------------------------------------ |
| `pnpm dev`       | Development server                   |
| `pnpm build`     | Production build                     |
| `pnpm test`      | Unit tests (Vitest)                  |
| `pnpm typecheck` | TypeScript check                     |
| `pnpm lint`      | ESLint                               |
| `pnpm db:migrate`| Prisma migrations (dev)              |
| `pnpm db:seed`   | Seed demo data (idempotent)          |
| `pnpm db:studio` | Prisma Studio                        |

## How the purchase flow works

1. The buyer selects seats/zones; the cart lives client-side (Zustand + localStorage).
2. Checkout creates an order inside a **serializable transaction**: seats flip to `RESERVED` atomically and free-zone capacity is validated against pending/confirmed orders. Prices are always computed server-side.
3. The order starts as `PENDING_PAYMENT` with a 15-minute expiry and shows the organizer's static payment QR plus a live countdown.
4. There is no cron: `expireStaleOrders()` runs lazily before order reads/writes, cancelling overdue orders and releasing their seats.
5. The organizer confirms the payment from the dashboard; seats become `SOLD` and one ticket per seat/quantity is generated with a unique UUID code rendered as a QR data URL.

## Project structure

```
src/
├── app/               # Routes: (public), (auth), dashboard/, admin/, pedidos/, api/
├── components/        # ui/, layout/, auth/, events/, seats/, cart/, orders/, dashboard/, admin/
├── lib/               # auth, prisma client, validations (Zod), orders, utils
├── stores/            # Zustand cart store
├── generated/prisma/  # Generated Prisma client (gitignored)
└── proxy.ts           # Role-based route protection (Next 16 proxy)
```
