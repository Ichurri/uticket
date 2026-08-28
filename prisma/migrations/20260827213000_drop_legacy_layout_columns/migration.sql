-- Splits the layout into a physical layer (Venue → Floor → Zone → Table|Seat)
-- and a commercial one (EventZone → EventTable|EventSeat), then drops the
-- legacy columns.
--
-- The data migration lives HERE, in SQL, and not in a separate script run in
-- between. Two reasons, both found the hard way:
--   1. `prisma migrate deploy` (what CI and Vercel run) applies every pending
--      migration back to back. There is no window to run anything in between,
--      and a migration that assumes one leaves the database with a failed
--      migration that blocks every later deploy.
--   2. A TypeScript script would need a Prisma client generated from the
--      *transitional* schema. Once the client is regenerated for the final
--      schema — which happens on every build — that script can no longer run
--      at all.
--
-- Everything below is idempotent and ordered: build the new rows, point the
-- orders and tickets at them, and only then drop the old columns.

-- ─────────────────── 1. Floors: every venue gets a ground floor ───────────

INSERT INTO "Floor" ("id", "venueId", "name", "order")
SELECT 'floor_' || v."id", v."id", 'Planta baja', 0
FROM "Venue" v
WHERE EXISTS (SELECT 1 FROM "Zone" z WHERE z."venueId" = v."id" AND z."floorId" IS NULL)
  AND NOT EXISTS (SELECT 1 FROM "Floor" f WHERE f."venueId" = v."id" AND f."name" = 'Planta baja');

UPDATE "Zone" z
SET "floorId" = f."id"
FROM "Floor" f
WHERE z."floorId" IS NULL AND f."venueId" = z."venueId" AND f."name" = 'Planta baja';

-- Zones whose venue vanished are unreachable already
DELETE FROM "Zone" WHERE "floorId" IS NULL;

-- ─────────────────── 2. Zone kind → type, plus grid geometry ──────────────

UPDATE "Zone" SET "type" =
  CASE "kind"
    WHEN 'NUMBERED' THEN 'SEATED'::"ZoneType"
    WHEN 'LOUNGE'   THEN 'TABLES'::"ZoneType"
    ELSE 'GENERAL'::"ZoneType"
  END
WHERE "kind" IS NOT NULL;

-- Capacity is a headcount only for GENERAL zones now
UPDATE "Zone" SET "capacity" = NULL WHERE "type" <> 'GENERAL';

-- Lay the zones out on a 4-per-row grid inside their floor
WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "floorId" ORDER BY "name") - 1 AS idx
  FROM "Zone"
)
UPDATE "Zone" z
SET "posX" = (o.idx % 4) * 220,
    "posY" = (o.idx / 4) * 170,
    "order" = o.idx::int
FROM ordered o
WHERE o."id" = z."id";

-- ─────────────────── 3. Lounges become tables ─────────────────────────────

INSERT INTO "Table" ("id", "zoneId", "label", "seats", "shape", "posX", "posY")
SELECT
  'tbl_' || l."id",
  l."zoneId",
  l."name",
  l."capacity",
  'ROUND'::"TableShape",
  20 + ((ROW_NUMBER() OVER (PARTITION BY l."zoneId" ORDER BY l."name") - 1) % 3) * 80,
  20 + ((ROW_NUMBER() OVER (PARTITION BY l."zoneId" ORDER BY l."name") - 1) / 3) * 80
FROM "Lounge" l
ON CONFLICT ("zoneId", "label") DO NOTHING;

-- ─────────────────── 4. Seats get a position ──────────────────────────────

WITH placed AS (
  SELECT "id",
         "number",
         DENSE_RANK() OVER (PARTITION BY "zoneId" ORDER BY "row") - 1 AS row_index
  FROM "Seat"
)
UPDATE "Seat" s
SET "posX" = 10 + (p."number" - 1) * 28,
    "posY" = 10 + p.row_index * 28
FROM placed p
WHERE p."id" = s."id";

-- ─────────────────── 5. Commercial layer: one EventZone per zone ──────────

INSERT INTO "EventZone" (
  "id", "eventId", "zoneId", "price", "capacityForSale", "isEnabled",
  "tableSaleMode", "defaultInclusionType"
)
SELECT
  'ez_' || md5(e."id" || ':' || z."id"),
  e."id",
  z."id",
  -- A lounge zone never priced itself: each lounge did, so the zone keeps the
  -- event's base price and each EventTable carries the real number.
  CASE WHEN z."kind" = 'LOUNGE'
       THEN COALESCE(e."price", 0)
       ELSE COALESCE(e."price", 0) * COALESCE(z."priceMultiplier", 1) END,
  CASE WHEN z."type" = 'GENERAL' THEN z."capacity" ELSE NULL END,
  TRUE,
  'WHOLE_TABLE'::"TableSaleMode",
  'NONE'::"InclusionType"
