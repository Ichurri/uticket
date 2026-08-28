# CLAUDE.md

Üticket — live at **üticket.com** (`www.xn--ticket-2ya.com`, the ASCII/punycode form; the apex 308-redirects to `www`) — (formerly BoletaVIP; folder and package renamed to `uticket` on 2026-07-14 — the local DB name and seed emails still use `boletavip`, and the GitHub remote may still point at `Ichurri/boletavip`): event ticketing platform (Bolivia). Buyers pay via the organizer's static bank QR; the organizer confirms payments manually and tickets are issued with unique QR codes, validated at the door with an in-app scanner.

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
- Event lifecycle: DRAFT → submit (requires `paymentQrImage`) → PENDING → admin approves → APPROVED (public) / rejects (with a required `reason`) → back to DRAFT. Either outcome emails the organizer (`eventReviewedEmail`). Approved events can only be cancelled, not edited/deleted.
- **Cancelling an event cascades** (`POST /api/events/[id]/status`, action `cancel`): live orders (PENDING_PAYMENT/PAYMENT_SUBMITTED) are cancelled — which releases their inventory — every `VALID` ticket of the event flips to `CANCELLED` so the door scanner rejects it, and every affected buyer is emailed (`eventCancelledEmail`, different copy for paid vs unpaid). CONFIRMED orders keep their status: the money was really paid and the refund is arranged off-platform. The response carries `notified`/`emailsFailed`.
- **Two layers, and they never mix** (refactor 2026-08-27, migrations `physical_commercial_layers` + `drop_legacy_layout_columns`):
  - **Physical** — `Venue → Floor → Zone → Table | Seat`. Pure geometry, reused by every event. **No prices, no statuses, ever.** A venue always has at least one `Floor` ("Planta baja"); the UI hides the floor tabs when there is only one.
  - **Commercial** — `EventZone → EventTable | EventSeat`. Prices, stock on sale, what is included, what is taken. Rebuilt per event.
- `Zone.type` (`ZoneType`): GENERAL (headcount) | TABLES (`Table` rows) | SEATED (`Seat` rows). Always branch on `type`.
- **`Table.hasChairs`** is purely how it is drawn and read: a discotheque lounge is a sofa with a headcount, not eight chairs. `Table.seats` is the capacity either way, and nothing about selling changes.
- **Floor plan editor** at `/dashboard/venues/[id]/editor` (`src/components/venue-editor/*`): plain SVG + pointer events, no canvas library. Geometry is `src/lib/venue-layout.ts` — `chairPositions`, `generateTables`, `dragZoneTo`/`dragTableTo`/`resizeZoneTo`, all pure and unit-tested, so the drag arithmetic never needs a browser to check. Zone coordinates are absolute in the floor canvas; table and seat coordinates are RELATIVE to their zone's corner, and a drag inside a tilted zone is turned back with `rotateVector`.
- **The plan saves as a DIFF, not a wipe** (`PUT /api/venues/[id]/floors/[floorId]/layout`): every row the editor already knows comes back with its id, so a zone keeps its identity and the `EventZone` prices hanging off it survive an edit. `syncZoneTables()` then puts newly drawn tables on sale for the events already using that zone. Deleting is the only guarded operation — `piecesWithSales()` (`src/lib/venues.ts`) refuses to drop a zone/table/seat that an OrderItem or Ticket points at (409 listing them), while moving and renaming stay free: geometry carries no money and every ticket has its own snapshot. The wholesale `PATCH /api/venues/[id]` still freezes the layout venue-wide via `venueHasSales()` — it replaces everything and cannot tell one zone from another.
- **Pricing screen** at `/dashboard/events/[id]/pricing` (`PricingForm` + `GET`/`PUT /api/events/[id]/pricing`, DTO in `src/lib/event-pricing.ts`): per zone price, on/off sale, stock held back (GENERAL), `WHOLE_TABLE`/`PER_SEAT` + per-spot price, default inclusion, sales window; per table a price override and a "no vender" block. **Prices stay editable while an event is live** — `OrderItem.unitPrice` and `Ticket.priceAtPurchase` are snapshots, so an existing order never moves. Three guards: stock may not fall below what is sold, the sale mode is frozen once a table is HELD/SOLD (BLOCKED does not count — the organizer set that themselves), and a HELD/SOLD table keeps its status no matter what the payload says (its prices still update; the response lists what it `skipped`). "Copiar de otro evento" matches on the PHYSICAL ids (`zoneId`/`tableId`) since that is what two events at one venue share, and deliberately does not copy the sales window.
- **Prices live on `EventZone.price`** (absolute Bs, no multipliers). `EventTable`/`EventSeat` may override it; resolve with `tablePrice()` / `tableSeatPrice()` / `seatPrice()` in `src/lib/event-zones.ts`. `Event.price`, `Zone.priceMultiplier` and `Venue.seatMapType` are **gone**. Venue capacity is derived (`sumVenueCapacity`), never stored.
- `EventTable` rows are created **eagerly** with their `EventZone` (tables come in dozens); `EventSeat` rows are **lazy** — no row means "available at the zone price". Creating an event auto-generates its `EventZone`s (`syncEventZones`).
- Tables sell whole (`WHOLE_TABLE`, one buyer takes it, `table.seats` tickets issued) or by the spot (`PER_SEAT`, `seatsSold` counted against `table.seats`). Max 5 tables per order.
- **Availability is stored per event** on `EventTable.status` / `EventSeat.status` (`SaleStatus`), not derived. GENERAL zones are still counted from the live orders of that event. Read it with `getEventInventory()` / `getInventoryByEvent()`.
  - **The catch:** stored status means someone must hand it back. `releaseOrderHolds(orderIds)` runs wherever an order stops being live — expiry (`expireStaleOrders`), buyer/organizer cancel, event cancellation cascade. `releaseExpiredHolds()` sweeps `heldUntil` as a backstop. Forget either and spots leak.
