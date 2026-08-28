-- CreateEnum
CREATE TYPE "ZoneType" AS ENUM ('GENERAL', 'TABLES', 'SEATED');

-- CreateEnum
CREATE TYPE "TableShape" AS ENUM ('ROUND', 'SQUARE', 'RECT');

-- CreateEnum
CREATE TYPE "TableSaleMode" AS ENUM ('WHOLE_TABLE', 'PER_SEAT');

-- CreateEnum
CREATE TYPE "InclusionType" AS ENUM ('NONE', 'ENTRY_ONLY', 'CONSUMPTION_CREDIT', 'BOTTLE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('AVAILABLE', 'HELD', 'SOLD', 'BLOCKED');

-- DropForeignKey
ALTER TABLE "Venue" DROP CONSTRAINT "Venue_organizerId_fkey";

-- AlterTable
ALTER TABLE "Event" ALTER COLUMN "price" DROP NOT NULL;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "eventSeatId" TEXT,
ADD COLUMN     "eventTableId" TEXT,
ADD COLUMN     "eventZoneId" TEXT,
ADD COLUMN     "seatsQuantity" INTEGER;

-- AlterTable
ALTER TABLE "Seat" ADD COLUMN     "posX" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "posY" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "eventSeatId" TEXT,
ADD COLUMN     "eventTableId" TEXT,
ADD COLUMN     "eventZoneId" TEXT,
ADD COLUMN     "floorName" TEXT,
ADD COLUMN     "inclusionSummary" TEXT,
ADD COLUMN     "priceAtPurchase" DECIMAL(10,2),
ADD COLUMN     "seatLabel" TEXT,
ADD COLUMN     "tableLabel" TEXT,
ADD COLUMN     "venueName" TEXT,
ADD COLUMN     "zoneName" TEXT;

-- AlterTable
-- organizerId -> ownerId is a RENAME, not a drop + add: the generated
-- drop/add would discard every venue's owner and then fail on NOT NULL.
ALTER TABLE "Venue" RENAME COLUMN "organizerId" TO "ownerId";
ALTER TABLE "Venue"
ADD COLUMN     "coverImage" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "googleMapsUrl" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "capacity" DROP NOT NULL,
ALTER COLUMN "seatMapType" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Zone" ADD COLUMN     "color" TEXT NOT NULL DEFAULT '#6366f1',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "floorId" TEXT,
ADD COLUMN     "height" INTEGER NOT NULL DEFAULT 150,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "posX" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "posY" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rotation" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "type" "ZoneType" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "width" INTEGER NOT NULL DEFAULT 200,
ALTER COLUMN "capacity" DROP NOT NULL,
ALTER COLUMN "priceMultiplier" DROP NOT NULL,
ALTER COLUMN "priceMultiplier" DROP DEFAULT,
ALTER COLUMN "venueId" DROP NOT NULL,
ALTER COLUMN "kind" DROP NOT NULL,
ALTER COLUMN "kind" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Floor" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "canvasWidth" INTEGER NOT NULL DEFAULT 1000,
    "canvasHeight" INTEGER NOT NULL DEFAULT 700,
    "backgroundImage" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Table" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "shape" "TableShape" NOT NULL DEFAULT 'ROUND',
    "posX" INTEGER NOT NULL,
    "posY" INTEGER NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 60,
    "height" INTEGER NOT NULL DEFAULT 60,
    "rotation" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventZone" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "capacityForSale" INTEGER,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "salesStartAt" TIMESTAMP(3),
    "salesEndAt" TIMESTAMP(3),
    "tableSaleMode" "TableSaleMode" NOT NULL DEFAULT 'WHOLE_TABLE',
    "seatPrice" DECIMAL(10,2),
    "defaultInclusionType" "InclusionType" NOT NULL DEFAULT 'NONE',
    "defaultInclusionValue" DECIMAL(10,2),
    "defaultInclusionNote" TEXT,

    CONSTRAINT "EventZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTable" (
    "id" TEXT NOT NULL,
    "eventZoneId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "price" DECIMAL(10,2),
    "seatPrice" DECIMAL(10,2),
    "inclusionType" "InclusionType",
    "inclusionValue" DECIMAL(10,2),
    "inclusionNote" TEXT,
    "status" "SaleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "seatsSold" INTEGER NOT NULL DEFAULT 0,
    "heldUntil" TIMESTAMP(3),

    CONSTRAINT "EventTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSeat" (
    "id" TEXT NOT NULL,
    "eventZoneId" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "price" DECIMAL(10,2),
    "status" "SaleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "heldUntil" TIMESTAMP(3),

    CONSTRAINT "EventSeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Floor_venueId_name_key" ON "Floor"("venueId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Table_zoneId_label_key" ON "Table"("zoneId", "label");

-- CreateIndex
CREATE INDEX "EventZone_eventId_idx" ON "EventZone"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventZone_eventId_zoneId_key" ON "EventZone"("eventId", "zoneId");

-- CreateIndex
CREATE INDEX "EventTable_status_idx" ON "EventTable"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EventTable_eventZoneId_tableId_key" ON "EventTable"("eventZoneId", "tableId");

-- CreateIndex
CREATE INDEX "EventSeat_status_idx" ON "EventSeat"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EventSeat_eventZoneId_seatId_key" ON "EventSeat"("eventZoneId", "seatId");

-- CreateIndex
CREATE INDEX "OrderItem_eventZoneId_idx" ON "OrderItem"("eventZoneId");

-- CreateIndex
CREATE INDEX "OrderItem_eventTableId_idx" ON "OrderItem"("eventTableId");

-- CreateIndex
CREATE INDEX "OrderItem_eventSeatId_idx" ON "OrderItem"("eventSeatId");

-- CreateIndex
CREATE INDEX "Ticket_eventTableId_idx" ON "Ticket"("eventTableId");

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventZone" ADD CONSTRAINT "EventZone_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventZone" ADD CONSTRAINT "EventZone_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTable" ADD CONSTRAINT "EventTable_eventZoneId_fkey" FOREIGN KEY ("eventZoneId") REFERENCES "EventZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTable" ADD CONSTRAINT "EventTable_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSeat" ADD CONSTRAINT "EventSeat_eventZoneId_fkey" FOREIGN KEY ("eventZoneId") REFERENCES "EventZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSeat" ADD CONSTRAINT "EventSeat_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_eventZoneId_fkey" FOREIGN KEY ("eventZoneId") REFERENCES "EventZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_eventTableId_fkey" FOREIGN KEY ("eventTableId") REFERENCES "EventTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_eventSeatId_fkey" FOREIGN KEY ("eventSeatId") REFERENCES "EventSeat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_eventZoneId_fkey" FOREIGN KEY ("eventZoneId") REFERENCES "EventZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_eventTableId_fkey" FOREIGN KEY ("eventTableId") REFERENCES "EventTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_eventSeatId_fkey" FOREIGN KEY ("eventSeatId") REFERENCES "EventSeat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

