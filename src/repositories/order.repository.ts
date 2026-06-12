import { prisma } from '../config/prisma';
import { Prisma, OrderStatus } from '@prisma/client';

export class OrderRepository {
  async createOrder(data: Prisma.OrderCreateInput) {
    return prisma.order.create({
      data,
    });
  }

  async getOrderById(id: number) {
    return prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true } },
      },
    });
  }

  async updateOrder(id: number, data: Prisma.OrderUpdateInput) {
    return prisma.order.update({
      where: { id },
      data,
    });
  }

  async findOrders(query: {
    id?: number;
    phoneNumber?: string;
    status?: OrderStatus;
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    page?: number;
    limit?: number;
  }) {
    const where: Prisma.OrderWhereInput = {};

    if (query.id) {
      where.id = query.id;
    }
    if (query.phoneNumber) {
      where.phoneNumber = { contains: query.phoneNumber, mode: 'insensitive' };
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = query.startDate;
      if (query.endDate) where.createdAt.lte = query.endDate;
    }

    if (query.userId) {
      where.userId = query.userId;
    }

    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const [total, data] = await prisma.$transaction([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true } },
        },
      })
    ]);

    return { total, data };
  }
}

export const orderRepository = new OrderRepository();
