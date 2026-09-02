import { prisma } from '../config/prisma';

export class BarMenuRepository {
  async createBarMenuItem(data: { name: string; price: number; description?: string; categoryId: number }) {
    return prisma.barMenuItem.create({
      data,
      include: {
        category: true,
      },
    });
  }

  async createManyBarMenuItems(data: { name: string; price: number; description?: string; categoryId: number }[]) {
    return prisma.barMenuItem.createMany({
      data,
      skipDuplicates: true,
    });
  }

  async getAllBarMenuItems() {
    return prisma.barMenuItem.findMany({
      include: {
        category: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async updateBarMenuItem(id: number, data: any) {
    return prisma.barMenuItem.update({
      where: { id },
      data,
      include: {
        category: true,
      },
    });
  }

  async deleteBarMenuItem(id: number) {
    return prisma.barMenuItem.delete({
      where: { id },
    });
  }
}

export const barMenuRepository = new BarMenuRepository();
