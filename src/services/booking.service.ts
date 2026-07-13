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

    // Third pass: Update RoomType JSONs in DB to mark as checked in and link booking ID
    const roomUpdates: Record<string, any[]> = {};
    for (const room of data.rooms) {
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

    for (const roomCode of Object.keys(roomUpdates)) {
      await prisma.roomType.update({
        where: { roomCode: roomCode },
        data: { rooms: roomUpdates[roomCode] }
      });
    }

    return booking;
  }
}

export const bookingService = new BookingService();
