import { prisma } from '../config/prisma';
import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import { roomTypeService } from './roomType.service';
import { cmService } from './cm.service';
import { logger } from '../config/logger';

const BOOKING_ID_HEX_LEN = 12; // 48 random bits (UUID's first 12 hex chars, no fixed version nibble in range)
const MAX_BOOKING_ID_ATTEMPTS = 5;

function generateBookingId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, BOOKING_ID_HEX_LEN).toUpperCase();
}

// Locks the given RoomTypes' rows for the rest of the transaction so a concurrent
// transaction touching the same roomCode blocks until this one commits, instead of
// both reading the same stale `rooms` array and one write clobbering the other.
// Sorting roomCodes before locking keeps lock-acquisition order consistent across
// callers (checkIn/checkOut/editBookingRooms), which avoids deadlocks between two
// transactions that lock overlapping room types in different orders.
async function lockRoomsForUpdate(
  tx: Prisma.TransactionClient,
  roomCodes: string[]
): Promise<Record<string, any[]>> {
  if (roomCodes.length === 0) return {};
  const sorted = [...roomCodes].sort();
  const rows = await tx.$queryRaw<Array<{ roomCode: string; rooms: any }>>`
    SELECT "roomCode", "rooms" FROM "RoomType"
    WHERE "roomCode" = ANY(${sorted})
    ORDER BY "roomCode" ASC
    FOR UPDATE`;
  return Object.fromEntries(rows.map(r => [r.roomCode, Array.isArray(r.rooms) ? r.rooms : []]));
}

export class BookingService {

  async createBooking(data: any) {
    let totalAmount = 0;

    const checkInDate = new Date(data.checkIn);
    const checkOutDate = new Date(data.checkOut);
    const checkOutMinusOne = new Date(checkOutDate.getTime() - 24 * 60 * 60 * 1000);
    const endDateStr = checkOutMinusOne.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    // Fetch dynamic availability to validate
    const availability = await roomTypeService.getAvailability(data.checkIn, endDateStr);

    // Fetch unique room types once to avoid N+1 queries
    const uniqueRoomCodes = [...new Set(data.rooms.map((r: any) => r.roomCode))] as string[];
    const roomTypes = await prisma.roomType.findMany({
      where: { roomCode: { in: uniqueRoomCodes } }
    });
    const roomTypeMap = Object.fromEntries(roomTypes.map(rt => [rt.roomCode, rt]));

    // First pass: Calculate amounts, validate room availability
    const requestedCounts: Record<string, number> = {};
    for (const room of data.rooms) {
      const roomType = roomTypeMap[room.roomCode];
      if (!roomType) throw new Error(`RoomType ${room.roomCode} not found`);

      if (roomType.rateplanCodes) {
        const ratePlans = roomType.rateplanCodes as any[];
        const plan = ratePlans.find(rp => rp.code === room.rateplanCode);
        if (plan) totalAmount += Number(plan.price);
      }

      requestedCounts[room.roomCode] = (requestedCounts[room.roomCode] || 0) + 1;
    }

    for (const roomCode of Object.keys(requestedCounts)) {
      const avail = availability[roomCode];
      if (avail === undefined || requestedCounts[roomCode] > avail) {
        throw new Error(`Not enough rooms available for ${roomCode}`);
      }
    }

    // Second pass: Create Booking and nested BookingRooms.
    // bookingId collides at random (48 bits, not zero); on that one-in-a-
    // trillion event, regenerate and retry rather than fail the guest's booking.
    let booking;
    for (let attempt = 1; ; attempt++) {
      try {
        booking = await prisma.userRoomBooking.create({
          data: {
            bookingId: generateBookingId(),
            guestName: data.guestName,
            guestEmail: data.guestEmail,
            guestPhone: data.guestPhone,
            checkIn: checkInDate,
            checkOut: checkOutDate,
            specialRequests: data.specialRequests,
            source: data.source,
            channel: 'Sunrise Resorts',
            paymentStatus: 'PENDING',
            payAtHotel: true,
            status: 'RESERVED' as any,
            totalAmount: totalAmount,
            bookedOn: new Date(),
            rooms: data.rooms
          }
        });
        break;
      } catch (err: any) {
        if (err.code === 'P2002' && attempt < MAX_BOOKING_ID_ATTEMPTS) continue;
        throw err;
      }
    }

    // Synchronously push updated inventory to Aiosell to prevent double booking race condition
    try {
      const updates = [{
        startDate: data.checkIn,
        endDate: endDateStr,
        rooms: Object.keys(requestedCounts).map(roomCode => ({
          roomCode,
          available: Math.max(0, availability[roomCode] - requestedCounts[roomCode])
        }))
      }];
      await cmService.pushInventory(updates);
      logger.info({ bookingId: booking.id }, 'Channel manager inventory updated for booking');
    } catch (err) {
      logger.error({ err, bookingId: booking.id }, 'Failed to push inventory to channel manager during booking creation');
      throw new Error(`Booking created locally, but channel manager sync failed: ${(err as any)?.message || 'Unknown error'}`);
    }

    return booking;
  }

