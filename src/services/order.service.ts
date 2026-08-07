import { orderRepository } from '../repositories/order.repository';
import { OrderStatus, PaymentMode, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { normalizePhone } from '../utils/phone.util';

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
      phoneNumber?: string | null;
      status?: OrderStatus;
      paymentMode?: PaymentMode;
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

    // Checked against undefined, not truthiness: null and '' are valid "clear the phone".
    if (data.phoneNumber !== undefined) {
      updateData.phoneNumber = data.phoneNumber ? normalizePhone(data.phoneNumber) : null;
    }
    if (data.status) updateData.status = data.status;
    if (data.paymentMode) updateData.paymentMode = data.paymentMode;
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

    // Ensure the date range covers the entire day boundaries.
    if (query.startDate) {
      query.startDate.setHours(0, 0, 0, 0);
    }
    if (query.endDate) {
      query.endDate.setHours(23, 59, 59, 999);
    }

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
  async getKots(query: { page?: number; limit?: number }) {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const { total, data } = await orderRepository.findKots({ page, limit });

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
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: 'PENDING' },
        data: { status: 'COMPLETED' },
      });
      if (claimed.count === 0) {
        const existing = await tx.order.findUnique({ where: { id: orderId } });
        if (!existing) throw new Error('Order not found');
        if (existing.status === 'COMPLETED') throw new Error('Order is already completed');
        if (existing.status === 'CANCELLED') throw new Error('Order is cancelled');
        throw new Error('Order could not be transferred');
      }

      const order = await tx.order.findUnique({ where: { id: orderId } });
      const locked = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM "UserRoomBooking"
        WHERE "guestPhone" = ${guestPhone} AND status IN ('RESERVED', 'CHECKED_IN')
        ORDER BY "createdAt" DESC
        LIMIT 1
        FOR UPDATE`;
      if (locked.length === 0) {
        throw new Error('No active room booking found for this phone number');
      }
      const bookingId = locked[0].id;

      const booking = await tx.userRoomBooking.findUnique({ where: { id: bookingId } });
      const currentFoodOrders: any[] = Array.isArray(booking!.foodOrders) ? booking!.foodOrders as any[] : [];
      const orderItems: any[] = Array.isArray(order!.items) ? order!.items as any[] : [];

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

      await tx.userRoomBooking.update({
        where: { id: bookingId },
        data: {
          foodOrders: currentFoodOrders as unknown as Prisma.InputJsonValue,
          // Atomic increment — safe even without the lock, and correct under it.
          foodTotalAmount: { increment: order!.finalDiscountedAmount },
        },
      });

      return { message: 'Order successfully transferred to room' };
    });
  }
}

export const orderService = new OrderService();
