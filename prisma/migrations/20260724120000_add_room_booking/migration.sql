-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('RESERVED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('DIRECT', 'OTA');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'REFUNDED');

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "phoneNumber" DROP NOT NULL;

-- CreateTable
CREATE TABLE "RoomType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "roomCode" TEXT NOT NULL,
    "description" TEXT,
    "maxAdults" INTEGER NOT NULL,
    "maxChildren" INTEGER NOT NULL,
    "totalRooms" INTEGER NOT NULL,
    "basePrice" DECIMAL(10,2),
    "extraPersonAmount" DECIMAL(10,2) DEFAULT 0,
    "rateplanCodes" JSONB,
    "rooms" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRoomBooking" (
    "id" SERIAL NOT NULL,
    "bookingId" TEXT NOT NULL,
    "source" "BookingSource" NOT NULL,
    "channel" TEXT,
    "guestName" TEXT,
    "guestEmail" TEXT,
    "guestPhone" TEXT NOT NULL,
    "guestAddress" JSONB,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3) NOT NULL,
    "rooms" JSONB NOT NULL DEFAULT '[]',
    "foodOrders" JSONB NOT NULL DEFAULT '[]',
    "foodTotalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "commission" DECIMAL(10,2),
    "paymentStatus" "PaymentStatus" NOT NULL,
    "payAtHotel" BOOLEAN NOT NULL,
    "status" "BookingStatus" NOT NULL,
    "specialRequests" TEXT,
    "bookedOn" TIMESTAMP(3) NOT NULL,
    "webhookPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRoomBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoomType_roomCode_key" ON "RoomType"("roomCode");

-- CreateIndex
CREATE INDEX "RoomType_isActive_idx" ON "RoomType"("isActive");

-- CreateIndex
CREATE INDEX "UserRoomBooking_channel_bookingId_idx" ON "UserRoomBooking"("channel", "bookingId");

-- CreateIndex
CREATE INDEX "UserRoomBooking_status_idx" ON "UserRoomBooking"("status");

-- CreateIndex
CREATE INDEX "UserRoomBooking_guestPhone_idx" ON "UserRoomBooking"("guestPhone");

-- CreateIndex
CREATE INDEX "UserRoomBooking_source_idx" ON "UserRoomBooking"("source");

-- CreateIndex
CREATE INDEX "UserRoomBooking_checkIn_checkOut_idx" ON "UserRoomBooking"("checkIn", "checkOut");

-- CreateIndex
CREATE INDEX "UserRoomBooking_createdAt_idx" ON "UserRoomBooking"("createdAt" DESC);

