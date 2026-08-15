-- DropIndex
DROP INDEX IF EXISTS "Order_userId_createdAt_idx";
DROP INDEX IF EXISTS "Order_phoneNumber_createdAt_idx";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN IF EXISTS "phoneNumber";
