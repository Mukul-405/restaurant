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


export interface HotelPaymentModeBreakdown {
  count: number;
  baseAmount: number;
  taxAmount: number;
  totalAmount: number;
  commission: number;
  roomDiscountAmount: number;
  tds: number;
  tcs: number;
  finalAmount: number;
}

export interface HotelRevenueAnalysis {
  totalBookings: number;
  totalAmount: number;
  taxAmount: number;
  baseAmount: number;
  commission: number;
  roomDiscountAmount: number;
  tds: number;
  tcs: number;
  finalAmount: number;
  paymentModes: {
    CASH: HotelPaymentModeBreakdown;
    CARD: HotelPaymentModeBreakdown;
    UPI: HotelPaymentModeBreakdown;
  };
}

export const getHotelRevenueAnalysisService = async (startDate: Date, endDate: Date): Promise<HotelRevenueAnalysis> => {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const bookings = await prisma.userRoomBooking.findMany({
    where: {
      status: 'CHECKED_OUT',
      checkOut: {
        gte: start,
        lte: end,
      },
    },
    select: {
      id: true,
      totalAmount: true,
      taxAmount: true,
      commission: true,
      roomDiscountAmount: true,
      paymentMode: true,
      webhookPayload: true,
    },
  });

  let totalBookings = 0;
  let totalAmount = 0;
  let taxAmount = 0;
  let commission = 0;
  let roomDiscountAmount = 0;
  let totalTds = 0;
  let totalTcs = 0;

  const paymentModes: Record<string, HotelPaymentModeBreakdown> = {
    CASH: { count: 0, baseAmount: 0, taxAmount: 0, totalAmount: 0, commission: 0, roomDiscountAmount: 0, tds: 0, tcs: 0, finalAmount: 0 },
    CARD: { count: 0, baseAmount: 0, taxAmount: 0, totalAmount: 0, commission: 0, roomDiscountAmount: 0, tds: 0, tcs: 0, finalAmount: 0 },
    UPI: { count: 0, baseAmount: 0, taxAmount: 0, totalAmount: 0, commission: 0, roomDiscountAmount: 0, tds: 0, tcs: 0, finalAmount: 0 },
  };

  bookings.forEach((b) => {
    totalBookings += 1;
    const bTotal = Number(b.totalAmount || 0);
    const bTax = Number(b.taxAmount || 0);
    const bComm = Number(b.commission || 0);
    const bDisc = Number(b.roomDiscountAmount || 0);

    let payload: any = b.webhookPayload;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        payload = null;
      }
    }
    const amountObj = payload?.amount || {};
    const bTcs = Number(amountObj.tcs || 0);
    const bTds = Number(amountObj.tds || 0);

    const bBase = Number((bTotal - bTax).toFixed(2));
    const bFinal = Number((bTotal - bComm - bDisc - bTcs - bTds).toFixed(2));

    totalAmount += bTotal;
    taxAmount += bTax;
    commission += bComm;
    roomDiscountAmount += bDisc;
    totalTcs += bTcs;
    totalTds += bTds;

    const mode = (b.paymentMode && paymentModes[b.paymentMode]) ? b.paymentMode : 'CASH';
    const pm = paymentModes[mode];
    pm.count += 1;
    pm.totalAmount = Number((pm.totalAmount + bTotal).toFixed(2));
    pm.taxAmount = Number((pm.taxAmount + bTax).toFixed(2));
    pm.baseAmount = Number((pm.baseAmount + bBase).toFixed(2));
    pm.commission = Number((pm.commission + bComm).toFixed(2));
    pm.roomDiscountAmount = Number((pm.roomDiscountAmount + bDisc).toFixed(2));
    pm.tcs = Number((pm.tcs + bTcs).toFixed(2));
    pm.tds = Number((pm.tds + bTds).toFixed(2));
    pm.finalAmount = Number((pm.finalAmount + bFinal).toFixed(2));
  });

  const baseAmount = Number((totalAmount - taxAmount).toFixed(2));
  const finalAmount = Number((totalAmount - commission - roomDiscountAmount - totalTcs - totalTds).toFixed(2));

  return {
    totalBookings,
    totalAmount: Number(totalAmount.toFixed(2)),
    taxAmount: Number(taxAmount.toFixed(2)),
    baseAmount,
    commission: Number(commission.toFixed(2)),
    roomDiscountAmount: Number(roomDiscountAmount.toFixed(2)),
    tds: Number(totalTds.toFixed(2)),
    tcs: Number(totalTcs.toFixed(2)),
    finalAmount,
    paymentModes: paymentModes as HotelRevenueAnalysis['paymentModes'],
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
  discountAmount: number;
  taxableAmount: number;
  sgstAmount: number;
  cgstAmount: number;
  totalAmount: number;
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
  totalDiscountAmount: number;
  totalTaxableAmount: number;
  totalSgstAmount: number;
  totalCgstAmount: number;
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
  totalDiscountAmount: number;
  totalTaxableAmount: number;
  totalSgstAmount: number;
  totalCgstAmount: number;
  grandTotalAmount: number;
  days: DayGroupSummary[];
  allOrders?: DailyBillSummaryItem[];
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
  let overallTotalDiscount = 0;
  let overallTotalTaxable = 0;
  let overallTotalSgst = 0;
  let overallTotalCgst = 0;
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

    const taxableAmount = isCancelled ? 0 : Number(Math.max(0, base - discount).toFixed(2));

    const sgst = isCancelled ? 0 : Number((taxableAmount * 0.025).toFixed(2));
    const cgst = isCancelled ? 0 : Number((taxableAmount * 0.025).toFixed(2));
    const total = isCancelled ? 0 : Number(Math.max(0, taxableAmount + sgst + cgst).toFixed(2));

    if (isCancelled) {
      overallCancelled += 1;
    } else {
      overallCompleted += 1;
      overallTotalBase = Number((overallTotalBase + base).toFixed(2));
      overallTotalDiscount = Number((overallTotalDiscount + discount).toFixed(2));
      overallTotalTaxable = Number((overallTotalTaxable + taxableAmount).toFixed(2));
      overallTotalSgst = Number((overallTotalSgst + sgst).toFixed(2));
      overallTotalCgst = Number((overallTotalCgst + cgst).toFixed(2));
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
      discountAmount: discount,
      taxableAmount,
      sgstAmount: sgst,
      cgstAmount: cgst,
      totalAmount: total,
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
        totalDiscountAmount: 0,
        totalTaxableAmount: 0,
        totalSgstAmount: 0,
        totalCgstAmount: 0,
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
      dayGroup.totalDiscountAmount = Number((dayGroup.totalDiscountAmount + discount).toFixed(2));
      dayGroup.totalTaxableAmount = Number((dayGroup.totalTaxableAmount + taxableAmount).toFixed(2));
      dayGroup.totalSgstAmount = Number((dayGroup.totalSgstAmount + sgst).toFixed(2));
      dayGroup.totalCgstAmount = Number((dayGroup.totalCgstAmount + cgst).toFixed(2));
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
    totalDiscountAmount: overallTotalDiscount,
    totalTaxableAmount: overallTotalTaxable,
    totalSgstAmount: overallTotalSgst,
    totalCgstAmount: overallTotalCgst,
    grandTotalAmount: overallGrandTotal,
    days: Array.from(dayMap.values()),
    allOrders,
  };
};




