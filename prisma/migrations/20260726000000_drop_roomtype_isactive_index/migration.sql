-- Dead: RoomType.isActive is only written (roomType.controller.ts) and rendered
-- (room-manage page badge). No query filters on it, and a boolean has 2 values
-- so Postgres would ignore a plain btree on it anyway.
DROP INDEX IF EXISTS "RoomType_isActive_idx";
