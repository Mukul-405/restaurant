import { prisma } from '../config/prisma';
import crypto from 'crypto';
import { roomTypeService } from './roomType.service';

export class BookingService {

  async createBooking(data: any) {
    let totalAmount = 0;
    
    const checkInDate = new Date(data.checkIn);
    const checkOutDate = new Date(data.checkOut);

    // Fetch dynamic availability to validate
    const availability = await roomTypeService.getAvailability(data.checkIn, data.checkOut);
    
    // First pass: Calculate amounts, validate room availability
    const requestedCounts: Record<string, number> = {};
    const requestedRooms = new Set<string>();

    for (const room of data.rooms) {
      const roomType = await prisma.roomType.findUnique({
        where: { roomCode: room.roomCode }
      });
      if (!roomType) throw new Error(`RoomType ${room.roomCode} not found`);
      
      if (roomType.rateplanCodes) {
        const ratePlans = roomType.rateplanCodes as any[];
        const plan = ratePlans.find(rp => rp.code === room.rateplanCode);
        if (plan) totalAmount += Number(plan.price);
      }
      
      requestedCounts[room.roomCode] = (requestedCounts[room.roomCode] || 0) + 1;

      if (room.roomNumber) {
        if (requestedRooms.has(room.roomNumber)) {
          throw new Error(`Room number ${room.roomNumber} is selected multiple times.`);
        }
        requestedRooms.add(room.roomNumber);

        // Verify that the assigned room is actually physically available today
        const physicalRooms = (roomType.rooms as any[]) || [];
        const isRoomAvailable = physicalRooms.some(r => r.roomNumber === room.roomNumber && r.status === 'no status');
        if (!isRoomAvailable) throw new Error(`Room number ${room.roomNumber} is not available.`);
      }
    }

    for (const roomCode of Object.keys(requestedCounts)) {
      const avail = availability[roomCode];
      if (avail === undefined || requestedCounts[roomCode] > avail) {
        throw new Error(`Not enough rooms available for ${roomCode}`);
      }
    }

    // Second pass: Create Booking and nested BookingRooms
    const todayStr = new Date().toLocaleDateString('en-CA');
    const checkInStr = checkInDate.toLocaleDateString('en-CA');
    const finalStatus = checkInStr > todayStr ? 'RESERVED' : 'CHECKED_IN';

    // Normalize empty roomNumbers to null for database JSON
    const finalRooms = data.rooms.map((r: any) => ({
      ...r,
      roomNumber: r.roomNumber || null
    }));

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
        status: finalStatus as any,
        totalAmount: totalAmount,
        bookedOn: new Date(),
        rooms: finalRooms
      }
    });

    // Third pass: Update RoomType JSONs in DB to mark as checked in
    if (finalStatus === 'CHECKED_IN') {
      const roomUpdates: Record<string, any[]> = {};
      for (const room of finalRooms) {
        if (room.roomNumber) {
          if (!roomUpdates[room.roomCode]) {
            const roomType = await prisma.roomType.findUnique({ where: { roomCode: room.roomCode } });
            roomUpdates[room.roomCode] = (roomType?.rooms as any[]) || [];
          }
          
          const roomsJson = roomUpdates[room.roomCode];
          const roomIndex = roomsJson.findIndex(r => r.roomNumber === room.roomNumber);
          if (roomIndex !== -1) {
            roomsJson[roomIndex].status = 'checked in';
            roomsJson[roomIndex].userRoomBookingId = booking.id;
          }
        }
      }

      for (const [roomCode, updatedRooms] of Object.entries(roomUpdates)) {
        await prisma.roomType.update({
          where: { roomCode },
          data: { rooms: updatedRooms }
        });
      }
    }

    return booking;
  }

  async getBookingsByPhone(phone?: string) {
    if (!phone) {
      return prisma.userRoomBooking.findMany({
        orderBy: { createdAt: 'desc' }
      });
    }
    return prisma.userRoomBooking.findMany({
      where: { guestPhone: { contains: phone } },
      orderBy: { createdAt: 'desc' }
    });
  }

  async checkInBooking(id: number, assignments: { roomCode: string, roomNumber: string }[]) {
    return prisma.$transaction(async (tx) => {
      const booking = await tx.userRoomBooking.findUnique({
        where: { id }
      });

      if (!booking) throw new Error('Booking not found');
      if (booking.status !== 'RESERVED') throw new Error(`Booking status is ${booking.status}. Only RESERVED bookings can be checked in.`);

      // Validate assignments
      const roomUpdates: Record<string, any[]> = {};
      
      for (const assignment of assignments) {
        if (!roomUpdates[assignment.roomCode]) {
          const roomType = await tx.roomType.findUnique({ where: { roomCode: assignment.roomCode } });
          if (!roomType) throw new Error(`RoomType ${assignment.roomCode} not found`);
          roomUpdates[assignment.roomCode] = (roomType.rooms as any[]) || [];
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
      const roomCodes = Array.from(new Set(bookingRooms.map(r => r.roomCode)));

      for (const roomCode of roomCodes) {
        if (!roomCode) continue;
        const roomType = await tx.roomType.findUnique({ where: { roomCode } });
        if (roomType && roomType.rooms) {
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

      const roomUpdates: Record<string, any[]> = {};
      const bookingRooms = (booking.rooms as any[]) || [];

      // Step 1: Free up all currently assigned physical rooms
      const oldRoomCodes = Array.from(new Set(bookingRooms.map(r => r.roomCode)));
      for (const roomCode of oldRoomCodes) {
        if (!roomCode) continue;
        const roomType = await tx.roomType.findUnique({ where: { roomCode } });
        if (roomType && roomType.rooms) {
          roomUpdates[roomCode] = roomType.rooms as any[];
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
          const roomType = await tx.roomType.findUnique({ where: { roomCode: assignment.roomCode } });
          if (!roomType) throw new Error(`RoomType ${assignment.roomCode} not found`);
          roomUpdates[assignment.roomCode] = (roomType.rooms as any[]) || [];
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
