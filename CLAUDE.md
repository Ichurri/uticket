# CLAUDE.md

Üticket (formerly BoletaVIP; folder and package renamed to `uticket` on 2026-07-14 — the local DB name and seed emails still use `boletavip`, and the GitHub remote may still point at `Ichurri/boletavip`): event ticketing platform (Bolivia). Buyers pay via the organizer's static bank QR; the organizer confirms payments manually and tickets are issued with unique QR codes, validated at the door with an in-app scanner.

**Brand (guidelines v1.0)**: user-facing name **Üticket**. Palette: Primary Purple `#6D2BFF`, Secondary Purple `#4B14D1` (hover), Lavender `#879CFF` (accent/ring), Dark Gray `#2B2B2B`, Light Gray `#F5F5F7` — tokens in `globals.css` (dark mode uses lightened `#8E5CFF` primary for contrast). Typography: Plus Jakarta Sans (`--font-jakarta`). Logo: `src/components/layout/Logo.tsx` (Ü glyph SVG + wordmark) and `src/app/icon.svg`. Tagline: "Tu entrada en un clic." Tone: cercano, claro y emocionante.

## Language conventions

- Talk to the user in **Spanish**. Code, identifiers, comments, commits and **URL routes** in **English** — only UI copy is Spanish.
- **UI copy is Spanish** (voseo: "elegí", "tenés"). Currency is Bs via `formatCurrency` in `src/lib/utils.ts`.
- Routes renamed 2026-07-09 (`/eventos`→`/events`, `/pedidos`→`/orders`, `/carrito`→`/cart`, `/verificar-correo`→`/verify-email`, `/ser-organizador`→`/become-organizer`, `/dashboard/verificar`→`/dashboard/verify`); legacy 301s live in `next.config.ts`.

## Commands

```bash
pnpm dev          # dev server (local Postgres, uploads to /public/uploads)
pnpm build        # prisma generate && next build  (do NOT remove the generate step)
pnpm test         # Vitest unit tests
pnpm test:integration  # integration tests — needs DATABASE_URL pointed at a *_test DB (boletavip_test)
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm db:migrate   # prisma migrate dev (local DB)
pnpm db:seed      # idempotent demo seed — LOCAL ONLY, never against Neon
pnpm db:studio    # Prisma Studio
```

Local DB: PostgreSQL 17, db `boletavip`, role `ichurri` / `boletavip_dev`. Seed users (password `Password123`): admin@boletavip.com, organizador@boletavip.com, organizador2@boletavip.com, comprador@boletavip.com. Re-running the seed resets seed events' statuses.

## Stack quirks (things that differ from older docs/tutorials)

- **Next.js 16**: route protection lives in `src/proxy.ts` (NOT `middleware.ts` — deprecated). `params`/`searchParams` are Promises (`await` them). Route files under `app/api` may only export HTTP methods.
- **Prisma 7**: datasource has NO `url` in `schema.prisma`; the connection lives in `prisma.config.ts` (`env("DATABASE_URL")`). Client is generated to `src/generated/prisma` (gitignored) — import `PrismaClient`/`Prisma` from `@/generated/prisma/client`, enums from `@/generated/prisma/enums`. After schema changes run `pnpm prisma generate` (and restart the dev server — it caches the old client). Runtime uses the `PrismaPg` driver adapter (`src/lib/prisma.ts`).
- **NextAuth v5 beta**: JWT strategy; `id` and `role` are injected into the session. Edge-safe config split: `src/lib/auth.config.ts` (no Prisma, used by proxy) vs `src/lib/auth.ts` (full, with adapter + credentials + conditional Google). Google provider only activates when `GOOGLE_CLIENT_ID/SECRET` are set.
- **Tailwind v4**: tokens defined in `globals.css` via CSS vars + `@theme inline`; class-based dark mode (`next-themes`). No `tailwind.config`.
- **Zustand selectors must return stable references** (primitives or direct state refs). Never `state.items.filter(...)` or `: []` inside a selector — it breaks `useSyncExternalStore` ("getSnapshot should be cached"). Derive outside the selector.
- After renaming/moving routes, `pnpm typecheck` may fail on stale generated route types — fix with `rm -rf .next/dev`.
- Backgrounding the dev server from a tool call: plain `&` dies when the shell exits — use `nohup pnpm dev > /tmp/uticket-dev.log 2>&1 &`.