  async searchBookings(query: {
    phone?: string;
    status?: 'ALL' | 'RESERVED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED';
    date?: string;
    page: number;
    limit: number;
  }) {
    const { phone, status, date, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (phone?.trim()) {
      const trimmed = phone.trim();
      where.OR = [
        { guestPhone: { contains: trimmed, mode: 'insensitive' } },
        { guestName: { contains: trimmed, mode: 'insensitive' } }
      ];
    }

    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);

      where.checkIn = {
        gte: startDate,
        lte: endDate,
      };
    }

    const [total, data] = await prisma.$transaction([
      prisma.userRoomBooking.count({ where }),
      prisma.userRoomBooking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      })
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    };
  }

  async getBookingById(id: number) {
    const booking = await prisma.userRoomBooking.findUnique({
      where: { id }
    });
    if (!booking) throw new Error('Booking not found');
    return booking;
  }

  async checkInBooking(id: number, assignments: { roomCode: string, roomNumber: string }[]) {
    return prisma.$transaction(async (tx) => {
      const booking = await tx.userRoomBooking.findUnique({
        where: { id }
      });

      if (!booking) throw new Error('Booking not found');
      if (booking.status !== 'RESERVED') throw new Error(`Booking status is ${booking.status}. Only RESERVED bookings can be checked in.`);

      // Validate assignments
      const uniqueRoomCodes = [...new Set(assignments.map(a => a.roomCode))] as string[];
      const roomUpdates = await lockRoomsForUpdate(tx, uniqueRoomCodes);

      for (const assignment of assignments) {
        if (!roomUpdates[assignment.roomCode]) {
          throw new Error(`RoomType ${assignment.roomCode} not found`);
        }

        const physicalRooms = roomUpdates[assignment.roomCode];
        const roomIndex = physicalRooms.findIndex(r => r.roomNumber === assignment.roomNumber);

        if (roomIndex === -1) {
          throw new Error(`Physical room ${assignment.roomNumber} does not exist in type ${assignment.roomCode}`);
        }

        if (physicalRooms[roomIndex].status !== 'no status') {
          throw new Error(`Room ${assignment.roomNumber} is currently occupied or unavailable (status: ${physicalRooms[roomIndex].status})`);
        }

        physicalRooms[roomIndex].status = 'checked in';
        physicalRooms[roomIndex].userRoomBookingId = booking.id;
      }

      // Update the booking JSON
      const bookingRooms = (booking.rooms as any[]) || [];
      const updatedBookingRooms = bookingRooms.map(br => {
        // Find if this room needs an assignment
        if (!br.roomNumber) {
          const assignmentIndex = assignments.findIndex(a => a.roomCode === br.roomCode);
          if (assignmentIndex !== -1) {
            const assignment = assignments[assignmentIndex];
            assignments.splice(assignmentIndex, 1); // consume the assignment
            return { ...br, roomNumber: assignment.roomNumber };
          }
        }
        return br;
      });

      // Commit changes
      for (const [roomCode, updatedRooms] of Object.entries(roomUpdates)) {
        await tx.roomType.update({
          where: { roomCode },
          data: { rooms: updatedRooms }
        });
      }

      const updatedBooking = await tx.userRoomBooking.update({
        where: { id },
        data: {
          status: 'CHECKED_IN',
          rooms: updatedBookingRooms
        }
      });

      return updatedBooking;
    });
  }

  async checkOutBooking(id: number, roomDiscountAmount: number = 0, foodDiscountAmount: number = 0) {
    const physicalTotals: Record<string, number> = {};

    const updatedBooking = await prisma.$transaction(async (tx) => {
      const booking = await tx.userRoomBooking.findUnique({
        where: { id }
      });

      if (!booking) throw new Error('Booking not found');
      if (booking.status !== 'CHECKED_IN') throw new Error(`Booking status is ${booking.status}. Only CHECKED_IN bookings can be checked out.`);

      // Smartly find which RoomTypes this booking is associated with
      const bookingRooms = (booking.rooms as any[]) || [];
      const roomCodes = Array.from(new Set(bookingRooms.map(r => r.roomCode).filter(Boolean))) as string[];
      const roomUpdates = await lockRoomsForUpdate(tx, roomCodes);

      for (const [roomCode, physicalRooms] of Object.entries(roomUpdates)) {
        physicalTotals[roomCode] = physicalRooms.length;
        let updated = false;

        for (const room of physicalRooms) {
          if (room.userRoomBookingId === id) {
            room.status = 'no status';
            room.userRoomBookingId = null;
            updated = true;
          }
        }

        if (updated) {
          await tx.roomType.update({
            where: { roomCode },
            data: { rooms: physicalRooms }
          });
        }
      }

      const updated = await tx.userRoomBooking.update({
        where: { id },
        data: {
          status: 'CHECKED_OUT',
          roomDiscountAmount,
          foodDiscountAmount
        }
      });

      return updated;
    });

    try {
      await this.releaseEarlyCheckoutInventory(updatedBooking, physicalTotals);
    } catch (err) {
      logger.error({ err, bookingId: id }, 'Failed to release early checkout inventory in channel manager');
    }

    return updatedBooking;
  }

  private async releaseEarlyCheckoutInventory(
    booking: any,
    physicalTotals: Record<string, number>
  ) {
    // Format dates to IST explicitly
    const toYMD_IST = (d: Date) => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(d);

      const year = parts.find(p => p.type === 'year')?.value;
      const month = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;

      return `${year}-${month}-${day}`;
    };

    const today = new Date();
    const checkOut = new Date(booking.checkOut);

    const startDateStr = toYMD_IST(today);
    const checkOutDateStr = toYMD_IST(checkOut);

    // Not an early checkout -> no future nights freed.
    if (startDateStr >= checkOutDateStr) return;

    // Count how many rooms of each type this booking frees.
    const freedCounts: Record<string, number> = {};
    for (const r of (booking.rooms as any[]) || []) {
      if (r.roomCode) freedCounts[r.roomCode] = (freedCounts[r.roomCode] || 0) + 1;
    }
    if (Object.keys(freedCounts).length === 0) return;

    const startDate = startDateStr;
    // End date is one day before checkout (checkout date itself is not a night stayed)
    const checkOutMinusOne = new Date(checkOut.getTime() - 24 * 60 * 60 * 1000);
    const endDate = toYMD_IST(checkOutMinusOne);

    // ponytail: reuses the min-across-range availability pattern from createBooking;
    // a per-date push would be exact but Aiosell inventory pushes are range upserts
    // and the create path already accepts this approximation. Upgrade to per-date if
    // availability varies materially within the freed window.
    const availability = await roomTypeService.getAvailability(startDate, endDate);
    const rooms = Object.keys(freedCounts).map(roomCode => {
      const current = availability[roomCode] ?? 0;
      const cap = physicalTotals[roomCode] ?? current + freedCounts[roomCode];
      return { roomCode, available: Math.min(current + freedCounts[roomCode], cap) };
    });

    await cmService.pushInventory([{ startDate, endDate, rooms }]);
  }

  async cancelBooking(id: number) {
    const physicalTotals: Record<string, number> = {};

    const updatedBooking = await prisma.$transaction(async (tx) => {
      const booking = await tx.userRoomBooking.findUnique({
        where: { id }
      });

      if (!booking) throw new Error('Booking not found');
      if (booking.status !== 'RESERVED') throw new Error(`Booking status is ${booking.status}. Only RESERVED bookings can be cancelled.`);

      // Since the booking was RESERVED, physical rooms are likely not assigned yet.
      // But we still need physicalTotals to cap the inventory push.
      const bookingRooms = (booking.rooms as any[]) || [];
      const roomCodes = Array.from(new Set(bookingRooms.map(r => r.roomCode).filter(Boolean))) as string[];

      const roomTypes = await tx.roomType.findMany({
        where: { roomCode: { in: roomCodes } }
      });

      for (const rt of roomTypes) {
        physicalTotals[rt.roomCode] = Array.isArray(rt.rooms) ? rt.rooms.length : 0;
      }

      const updated = await tx.userRoomBooking.update({
        where: { id },
        data: { status: 'CANCELLED' as any }
      });

      return updated;
    });

    try {
      await this.releaseCancelledInventory(updatedBooking, physicalTotals);
    } catch (err) {
      logger.error({ err, bookingId: id }, 'Failed to release cancelled inventory in channel manager');
    }

    return updatedBooking;
  }

  private async releaseCancelledInventory(
    booking: any,
    physicalTotals: Record<string, number>
  ) {
    const toYMD_IST = (d: Date) => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(d);

      const year = parts.find(p => p.type === 'year')?.value;
      const month = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;

      return `${year}-${month}-${day}`;
    };

    const checkIn = new Date(booking.checkIn);
    const checkOut = new Date(booking.checkOut);

    const startDateStr = toYMD_IST(checkIn);
    const checkOutMinusOne = new Date(checkOut.getTime() - 24 * 60 * 60 * 1000);
    const endDateStr = toYMD_IST(checkOutMinusOne);

    if (startDateStr > endDateStr) return; // Edge case (0 night stay)

    const freedCounts: Record<string, number> = {};
    for (const r of (booking.rooms as any[]) || []) {
      if (r.roomCode) freedCounts[r.roomCode] = (freedCounts[r.roomCode] || 0) + 1;
    }
    if (Object.keys(freedCounts).length === 0) return;

    // Fetch current availability from Aiosell
    const availability = await roomTypeService.getAvailability(startDateStr, endDateStr);
    const rooms = Object.keys(freedCounts).map(roomCode => {
      const current = availability[roomCode] ?? 0;
      const cap = physicalTotals[roomCode] ?? current + freedCounts[roomCode];
      return { roomCode, available: Math.min(current + freedCounts[roomCode], cap) };
    });

    await cmService.pushInventory([{ startDate: startDateStr, endDate: endDateStr, rooms }]);
  }

  async editBookingRooms(id: number, assignments: { roomCode: string, roomNumber: string }[]) {
    return prisma.$transaction(async (tx) => {
      const booking = await tx.userRoomBooking.findUnique({
        where: { id }
      });

      if (!booking) throw new Error('Booking not found');
      if (booking.status !== 'CHECKED_IN') throw new Error(`Booking status is ${booking.status}. Only CHECKED_IN bookings can be edited.`);

      const bookingRooms = (booking.rooms as any[]) || [];

      // Fetch all required room types (old and new) in one query
      const oldRoomCodes = Array.from(new Set(bookingRooms.map(r => r.roomCode).filter(Boolean))) as string[];
      const newRoomCodes = Array.from(new Set(assignments.map(a => a.roomCode))) as string[];
      const allRoomCodes = Array.from(new Set([...oldRoomCodes, ...newRoomCodes]));

      const roomUpdates = await lockRoomsForUpdate(tx, allRoomCodes);

      // Step 1: Free up all currently assigned physical rooms
      for (const roomCode of oldRoomCodes) {
        if (roomUpdates[roomCode]) {
          for (const room of roomUpdates[roomCode]) {
            if (room.userRoomBookingId === id) {
              room.status = 'no status';
              room.userRoomBookingId = null;
            }
          }
        }
      }

      // Step 2: Validate and assign the new physical rooms
      for (const assignment of assignments) {
        if (!roomUpdates[assignment.roomCode]) {
          throw new Error(`RoomType ${assignment.roomCode} not found`);
        }

        const physicalRooms = roomUpdates[assignment.roomCode];
        const roomIndex = physicalRooms.findIndex(r => r.roomNumber === assignment.roomNumber);

        if (roomIndex === -1) {
          throw new Error(`Physical room ${assignment.roomNumber} does not exist in type ${assignment.roomCode}`);
        }

        if (physicalRooms[roomIndex].status !== 'no status') {
          throw new Error(`Room ${assignment.roomNumber} is currently occupied or unavailable (status: ${physicalRooms[roomIndex].status})`);
        }

        physicalRooms[roomIndex].status = 'checked in';
        physicalRooms[roomIndex].userRoomBookingId = id;
      }

      // Step 3: Update the booking JSON
      // We will map over the existing bookingRooms and update the roomNumbers in order.
      const updatedBookingRooms = bookingRooms.map(br => {
        const assignmentIndex = assignments.findIndex(a => a.roomCode === br.roomCode);
        if (assignmentIndex !== -1) {
          const assignment = assignments[assignmentIndex];
          assignments.splice(assignmentIndex, 1); // consume the assignment so duplicates are handled
          return { ...br, roomNumber: assignment.roomNumber };
        }
        return br;
      });

      // Step 4: Commit changes
      for (const [roomCode, updatedRooms] of Object.entries(roomUpdates)) {
        await tx.roomType.update({
          where: { roomCode },
          data: { rooms: updatedRooms }
        });
      }

      const updatedBooking = await tx.userRoomBooking.update({
        where: { id },
        data: {
          rooms: updatedBookingRooms
        }
      });

      return updatedBooking;
    });
  }
  async extendCheckoutDate(id: number, newCheckOut: string) {
    return prisma.$transaction(async (tx) => {
      const booking = await tx.userRoomBooking.findUnique({
        where: { id }
      });

      if (!booking) throw new Error('Booking not found');
      if (booking.status !== 'CHECKED_IN') throw new Error(`Booking status is ${booking.status}. Only CHECKED_IN bookings can be extended.`);

      const oldCheckOutDate = new Date(booking.checkOut);
      const newCheckOutDateObj = new Date(newCheckOut);
      
      // Zero out times for date comparison
      const oldDate = new Date(oldCheckOutDate);
      oldDate.setHours(0, 0, 0, 0);
      const newDate = new Date(newCheckOutDateObj);
      newDate.setHours(0, 0, 0, 0);

      if (newDate <= oldDate) {
        throw new Error('New checkout date must be greater than the current checkout date.');
      }

      // We need inventory from old checkout date up to new checkout date - 1 day
      // Example: old checkout 24th, new checkout 26th. Needs inventory for 24th and 25th.
      const toYMD_IST = (d: Date) => {
        return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      };

      const startDateStr = toYMD_IST(oldDate);
      const newCheckOutMinusOne = new Date(newDate.getTime() - 24 * 60 * 60 * 1000);
      const endDateStr = toYMD_IST(newCheckOutMinusOne);

      // Calculate room counts required
      const requestedCounts: Record<string, number> = {};
      const bookingRooms = (booking.rooms as any[]) || [];
      for (const room of bookingRooms) {
        if (room.roomCode) {
          requestedCounts[room.roomCode] = (requestedCounts[room.roomCode] || 0) + 1;
        }
      }

      // Check availability using roomTypeService
      const availability = await roomTypeService.getAvailability(startDateStr, endDateStr);
      for (const roomCode of Object.keys(requestedCounts)) {
        const avail = availability[roomCode];
        if (avail === undefined || requestedCounts[roomCode] > avail) {
          throw new Error(`Not enough rooms available for ${roomCode} on extended dates`);
        }
      }

      // Calculate new total amount based on extra nights and rateplans
      const extraNights = Math.round((newDate.getTime() - oldDate.getTime()) / (1000 * 60 * 60 * 24));
      
      const uniqueRoomCodes = Object.keys(requestedCounts);
      const roomTypes = await tx.roomType.findMany({
        where: { roomCode: { in: uniqueRoomCodes } }
      });
      const roomTypeMap = Object.fromEntries(roomTypes.map(rt => [rt.roomCode, rt]));

      let extraAmount = 0;
      for (const room of bookingRooms) {
        const roomType = roomTypeMap[room.roomCode];
        if (roomType && roomType.rateplanCodes) {
          const ratePlans = roomType.rateplanCodes as any[];
          const plan = ratePlans.find(rp => rp.code === room.rateplanCode);
          if (plan) {
            extraAmount += Number(plan.price) * extraNights;
          }
        }
      }

      // Update booking
      const updatedBooking = await tx.userRoomBooking.update({
        where: { id },
        data: {
          checkOut: newCheckOutDateObj,
          totalAmount: { increment: extraAmount }
        }
      });

      return updatedBooking;
    });
  }
}

export const bookingService = new BookingService();
