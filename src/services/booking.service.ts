import { prisma } from '../config/prisma';
import crypto from 'crypto';
import { roomTypeService } from './roomType.service';
import { cmService } from './cm.service';
import { logger } from '../config/logger';

const BOOKING_ID_HEX_LEN = 12; // 48 random bits (UUID's first 12 hex chars, no fixed version nibble in range)
const MAX_BOOKING_ID_ATTEMPTS = 5;

function generateBookingId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, BOOKING_ID_HEX_LEN).toUpperCase();
}

export class BookingService {

  async createBooking(data: any) {
    let totalAmount = 0;

    const checkInDate = new Date(data.checkIn);
    const checkOutDate = new Date(data.checkOut);

    // Fetch dynamic availability to validate
    const availability = await roomTypeService.getAvailability(data.checkIn, data.checkOut);

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

    // Push updated inventory to Aiosell to prevent double booking race condition
    try {
      const updates = [{
        startDate: data.checkIn,
        endDate: data.checkOut,
        rooms: Object.keys(requestedCounts).map(roomCode => ({
          roomCode,
          available: Math.max(0, availability[roomCode] - requestedCounts[roomCode])
        }))
      }];
      // Fire and forget so we don't hold up the client if Aiosell is slow
      cmService.pushInventory(updates).catch(() => { });
    } catch (err) {
    }

    return booking;
  }

  async getBookingsByPhone(phone?: string) {
    // No search term must never dump every booking. Require a phone.
    const trimmed = phone?.trim();
    if (!trimmed) return [];
    return prisma.userRoomBooking.findMany({
      where: { guestPhone: trimmed },
      orderBy: { createdAt: 'desc' }
    });
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
      const roomTypes = await tx.roomType.findMany({ where: { roomCode: { in: uniqueRoomCodes } } });
      const roomUpdates: Record<string, any[]> = Object.fromEntries(roomTypes.map(rt => [rt.roomCode, (rt.rooms as any[]) || []]));

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

  async checkOutBooking(id: number) {
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
      const roomTypes = await tx.roomType.findMany({ where: { roomCode: { in: roomCodes } } });

      for (const roomType of roomTypes) {
        if (roomType && roomType.rooms) {
          const roomCode = roomType.roomCode;
          const physicalRooms = roomType.rooms as any[];
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
      }

      const updated = await tx.userRoomBooking.update({
        where: { id },
        data: { status: 'CHECKED_OUT' }
      });

      return updated;
    });

    this.releaseEarlyCheckoutInventory(updatedBooking, physicalTotals).catch((err) => {
      logger.error({ err, bookingId: id }, 'Failed to release early checkout inventory');
    });

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

      const roomTypes = await tx.roomType.findMany({ where: { roomCode: { in: allRoomCodes } } });
      const roomUpdates: Record<string, any[]> = Object.fromEntries(roomTypes.map(rt => [rt.roomCode, (rt.rooms as any[]) || []]));

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
}

export const bookingService = new BookingService();
