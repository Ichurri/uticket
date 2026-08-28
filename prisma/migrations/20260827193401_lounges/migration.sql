-- CreateEnum
CREATE TYPE "ZoneKind" AS ENUM ('NUMBERED', 'FREE', 'LOUNGE');

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "loungeId" TEXT;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "loungeId" TEXT;

-- AlterTable
ALTER TABLE "Zone" ADD COLUMN     "kind" "ZoneKind" NOT NULL DEFAULT 'FREE';

-- Backfill: the kind used to be sniffed from `rows` (not null => numbered).
-- The DEFAULT above already covers free-capacity zones; only the numbered
-- ones need correcting, or every existing seat map would read as free
-- capacity and its seats would stop being sellable.
UPDATE "Zone" SET "kind" = 'NUMBERED' WHERE "rows" IS NOT NULL;

-- CreateTable
CREATE TABLE "Lounge" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "priceMultiplier" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "zoneId" TEXT NOT NULL,

    CONSTRAINT "Lounge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lounge_zoneId_name_key" ON "Lounge"("zoneId", "name");

-- CreateIndex
CREATE INDEX "OrderItem_loungeId_idx" ON "OrderItem"("loungeId");

-- CreateIndex
CREATE INDEX "Ticket_loungeId_idx" ON "Ticket"("loungeId");

-- AddForeignKey
ALTER TABLE "Lounge" ADD CONSTRAINT "Lounge_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_loungeId_fkey" FOREIGN KEY ("loungeId") REFERENCES "Lounge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_loungeId_fkey" FOREIGN KEY ("loungeId") REFERENCES "Lounge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
