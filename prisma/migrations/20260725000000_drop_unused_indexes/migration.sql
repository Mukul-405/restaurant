-- Redundant: the @unique on User.phoneNumber already builds a btree on that column.
DROP INDEX IF EXISTS "User_phoneNumber_idx";

-- Dead: UserRoomBooking.source is only ever written (booking.service.ts, cm.service.ts).
-- No query filters on it, and the enum has 2 values so Postgres would not use the
-- index even if one did.
DROP INDEX IF EXISTS "UserRoomBooking_source_idx";
