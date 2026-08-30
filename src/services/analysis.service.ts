import { prisma } from '../config/prisma';

export const getRevenueAnalysisService = async (startDate: Date, endDate: Date) => {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const result = await prisma.order.aggregate({
    _sum: {
      baseAmount: true,
      gstAmount: true,
      discountAmount: true,
      finalDiscountedAmount: true,
    },
    _count: {
      id: true,
    },
    where: {
      status: 'COMPLETED',
      createdAt: {
        gte: start,
        lte: end,
      },
    },
  });

  const paymentModeGroup = await prisma.order.groupBy({
    by: ['paymentMode'],
    _sum: {
      baseAmount: true,
      gstAmount: true,
      finalDiscountedAmount: true,
    },
    _count: {
      id: true,
    },
    where: {
      status: 'COMPLETED',
      createdAt: {
        gte: start,
        lte: end,
      },
    },
  });

  const paymentModes = {
    CASH: { count: 0, baseAmount: 0, gstAmount: 0, totalAmount: 0 },
    CARD: { count: 0, baseAmount: 0, gstAmount: 0, totalAmount: 0 },
    UPI: { count: 0, baseAmount: 0, gstAmount: 0, totalAmount: 0 },
    ROOM_TRANSFER: { count: 0, baseAmount: 0, gstAmount: 0, totalAmount: 0 },
  };

  paymentModeGroup.forEach((item) => {
    const base = Number(item._sum.baseAmount || 0);
    const gst = Number(item._sum.gstAmount || 0);
    const total = Number(item._sum.finalDiscountedAmount || 0);
    const count = item._count.id;

    let mode: keyof typeof paymentModes = 'CASH';
    if (item.paymentMode === 'CARD') mode = 'CARD';
    else if (item.paymentMode === 'UPI') mode = 'UPI';
    else if (item.paymentMode === 'ROOM_TRANSFER') mode = 'ROOM_TRANSFER';

    paymentModes[mode].count += count;
    paymentModes[mode].baseAmount += base;
    paymentModes[mode].gstAmount += gst;
    paymentModes[mode].totalAmount += total;
  });

  return {
    totalBaseAmount: Number(result._sum.baseAmount || 0),
    totalGstAmount: Number(result._sum.gstAmount || 0),
    totalDiscountAmount: Number(result._sum.discountAmount || 0),
    totalFinalDiscountedAmount: Number(result._sum.finalDiscountedAmount || 0),
    totalOrders: result._count.id,
    paymentModes,
    cashAmount: paymentModes.CASH.totalAmount,
    cardAmount: paymentModes.CARD.totalAmount,
    upiAmount: paymentModes.UPI.totalAmount,
    roomTransferAmount: paymentModes.ROOM_TRANSFER.totalAmount,
  };
};

export const getWaiterAnalysisService = async (startDate: Date, endDate: Date) => {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const result = await prisma.order.groupBy({
    by: ['userId'],
    _sum: {
      finalDiscountedAmount: true,
    },
    _count: {
      id: true,
    },
    where: {
      status: 'COMPLETED',
      createdAt: {
        gte: start,
        lte: end,
      },
    },
  });

  // Fetch user details for each waiter
  const userIds = result.map((r) => r.userId);
  const users = await prisma.user.findMany({
    where: {
      id: { in: userIds },
    },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
    },
  });

  const waiterAnalysis = result.map((r) => {
    const user = users.find((u) => u.id === r.userId);
    return {
      userId: r.userId,
      waiterName: user?.name || 'Unknown',
      phoneNumber: user?.phoneNumber || 'N/A',
      totalOrders: r._count.id,
      totalRevenue: r._sum.finalDiscountedAmount || 0,
    };
  });

  return waiterAnalysis;
};

export const getBookingAnalysisService = async (startDate: Date, endDate: Date) => {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const dbResult = await prisma.$queryRaw<
    { totalRoomRevenue: number; totalBookings: number; totalRoomsSold: number }[]
  >`
    SELECT
      COALESCE(SUM("totalAmount" + "foodTotalAmount" - "roomDiscountAmount" - "foodDiscountAmount"), 0) as "totalRoomRevenue",
      COUNT(*)::int as "totalBookings",
      COALESCE(SUM(jsonb_array_length(CASE WHEN jsonb_typeof(rooms) = 'array' THEN rooms ELSE '[]'::jsonb END)), 0)::int as "totalRoomsSold"
    FROM "UserRoomBooking"
    WHERE "checkOut" >= ${start} AND "checkOut" <= ${end}
      AND status = 'CHECKED_OUT'
  `;

  const { totalRoomRevenue, totalBookings, totalRoomsSold } = dbResult[0] || {
    totalRoomRevenue: 0,
    totalBookings: 0,
    totalRoomsSold: 0,
  };

  return {
    totalRoomRevenue: Number(totalRoomRevenue),
    totalBookings: Number(totalBookings),
    totalRoomsSold: Number(totalRoomsSold),
  };
};

