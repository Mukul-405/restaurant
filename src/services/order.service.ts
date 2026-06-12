import { orderRepository } from '../repositories/order.repository';
import { OrderStatus, Prisma } from '@prisma/client';

interface OrderItem {
  menuItemId: number;
  quantity: number;
  name: string;
  price: number;
}

export class OrderService {
  async createOrder(data: {
    phoneNumber: string;
    items: OrderItem[];
    baseAmount: number;
    gstAmount: number;
    discountAmount: number;
    finalDiscountedAmount: number;
    tableNumber?: number;
    userId: string;
  }) {
    if (!data.items || data.items.length === 0) {
      throw new Error('Order must contain at least one item');
    }

    // Prisma JSON type expects any valid JSON, but items is strongly typed here
    const prismaItems = data.items as unknown as Prisma.InputJsonValue;

    const createData: any = {
      phoneNumber: data.phoneNumber,
      items: prismaItems,
      baseAmount: data.baseAmount,
      gstAmount: data.gstAmount,
      discountAmount: data.discountAmount,
      finalDiscountedAmount: data.finalDiscountedAmount,
      tableNumber: data.tableNumber,
      status: OrderStatus.PENDING,
      userId: data.userId,
    };

    return orderRepository.createOrder(createData);
  }

  async getOrderById(id: number) {
    const order = await orderRepository.getOrderById(id);
    if (!order) {
      throw new Error('Order not found');
    }
    return order;
  }

  async updateOrder(
    id: number,
    data: {
      status?: OrderStatus;
      cancellationReason?: string;
      items?: OrderItem[];
      baseAmount?: number;
      gstAmount?: number;
      discountAmount?: number;
      finalDiscountedAmount?: number;
      tableNumber?: number;
    }
  ) {
    const updateData: Prisma.OrderUpdateInput = {};

    if (data.status) {
      updateData.status = data.status;
    }
    if (data.cancellationReason) {
      updateData.cancellationReason = data.cancellationReason;
    }
    if (data.items) {
      updateData.items = data.items as unknown as Prisma.InputJsonValue;
    }
    if (data.baseAmount !== undefined) updateData.baseAmount = data.baseAmount;
    if (data.gstAmount !== undefined) updateData.gstAmount = data.gstAmount;
    if (data.discountAmount !== undefined) updateData.discountAmount = data.discountAmount;
    if (data.finalDiscountedAmount !== undefined) updateData.finalDiscountedAmount = data.finalDiscountedAmount;
    if (data.tableNumber !== undefined) updateData.tableNumber = data.tableNumber;

    // Optionally check if order exists before updating
    await this.getOrderById(id);

    return orderRepository.updateOrder(id, updateData);
  }

  async searchOrders(query: {
    id?: number;
    phoneNumber?: string;
    status?: OrderStatus;
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    
    const { total, data } = await orderRepository.findOrders({ ...query, page, limit });
    
    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    };
  }
}

export const orderService = new OrderService();
