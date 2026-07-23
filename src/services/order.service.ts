import { orderRepository } from '../repositories/order.repository';
import { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

interface OrderItem {
  menuItemId: number;
  quantity: number;
  name: string;
  price: number;
}

export class OrderService {
  async createOrder(data: {
    phoneNumber?: string;
    items: OrderItem[];
    baseAmount: number;
    gstAmount: number;
    discountAmount: number;
    finalDiscountedAmount: number;
    tableNumber?: number;
    userId: string;
    kotHistory?: any;
  }) {
    if (!data.items || data.items.length === 0) {
      throw new Error('Order must contain at least one item');
    }

    // Prisma JSON type expects any valid JSON, but items is strongly typed here
    const prismaItems = data.items as unknown as Prisma.InputJsonValue;

    const initialKotHistory = data.items.map(i => ({
      menuItemId: i.menuItemId,
      name: i.name,
      qty: i.quantity
    }));

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
      kotHistory: initialKotHistory,
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
      kotHistory?: any;
    }
  ) {
    const updateData: Prisma.OrderUpdateInput = {};

    const existingOrder = await this.getOrderById(id);

    if (data.status) updateData.status = data.status;
    if (data.cancellationReason) updateData.cancellationReason = data.cancellationReason;
    if (data.baseAmount !== undefined) updateData.baseAmount = data.baseAmount;
    if (data.gstAmount !== undefined) updateData.gstAmount = data.gstAmount;
    if (data.discountAmount !== undefined) updateData.discountAmount = data.discountAmount;
    if (data.finalDiscountedAmount !== undefined) updateData.finalDiscountedAmount = data.finalDiscountedAmount;
    if (data.tableNumber !== undefined) updateData.tableNumber = data.tableNumber;

    let currentKotHistory: any[] = Array.isArray(existingOrder.kotHistory) ? existingOrder.kotHistory : [];
    if (data.kotHistory !== undefined) {
      currentKotHistory = data.kotHistory;
      updateData.kotHistory = data.kotHistory as unknown as Prisma.InputJsonValue;
    }

    if (data.items) {
      updateData.items = data.items as unknown as Prisma.InputJsonValue;

      const existingItemsMap = new Map();
      const existingItems: any[] = Array.isArray(existingOrder.items) ? existingOrder.items : [];
      existingItems.forEach((i: any) => existingItemsMap.set(i.menuItemId, i.quantity));

      let kotChanged = false;

      data.items.forEach(item => {
        const existingQty = existingItemsMap.get(item.menuItemId) || 0;
        const diff = item.quantity - existingQty;

        if (diff !== 0) {
          kotChanged = true;
          const existingKotItem = currentKotHistory.find((k: any) => k.menuItemId === item.menuItemId);
          if (existingKotItem) {
            existingKotItem.qty += diff;
          } else if (diff > 0) {
            currentKotHistory.push({
              menuItemId: item.menuItemId,
              name: item.name,
              qty: diff
            });
          }
        }
        existingItemsMap.delete(item.menuItemId);
      });

      existingItemsMap.forEach((qty, menuItemId) => {
        const existingKotItem = currentKotHistory.find((k: any) => k.menuItemId === menuItemId);
        if (existingKotItem) {
          kotChanged = true;
          existingKotItem.qty -= qty;
        }
      });

      if (kotChanged) {
        currentKotHistory = currentKotHistory.filter((k: any) => k.qty > 0);
        updateData.kotHistory = currentKotHistory as unknown as Prisma.InputJsonValue;
      }
    }

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
  async transferToRoom(orderId: number, guestPhone: string) {
    const order = await this.getOrderById(orderId);
    if (!order) throw new Error('Order not found');
    if (order.status === 'COMPLETED') throw new Error('Order is already completed');
    if (order.status === 'CANCELLED') throw new Error('Order is cancelled');

    const booking = await prisma.userRoomBooking.findFirst({
      where: {
        guestPhone,
        status: { in: ['RESERVED', 'CHECKED_IN'] }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!booking) {
      throw new Error('No active room booking found for this phone number');
    }

    const currentFoodOrders: any[] = Array.isArray((booking as any).foodOrders) ? (booking as any).foodOrders : [];
    const orderItems: any[] = Array.isArray(order.items) ? order.items : [];

    orderItems.forEach(item => {
      const existing = currentFoodOrders.find((f: any) => f.menuItemId === item.menuItemId || f.name === item.name);
      if (existing) {
        existing.quantity += item.quantity;
        existing.price = item.price; // keep latest price
      } else {
        currentFoodOrders.push({
          menuItemId: item.menuItemId,
          name: item.name,
          quantity: item.quantity,
          price: item.price
        });
      }
    });

    const newFoodTotal = new Prisma.Decimal((booking as any).foodTotalAmount.toString()).plus(order.finalDiscountedAmount.toString());

    await prisma.$transaction([
      prisma.userRoomBooking.update({
        where: { id: booking.id },
        data: {
          foodOrders: currentFoodOrders as unknown as Prisma.InputJsonValue,
          foodTotalAmount: newFoodTotal
        }
      }),
      prisma.order.update({
        where: { id: orderId },
        data: { status: 'COMPLETED' }
      })
    ]);

    return { message: 'Order successfully transferred to room' };
  }
}

export const orderService = new OrderService();
