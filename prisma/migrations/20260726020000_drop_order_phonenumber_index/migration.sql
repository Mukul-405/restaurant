-- Dead: the only read of Order.phoneNumber is findOrders, which uses
-- { contains, mode: 'insensitive' } -> ILIKE '%x%'. A leading wildcard makes a
-- plain btree unusable, so Postgres never picks this index. Everything else
-- only writes the column.
--
-- If that search ever needs to be fast, the replacement is pg_trgm + GIN, not
-- this btree.
DROP INDEX IF EXISTS "Order_phoneNumber_idx";
