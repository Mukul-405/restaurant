import { prisma } from '../config/prisma';
import crypto from 'crypto';
import { roomTypeService } from './roomType.service';
import { cmService } from './cm.service';

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

    // Second pass: Create Booking and nested BookingRooms
    const booking = await prisma.userRoomBooking.create({
      data: {
        bookingId: crypto.randomUUID().split('-')[0].toUpperCase(),
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
      cmService.pushInventory(updates).catch(e => console.error("Aiosell push error:", e));
    } catch (err) {
      console.error("Failed to prepare Aiosell push:", err);
    }

    return booking;
  }

  async getBookingsByPhone(phone?: string) {
    // No search term must never dump every booking. Require a phone.
    const trimmed = phone?.trim();
    if (!trimmed) return [];
    return prisma.userRoomBooking.findMany({
      where: { guestPhone: { contains: trimmed } },
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
    return prisma.$transaction(async (tx) => {
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

      const updatedBooking = await tx.userRoomBooking.update({
        where: { id },
        data: { status: 'CHECKED_OUT' }
      });

      return updatedBooking;
    });
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