export const getChannelAnalysisService = async (startDate: Date, endDate: Date) => {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const dbResult = await prisma.$queryRaw<{ channel: string; count: number }[]>`
    SELECT channel, COUNT(*)::int as count
    FROM "UserRoomBooking"
    WHERE "checkOut" >= ${start} AND "checkOut" <= ${end} 
      AND status = 'CHECKED_OUT' AND channel IS NOT NULL
    GROUP BY channel
  `;

  const channelBreakdown: Record<string, number> = {};
  dbResult.forEach(row => {
    channelBreakdown[row.channel] = Number(row.count);
  });

  return { channelBreakdown };
};

export interface OrderItemAnalysisResult {
  totalItemsSold: number;
  totalUniqueItems: number;
  totalAmountExcludingGst: number;
  items: {
    menuItemId?: number;
    name: string;
    totalQuantity: number;
    price: number;
    totalAmount: number;
    orderCount: number;
  }[];
}

export const getOrderItemAnalysisService = async (startDate: Date, endDate: Date): Promise<OrderItemAnalysisResult> => {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const orders = await prisma.order.findMany({
    where: {
      status: 'COMPLETED',
      createdAt: {
        gte: start,
        lte: end,
      },
    },
    select: {
      id: true,
      items: true,
      createdAt: true,
    },
  });

  const itemMap = new Map<string, {
    menuItemId?: number;
    name: string;
    totalQuantity: number;
    price: number;
    totalAmount: number;
    orderCount: number;
  }>();

  let totalItemsSold = 0;
  let totalAmountExcludingGst = 0;

  for (const order of orders) {
    const rawItems = Array.isArray(order.items) ? (order.items as any[]) : [];
    const seenItemsInOrder = new Set<string>();

    for (const item of rawItems) {
      if (!item || !item.name) continue;
      const trimmedName = String(item.name).trim();
      const quantity = Number(item.quantity) || 0;
      const unitPrice = Number(item.price) || 0;
      const itemTotalAmount = Number((quantity * unitPrice).toFixed(2));

      if (quantity <= 0) continue;

      const mapKey = item.menuItemId ? `id_${item.menuItemId}` : `name_${trimmedName.toLowerCase()}`;

      if (!itemMap.has(mapKey)) {
        itemMap.set(mapKey, {
          menuItemId: item.menuItemId ? Number(item.menuItemId) : undefined,
          name: trimmedName,
          totalQuantity: 0,
          price: unitPrice,
          totalAmount: 0,
          orderCount: 0,
        });
      }

      const entry = itemMap.get(mapKey)!;
      entry.totalQuantity += quantity;
      entry.totalAmount = Number((entry.totalAmount + itemTotalAmount).toFixed(2));
      entry.price = unitPrice;

      if (!seenItemsInOrder.has(mapKey)) {
        entry.orderCount += 1;
        seenItemsInOrder.add(mapKey);
      }

      totalItemsSold += quantity;
      totalAmountExcludingGst = Number((totalAmountExcludingGst + itemTotalAmount).toFixed(2));
    }
  }

  const items = Array.from(itemMap.values()).sort((a, b) => b.totalQuantity - a.totalQuantity);

  return {
    totalUniqueItems: items.length,
    totalItemsSold,
    totalAmountExcludingGst: Number(totalAmountExcludingGst.toFixed(2)),
    items,
  };
};

export interface DailyBillSummaryItem {
  id: number;
  billNo: string;
  orderNumber: number;
  createdAt: Date;
  dateStr: string;
  dateHeaderStr: string;
  dateKey: string;
  tableNumber: number | null;
  status: string;
  cancellationReason: string | null;
  paymentMode: string | null;
  baseAmount: number;
  sgstAmount: number;
  cgstAmount: number;
  totalAmount: number;
  discountAmount: number;
  finalDiscountedAmount: number;
  waiterName?: string;
  remarks: string;
}

export interface DayGroupSummary {
  dateStr: string;
  dateHeaderStr: string;
  dateKey: string;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalBaseAmount: number;
  totalSgstAmount: number;
  totalCgstAmount: number;
  totalDiscountAmount: number;
  totalAmount: number;
  orders: DailyBillSummaryItem[];
}

export interface DailyBillSummaryResult {
  startDate: string;
  endDate: string;
  monthTitle: string;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalBaseAmount: number;
  totalSgstAmount: number;
  totalCgstAmount: number;
  totalDiscountAmount: number;
  grandTotalAmount: number;
  days: DayGroupSummary[];
  allOrders: DailyBillSummaryItem[];
}