export interface HotelDailyBillItem {
  id: number;
  bookingId: string;
  guestName: string;
  guestPhone: string;
  channel: string;
  source: string;
  checkIn: string;
  checkOut: string;
  dateStr: string;
  dateHeaderStr: string;
  dateKey: string;
  status: string;
  paymentMode: string | null;
  paymentStatus: string;
  totalAmount: number;
  taxAmount: number;
  baseAmount: number;
  roomDiscountAmount: number;
  commission: number;
  tcs: number;
  tds: number;
  finalAmount: number;
  roomsCount: number;
}

export interface HotelDayGroupSummary {
  dateStr: string;
  dateHeaderStr: string;
  dateKey: string;
  totalBookings: number;
  checkedOutBookings: number;
  cancelledBookings: number;
  totalBaseAmount: number;
  totalTaxAmount: number;
  totalAmount: number;
  totalDiscountAmount: number;
  totalCommission: number;
  totalTcs: number;
  totalTds: number;
  totalFinalAmount: number;
  bookings: HotelDailyBillItem[];
}

export interface HotelDailyBillSummaryResult {
  startDate: string;
  endDate: string;
  monthTitle: string;
  totalBookings: number;
  checkedOutBookings: number;
  cancelledBookings: number;
  totalBaseAmount: number;
  totalTaxAmount: number;
  totalAmount: number;
  totalDiscountAmount: number;
  totalCommission: number;
  totalTcs: number;
  totalTds: number;
  grandTotalFinalAmount: number;
  days: HotelDayGroupSummary[];
  channels: string[];
}

