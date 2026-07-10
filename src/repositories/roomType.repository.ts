import { prisma } from '../config/prisma';
import { Prisma } from '@prisma/client';

export class RoomTypeRepository {
  async create(data: Prisma.RoomTypeCreateInput) {
    return prisma.roomType.create({ data });
  }

  async findAll() {
    return prisma.roomType.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findById(id: number) {
    return prisma.roomType.findUnique({ where: { id } });
  }

  async update(id: number, data: Prisma.RoomTypeUpdateInput) {
    return prisma.roomType.update({ where: { id }, data });
  }

  async delete(id: number) {
    return prisma.roomType.delete({ where: { id } });
  }
}

export const roomTypeRepository = new RoomTypeRepository();
