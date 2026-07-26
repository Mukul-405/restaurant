-- Kept in its own migration: PostgreSQL will not let a newly added enum value be
-- referenced by the same transaction that added it.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPERADMIN';
