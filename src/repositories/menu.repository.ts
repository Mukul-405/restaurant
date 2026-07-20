import { prisma } from '../config/prisma';

export class MenuRepository {
  async findCategoryByName(name: string) {
    return prisma.category.findUnique({
      where: { name },
    });
  }

  async upsertCategory(name: string) {
    return prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  async createManyCategories(names: string[]) {
    const data = names.map((name) => ({ name }));
    return prisma.category.createMany({
      data,
      skipDuplicates: true, // Prevents errors if category already exists
    });
  }

  async getAllCategories() {
    return prisma.category.findMany();
  }

  async createMenuItem(data: { name: string; price: number; description?: string; categoryId: number }) {
    return prisma.menuItem.create({
      data,
    });
  }

  async createManyMenuItems(data: { name: string; price: number; description?: string; categoryId: number }[]) {
    return prisma.menuItem.createMany({
      data,
      skipDuplicates: true,
    });
  }

  async getAllMenuItems() {
    return prisma.menuItem.findMany({
      include: {
        category: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async updateMenuItem(id: number, data: any) {
    return prisma.menuItem.update({
      where: { id },
      data,
    });
  }

  async deleteMenuItem(id: number) {
    return prisma.menuItem.delete({
      where: { id },
    });
  }
}

export const menuRepository = new MenuRepository();