FROM "Event" e
JOIN "Floor" f ON f."venueId" = e."venueId"
JOIN "Zone" z ON z."floorId" = f."id"
ON CONFLICT ("eventId", "zoneId") DO NOTHING;

-- One EventTable per table, eagerly: tables come in dozens
INSERT INTO "EventTable" ("id", "eventZoneId", "tableId", "price", "status", "seatsSold")
SELECT
  'et_' || md5(ez."id" || ':' || t."id"),
  ez."id",
  t."id",
  COALESCE(ev."price", 0) * COALESCE(l."priceMultiplier", 1),
  'AVAILABLE'::"SaleStatus",
  0
FROM "EventZone" ez
JOIN "Event" ev ON ev."id" = ez."eventId"
JOIN "Table" t ON t."zoneId" = ez."zoneId"
LEFT JOIN "Lounge" l ON 'tbl_' || l."id" = t."id"
ON CONFLICT ("eventZoneId", "tableId") DO NOTHING;

-- ─────────────────── 6. Point order items at the commercial rows ──────────
-- Every item, live or not: a cancelled order holds nothing, but its history
-- still has to name the zone it bought.

UPDATE "OrderItem" oi
SET "eventZoneId" = ez."id"
FROM "Order" o
JOIN "EventZone" ez ON ez."eventId" = o."eventId"
WHERE oi."orderId" = o."id"
  AND oi."eventZoneId" IS NULL
  AND ez."zoneId" = COALESCE(
        oi."zoneId",
        (SELECT s."zoneId" FROM "Seat" s WHERE s."id" = oi."seatId"),
        (SELECT l."zoneId" FROM "Lounge" l WHERE l."id" = oi."loungeId")
      );

UPDATE "OrderItem" oi
SET "eventTableId" = et."id"
FROM "EventTable" et
WHERE oi."eventTableId" IS NULL
  AND oi."loungeId" IS NOT NULL
  AND et."eventZoneId" = oi."eventZoneId"
  AND et."tableId" = 'tbl_' || oi."loungeId";

-- EventSeat rows are lazy: one only exists once the seat is spoken for
INSERT INTO "EventSeat" ("id", "eventZoneId", "seatId", "status", "heldUntil")
SELECT DISTINCT ON (oi."eventZoneId", oi."seatId")
  'es_' || md5(oi."eventZoneId" || ':' || oi."seatId"),
  oi."eventZoneId",
  oi."seatId",
  CASE WHEN o."status" = 'CONFIRMED' THEN 'SOLD'::"SaleStatus"
       WHEN o."status" IN ('PENDING_PAYMENT','PAYMENT_SUBMITTED') THEN 'HELD'::"SaleStatus"
       ELSE 'AVAILABLE'::"SaleStatus" END,
  CASE WHEN o."status" IN ('PENDING_PAYMENT','PAYMENT_SUBMITTED') THEN o."expiresAt" ELSE NULL END
FROM "OrderItem" oi
JOIN "Order" o ON o."id" = oi."orderId"
WHERE oi."seatId" IS NOT NULL AND oi."eventZoneId" IS NOT NULL
ORDER BY oi."eventZoneId", oi."seatId",
         CASE o."status" WHEN 'CONFIRMED' THEN 0 WHEN 'PAYMENT_SUBMITTED' THEN 1
                         WHEN 'PENDING_PAYMENT' THEN 2 ELSE 3 END
ON CONFLICT ("eventZoneId", "seatId") DO NOTHING;

UPDATE "OrderItem" oi
SET "eventSeatId" = es."id"
FROM "EventSeat" es
WHERE oi."eventSeatId" IS NULL
  AND oi."seatId" IS NOT NULL
  AND es."eventZoneId" = oi."eventZoneId"
  AND es."seatId" = oi."seatId";

-- Tables held or sold by a live order
UPDATE "EventTable" et
SET "status" = CASE WHEN o."status" = 'CONFIRMED' THEN 'SOLD'::"SaleStatus"
                    ELSE 'HELD'::"SaleStatus" END,
    "heldUntil" = CASE WHEN o."status" = 'CONFIRMED' THEN NULL ELSE o."expiresAt" END
FROM "OrderItem" oi
JOIN "Order" o ON o."id" = oi."orderId"
WHERE oi."eventTableId" = et."id"
  AND o."status" IN ('PENDING_PAYMENT','PAYMENT_SUBMITTED','CONFIRMED');

-- ─────────────────── 7. Freeze each ticket's wording ──────────────────────
-- From here on the layout is editable between events, so a renamed or deleted
-- zone must not break a ticket that was already sold.