export const getHotelDailyBillSummaryService = async (startDate: Date, endDate: Date): Promise<HotelDailyBillSummaryResult> => {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const bookings = await prisma.userRoomBooking.findMany({
    where: {
      status: 'CHECKED_OUT',
      checkOut: {
        gte: start,
        lte: end,
      },
    },
    orderBy: {
      checkOut: 'asc',
    },
  });

  const dayMap = new Map<string, HotelDayGroupSummary>();
  const channelSet = new Set<string>();

  let overallTotalBase = 0;
  let overallTotalTax = 0;
  let overallTotalAmount = 0;
  let overallTotalDiscount = 0;
  let overallTotalCommission = 0;
  let overallTotalTcs = 0;
  let overallTotalTds = 0;
  let overallGrandFinal = 0;
  let overallCheckedOut = 0;
  let overallCancelled = 0;

  bookings.forEach((b) => {
    const outDate = new Date(b.checkOut);
    const year = outDate.getFullYear();
    const month = String(outDate.getMonth() + 1).padStart(2, '0');
    const day = String(outDate.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;

    const dateStr = outDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const dateHeaderStr = outDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

    let payload: any = b.webhookPayload;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        payload = null;
      }
    }

    const amountObj = payload?.amount || {};
    const channelName = (b.channel || payload?.channel || (b.source === 'DIRECT' ? 'Direct' : 'OTA')).trim();
    if (channelName) channelSet.add(channelName);

    const isCancelled = b.status === 'CANCELLED';
    const bTotal = Number(b.totalAmount || 0);
    const bTax = Number(b.taxAmount || 0);
    const bBase = Number((bTotal - bTax).toFixed(2));
    const bDisc = Number(b.roomDiscountAmount || 0);
    const bComm = Number(b.commission || 0);
    const bTcs = Number(amountObj.tcs || 0);
    const bTds = Number(amountObj.tds || 0);
    const bFinal = isCancelled ? 0 : Number((bTotal - bComm - bDisc - bTcs - bTds).toFixed(2));

    let roomsCount = 1;
    if (Array.isArray(b.rooms)) {
      roomsCount = b.rooms.length;
    }

    const item: HotelDailyBillItem = {
      id: b.id,
      bookingId: b.bookingId,
      guestName: b.guestName || 'Guest',
      guestPhone: b.guestPhone || '',
      channel: channelName,
      source: b.source,
      checkIn: b.checkIn.toISOString(),
      checkOut: b.checkOut.toISOString(),
      dateStr,
      dateHeaderStr,
      dateKey,
      status: b.status,
      paymentMode: b.paymentMode,
      paymentStatus: b.paymentStatus,
      totalAmount: bTotal,
      taxAmount: bTax,
      baseAmount: bBase,
      roomDiscountAmount: bDisc,
      commission: bComm,
      tcs: bTcs,
      tds: bTds,
      finalAmount: bFinal,
      roomsCount,
    };

    if (isCancelled) {
      overallCancelled += 1;
    } else {
      overallCheckedOut += 1;
      overallTotalBase = Number((overallTotalBase + bBase).toFixed(2));
      overallTotalTax = Number((overallTotalTax + bTax).toFixed(2));
      overallTotalAmount = Number((overallTotalAmount + bTotal).toFixed(2));
      overallTotalDiscount = Number((overallTotalDiscount + bDisc).toFixed(2));
      overallTotalCommission = Number((overallTotalCommission + bComm).toFixed(2));
      overallTotalTcs = Number((overallTotalTcs + bTcs).toFixed(2));
      overallTotalTds = Number((overallTotalTds + bTds).toFixed(2));
      overallGrandFinal = Number((overallGrandFinal + bFinal).toFixed(2));
    }

    if (!dayMap.has(dateKey)) {
      dayMap.set(dateKey, {
        dateStr,
        dateHeaderStr,
        dateKey,
        totalBookings: 0,
        checkedOutBookings: 0,
        cancelledBookings: 0,
        totalBaseAmount: 0,
        totalTaxAmount: 0,
        totalAmount: 0,
        totalDiscountAmount: 0,
        totalCommission: 0,
        totalTcs: 0,
        totalTds: 0,
        totalFinalAmount: 0,
        bookings: [],
      });
    }

    const dayGroup = dayMap.get(dateKey)!;
    dayGroup.totalBookings += 1;
    if (isCancelled) {
      dayGroup.cancelledBookings += 1;
    } else {
      dayGroup.checkedOutBookings += 1;
      dayGroup.totalBaseAmount = Number((dayGroup.totalBaseAmount + bBase).toFixed(2));
      dayGroup.totalTaxAmount = Number((dayGroup.totalTaxAmount + bTax).toFixed(2));
      dayGroup.totalAmount = Number((dayGroup.totalAmount + bTotal).toFixed(2));
      dayGroup.totalDiscountAmount = Number((dayGroup.totalDiscountAmount + bDisc).toFixed(2));
      dayGroup.totalCommission = Number((dayGroup.totalCommission + bComm).toFixed(2));
      dayGroup.totalTcs = Number((dayGroup.totalTcs + bTcs).toFixed(2));
      dayGroup.totalTds = Number((dayGroup.totalTds + bTds).toFixed(2));
      dayGroup.totalFinalAmount = Number((dayGroup.totalFinalAmount + bFinal).toFixed(2));
    }
    dayGroup.bookings.push(item);
  });

  const monthTitle = start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    monthTitle,
    totalBookings: bookings.length,
    checkedOutBookings: overallCheckedOut,
    cancelledBookings: overallCancelled,
    totalBaseAmount: overallTotalBase,
    totalTaxAmount: overallTotalTax,
    totalAmount: overallTotalAmount,
    totalDiscountAmount: overallTotalDiscount,
    totalCommission: overallTotalCommission,
    totalTcs: overallTotalTcs,
    totalTds: overallTotalTds,
    grandTotalFinalAmount: overallGrandFinal,
    days: Array.from(dayMap.values()),
    channels: Array.from(channelSet),
  };
};
