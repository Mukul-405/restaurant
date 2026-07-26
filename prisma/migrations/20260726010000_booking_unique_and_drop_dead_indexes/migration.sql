-- Dead: checkIn/checkOut are only ever written, never filtered. Availability
-- comes from Aiosell, not from this table.
DROP INDEX IF EXISTS "UserRoomBooking_checkIn_checkOut_idx";

-- Dead: the only WHERE on status pairs it with a guestPhone equality
-- (order.service.ts transferToRoom), and guestPhone wins the plan. A 4-value
-- enum is too unselective for a standalone btree.
DROP INDEX IF EXISTS "UserRoomBooking_status_idx";

-- Promote (channel, bookingId) from a plain index to a unique constraint.
-- Same btree, no extra write cost, but it makes duplicate webhook deliveries
-- impossible at the DB level instead of relying on a read-then-write check.
--
-- FAILS IF DUPLICATES ALREADY EXIST. Check first:
--   SELECT channel, "bookingId", COUNT(*) FROM "UserRoomBooking"
--   GROUP BY channel, "bookingId" HAVING COUNT(*) > 1;
DROP INDEX IF EXISTS "UserRoomBooking_channel_bookingId_idx";
CREATE UNIQUE INDEX "UserRoomBooking_channel_bookingId_key"
  ON "UserRoomBooking"("channel", "bookingId");