- **`Ticket` carries a snapshot** taken at purchase: `venueName`, `floorName`, `zoneName`, `tableLabel`, `seatLabel`, `priceAtPurchase`, `inclusionSummary`. Labels read the snapshot, never the live layout — renaming or deleting a zone must not break a ticket already sold. Verified: renaming a zone leaves sold tickets untouched.
- Venue layout is locked once anything of it has been sold (`venueHasSales` counts `OrderItem`/`Ticket` through `eventZone.zone.floor.venueId`); details stay editable.
- Orders: created in a **serializable transaction** — tables are claimed with a guarded `updateMany where status=AVAILABLE`, seats upsert their `EventSeat`, GENERAL capacity is counted against the live orders *of that event*; Serializable isolation is what makes the read-then-insert safe (a concurrent buyer for the same seat loses with P2034 → 409). 15-min expiry applies only to PENDING_PAYMENT. **No cron**: `expireStaleOrders()` (`src/lib/orders.ts`) runs lazily before order reads/writes; cancelling the order IS the release, there is no inventory row to reset.
- Order flow: `PENDING_PAYMENT` → buyer uploads bank receipt (`POST /api/orders/[id]/proof`, image ≤5 MB) → `PAYMENT_SUBMITTED` ("En revisión", no longer expires; proof replaceable) → organizer verifies (confirm) or rejects (cancel with optional `rejectionReason`, buyer emailed). Buyers may self-cancel only PENDING_PAYMENT. Organizer is emailed on the first proof submission. Confirm and cancel both claim the status atomically with a guarded `updateMany` (concurrent confirms → one 409; a cancel racing a confirm can no longer strand valid tickets on a cancelled order). Confirm/cancel responses include emailSent for the dashboard warning.
- Buyers can hold at most 3 PENDING_PAYMENT orders (429 beyond that). Verification/reset emails have a 60 s cooldown (silent for /forgot to avoid probing).
- Payment proofs are private: stored via Vercel Blob access:"private" (local: /private-uploads, gitignored) and served through GET /api/orders/[id]/proof (buyer/organizer/admin only); legacy public URLs still redirect. Proof images render with unoptimized (the image optimizer drops auth cookies).
- Door check-in without accounts: Event.scanCode (rotatable via POST /api/events/[id]/scan-code) unlocks public /scan/[code]; /api/tickets/verify accepts scanCode as an alternative credential scoped to that event.
- Organizers can set a contact phone (/account → POST /api/account/profile); shown on event and order pages as a wa.me link. Buyers page has CSV export (GET /api/events/[id]/buyers/export). Tickets downloadable as PDF (GET /api/tickets/[id]/pdf, pdf-lib, WinAnsi-sanitized).
- Static pages: /help, /terms, /privacy (linked from the footer).
- **SEO/sharing**: `metadataBase` + default OpenGraph in the root layout (`src/lib/site.ts` resolves the absolute URL: `NEXT_PUBLIC_SITE_URL` → the real domain `https://www.xn--ticket-2ya.com` (üticket.com, punycode form, `www` canonical) when `VERCEL_ENV=production` → the preview's own `*.vercel.app` host → localhost), per-event `openGraph`/`twitter` metadata, a generated 1200×630 share card (`opengraph-image.tsx`, drawn with `next/og` — no remote fetches so it can't half-fail), `schema.org/Event` JSON-LD, `sitemap.ts`, `robots.ts`, and `ShareEventButton` (native share sheet → WhatsApp/copy fallback).
- **Vercel Cron** (`vercel.json`) hits `GET /api/cron/expire-orders` every 5 min, guarded by `CRON_SECRET`, so abandoned holds are released even when nobody is browsing.
- **Purchase requires a verified email** (403 otherwise). Verification: hashed token in `VerificationToken` (24 h), link `/verify-email?token=`, resend via `POST /api/verify-email/resend`, banner in root layout. Google sign-ins auto-verified (`events.signIn`); seed users verified; migration grandfathered existing users.
- **Passwords**: forgot/reset via `/forgot-password` → `POST /api/password/forgot` (always generic 200; skips Google-only accounts) → emailed link `/reset-password?token=` (1 h TTL, single-use, identifier prefixed `password-reset:` in `VerificationToken`) → `POST /api/password/reset` (also sets `emailVerified` — the link proves ownership). Logged-in change at `/account` (`POST /api/password/change`, requires current password; 409 for Google-only accounts). `/account` is session-gated in the proxy. JWT sessions are NOT invalidated on reset (known limitation).
- **Sales cutoff**: `PlatformSettings` singleton (`orderCutoffHours`, default 2, admin-editable on `/admin`). Enforced in `POST /api/orders` via `salesAreClosed()` (`src/lib/utils.ts`, event start = noon-UTC date + `time` at fixed UTC-4); event page shows "Venta cerrada".
- Emails sent on: registration (verification), **order created** (payment link + QR reminder, so closing the tab doesn't strand the buyer), order confirmed, order rejected, first proof submission (→ organizer), event submitted (→ admins), **event reviewed** (→ organizer), **event cancelled** (→ every affected buyer).
- Emails (`src/lib/email.ts`, plain fetch, no SDK): provider by env — `BREVO_API_KEY` → Brevo (current prod choice, no own domain needed, `EMAIL_FROM` must be the Brevo-verified sender); else `RESEND_API_KEY` → Resend (needs a verified domain; sandbox only delivers to the account owner); else console log (dev). Templates escape user input. Sent on: registration (verification), order confirmed, order rejected. Failures never break API responses.
- Confirmation (organizer): order→CONFIRMED, its `EventTable`/`EventSeat` rows flip HELD→SOLD, and tickets are minted per `ticketCountFor()` (one per seat, `table.seats` for a whole table, `seatsQuantity` for spots, `quantity` for GENERAL) with UUID `code` + QR data URL and the snapshot above.
- Ticket check-in (`/api/tickets/verify`): atomic `updateMany where status=VALID` → USED + `usedAt`; a QR is accepted exactly once. Rejects (without consuming) when the ticket is cancelled, its **event** is cancelled, or its **order** is no longer CONFIRMED. Only the event's organizer or admin can verify.
- **Undo check-in** (`POST /api/tickets/undo`, `UNDO_WINDOW_MS` = 2 min): same credentials as verify (session or `scanCode`), flips USED → VALID only inside the window, so a mis-scan at the door is fixable on the spot but a ticket can't be recycled later in the night. Surfaced as "Deshacer" on the scanner's green verdict, which pauses its auto-advance while staff reach for it.
- Cart (client-only, Zustand + localStorage): single event at a time, max 10 tickets per zone. `CartItem` keys off the commercial row (`eventZoneId`, `eventTableId`, physical `seatId`). Whole tables and seats are toggled; GENERAL zones and PER_SEAT tables use a stepper. `cartCount` sums `admits ?? quantity` so the ticket count is honest.
- Item/ticket labels live in ONE place — `src/lib/order-items.ts` (`orderItemLabel`, `ticketLabel`, `ticketCountFor`, `inclusionSummary`), with the shared Prisma include in `src/lib/order-includes.ts`. Don't re-inline them.
- Venue location: the organizer pastes one Google Maps link; `src/lib/venue-location.ts` parses `@lat,lng` / `?q=` / `!3d!4d`, follows `maps.app.goo.gl` short links server-side, and falls back to two manual inputs. Parsing never blocks the save, and the original link is kept verbatim for "Cómo llegar".
- **The buyer's map** (`src/components/seats/VenueMap.tsx`): the same plan the organizer drew, read-only, with pinch-zoom and drag-pan. Viewport arithmetic is `src/lib/map-view.ts` (`zoomView`/`panView`/`clampView`/`screenToCanvas`, all pure and unit-tested — pinch gestures cannot be verified headless). The map is an ORIENTATION layer, not a replacement for the lists: at fit-zoom a table is ~22 px on a phone, so while `isTappable()` says a zone's pieces are under 44 px a tap frames the zone instead of guessing which table you meant, and `onFocusZone` scrolls to that zone's selector (`zoneSectionId`). The lists below stay the precise, keyboard-accessible way to buy — map shapes are pointer-only on purpose, so the tab order does not carry 400 seats. `floorHasLayout()` hides the map for venues whose zones were never moved apart. Availability rules live in `src/lib/seat-map-view.ts` (`tableIsTaken` — in PER_SEAT mode a HELD table still sells the spots that hold did not take).
- **Live map** at `/dashboard/events/[id]/map` (`src/lib/event-live-map.ts` + `LiveMapView`): the same plan coloured by what is happening on it — free / por pagar / vendido / bloqueado — with the buyer, order reference and amount behind each piece, `AutoRefresh` every 20 s and `expireStaleOrders()` first so an abandoned hold never shows as taken. The state comes from the ORDER, not from `EventTable.status` alone: HELD covers both "about to pay" and "proof on your desk", and a CONFIRMED line wins over a pending one on the same table. Blocked pieces are excluded from capacity — a table nobody can buy is not free stock.
- **`PlanViewport`** (`src/components/seats/PlanViewport.tsx`) is the shared pinch/pan/zoom SVG shell behind both maps; it swallows the click that ends a drag in the capture phase, so nothing painted inside has to tell a tap from a pan.
- The door scanner deliberately does NOT show a table's group size: one QR is always exactly one person, and a headcount next to the green VÁLIDO invites staff to wave in a whole table.

## Deployment (Vercel + Neon + Vercel Blob) — LIVE in production

- Push to `main` auto-deploys. Working tree may contain the user's WIP — when committing, stage only the files you changed.
- **Data migrations go INSIDE the migration SQL, never in a side script.** `prisma migrate deploy` applies every pending migration back to back, so there is no window to run anything in between; and a TS script needs a Prisma client generated from the *transitional* schema, which stops existing the moment the client is regenerated. `20260827213000_drop_legacy_layout_columns` is the worked example: it builds the whole commercial layer in SQL and only then drops the old columns.
- **Migrations to prod BEFORE pushing code that needs them**:
  `DATABASE_URL="<neon-pooled-string>" pnpm prisma migrate deploy` (ask the user for the string; it's not stored in the repo). Never `migrate dev` and never seed against Neon.
- Uploads: `/api/upload` uses Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set, local `/public/uploads` otherwise. The Blob store must be **Public**; image URL validation accepts `/uploads/...` or `*.public.blob.vercel-storage.com` only.
- **Payment proofs need a SEPARATE, dedicated Blob store**: a store's access mode (public/private) is fixed at creation and can't be mixed per-blob, so proofs can't share the public images store. Create a second Blob store configured as **Private**, and set its token as `BLOB_PROOFS_READ_WRITE_TOKEN` (used explicitly in `src/app/api/orders/[id]/proof/route.ts`, not the default `BLOB_READ_WRITE_TOKEN`). Without it, proof uploads fail with a clear 500 instead of silently writing to the serverless function's ephemeral disk.
- Env vars on Vercel: `DATABASE_URL` (Neon pooled), `AUTH_SECRET`, `BLOB_READ_WRITE_TOKEN` (public images store; added manually from the store's Getting Started page — connecting the store does NOT inject it), `BLOB_PROOFS_READ_WRITE_TOKEN` (private proofs store, see above), `BREVO_API_KEY` + `EMAIL_FROM` (Brevo-verified sender; without an email provider, prod sends nothing and new users can't verify/buy). When a domain exists: verify it in Resend, set `RESEND_API_KEY` + `EMAIL_FROM`, remove `BREVO_API_KEY`. Env changes require a redeploy; failed builds keep serving the previous deployment.

## UI conventions

- **No native dialogs.** `window.confirm/prompt/alert` are banned: use `ConfirmDialog` (`src/components/ui/Dialog.tsx`, built on the native `<dialog>` for free focus trapping and top-layer stacking) with an optional required `reason` textarea, and `toast.success/warning/error` (`src/components/ui/Toast.tsx`, `<Toaster />` mounted once in the root layout) for outcomes. `onConfirm` returns an error string to show inline, or `null` on success — the dialog owns its own pending state.
- Every close path goes through React: Esc is intercepted via `onCancel` + `preventDefault`, so `open` in the parent can never drift out of sync with the element.

## Verification habits

Before claiming done: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`, plus exercise the affected flow against the dev server (login via `/api/auth/callback/credentials` with csrf token; check role-gated routes and API status codes). The user approves each work phase before the next — ask before expanding scope.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
