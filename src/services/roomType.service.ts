import { roomTypeRepository } from '../repositories/roomType.repository';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

export class RoomTypeService {
  async createRoomType(data: Prisma.RoomTypeCreateInput) {
    return roomTypeRepository.create(data);
  }

  async getAllRoomTypes() {
    const roomTypes = await roomTypeRepository.findAll();
    return roomTypes.map(rt => {
      const physicalRooms = (rt.rooms as any[]) || [];
      let availableCount = physicalRooms.length;
      if (availableCount < 0) availableCount = 0;
      
      return {
        ...rt,
        availableRooms: availableCount
      };
    });
  }

  async getAvailability(startDate: string, endDate: string) {
    const checkInDate = new Date(startDate);
    const checkOutDate = new Date(endDate);

    const overlappingBookings = await prisma.userRoomBooking.findMany({
      where: {
        status: { in: ['RESERVED', 'CHECKED_IN'] },
        checkIn: { lte: checkOutDate },
        checkOut: { gte: checkInDate }
      }
    });

    const bookedCounts: Record<string, number> = {};
    for (const booking of overlappingBookings) {
      const bookingRooms = (booking.rooms as any[]) || [];
      for (const br of bookingRooms) {
        bookedCounts[br.roomCode] = (bookedCounts[br.roomCode] || 0) + 1;
      }
    }

    const roomTypes = await roomTypeRepository.findAll();
    const availabilityMap: Record<string, number> = {};

    for (const rt of roomTypes) {
      const physicalRooms = (rt.rooms as any[]) || [];
      const bookedCount = bookedCounts[rt.roomCode] || 0;
      
      let availableCount = physicalRooms.length - bookedCount;
      if (availableCount < 0) availableCount = 0;

      availabilityMap[rt.roomCode] = availableCount;
    }

    return availabilityMap;
  }

  async getRoomTypeById(id: number) {
    return roomTypeRepository.findById(id);
  }

  async updateRoomType(id: number, data: Prisma.RoomTypeUpdateInput) {
    return roomTypeRepository.update(id, data);
  }

  async addRoomToType(id: number, room: any) {
    const roomType = await roomTypeRepository.findById(id);
    if (!roomType) throw new Error('Room type not found');
    
    const currentRooms = Array.isArray(roomType.rooms) ? roomType.rooms : [];
    
    if (currentRooms.length >= roomType.totalRooms) {
      throw new Error(`Cannot add more rooms. Maximum limit of ${roomType.totalRooms} rooms reached for this room type.`);
    }

    if (currentRooms.some((r: any) => r.roomNumber === room.roomNumber)) {
      throw new Error(`Room number ${room.roomNumber} already exists in room type ${roomType.name}`);
    }
    const newRooms = [...currentRooms, room];

    return roomTypeRepository.update(id, { rooms: newRooms as any });
  }

  async deleteRoomFromType(id: number, roomNumber: string) {
    const roomType = await roomTypeRepository.findById(id);
    if (!roomType) throw new Error('Room type not found');
    
    const currentRooms = Array.isArray(roomType.rooms) ? roomType.rooms : [];
    const newRooms = currentRooms.filter((r: any) => r.roomNumber !== roomNumber);

    return roomTypeRepository.update(id, { rooms: newRooms as any });
  }

  async deleteRoomType(id: number) {
    return roomTypeRepository.delete(id);
  }
}

export const roomTypeService = new RoomTypeService();