export const getDailyBillSummaryService = async (startDate: Date, endDate: Date): Promise<DailyBillSummaryResult> => {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const orders = await prisma.order.findMany({
    where: {
      createdAt: {
        gte: start,
        lte: end,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  const dayMap = new Map<string, DayGroupSummary>();
  const allOrders: DailyBillSummaryItem[] = [];

  let overallTotalBase = 0;
  let overallTotalSgst = 0;
  let overallTotalCgst = 0;
  let overallTotalDiscount = 0;
  let overallGrandTotal = 0;
  let overallCompleted = 0;
  let overallCancelled = 0;

  orders.forEach((order) => {
    const orderDate = new Date(order.createdAt);
    const year = orderDate.getFullYear();
    const month = String(orderDate.getMonth() + 1).padStart(2, '0');
    const day = String(orderDate.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;

    const dateStr = orderDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const dateHeaderStr = orderDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

    let base = Number(order.baseAmount || 0);
    if (base === 0 && Array.isArray(order.items)) {
      base = (order.items as any[]).reduce((sum, it) => sum + (Number(it.price || 0) * Number(it.quantity || 0)), 0);
    }
    base = Number(base.toFixed(2));

    const isCancelled = order.status === 'CANCELLED';
    const discount = isCancelled ? 0 : Number((Number(order.discountAmount || 0)).toFixed(2));
    const sgst = isCancelled ? 0 : Number((base * 0.025).toFixed(2));
    const cgst = isCancelled ? 0 : Number((base * 0.025).toFixed(2));
    const total = isCancelled ? 0 : Number(Math.max(0, base + sgst + cgst - discount).toFixed(2));

    if (isCancelled) {
      overallCancelled += 1;
    } else {
      overallCompleted += 1;
      overallTotalBase = Number((overallTotalBase + base).toFixed(2));
      overallTotalSgst = Number((overallTotalSgst + sgst).toFixed(2));
      overallTotalCgst = Number((overallTotalCgst + cgst).toFixed(2));
      overallTotalDiscount = Number((overallTotalDiscount + discount).toFixed(2));
      overallGrandTotal = Number((overallGrandTotal + total).toFixed(2));
    }

    let remarks = isCancelled 
      ? (order.cancellationReason ? `Cancelled: ${order.cancellationReason}` : 'Cancelled')
      : (order.paymentMode || 'Paid');

    if (order.tableNumber) {
      remarks += ` (T-${order.tableNumber})`;
    }

    const item: DailyBillSummaryItem = {
      id: order.id,
      billNo: `A1-${String(order.id).padStart(2, '0')}`,
      orderNumber: order.id,
      createdAt: order.createdAt,
      dateStr,
      dateHeaderStr,
      dateKey,
      tableNumber: order.tableNumber,
      status: order.status,
      cancellationReason: order.cancellationReason,
      paymentMode: order.paymentMode,
      baseAmount: base,
      sgstAmount: sgst,
      cgstAmount: cgst,
      totalAmount: total,
      discountAmount: discount,
      finalDiscountedAmount: Number(order.finalDiscountedAmount || 0),
      waiterName: order.user?.name,
      remarks,
    };

    allOrders.push(item);

    if (!dayMap.has(dateKey)) {
      dayMap.set(dateKey, {
        dateStr,
        dateHeaderStr,
        dateKey,
        totalOrders: 0,
        completedOrders: 0,
        cancelledOrders: 0,
        totalBaseAmount: 0,
        totalSgstAmount: 0,
        totalCgstAmount: 0,
        totalDiscountAmount: 0,
        totalAmount: 0,
        orders: [],
      });
    }

    const dayGroup = dayMap.get(dateKey)!;
    dayGroup.totalOrders += 1;
    if (isCancelled) {
      dayGroup.cancelledOrders += 1;
    } else {
      dayGroup.completedOrders += 1;
      dayGroup.totalBaseAmount = Number((dayGroup.totalBaseAmount + base).toFixed(2));
      dayGroup.totalSgstAmount = Number((dayGroup.totalSgstAmount + sgst).toFixed(2));
      dayGroup.totalCgstAmount = Number((dayGroup.totalCgstAmount + cgst).toFixed(2));
      dayGroup.totalDiscountAmount = Number((dayGroup.totalDiscountAmount + discount).toFixed(2));
      dayGroup.totalAmount = Number((dayGroup.totalAmount + total).toFixed(2));
    }
    dayGroup.orders.push(item);
  });

  const monthTitle = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
    ? `Bill Summary Of the Month Of ${start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
    : `Bill Summary (${start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${end.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })})`;

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    monthTitle,
    totalOrders: orders.length,
    completedOrders: overallCompleted,
    cancelledOrders: overallCancelled,
    totalBaseAmount: overallTotalBase,
    totalSgstAmount: overallTotalSgst,
    totalCgstAmount: overallTotalCgst,
    totalDiscountAmount: overallTotalDiscount,
    grandTotalAmount: overallGrandTotal,
    days: Array.from(dayMap.values()),
    allOrders,
  };
};