## Architecture

- Mutations go through `/app/api/**` routes with Zod validation (`src/lib/validations/*`); reads happen directly in server components via `prisma`.
- API auth: `requireRole(...roles)` from `src/lib/api-auth.ts` — also rechecks the `suspended` flag in DB on every call (JWT outlives suspension).
- Ownership checks: organizers may only touch their own venues/events/orders; ADMIN bypasses.
- Prices are ALWAYS computed server-side: `event.price × zone.priceMultiplier`. Money fields are `Decimal` — convert with `Number()` before passing to client components.
- Event dates are stored at **noon UTC** (`eventDate()` in `src/lib/utils.ts`) so the calendar date is timezone-stable.
- **Displayed times are always Bolivia time**: use `formatDate`/`formatDateTime` from `src/lib/utils.ts`. Never create an `Intl.DateTimeFormat` without `timeZone: BOLIVIA_TZ` — Vercel renders in UTC and times show 4 h ahead otherwise.
- Data freshness without websockets: `RefreshOnFocus` in the root layout (router.refresh on tab focus), `AutoRefresh` interval polling on the organizer orders page, and `experimental.staleTimes.dynamic: 0` in `next.config.ts`.

## Business rules

- Roles: BUYER | ORGANIZER | ADMIN. Registration offers buyer/organizer; ADMIN only via DB.
- Event lifecycle: DRAFT → submit (requires `paymentQrImage`) → PENDING → admin approves → APPROVED (public) / rejects → back to DRAFT. Approved events can only be cancelled, not edited/deleted.
- Venues own zones; a zone is either numbered (rows × seatsPerRow, `Seat` rows generated, `Zone.rows != null`) or free-capacity. Venue structure is locked once it has sales.
- Orders: created in a **serializable transaction** — seats flip AVAILABLE→RESERVED atomically, free-zone capacity checked against PENDING_PAYMENT/PAYMENT_SUBMITTED/CONFIRMED orders. 15-min expiry applies only to PENDING_PAYMENT. **No cron**: `expireStaleOrders()` (`src/lib/orders.ts`) runs lazily before order reads/writes and releases seats.
- Order flow: `PENDING_PAYMENT` → buyer uploads bank receipt (`POST /api/orders/[id]/proof`, image ≤5 MB) → `PAYMENT_SUBMITTED` ("En revisión", no longer expires; proof replaceable) → organizer verifies (confirm) or rejects (cancel with optional `rejectionReason`, seats released, buyer emailed). Buyers may self-cancel only PENDING_PAYMENT. Organizer is emailed on the first proof submission. Confirm claims the status atomically inside the transaction (concurrent confirms → one 409). Confirm/cancel responses include emailSent for the dashboard warning.
- Buyers can hold at most 3 PENDING_PAYMENT orders (429 beyond that). Verification/reset emails have a 60 s cooldown (silent for /forgot to avoid probing).
- Payment proofs are private: stored via Vercel Blob access:"private" (local: /private-uploads, gitignored) and served through GET /api/orders/[id]/proof (buyer/organizer/admin only); legacy public URLs still redirect. Proof images render with unoptimized (the image optimizer drops auth cookies).
- Door check-in without accounts: Event.scanCode (rotatable via POST /api/events/[id]/scan-code) unlocks public /scan/[code]; /api/tickets/verify accepts scanCode as an alternative credential scoped to that event.
- Organizers can set a contact phone (/account → POST /api/account/profile); shown on event and order pages as a wa.me link. Buyers page has CSV export (GET /api/events/[id]/buyers/export). Tickets downloadable as PDF (GET /api/tickets/[id]/pdf, pdf-lib, WinAnsi-sanitized).
- Static pages: /help, /terms, /privacy (linked from the footer).
- **Purchase requires a verified email** (403 otherwise). Verification: hashed token in `VerificationToken` (24 h), link `/verify-email?token=`, resend via `POST /api/verify-email/resend`, banner in root layout. Google sign-ins auto-verified (`events.signIn`); seed users verified; migration grandfathered existing users.
- **Passwords**: forgot/reset via `/forgot-password` → `POST /api/password/forgot` (always generic 200; skips Google-only accounts) → emailed link `/reset-password?token=` (1 h TTL, single-use, identifier prefixed `password-reset:` in `VerificationToken`) → `POST /api/password/reset` (also sets `emailVerified` — the link proves ownership). Logged-in change at `/account` (`POST /api/password/change`, requires current password; 409 for Google-only accounts). `/account` is session-gated in the proxy. JWT sessions are NOT invalidated on reset (known limitation).
- **Sales cutoff**: `PlatformSettings` singleton (`orderCutoffHours`, default 2, admin-editable on `/admin`). Enforced in `POST /api/orders` via `salesAreClosed()` (`src/lib/utils.ts`, event start = noon-UTC date + `time` at fixed UTC-4); event page shows "Venta cerrada".
- Emails (`src/lib/email.ts`, plain fetch, no SDK): provider by env — `BREVO_API_KEY` → Brevo (current prod choice, no own domain needed, `EMAIL_FROM` must be the Brevo-verified sender); else `RESEND_API_KEY` → Resend (needs a verified domain; sandbox only delivers to the account owner); else console log (dev). Templates escape user input. Sent on: registration (verification), order confirmed, order rejected. Failures never break API responses.
- Confirmation (organizer): order→CONFIRMED, seats→SOLD, one ticket per seat/quantity with UUID `code` + QR data URL, buyer notified by email.
- Ticket check-in (`/api/tickets/verify`): atomic `updateMany where status=VALID` → USED + `usedAt`; a QR is accepted exactly once. Only the event's organizer or admin can verify.
- Cart (client-only, Zustand + localStorage): single event at a time, max 10 tickets per zone.

