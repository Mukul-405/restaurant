import { prisma } from '../config/prisma';

export interface InventoryItemMeta {
  name: string;
  quantity: number;
  perItemPrice: number;
  totalPrice: number;
}

export interface CreateInventoryInput {
  date: Date;
  metaInfo: InventoryItemMeta[];
  totalPrice: number;
  notes?: string | null;
}

export interface UpdateInventoryInput {
  date?: Date;
  metaInfo?: InventoryItemMeta[];
  totalPrice?: number;
  notes?: string | null;
}

export interface InventoryFilter {
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export class InventoryRepository {
  async create(data: CreateInventoryInput) {
    return prisma.inventory.create({
      data: {
        date: data.date,
        metaInfo: data.metaInfo as any,
        totalPrice: data.totalPrice,
        notes: data.notes,
      },
    });
  }

  async findAll(filter?: InventoryFilter) {
    const where: any = {};

    if (filter?.startDate || filter?.endDate) {
      where.date = {};
      if (filter.startDate) {
        where.date.gte = new Date(filter.startDate);
      }
      if (filter.endDate) {
        // Include the entire end day up to 23:59:59.999
        const end = new Date(filter.endDate);
        end.setHours(23, 59, 59, 999);
        where.date.lte = end;
      }
    }

    const orderBy: any = { date: 'desc' };

    if (filter?.page && filter?.limit) {
      const skip = (filter.page - 1) * filter.limit;
      const [items, total] = await Promise.all([
        prisma.inventory.findMany({
          where,
          orderBy,
          skip,
          take: filter.limit,
        }),
        prisma.inventory.count({ where }),
      ]);
      return { items, total };
    }

    const items = await prisma.inventory.findMany({
      where,
      orderBy,
    });
    return { items, total: items.length };
  }

  async findById(id: number) {
    return prisma.inventory.findUnique({
      where: { id },
    });
  }

  async update(id: number, data: UpdateInventoryInput) {
    const updateData: any = {};
    if (data.date !== undefined) updateData.date = data.date;
    if (data.metaInfo !== undefined) updateData.metaInfo = data.metaInfo as any;
    if (data.totalPrice !== undefined) updateData.totalPrice = data.totalPrice;
    if (data.notes !== undefined) updateData.notes = data.notes;

    return prisma.inventory.update({
      where: { id },
      data: updateData,
    });
  }

  async delete(id: number) {
    return prisma.inventory.delete({
      where: { id },
    });
  }
}

export const inventoryRepository = new InventoryRepository();
