import { prisma } from '../config/prisma';
import { Role } from '@prisma/client';

export class UserRepository {
  async create(data: { name: string; phoneNumber: string; passwordHash: string; role?: Role; isActive?: boolean }) {
    return prisma.user.create({ data });
  }

  async findByPhoneNumber(phoneNumber: string) {
    return prisma.user.findUnique({
      where: { phoneNumber },
    });
  }

  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  async findAll() {
    return prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async countAll(): Promise<number> {
    return prisma.user.count();
  }

  async countAdmins(): Promise<number> {
    return prisma.user.count({
      where: {
        role: Role.ADMIN,
        isActive: true,
      },
    });
  }

  async updateStatus(id: string, isActive: boolean) {
    return prisma.user.update({
      where: { id },
      data: { isActive },
    });
  }

  async updatePassword(id: string, passwordHash: string) {
    return prisma.user.update({
      where: { id },
      data: { passwordHash },
    });
  }

  async delete(id: string) {
    return prisma.user.delete({
      where: { id },
    });
  }
}

export const userRepository = new UserRepository();
