-- Seat occupancy becomes per EVENT instead of per venue.
--
-- A venue's seats are shared by every event held there, so a global
-- `Seat.status` made one event's sales block all the others at the same
-- venue. Availability is now derived from the order items of each event's
-- live orders (src/lib/seats.ts) — the same rule free-capacity zones
-- already used — so the column and its enum are dropped.
--
-- Nothing to back up: the statuses being dropped are reconstructible (and
-- more accurate) from the OrderItem/Order rows that caused them, and any
-- value that ISN'T reconstructible was orphaned inventory — seats stuck in
-- RESERVED/SOLD with no live order behind them, which this change fixes.

-- AlterTable
ALTER TABLE "Seat" DROP COLUMN "status";

-- DropEnum
DROP TYPE "SeatStatus";

-- CreateIndex: availability now filters OrderItem by seat/zone on every read
CREATE INDEX "OrderItem_seatId_idx" ON "OrderItem"("seatId");

-- CreateIndex
CREATE INDEX "OrderItem_zoneId_idx" ON "OrderItem"("zoneId");