## Deployment (Vercel + Neon + Vercel Blob) — LIVE in production

- Push to `main` auto-deploys. Working tree may contain the user's WIP — when committing, stage only the files you changed.
- **Migrations to prod BEFORE pushing code that needs them**:
  `DATABASE_URL="<neon-pooled-string>" pnpm prisma migrate deploy` (ask the user for the string; it's not stored in the repo). Never `migrate dev` and never seed against Neon.
- Uploads: `/api/upload` uses Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set, local `/public/uploads` otherwise. The Blob store must be **Public**; image URL validation accepts `/uploads/...` or `*.public.blob.vercel-storage.com` only.
- **Payment proofs need a SEPARATE, dedicated Blob store**: a store's access mode (public/private) is fixed at creation and can't be mixed per-blob, so proofs can't share the public images store. Create a second Blob store configured as **Private**, and set its token as `BLOB_PROOFS_READ_WRITE_TOKEN` (used explicitly in `src/app/api/orders/[id]/proof/route.ts`, not the default `BLOB_READ_WRITE_TOKEN`). Without it, proof uploads fail with a clear 500 instead of silently writing to the serverless function's ephemeral disk.
- Env vars on Vercel: `DATABASE_URL` (Neon pooled), `AUTH_SECRET`, `BLOB_READ_WRITE_TOKEN` (public images store; added manually from the store's Getting Started page — connecting the store does NOT inject it), `BLOB_PROOFS_READ_WRITE_TOKEN` (private proofs store, see above), `BREVO_API_KEY` + `EMAIL_FROM` (Brevo-verified sender; without an email provider, prod sends nothing and new users can't verify/buy). When a domain exists: verify it in Resend, set `RESEND_API_KEY` + `EMAIL_FROM`, remove `BREVO_API_KEY`. Env changes require a redeploy; failed builds keep serving the previous deployment.

## Verification habits

Before claiming done: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`, plus exercise the affected flow against the dev server (login via `/api/auth/callback/credentials` with csrf token; check role-gated routes and API status codes). The user approves each work phase before the next — ask before expanding scope.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