UPDATE "Ticket" t
SET "eventZoneId" = ez."id"
FROM "EventZone" ez
WHERE t."eventZoneId" IS NULL
  AND ez."eventId" = t."eventId"
  AND ez."zoneId" = COALESCE(
        t."zoneId",
        (SELECT s."zoneId" FROM "Seat" s WHERE s."id" = t."seatId"),
        (SELECT l."zoneId" FROM "Lounge" l WHERE l."id" = t."loungeId")
      );

UPDATE "Ticket" t
SET "eventTableId" = et."id"
FROM "EventTable" et
WHERE t."eventTableId" IS NULL AND t."loungeId" IS NOT NULL
  AND et."eventZoneId" = t."eventZoneId" AND et."tableId" = 'tbl_' || t."loungeId";

UPDATE "Ticket" t
SET "eventSeatId" = es."id"
FROM "EventSeat" es
WHERE t."eventSeatId" IS NULL AND t."seatId" IS NOT NULL
  AND es."eventZoneId" = t."eventZoneId" AND es."seatId" = t."seatId";

-- Postgres will not let the UPDATE target be joined inside its own FROM, so
-- the snapshot is assembled in a CTE first.
WITH snapshot AS (
  SELECT
    t."id",
    v."name" AS venue_name,
    f."name" AS floor_name,
    z."name" AS zone_name,
    l."name" AS table_label,
    CASE WHEN s."id" IS NOT NULL THEN s."row" || s."number"::text END AS seat_label,
    (
      SELECT oi."unitPrice" FROM "OrderItem" oi
      WHERE oi."orderId" = t."orderId"
        AND (
          (t."seatId" IS NOT NULL AND oi."seatId" = t."seatId")
          OR (t."loungeId" IS NOT NULL AND oi."loungeId" = t."loungeId")
          OR (t."seatId" IS NULL AND t."loungeId" IS NULL AND oi."zoneId" = t."zoneId")
        )
      LIMIT 1
    ) AS price_at_purchase
  FROM "Ticket" t
  JOIN "Event" e ON e."id" = t."eventId"
  JOIN "Venue" v ON v."id" = e."venueId"
  LEFT JOIN "Zone" z ON z."id" = t."zoneId"
  LEFT JOIN "Floor" f ON f."id" = z."floorId"
  LEFT JOIN "Lounge" l ON l."id" = t."loungeId"
  LEFT JOIN "Seat" s ON s."id" = t."seatId"
  WHERE t."venueName" IS NULL
)
UPDATE "Ticket" t
SET "venueName" = snapshot.venue_name,
    "floorName" = snapshot.floor_name,
    "zoneName" = snapshot.zone_name,
    "tableLabel" = snapshot.table_label,
    "seatLabel" = snapshot.seat_label,
    "priceAtPurchase" = snapshot.price_at_purchase
FROM snapshot
WHERE snapshot."id" = t."id";

-- ─────────────────── 8. Only now, drop the legacy columns ────────────────

-- DropForeignKey
ALTER TABLE "Lounge" DROP CONSTRAINT "Lounge_zoneId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_loungeId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_seatId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_zoneId_fkey";

-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_loungeId_fkey";

-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_seatId_fkey";

-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_zoneId_fkey";

-- DropForeignKey
ALTER TABLE "Zone" DROP CONSTRAINT "Zone_venueId_fkey";

-- DropIndex
DROP INDEX "OrderItem_loungeId_idx";

-- DropIndex
DROP INDEX "OrderItem_seatId_idx";

-- DropIndex
DROP INDEX "OrderItem_zoneId_idx";

-- DropIndex
DROP INDEX "Ticket_loungeId_idx";

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "price";

-- AlterTable
ALTER TABLE "OrderItem" DROP COLUMN "loungeId",
DROP COLUMN "seatId",
DROP COLUMN "zoneId";

-- AlterTable
ALTER TABLE "Ticket" DROP COLUMN "loungeId",
DROP COLUMN "seatId",
DROP COLUMN "zoneId";

-- AlterTable
ALTER TABLE "Venue" DROP COLUMN "capacity",
DROP COLUMN "seatMapType";

-- AlterTable
ALTER TABLE "Zone" DROP COLUMN "kind",
DROP COLUMN "priceMultiplier",
DROP COLUMN "rows",
DROP COLUMN "seatsPerRow",
DROP COLUMN "venueId",
ALTER COLUMN "floorId" SET NOT NULL;

-- DropTable
DROP TABLE "Lounge";

-- DropEnum
DROP TYPE "SeatMapType";

-- DropEnum
DROP TYPE "ZoneKind";

