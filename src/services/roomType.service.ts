import { roomTypeRepository } from '../repositories/roomType.repository';
import { Prisma } from '@prisma/client';

export class RoomTypeService {
  async createRoomType(data: Prisma.RoomTypeCreateInput) {
    return roomTypeRepository.create(data);
  }

  async getAllRoomTypes(startDate?: string, endDate?: string) {
    const roomTypes = await roomTypeRepository.findAll();
    
    // Since individual Room tracking is removed, we currently return totalRooms
    // as availableRooms to keep the structure intact for the UI.
    return roomTypes.map(rt => ({
      ...rt,
      availableRooms: rt.totalRooms
    }));
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
