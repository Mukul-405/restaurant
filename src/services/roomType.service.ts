import { roomTypeRepository } from '../repositories/roomType.repository';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { cmService } from './cm.service';

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
    try {
      const inventoryData = await cmService.fetchInventory(startDate, endDate);
      const availabilityMap: Record<string, number> = {};

      // Aiosell returns an array of date entries, each with rooms[].roomCode and rooms[].available.
      // We take the minimum availability across all dates for each roomCode.
      if (Array.isArray(inventoryData)) {
        for (const dateEntry of inventoryData) {
          const rooms = dateEntry.rooms || [];
          for (const room of rooms) {
            if (room.roomCode && typeof room.available === 'number') {
              if (availabilityMap[room.roomCode] === undefined) {
                availabilityMap[room.roomCode] = room.available;
              } else {
                availabilityMap[room.roomCode] = Math.min(availabilityMap[room.roomCode], room.available);
              }
            }
          }
        }
      }

      return availabilityMap;
    } catch (error) {
      console.error("Error fetching inventory from Aiosell:", error);
      throw error;
    }
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
    const room = currentRooms.find((r: any) => r.roomNumber === roomNumber) as any;
    if (room?.status === 'checked in') throw new Error(`Cannot delete room ${roomNumber}. It is currently checked in.`);
    const newRooms = currentRooms.filter((r: any) => r.roomNumber !== roomNumber);

    return roomTypeRepository.update(id, { rooms: newRooms as any });
  }

  async deleteRoomType(id: number) {
    return roomTypeRepository.delete(id);
  }
}

export const roomTypeService = new RoomTypeService();
