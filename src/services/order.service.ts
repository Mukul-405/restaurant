import { orderRepository } from '../repositories/order.repository';
import { OrderStatus, PaymentMode, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

interface OrderItem {
  menuItemId?: number | null;
  quantity: number;
  name: string;
  price: number;
}

export class OrderService {
  async createOrder(data: {
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
      menuItemId: i.menuItemId ?? 0,
      name: i.name,
      qty: i.quantity
    }));

    const createData: any = {
      items: prismaItems,
      baseAmount: data.baseAmount,
      gstAmount: data.gstAmount,
      discountAmount: data.discountAmount,
      finalDiscountedAmount: Math.round(data.finalDiscountedAmount),
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

    if (data.status) {
      updateData.status = data.status;
      if (data.status === OrderStatus.COMPLETED && !data.paymentMode && !existingOrder.paymentMode) {
        updateData.paymentMode = PaymentMode.CASH;
      }
    }
    if (data.paymentMode) updateData.paymentMode = data.paymentMode;
    if (data.cancellationReason) updateData.cancellationReason = data.cancellationReason;
    if (data.baseAmount !== undefined) updateData.baseAmount = data.baseAmount;
    if (data.gstAmount !== undefined) updateData.gstAmount = data.gstAmount;
    if (data.discountAmount !== undefined) updateData.discountAmount = data.discountAmount;
    if (data.finalDiscountedAmount !== undefined) updateData.finalDiscountedAmount = Math.round(data.finalDiscountedAmount);
    if (data.tableNumber !== undefined) updateData.tableNumber = data.tableNumber;

    let currentKotHistory: any[] = Array.isArray(existingOrder.kotHistory) ? existingOrder.kotHistory : [];
    if (data.kotHistory !== undefined) {
      currentKotHistory = data.kotHistory;
      updateData.kotHistory = data.kotHistory as unknown as Prisma.InputJsonValue;
    }

    if (data.items) {
      updateData.items = data.items as unknown as Prisma.InputJsonValue;

      const getItemKey = (i: any) => (i.menuItemId && i.menuItemId !== 0 ? `id_${i.menuItemId}` : `custom_${i.name}`);

      const existingItemsMap = new Map();
      const existingItems: any[] = Array.isArray(existingOrder.items) ? existingOrder.items : [];
      existingItems.forEach((i: any) => existingItemsMap.set(getItemKey(i), { qty: i.quantity, menuItemId: i.menuItemId, name: i.name }));

      let kotChanged = false;

      data.items.forEach(item => {
        const key = getItemKey(item);
        const existingRecord = existingItemsMap.get(key);
        const existingQty = existingRecord ? existingRecord.qty : 0;
        const diff = item.quantity - existingQty;

        if (diff !== 0) {
          kotChanged = true;
          const existingKotItem = currentKotHistory.find((k: any) => getItemKey(k) === key);
          if (existingKotItem) {
            existingKotItem.qty += diff;
          } else if (diff > 0) {
            currentKotHistory.push({
              menuItemId: item.menuItemId ?? 0,
              name: item.name,
              qty: diff
            });
          }
        }
        existingItemsMap.delete(key);
      });

      existingItemsMap.forEach((val, key) => {
        const existingKotItem = currentKotHistory.find((k: any) => getItemKey(k) === key);
        if (existingKotItem) {
          kotChanged = true;
          existingKotItem.qty -= val.qty;
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

  async transferToRoom(orderId: number, userRoomBookingId: number) {
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: 'PENDING' },
        data: { status: 'COMPLETED', paymentMode: 'ROOM_TRANSFER' },
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
        WHERE "id" = ${userRoomBookingId} AND status IN ('RESERVED', 'CHECKED_IN')
        ORDER BY "createdAt" DESC
        LIMIT 1
        FOR UPDATE`;
      if (locked.length === 0) {
        throw new Error('No active room booking found for this room');
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

  async mergeOrders(data: {
    orderIds?: number[];
    tableNumbers?: number[];
    targetTableNumber: number;
    userId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      let ordersToMerge: any[] = [];

      if (data.orderIds && data.orderIds.length > 0) {
        ordersToMerge = await tx.order.findMany({
          where: {
            id: { in: data.orderIds },
          },
          include: {
            user: { select: { id: true, name: true } },
          },
        });

        if (ordersToMerge.length !== data.orderIds.length) {
          throw new Error('One or more selected orders could not be found');
        }
      } else if (data.tableNumbers && data.tableNumbers.length > 0) {
        ordersToMerge = await tx.order.findMany({
          where: {
            tableNumber: { in: data.tableNumbers },
            status: OrderStatus.PENDING,
          },
          include: {
            user: { select: { id: true, name: true } },
          },
        });
      }

      if (ordersToMerge.length < 2) {
        throw new Error('At least 2 pending orders are required to perform a merge');
      }

      // Check that all orders are PENDING and have non-null tableNumber
      for (const order of ordersToMerge) {
        if (order.status !== OrderStatus.PENDING) {
          throw new Error(`Order #${order.id} is not pending (status: ${order.status}) and cannot be merged`);
        }
        if (order.tableNumber === null || order.tableNumber === undefined) {
          throw new Error(`Order #${order.id} has no table number and cannot be merged`);
        }
      }

      const orderIdsToMerge = ordersToMerge.map(o => o.id);

      // Merge items
      const itemsMap = new Map<string, { menuItemId: number; name: string; price: number; quantity: number }>();

      for (const order of ordersToMerge) {
        const orderItems: any[] = Array.isArray(order.items) ? order.items : [];
        for (const item of orderItems) {
          const qty = Number(item.quantity || 0);
          if (qty <= 0) continue;
          const price = Number(item.price || 0);
          const menuItemId = item.menuItemId ? Number(item.menuItemId) : 0;
          const name = String(item.name || '').trim();

          const key = menuItemId > 0 
            ? `menu_${menuItemId}` 
            : `custom_${name.toLowerCase()}_${price}`;

          if (itemsMap.has(key)) {
            itemsMap.get(key)!.quantity += qty;
          } else {
            itemsMap.set(key, {
              menuItemId,
              name,
              price,
              quantity: qty,
            });
          }
        }
      }

      const mergedItems = Array.from(itemsMap.values());
      if (mergedItems.length === 0) {
        throw new Error('Merged orders contain no valid items');
      }

      // Calculate amounts
      const baseAmount = Number(mergedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2));
      const gstAmount = Number((baseAmount * 0.05).toFixed(2));
      const totalDiscount = ordersToMerge.reduce((sum, o) => sum + Number(o.discountAmount || 0), 0);
      const finalDiscountedAmount = Math.max(0, Math.round(baseAmount + gstAmount - totalDiscount));

      // Merge KOT history
      const kotMap = new Map<string, { menuItemId: number; name: string; qty: number }>();
      for (const order of ordersToMerge) {
        const kots: any[] = Array.isArray(order.kotHistory) ? order.kotHistory : [];
        for (const k of kots) {
          const qty = Number(k.qty ?? k.quantity ?? 0);
          if (qty > 0) {
            const menuItemId = k.menuItemId ? Number(k.menuItemId) : 0;
            const name = String(k.name || '').trim();
            const key = menuItemId > 0 ? `menu_${menuItemId}` : `custom_${name.toLowerCase()}`;
            if (kotMap.has(key)) {
              kotMap.get(key)!.qty += qty;
            } else {
              kotMap.set(key, { menuItemId, name, qty });
            }
          }
        }
      }
      const mergedKotHistory = Array.from(kotMap.values());

      // Create new merged order
      const newOrder = await tx.order.create({
        data: {
          items: mergedItems as unknown as Prisma.InputJsonValue,
          baseAmount,
          gstAmount,
          discountAmount: totalDiscount,
          finalDiscountedAmount,
          tableNumber: data.targetTableNumber,
          status: OrderStatus.PENDING,
          userId: data.userId,
          kotHistory: mergedKotHistory as unknown as Prisma.InputJsonValue,
        },
        include: {
          user: { select: { id: true, name: true } },
        },
      });

      // Delete the old merged orders
      await tx.order.deleteMany({
        where: {
          id: { in: orderIdsToMerge },
        },
      });

      return {
        order: newOrder,
        mergedOrderIds: orderIdsToMerge,
        targetTableNumber: data.targetTableNumber,
      };
    });
  }
}

export const orderService = new OrderService();
